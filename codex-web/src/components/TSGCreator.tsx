import { useState, useRef } from 'react'
import { useMTRStore } from '../store/useMTRStore'

interface TSGCreatorProps {
  onClose: () => void
  onSuccess: () => void
}

interface FileItem {
  path: string
  file: File
  size: number
}

export function TSGCreator({ onClose, onSuccess }: TSGCreatorProps) {
  const [tsgName, setTsgName] = useState('')
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const { createTSG } = useMTRStore()

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const fileItems: FileItem[] = []

    for (const file of selectedFiles) {
      // Get relative path from webkitRelativePath
      const relativePath = (file as any).webkitRelativePath || file.name
      
      fileItems.push({
        path: relativePath,
        file: file,
        size: file.size
      })
    }

    setFiles(fileItems)
    setError(null)
  }

  const handleCreateTSG = async () => {
    if (!tsgName.trim()) {
      setError('Please enter a TSG name')
      return
    }

    if (files.length === 0) {
      setError('Please select files to upload')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      console.log('TSGCreator: Starting TSG creation', { tsgName, description, fileCount: files.length })
      
      // Convert files to base64 for upload
      const processedFiles = await Promise.all(
        files.map(async (item) => {
          const content = await fileToBase64(item.file)
          return {
            path: item.path,
            content: content,
            type: item.file.type,
            size: item.size
          }
        })
      )

      console.log('TSGCreator: Files processed, calling createTSG')
      await createTSG(tsgName, description, processedFiles)
      console.log('TSGCreator: TSG created successfully')
      onSuccess()
    } catch (err: any) {
      console.error('TSGCreator: Error creating TSG:', err)
      setError(err.message || 'Failed to create TSG')
    } finally {
      setIsUploading(false)
    }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64 = reader.result as string
        // Remove data URL prefix
        const base64Content = base64.split(',')[1]
        resolve(base64Content)
      }
      reader.onerror = reject
    })
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Create New TSG</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300 rounded flex items-center gap-2">
          ⚠️ {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">TSG Name</label>
        <input
          type="text"
          value={tsgName}
          onChange={(e) => setTsgName(e.target.value)}
          placeholder="e.g., Meeting Room Team TSG"
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          maxLength={100}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">
          Description (optional)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of this TSG"
          className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Upload Folder</label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-gray-400 cursor-pointer"
        >
          <div className="text-4xl mb-3 text-gray-400">📁</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Click to select a folder to upload
          </p>
          <p className="text-xs text-gray-500 mt-1">
            All files and subfolders will be included
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFolderSelect}
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">
            Selected Files ({files.length} files, {(totalSize / 1024 / 1024).toFixed(2)} MB)
          </h4>
          <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
            {files.map((item, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                {item.path.endsWith('/') ? '📁' : '📄'}
                <span className="truncate flex-1">{item.path}</span>
                <span className="text-gray-500">
                  {(item.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="px-4 py-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
          disabled={isUploading}
        >
          Cancel
        </button>
        <button
          onClick={handleCreateTSG}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          disabled={isUploading || !tsgName.trim() || files.length === 0}
        >
          {isUploading ? 'Creating...' : 'Create TSG'}
        </button>
      </div>
    </div>
  )
}

// Add to HTML to enable directory selection
declare module 'react' {
  interface HTMLAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    webkitdirectory?: string
    directory?: string
  }
}