import { create } from 'zustand'
import { Socket } from 'socket.io-client'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  status?: 'streaming' | 'complete' | 'error'
  tools?: ToolExecution[]
}

interface ToolExecution {
  id: string
  name: string
  arguments: any
  status: 'pending' | 'running' | 'success' | 'error'
  output?: string
  metadata?: any
}

interface ApprovalRequest {
  id: string
  command: string
  commandArray: string[]
  applyPatch?: any
  timestamp: Date
}

interface AgentActivity {
  id: string
  type: 'shell_command' | 'tool_call' | 'process' | 'background_task'
  name: string
  command?: string
  arguments?: any
  status: 'running' | 'success' | 'error' | 'pending'
  output?: string
  startTime: Date
  endTime?: Date
  duration?: number
  metadata?: any
}

interface AgentProcess {
  id: string
  data: any
}

interface Session {
  id: string
  messages: Message[]
  createdAt: Date
  lastActivity: Date
  config: {
    model: string
    provider: string
    approvalMode?: string
  }
}

interface TSG {
  name: string
  fileCount: number
  createdAt: string
  size: number
  description?: string
}

interface TSGFile {
  path: string
  name: string
  size: number
  type: string
  isDirectory: boolean
}

interface SessionFile {
  name: string
  path: string
  size: number
  uploadedAt: string
  type: string
}

interface MTRStore {
  // Socket
  socket: Socket | null
  setSocket: (socket: Socket | null) => void

  // Session State
  sessions: Map<string, Session>
  activeSessionId: string | null

  // Chat State
  messages: Message[]
  streamingMessageId: string | null
  draftMessage: string

  // UI State
  sidebarCollapsed: boolean
  activePanel: 'chat' | 'files' | 'terminal'
  theme: 'light' | 'dark' | 'system'

  // Approval State
  approvalQueue: ApprovalRequest[]

  // Agent Activity State
  agentActivities: AgentActivity[]
  agentProcesses: Map<string, AgentProcess>
  runningActivitiesCount: number
  
  // TSG state
  tsgs: TSG[]
  activeTSG: string | null
  sessionFiles: SessionFile[]
  sessionFileStats: {
    totalSize: number
    count: number
  }
  
  // Settings state
  isSettingsOpen: boolean
  config: {
    model?: string
    theme?: string
    [key: string]: any
  }
  
  // Actions
  // Session actions
  setActiveSession: (id: string | null) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  
  // Message actions
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  setStreamingMessageId: (id: string | null) => void
  setDraftMessage: (message: string) => void
  
  // UI actions
  toggleSidebar: () => void
  setActivePanel: (panel: 'chat' | 'files' | 'terminal') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  
  // Approval actions
  addApprovalRequest: (request: ApprovalRequest) => void
  removeApprovalRequest: (id: string) => void
  clearApprovalQueue: () => void

  // Agent Activity actions
  addAgentActivity: (activity: AgentActivity) => void
  updateAgentActivity: (id: string, updates: Partial<AgentActivity>) => void
  clearAgentActivities: () => void
  setRunningActivitiesCount: (count: number) => void

  // Agent Process actions
  addAgentProcess: (processId: string, data: any) => void
  removeAgentProcess: (processId: string) => void
  clearAgentProcesses: () => void
  
  // TSG actions
  fetchTSGs: () => Promise<void>
  createTSG: (name: string, description: string, files: any[]) => Promise<void>
  selectTSG: (name: string | null) => Promise<void>
  deleteTSG: (name: string) => Promise<void>
  getTSGFiles: (name: string) => Promise<TSGFile[]>
  
  // Session file actions
  uploadSessionFiles: (files: File[]) => Promise<void>
  fetchSessionFiles: () => Promise<void>
  deleteSessionFile: (fileName: string) => Promise<void>
  previewSessionFile: (fileName: string, lines?: number) => Promise<{
    fileName: string
    content: string
    truncated: boolean
  }>
  
  // Settings actions
  setSettingsOpen: (open: boolean) => void
  updateConfig: (config: Partial<MTRStore['config']>) => void
}

