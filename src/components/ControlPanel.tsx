import { Upload, Save, FolderOpen, Volume2, Eye, EyeOff, Grid, Minus, AlertTriangle, AlignLeft } from 'lucide-react';
import { ReaderSettings } from '../types';

interface ControlPanelProps {
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  onPdfUpload: (file: File) => void;
  onSaveDocument: () => void;
  onLoadDocuments: () => void;
  onTextToSpeech: () => void;
  showReadingGuide: boolean;
  onToggleReadingGuide: () => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  wordHighlight: boolean;
  onToggleWordHighlight: () => void;
  showDifficultWords: boolean;
  onToggleDifficultWords: () => void;
  showSentenceSimplification: boolean;
  onToggleSentenceSimplification: () => void;
}

const FONTS = [
  { name: 'OpenDyslexic', value: 'OpenDyslexic, sans-serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", serif' },
];

const YELLOW_SHADES = [
  '#FFF9E6', '#FFF4CC', '#FFECB3', '#FFE499', '#FFDB80', '#FFD166',
  '#FFC94D', '#FFC133', '#FFB81A', '#FFB000'
];

const OTHER_COLORS = [
  '#FFFFFF', '#F0F0F0', '#E8F4F8', '#E8F5E9', '#FFF3E0', '#F3E5F5',
  '#FFE0E0', '#E0F2F7', '#FFF8DC', '#F5F5DC'
];

export function ControlPanel({
  settings,
  onSettingsChange,
  onPdfUpload,
  onSaveDocument,
  onLoadDocuments,
  onTextToSpeech,
  showReadingGuide,
  onToggleReadingGuide,
  focusMode,
  onToggleFocusMode,
  wordHighlight,
  onToggleWordHighlight,
  showDifficultWords,
  onToggleDifficultWords,
  showSentenceSimplification,
  onToggleSentenceSimplification,
}: ControlPanelProps) {
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      onPdfUpload(file);
    }
  };

  return (
    <div className="bg-white border-r border-gray-200 w-80 p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Dyslexia Reader</h2>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Font Family
          </label>
          <select
            value={settings.fontFamily}
            onChange={(e) => onSettingsChange({ ...settings, fontFamily: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {FONTS.map(font => (
              <option key={font.value} value={font.value}>{font.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Font Size: {settings.fontSize}px
          </label>
          <input
            type="range"
            min="12"
            max="48"
            value={settings.fontSize}
            onChange={(e) => onSettingsChange({ ...settings, fontSize: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Line Spacing: {settings.lineSpacing.toFixed(1)}
          </label>
          <input
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={settings.lineSpacing}
            onChange={(e) => onSettingsChange({ ...settings, lineSpacing: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Letter Spacing: {settings.letterSpacing.toFixed(1)}px
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={settings.letterSpacing}
            onChange={(e) => onSettingsChange({ ...settings, letterSpacing: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Font Weight: {settings.fontWeight}
          </label>
          <input
            type="range"
            min="300"
            max="900"
            step="100"
            value={settings.fontWeight}
            onChange={(e) => onSettingsChange({ ...settings, fontWeight: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Background Color
          </label>
          <div className="space-y-2">
            <div className="text-xs text-gray-600 mb-1">Yellow Shades</div>
            <div className="grid grid-cols-5 gap-2">
              {YELLOW_SHADES.map(color => (
                <button
                  key={color}
                  onClick={() => onSettingsChange({ ...settings, backgroundColor: color })}
                  className={`w-10 h-10 rounded border-2 transition-transform hover:scale-110 ${
                    settings.backgroundColor === color ? 'border-blue-500 scale-110' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="text-xs text-gray-600 mb-1 mt-3">Other Colors</div>
            <div className="grid grid-cols-5 gap-2">
              {OTHER_COLORS.map(color => (
                <button
                  key={color}
                  onClick={() => onSettingsChange({ ...settings, backgroundColor: color })}
                  className={`w-10 h-10 rounded border-2 transition-transform hover:scale-110 ${
                    settings.backgroundColor === color ? 'border-blue-500 scale-110' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Text Color
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => onSettingsChange({ ...settings, textColor: '#000000' })}
              className={`w-12 h-12 rounded border-2 ${
                settings.textColor === '#000000' ? 'border-blue-500' : 'border-gray-300'
              }`}
              style={{ backgroundColor: '#000000' }}
            />
            <button
              onClick={() => onSettingsChange({ ...settings, textColor: '#1a1a1a' })}
              className={`w-12 h-12 rounded border-2 ${
                settings.textColor === '#1a1a1a' ? 'border-blue-500' : 'border-gray-300'
              }`}
              style={{ backgroundColor: '#1a1a1a' }}
            />
            <button
              onClick={() => onSettingsChange({ ...settings, textColor: '#333333' })}
              className={`w-12 h-12 rounded border-2 ${
                settings.textColor === '#333333' ? 'border-blue-500' : 'border-gray-300'
              }`}
              style={{ backgroundColor: '#333333' }}
            />
            <button
              onClick={() => onSettingsChange({ ...settings, textColor: '#666666' })}
              className={`w-12 h-12 rounded border-2 ${
                settings.textColor === '#666666' ? 'border-blue-500' : 'border-gray-300'
              }`}
              style={{ backgroundColor: '#666666' }}
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Reading Assistance
          </label>
          <div className="space-y-2">
            <button
              onClick={onToggleReadingGuide}
              className={`w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                showReadingGuide ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {showReadingGuide ? <Eye size={18} /> : <EyeOff size={18} />}
              Reading Guide
            </button>
            <button
              onClick={onToggleFocusMode}
              className={`w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                focusMode ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Grid size={18} />
              Focus Mode
            </button>
            <button
              onClick={onToggleWordHighlight}
              className={`w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                wordHighlight ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Minus size={18} />
              Word Highlight
            </button>
            <button
              onClick={onToggleDifficultWords}
              className={`w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                showDifficultWords ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <AlertTriangle size={18} />
              Difficult Words
            </button>
            <button
              onClick={onToggleSentenceSimplification}
              className={`w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                showSentenceSimplification ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <AlignLeft size={18} />
              Sentence Simplification
            </button>
            <button
              onClick={onTextToSpeech}
              className="w-full px-4 py-2 bg-green-500 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-green-600 transition-colors"
            >
              <Volume2 size={18} />
              Read Aloud
            </button>
          </div>
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Document Actions
          </label>
          <div className="space-y-2">
            <label className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors cursor-pointer">
              <Upload size={18} />
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={onSaveDocument}
              className="w-full px-4 py-2 bg-green-500 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-green-600 transition-colors"
            >
              <Save size={18} />
              Save Document
            </button>
            <button
              onClick={onLoadDocuments}
              className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-gray-600 transition-colors"
            >
              <FolderOpen size={18} />
              Load Document
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
