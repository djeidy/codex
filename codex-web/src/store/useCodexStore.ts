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

interface CodexStore {
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
}

export const useCodexStore = create<CodexStore>((set, get) => ({
  // Initial state
  sessions: new Map(),
  activeSessionId: null,
  messages: [],
  streamingMessageId: null,
  draftMessage: '',
  sidebarCollapsed: false,
  activePanel: 'chat',
  theme: 'system',
  approvalQueue: [],
  agentActivities: [],
  agentProcesses: new Map(),
  runningActivitiesCount: 0,
  
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
  setTheme: (theme) => set({ theme }),
  
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

  clearAgentProcesses: () => set({ agentProcesses: new Map() })
}))