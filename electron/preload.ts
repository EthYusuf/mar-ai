import { contextBridge, ipcRenderer } from 'electron';
import type { MaraiApi } from '../shared/api';

function listen<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: MaraiApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  claude: {
    check: () => ipcRenderer.invoke('claude:check'),
    login: () => ipcRenderer.invoke('claude:login'),
    test: () => ipcRenderer.invoke('claude:test'),
  },
  mcp: {
    list: () => ipcRenderer.invoke('mcp:list'),
    openFolder: () => ipcRenderer.invoke('mcp:openFolder'),
  },
  browsers: {
    list: () => ipcRenderer.invoke('browser:list'),
  },
  chat: {
    send: (payload) => ipcRenderer.invoke('chat:send', payload),
    stop: () => ipcRenderer.invoke('chat:stop'),
    newChat: () => ipcRenderer.invoke('chat:new'),
    resume: (conversation) => ipcRenderer.invoke('chat:resume', conversation),
    sessionId: () => ipcRenderer.invoke('chat:sessionId'),
  },
  history: {
    list: () => ipcRenderer.invoke('history:list'),
    load: (id) => ipcRenderer.invoke('history:load', id),
    save: (conversation) => ipcRenderer.invoke('history:save', conversation),
    remove: (id) => ipcRenderer.invoke('history:delete', id),
  },
  report: {
    current: () => ipcRenderer.invoke('report:current'),
    exportPdf: () => ipcRenderer.invoke('report:exportPdf'),
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
  },
  on: {
    engine: (cb) => listen('engine:event', cb),
    report: (cb) => listen('report:update', cb),
    update: (cb) => listen('update:status', cb),
  },
};

contextBridge.exposeInMainWorld('marai', api);
