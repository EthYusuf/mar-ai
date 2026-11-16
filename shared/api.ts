import type {
  AppInfo,
  BrowserList,
  ClaudeCheck,
  ConnectionTest,
  Conversation,
  ConversationMeta,
  EngineEvent,
  McpInfo,
  Report,
  SendPayload,
  Settings,
  UpdateStatus,
} from './types';

/** Preload betiğinin window.marai olarak sunduğu güvenli API */
export interface MaraiApi {
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
  app: {
    info(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
  };
  claude: {
    check(): Promise<ClaudeCheck>;
    login(): Promise<{ opened: 'terminal' | 'docs' }>;
    test(): Promise<ConnectionTest>;
  };
  mcp: {
    list(): Promise<McpInfo[]>;
    openFolder(): Promise<void>;
  };
  browsers: {
    /** Bulunan tarayıcılar ve şu an kullanılacak olan */
    list(): Promise<BrowserList>;
  };
  chat: {
    send(payload: SendPayload): Promise<{ ok: boolean; error?: string }>;
    stop(): Promise<void>;
    newChat(): Promise<void>;
    resume(conversation: Conversation): Promise<void>;
    sessionId(): Promise<string | null>;
  };
  history: {
    list(): Promise<ConversationMeta[]>;
    load(id: string): Promise<Conversation | null>;
    save(conversation: Conversation): Promise<void>;
    remove(id: string): Promise<void>;
  };
  report: {
    current(): Promise<Report | null>;
    exportPdf(): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
  };
  update: {
    status(): Promise<UpdateStatus>;
    check(): Promise<UpdateStatus>;
    install(): Promise<void>;
  };
  on: {
    engine(cb: (ev: EngineEvent) => void): () => void;
    report(cb: (report: Report | null) => void): () => void;
    update(cb: (s: UpdateStatus) => void): () => void;
  };
}
