import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { StreamingText } from './StreamingText'

interface MessageProps {
  message: {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: Date
    status?: 'streaming' | 'complete' | 'error'
    tools?: any[]
  }
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user'
  const isStreaming = message.status === 'streaming'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          {/* Avatar */}
          <div className={`
            flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
            ${isUser 
              ? 'bg-primary-500 text-white' 
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }
          `}>
            {isUser ? 'U' : 'AI'}
          </div>

          {/* Message Content */}
          <div className={`
            rounded-lg px-4 py-2
            ${isUser 
              ? 'bg-primary-500 text-white' 
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            }
          `}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : isStreaming ? (
              <StreamingText text={message.content} isStreaming={true} />
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // Custom code block rendering
                    code({ node, className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      const inline = !(node?.position);
                      return !inline && match ? (
                        <div className="relative">
                          <div className="absolute top-0 right-0 px-2 py-1 text-xs text-gray-400">
                            {match[1]}
                          </div>
                          <pre className="bg-gray-900 text-gray-100 rounded p-4 overflow-x-auto">
                            <code className={className} {...props}>
                              {children}
                            </code>
                          </pre>
                        </div>
                      ) : (
                        <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm" {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Tool Executions */}
            {message.tools && message.tools.length > 0 && (
              <div className="mt-3 space-y-2">
                {message.tools.map((tool: any) => (
                  <div key={tool.id} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Timestamp */}
        <div className={`mt-1 text-xs text-gray-500 dark:text-gray-400 ${isUser ? 'text-right' : 'text-left'}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}
