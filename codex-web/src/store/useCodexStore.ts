import { create } from 'zustand'

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

interface CodexStore {
  // Session State
  sessions: Map<string, Session>
  activeSessionId: string | null
  
  // Chat State
  messages: Message[]
  streamingMessageId: string | null
  
  // UI State
  sidebarCollapsed: boolean
  activePanel: 'chat' | 'files' | 'terminal'
  theme: 'light' | 'dark' | 'system'
  
  // Approval State
  approvalQueue: ApprovalRequest[]
  
  // Actions
  // Session actions
  setActiveSession: (id: string | null) => void
  addSession: (session: Session) => void
  removeSession: (id: string) => void
  
  // Message actions
  addMessage: (message: Message) => void
  updateMessage: (id: string, updates: Partial<Message>) => void
  setStreamingMessageId: (id: string | null) => void
  
  // UI actions
  toggleSidebar: () => void
  setActivePanel: (panel: 'chat' | 'files' | 'terminal') => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  
  // Approval actions
  addApprovalRequest: (request: ApprovalRequest) => void
  removeApprovalRequest: (id: string) => void
  clearApprovalQueue: () => void
}

export const useCodexStore = create<CodexStore>((set, get) => ({
  // Initial state
  sessions: new Map(),
  activeSessionId: null,
  messages: [],
  streamingMessageId: null,
  sidebarCollapsed: false,
  activePanel: 'chat',
  theme: 'system',
  approvalQueue: [],
  
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
    const newMessages = [...state.messages, message]
    
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
        return { messages: newMessages, sessions: newSessions }
      }
    }
    
    return { messages: newMessages }
  }),
  
  updateMessage: (id, updates) => set((state) => {
    const newMessages = state.messages.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    )
    
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
        return { messages: newMessages, sessions: newSessions }
      }
    }
    
    return { messages: newMessages }
  }),
  
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  
  // UI actions
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setTheme: (theme) => set({ theme }),
  
  // Approval actions
  addApprovalRequest: (request) => set((state) => ({
    approvalQueue: [...state.approvalQueue, request]
  })),
  
  removeApprovalRequest: (id) => set((state) => ({
    approvalQueue: state.approvalQueue.filter(r => r.id !== id)
  })),
  
  clearApprovalQueue: () => set({ approvalQueue: [] })
}))