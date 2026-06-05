/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Google Identity Services global (loaded via <script> in index.html)
interface Window {
  google?: typeof google;
}

// --- File System Access API (Chromium) ---
// Augment the parts not always present in the TS DOM lib.
interface FileSystemFileHandle {
  move?(parent: FileSystemDirectoryHandle, name?: string): Promise<void>;
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
    id?: string;
    startIn?: FileSystemHandle | string;
  }) => Promise<FileSystemDirectoryHandle>;
}

declare namespace google {
  namespace accounts.oauth2 {
    interface TokenResponse {
      access_token: string;
      expires_in: number;
      error?: string;
    }
    interface TokenClient {
      callback: (resp: TokenResponse) => void;
      requestAccessToken: (overrides?: { prompt?: string }) => void;
    }
    interface TokenClientConfig {
      client_id: string;
      scope: string;
      callback: (resp: TokenResponse) => void;
    }
    function initTokenClient(config: TokenClientConfig): TokenClient;
    function revoke(accessToken: string, done?: () => void): void;
  }
}
