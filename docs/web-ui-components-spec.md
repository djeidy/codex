# MTR Web UI Component Specifications

## Design System

### Color Palette
```css
:root {
  /* Primary Colors */
  --primary-50: #f0f9ff;
  --primary-500: #3b82f6;
  --primary-900: #1e3a8a;
  
  /* Neutral Colors */
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  
  /* Semantic Colors */
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --info: #3b82f6;
  
  /* Code Block Colors */
  --code-bg: #1e1e1e;
  --code-fg: #d4d4d4;
}
```

### Typography
```css
--font-sans: system-ui, -apple-system, sans-serif;
--font-mono: 'Fira Code', 'Cascadia Code', monospace;

/* Font Sizes */
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
```

## Component Library

### 1. ChatMessage Component

```typescript
interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'streaming' | 'complete' | 'error';
  tools?: ToolExecution[];
  approvals?: ApprovalRequest[];
}
```

**Visual Design:**
```
┌─────────────────────────────────────────────────────────┐
│ [Avatar] User                              10:23 AM     │
├─────────────────────────────────────────────────────────┤
│ Create a Python script that fetches weather data       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ [AI] Assistant                             10:23 AM     │
├─────────────────────────────────────────────────────────┤
│ I'll create a Python script to fetch weather data.     │
│                                                         │
│ [ToolCard: Creating file weather.py]                   │
│ [CodeBlock: Python code with syntax highlighting]      │
│                                                         │
│ [ApprovalCard: pip install requests]                   │
└─────────────────────────────────────────────────────────┘
```

### 2. ToolExecutionCard Component

```typescript
interface ToolExecutionCardProps {
  type: 'file_read' | 'file_write' | 'exec_command' | 'search';
  status: 'pending' | 'running' | 'success' | 'error';
  title: string;
  details?: string;
  output?: string;
  expandable?: boolean;
}
```

**States:**
```
// Pending State
┌─────────────────────────────────────────────────────────┐
│ ⏳ Reading file: src/components/Header.tsx              │
└─────────────────────────────────────────────────────────┘

// Running State
┌─────────────────────────────────────────────────────────┐
│ 🔄 Running: npm install                                 │
│ ├─ added 234 packages...                               │
│ └─ [Show more ▼]                                       │
└─────────────────────────────────────────────────────────┘

// Success State
┌─────────────────────────────────────────────────────────┐
│ ✅ Created file: weather.py                             │
│ └─ 45 lines written                                    │
└─────────────────────────────────────────────────────────┘

// Error State
┌─────────────────────────────────────────────────────────┐
│ ❌ Command failed: npm test                             │
│ ├─ Error: Test suite failed                            │
│ └─ [View full output ▼]                                │
└─────────────────────────────────────────────────────────┘
```

### 3. ApprovalCard Component

```typescript
interface ApprovalCardProps {
  id: string;
  command: string;
  riskLevel: 'low' | 'medium' | 'high';
  explanation: string;
  onApprove: () => void;
  onDeny: () => void;
  onExplain: () => void;
}
```

