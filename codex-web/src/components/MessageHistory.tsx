import { Message } from './Message'

interface MessageHistoryProps {
  messages: Array<{
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: Date
    status?: 'streaming' | 'complete' | 'error'
    tools?: any[]
  }>
}

export function MessageHistory({ messages }: MessageHistoryProps) {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-lg">No messages yet</p>
          <p className="text-sm mt-2">Start a conversation by typing a message below</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </div>
  )
}