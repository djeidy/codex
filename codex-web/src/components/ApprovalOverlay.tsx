interface ApprovalOverlayProps {
  approval: {
    id: string
    command: string
    commandArray: string[]
    applyPatch?: any
    timestamp: Date
  }
  onApprove: (id: string) => void
  onDeny: (id: string) => void
}

export function ApprovalOverlay({ approval, onApprove, onDeny }: ApprovalOverlayProps) {
  const getRiskLevel = (command: string) => {
    // Simple risk assessment based on command
    if (command.includes('rm') || command.includes('delete')) return 'high'
    if (command.includes('install') || command.includes('npm')) return 'medium'
    return 'low'
  }

  const riskLevel = getRiskLevel(approval.command)
  const riskColors = {
    low: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    medium: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    high: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
  }

  return (
    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 animate-fade-in">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Approval Required
            </h3>
          </div>

          <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mb-4 ${riskColors[riskLevel]}`}>
            {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
          </div>

          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              The AI wants to execute the following command:
            </p>
            <div className="bg-gray-100 dark:bg-gray-900 rounded p-3 font-mono text-sm">
              {approval.command}
            </div>
          </div>

          {approval.applyPatch && (
            <div className="mb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                This command will apply file changes.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => onApprove(approval.id)}
              className="
                flex-1 px-4 py-2 rounded-lg font-medium
                bg-primary-500 hover:bg-primary-600 
                text-white
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
              "
            >
              Approve
            </button>
            <button
              onClick={() => onDeny(approval.id)}
              className="
                flex-1 px-4 py-2 rounded-lg font-medium
                bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600
                text-gray-900 dark:text-gray-100
                transition-colors duration-200
                focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
              "
            >
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}