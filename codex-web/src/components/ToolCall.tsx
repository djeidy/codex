interface ToolCallProps {
  tool: {
    id: string
    name: string
    arguments?: string
    status: 'pending' | 'running' | 'success' | 'error'
    output?: string
    metadata?: any
  }
}

export function ToolCall({ tool }: ToolCallProps) {
  const getStatusIcon = () => {
    switch (tool.status) {
      case 'pending':
        return '⏳'
      case 'running':
        return '🔄'
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      default:
        return '❓'
    }
  }

  const formatCommand = () => {
    try {
      const args = JSON.parse(tool.arguments || '{}')
      if (args.command && Array.isArray(args.command)) {
        return args.command.join(' ')
      }
      return tool.name
    } catch {
      return tool.name
    }
  }

  return (
    <div className="mt-2 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden animate-fade-in">
      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{getStatusIcon()}</span>
            <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{formatCommand()}</span>
          </div>
          {tool.status === 'running' && (
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
          )}
        </div>
      </div>
      {tool.output && (
        <div className="bg-gray-900 px-3 py-2">
          <pre className="text-xs text-gray-100 overflow-x-auto whitespace-pre-wrap">
            {tool.output}
          </pre>
        </div>
      )}
    </div>
  )
}