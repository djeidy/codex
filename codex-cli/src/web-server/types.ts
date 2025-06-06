// TSG-related message types
export interface TSGMessage {
  type: 'tsg:create' | 'tsg:list' | 'tsg:select' | 'tsg:delete' | 'tsg:upload' | 'tsg:get-files';
  sessionId: string;
  data?: {
    name?: string | null;
    tsgName?: string;
    files?: Array<{
      path?: string;
      name?: string;
      content?: string;
      type?: string;
      size?: number;
    }>;
  };
}

export interface TSGCreateMessage extends TSGMessage {
  type: 'tsg:create';
  data: {
    name: string;
    description?: string;
  };
}

export interface TSGSelectMessage extends TSGMessage {
  type: 'tsg:select';
  data: {
    name: string | null; // null to deselect
  };
}

export interface TSGUploadMessage extends TSGMessage {
  type: 'tsg:upload';
  data: {
    tsgName: string;
    files: Array<{
      path: string;
      content: string; // Base64 encoded
      type: string;
      size: number;
    }>;
  };
}

// Session file upload message
export interface SessionFileUploadMessage {
  type: 'session:upload';
  sessionId: string;
  data: {
    files: Array<{
      name: string;
      content: string; // Base64 encoded
      type: string;
      size: number;
    }>;
  };
}

// Session file management messages
export interface SessionFileDeleteMessage {
  type: 'session:file:delete';
  sessionId: string;
  data: {
    fileName: string;
  };
}

export interface SessionFileListMessage {
  type: 'session:file:list';
  sessionId: string;
}

export interface SessionFilePreviewMessage {
  type: 'session:file:preview';
  sessionId: string;
  data: {
    fileName: string;
    lines?: number;
  };
}

// Response messages
export interface TSGListResponse {
  type: 'tsg:list:response';
  data: {
    tsgs: Array<{
      name: string;
      fileCount: number;
      createdAt: string;
      size: number;
    }>;
    activeTSG: string | null;
  };
}

export interface TSGFilesResponse {
  type: 'tsg:files:response';
  data: {
    tsgName: string;
    files: Array<{
      path: string;
      name: string;
      size: number;
      type: string;
    }>;
  };
}

// Session file response messages
export interface SessionFileListResponse {
  type: 'session:file:list:response';
  data: {
    files: Array<{
      name: string;
      path: string;
      size: number;
      uploadedAt: string;
      type: string;
    }>;
    totalSize: number;
    count: number;
  };
}

export interface SessionFilePreviewResponse {
  type: 'session:file:preview:response';
  data: {
    fileName: string;
    content: string;
    truncated: boolean;
  };
}

export interface SessionFileDeleteSuccessMessage {
  type: 'session:file:delete:success';
  data: {
    fileName: string;
  };
}

export interface SessionFilesUpdatedMessage {
  type: 'session:files:updated';
  data: {
    files: Array<{
      name: string;
      path: string;
      size: number;
      uploadedAt: string;
      type: string;
    }>;
  };
}