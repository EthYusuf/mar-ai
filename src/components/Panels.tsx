import { useState } from 'react';
import type { CardItem, Panel } from '../../shared/types';
import { useT } from '../i18n';
import { clockTime, imgSrc } from '../lib/format';
import { BarChart, ChartLegend, ChartTable, ColumnChart, LineChart } from './charts';
import { Icon } from './Icons';
import { Markdown } from './Markdown';

type PanelOf<K extends Panel['kind']> = Extract<Panel, { kind: K }>;

export function PanelView({ panel, onPrompt }: { panel: Panel; onPrompt: (text: string) => void }) {
  switch (panel.kind) {
    case 'kpis':
      return <KpiPanel panel={panel} />;
    case 'chart':
      return <ChartPanel panel={panel} />;
    case 'cards':
      return <CardsPanel panel={panel} />;
    case 'storyboard':
      return <StoryboardPanel panel={panel} />;
    case 'insights':
      return <InsightsPanel panel={panel} onPrompt={onPrompt} />;
    case 'table':
      return <TablePanel panel={panel} />;
    case 'text':
      return <TextPanel panel={panel} />;
    default:
      return null;
  }
}

const isHalf = (p: Panel | undefined) => !!p && p.kind === 'chart' && p.width === 'half';

/** Yarım genişlikteki grafikler yalnızca yanında eşi varsa yan yana durur; eşsiz kalan tam genişliğe yayılır. */
export function fullWidthIds(panels: Panel[]): Set<string> {
  const full = new Set<string>();
  for (let i = 0; i < panels.length; i++) {
    if (isHalf(panels[i]) && isHalf(panels[i + 1])) {
      i++;
      continue;
    }
    full.add(panels[i].id);
  }
  return full;
}

