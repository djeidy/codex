import { useState, useRef } from 'react'

interface FileUploaderProps {
  onUpload: (files: File[]) => Promise<void>
  maxSize?: number // in MB
  accept?: string
  multiple?: boolean
}

export function FileUploader({ 
  onUpload, 
  maxSize = 50, 
  accept = '.log,.txt,.json,.csv,.xml',
  multiple = true 
}: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success'>('idle')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFiles(files)
  }

  const handleFiles = (files: File[]) => {
    // Validate file sizes
    const maxSizeBytes = maxSize * 1024 * 1024
    const validFiles = files.filter(file => {
      if (file.size > maxSizeBytes) {
        alert(`File ${file.name} exceeds maximum size of ${maxSize}MB`)
        return false
      }
      return true
    })

    setSelectedFiles(validFiles)
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return

    setUploadStatus('uploading')
    
    try {
      await onUpload(selectedFiles)
      setUploadStatus('success')
      
      setTimeout(() => {
        setSelectedFiles([])
        setUploadStatus('idle')
      }, 2000)
    } catch (error) {
      setUploadStatus('idle')
      alert('Failed to upload files')
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index))
  }

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0)

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${dragActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
          }
        `}
      >
        {uploadStatus === 'success' ? (
          <>
            <div className="text-4xl mb-3 text-green-500">✓</div>
            <p className="text-sm text-green-600 dark:text-green-400">
              Files uploaded successfully!
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-3 text-gray-400">📤</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drop log files here or click to browse
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Supported: {accept} (max {maxSize}MB per file)
            </p>
          </>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        accept={accept}
        multiple={multiple}
        className="hidden"
      />

      {selectedFiles.length > 0 && uploadStatus !== 'success' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">
              Selected Files ({selectedFiles.length})
            </h4>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: {(totalSize / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <span className="text-sm">📄</span>
                <span className="flex-1 text-sm truncate">{file.name}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(index)
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleUpload}
            disabled={uploadStatus === 'uploading'}
            className="w-full mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {uploadStatus === 'uploading' ? 'Uploading...' : `Upload ${selectedFiles.length} Files`}
          </button>
        </div>
      )}
    </div>
  )
}