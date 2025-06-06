import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface AnalysisIndicatorProps {
  status: 'idle' | 'analyzing' | 'complete' | 'error';
  fileCount?: number;
  errorCount?: number;
  warningCount?: number;
}

export function AnalysisIndicator({ 
  status, 
  fileCount = 0, 
  errorCount = 0, 
  warningCount = 0 
}: AnalysisIndicatorProps) {
  if (status === 'idle') return null;
  
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900 rounded-lg mb-2">
      {status === 'analyzing' && (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Analyzing {fileCount} files...</span>
        </>
      )}
      
      {status === 'complete' && (
        <>
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm">
            Analysis complete: {errorCount > 0 && `${errorCount} errors, `}
            {warningCount > 0 && `${warningCount} warnings`}
            {errorCount === 0 && warningCount === 0 && 'No issues found'}
          </span>
        </>
      )}
      
      {status === 'error' && (
        <>
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm">Analysis failed. Please try again.</span>
        </>
      )}
    </div>
  );
}