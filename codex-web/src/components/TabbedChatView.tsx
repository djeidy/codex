import { useState, useEffect } from 'react'
import { Socket } from 'socket.io-client'
import { ChatView } from './ChatView'
import { AgentActivityTab } from './AgentActivityTab'
import { useCodexStore } from '../store/useCodexStore'

interface TabbedChatViewProps {
  socket: Socket | null
}

type TabType = 'chat' | 'agent'

export function TabbedChatView({ socket }: TabbedChatViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('chat')
  const { runningActivitiesCount } = useCodexStore()

  useEffect(() => {
    if (!socket) return

    // Listen for agent events to update the running activities count
    const handleAgentEvent = (event: any) => {
      console.log('TabbedChatView - Agent event for count tracking:', JSON.stringify(event, null, 2))

      switch (event.type) {
        case 'tool_execution':
        case 'process_start':
        case 'background_task':
          if (event.data?.status === 'running' || !event.data?.status) {
            const currentCount = useCodexStore.getState().runningActivitiesCount
            useCodexStore.getState().setRunningActivitiesCount(currentCount + 1)
          }
          break
        case 'tool_result':
        case 'process_end':
          if (event.data?.status === 'success' || event.data?.status === 'error' || event.data?.exitCode !== undefined) {
            const currentCount = useCodexStore.getState().runningActivitiesCount
            useCodexStore.getState().setRunningActivitiesCount(Math.max(0, currentCount - 1))
          }
          break
      }
    }

    socket.on('agent_event', handleAgentEvent)

    return () => {
      socket.off('agent_event', handleAgentEvent)
    }
  }, [socket])

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'chat'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('agent')}
            className={`px-6 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'agent'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Agent Activity
            {runningActivitiesCount > 0 && activeTab !== 'agent' && (
              <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
                {runningActivitiesCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
          <ChatView socket={socket} />
        </div>
        <div className={`absolute inset-0 ${activeTab === 'agent' ? 'block' : 'hidden'}`}>
          <AgentActivityTab socket={socket} />
        </div>
      </div>
    </div>
  )
}
