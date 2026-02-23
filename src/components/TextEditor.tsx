import { useRef, useEffect } from 'react';
import { ReaderSettings } from '../types';

interface TextEditorProps {
  content: string;
  onContentChange: (content: string) => void;
  settings: ReaderSettings;
  showReadingGuide: boolean;
  focusMode: boolean;
  wordHighlight: boolean;
}

export function TextEditor({
  content,
  onContentChange,
  settings,
  showReadingGuide,
  focusMode,
  wordHighlight,
}: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (showReadingGuide && guideRef.current && textareaRef.current) {
        const rect = textareaRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        guideRef.current.style.top = `${y - 20}px`;
      }
    };

    const textarea = textareaRef.current;
    if (textarea && showReadingGuide) {
      textarea.addEventListener('mousemove', handleMouseMove);
      return () => textarea.removeEventListener('mousemove', handleMouseMove);
    }
  }, [showReadingGuide]);

  const editorStyle: React.CSSProperties = {
    fontFamily: settings.fontFamily,
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineSpacing,
    letterSpacing: `${settings.letterSpacing}px`,
    fontWeight: settings.fontWeight,
    color: settings.textColor,
    backgroundColor: settings.backgroundColor,
  };

  return (
    <div className="relative flex-1 h-full">
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
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        className={`w-full h-full p-8 resize-none focus:outline-none ${
          wordHighlight ? 'word-highlight' : ''
        }`}
        style={editorStyle}
        placeholder="Start typing or upload a PDF to begin reading..."
        spellCheck={false}
      />
    </div>
  );
}
