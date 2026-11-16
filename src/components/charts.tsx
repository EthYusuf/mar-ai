/**
 * Bağımlılıksız SVG/HTML grafikleri. Renkler, renk körlüğüne göre doğrulanmış kategorik paletten
 * (--c1..--c4) gelir; etiketler metin renklerinde kalır, seriler hiçbir zaman yalnızca renkle ayırt edilmez.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChartSeries } from '../../shared/types';
import { fmtShort, fmtNumber } from '../lib/format';
import { useLang } from '../i18n';

export const seriesColor = (i: number) => `var(--c${(i % 4) + 1})`;

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(Math.max(200, Math.floor(entries[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceDomain(values: number[], ticks = 4): { lo: number; hi: number; step: number } {
  const maxV = Math.max(0, ...values);
  const minV = Math.min(0, ...values);
  const span = maxV - minV || 1;
  const raw = span / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  return { lo: Math.floor(minV / step) * step, hi: Math.ceil(maxV / step) * step || step, step };
}

function range(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function Legend({ series }: { series: ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <div className="chart-legend">
      {series.map((s, i) => (
        <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="legend-swatch" style={{ background: seriesColor(i) }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, width, title, rows, unit }: { x: number; width: number; title: string; rows: Array<{ name: string; value: number; color: string }>; unit?: string }) {
  const lang = useLang();
  const left = Math.min(Math.max(x, 80), width - 80);
  return (
    <div className="tooltip" style={{ left, top: -8, transform: 'translate(-50%, -100%)' }}>
      <div className="tooltip-title">{title}</div>
      {rows.map((r) => (
        <div className="tooltip-row" key={r.name}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="dot" style={{ background: r.color }} />
            {r.name}
          </span>
          <strong>
            {fmtNumber(r.value, lang)}
            {unit ? ` ${unit}` : ''}
          </strong>
        </div>
      ))}
    </div>
  );
}

/** Yatay çubuk grafik (sıralamalar, uzun etiketler) */
export function BarChart({ categories, series, unit }: { categories: string[]; series: ChartSeries[]; unit?: string }) {
  const lang = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all.map((v) => Math.abs(v)), 1);
  return (
    <div className="chart-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {categories.map((c, ci) => (
        <div key={`${c}-${ci}`} className="hbar-row" onMouseEnter={() => setHover(ci)} onMouseLeave={() => setHover(null)}>
          <div className="hbar-top">
            <span style={{ color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c}>
              {c}
            </span>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {series.length === 1 ? (
                <>
                  {hover === ci ? fmtNumber(series[0].values[ci], lang) : fmtShort(series[0].values[ci], lang)}
                  {unit ? <span className="faint" style={{ fontWeight: 400 }}> {unit}</span> : null}
                </>
              ) : (
                series.map((s, si) => (
                  <span key={s.name} style={{ marginLeft: si ? 10 : 0 }}>
                    <span className="dot" style={{ background: seriesColor(si), marginRight: 4 }} />
                    {fmtShort(s.values[ci], lang)}
                  </span>
                ))
              )}
            </span>
          </div>
          <div className="hbar-track" style={{ height: series.length === 1 ? 10 : series.length * 8 + (series.length - 1) * 2, background: 'transparent' }}>
            {series.map((s, si) => (
              <div key={s.name} style={{ height: series.length === 1 ? 10 : 8, background: 'var(--surface-4)', borderRadius: '0 4px 4px 0' }}>
                <div className="hbar-fill" style={{ width: `${(Math.abs(s.values[ci]) / max) * 100}%`, background: seriesColor(si) }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const PAD = { top: 14, right: 16, bottom: 30, left: 46 };

function Frame({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <svg width={width} height={height} role="presentation">
      {children}
    </svg>
  );
}

function YAxis({ ticks, y, width, lang }: { ticks: number[]; y: (v: number) => number; width: number; lang: 'tr' | 'en' }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
          <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--faint)">
            {fmtShort(t, lang)}
          </text>
        </g>
      ))}
    </g>
  );
}

function shortLabel(s: string, maxChars: number): string {
  return s.length > maxChars ? s.slice(0, Math.max(3, maxChars - 1)) + '…' : s;
}

/** Dikey sütun grafik (az kategori, gruplu karşılaştırma) */
export function ColumnChart({ categories, series, unit, height = 260 }: { categories: string[]; series: ChartSeries[]; unit?: string; height?: number }) {
  const lang = useLang();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { lo, hi, step } = niceDomain(series.flatMap((s) => s.values));
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const band = plotW / categories.length;
  const maxBar = categories.length <= 4 ? 56 : categories.length <= 8 ? 36 : 26;
  const groupW = Math.min(band * 0.72, maxBar * series.length + 4 * (series.length - 1));
  const barW = (groupW - 2 * (series.length - 1)) / series.length;
  const maxChars = Math.max(4, Math.floor(band / 7));
  return (
    <div className="chart-wrap" ref={ref} onMouseLeave={() => setHover(null)}>
      <Frame width={width} height={height}>
        <YAxis ticks={range(lo, hi, step)} y={y} width={width} lang={lang} />
        {categories.map((c, ci) => {
          const x0 = PAD.left + ci * band + (band - groupW) / 2;
          return (
            <g key={`${c}-${ci}`} onMouseEnter={() => setHover(ci)}>
              <rect x={PAD.left + ci * band} y={PAD.top} width={band} height={plotH} fill={hover === ci ? 'var(--surface-3)' : 'transparent'} />
              {series.map((s, si) => {
                const v = s.values[ci];
                const top = y(Math.max(v, 0));
                const h = Math.max(1, Math.abs(y(v) - y(0)));
                return <rect key={s.name} x={x0 + si * (barW + 2)} y={top} width={Math.max(barW, 2)} height={h} rx={Math.min(4, barW / 2)} fill={seriesColor(si)} />;
              })}
              <text x={PAD.left + ci * band + band / 2} y={height - 10} textAnchor="middle" fontSize={11} fill="var(--faint)">
                {shortLabel(c, maxChars)}
              </text>
            </g>
          );
        })}
      </Frame>
      {hover !== null && (
        <Tooltip
          x={PAD.left + hover * band + band / 2}
          width={width}
          title={categories[hover]}
          unit={unit}
          rows={series.map((s, si) => ({ name: s.name, value: s.values[hover], color: seriesColor(si) }))}
        />
      )}
    </div>
  );
}

/** Çizgi grafik (zaman serileri) */
export function LineChart({ categories, series, unit, height = 270 }: { categories: string[]; series: ChartSeries[]; unit?: string; height?: number }) {
  const lang = useLang();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const labelSpace = series.length > 1 ? 84 : 20;
  const pad = { ...PAD, right: labelSpace };
  const { lo, hi, step } = niceDomain(series.flatMap((s) => s.values));
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const n = categories.length;
  const x = (i: number) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));
  // Doğrudan etiketlerin çakışmasını önle
  const ends = series
    .map((s, si) => ({ si, y: y(s.values[n - 1]), name: s.name }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  return (
    <div className="chart-wrap" ref={ref} onMouseLeave={() => setHover(null)}>
      <Frame width={width} height={height}>
        {range(lo, hi, step).map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
            <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--faint)">
              {fmtShort(t, lang)}
            </text>
          </g>
        ))}
        {categories.map((c, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={`${c}-${i}`} x={x(i)} y={height - 10} textAnchor="middle" fontSize={11} fill="var(--faint)">
              {shortLabel(c, 12)}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotH} stroke="var(--border-hover)" strokeDasharray="3 3" />}
        {series.map((s, si) => (
          <polyline
            key={s.name}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={seriesColor(si)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s, si) => (
          <circle key={`end-${s.name}`} cx={x(n - 1)} cy={y(s.values[n - 1])} r={4} fill={seriesColor(si)} stroke="var(--surface-2)" strokeWidth={2} />
        ))}
        {series.length > 1 &&
          ends.map((e) => (
            <text key={`lbl-${e.name}`} x={x(n - 1) + 10} y={e.y + 4} fontSize={12} fontWeight={600} fill="var(--text)">
              {shortLabel(e.name, 10)}
            </text>
          ))}
        {hover !== null &&
          series.map((s, si) => <circle key={`h-${s.name}`} cx={x(hover)} cy={y(s.values[hover])} r={5} fill={seriesColor(si)} stroke="var(--surface-2)" strokeWidth={2} />)}
        {categories.map((c, i) => (
          <rect
            key={`hit-${c}-${i}`}
            x={x(i) - (n > 1 ? plotW / (n - 1) / 2 : plotW / 2)}
            y={pad.top}
            width={n > 1 ? plotW / (n - 1) : plotW}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </Frame>
      {hover !== null && (
        <Tooltip
          x={x(hover)}
          width={width}
          title={categories[hover]}
          unit={unit}
          rows={series.map((s, si) => ({ name: s.name, value: s.values[hover], color: seriesColor(si) }))}
        />
      )}
    </div>
  );
}
