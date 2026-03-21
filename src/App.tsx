import { useState, useEffect } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { TextEditor } from './components/TextEditor/TextEditor';
import { DocumentModal } from './components/DocumentModal';
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
  const [hoverPronunciationRate, setHoverPronunciationRate] = useState(() => {
    const storedRate = localStorage.getItem('hover_pronunciation_rate');
    return storedRate ? parseFloat(storedRate) : 0.85;
  });
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentDocId, setCurrentDocId] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);

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

    const sessionId = getSessionId();

    if (currentDocId) {
      await supabase
        .from('documents')
        .update({
          title,
          content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentDocId);
    } else {
      const { data } = await supabase
        .from('documents')
        .insert({
          title,
          content,
          user_id: sessionId,
        })
        .select()
        .single();

      if (data) {
        setCurrentDocId(data.id);
      }
    }

    alert('Document saved successfully!');
  };

  const handleLoadDocuments = async () => {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .order('updated_at', { ascending: false });

    setDocuments(data || []);
    setShowDocumentModal(true);
  };

  const handleLoadDocument = (doc: Document) => {
    setContent(doc.content);
    setCurrentDocId(doc.id);
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    await supabase.from('documents').delete().eq('id', id);
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
    <div className="h-screen flex overflow-hidden">
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
      />
      <TextEditor
        content={content}
        onContentChange={setContent}
        settings={settings}
        showReadingGuide={showReadingGuide}
        focusMode={focusMode}
        wordHighlight={wordHighlight}
        showDifficultWords={showDifficultWords}
        showSentenceSimplification={showSentenceSimplification}
        activeSentenceIndex={activeSentenceIndex}
        hoverPronunciationRate={hoverPronunciationRate}
        onHoverPronunciationRateChange={setHoverPronunciationRate}
      />
      {showDocumentModal && (
        <DocumentModal
          documents={documents}
          onClose={() => setShowDocumentModal(false)}
          onLoad={handleLoadDocument}
          onDelete={handleDeleteDocument}
        />
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
