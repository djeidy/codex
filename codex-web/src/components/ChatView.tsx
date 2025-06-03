import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { MessageHistory } from './MessageHistory'
import { ChatInput } from './ChatInput'
import { ApprovalOverlay } from './ApprovalOverlay'
import { ToolCall } from './ToolCall'
import { useCodexStore } from '../store/useCodexStore'

interface ChatViewProps {
  socket: Socket | null
}

interface ActiveToolCall {
  id: string
  name: string
  arguments?: string
  status: 'running' | 'success' | 'error'
  output?: string
  metadata?: any
}

export function ChatView({ socket }: ChatViewProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const {
    activeSessionId,
    messages,
    addMessage,
    updateMessage,
    streamingMessageId,
    setStreamingMessageId,
    approvalQueue,
    addApprovalRequest,
    removeApprovalRequest
  } = useCodexStore()

  useEffect(() => {
    if (!socket) return

    // Handle agent events
    socket.on('agent_event', (event: any) => {
      console.log('Agent event:', event)
      
      switch (event.type) {
        case 'user_message':
          // User message already added when sent
          break
          
        case 'assistant_message':
          console.log('Assistant message details:', event.data)
          
          // Check if this is a new message or an update
          const existingMessage = messages.find(m => m.id === event.data.id)
          
          if (!existingMessage) {
            // New message - check if it has content
            let content = ''
            if (event.data.content && Array.isArray(event.data.content)) {
              const textContent = event.data.content.find((c: any) => c.type === 'output_text')
              if (textContent && textContent.text) {
                content = textContent.text
              }
            }
            
            // Convert active tool calls to message tools
            const messageTools = activeToolCalls.map(tool => ({
              id: tool.id,
              name: tool.name,
              arguments: tool.arguments,
              status: tool.status,
              output: tool.output,
              metadata: tool.metadata
            }))
            
            const message = {
              id: event.data.id,
              role: 'assistant' as const,
              content,
              timestamp: new Date(),
              status: (event.data.status === 'completed' ? 'complete' : 'streaming') as 'complete' | 'streaming',
              tools: messageTools.length > 0 ? messageTools : undefined
            }
            addMessage(message)
            
            // Clear active tool calls when assistant message is complete
            if (event.data.status === 'completed') {
              setActiveToolCalls([])
            }
            
            if (event.data.status === 'streaming') {
              setStreamingMessageId(event.data.id)
            }
          } else {
            // Update existing message
            if (event.data.content && Array.isArray(event.data.content)) {
              const textContent = event.data.content.find((c: any) => c.type === 'output_text')
              if (textContent && textContent.text) {
                updateMessage(event.data.id, {
                  content: textContent.text,
                  status: event.data.status === 'completed' ? 'complete' : 'streaming'
                })
              }
            }
            
            if (event.data.status === 'completed') {
              setStreamingMessageId(null)
              setActiveToolCalls([])
            }
          }
          break
          
        case 'tool_execution': {
          // Handle tool execution display
          console.log('Tool execution:', event.data)
          
          // Add to active tool calls
          const newTool: ActiveToolCall = {
            id: event.data.id,
            name: event.data.name,
            arguments: event.data.arguments,
            status: event.data.status || 'running'
          }
          
          setActiveToolCalls(prev => [...prev, newTool])
          
          // Also add to the last assistant message if it exists
          const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')
          if (lastAssistantMessage) {
            const tool = {
              id: event.data.id,
              name: event.data.name,
              arguments: event.data.arguments,
              status: event.data.status || 'running',
              output: undefined,
              metadata: undefined
            }
            
            const updatedTools = [...(lastAssistantMessage.tools || []), tool]
            updateMessage(lastAssistantMessage.id, { tools: updatedTools })
          }
          break
        }
          
        case 'tool_result': {
          // Handle tool result display
          console.log('Tool result:', event.data)
          
          // Update active tool calls
          setActiveToolCalls(prev => 
            prev.map(tool => 
              tool.id === event.data.id 
                ? { ...tool, output: event.data.output, metadata: event.data.metadata, status: event.data.status }
                : tool
            )
          )
          
          // Find the message with this tool and update it
          const messageWithTool = [...messages].reverse().find(m => 
            m.tools?.some(t => t.id === event.data.id)
          )
          
          if (messageWithTool) {
            const updatedTools = messageWithTool.tools?.map(t => 
              t.id === event.data.id 
                ? { ...t, output: event.data.output, metadata: event.data.metadata, status: event.data.status }
                : t
            )
            updateMessage(messageWithTool.id, { tools: updatedTools })
          }
          break
        }
          
        case 'loading':
          setIsLoading(event.data.loading)
          break
      }
    })

    // Handle approval requests
    socket.on('approval_request', (request: any) => {
      console.log('Approval request:', request)
      addApprovalRequest(request)
    })

    // Cleanup
    return () => {
      socket.off('agent_event')
      socket.off('approval_request')
    }
  }, [socket, streamingMessageId, messages, addMessage, updateMessage, setStreamingMessageId, addApprovalRequest])

  const handleSendMessage = (message: string) => {
    if (!socket || !activeSessionId) return

    // Clear any active tool calls from previous messages
    setActiveToolCalls([])
    
    // Add user message to store
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date(),
      status: 'complete' as const
    }
    addMessage(userMessage)

    // Send to server
    socket.emit('user_input', {
      sessionId: activeSessionId,
      message
    })
  }

  const handleApproval = (approvalId: string, approved: boolean) => {
    if (!socket || !activeSessionId) return

    socket.emit('approval_response', {
      sessionId: activeSessionId,
      approvalId,
      approved
    })

    removeApprovalRequest(approvalId)
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Chat Session
          </h2>
          <div className="flex items-center gap-2">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
                <span>Processing...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <MessageHistory messages={messages} />
        
        {/* Active Tool Calls */}
        {activeToolCalls.length > 0 && (
          <div className="mt-6">
            <div className="flex justify-start">
              <div className="max-w-[80%]">
                <div className="flex items-start gap-3">
                  {/* AI Avatar */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    AI
                  </div>
                  
                  {/* Tool Calls Container */}
                  <div className="flex-1">
                    <div className="space-y-2">
                      {activeToolCalls.map((tool) => (
                        <ToolCall key={tool.id} tool={tool} />
                      ))}
                    </div>
                    {!streamingMessageId && (
                      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                        Thinking...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
      </div>

      {/* Approval Overlay */}
      {approvalQueue.length > 0 && (
        <ApprovalOverlay
          approval={approvalQueue[0]}
          onApprove={(id) => handleApproval(id, true)}
          onDeny={(id) => handleApproval(id, false)}
        />
      )}
    </div>
  )
}