function KpiPanel({ panel }: { panel: PanelOf<'kpis'> }) {
  return (
    <section aria-label={panel.title ?? 'KPI'}>
      {panel.title && (
        <div className="section-head">
          <h3>{panel.title}</h3>
        </div>
      )}
      <div className="kpis">
        {panel.items.map((k, i) => (
          <div className="card kpi" key={`${k.label}-${i}`}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={k.value.length > 9 ? { fontSize: 22 } : k.value.length > 6 ? { fontSize: 27 } : undefined}>
              {k.value}
            </div>
            {typeof k.meter === 'number' && (
              <span className="meter kpi-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(k.meter)} aria-label={k.label}>
                <span style={{ width: `${Math.max(2, Math.min(100, k.meter))}%` }} />
              </span>
            )}
            {k.sub && (
              <div className={`kpi-sub${k.trend === 'up' ? ' trend-up' : k.trend === 'down' ? ' trend-down' : ''}`}>
                {k.trend === 'up' ? '▲ ' : k.trend === 'down' ? '▼ ' : ''}
                <span style={{ color: k.trend ? undefined : 'var(--faint)' }}>{k.sub}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartPanel({ panel }: { panel: PanelOf<'chart'> }) {
  const t = useT();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const lineLike = panel.chartType === 'line' || panel.chartType === 'area';
  return (
    <section className="card chart-card" aria-label={panel.title}>
      <div className="chart-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="card-title">{panel.title}</h3>
          {panel.subtitle && <div className="card-sub">{panel.subtitle}</div>}
        </div>
        <button
          type="button"
          className="btn btn-sm chart-toggle no-print"
          aria-pressed={view === 'table'}
          title={view === 'chart' ? t.chart.showTable : t.chart.showChart}
          onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
        >
          {view === 'chart' ? <Icon.Table size={14} /> : <Icon.Chart size={14} />}
          {view === 'chart' ? t.chart.table : t.chart.chart}
        </button>
      </div>
      {view === 'chart' && <ChartLegend spec={panel} />}
      {view === 'table' ? (
        <ChartTable spec={panel} />
      ) : lineLike ? (
        <LineChart spec={panel} height={panel.width === 'half' ? 250 : 300} />
      ) : panel.chartType === 'column' ? (
        <ColumnChart spec={panel} />
      ) : (
        <BarChart spec={panel} />
      )}
      {panel.note && <div className="chart-note">{panel.note}</div>}
    </section>
  );
}

function MediaCard({ card }: { card: CardItem }) {
  const t = useT();
  const [imgOk, setImgOk] = useState(true);
  return (
    <article className="media-card">
      {(card.image || card.badge) && (
        <div className="media">
          {card.image && imgOk ? (
            <img src={imgSrc(card.image)} alt="" loading="lazy" onError={() => setImgOk(false)} />
          ) : (
            <span style={{ width: 50, height: 50, borderRadius: '50%', border: '1px solid var(--border-hover)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon.Play />
            </span>
          )}
          {card.badge && <span className="badge">{card.badge}</span>}
        </div>
      )}
      <div className="media-body">
        <div className="media-title">
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.title}</span>
          {card.url && (
            <a href={card.url} target="_blank" rel="noreferrer" aria-label={t.openLink} title={card.url} style={{ color: 'var(--muted)', display: 'inline-flex' }}>
              <Icon.External size={15} />
            </a>
          )}
        </div>
        {card.subtitle && <div className="faint" style={{ fontSize: 12.5, marginTop: -6 }}>{card.subtitle}</div>}
        {card.quote && <div className="media-quote">“{card.quote}”</div>}
        {card.body && <div className="media-text">{card.body}</div>}
        {card.metrics && card.metrics.length > 0 && (
          <div className="metrics">
            {card.metrics.map((m) => (
              <span key={m.label}>
                {m.label}: <strong>{m.value}</strong>
              </span>
            ))}
          </div>
        )}
        {card.why && (
          <div className="why">
            <strong>{t.whyItWorks}</strong>
            {card.why}
          </div>
        )}
      </div>
    </article>
  );
}

function CardsPanel({ panel }: { panel: PanelOf<'cards'> }) {
  return (
    <section aria-label={panel.title}>
      <div className="section-head">
        <h3>{panel.title}</h3>
        {panel.subtitle && <span className="faint" style={{ fontSize: 12.5 }}>{panel.subtitle}</span>}
      </div>
      <div className="cards">
        {panel.cards.map((c, i) => (
          <MediaCard key={`${c.title}-${i}`} card={c} />
        ))}
      </div>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Icon.Check size={14} /> : <Icon.Copy size={14} />}
      {done ? t.copied : t.copy}
    </button>
  );
}

function StoryboardPanel({ panel }: { panel: PanelOf<'storyboard'> }) {
  const t = useT();
  const [hook, setHook] = useState(0);
  const [scene, setScene] = useState<number | null>(null);
  const total = panel.durationSec || panel.scenes[panel.scenes.length - 1]?.end || 30;
  const tickStep = total <= 15 ? 3 : total <= 30 ? 5 : total <= 60 ? 10 : 30;
  const ticks: number[] = [];
  for (let s = 0; s <= total; s += tickStep) ticks.push(s);
  if (ticks[ticks.length - 1] !== total) ticks.push(total);
  return (
    <section aria-label={panel.title} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h3 style={{ fontSize: 20 }}>{panel.title}</h3>
      {panel.hooks && panel.hooks.length > 0 && (
        <div>
          <div className="section-head">
            <h3>{t.hooks}</h3>
            <span className="faint" style={{ fontSize: 12.5 }}>{t.aiEstimate}</span>
          </div>
          <div className="hooks">
            {panel.hooks.map((h, i) => (
              <button type="button" key={`${h.text}-${i}`} className="hook" aria-pressed={hook === i} onClick={() => setHook(i)}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                  {h.kind ? <span className="pill">{h.kind}</span> : <span />}
                  {hook === i && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-text)', fontSize: 12, fontWeight: 600 }}>
                      <Icon.Check size={13} />
                    </span>
                  )}
                </span>
                <span className="hook-text">“{h.text}”</span>
                {typeof h.score === 'number' && (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--muted)' }}>
                      <span>{t.hookStrength}</span>
                      <strong style={{ color: 'var(--text)' }}>{Math.round(h.score)}/100</strong>
                    </span>
                    <span className="meter">
                      <span style={{ width: `${Math.max(2, Math.min(100, h.score))}%` }} />
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-head" style={{ marginBottom: 10 }}>
          <h3 style={{ fontSize: 16 }}>{t.timeline}</h3>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {clockTime(total)} · {t.scenesCount(panel.scenes.length)}
          </span>
        </div>
        <div className="timeline">
          {panel.scenes.map((s, i) => (
            <button
              type="button"
              key={i}
              className="seg"
              style={{ flex: `${Math.max(0.5, s.end - s.start)} 1 0` }}
              aria-pressed={scene === i}
              onClick={() => setScene(scene === i ? null : i)}
              title={`${i + 1} · ${s.role} · ${clockTime(s.start)}–${clockTime(s.end)}`}
            >
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {i + 1} · {s.role}
              </span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>
                {Math.round((s.end - s.start) * 10) / 10} {t.seconds}
              </span>
            </button>
          ))}
        </div>
        <div className="ticks">
          {ticks.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>

      <div>
        <div className="section-head">
          <h3>{t.storyboard}</h3>
        </div>
        <div className="scenes">
          {panel.scenes.map((s, i) => (
            <article className="scene" key={i} data-active={scene === i}>
              <div className="scene-frame-wrap">
                <div className="scene-frame">
                  <span>{s.overlay ?? ''}</span>
                </div>
                {s.shot && (
                  <span className="scene-chip" style={{ left: 10 }}>
                    {s.shot}
                  </span>
                )}
                <span className="scene-chip" style={{ right: 10 }}>
                  {clockTime(s.start)}–{clockTime(s.end)}
                </span>
              </div>
              <div className="scene-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="scene-num">{i + 1}</span>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 16 }}>{s.role}</strong>
                </div>
                <dl>
                  <div>
                    <dt>{t.visual}</dt>
                    <dd>{s.visual}</dd>
                  </div>
                  {s.audio && (
                    <div>
                      <dt>{t.audio}</dt>
                      <dd>{s.audio}</dd>
                    </div>
                  )}
                </dl>
              </div>
            </article>
          ))}
        </div>
      </div>

      {(panel.caption || panel.music || panel.postingTip || panel.hashtags?.length) && (
        <div className="extras">
          {(panel.caption || panel.hashtags?.length) && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <h3 className="card-title">{t.caption}</h3>
                <CopyButton text={[panel.caption ?? '', (panel.hashtags ?? []).join(' ')].filter(Boolean).join('\n\n')} />
              </div>
              {panel.caption && <div className="caption-box">{panel.caption}</div>}
              {panel.hashtags && (
                <div className="tags">
                  {panel.hashtags.map((h) => (
                    <span className="pill" key={h}>
                      {h.startsWith('#') ? h : `#${h}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          {panel.music && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon.Music size={16} />
                {t.music}
              </h3>
              <div style={{ color: 'var(--text-2)' }}>{panel.music}</div>
            </div>
          )}
          {panel.postingTip && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon.Calendar size={16} />
                {t.postingTip}
              </h3>
              <div style={{ color: 'var(--text-2)' }}>{panel.postingTip}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InsightsPanel({ panel, onPrompt }: { panel: PanelOf<'insights'>; onPrompt: (text: string) => void }) {
  const t = useT();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: panel.nextStep ? 'minmax(0, 3fr) minmax(260px, 2fr)' : 'minmax(0, 1fr)', gap: 'var(--gap)' }} className="insights-wrap">
      <section className="card" aria-label={panel.title}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Icon.Sparkle size={16} />
          {panel.title || t.insights}
        </h3>
        <ol className="insight-list">
          {panel.items.map((it, i) => (
            <li key={`${it.title}-${i}`}>
              <span className="insight-n">{i + 1}</span>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{it.title}</div>
                <div className="muted" style={{ fontSize: 13.5 }}>
                  {it.body}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
      {panel.nextStep && (
        <section className="next-step" aria-label={t.nextStep}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="kicker">{t.nextStep}</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 21, lineHeight: 1.25, fontWeight: 600 }}>{panel.nextStep.title}</div>
            {panel.nextStep.body && <div className="muted" style={{ fontSize: 13.5 }}>{panel.nextStep.body}</div>}
          </div>
          {panel.nextStep.prompt && (
            <button type="button" className="btn btn-primary no-print" style={{ alignSelf: 'flex-start' }} onClick={() => onPrompt(panel.nextStep!.prompt!)}>
              {t.runNextStep}
              <Icon.ArrowRight size={16} />
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function TablePanel({ panel }: { panel: PanelOf<'table'> }) {
  return (
    <section className="card" aria-label={panel.title}>
      <h3 className="card-title" style={{ marginBottom: 8 }}>
        {panel.title}
      </h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {panel.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {panel.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={typeof cell === 'number' ? 'num' : undefined}>
                    {typeof cell === 'number' ? cell.toLocaleString() : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {panel.note && <div className="chart-note">{panel.note}</div>}
    </section>
  );
}

function TextPanel({ panel }: { panel: PanelOf<'text'> }) {
  return (
    <section className="card" aria-label={panel.title ?? 'text'}>
      {panel.title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <h3 className="card-title">{panel.title}</h3>
          <CopyButton text={panel.markdown} />
        </div>
      )}
      <div style={{ color: 'var(--text-2)' }}>
        <Markdown text={panel.markdown} />
      </div>
    </section>
  );
}
