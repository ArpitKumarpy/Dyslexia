import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { Volume2 } from 'lucide-react';
import { ReaderSettings } from '../../types';
import { tokenizeText } from '../../utils/tokenizeText';
import { analyzeWordSupport, normalizeWord } from '../../utils/pronunciation';
import { analyzeWordDifficulty } from '../../utils/wordDifficulty';
import { analyzeSentence, splitIntoSentences } from '../../utils/sentences';

interface TextEditorProps {
  content: string;
  onContentChange: (content: string) => void;
  settings: ReaderSettings;
  showReadingGuide: boolean;
  focusMode: boolean;
  wordHighlight: boolean;
  showDifficultWords: boolean;
  showSentenceSimplification: boolean;
  activeSentenceIndex: number | null;
  hoverPronunciationRate: number;
  onHoverPronunciationRateChange: (rate: number) => void;
}

type HoverCard = {
  word: string;
  breakdown: string[];
  phoneticHint: string;
  morphology: {
    prefix?: string;
    root: string;
    suffix?: string;
  };
  top: number;
  left: number;
};

export function TextEditor({
  content,
  onContentChange,
  settings,
  showReadingGuide,
  focusMode,
  wordHighlight,
  showDifficultWords,
  showSentenceSimplification,
  activeSentenceIndex,
  hoverPronunciationRate,
  onHoverPronunciationRateChange,
}: TextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const isUserTyping = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null);
  const [clauseFocusBySentence, setClauseFocusBySentence] = useState<Record<number, number>>({});

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (showReadingGuide && guideRef.current && editorRef.current) {
        const rect = editorRef.current.getBoundingClientRect();
        const y = event.clientY - rect.top;
        guideRef.current.style.top = `${y - 20}px`;
      }
    };

    const editor = editorRef.current;
    if (editor && showReadingGuide) {
      editor.addEventListener('mousemove', handleMouseMove);
      return () => editor.removeEventListener('mousemove', handleMouseMove);
    }
  }, [showReadingGuide]);

  const editorStyle: CSSProperties = {
    fontFamily: settings.fontFamily,
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineSpacing,
    letterSpacing: `${settings.letterSpacing}px`,
    fontWeight: settings.fontWeight,
    color: settings.textColor,
    backgroundColor: settings.backgroundColor,
  };

  useEffect(() => {
    if (!editorRef.current || isUserTyping.current) {
      return;
    }

    const sentences = splitIntoSentences(content);

    editorRef.current.innerHTML = sentences
      .map((sentence) =>
        buildSentenceMarkup(
          sentence.text,
          sentence.index,
          activeSentenceIndex,
          showDifficultWords,
          showSentenceSimplification,
          clauseFocusBySentence[sentence.index] ?? 0
        )
      )
      .join('');
  }, [content, showDifficultWords, showSentenceSimplification, activeSentenceIndex, clauseFocusBySentence]);

  useEffect(() => {
    if (!editorRef.current || activeSentenceIndex === null) {
      return;
    }

    const activeSentence = editorRef.current.querySelector(
      `[data-sentence-index="${activeSentenceIndex}"]`
    ) as HTMLSpanElement | null;

    activeSentence?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeSentenceIndex]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const handleInput = () => {
    if (!editorRef.current) {
      return;
    }

    isUserTyping.current = true;
    onContentChange(editorRef.current.innerText);
    requestAnimationFrame(() => {
      isUserTyping.current = false;
    });
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHideCard = () => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setHoverCard(null);
    }, 140);
  };

  const handleEditorMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) {
      scheduleHideCard();
      return;
    }

    const hoveredWord = getWordAtPoint(event.clientX, event.clientY);
    if (!hoveredWord) {
      scheduleHideCard();
      return;
    }

    clearHideTimer();
    const containerRect = containerRef.current.getBoundingClientRect();
    const cardWidth = 288;
    const wordSupport = analyzeWordSupport(hoveredWord.word);
    const left = Math.min(
      Math.max(hoveredWord.rect.left - containerRect.left, 16),
      Math.max(16, containerRect.width - cardWidth - 16)
    );

    setHoverCard({
      word: hoveredWord.word,
      breakdown: wordSupport.chunks,
      phoneticHint: wordSupport.phoneticHint,
      morphology: wordSupport.morphology,
      top: hoveredWord.rect.bottom - containerRect.top + 12,
      left,
    });
  };

  const handleEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!showSentenceSimplification) {
      return;
    }

    const target = event.target as HTMLElement;
    const sentenceElement = target.closest('[data-sentence-index]') as HTMLElement | null;
    if (!sentenceElement) {
      return;
    }

    const sentenceIndex = Number(sentenceElement.dataset.sentenceIndex);
    const clauseCount = Number(sentenceElement.dataset.clauseCount ?? '0');
    const isComplex = sentenceElement.dataset.isComplex === 'true';

    if (!Number.isFinite(sentenceIndex) || !isComplex || clauseCount <= 1) {
      return;
    }

    setClauseFocusBySentence((current) => ({
      ...current,
      [sentenceIndex]: ((current[sentenceIndex] ?? 0) + 1) % clauseCount,
    }));
  };

  const pronounceHoveredWord = () => {
    if (!hoverCard) {
      return;
    }

    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser.');
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(hoverCard.word);
    utterance.rate = hoverPronunciationRate;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 h-full overflow-hidden"
      onMouseLeave={scheduleHideCard}
    >
      {showReadingGuide && (
        <div
          ref={guideRef}
          className="absolute left-0 right-0 h-10 pointer-events-none z-10"
          style={{
            backgroundColor: 'rgba(100, 149, 237, 0.2)',
            borderTop: '2px solid rgba(100, 149, 237, 0.6)',
            borderBottom: '2px solid rgba(100, 149, 237, 0.6)',
          }}
        />
      )}

      {focusMode && (
        <>
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none z-10"
            style={{
              height: '40%',
              background: `linear-gradient(to bottom, ${settings.backgroundColor} 0%, transparent 100%)`,
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
            style={{
              height: '40%',
              background: `linear-gradient(to top, ${settings.backgroundColor} 0%, transparent 100%)`,
            }}
          />
        </>
      )}

      {hoverCard && (
        <div
          className="absolute z-20 w-72 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur"
          style={{ top: hoverCard.top, left: hoverCard.left }}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleHideCard}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Hovered Word
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{hoverCard.word}</h3>
            </div>
            <button
              type="button"
              onClick={pronounceHoveredWord}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600"
              title={`Pronounce "${hoverCard.word}"`}
            >
              <Volume2 size={18} />
            </button>
          </div>

          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Syllable-Like Chunks
            </p>
            <p className="mt-1 text-base font-semibold text-amber-950">
              {hoverCard.breakdown.join(' - ')}
            </p>
          </div>

          {hoverCard.phoneticHint && (
            <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-800">
                Sounds Like
              </p>
              <p className="mt-1 text-base font-semibold text-sky-950">
                {hoverCard.phoneticHint}
              </p>
            </div>
          )}

          {renderMorphologySummary(hoverCard.morphology)}

          <div className="mt-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Pronunciation Speed: {hoverPronunciationRate.toFixed(2)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={hoverPronunciationRate}
              onChange={(event) => onHoverPronunciationRateChange(parseFloat(event.target.value))}
              className="mt-2 w-full"
            />
          </div>

          {renderDifficultySummary(hoverCard.word)}
        </div>
      )}

      <div
        className="h-full overflow-y-auto"
        style={{ backgroundColor: settings.backgroundColor }}
        onScroll={scheduleHideCard}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onInput={handleInput}
          onClick={handleEditorClick}
          onMouseMove={handleEditorMouseMove}
          className={`min-h-full p-8 focus:outline-none whitespace-pre-wrap break-words ${
            wordHighlight ? 'word-highlight' : ''
          }`}
          style={{ ...editorStyle, backgroundColor: 'transparent' }}
        />
      </div>
    </div>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildTokenMarkup(text: string, isWord: boolean, showDifficultWords: boolean): string {
  if (!isWord) {
    return escapeHtml(text);
  }

  const difficulty = analyzeWordDifficulty(text);
  const difficultyClass = showDifficultWords && difficulty.isDifficult
    ? difficulty.level === 'high'
      ? ' difficult-word difficult-word--high'
      : ' difficult-word difficult-word--moderate'
    : '';

  return `<span data-word="true" class="inline-block cursor-help rounded px-0.5 transition-colors hover:bg-amber-200/70${difficultyClass}">${escapeHtml(text)}</span>`;
}

function buildSentenceMarkup(
  text: string,
  sentenceIndex: number,
  activeSentenceIndex: number | null,
  showDifficultWords: boolean,
  showSentenceSimplification: boolean,
  activeClauseIndex: number
): string {
  const sentenceAnalysis = analyzeSentence(text);
  const sentenceClass = activeSentenceIndex === sentenceIndex
    ? ' sentence-active'
    : '';
  const isSimplified = showSentenceSimplification && sentenceAnalysis.isComplex;

  const content = isSimplified
    ? sentenceAnalysis.clauses
        .map((clause, clauseIndex) => {
          const clauseTokens = tokenizeText(clause);
          const clauseContent = clauseTokens
            .map((token) => buildTokenMarkup(token.text, token.isWord, showDifficultWords))
            .join('');
          const clauseClass = clauseIndex === activeClauseIndex
            ? ' sentence-clause sentence-clause--active'
            : ' sentence-clause sentence-clause--muted';

          return `<span data-clause-index="${clauseIndex}" class="${clauseClass}">${clauseContent}</span>`;
        })
        .join('<span class="sentence-clause-break"> / </span>')
    : tokenizeText(text)
        .map((token) => buildTokenMarkup(token.text, token.isWord, showDifficultWords))
        .join('');

  const hint = isSimplified
    ? '<span class="sentence-simplification-hint">click sentence to step through clauses</span>'
    : '';

  return `<span data-sentence-index="${sentenceIndex}" data-clause-count="${sentenceAnalysis.clauses.length}" data-is-complex="${sentenceAnalysis.isComplex}" class="sentence-segment${sentenceClass}${isSimplified ? ' sentence-segment--simplified' : ''}">${content}${hint}</span>`;
}

function renderDifficultySummary(word: string) {
  const difficulty = analyzeWordDifficulty(word);
  if (!difficulty.isDifficult) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-rose-700">
        Why This May Feel Harder
      </p>
      <p className="mt-1 text-sm text-rose-900">
        {difficulty.reasons.join(', ')}
      </p>
    </div>
  );
}

function renderMorphologySummary(morphology: HoverCard['morphology']) {
  if (!morphology.prefix && !morphology.suffix) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
        Word Parts
      </p>
      <p className="mt-1 text-sm text-emerald-950">
        {morphology.prefix ? `prefix: ${morphology.prefix} • ` : ''}
        root: {morphology.root}
        {morphology.suffix ? ` • suffix: ${morphology.suffix}` : ''}
      </p>
    </div>
  );
}

