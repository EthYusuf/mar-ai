import { useEffect, useRef, useState } from 'react';
import type { ModuleId, Report } from '../../shared/types';
import { useLang, useT } from '../i18n';
import { fmtDate } from '../lib/format';
import { Icon } from './Icons';
import { PanelView, fullWidthIds } from './Panels';

export function ReportPane({ report, module, onPrompt, onExport }: { report: Report | null; module: ModuleId; onPrompt: (text: string) => void; onExport: () => void }) {
  const t = useT();
  const lang = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setNarrow(e[0].contentRect.width < 860));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const full = fullWidthIds(report?.panels ?? []);

  // Yeni panel geldiğinde görünür alana kaydır
  const count = report?.panels.length ?? 0;
  const lastCount = useRef(count);
  useEffect(() => {
    if (count > lastCount.current && ref.current) {
      const last = ref.current.querySelector('[data-panel]:last-of-type');
      last?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    lastCount.current = count;
  }, [count]);

  return (
    <main className="report-pane" ref={ref} data-narrow={narrow} aria-label="Rapor">
      {!report ? (
        <div className="report-empty">
          <div className="ghost-grid" aria-hidden="true">
            <div />
            <div />
            <div />
            <div />
            <div />
          </div>
          <span className="pill">{t.modules[module]}</span>
          <h2>{t.reportEmptyTitle}</h2>
          <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
            {t.reportEmptyBody}
          </p>
          <p className="faint" style={{ margin: 0, maxWidth: 520, fontSize: 13 }}>
            {t.moduleDesc[module]}
          </p>
        </div>
      ) : (
        <div className="report-inner">
          <div className="report-head">
            <div style={{ minWidth: 0 }}>
              <div className="report-kicker">
                {t.modules[module]} · {fmtDate(report.createdAt, lang)}
              </div>
              <h1 className="report-title">{report.title}</h1>
              <div className="report-meta">
                {report.subtitle && <span>{report.subtitle}</span>}
                {report.tags.map((tag) => (
                  <span className="pill" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="report-actions">
              <button type="button" className="btn btn-primary" onClick={onExport} disabled={!report.panels.length}>
                <Icon.Download size={16} />
                {t.exportPdf}
              </button>
            </div>
          </div>

          <div className="panel-grid">
            {report.panels.map((p) => (
              <div key={p.id} data-panel className={`panel-enter${full.has(p.id) ? ' full' : ''}`}>
                <PanelView panel={p} onPrompt={onPrompt} />
              </div>
            ))}
          </div>

          {report.sources.length > 0 && (
            <div className="sources">
              <span>{t.sources}:</span>
              {report.sources.map((s) => (
                <span className="pill" key={s}>
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
