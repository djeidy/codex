import { FormEvent, useRef, useEffect, KeyboardEvent } from 'react'
import { useMTRStore } from '../store/useMTRStore'

interface ChatInputProps {
  onSendMessage: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
  const { draftMessage, setDraftMessage } = useMTRStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()

    if (draftMessage.trim() && !disabled) {
      onSendMessage(draftMessage.trim())
      setDraftMessage('')

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [draftMessage])

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={draftMessage}
        onChange={(e) => setDraftMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        rows={1}
        className="
          flex-1 resize-none px-4 py-2 rounded-lg
          bg-gray-100 dark:bg-gray-800
          border border-gray-300 dark:border-gray-600
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
          placeholder-gray-500 dark:placeholder-gray-400
          text-gray-900 dark:text-gray-100
          disabled:opacity-50 disabled:cursor-not-allowed
          max-h-40
        "
      />
      <button
        type="submit"
        disabled={!draftMessage.trim() || disabled}
        className="
          px-4 py-2 rounded-lg font-medium
          bg-primary-500 hover:bg-primary-600 
          text-white
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        "
      >
        Send
      </button>
    </form>
  )
}