import { useEffect, useRef, useState } from 'react'
import { Socket } from 'socket.io-client'
import { MessageHistory } from './MessageHistory'
import { ChatInput } from './ChatInput'
import { ApprovalOverlay } from './ApprovalOverlay'
import { FileUploader } from './FileUploader'
import { SessionFileManager } from './SessionFileManager'
import { useMTRStore } from '../store/useMTRStore'
import { Files, X } from 'lucide-react'

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
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [showFileManager, setShowFileManager] = useState(false)
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
    removeApprovalRequest,
    sessionFiles,
    activeTSG,
    uploadSessionFiles
  } = useMTRStore()

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

  useEffect(() => {
    if (!socket) return

    // Handle agent events
    const handleAgentEvent = (event: any) => {
      console.log('ChatView - Agent event:', event)

      switch (event.type) {
        case 'user_message':
          // User message already added when sent
          break

        case 'assistant_message':
          console.log('Assistant message details:', JSON.stringify(event.data, null, 2))

          // Extract content from the message
          let content = ''
          if (event.data.content && Array.isArray(event.data.content)) {
            console.log('Content array:', JSON.stringify(event.data.content, null, 2))
            const textContent = event.data.content.find((c: any) => c.type === 'output_text')
            if (textContent && textContent.text) {
              content = textContent.text
              console.log('Extracted text content:', content)
            } else {
              console.log('No output_text content found in:', event.data.content)
            }
          } else {
            console.log('No content array found, content is:', event.data.content)
          }

          // Check if this is a new message or an update
          const existingMessage = messages.find(m => m.id === event.data.id)

          if (!existingMessage) {
            console.log('Creating new assistant message with content:', content)

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

            console.log('Adding message to store:', JSON.stringify(message, null, 2))
            addMessage(message)

            // Clear active tool calls when assistant message is complete
            if (event.data.status === 'completed') {
              setActiveToolCalls([])
            }

            if (event.data.status === 'streaming') {
              setStreamingMessageId(event.data.id)
            }
          } else {
            console.log('Updating existing assistant message with content:', content)

            // Update existing message
            if (content) {
              updateMessage(event.data.id, {
                content: content,
                status: event.data.status === 'completed' ? 'complete' : 'streaming'
              })
            }

            if (event.data.status === 'completed') {
              setStreamingMessageId(null)
              setActiveToolCalls([])
            }
          }
          break

        case 'item':
          // Handle generic item events (from refactored handler)
          console.log('Item event:', JSON.stringify(event.data, null, 2))

          if (event.data.type === 'message' && event.data.role === 'assistant') {
            // This is an assistant message from the refactored handler
            console.log('Processing assistant message from item event')

            // Extract content from the message
            let content = ''
            if (event.data.content && Array.isArray(event.data.content)) {
              const textContent = event.data.content.find((c: any) => c.type === 'output_text')
              if (textContent && textContent.text) {
                content = textContent.text
              }
            }

            // Check if this is a new message or an update
            const existingMessage = messages.find(m => m.id === event.data.id)

            if (!existingMessage && content) {
              // Only create message if we have content
              const message = {
                id: event.data.id,
                role: 'assistant' as const,
                content,
                timestamp: new Date(),
                status: 'complete' as const
              }

              console.log('Adding assistant message from item event:', JSON.stringify(message, null, 2))
              addMessage(message)
              setActiveToolCalls([])
            } else if (existingMessage && content) {
              // Update existing message
              updateMessage(event.data.id, {
                content: content,
                status: 'complete'
              })
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
    }

    socket.on('agent_event', handleAgentEvent)

    // Handle approval requests
    const handleApprovalRequest = (request: any) => {
      console.log('Approval request:', request)
      addApprovalRequest(request)
    }

    socket.on('approval_request', handleApprovalRequest)

    // Handle auto-analysis trigger
    const handleAutoAnalysisTrigger = (data: { message: string; files: string[] }) => {
      console.log('Auto-analysis trigger:', data)
      
      // Show a system message that analysis will begin
      const systemMessage = {
        id: `msg-${Date.now()}-system`,
        role: 'system' as const,
        content: `Auto-analysis triggered for ${data.files.length} file(s): ${data.files.join(', ')}`,
        timestamp: new Date(),
        status: 'complete' as const
      }
      addMessage(systemMessage)
      
      // Automatically send the analysis request
      handleSendMessage(data.message)
    }

    socket.on('message', (message: any) => {
      if (message.type === 'auto-analysis:trigger') {
        handleAutoAnalysisTrigger(message.data)
      }
    })

    // Cleanup
    return () => {
      socket.off('agent_event', handleAgentEvent)
      socket.off('approval_request', handleApprovalRequest)
      socket.off('message')
    }
  }, [socket, streamingMessageId, messages, addMessage, updateMessage, setStreamingMessageId, addApprovalRequest, activeToolCalls, setActiveToolCalls, handleSendMessage])

  const handleApproval = (approvalId: string, approved: boolean) => {
    if (!socket || !activeSessionId) return

    socket.emit('approval_response', {
      sessionId: activeSessionId,
      approvalId,
      approved
    })

    removeApprovalRequest(approvalId)
  }

  const handleFileUpload = async (files: File[]) => {
    try {
      await uploadSessionFiles(files)
      setShowFileUpload(false)
    } catch (error) {
      console.error('File upload failed:', error)
      // Keep the modal open on error so user can see what happened
      alert(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 flex flex-col relative h-full">
      {/* Active TSG Indicator */}
      {activeTSG && (
        <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900 text-sm">
          <span className="font-medium">Active TSG:</span> {activeTSG}
        </div>
      )}

      {/* Session Files Indicator */}
      {sessionFiles.length > 0 && (
        <div className="px-4 py-2 bg-green-50 dark:bg-green-900 text-sm flex items-center justify-between">
          <div>
            <span className="font-medium">Session Files:</span> {sessionFiles.length} file{sessionFiles.length !== 1 ? 's' : ''} uploaded
          </div>
          <button
            onClick={() => setShowFileManager(true)}
            className="text-blue-600 hover:underline flex items-center gap-1"
          >
            <Files className="w-4 h-4" />
            Manage Files
          </button>
        </div>
      )}

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
      <div className="flex-1 overflow-y-auto px-6 py-4 h-0">
        <MessageHistory messages={messages} />
        
        {/* Thinking indicator when agent is working but no streaming message */}
        {activeToolCalls.length > 0 && !streamingMessageId && (
          <div className="mt-6">
            <div className="flex justify-start">
              <div className="max-w-[80%]">
                <div className="flex items-start gap-3">
                  {/* AI Avatar */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    AI
                  </div>

                  {/* Thinking indicator */}
                  <div className="flex-1">
                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                      Agent is working... (Check the Agent tab for details)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* File Upload Modal */}
      {showFileUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium mb-4">Upload Log Files</h3>
            <FileUploader onUpload={handleFileUpload} />
            <button
              onClick={() => setShowFileUpload(false)}
              className="mt-4 w-full px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* File Manager Modal */}
      {showFileManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-6xl h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-xl font-semibold">Session Files</h2>
              <button
                onClick={() => setShowFileManager(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="h-[calc(80vh-64px)]">
              <SessionFileManager />
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFileUpload(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            title="Upload files"
          >
            📎
          </button>
          <button
            onClick={() => setShowFileManager(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded relative"
            title="Manage files"
          >
            <Files className="w-5 h-5" />
            {sessionFiles.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {sessionFiles.length}
              </span>
            )}
          </button>
          <div className="flex-1">
            <ChatInput onSendMessage={handleSendMessage} disabled={isLoading} />
          </div>
        </div>
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
