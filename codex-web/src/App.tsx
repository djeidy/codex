import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { ChatView } from './components/ChatView'
import { SessionManager } from './components/SessionManager'
import { Toaster } from './components/ui/Toaster'
import { useCodexStore } from './store/useCodexStore'

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const { activeSessionId, setActiveSession } = useCodexStore()

  useEffect(() => {
    // Connect to the backend
    // In development, connect through the Vite proxy
    const socketUrl = import.meta.env.DEV ? '' : 'http://localhost:3001'
    const socketInstance = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    socketInstance.on('connect', () => {
      console.log('Connected to Codex server')
      setConnected(true)
    })

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from Codex server')
      setConnected(false)
    })

    socketInstance.on('session_created', (data) => {
      console.log('Session created:', data)
      setActiveSession(data.sessionId)
    })

    socketInstance.on('error', (error) => {
      console.error('Socket error:', error)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [setActiveSession])

  if (!connected) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Connecting to Codex server...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">OpenAI Codex</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Web UI</p>
        </div>
        
        <SessionManager socket={socket} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {activeSessionId ? (
          <ChatView socket={socket} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Welcome to OpenAI Codex
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Create a new session to start chatting
              </p>
            </div>
          </div>
        )}
      </div>

      <Toaster />
    </div>
  )
}

export default App