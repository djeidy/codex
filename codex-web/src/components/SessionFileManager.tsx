import { useState, useEffect } from 'react';
import { FileText, Trash2, Eye, Download, Search } from 'lucide-react';
import { useMTRStore } from '../store/useMTRStore';

export function SessionFileManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    fileName: string;
    content: string;
    truncated: boolean;
  } | null>(null);
  
  const {
    sessionFiles,
    fetchSessionFiles,
    deleteSessionFile,
    previewSessionFile
  } = useMTRStore();

  useEffect(() => {
    fetchSessionFiles();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchSessionFiles, 5000);
    return () => clearInterval(interval);
  }, [fetchSessionFiles]);

  const handleDelete = async (fileName: string) => {
    if (confirm(`Delete ${fileName}?`)) {
      await deleteSessionFile(fileName);
      if (selectedFile === fileName) {
        setSelectedFile(null);
        setPreview(null);
      }
    }
  };

  const handlePreview = async (fileName: string) => {
    setSelectedFile(fileName);
    const previewData = await previewSessionFile(fileName);
    setPreview(previewData);
  };

  const filteredFiles = sessionFiles.filter(file =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="flex h-full">
      {/* File List */}
      <div className="w-1/3 border-r dark:border-gray-700 p-4">
        <div className="mb-4">
          <h3 className="text-lg font-medium mb-2">Session Files</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full pl-10 pr-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
        </div>

        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100% - 120px)' }}>
          {filteredFiles.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              {searchQuery ? 'No files match your search' : 'No files uploaded yet'}
            </p>
          ) : (
            filteredFiles.map((file) => (
              <div
                key={file.name}
                className={`
                  p-3 border rounded cursor-pointer transition-colors
                  ${selectedFile === file.name 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' 
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700'
                  }
                `}
                onClick={() => handlePreview(file.name)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 flex-1">
                    <FileText className="w-4 h-4 mt-0.5 text-gray-500" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)} • {file.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDate(file.uploadedAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file.name);
                    }}
                    className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded text-red-600"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        {sessionFiles.length > 0 && (
          <div className="mt-4 pt-4 border-t dark:border-gray-700 text-sm text-gray-600">
            Total: {sessionFiles.length} files, {
              formatFileSize(sessionFiles.reduce((sum, f) => sum + f.size, 0))
            }
          </div>
        )}
      </div>

      {/* File Preview */}
      <div className="flex-1 p-4">
        {preview ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium">{preview.fileName}</h3>
              <div className="flex items-center gap-2">
                <button
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Download full file"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 rounded p-4">
              <pre className="text-sm font-mono whitespace-pre-wrap">
                {preview.content}
              </pre>
              {preview.truncated && (
                <p className="text-center text-gray-500 mt-4">
                  ... Preview truncated. Download file to see full content ...
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Eye className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>Select a file to preview</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}