export const useMTRStore = create<MTRStore>((set, get) => ({
  // Initial state
  socket: null,
  sessions: new Map(),
  activeSessionId: null,
  messages: [],
  streamingMessageId: null,
  draftMessage: '',
  sidebarCollapsed: false,
  activePanel: 'chat',
  theme: (localStorage.getItem('mtr-theme') as 'light' | 'dark' | 'system') || 'system',
  approvalQueue: [],
  agentActivities: [],
  agentProcesses: new Map(),
  runningActivitiesCount: 0,
  tsgs: [],
  activeTSG: null,
  sessionFiles: [],
  sessionFileStats: {
    totalSize: 0,
    count: 0
  },
  isSettingsOpen: false,
  config: {},
  
  // Socket actions
  setSocket: (socket) => set({ socket }),
  
  // Session actions
  setActiveSession: (id) => {
    const session = id ? get().sessions.get(id) : null
    set({ 
      activeSessionId: id,
      messages: session ? session.messages : []
    })
  },
  
  addSession: (session) => set((state) => {
    const newSessions = new Map(state.sessions)
    newSessions.set(session.id, session)
    return { sessions: newSessions }
  }),
  
  removeSession: (id) => set((state) => {
    const newSessions = new Map(state.sessions)
    newSessions.delete(id)
    return { 
      sessions: newSessions,
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId
    }
  }),
  
  // Message actions
  addMessage: (message) => set((state) => {
    console.log('Store: Adding message:', JSON.stringify(message, null, 2))
    console.log('Store: Current messages count:', state.messages.length)

    const newMessages = [...state.messages, message]
    console.log('Store: New messages count:', newMessages.length)

    // Update session if active
    if (state.activeSessionId) {
      const session = state.sessions.get(state.activeSessionId)
      if (session) {
        const updatedSession = {
          ...session,
          messages: newMessages,
          lastActivity: new Date()
        }
        const newSessions = new Map(state.sessions)
        newSessions.set(state.activeSessionId, updatedSession)
        console.log('Store: Updated session with new messages')
        return { messages: newMessages, sessions: newSessions }
      }
    }

    return { messages: newMessages }
  }),
  
  updateMessage: (id, updates) => set((state) => {
    console.log('Store: Updating message:', id, 'with updates:', JSON.stringify(updates, null, 2))

    const newMessages = state.messages.map(msg =>
      msg.id === id ? { ...msg, ...updates } : msg
    )

    console.log('Store: Updated messages count:', newMessages.length)

    // Update session if active
    if (state.activeSessionId) {
      const session = state.sessions.get(state.activeSessionId)
      if (session) {
        const updatedSession = {
          ...session,
          messages: newMessages,
          lastActivity: new Date()
        }
        const newSessions = new Map(state.sessions)
        newSessions.set(state.activeSessionId, updatedSession)
        console.log('Store: Updated session with modified messages')
        return { messages: newMessages, sessions: newSessions }
      }
    }

    return { messages: newMessages }
  }),
  
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),

  setDraftMessage: (message) => set({ draftMessage: message }),

  // UI actions
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setTheme: (theme) => {
    localStorage.setItem('mtr-theme', theme)
    set({ theme })
  },
  
  // Approval actions
  addApprovalRequest: (request) => set((state) => ({
    approvalQueue: [...state.approvalQueue, request]
  })),
  
  removeApprovalRequest: (id) => set((state) => ({
    approvalQueue: state.approvalQueue.filter(r => r.id !== id)
  })),
  
  clearApprovalQueue: () => set({ approvalQueue: [] }),

  // Agent Activity actions
  addAgentActivity: (activity) => set((state) => ({
    agentActivities: [...state.agentActivities, activity]
  })),

  updateAgentActivity: (id, updates) => set((state) => ({
    agentActivities: state.agentActivities.map(activity => {
      if (activity.id === id) {
        const updatedActivity = { ...activity, ...updates }
        // Calculate duration if endTime is provided and startTime exists
        if (updates.endTime && activity.startTime && !updates.duration) {
          updatedActivity.duration = updates.endTime.getTime() - activity.startTime.getTime()
        }
        return updatedActivity
      }
      return activity
    })
  })),

  clearAgentActivities: () => set({ agentActivities: [] }),

  setRunningActivitiesCount: (count) => set({ runningActivitiesCount: count }),

  // Agent Process actions
  addAgentProcess: (processId, data) => set((state) => {
    const newProcesses = new Map(state.agentProcesses)
    newProcesses.set(processId, { id: processId, data })
    return { agentProcesses: newProcesses }
  }),

  removeAgentProcess: (processId) => set((state) => {
    const newProcesses = new Map(state.agentProcesses)
    newProcesses.delete(processId)
    return { agentProcesses: newProcesses }
  }),

  clearAgentProcesses: () => set({ agentProcesses: new Map() }),
  
  // TSG actions
  fetchTSGs: async () => {
    const socket = get().socket
    if (!socket) return
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:list',
        sessionId: get().activeSessionId
      })
      
      socket.once('message', (response: any) => {
        if (response.type === 'tsg:list:response') {
          set({
            tsgs: response.data.tsgs,
            activeTSG: response.data.activeTSG
          })
          resolve()
        }
      })
    })
  },
  
  createTSG: async (name: string, description: string, files: any[]) => {
    const socket = get().socket
    if (!socket) {
      throw new Error('No socket connection')
    }
    
    console.log('Creating TSG:', { name, description, fileCount: files.length })
    
    // First create the TSG
    await new Promise((resolve, reject) => {
      let responseReceived = false
      
      const messageHandler = (response: any) => {
        console.log('TSG create response received:', response)
        responseReceived = true
        
        if (response.type === 'tsg:create:success') {
          socket.off('message', messageHandler)
          clearTimeout(timeoutId)
          resolve(response)
        } else if (response.type === 'error') {
          socket.off('message', messageHandler)
          clearTimeout(timeoutId)
          reject(new Error(response.message))
        }
      }
      
      socket.on('message', messageHandler)
      
      console.log('Emitting tsg:create message')
      socket.emit('message', {
        type: 'tsg:create',
        sessionId: get().activeSessionId,
        data: { name, description }
      })
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        socket.off('message', messageHandler)
        if (!responseReceived) {
          console.error('TSG create timeout - no response received')
          reject(new Error('TSG creation timeout'))
        }
      }, 30000) // 30 second timeout
    })
    
    // Then upload files if any
    if (files.length > 0) {
      console.log('Uploading files to TSG')
      await new Promise((resolve, reject) => {
        let responseReceived = false
        
        const messageHandler = (response: any) => {
          console.log('TSG upload response received:', response)
          responseReceived = true
          
          if (response.type === 'tsg:upload:success') {
            socket.off('message', messageHandler)
            clearTimeout(timeoutId)
            resolve(response)
          } else if (response.type === 'error') {
            socket.off('message', messageHandler)
            clearTimeout(timeoutId)
            reject(new Error(response.message))
          }
        }
        
        socket.on('message', messageHandler)
        
        socket.emit('message', {
          type: 'tsg:upload',
          sessionId: get().activeSessionId,
          data: { tsgName: name, files }
        })
        
        // Set timeout
        const timeoutId = setTimeout(() => {
          socket.off('message', messageHandler)
          if (!responseReceived) {
            console.error('TSG upload timeout - no response received')
            reject(new Error('TSG upload timeout'))
          }
        }, 60000) // 60 second timeout for uploads
      })
    }
    
    // Refresh TSG list after creation
    await get().fetchTSGs()
  },
  
  selectTSG: async (name: string | null) => {
    const socket = get().socket
    if (!socket) return
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:select',
        sessionId: get().activeSessionId,
        data: { name }
      })
      
      socket.once('message', (response: any) => {
        if (response.type === 'tsg:select:success') {
          set({ activeTSG: name })
          resolve()
        }
      })
    })
  },
  
  deleteTSG: async (name: string) => {
    const socket = get().socket
    if (!socket) return
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:delete',
        sessionId: get().activeSessionId,
        data: { name }
      })
      
      socket.once('message', (response: any) => {
        if (response.type === 'tsg:delete:success') {
          resolve()
        }
      })
    })
  },
  
  getTSGFiles: async (name: string) => {
    const socket = get().socket
    if (!socket) return []
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'tsg:get-files',
        sessionId: get().activeSessionId,
        data: { name }
      })
      
      socket.once('message', (response: any) => {
        if (response.type === 'tsg:files:response') {
          resolve(response.data.files)
        }
      })
    })
  },
  
  uploadSessionFiles: async (files: File[]) => {
    const socket = get().socket
    if (!socket) {
      throw new Error('No socket connection available')
    }
    
    const sessionId = get().activeSessionId
    if (!sessionId) {
      throw new Error('No active session')
    }
    
    console.log(`Uploading ${files.length} files to session ${sessionId}`)
    
    // Upload files one by one to avoid overwhelming the connection
    for (const file of files) {
      console.log(`Processing file: ${file.name}, size: ${file.size} bytes`)
      
      // For large files, we should chunk them
      const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
      const isLargeFile = file.size > CHUNK_SIZE
      
      if (isLargeFile) {
        console.log(`File ${file.name} is large (${(file.size / 1024 / 1024).toFixed(2)}MB), will upload in chunks`)
        
        // For now, let's just upload the whole file but with better error handling
        // TODO: Implement actual chunked upload
      }
      
      const content = await fileToBase64(file)
      console.log(`Base64 content length for ${file.name}: ${content.length}`)
      
      const processedFile = {
        name: file.name,
        content: content,
        type: file.type,
        size: file.size
      }
      
      await new Promise((resolve, reject) => {
        const uploadMessage = {
          type: 'session:upload',
          sessionId: sessionId,
          data: { files: [processedFile] } // Upload one file at a time
        }
        
        console.log('Socket connected:', socket.connected)
        console.log('Socket ID:', socket.id)
        console.log(`Emitting session:upload message for file: ${file.name}`)
        
        // Emit message with acknowledgment callback
        socket.emit('message', uploadMessage, (ack: any) => {
          console.log('Message acknowledged by server:', ack)
        })
        
        // Track if we've received a response
        let responseReceived = false
        let timeoutId: NodeJS.Timeout
        
        // Set up a single message handler that checks message types
        const messageHandler = (response: any) => {
          console.log('Upload response received:', response)
          responseReceived = true
          
          switch (response.type) {
            case 'session:upload:success':
              console.log('Upload successful')
              // Remove the listener after success
              socket.off('message', messageHandler)
              socket.off('error', errorHandler)
              clearTimeout(timeoutId)
              resolve(undefined)
              break
              
            case 'session:files:updated':
              console.log('Files updated:', response.data.files.length, 'files')
              set({ sessionFiles: response.data.files })
              break
              
            case 'error':
              console.error('Upload error:', response.message)
              // Remove the listener on error
              socket.off('message', messageHandler)
              socket.off('error', errorHandler)
              clearTimeout(timeoutId)
              reject(new Error(response.message))
              break
          }
        }
        
        // Also listen for any errors
        const errorHandler = (error: any) => {
          console.error('Socket error during upload:', error)
          socket.off('message', messageHandler)
          socket.off('error', errorHandler)
          clearTimeout(timeoutId)
          reject(new Error('Socket error: ' + (error.message || error)))
        }
        
        // Listen for messages
        socket.on('message', messageHandler)
        socket.on('error', errorHandler)
        
        // Set a timeout to clean up the listener - increase for large files
        const timeoutDuration = isLargeFile ? 60000 : 30000 // 60s for large files, 30s for normal
        timeoutId = setTimeout(() => {
          socket.off('message', messageHandler)
          socket.off('error', errorHandler)
          if (!responseReceived) {
            console.error('Upload timeout - no response received')
            console.error('Socket still connected:', socket.connected)
          }
          reject(new Error('Upload timeout'))
        }, timeoutDuration)
      })
    }
  },
  
  fetchSessionFiles: async () => {
    const socket = get().socket
    if (!socket) return
    
    return new Promise((resolve) => {
      socket.emit('message', {
        type: 'session:file:list',
        sessionId: get().activeSessionId
      })
      
      socket.once('message', (response: any) => {
        if (response.type === 'session:file:list:response') {
          set({
            sessionFiles: response.data.files,
            sessionFileStats: {
              totalSize: response.data.totalSize,
              count: response.data.count
            }
          })
          resolve()
        }
      })
    })
  },
  
  deleteSessionFile: async (fileName: string) => {
    const socket = get().socket
    if (!socket) return
    
    return new Promise((resolve, reject) => {
      socket.emit('message', {
        type: 'session:file:delete',
        sessionId: get().activeSessionId,
        data: { fileName }
      })
      
      // Set up a single message handler that checks message types
      const messageHandler = (response: any) => {
        switch (response.type) {
          case 'session:file:delete:success':
            // Update local state
            set(state => ({
              sessionFiles: state.sessionFiles.filter(f => f.name !== fileName)
            }))
            // Remove the listener after success
            socket.off('message', messageHandler)
            resolve()
            break
            
          case 'session:files:updated':
            set({ sessionFiles: response.data.files })
            break
            
          case 'error':
            // Remove the listener on error
            socket.off('message', messageHandler)
            reject(new Error(response.message))
            break
        }
      }
      
      // Listen for messages
      socket.on('message', messageHandler)
      
      // Set a timeout to clean up the listener
      setTimeout(() => {
        socket.off('message', messageHandler)
        reject(new Error('Delete timeout'))
      }, 30000) // 30 second timeout
    })
  },
  
  previewSessionFile: async (fileName: string, lines: number = 50) => {
    const socket = get().socket
    if (!socket) throw new Error('No socket connection')
    
    return new Promise((resolve, reject) => {
      socket.emit('message', {
        type: 'session:file:preview',
        sessionId: get().activeSessionId,
        data: { fileName, lines }
      })
      
      socket.once('message', (response: any) => {
        if (response.type === 'session:file:preview:response') {
          resolve(response.data)
        } else if (response.type === 'error') {
          reject(new Error(response.message))
        }
      })
    })
  },
  
  setSettingsOpen: (open: boolean) => set({ isSettingsOpen: open }),
  
  updateConfig: (config: Partial<MTRStore['config']>) => {
    set(state => ({
      config: { ...state.config, ...config }
    }))
    
    // Optionally persist to backend
    const socket = get().socket
    if (socket) {
      socket.emit('message', {
        type: 'config:update',
        sessionId: get().activeSessionId,
        data: config
      })
    }
  }
}))

// Helper function
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const base64 = reader.result as string
      const base64Content = base64.split(',')[1]
      resolve(base64Content)
    }
    reader.onerror = reject
  })
}