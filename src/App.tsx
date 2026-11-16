import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment, ChatItem, Conversation, EngineEvent, EngineState, McpInfo, ModuleId, Report, Settings, UpdateStatus } from '../shared/types';
import { ChatPane } from './components/ChatPane';
import { Onboarding } from './components/Onboarding';
import { ReportPane } from './components/ReportPane';
import { SettingsDrawer } from './components/SettingsDrawer';
import { Splitter } from './components/Splitter';
import { TopBar } from './components/TopBar';
import { LangContext } from './i18n';
import { uid } from './lib/format';

function useResolvedTheme(theme: Settings['theme'] | undefined): 'dark' | 'light' {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => setSystemDark(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  if (theme === 'light') return 'light';
  if (theme === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}

function applyEvent(items: ChatItem[], ev: EngineEvent): ChatItem[] {
  switch (ev.type) {
    case 'text_delta': {
      const idx = items.findIndex((i) => i.kind === 'assistant' && i.id === ev.messageId);
      if (idx >= 0) {
        const it = items[idx] as Extract<ChatItem, { kind: 'assistant' }>;
        const copy = items.slice();
        copy[idx] = { ...it, text: it.text + ev.text, streaming: true };
        return copy;
      }
      if (!ev.text.trim()) return items;
      return [...items, { kind: 'assistant', id: ev.messageId, text: ev.text.replace(/^\s+/, ''), streaming: true }];
    }
    case 'tool_start': {
      const step = { toolId: ev.toolId, name: ev.name, input: ev.input, status: 'running' as const };
      const last = items[items.length - 1];
      if (last && last.kind === 'tools') return [...items.slice(0, -1), { ...last, steps: [...last.steps, step] }];
      return [...items, { kind: 'tools', id: uid(), steps: [step] }];
    }
    case 'tool_end':
      return items.map((i) =>
        i.kind === 'tools' && i.steps.some((s) => s.toolId === ev.toolId)
          ? { ...i, steps: i.steps.map((s) => (s.toolId === ev.toolId ? { ...s, status: ev.isError ? 'error' : 'done', summary: ev.summary } : s)) }
          : i,
      );
    case 'turn_end':
      return items.map((i) => {
        if (i.kind === 'assistant' && i.streaming) return { ...i, streaming: false };
        if (i.kind === 'tools' && i.steps.some((s) => s.status === 'running')) {
          return { ...i, steps: i.steps.map((s) => (s.status === 'running' ? { ...s, status: ev.ok ? 'done' : 'error' } : s)) };
        }
        return i;
      });
    case 'error':
      return [...items, { kind: 'error', id: uid(), text: ev.message, code: ev.code }];
    default:
      return items;
  }
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [engineState, setEngineState] = useState<EngineState>('idle');
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [mcps, setMcps] = useState<McpInfo[]>([]);
  const [module, setModule] = useState<ModuleId>('ads');
  const [chatWidth, setChatWidth] = useState(400);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateStatus>({ state: 'idle' });

  const conv = useRef<{ id: string; createdAt: string; sessionId?: string }>({ id: uid(), createdAt: new Date().toISOString() });
  const itemsRef = useRef(items);
  const reportRef = useRef(report);
  const moduleRef = useRef(module);
  itemsRef.current = items;
  reportRef.current = report;
  moduleRef.current = module;

  const theme = useResolvedTheme(settings?.theme);

  // ---------------------------------------------------------------- başlangıç
  useEffect(() => {
    void window.marai.settings.get().then((s) => {
      setSettings(s);
      setModule(s.lastModule);
      setChatWidth(s.chatWidth);
    });
    void window.marai.mcp.list().then(setMcps);
    void window.marai.update.status().then(setUpdate);
    void window.marai.report.current().then(setReport);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (settings) {
      root.dataset.accent = settings.accent;
      root.dataset.density = settings.density;
      root.lang = settings.lang;
    }
  }, [theme, settings]);

  const persist = useCallback(() => {
    const list = itemsRef.current;
    if (!list.length) return;
    const firstUser = list.find((i) => i.kind === 'user') as Extract<ChatItem, { kind: 'user' }> | undefined;
    const c: Conversation = {
      id: conv.current.id,
      title: (firstUser?.text ?? 'mar-ai').slice(0, 80),
      module: moduleRef.current,
      sessionId: conv.current.sessionId,
      createdAt: conv.current.createdAt,
      updatedAt: new Date().toISOString(),
      items: list.map((i) => (i.kind === 'assistant' ? { ...i, streaming: false } : i)),
      report: reportRef.current,
    };
    void window.marai.history.save(c);
  }, []);

  // ---------------------------------------------------------------- motor olayları
  useEffect(() => {
    const offEngine = window.marai.on.engine((ev) => {
      if (ev.type === 'state') {
        setEngineState(ev.state);
        return;
      }
      if (ev.type === 'session') {
        conv.current.sessionId = ev.sessionId;
        setModel(ev.model);
        void window.marai.mcp.list().then(setMcps);
        return;
      }
      setItems((prev) => applyEvent(prev, ev));
      if (ev.type === 'turn_end') {
        setBusy(false);
        // Kayıt, olayın ait olduğu sohbete yapılır (bu arada yeni sohbete geçildiyse kaydetme)
        const idAtEvent = conv.current.id;
        setTimeout(() => {
          if (conv.current.id === idAtEvent) persist();
        }, 50);
      }
      if (ev.type === 'error' && ev.code === 'authentication_failed') setEngineState('error');
    });
    const offReport = window.marai.on.report((r) => setReport(r));
    const offUpdate = window.marai.on.update((s) => setUpdate(s));
    return () => {
      offEngine();
      offReport();
      offUpdate();
    };
  }, [persist]);

  // ---------------------------------------------------------------- eylemler
  const changeSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    if (patch.chatWidth) setChatWidth(patch.chatWidth);
    const next = await window.marai.settings.set(patch);
    setSettings(next);
    if (patch.lang || patch.disabledMcps) setMcps(await window.marai.mcp.list());
  }, []);

  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      if (busy || !text.trim()) return;
      setItems((prev) => [...prev, { kind: 'user', id: uid(), text, attachments: attachments.map((a) => a.name) }]);
      setBusy(true);
      const res = await window.marai.chat.send({ text, module: moduleRef.current, attachments });
      if (!res.ok) {
        setBusy(false);
        setItems((prev) => [...prev, { kind: 'error', id: uid(), text: res.error ?? '', code: /bulunamadı|not found/i.test(res.error ?? '') ? 'no_binary' : 'unknown' }]);
      }
    },
    [busy],
  );

  const newChat = useCallback(async () => {
    persist();
    await window.marai.chat.newChat();
    conv.current = { id: uid(), createdAt: new Date().toISOString() };
    setItems([]);
    setReport(null);
    setBusy(false);
  }, [persist]);

  const openConversation = useCallback(
    async (id: string) => {
      const c = await window.marai.history.load(id);
      if (!c) return;
      persist();
      await window.marai.chat.resume(c);
      conv.current = { id: c.id, createdAt: c.createdAt, sessionId: c.sessionId };
      setItems(c.items);
      setReport(c.report);
      setModule(c.module);
      setBusy(false);
    },
    [persist],
  );

  const selectModule = useCallback(
    (m: ModuleId) => {
      setModule(m);
      void changeSettings({ lastModule: m });
    },
    [changeSettings],
  );

  if (!settings) return null;

  if (!settings.onboarded) {
    return (
      <LangContext.Provider value={settings.lang}>
        <Onboarding settings={settings} onChange={(p) => void changeSettings(p)} onDone={() => void changeSettings({ onboarded: true })} />
      </LangContext.Provider>
    );
  }

  return (
    <LangContext.Provider value={settings.lang}>
      <div className="app">
        <TopBar
          module={module}
          onModule={selectModule}
          engineState={engineState}
          model={model}
          update={update}
          onInstallUpdate={() => void window.marai.update.install()}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenConversation={(id) => void openConversation(id)}
          onDeleteConversation={(id) => void window.marai.history.remove(id)}
        />
        <div className="workspace" data-side={settings.chatSide}>
          <ChatPane
            width={chatWidth}
            items={items}
            busy={busy}
            module={module}
            mcps={mcps}
            onSend={(text, att) => void send(text, att)}
            onStop={() => void window.marai.chat.stop()}
            onNew={() => void newChat()}
          />
          <Splitter width={chatWidth} side={settings.chatSide} onChange={setChatWidth} onCommit={(w) => void changeSettings({ chatWidth: w })} />
          <ReportPane report={report} module={module} onPrompt={(t) => void send(t)} onExport={() => void window.marai.report.exportPdf()} />
        </div>
        {settingsOpen && <SettingsDrawer settings={settings} onChange={(p) => void changeSettings(p)} onClose={() => setSettingsOpen(false)} mcps={mcps} update={update} />}
      </div>
    </LangContext.Provider>
  );
}
