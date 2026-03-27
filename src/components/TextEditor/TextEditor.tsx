import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import { Volume2 } from 'lucide-react';
import type { FaceLandmarker, FaceLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { ReaderSettings } from '../../types';
import { tokenizeText } from '../../utils/tokenizeText';
import { analyzeWordSupport, normalizeWord } from '../../utils/pronunciation';
import { analyzeWordDifficulty } from '../../utils/wordDifficulty';
import { analyzeSentence, splitIntoSentences } from '../../utils/sentences';
import { getSimpleDefinition } from '../../utils/simpleDefinitions';

interface TextEditorProps {
  content: string;
  onContentChange: (content: string) => void;
  settings: ReaderSettings;
  showReadingGuide: boolean;
  focusMode: boolean;
  wordHighlight: boolean;
  showDifficultWords: boolean;
  showSentenceSimplification: boolean;
  headTrackingEnabled: boolean;
  readingMode: boolean;
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

type HeadTrackingStatus = 'idle' | 'starting' | 'active' | 'error';

type WordTarget = {
  element: HTMLElement;
  word: string;
  rect: DOMRect;
};

const HEAD_TRACKING_SAMPLE_MS = 220;
const HEAD_TRACKING_STABILITY_THRESHOLD = 2;
const MEDIAPIPE_VERSION = '0.10.34';
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function TextEditor({
  content,
  onContentChange,
  settings,
  showReadingGuide,
  focusMode,
  wordHighlight,
  showDifficultWords,
  showSentenceSimplification,
  headTrackingEnabled,
  readingMode,
  activeSentenceIndex,
  hoverPronunciationRate,
  onHoverPronunciationRateChange,
}: TextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverCardRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const webcamRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const activeHeadSentenceElementRef = useRef<HTMLElement | null>(null);
  const activeHeadSentenceIndexRef = useRef<number | null>(null);
  const pendingHeadSentenceIndexRef = useRef<number | null>(null);
  const pendingHeadSentenceHitsRef = useRef(0);
  const trackingFrameRef = useRef<number | null>(null);
  const lastTrackingSampleRef = useRef(0);
  const isTrackingFramePendingRef = useRef(false);
  const isUserTyping = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null);
  const [isHoverCardPinned, setIsHoverCardPinned] = useState(false);
  const [clauseFocusBySentence, setClauseFocusBySentence] = useState<Record<number, number>>({});
  const [headTrackingStatus, setHeadTrackingStatus] = useState<HeadTrackingStatus>('idle');
  const [headTrackingError, setHeadTrackingError] = useState<string | null>(null);

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

    syncHeadTrackedSentenceHighlight();
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
    if (!isHoverCardPinned) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (hoverCardRef.current?.contains(target)) {
        return;
      }

      const clickedElement = target instanceof HTMLElement ? target : target.parentElement;
      if (clickedElement?.closest('[data-word="true"]')) {
        return;
      }

      setIsHoverCardPinned(false);
      setHoverCard(null);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isHoverCardPinned]);

  useEffect(() => {
    return () => {
      stopHeadTracking();
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!headTrackingEnabled) {
      stopHeadTracking();
      setHeadTrackingStatus('idle');
      setHeadTrackingError(null);
      return;
    }

    let cancelled = false;

    const startHeadTracking = async () => {
      const webcam = webcamRef.current;
      if (!webcam) {
        setHeadTrackingStatus('error');
        setHeadTrackingError('The camera preview could not be prepared.');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setHeadTrackingStatus('error');
        setHeadTrackingError('This browser does not support webcam access.');
        return;
      }

      setHeadTrackingStatus('starting');
      setHeadTrackingError(null);

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = mediaStream;
        webcam.srcObject = mediaStream;
        await webcam.play();

        if (cancelled) {
          stopHeadTracking();
          return;
        }

        const vision = await import('@mediapipe/tasks-vision');
        if (cancelled) {
          stopHeadTracking();
          return;
        }

        const filesetResolver = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        if (cancelled) {
          stopHeadTracking();
          return;
        }

        faceLandmarkerRef.current = await createFaceLandmarkerWithFallback(vision, filesetResolver);

        setHeadTrackingStatus('active');
        trackingFrameRef.current = window.requestAnimationFrame(runHeadTrackingLoop);
      } catch (error) {
        setHeadTrackingStatus('error');
        setHeadTrackingError(getHeadTrackingErrorMessage(error));
      }
    };

    startHeadTracking();

    return () => {
      cancelled = true;
      stopHeadTracking();
    };
  }, [headTrackingEnabled]);

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
    if (isHoverCardPinned) {
      return;
    }

    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setHoverCard(null);
    }, 140);
  };

  const stopHeadTracking = () => {
    if (trackingFrameRef.current !== null) {
      window.cancelAnimationFrame(trackingFrameRef.current);
      trackingFrameRef.current = null;
    }

    lastTrackingSampleRef.current = 0;
    isTrackingFramePendingRef.current = false;
    pendingHeadSentenceIndexRef.current = null;
    pendingHeadSentenceHitsRef.current = 0;
    faceLandmarkerRef.current?.close();
    faceLandmarkerRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (webcamRef.current) {
      webcamRef.current.pause();
      webcamRef.current.srcObject = null;
    }

    setHeadTrackedSentenceIndex(null);
  };

  const setHeadTrackedSentenceIndex = (sentenceIndex: number | null) => {
    if (activeHeadSentenceIndexRef.current === sentenceIndex) {
      return;
    }

    activeHeadSentenceElementRef.current?.classList.remove('sentence-head-active');
    activeHeadSentenceElementRef.current = null;
    activeHeadSentenceIndexRef.current = sentenceIndex;

    if (sentenceIndex === null || !editorRef.current) {
      return;
    }

    const sentenceElement = editorRef.current.querySelector(
      `[data-sentence-index="${sentenceIndex}"]`
    ) as HTMLElement | null;

    sentenceElement?.classList.add('sentence-head-active');
    activeHeadSentenceElementRef.current = sentenceElement;
  };

  const syncHeadTrackedSentenceHighlight = () => {
    if (
      activeHeadSentenceIndexRef.current !== null &&
      editorRef.current &&
      !editorRef.current.contains(activeHeadSentenceElementRef.current)
    ) {
      setHeadTrackedSentenceIndex(activeHeadSentenceIndexRef.current);
    }
  };

  const runHeadTrackingLoop = () => {
    trackingFrameRef.current = window.requestAnimationFrame(runHeadTrackingLoop);

    const webcam = webcamRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (
      !webcam ||
      !landmarker ||
      webcam.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      isTrackingFramePendingRef.current
    ) {
      return;
    }

    const now = performance.now();
    if (now - lastTrackingSampleRef.current < HEAD_TRACKING_SAMPLE_MS) {
      return;
    }

    lastTrackingSampleRef.current = now;
    isTrackingFramePendingRef.current = true;

    try {
      const result = landmarker.detectForVideo(webcam, now);
      const sentenceIndex = findHeadTrackedSentenceIndex(result);
      if (sentenceIndex === null) {
        pendingHeadSentenceIndexRef.current = null;
        pendingHeadSentenceHitsRef.current = 0;
        return;
      }

      if (pendingHeadSentenceIndexRef.current !== sentenceIndex) {
        pendingHeadSentenceIndexRef.current = sentenceIndex;
        pendingHeadSentenceHitsRef.current = 1;
        return;
      }

      pendingHeadSentenceHitsRef.current += 1;
      if (
        pendingHeadSentenceHitsRef.current >= HEAD_TRACKING_STABILITY_THRESHOLD &&
        activeHeadSentenceIndexRef.current !== sentenceIndex
      ) {
        setHeadTrackedSentenceIndex(sentenceIndex);
      }
    } catch (error) {
      setHeadTrackingStatus('error');
      setHeadTrackingError('Head tracking stopped because face landmark detection failed.');
      stopHeadTracking();
    } finally {
      isTrackingFramePendingRef.current = false;
    }
  };

  const findHeadTrackedSentenceIndex = (result: FaceLandmarkerResult | null): number | null => {
    if (!result || !editorRef.current || !editorScrollRef.current) {
      return null;
    }

    const trackedFaceY = getTrackedFaceCenterY(result.faceLandmarks[0]);
    if (trackedFaceY === null) {
      return null;
    }

    const visibleSentences = Array.from(
      editorRef.current.querySelectorAll('[data-sentence-index]')
    ).filter((element): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      const sentenceRect = element.getBoundingClientRect();
      const scrollRect = editorScrollRef.current?.getBoundingClientRect();
      if (!scrollRect) {
        return false;
      }

      return sentenceRect.bottom >= scrollRect.top && sentenceRect.top <= scrollRect.bottom;
    });

    if (visibleSentences.length === 0) {
      return null;
    }

    const scrollRect = editorScrollRef.current.getBoundingClientRect();
    const targetY = scrollRect.top + trackedFaceY * scrollRect.height;

    let nearestSentence: HTMLElement | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const sentenceElement of visibleSentences) {
      const sentenceRect = sentenceElement.getBoundingClientRect();
      const sentenceCenterY = sentenceRect.top + sentenceRect.height / 2;
      const distance = Math.abs(sentenceCenterY - targetY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestSentence = sentenceElement;
      }
    }

    if (!nearestSentence) {
      return null;
    }

    const sentenceIndex = Number(nearestSentence.dataset.sentenceIndex);
    return Number.isFinite(sentenceIndex) ? sentenceIndex : null;
  };

  const showHoverCardForWordTarget = (wordTarget: WordTarget) => {
    if (!containerRef.current) {
      return;
    }

    clearHideTimer();
    const containerRect = containerRef.current.getBoundingClientRect();
    const cardWidth = 288;
    const wordSupport = analyzeWordSupport(wordTarget.word);
    const left = Math.min(
      Math.max(wordTarget.rect.left - containerRect.left, 16),
      Math.max(16, containerRect.width - cardWidth - 16)
    );

    setHoverCard({
      word: wordTarget.word,
      breakdown: wordSupport.chunks,
      phoneticHint: wordSupport.phoneticHint,
      morphology: wordSupport.morphology,
      top: wordTarget.rect.bottom - containerRect.top + 12,
      left,
    });
  };

  const handleEditorMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isHoverCardPinned) {
      return;
    }

    const hoveredWord = getWordTargetAtPoint(event.clientX, event.clientY, editorRef.current);
    if (!hoveredWord) {
      scheduleHideCard();
      return;
    }

    showHoverCardForWordTarget(hoveredWord);
  };

  const handleEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const clickedWord = getWordTargetAtPoint(event.clientX, event.clientY, editorRef.current);
    if (clickedWord) {
      clearHideTimer();
      setIsHoverCardPinned(true);
      showHoverCardForWordTarget(clickedWord);
      return;
    }

    setIsHoverCardPinned(false);

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

  const showHeadTrackingStatus = headTrackingEnabled || headTrackingStatus === 'error';

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 h-full overflow-hidden ${readingMode ? 'bg-stone-100' : 'bg-stone-100/70'}`}
      onMouseLeave={scheduleHideCard}
    >
      <video
        ref={webcamRef}
        className="hidden"
        autoPlay
        muted
        playsInline
      />

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

      {showHeadTrackingStatus && (
        <div className={`absolute z-30 max-w-sm rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-lg ${
          readingMode ? 'right-4 top-24' : 'right-4 top-4'
        }`}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Head Tracking
          </p>
          <p className="mt-1 font-medium text-slate-900">
            {headTrackingStatus === 'starting' && 'Starting webcam and preparing line tracking...'}
            {headTrackingStatus === 'active' && 'Active. Move your head gently to shift the highlighted reading line.'}
            {headTrackingStatus === 'error' && (headTrackingError ?? 'Head tracking is unavailable right now.')}
            {headTrackingStatus === 'idle' && 'Off'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Webcam frames stay in the browser for this session and are cleared when you turn the feature off.
          </p>
        </div>
      )}

      {hoverCard && (
        <div
          ref={hoverCardRef}
          className="absolute z-20 w-80 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl"
          style={{ top: hoverCard.top, left: hoverCard.left }}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleHideCard}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Word Help
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{hoverCard.word}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Click another word to switch help, or click outside to close this panel.
              </p>
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
              Say It In Parts
            </p>
            <p className="mt-1 text-base font-semibold text-amber-950">
              {hoverCard.breakdown.join(' - ')}
            </p>
          </div>

          {hoverCard.phoneticHint && (
            <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-800">
                Simple Pronunciation
              </p>
              <p className="mt-1 text-base font-semibold text-sky-950">
                {hoverCard.phoneticHint}
              </p>
            </div>
          )}

          {renderSimpleDefinition(hoverCard.word)}

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
        ref={editorScrollRef}
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
          className={`mx-auto min-h-full max-w-4xl focus:outline-none whitespace-pre-wrap break-words ${
            wordHighlight ? 'word-highlight' : ''
          }`}
          style={{
            ...editorStyle,
            backgroundColor: 'transparent',
            padding: readingMode ? '7rem 3.5rem 5rem' : '3rem 3rem 4rem',
          }}
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
        Why This May Feel Tricky
      </p>
      <p className="mt-1 text-sm text-rose-900">
        {difficulty.reasons.join(', ')}
      </p>
    </div>
  );
}

function renderSimpleDefinition(word: string) {
  const definition = getSimpleDefinition(word);
  if (!definition) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg bg-stone-100 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-600">
        Easy Meaning
      </p>
      <p className="mt-1 text-sm text-stone-900">
        {definition.meaning}
      </p>
      {definition.example && (
        <p className="mt-2 text-sm text-stone-600">
          {definition.example}
        </p>
      )}
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
        {morphology.prefix ? `prefix: ${morphology.prefix} | ` : ''}
        root: {morphology.root}
        {morphology.suffix ? ` | suffix: ${morphology.suffix}` : ''}
      </p>
    </div>
  );
}

function getWordTargetAtPoint(x: number, y: number, editor: HTMLDivElement | null): WordTarget | null {
  if (!editor) {
    return null;
  }

  const hoveredElement = document.elementFromPoint(x, y);
  if (!(hoveredElement instanceof HTMLElement)) {
    return null;
  }

  const wordElement = hoveredElement.closest('[data-word="true"]');
  if (!(wordElement instanceof HTMLElement) || !editor.contains(wordElement)) {
    return null;
  }

  const word = normalizeWord(wordElement.innerText);
  if (!word) {
    return null;
  }

  return {
    element: wordElement,
    word,
    rect: wordElement.getBoundingClientRect(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function createFaceLandmarkerWithFallback(
  vision: typeof import('@mediapipe/tasks-vision'),
  filesetResolver: Awaited<ReturnType<typeof import('@mediapipe/tasks-vision').FilesetResolver.forVisionTasks>>
): Promise<FaceLandmarker> {
  try {
    return await vision.FaceLandmarker.createFromOptions(
      filesetResolver,
      buildFaceLandmarkerOptions('GPU')
    );
  } catch (gpuError) {
    try {
      return await vision.FaceLandmarker.createFromOptions(
        filesetResolver,
        buildFaceLandmarkerOptions('CPU')
      );
    } catch (cpuError) {
      throw new Error(
        `MediaPipe startup failed. GPU: ${formatTrackingError(gpuError)} | CPU: ${formatTrackingError(cpuError)}`
      );
    }
  }
}

function buildFaceLandmarkerOptions(delegate: 'GPU' | 'CPU') {
  return {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };
}

function getTrackedFaceCenterY(landmarks: NormalizedLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length === 0) {
    return null;
  }

  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const landmark of landmarks) {
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  }

  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  return clamp((minY + maxY) / 2, 0, 1);
}

function getHeadTrackingErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Camera permission was blocked. Please allow webcam access and try again.';
    }

    if (error.name === 'NotFoundError') {
      return 'No webcam was found for head tracking.';
    }

    if (error.name === 'NotReadableError') {
      return 'Your webcam is busy in another app or tab.';
    }

    if (error.name === 'NotSupportedError') {
      return 'This browser could not start the camera or local tracking model.';
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Head tracking could not be started in this browser.';
}

function formatTrackingError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'unknown error';
}
