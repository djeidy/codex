import { useState, useEffect } from 'react'
import { useMTRStore } from '../store/useMTRStore'

interface TSGFileViewerProps {
  tsgName: string
  onBack: () => void
}

interface TSGFile {
  path: string
  name: string
  size: number
  type: string
  isDirectory: boolean
}

export function TSGFileViewer({ tsgName, onBack }: TSGFileViewerProps) {
  const [files, setFiles] = useState<TSGFile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  
  const { getTSGFiles } = useMTRStore()

  useEffect(() => {
    loadFiles()
  }, [tsgName])

  const loadFiles = async () => {
    setLoading(true)
    try {
      const tsgFiles = await getTSGFiles(tsgName)
      setFiles(tsgFiles)
    } catch (error) {
      console.error('Failed to load TSG files:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredFiles = files.filter(file => 
    file.path.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const fileTree = buildFileTree(filteredFiles)

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
        >
          ← 
        </button>
        <h3 className="text-lg font-medium flex-1">{tsgName} Files</h3>
      </div>

      <div className="mb-4">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-10 pr-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading files...</div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchQuery ? 'No files found matching your search.' : 'No files in this TSG.'}
        </div>
      ) : (
        <div className="border rounded dark:border-gray-700">
          <FileTreeNode node={fileTree} level={0} />
        </div>
      )}
    </div>
  )
}

interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  children: Map<string, FileTreeNode>
}

function buildFileTree(files: TSGFile[]): FileTreeNode {
  const root: FileTreeNode = {
    name: '/',
    path: '/',
    isDirectory: true,
    children: new Map()
  }

  for (const file of files) {
    const parts = file.path.split('/')
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDirectory: !isLast || file.isDirectory,
          size: isLast ? file.size : undefined,
          children: new Map()
        })
      }

      current = current.children.get(part)!
    }
  }

  return root
}

interface FileTreeNodeProps {
  node: FileTreeNode
  level: number
}

function FileTreeNode({ node, level }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2)

  if (node.name === '/') {
    return (
      <>
        {Array.from(node.children.values()).map((child) => (
          <FileTreeNode key={child.path} node={child} level={level} />
        ))}
      </>
    )
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
          level === 0 ? '' : 'border-t dark:border-gray-700'
        }`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => node.isDirectory && setExpanded(!expanded)}
      >
        {node.isDirectory ? '📁' : '📄'}
        <span className="flex-1">{node.name}</span>
        {node.size !== undefined && (
          <span className="text-sm text-gray-500">
            {(node.size / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
      {node.isDirectory && expanded && (
        <>
          {Array.from(node.children.values()).map((child) => (
            <FileTreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </>
      )}
    </div>
  )
}