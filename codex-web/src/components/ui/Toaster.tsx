import { useEffect, useState } from 'react'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  description?: string
  duration?: number
}

// Global toast state (simple implementation)
let toastListeners: Array<(toasts: Toast[]) => void> = []
let toasts: Toast[] = []

export const showToast = (toast: Omit<Toast, 'id'>) => {
  const newToast: Toast = {
    ...toast,
    id: Date.now().toString(),
    duration: toast.duration || 5000
  }
  
  toasts = [...toasts, newToast]
  toastListeners.forEach(listener => listener(toasts))
  
  // Auto-remove toast after duration
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== newToast.id)
    toastListeners.forEach(listener => listener(toasts))
  }, newToast.duration)
}

export function Toaster() {
  const [localToasts, setLocalToasts] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (newToasts: Toast[]) => setLocalToasts(newToasts)
    toastListeners.push(listener)
    
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener)
    }
  }, [])

  if (localToasts.length === 0) return null

  const getToastStyles = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white'
      case 'error':
        return 'bg-red-500 text-white'
      case 'warning':
        return 'bg-yellow-500 text-white'
      case 'info':
        return 'bg-blue-500 text-white'
    }
  }

  const getToastIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return '✓'
      case 'error':
        return '✕'
      case 'warning':
        return '⚠'
      case 'info':
        return 'ℹ'
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {localToasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            ${getToastStyles(toast.type)}
            rounded-lg shadow-lg p-4 min-w-[300px] max-w-[500px]
            animate-fade-in
          `}
        >
          <div className="flex items-start gap-3">
            <span className="text-xl">{getToastIcon(toast.type)}</span>
            <div className="flex-1">
              <h4 className="font-medium">{toast.title}</h4>
              {toast.description && (
                <p className="text-sm mt-1 opacity-90">{toast.description}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}