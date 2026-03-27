import {
  AlignLeft,
  AlertTriangle,
  Eye,
  EyeOff,
  FolderOpen,
  Grid,
  Minus,
  X,
  PanelLeftClose,
  LifeBuoy,
  Save,
  ScanEye,
  Upload,
  Volume2,
} from 'lucide-react';
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
  headTrackingEnabled: boolean;
  onToggleHeadTracking: () => void;
  readingMode: boolean;
  onToggleReadingMode: () => void;
  isSpeaking: boolean;
  onOpenSupportHub: () => void;
  className?: string;
  onCloseMobile?: () => void;
}

const FONTS = [
  { name: 'OpenDyslexic', value: 'OpenDyslexic, sans-serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Times New Roman', value: '"Times New Roman", serif' },
];

const YELLOW_SHADES = [
  '#FFF9E6', '#FFF4CC', '#FFECB3', '#FFE499', '#FFDB80', '#FFD166',
  '#FFC94D', '#FFC133', '#FFB81A', '#FFB000',
];

const OTHER_COLORS = [
  '#FFFFFF', '#F0F0F0', '#E8F4F8', '#E8F5E9', '#FFF3E0', '#F3E5F5',
  '#FFE0E0', '#E0F2F7', '#FFF8DC', '#F5F5DC',
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
  headTrackingEnabled,
  onToggleHeadTracking,
  onToggleReadingMode,
  isSpeaking,
  onOpenSupportHub,
  className = '',
  onCloseMobile,
}: ControlPanelProps) {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      onPdfUpload(file);
    }
  };

  return (
    <aside className={`h-full w-full shrink-0 overflow-y-auto border-r border-stone-200 bg-stone-50 px-4 py-4 sm:px-5 sm:py-6 lg:w-[22rem] ${className}`}>
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Synapse Dyslexia Reader
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">Reading Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Calm reading support with clearer wording, gentler visuals, and a dedicated reading mode.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 lg:hidden"
                title="Close tools"
              >
                <X size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleReadingMode}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200"
              title="Enter reading mode"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <PrimaryAction
            label="Enter Reading Mode"
            description="Hide extra controls and keep the page calm while you read."
            onClick={onToggleReadingMode}
            icon={<PanelLeftClose size={18} />}
            tone="dark"
          />
          <PrimaryAction
            label={isSpeaking ? 'Stop Reading Aloud' : 'Read Aloud'}
            description="Listen to the page one sentence at a time."
            onClick={onTextToSpeech}
            icon={<Volume2 size={18} />}
            tone="green"
          />
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <SectionCard
          eyebrow="Reading"
          title="Make the page easier to scan"
          description="These settings change how the page looks and how strongly the current line stands out."
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Reading Font
            </label>
            <select
              value={settings.fontFamily}
              onChange={(event) => onSettingsChange({ ...settings, fontFamily: event.target.value })}
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-3 py-2.5 text-sm text-stone-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            >
              {FONTS.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.name}
                </option>
              ))}
            </select>
          </div>

          <RangeField
            label="Text Size"
            value={`${settings.fontSize}px`}
            min="12"
            max="48"
            currentValue={settings.fontSize}
            onChange={(event) => onSettingsChange({ ...settings, fontSize: parseInt(event.target.value, 10) })}
          />
          <RangeField
            label="Line Spacing"
            value={settings.lineSpacing.toFixed(1)}
            min="1"
            max="3"
            step="0.1"
            currentValue={settings.lineSpacing}
            onChange={(event) => onSettingsChange({ ...settings, lineSpacing: parseFloat(event.target.value) })}
          />
          <RangeField
            label="Letter Spacing"
            value={`${settings.letterSpacing.toFixed(1)}px`}
            min="0"
            max="5"
            step="0.1"
            currentValue={settings.letterSpacing}
            onChange={(event) => onSettingsChange({ ...settings, letterSpacing: parseFloat(event.target.value) })}
          />
          <RangeField
            label="Text Weight"
            value={`${settings.fontWeight}`}
            min="300"
            max="900"
            step="100"
            currentValue={settings.fontWeight}
            onChange={(event) => onSettingsChange({ ...settings, fontWeight: parseInt(event.target.value, 10) })}
          />
        </SectionCard>

        <SectionCard
          eyebrow="Color"
          title="Reduce glare and visual stress"
          description="Warm backgrounds and softer contrast usually feel easier over longer reading sessions."
        >
          <ColorPalette
            label="Warm backgrounds"
            colors={YELLOW_SHADES}
            selectedColor={settings.backgroundColor}
            onSelect={(backgroundColor) => onSettingsChange({ ...settings, backgroundColor })}
          />
          <ColorPalette
            label="Other calm backgrounds"
            colors={OTHER_COLORS}
            selectedColor={settings.backgroundColor}
            onSelect={(backgroundColor) => onSettingsChange({ ...settings, backgroundColor })}
          />
          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">Text Color</p>
            <div className="flex gap-2">
              {['#000000', '#1a1a1a', '#333333', '#666666'].map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onSettingsChange({ ...settings, textColor: color })}
                  className={`h-12 w-12 rounded-2xl border-2 transition-transform hover:scale-105 ${
                    settings.textColor === color ? 'border-amber-500' : 'border-stone-300'
                  }`}
                  style={{ backgroundColor: color }}
                  title={`Use text color ${color}`}
                />
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Support"
          title="Guided reading help"
          description="Clear labels and simple choices make it easier to understand what each tool will do."
        >
          <ToggleButton
            active={showReadingGuide}
            onClick={onToggleReadingGuide}
            icon={showReadingGuide ? <Eye size={18} /> : <EyeOff size={18} />}
            label="Reading Ruler"
            description="Keep a soft highlight over the line you are reading."
            tone="blue"
          />
          <ToggleButton
            active={focusMode}
            onClick={onToggleFocusMode}
            icon={<Grid size={18} />}
            label="Dim Other Lines"
            description="Fade the lines above and below so the current area feels steadier."
            tone="blue"
          />
          <ToggleButton
            active={wordHighlight}
            onClick={onToggleWordHighlight}
            icon={<Minus size={18} />}
            label="Add Word Spacing"
            description="Create a little more room between words to reduce crowding."
            tone="blue"
          />
          <ToggleButton
            active={showDifficultWords}
            onClick={onToggleDifficultWords}
            icon={<AlertTriangle size={18} />}
            label="Highlight Tricky Words"
            description="Mark words that may need extra support without taking over the page."
            tone="amber"
          />
          <ToggleButton
            active={showSentenceSimplification}
            onClick={onToggleSentenceSimplification}
            icon={<AlignLeft size={18} />}
            label="Break Long Sentences"
            description="Split longer sentences into clearer chunks and show a simpler reading path."
            tone="teal"
          />
          <ToggleButton
            active={headTrackingEnabled}
            onClick={onToggleHeadTracking}
            icon={<ScanEye size={18} />}
            label="Head Tracking"
            description="Experimental. Use the webcam to guide a reading line without storing video."
            tone="violet"
          />
        </SectionCard>

        <SectionCard
          eyebrow="Support"
          title="Trusted outside help"
          description="Open a curated hub with trusted guides, videos, helplines, and India-specific resources."
        >
          <PrimaryAction
            label="Open Support Hub"
            description="Browse trusted dyslexia resources, official videos, helplines, and local help links."
            onClick={onOpenSupportHub}
            icon={<LifeBuoy size={18} />}
            tone="stone"
          />
        </SectionCard>

        <SectionCard
          eyebrow="Documents"
          title="Bring in or save reading material"
          description="Keep document actions separate so the reading tools stay uncluttered."
        >
          <PrimaryAction
            label="Upload PDF"
            description="Import a PDF into the reading workspace."
            icon={<Upload size={18} />}
            tone="blue"
            asLabel
          >
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </PrimaryAction>
          <PrimaryAction
            label="Save Document"
            description="Save the current page for later."
            onClick={onSaveDocument}
            icon={<Save size={18} />}
            tone="green"
          />
          <PrimaryAction
            label="Load Document"
            description="Open a saved document."
            onClick={onLoadDocuments}
            icon={<FolderOpen size={18} />}
            tone="stone"
          />
        </SectionCard>
      </div>
    </aside>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-stone-900">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function RangeField({
  label,
  value,
  currentValue,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: string;
  currentValue: number;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  min: string;
  max: string;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-stone-700">
        {label}: {value}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={onChange}
        className="w-full"
      />
    </div>
  );
}

