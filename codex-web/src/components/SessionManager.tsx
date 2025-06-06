import { useState } from 'react'
import { Socket } from 'socket.io-client'
import { useMTRStore } from '../store/useMTRStore'

interface SessionManagerProps {
  socket: Socket | null
}

export function SessionManager({ socket }: SessionManagerProps) {
  const [isCreating, setIsCreating] = useState(false)
  const { sessions, activeSessionId, setActiveSession, addSession } = useMTRStore()

  const handleCreateSession = () => {
    if (!socket || isCreating) return

    setIsCreating(true)

    // Create new session
    socket.emit('start_session', {
      config: {
        provider: 'openai',
        model: 'o4-mini',
        approvalMode: 'suggest'
      }
    })

    // Listen for session creation response
    socket.once('session_created', (data: any) => {
      const newSession = {
        id: data.sessionId,
        messages: [],
        createdAt: new Date(),
        lastActivity: new Date(),
        config: data.config
      }
      
      addSession(newSession)
      setActiveSession(data.sessionId)
      setIsCreating(false)
    })
  }

  const sessionList = Array.from(sessions.values())

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4">
        <button
          onClick={handleCreateSession}
          disabled={isCreating}
          className="
            w-full px-4 py-2 rounded-lg font-medium
            bg-primary-500 hover:bg-primary-600 
            text-white
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
          "
        >
          {isCreating ? 'Creating...' : 'New Session'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessionList.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
            <p className="text-sm">No sessions yet</p>
          </div>
        ) : (
          <div className="space-y-1 px-2">
            {sessionList.map((session) => (
              <button
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className={`
                  w-full px-3 py-2 rounded text-left text-sm
                  transition-colors duration-200
                  ${activeSessionId === session.id
                    ? 'bg-primary-100 dark:bg-primary-900 text-primary-900 dark:text-primary-100'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }
                `}
              >
                <div className="font-medium">
                  Session {session.id.slice(0, 8)}
                </div>
                <div className="text-xs opacity-70">
                  {new Date(session.createdAt).toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}