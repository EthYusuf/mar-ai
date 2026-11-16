import { useEffect, useRef, useState } from 'react';
import type { ConversationMeta, EngineState, ModuleId, UpdateStatus } from '../../shared/types';
import { useLang, useT } from '../i18n';
import { fmtDate } from '../lib/format';
import { Icon } from './Icons';

const MODULE_ICONS: Record<ModuleId, (p: { size?: number }) => React.ReactElement> = {
  ads: Icon.Search,
  reels: Icon.Film,
  competitors: Icon.Target,
  trends: Icon.Trend,
};

interface Props {
  module: ModuleId;
  onModule: (m: ModuleId) => void;
  engineState: EngineState;
  model: string | null;
  update: UpdateStatus;
  onInstallUpdate: () => void;
  onOpenSettings: () => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

export function TopBar(p: Props) {
  const t = useT();
  const lang = useLang();
  const [histOpen, setHistOpen] = useState(false);
  const [history, setHistory] = useState<ConversationMeta[]>([]);
  const histRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!histOpen) return;
    void window.marai.history.list().then(setHistory);
    const close = (e: MouseEvent) => {
      if (histRef.current && !histRef.current.contains(e.target as Node)) setHistOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setHistOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [histOpen]);

  const dotClass = p.engineState === 'busy' || p.engineState === 'starting' ? 'dot dot-busy' : p.engineState === 'error' ? 'dot dot-bad' : 'dot dot-good';

  return (
    <header className="topbar">
      <div className="brand">
        <Icon.Logo />
        <span className="brand-name">mar-ai</span>
      </div>
      <nav className="tabs" role="tablist" aria-label="Modüller">
        {(Object.keys(t.modules) as ModuleId[]).map((m) => {
          const I = MODULE_ICONS[m];
          return (
            <button key={m} type="button" role="tab" className="tab" aria-selected={p.module === m} onClick={() => p.onModule(m)}>
              <I size={16} />
              {t.modules[m]}
            </button>
          );
        })}
      </nav>
      <div className="topbar-right">
        {p.update.state === 'ready' && (
          <button type="button" className="btn btn-sm btn-primary" onClick={p.onInstallUpdate}>
            {t.update.install}
          </button>
        )}
        <span className="status-pill" title={p.model ?? undefined}>
          <span className={dotClass} />
          {t.status[p.engineState]}
        </span>
        <div style={{ position: 'relative' }} ref={histRef}>
          <button type="button" className="btn btn-icon" aria-label={t.history} title={t.history} aria-expanded={histOpen} onClick={() => setHistOpen((v) => !v)}>
            <Icon.Clock size={18} />
          </button>
          {histOpen && (
            <div className="popover" role="dialog" aria-label={t.history}>
              {history.length === 0 ? (
                <div className="muted" style={{ padding: 12 }}>
                  {t.historyEmpty}
                </div>
              ) : (
                history.map((h) => (
                  <div className="history-item" key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setHistOpen(false);
                        p.onOpenConversation(h.id);
                      }}
                    >
                      <span className="t">{h.title}</span>
                      <span className="m">
                        {t.modules[h.module]} · {fmtDate(h.updatedAt, lang)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost btn-sm"
                      aria-label={t.delete}
                      title={t.delete}
                      onClick={() => {
                        p.onDeleteConversation(h.id);
                        setHistory((list) => list.filter((x) => x.id !== h.id));
                      }}
                    >
                      <Icon.Trash size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        <button type="button" className="btn btn-icon" aria-label={t.settings} title={t.settings} onClick={p.onOpenSettings}>
          <Icon.Sliders size={18} />
        </button>
      </div>
    </header>
  );
}
