import { useRef, useEffect } from "react"
import { ReaderSettings } from "../../types"
import { tokenizeText } from "../../utils/tokenizeText"

interface TextEditorProps {
  content: string
  onContentChange: (content: string) => void
  settings: ReaderSettings
  showReadingGuide: boolean
  focusMode: boolean
  wordHighlight: boolean
}

export function TextEditor({
  content,
  onContentChange,
  settings,
  showReadingGuide,
  focusMode,
  wordHighlight,
}: TextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)
  const isUserTyping = useRef(false)

  /* ---------- Reading Guide ---------- */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (showReadingGuide && guideRef.current && editorRef.current) {
        const rect = editorRef.current.getBoundingClientRect()
        const y = e.clientY - rect.top
        guideRef.current.style.top = `${y - 20}px`
      }
    }

    const editor = editorRef.current
    if (editor && showReadingGuide) {
      editor.addEventListener("mousemove", handleMouseMove)
      return () => editor.removeEventListener("mousemove", handleMouseMove)
    }
  }, [showReadingGuide])

  /* ---------- Editor Style ---------- */
  const editorStyle: React.CSSProperties = {
    fontFamily: settings.fontFamily,
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineSpacing,
    letterSpacing: `${settings.letterSpacing}px`,
    fontWeight: settings.fontWeight,
    color: settings.textColor,
    backgroundColor: settings.backgroundColor,
  }

  /* ---------- Sync content → DOM (ONLY when external) ---------- */
  useEffect(() => {
    if (!editorRef.current) return
    if (isUserTyping.current) return

    const tokens = tokenizeText(content)

    editorRef.current.innerHTML = tokens
      .map(token =>
        token.isWord
          ? `<span data-word="true" class="inline-block">${token.text}</span>`
          : token.text
      )
      .join("")
  }, [content])

  /* ---------- DOM → state (user typing) ---------- */
  const handleInput = () => {
    if (!editorRef.current) return
    isUserTyping.current = true
    onContentChange(editorRef.current.innerText)
    requestAnimationFrame(() => {
      isUserTyping.current = false
    })
  }

  return (
    <div className="relative flex-1 h-full">
      {showReadingGuide && (
        <div
          ref={guideRef}
          className="absolute left-0 right-0 h-10 pointer-events-none z-10"
          style={{
            backgroundColor: "rgba(100, 149, 237, 0.2)",
            borderTop: "2px solid rgba(100, 149, 237, 0.6)",
            borderBottom: "2px solid rgba(100, 149, 237, 0.6)",
          }}
        />
      )}

      {focusMode && (
        <>
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none z-10"
            style={{
              height: "40%",
              background: `linear-gradient(to bottom, ${settings.backgroundColor} 0%, transparent 100%)`,
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 pointer-events-none z-10"
            style={{
              height: "40%",
              background: `linear-gradient(to top, ${settings.backgroundColor} 0%, transparent 100%)`,
            }}
          />
        </>
      )}

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        className={`w-full h-full p-8 focus:outline-none whitespace-pre-wrap break-words ${
          wordHighlight ? "word-highlight" : ""
        }`}
        style={editorStyle}
      />
    </div>
  )
}