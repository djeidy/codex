import { useState, useEffect } from 'react'
import { useMTRStore } from '../store/useMTRStore'
import { TSGCreator } from './TSGCreator'
import { TSGFileViewer } from './TSGFileViewer'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'tsgs'>('tsgs')
  const [showCreator, setShowCreator] = useState(false)
  const [selectedTSG, setSelectedTSG] = useState<string | null>(null)
  
  const {
    tsgs,
    activeTSG,
    fetchTSGs,
    selectTSG,
    deleteTSG,
    config,
    updateConfig,
    theme,
    setTheme
  } = useMTRStore()

  useEffect(() => {
    if (isOpen) {
      fetchTSGs()
    }
  }, [isOpen, fetchTSGs])

  if (!isOpen) return null

  const handleCreateTSG = () => {
    setShowCreator(true)
  }

  const handleSelectTSG = async (tsgName: string | null) => {
    await selectTSG(tsgName)
  }

  const handleDeleteTSG = async (tsgName: string) => {
    if (confirm(`Are you sure you want to delete TSG "${tsgName}"?`)) {
      await deleteTSG(tsgName)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <span className="emoji-icon">✕</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700">
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'general'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-600 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'tsgs'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-600 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('tsgs')}
          >
            Troubleshooting Guides
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {activeTab === 'general' && (
            <div className="space-y-4">
              {/* Model Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <select
                  value={config.model || 'gpt-4'}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="gpt-4">GPT-4</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="claude-2">Claude 2</option>
                </select>
              </div>

              {/* Theme */}
              <div>
                <label className="block text-sm font-medium mb-2">Theme</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')}
                  className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'tsgs' && (
            <div>
              {showCreator ? (
                <TSGCreator
                  onClose={() => setShowCreator(false)}
                  onSuccess={() => {
                    setShowCreator(false)
                    fetchTSGs()
                  }}
                />
              ) : selectedTSG ? (
                <TSGFileViewer
                  tsgName={selectedTSG}
                  onBack={() => setSelectedTSG(null)}
                />
              ) : (
                <div>
                  {/* TSG List Header */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium">Troubleshooting Guides</h3>
                    <button
                      onClick={handleCreateTSG}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      + Create New TSG
                    </button>
                  </div>

                  {/* TSG List */}
                  <div className="space-y-2">
                    {tsgs.length === 0 ? (
                      <p className="text-gray-600 dark:text-gray-400 text-center py-8">
                        No troubleshooting guides created yet.
                      </p>
                    ) : (
                      tsgs.map((tsg) => (
                        <div
                          key={tsg.name}
                          className="flex items-center justify-between p-3 border rounded hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700"
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="activeTSG"
                              checked={activeTSG === tsg.name}
                              onChange={() => handleSelectTSG(tsg.name)}
                              className="w-4 h-4"
                            />
                            <div>
                              <h4 className="font-medium">{tsg.name}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {tsg.fileCount} files • {(tsg.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedTSG(tsg.name)}
                              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                              title="View files"
                            >
                              <span className="emoji-icon">📁</span>
                            </button>
                            <button
                              onClick={() => handleDeleteTSG(tsg.name)}
                              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600"
                              title="Delete TSG"
                            >
                              <span className="emoji-icon">🗑️</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Active TSG Indicator */}
                  {activeTSG && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 rounded">
                      <p className="text-sm">
                        <strong>Active TSG:</strong> {activeTSG}
                        <button
                          onClick={() => handleSelectTSG(null)}
                          className="ml-2 text-blue-600 hover:underline"
                        >
                          Deactivate
                        </button>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}