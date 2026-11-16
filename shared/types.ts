/** Ana süreç (Electron) ile arayüz (React) arasında paylaşılan türler. */

export type ThemeSetting = 'dark' | 'light' | 'system';
export type Lang = 'tr' | 'en';
export type Accent = 'lime' | 'orange' | 'violet' | 'cyan';
export type ModuleId = 'ads' | 'reels' | 'competitors' | 'trends';

export interface Settings {
  onboarded: boolean;
  theme: ThemeSetting;
  lang: Lang;
  accent: Accent;
  density: 'comfortable' | 'compact';
  /** Sohbet panelinin piksel genişliği (rapor alanı kalan genişliği alır) */
  chatWidth: number;
  chatSide: 'left' | 'right';
  /** Computer use: tarayıcı penceresi görünür olsun mu */
  browserVisible: boolean;
  /** '' = otomatik (Chrome → Edge → Brave → Vivaldi → Chromium → Opera → Opera GX), yoksa tarayıcı dosya yolu */
  browserPath: string;
  /** '' = Claude hesabının varsayılan modeli */
  model: string;
  /** '' = uygulamayla gelen Claude Code motoru */
  claudePath: string;
  disabledMcps: string[];
  lastModule: ModuleId;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  theme: 'dark',
  lang: 'tr',
  accent: 'lime',
  density: 'comfortable',
  chatWidth: 400,
  chatSide: 'left',
  browserVisible: false,
  browserPath: '',
  model: '',
  claudePath: '',
  disabledMcps: [],
  lastModule: 'ads',
};

export interface McpInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  sources: string[];
  usesBrowser: boolean;
  origin: 'builtin' | 'user';
  enabled: boolean;
  /** Son oturumdaki bağlantı durumu: connected | failed | pending | disabled | unknown */
  status: string;
}

/** Bilgisayarda bulunan Chromium tabanlı tarayıcı */
export interface DetectedBrowser {
  id: string;
  name: string;
  path: string;
}

export interface BrowserList {
  /** Tercih sırasına göre bulunan tarayıcılar */
  detected: DetectedBrowser[];
  /** Ayarlara göre şu an kullanılacak tarayıcı (yoksa null) */
  active: DetectedBrowser | null;
  /** Ayarlarda özel yol verilmiş ama dosya bulunamamışsa true */
  preferredMissing: boolean;
}

export interface ClaudeCheck {
  binaryFound: boolean;
  binaryPath: string | null;
  source: 'bundled' | 'custom' | 'system' | null;
  version: string | null;
  credentialsFound: boolean;
  apiKeyEnv: boolean;
  systemClaudePath: string | null;
}

export interface ConnectionTest {
  ok: boolean;
  model?: string;
  authSource?: string;
  claudeVersion?: string;
  error?: string;
  errorCode?: string;
}

export type EngineState = 'idle' | 'starting' | 'ready' | 'busy' | 'error';

export type EngineEvent =
  | { type: 'state'; state: EngineState; detail?: string }
  | { type: 'session'; sessionId: string; model: string; claudeVersion: string; authSource: string; mcp: Array<{ name: string; status: string }>; skills: string[] }
  | { type: 'text_delta'; messageId: string; text: string }
  | { type: 'tool_start'; toolId: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_end'; toolId: string; isError: boolean; summary: string }
  | { type: 'turn_end'; ok: boolean; durationMs: number; error?: string }
  | { type: 'error'; message: string; code?: string };

// ---------------------------------------------------------------- Rapor panelleri

export interface KpiItem {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'flat';
}

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface CardItem {
  title: string;
  subtitle?: string;
  badge?: string;
  image?: string;
  quote?: string;
  body?: string;
  why?: string;
  metrics?: Array<{ label: string; value: string }>;
  url?: string;
}

export interface StoryScene {
  role: string;
  start: number;
  end: number;
  shot?: string;
  overlay?: string;
  visual: string;
  audio?: string;
}

export type Panel =
  | { kind: 'kpis'; id: string; title?: string; items: KpiItem[] }
  | {
      kind: 'chart';
      id: string;
      title: string;
      subtitle?: string;
      chartType: 'bar' | 'column' | 'line';
      categories: string[];
      series: ChartSeries[];
      unit?: string;
      note?: string;
      width: 'half' | 'full';
    }
  | { kind: 'cards'; id: string; title: string; subtitle?: string; cards: CardItem[] }
  | {
      kind: 'storyboard';
      id: string;
      title: string;
      durationSec: number;
      hooks?: Array<{ text: string; kind?: string; score?: number }>;
      scenes: StoryScene[];
      caption?: string;
      hashtags?: string[];
      music?: string;
      postingTip?: string;
    }
  | { kind: 'insights'; id: string; title: string; items: Array<{ title: string; body: string }>; nextStep?: { title: string; body?: string; prompt?: string } }
  | { kind: 'table'; id: string; title: string; columns: string[]; rows: Array<Array<string | number>>; note?: string }
  | { kind: 'text'; id: string; title?: string; markdown: string };

export interface Report {
  id: string;
  title: string;
  subtitle?: string;
  tags: string[];
  sources: string[];
  createdAt: string;
  panels: Panel[];
}

// ---------------------------------------------------------------- Sohbet

export interface ToolStep {
  toolId: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  summary?: string;
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string; attachments?: string[] }
  | { kind: 'assistant'; id: string; text: string; streaming?: boolean }
  | { kind: 'tools'; id: string; steps: ToolStep[] }
  | { kind: 'error'; id: string; text: string; code?: string };

export interface Conversation {
  id: string;
  title: string;
  module: ModuleId;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  items: ChatItem[];
  report: Report | null;
}

export interface ConversationMeta {
  id: string;
  title: string;
  module: ModuleId;
  updatedAt: string;
  hasReport: boolean;
}

export interface Attachment {
  name: string;
  mime: string;
  /** base64 (görsel/PDF) veya düz metin */
  data: string;
  encoding: 'base64' | 'text';
}

export interface SendPayload {
  text: string;
  module: ModuleId;
  attachments: Attachment[];
}

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' | 'dev' }
  | { state: 'available' | 'downloading'; version: string; percent?: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export interface AppInfo {
  version: string;
  isPackaged: boolean;
  platform: string;
  dataDir: string;
  userMcpDir: string;
  workspaceDir: string;
}
