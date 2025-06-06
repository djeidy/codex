import { useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { TabbedChatView } from './components/TabbedChatView'
import { SessionManager } from './components/SessionManager'
import { Toaster } from './components/ui/Toaster'
import { SettingsModal } from './components/SettingsModal'
import { useMTRStore } from './store/useMTRStore'

function App() {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const { activeSessionId, setActiveSession, isSettingsOpen, setSettingsOpen, setSocket: setStoreSocket, theme } = useMTRStore()

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    const applyTheme = (themeValue: 'light' | 'dark' | 'system') => {
      if (themeValue === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (prefersDark) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      } else if (themeValue === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    // Apply theme on mount and when it changes
    applyTheme(theme)

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyTheme('system')
      }
    }
    mediaQuery.addEventListener('change', handleSystemThemeChange)

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
    }
  }, [theme])

  useEffect(() => {
    // Connect to the backend
    // In development, connect through the Vite proxy
    const socketUrl = import.meta.env.DEV ? '' : 'http://localhost:3001'
    const socketInstance = io(socketUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ['polling', 'websocket'], // Try polling first for large messages
      upgrade: true,
      rememberUpgrade: true,
    })

    socketInstance.on('connect', () => {
      console.log('Connected to MTR server, socket ID:', socketInstance.id)
      setConnected(true)
    })

    socketInstance.on('disconnect', (reason) => {
      console.log('Disconnected from MTR server, reason:', reason)
      setConnected(false)
    })

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message)
    })

    socketInstance.on('session_created', (data) => {
      console.log('Session created:', data)
      setActiveSession(data.sessionId)
    })

    socketInstance.on('error', (error) => {
      console.error('Socket error:', error)
    })
    
    // Listen for all messages for debugging
    socketInstance.on('message', (message) => {
      console.log('App received message:', message.type, message)
      
      if (message.type === 'session:files:updated') {
        const store = useMTRStore.getState()
        store.fetchSessionFiles()
      }
    })

    setSocket(socketInstance)
    setStoreSocket(socketInstance) // Also set socket in the store

    return () => {
      socketInstance.disconnect()
    }
  }, [setActiveSession, setStoreSocket])

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
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">MTR Log Analyzer</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Web UI</p>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              title="Settings"
            >
              <span className="emoji-icon">⚙️</span>
            </button>
          </div>
        </div>
        
        <SessionManager socket={socket} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full">
        {activeSessionId ? (
          <TabbedChatView socket={socket} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Welcome to MTR Log Analyzer
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Create a new session to start chatting
              </p>
            </div>
          </div>
        )}
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      
      <Toaster />
    </div>
  )
}

export default App
