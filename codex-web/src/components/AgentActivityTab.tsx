import { useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { useMTRStore } from '../store/useMTRStore'

interface AgentActivityTabProps {
  socket: Socket | null
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

export function AgentActivityTab({ socket }: AgentActivityTabProps) {
  const activitiesEndRef = useRef<HTMLDivElement>(null)
  const {
    streamingMessageId,
    agentActivities,
    agentProcesses,
    addAgentActivity,
    updateAgentActivity,
    addAgentProcess,
    removeAgentProcess
  } = useMTRStore()

  // Keep track of processes for potential future use
  console.log('Current processes:', JSON.stringify(Array.from(agentProcesses.entries()), null, 2))

  useEffect(() => {
    if (!socket) return

    // Listen for various agent events
    const handleAgentEvent = (event: any) => {
      console.log('Agent Activity Tab - Agent event:', JSON.stringify(event, null, 2))

      switch (event.type) {
        case 'tool_execution':
          handleToolExecution(event.data)
          break
        case 'tool_result':
          handleToolResult(event.data)
          break
        case 'process_start':
          handleProcessStart(event.data)
          break
        case 'process_output':
          handleProcessOutput(event.data)
          break
        case 'process_end':
          handleProcessEnd(event.data)
          break
        case 'background_task':
          handleBackgroundTask(event.data)
          break
      }
    }

    socket.on('agent_event', handleAgentEvent)

    return () => {
      socket.off('agent_event', handleAgentEvent)
    }
  }, [socket, addAgentActivity, updateAgentActivity, addAgentProcess, removeAgentProcess, agentActivities])

  const handleToolExecution = (data: any) => {
    const activity: AgentActivity = {
      id: data.id || `tool-${Date.now()}`,
      type: data.name === 'shell' || data.name === 'container.exec' ? 'shell_command' : 'tool_call',
      name: data.name,
      command: data.name === 'shell' || data.name === 'container.exec' ? data.arguments?.cmd : undefined,
      arguments: data.arguments,
      status: 'running',
      startTime: new Date(),
      metadata: data
    }

    addAgentActivity(activity)
  }

  const handleToolResult = (data: any) => {
    updateAgentActivity(data.id, {
      status: data.status === 'success' ? 'success' : 'error',
      output: data.output,
      endTime: new Date(),
      duration: undefined // Will be calculated based on startTime in the update function
    })
  }

  const handleProcessStart = (data: any) => {
    const activity: AgentActivity = {
      id: data.processId || `process-${Date.now()}`,
      type: 'process',
      name: `Process ${data.processId}`,
      command: data.command,
      status: 'running',
      startTime: new Date(),
      metadata: data
    }

    addAgentActivity(activity)
    addAgentProcess(data.processId, data)
  }

  const handleProcessOutput = (data: any) => {
    // Find the current activity to get existing output
    const currentActivity = agentActivities.find(a => a.id === data.processId)
    updateAgentActivity(data.processId, {
      output: (currentActivity?.output || '') + data.output
    })
  }

  const handleProcessEnd = (data: any) => {
    updateAgentActivity(data.processId, {
      status: data.exitCode === 0 ? 'success' : 'error',
      endTime: new Date(),
      duration: undefined // Will be calculated based on startTime in the update function
    })
    removeAgentProcess(data.processId)
  }

  const handleBackgroundTask = (data: any) => {
    const activity: AgentActivity = {
      id: data.id || `bg-${Date.now()}`,
      type: 'background_task',
      name: data.name || 'Background Task',
      status: data.status || 'running',
      startTime: new Date(),
      metadata: data
    }

    addAgentActivity(activity)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
      case 'success':
        return <span className="text-green-500">✓</span>
      case 'error':
        return <span className="text-red-500">✗</span>
      case 'pending':
        return <span className="text-yellow-500">⏳</span>
      default:
        return <span className="text-gray-500">•</span>
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'shell_command':
        return '🔧'
      case 'tool_call':
        return '⚙️'
      case 'process':
        return '🔄'
      case 'background_task':
        return '📋'
      default:
        return '•'
    }
  }

  const formatDuration = (duration?: number) => {
    if (!duration) return ''
    if (duration < 1000) return `${duration}ms`
    return `${(duration / 1000).toFixed(1)}s`
  }

  const parseShellCommand = (args: any) => {
    if (!args) return null

    try {
      // Handle both string and object arguments
      let parsedArgs = args
      if (typeof args === 'string') {
        parsedArgs = JSON.parse(args)
      }



      if (parsedArgs.command && Array.isArray(parsedArgs.command)) {
        // Extract the actual command from bash -lc "command"
        const command = parsedArgs.command
        if (command.length >= 3 && command[0] === 'bash' && command[1] === '-lc') {
          return {
            actualCommand: command[2],
            workdir: parsedArgs.workdir || parsedArgs.cwd || 'Unknown directory',
            fullCommand: command.join(' ')
          }
        }
        return {
          actualCommand: command.join(' '),
          workdir: parsedArgs.workdir || parsedArgs.cwd || 'Unknown directory',
          fullCommand: command.join(' ')
        }
      }

      if (parsedArgs.cmd) {
        return {
          actualCommand: Array.isArray(parsedArgs.cmd) ? parsedArgs.cmd.join(' ') : parsedArgs.cmd,
          workdir: parsedArgs.workdir || parsedArgs.cwd || 'Unknown directory',
          fullCommand: Array.isArray(parsedArgs.cmd) ? parsedArgs.cmd.join(' ') : parsedArgs.cmd
        }
      }
    } catch (e) {
      console.error('Error parsing shell command arguments:', e)
    }

    return null
  }

  const formatCommand = (activity: AgentActivity) => {
    if (activity.command) {
      return Array.isArray(activity.command) ? activity.command.join(' ') : activity.command
    }
    if (activity.arguments && typeof activity.arguments === 'object') {
      return JSON.stringify(activity.arguments, null, 2)
    }
    return activity.name
  }

  // Auto-scroll to bottom
  useEffect(() => {
    activitiesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentActivities])

  const runningActivities = agentActivities.filter(a => a.status === 'running')
  const isAgentThinking = streamingMessageId !== null || runningActivities.length > 0

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Agent Activity Monitor
          </h2>
          <div className="flex items-center gap-4">
            {isAgentThinking && (
              <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                <span>Agent is working...</span>
              </div>
            )}
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {runningActivities.length} active • {agentActivities.length} total
            </div>
          </div>
        </div>
      </div>

      {/* Activities List */}
      <div className="flex-1 overflow-y-auto p-6">
        {agentActivities.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-400 dark:text-gray-500 text-4xl mb-4">⚙️</div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Agent Activity Yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Agent activities like shell commands, tool calls, and background processes will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {agentActivities.map((activity) => (
              <div
                key={activity.id}
                className={`border rounded-lg overflow-hidden transition-all ${
                  activity.status === 'running' 
                    ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20' 
                    : activity.status === 'success'
                    ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                    : activity.status === 'error'
                    ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
                }`}
              >
                {/* Activity Header */}
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{getTypeIcon(activity.type)}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(activity.status)}
                          <span className="font-medium text-gray-900 dark:text-white">
                            {activity.name}
                          </span>
                          {activity.duration && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              ({formatDuration(activity.duration)})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {activity.startTime.toLocaleTimeString()}
                          {activity.endTime && ` - ${activity.endTime.toLocaleTimeString()}`}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Command/Arguments */}
                  {(activity.command || activity.arguments) && (
                    <div className="mt-2">
                      {activity.name === 'shell' && activity.arguments ? (
                        (() => {
                          const shellInfo = parseShellCommand(activity.arguments)
                          if (shellInfo) {
                            return (
                              <div className="space-y-2">
                                <div>
                                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                    Shell Command:
                                  </div>
                                  <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 overflow-x-auto">
                                    {shellInfo.actualCommand}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                    Working Directory:
                                  </div>
                                  <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 overflow-x-auto">
                                    {shellInfo.workdir}
                                  </pre>
                                </div>
                                {shellInfo.fullCommand !== shellInfo.actualCommand && (
                                  <div>
                                    <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                      Full Command:
                                    </div>
                                    <pre className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 overflow-x-auto">
                                      {shellInfo.fullCommand}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )
                          }
                          return (
                            <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 overflow-x-auto">
                              {formatCommand(activity)}
                            </pre>
                          )
                        })()
                      ) : (
                        <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1 overflow-x-auto">
                          {formatCommand(activity)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>

                {/* Output */}
                {activity.output && (
                  <div className="px-4 py-3 bg-gray-900 dark:bg-gray-950">
                    <pre className="text-xs text-gray-100 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {activity.output}
                    </pre>
                  </div>
                )}
              </div>
            ))}
            <div ref={activitiesEndRef} />
          </div>
        )}
      </div>
    </div>
  )
}