function getWordAtPoint(x: number, y: number): { word: string; rect: DOMRect } | null {
  const range = getRangeAtPoint(x, y);
  if (!range) {
    return null;
  }

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const text = node.textContent ?? '';
  if (!text.trim()) {
    return null;
  }

  const safeOffset = Math.min(range.startOffset, Math.max(text.length - 1, 0));
  const index = findWordIndex(text, safeOffset);
  if (index === -1) {
    return null;
  }

  let start = index;
  let end = index;

  while (start > 0 && isWordCharacter(text[start - 1])) {
    start -= 1;
  }

  while (end < text.length && isWordCharacter(text[end])) {
    end += 1;
  }

  const word = normalizeWord(text.slice(start, end));
  if (!word) {
    return null;
  }

  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);

  return {
    word,
    rect: wordRange.getBoundingClientRect(),
  };
}

function getRangeAtPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };

  if (typeof doc.caretRangeFromPoint === 'function') {
    return doc.caretRangeFromPoint(x, y);
  }

  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y);
    if (!position) {
      return null;
    }

    const range = doc.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }

  return null;
}

function findWordIndex(text: string, offset: number): number {
  if (!text) {
    return -1;
  }

  if (offset < text.length && isWordCharacter(text[offset])) {
    return offset;
  }

  if (offset > 0 && isWordCharacter(text[offset - 1])) {
    return offset - 1;
  }

  return -1;
}

function isWordCharacter(character: string): boolean {
  return /[a-zA-Z']/u.test(character);
}
