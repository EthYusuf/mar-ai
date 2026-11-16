/**
 * mar-ai — Electron ana süreci
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } from 'electron';
import { detectBrowsers, pickBrowser } from '../shared/browsers';
import type { BrowserList, Conversation, EngineEvent, SendPayload, Settings } from '../shared/types';
import { checkClaude, openOfficialLogin, testConnection } from './claude';
import { ClaudeEngine } from './engine';
import { deleteConversation, listConversations, loadConversation, saveConversation } from './history';
import { ReportStore } from './panels';
import { appRoot, paths } from './paths';
import { McpRegistry } from './registry';
import { getSettings, updateSettings } from './settings';
import { Updater } from './updater';

const here = path.dirname(fileURLToPath(import.meta.url));

protocol.registerSchemesAsPrivileged([
  { scheme: 'marai-img', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let win: BrowserWindow | null = null;
let logStream: fs.WriteStream | null = null;

function log(line: string): void {
  if (!logStream) {
    const file = path.join(paths.logs(), 'main.log');
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1024 * 1024) fs.rmSync(file);
    } catch {
      /* önemsiz */
    }
    logStream = fs.createWriteStream(file, { flags: 'a' });
  }
  logStream.write(`[${new Date().toISOString()}] ${line}\n`);
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

const registry = new McpRegistry();
const store = new ReportStore();
const engine = new ClaudeEngine({
  getSettings,
  registry,
  store,
  emit: (ev: EngineEvent) => {
    if (ev.type === 'error') log(`engine event error: ${ev.code} ${ev.message}`);
    send('engine:event', ev);
  },
  log,
});
const updater = new Updater((s) => send('update:status', s));
store.onChange((r) => send('report:update', r));

function isDark(s: Settings): boolean {
  return s.theme === 'dark' || (s.theme === 'system' && nativeTheme.shouldUseDarkColors);
}

function createWindow(): void {
  const settings = getSettings();
  nativeTheme.themeSource = settings.theme;
  const icon = path.join(appRoot(), 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'mar-ai',
    backgroundColor: isDark(settings) ? '#0A0C10' : '#F4F5F7',
    autoHideMenuBar: true,
    icon: !app.isPackaged && fs.existsSync(icon) ? icon : undefined,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url === win?.webContents.getURL()) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url) && !url.startsWith(process.env.VITE_DEV_SERVER_URL ?? '\0')) void shell.openExternal(url);
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(appRoot(), 'dist', 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

/** Rapor kartlarındaki uzak görselleri (Instagram/Meta CDN) güvenle göstermek için vekil protokol */
function registerImageProtocol(): void {
  const privateHost = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|0\.)/i;
  protocol.handle('marai-img', async (request) => {
    try {
      const target = new URL(request.url).searchParams.get('u') ?? '';
      const u = new URL(target);
      if (u.protocol !== 'https:' || privateHost.test(u.hostname)) return new Response('forbidden', { status: 403 });
      const res = await net.fetch(u.toString(), { headers: { 'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) mar-ai/${app.getVersion()}` } });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) return new Response('not an image', { status: 415 });
      return new Response(res.body, { status: 200, headers: { 'content-type': type, 'cache-control': 'max-age=3600' } });
    } catch {
      return new Response('error', { status: 502 });
    }
  });
}

async function exportPdf() {
  if (!win) return { ok: false, error: 'no window' };
  const report = store.current;
  const safeName = (report?.title ?? 'mar-ai rapor').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'mar-ai rapor';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(app.getPath('documents'), `${safeName}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try {
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    fs.writeFileSync(filePath, data);
    void shell.openPath(filePath);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const allowed: Array<keyof Settings> = ['onboarded', 'theme', 'lang', 'accent', 'density', 'chatWidth', 'chatSide', 'browserVisible', 'browserPath', 'model', 'claudePath', 'disabledMcps', 'lastModule'];
    const clean: Partial<Settings> = {};
    for (const k of allowed) if (k in patch) (clean as Record<string, unknown>)[k] = patch[k];
    const next = updateSettings(clean);
    nativeTheme.themeSource = next.theme;
    win?.setBackgroundColor(isDark(next) ? '#0A0C10' : '#F4F5F7');
    return next;
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    dataDir: app.getPath('userData'),
    userMcpDir: paths.userMcps(),
    workspaceDir: paths.workspace(),
  }));
  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return shell.openExternal(url);
  });
  ipcMain.handle('claude:check', () => checkClaude(getSettings()));
  ipcMain.handle('claude:login', () => openOfficialLogin());
  ipcMain.handle('claude:test', () => testConnection(getSettings()));
  ipcMain.handle('browser:list', (): BrowserList => {
    const detected = detectBrowsers(true);
    const { browser, preferredMissing } = pickBrowser(getSettings().browserPath);
    return { detected, active: browser, preferredMissing };
  });
  ipcMain.handle('mcp:list', () => {
    registry.scan();
    return registry.list(getSettings());
  });
  ipcMain.handle('mcp:openFolder', async () => {
    await shell.openPath(paths.userMcps());
  });
  ipcMain.handle('chat:send', async (_e, payload: SendPayload) => {
    try {
      await engine.send(payload);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('chat:stop', () => engine.interrupt());
  ipcMain.handle('chat:new', () => {
    engine.reset();
    store.load(null);
  });
  ipcMain.handle('chat:resume', (_e, conversation: Conversation) => {
    engine.reset(conversation.sessionId);
    store.load(conversation.report);
  });
  ipcMain.handle('chat:sessionId', () => engine.currentSessionId);
  ipcMain.handle('history:list', () => listConversations());
  ipcMain.handle('history:load', (_e, id: string) => loadConversation(id));
  ipcMain.handle('history:save', (_e, c: Conversation) => saveConversation(c));
  ipcMain.handle('history:delete', (_e, id: string) => deleteConversation(id));
  ipcMain.handle('report:current', () => store.current);
  ipcMain.handle('report:exportPdf', () => exportPdf());
  ipcMain.handle('update:status', () => updater.current);
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:install', () => updater.install());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    log(`mar-ai ${app.getVersion()} başlıyor (packaged=${app.isPackaged})`);
    Menu.setApplicationMenu(null);
    registerImageProtocol();
    registry.scan();
    registerIpc();
    createWindow();
    updater.init();
  });

  app.on('window-all-closed', () => {
    engine.dispose();
    app.quit();
  });

  app.on('before-quit', () => engine.dispose());
}
