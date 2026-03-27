import { useState, useEffect } from 'react';
import { ArrowLeft, LifeBuoy, Menu, PanelLeftClose, Volume2 } from 'lucide-react';
import { ControlPanel } from './components/ControlPanel';
import { TextEditor } from './components/TextEditor/TextEditor';
import { DocumentModal } from './components/DocumentModal';
import { SupportHub } from './components/SupportHub';
import { ReaderSettings, Document } from './types';
import { supabase } from './lib/supabase';
import { extractTextFromPdf } from './utils/pdfParser';
import { splitIntoSentences } from './utils/sentences';

const DEFAULT_SETTINGS: ReaderSettings = {
  fontFamily: 'Arial, sans-serif',
  fontSize: 18,
  lineSpacing: 1.8,
  letterSpacing: 0.5,
  fontWeight: 400,
  backgroundColor: '#FFF9E6',
  textColor: '#000000',
};

function App() {
  const [content, setContent] = useState('');
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [showReadingGuide, setShowReadingGuide] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [wordHighlight, setWordHighlight] = useState(false);
  const [showDifficultWords, setShowDifficultWords] = useState(false);
  const [showSentenceSimplification, setShowSentenceSimplification] = useState(false);
  const [headTrackingEnabled, setHeadTrackingEnabled] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [hoverPronunciationRate, setHoverPronunciationRate] = useState(() => {
    const storedRate = localStorage.getItem('hover_pronunciation_rate');
    return storedRate ? parseFloat(storedRate) : 0.85;
  });
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showSupportHub, setShowSupportHub] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    localStorage.setItem('hover_pronunciation_rate', hoverPronunciationRate.toString());
  }, [hoverPronunciationRate]);

  useEffect(() => {
    if (!content.trim()) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setActiveSentenceIndex(null);
    }
  }, [content]);

  useEffect(() => {
    if (readingMode) {
      setMobilePanelOpen(false);
    }
  }, [readingMode]);

  const loadSettings = async () => {
    const sessionId = getSessionId();
    const { data } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (data) {
      setSettings({
        fontFamily: data.font_family,
        fontSize: data.font_size,
        lineSpacing: parseFloat(data.line_spacing),
        letterSpacing: parseFloat(data.letter_spacing),
        fontWeight: data.font_weight,
        backgroundColor: data.background_color,
        textColor: data.text_color,
      });
    }
  };

  const saveSettings = async (newSettings: ReaderSettings) => {
    const sessionId = getSessionId();

    const { data: existing } = await supabase
      .from('user_preferences')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    const settingsData = {
      session_id: sessionId,
      font_family: newSettings.fontFamily,
      font_size: newSettings.fontSize,
      line_spacing: newSettings.lineSpacing,
      letter_spacing: newSettings.letterSpacing,
      font_weight: newSettings.fontWeight,
      background_color: newSettings.backgroundColor,
      text_color: newSettings.textColor,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      await supabase
        .from('user_preferences')
        .update(settingsData)
        .eq('id', existing.id);
    } else {
      await supabase
        .from('user_preferences')
        .insert(settingsData);
    }
  };

  const handleSettingsChange = (newSettings: ReaderSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handlePdfUpload = async (file: File) => {
    try {
      const text = await extractTextFromPdf(file);
      setContent(text);
      setCurrentDocId(null);
    } catch (error) {
      alert('Failed to extract text from PDF. Please try another file.');
    }
  };

  const handleSaveDocument = async () => {
    if (!content.trim()) {
      alert('Please add some content before saving.');
      return;
    }

    const title = prompt('Enter document title:', 'Untitled Document');
    if (!title) return;

    if (currentDocId) {
      const { error } = await supabase
        .from('documents')
        .update({
          title,
          content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentDocId);

      if (error) {
        alert(`Could not save the document: ${error.message}`);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('documents')
        .insert({
          title,
          content,
        })
        .select()
        .single();

      if (error) {
        alert(`Could not save the document: ${error.message}`);
        return;
      }

      if (data) {
        setCurrentDocId(data.id);
        setDocuments((current) => [data, ...current.filter((doc) => doc.id !== data.id)]);
      }
    }

    alert('Document saved successfully!');
  };

  const handleLoadDocuments = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      alert(`Could not load documents: ${error.message}`);
      return;
    }

    setDocuments(data || []);
    setShowDocumentModal(true);
  };

  const handleLoadDocument = (doc: Document) => {
    setContent(doc.content);
    setCurrentDocId(doc.id);
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    const { error } = await supabase.from('documents').delete().eq('id', id);
    if (error) {
      alert(`Could not delete the document: ${error.message}`);
      return;
    }

    setDocuments(documents.filter(doc => doc.id !== id));

    if (currentDocId === id) {
      setContent('');
      setCurrentDocId(null);
    }
  };

  const handleTextToSpeech = () => {
    if ('speechSynthesis' in window) {
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setActiveSentenceIndex(null);
        return;
      }

      if (!content.trim()) {
        alert('Please add some text to read aloud.');
        return;
      }

      const sentences = splitIntoSentences(content).filter((segment) => segment.text.trim());
      if (sentences.length === 0) {
        return;
      }

      setIsSpeaking(true);
      speakSentenceSequence(sentences, 0);
    } else {
      alert('Text-to-speech is not supported in your browser.');
    }
  };

  const speakSentenceSequence = (sentences: { index: number; text: string }[], index: number) => {
    if (!('speechSynthesis' in window)) {
      return;
    }

    if (index >= sentences.length) {
      setIsSpeaking(false);
      setActiveSentenceIndex(null);
      return;
    }

    const sentence = sentences[index];
    setActiveSentenceIndex(sentence.index);

    const utterance = new SpeechSynthesisUtterance(sentence.text.trim());
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      if (!window.speechSynthesis.speaking && index === sentences.length - 1) {
        setIsSpeaking(false);
        setActiveSentenceIndex(null);
        return;
      }

      speakSentenceSequence(sentences, index + 1);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setActiveSentenceIndex(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="relative min-h-screen bg-stone-100 md:h-screen md:overflow-hidden">
      {!readingMode && (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 shadow-sm lg:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
              Synapse Dyslexia Reader
            </p>
            <p className="mt-1 text-sm font-medium text-stone-900">Reading tools and workspace</p>
          </div>
          <button
            type="button"
            onClick={() => setMobilePanelOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stone-900 text-white transition-colors hover:bg-stone-700"
            aria-label="Open reading tools"
          >
            <Menu size={18} />
          </button>
        </div>
      )}

      <div className="flex min-h-[calc(100vh-4.5rem)] flex-col overflow-hidden lg:h-full lg:min-h-0 lg:flex-row">
        {!readingMode && (
          <>
            <div className="hidden lg:block">
              <ControlPanel
                settings={settings}
                onSettingsChange={handleSettingsChange}
                onPdfUpload={handlePdfUpload}
                onSaveDocument={handleSaveDocument}
                onLoadDocuments={handleLoadDocuments}
                onTextToSpeech={handleTextToSpeech}
                showReadingGuide={showReadingGuide}
                onToggleReadingGuide={() => setShowReadingGuide(!showReadingGuide)}
                focusMode={focusMode}
                onToggleFocusMode={() => setFocusMode(!focusMode)}
                wordHighlight={wordHighlight}
                onToggleWordHighlight={() => setWordHighlight(!wordHighlight)}
                showDifficultWords={showDifficultWords}
                onToggleDifficultWords={() => setShowDifficultWords(!showDifficultWords)}
                showSentenceSimplification={showSentenceSimplification}
                onToggleSentenceSimplification={() => setShowSentenceSimplification(!showSentenceSimplification)}
                headTrackingEnabled={headTrackingEnabled}
                onToggleHeadTracking={() => setHeadTrackingEnabled(!headTrackingEnabled)}
                readingMode={readingMode}
                onToggleReadingMode={() => setReadingMode(!readingMode)}
                isSpeaking={isSpeaking}
                onOpenSupportHub={() => setShowSupportHub(true)}
              />
            </div>
            {mobilePanelOpen && (
              <div className="fixed inset-0 z-40 lg:hidden">
                <button
                  type="button"
                  className="absolute inset-0 bg-stone-900/40 backdrop-blur-[1px]"
                  onClick={() => setMobilePanelOpen(false)}
                  aria-label="Close reading tools"
                />
                <div className="absolute inset-y-0 left-0 w-[min(24rem,100vw)] shadow-2xl">
                  <ControlPanel
                    settings={settings}
                    onSettingsChange={handleSettingsChange}
                    onPdfUpload={handlePdfUpload}
                    onSaveDocument={handleSaveDocument}
                    onLoadDocuments={handleLoadDocuments}
                    onTextToSpeech={handleTextToSpeech}
                    showReadingGuide={showReadingGuide}
                    onToggleReadingGuide={() => setShowReadingGuide(!showReadingGuide)}
                    focusMode={focusMode}
                    onToggleFocusMode={() => setFocusMode(!focusMode)}
                    wordHighlight={wordHighlight}
                    onToggleWordHighlight={() => setWordHighlight(!wordHighlight)}
                    showDifficultWords={showDifficultWords}
                    onToggleDifficultWords={() => setShowDifficultWords(!showDifficultWords)}
                    showSentenceSimplification={showSentenceSimplification}
                    onToggleSentenceSimplification={() => setShowSentenceSimplification(!showSentenceSimplification)}
                    headTrackingEnabled={headTrackingEnabled}
                    onToggleHeadTracking={() => setHeadTrackingEnabled(!headTrackingEnabled)}
                    readingMode={readingMode}
                    onToggleReadingMode={() => setReadingMode(!readingMode)}
                    isSpeaking={isSpeaking}
                    onOpenSupportHub={() => setShowSupportHub(true)}
                    onCloseMobile={() => setMobilePanelOpen(false)}
                  />
                </div>
              </div>
            )}
          </>
        )}
        <TextEditor
          content={content}
          onContentChange={setContent}
          settings={settings}
          showReadingGuide={showReadingGuide}
          focusMode={focusMode}
          wordHighlight={wordHighlight}
          showDifficultWords={showDifficultWords}
          showSentenceSimplification={showSentenceSimplification}
          headTrackingEnabled={headTrackingEnabled}
          activeSentenceIndex={activeSentenceIndex}
          hoverPronunciationRate={hoverPronunciationRate}
          onHoverPronunciationRateChange={setHoverPronunciationRate}
          readingMode={readingMode}
        />
      </div>
      {readingMode && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="pointer-events-auto flex w-full max-w-4xl flex-col gap-3 rounded-[1.75rem] border border-stone-200 bg-white px-4 py-3 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:rounded-full">
            <div className="flex items-center gap-3 text-sm text-stone-700">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                <PanelLeftClose size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">Reading Mode</p>
                <p className="text-xs text-stone-500">
                  Calm reading layout with fewer controls and less visual noise.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSupportHub(true)}
                className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200"
              >
                <LifeBuoy size={16} />
                Support Hub
              </button>
              <button
                type="button"
                onClick={handleTextToSpeech}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isSpeaking ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <Volume2 size={16} />
                {isSpeaking ? 'Stop Audio' : 'Read Aloud'}
              </button>
              <button
                type="button"
                onClick={() => setReadingMode(false)}
                className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700"
              >
                <ArrowLeft size={16} />
                Exit Reading Mode
              </button>
            </div>
          </div>
        </div>
      )}
      {showDocumentModal && (
        <DocumentModal
          documents={documents}
          onClose={() => setShowDocumentModal(false)}
          onLoad={handleLoadDocument}
          onDelete={handleDeleteDocument}
        />
      )}
      {showSupportHub && (
        <SupportHub onClose={() => setShowSupportHub(false)} />
      )}
    </div>
  );
}

function getSessionId(): string {
  let sessionId = localStorage.getItem('session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('session_id', sessionId);
  }
  return sessionId;
}

export default App;