**Design:**
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️  Approval Required - Medium Risk                     │
├─────────────────────────────────────────────────────────┤
│ Command: rm -rf node_modules                           │
│                                                         │
│ This will delete all installed packages. You'll need   │
│ to run npm install again to restore them.              │
│                                                         │
│ [✓ Approve] [✗ Deny] [? Explain More]                 │
└─────────────────────────────────────────────────────────┘
```

### 4. StreamingText Component

```typescript
interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  showCursor?: boolean;
  speed?: number; // chars per frame
}
```

**Implementation:**
```tsx
const StreamingText: React.FC<StreamingTextProps> = ({ 
  text, 
  isStreaming, 
  showCursor = true 
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  
  // Streaming logic with requestAnimationFrame
  // Cursor blinking animation
  
  return (
    <span>
      {displayedText}
      {isStreaming && showCursor && (
        <span className={cursorVisible ? 'cursor' : 'cursor-hidden'}>▊</span>
      )}
    </span>
  );
};
```

### 5. FileTree Component

```typescript
interface FileTreeProps {
  rootPath: string;
  selectedFile?: string;
  modifiedFiles: Set<string>;
  onFileSelect: (path: string) => void;
  onFileCreate: (path: string) => void;
}
```

**Visual Design:**
```
┌─────────────────────────────────┐
│ 📁 project/                     │
│ ├─ 📁 src/                      │
│ │  ├─ 📄 index.ts              │
│ │  ├─ 📄 app.tsx •             │ <- Modified indicator
│ │  └─ 📁 components/            │
│ │     └─ 📄 Button.tsx         │
│ ├─ 📄 package.json             │
│ └─ 📄 README.md                │
└─────────────────────────────────┘
```

### 6. CodeEditor Component

```typescript
interface CodeEditorProps {
  language: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  showDiff?: boolean;
  originalValue?: string;
  theme?: 'light' | 'dark';
}
```

**Features:**
- Monaco Editor integration
- Syntax highlighting
- IntelliSense
- Diff view mode
- Minimap
- Find/Replace
- Multiple cursors

### 7. TerminalEmulator Component

```typescript
interface TerminalEmulatorProps {
  sessionId: string;
  onCommand?: (command: string) => void;
  readOnly?: boolean;
  initialDirectory?: string;
}
```

**Integration with xterm.js:**
```tsx
const TerminalEmulator: React.FC<TerminalEmulatorProps> = ({ sessionId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal>();
  
  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
      fontFamily: 'Fira Code, monospace',
      fontSize: 14,
      cursorBlink: true,
    });
    
    term.open(terminalRef.current!);
    // WebSocket integration for PTY
  }, []);
  
  return <div ref={terminalRef} className="terminal-container" />;
};
```

### 8. SessionManager Component

```typescript
interface SessionManagerProps {
  sessions: Session[];
  activeSessionId: string;
  onSessionCreate: () => void;
  onSessionSwitch: (id: string) => void;
  onSessionDelete: (id: string) => void;
}
```

**UI Design:**
```
┌─────────────────────────────────────────────┐
│ Sessions                               [+]  │
├─────────────────────────────────────────────┤
│ ● Todo App Development          10:15 AM   │
│ ○ Bug Fix #123                  Yesterday  │
│ ○ Feature: User Auth            2 days ago │
└─────────────────────────────────────────────┘
```

### 9. ProgressIndicator Component

```typescript
interface ProgressIndicatorProps {
  type: 'thinking' | 'processing' | 'executing';
  message?: string;
  progress?: number; // 0-100
  indeterminate?: boolean;
}
```

**Variants:**
```
// Thinking
[●··] Thinking...

// Processing with progress
[████████░░] Processing files (80%)

// Executing
[⟳] Executing command...
```

### 10. CommandPalette Component

```typescript
interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  recentCommands: Command[];
}
```

**Design (similar to VS Code):**
```
┌─────────────────────────────────────────────┐
│ > Type to search commands...                │
├─────────────────────────────────────────────┤
│ Recent                                      │
│ 📝 New Chat Session               Ctrl+N    │
│ 💾 Save Session                   Ctrl+S    │
│                                             │
│ Commands                                    │
│ ⚙️  Open Settings                 Ctrl+,    │
│ 🔄 Restart Agent                           │
│ 📋 Copy Last Response                      │
└─────────────────────────────────────────────┘
```

## Responsive Design Breakpoints

```css
/* Mobile First Approach */
--breakpoint-sm: 640px;   /* Small tablets */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Desktop */
--breakpoint-xl: 1280px;  /* Large screens */
--breakpoint-2xl: 1536px; /* Extra large screens */
```

### Mobile Layout (< 768px)
- Single column layout
- Collapsible sidebar
- Bottom navigation for main actions
- Swipeable panels

### Tablet Layout (768px - 1024px)
- Two column layout
- Persistent sidebar (collapsible)
- Split view for chat and editor

### Desktop Layout (> 1024px)
- Three column layout possible
- Multiple panels open simultaneously
- Drag-and-drop panel arrangement

## Accessibility Requirements

### WCAG 2.1 AA Compliance
1. **Color Contrast**: Minimum 4.5:1 for normal text
2. **Keyboard Navigation**: All interactive elements accessible
3. **Screen Reader Support**: Proper ARIA labels
4. **Focus Indicators**: Visible focus states
5. **Motion Preferences**: Respect prefers-reduced-motion

### Keyboard Shortcuts
```
Global:
- Ctrl/Cmd + K: Command palette
- Ctrl/Cmd + N: New session
- Ctrl/Cmd + S: Save session
- Ctrl/Cmd + /: Toggle sidebar
- Escape: Cancel current operation

