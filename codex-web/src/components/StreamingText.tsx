interface StreamingTextProps {
  text: string
  isStreaming: boolean
  showCursor?: boolean
}

export function StreamingText({ text, isStreaming, showCursor = true }: StreamingTextProps) {
  return (
    <span>
      {text}
      {isStreaming && showCursor && (
        <span className="inline-block w-2 h-4 bg-current cursor-blink ml-0.5" />
      )}
    </span>
  )
}