function ColorPalette({
  label,
  colors,
  selectedColor,
  onSelect,
}: {
  label: string;
  colors: string[];
  selectedColor: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-stone-700">{label}</p>
      <div className="grid grid-cols-5 gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onSelect(color)}
            className={`h-10 w-10 rounded-2xl border-2 transition-transform hover:scale-105 ${
              selectedColor === color ? 'border-amber-500 scale-105' : 'border-stone-300'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
  description,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  tone: 'blue' | 'amber' | 'teal' | 'violet';
}) {
  const activeClasses = {
    blue: 'bg-blue-600 text-white shadow-blue-200',
    amber: 'bg-amber-500 text-white shadow-amber-200',
    teal: 'bg-teal-600 text-white shadow-teal-200',
    violet: 'bg-violet-600 text-white shadow-violet-200',
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
        active
          ? `border-transparent ${activeClasses} shadow-sm`
          : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-stone-100'
      }`}
    >
      <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
        active ? 'bg-white text-stone-700' : 'bg-white text-stone-500 ring-1 ring-stone-200'
      }`}>
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className={`mt-1 block text-sm leading-5 ${active ? 'text-white/85' : 'text-stone-500'}`}>
          {description}
        </span>
      </span>
    </button>
  );
}

function PrimaryAction({
  label,
  description,
  onClick,
  icon,
  tone,
  asLabel,
  children,
}: {
  label: string;
  description: string;
  onClick?: () => void;
  icon: React.ReactNode;
  tone: 'blue' | 'green' | 'stone' | 'dark';
  asLabel?: boolean;
  children?: React.ReactNode;
}) {
  const toneClasses = {
    blue: 'bg-blue-600 text-white hover:bg-blue-700',
    green: 'bg-emerald-600 text-white hover:bg-emerald-700',
    stone: 'bg-stone-700 text-white hover:bg-stone-800',
    dark: 'bg-stone-900 text-white hover:bg-stone-700',
  }[tone];

  const content = (
    <>
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-stone-700">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-1 block text-sm text-white/80">{description}</span>
      </span>
      {children}
    </>
  );

  if (asLabel) {
    return (
      <label className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl px-4 py-3 transition-colors ${toneClasses}`}>
        {content}
      </label>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${toneClasses}`}
    >
      {content}
    </button>
  );
}