Chat:
- Enter: Send message (single line)
- Shift + Enter: New line
- Ctrl/Cmd + Enter: Send (multi-line)
- Up/Down: Navigate history

Editor:
- Ctrl/Cmd + S: Save file
- Ctrl/Cmd + F: Find
- Ctrl/Cmd + H: Replace
- F11: Full screen
```

## Animation and Transitions

### Micro-interactions
```css
/* Smooth transitions */
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
--transition-slow: 350ms ease;

/* Spring animations */
--spring-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--spring-smooth: cubic-bezier(0.4, 0, 0.2, 1);
```

### Loading States
1. **Skeleton Screens**: For initial content load
2. **Shimmer Effects**: For loading placeholders
3. **Progress Bars**: For determinate operations
4. **Spinners**: For indeterminate operations

## Performance Optimization

### Component Optimization
1. **React.memo**: For expensive components
2. **useMemo/useCallback**: For expensive computations
3. **Virtual Scrolling**: For long lists/chat history
4. **Code Splitting**: Dynamic imports for routes
5. **Image Optimization**: Lazy loading, WebP format

### Render Optimization
```typescript
// Example: Virtualized message list
const VirtualizedChat = () => {
  const rowRenderer = useCallback(({ index, style }) => (
    <div style={style}>
      <ChatMessage {...messages[index]} />
    </div>
  ), [messages]);
  
  return (
    <AutoSizer>
      {({ height, width }) => (
        <List
          height={height}
          width={width}
          rowCount={messages.length}
          rowHeight={cache.rowHeight}
          rowRenderer={rowRenderer}
        />
      )}
    </AutoSizer>
  );
};
```

## State Management Patterns

### Zustand Store Structure
```typescript
interface CodexStore {
  // Session State
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  
  // Chat State
  messages: Message[];
  streamingMessageId: string | null;
  
  // UI State
  sidebarCollapsed: boolean;
  activePanel: 'chat' | 'files' | 'terminal';
  theme: 'light' | 'dark' | 'system';
  
  // Approval State
  approvalQueue: ApprovalRequest[];
  
  // Actions
  actions: {
    // Session actions
    createSession: () => string;
    switchSession: (id: string) => void;
    deleteSession: (id: string) => void;
    
    // Message actions
    addMessage: (message: Message) => void;
    updateMessage: (id: string, updates: Partial<Message>) => void;
    
    // UI actions
    toggleSidebar: () => void;
    setActivePanel: (panel: Panel) => void;
    
    // Approval actions
    approveCommand: (id: string) => void;
    denyCommand: (id: string) => void;
  };
}
```

## Error Handling UI

### Error Boundaries
```tsx
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div className="error-container">
    <h2>Something went wrong</h2>
    <details>
      <summary>Error details</summary>
      <pre>{error.stack}</pre>
    </details>
    <button onClick={() => window.location.reload()}>
      Reload page
    </button>
  </div>
);
```

### Toast Notifications
```typescript
interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

This specification provides a comprehensive guide for implementing the web UI components with consistent design, accessibility, and performance considerations.