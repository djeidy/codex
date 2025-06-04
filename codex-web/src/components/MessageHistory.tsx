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
  console.log('MessageHistory: Rendering with messages:', messages.length, JSON.stringify(messages, null, 2))

  if (messages.length === 0) {
    console.log('MessageHistory: No messages to display')
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-lg">No messages yet</p>
          <p className="text-sm mt-2">Start a conversation by typing a message below</p>
        </div>
      </div>
    )
  }

  console.log('MessageHistory: Rendering', messages.length, 'messages')
  return (
    <div className="space-y-6">
      {messages.map((message) => {
        console.log('MessageHistory: Rendering message:', message.id, message.role, message.content?.substring(0, 50))
        return <Message key={message.id} message={message} />
      })}
    </div>
  )
}