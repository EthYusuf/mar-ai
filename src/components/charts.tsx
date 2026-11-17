/**
 * Bağımlılıksız SVG grafikleri (mar-ai rapor alanı).
 *  - Renkler renk körlüğüne göre doğrulanmış kategorik paletten, sabit sırayla gelir (--c1..--c4).
 *  - Metinler hiçbir zaman seri renginde değildir; kimliği renkli işaret + lejant taşır.
 *  - Çizgi 2px, ızgara 1px düz; kesikli çizgi yalnızca TAHMİN demektir; bant serinin renginde hafif bir yıkamadır.
 *  - Etkileşim: x'e yapışan dikey çizgi + tüm serileri listeleyen tek ipucu, klavyeyle ← → gezinme, tablo görünümü.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { ChartSpec, Lang, ValueFormat } from '../../shared/types';
import { dateFormat, fmtCompact, fmtNumber, numberFormat } from '../lib/format';
import { useLang, useT } from '../i18n';

export const seriesColor = (i: number) => `var(--c${(i % 4) + 1})`;
const DAY = 86_400_000;

// ---------------------------------------------------------------- Biçimlendirme

export function fmtValue(v: number | null | undefined, format: ValueFormat | undefined, lang: Lang, mode: 'short' | 'full' = 'short'): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (format === 'percent') return numberFormat(lang, { style: 'percent', maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }).format(v / 100);
  if (format === 'decimal') return numberFormat(lang, { maximumFractionDigits: 2 }).format(v);
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  if (mode === 'full') return fmtNumber(r, lang);
  if (format === 'compact' || Math.abs(r) >= 10_000) return fmtCompact(r, lang);
  return fmtNumber(r, lang);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, Math.max(3, max - 1))}…` : s;
}

// ---------------------------------------------------------------- Zaman ekseni

type Grain = 'day' | 'month' | 'year';

function parseTime(s: string): number | null {
  if (/^\d{4}$/.test(s)) return Date.UTC(Number(s), 0, 1);
  if (/^\d{4}-\d{2}$/.test(s)) return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, 1);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function grainOf(s: string): Grain {
  if (/^\d{4}$/.test(s)) return 'year';
  if (/^\d{4}-\d{2}$/.test(s)) return 'month';
  return 'day';
}

function timeLabel(t: number, grain: Grain, lang: Lang, style: 'tick' | 'full', spanDays: number): string {
  const d = new Date(t);
  const f = (o: Intl.DateTimeFormatOptions) => dateFormat(lang, { ...o, timeZone: 'UTC' }).format(d);
  if (grain === 'year') return String(d.getUTCFullYear());
  if (grain === 'month') {
    if (style === 'full') return f({ month: 'long', year: 'numeric' });
    return spanDays > 400 || d.getUTCMonth() === 0 ? f({ month: 'short', year: '2-digit' }) : f({ month: 'short' });
  }
  if (style === 'full') return f({ day: 'numeric', month: 'long', year: 'numeric' });
  if (spanDays > 100) return d.getUTCMonth() === 0 ? f({ month: 'short', year: 'numeric' }) : f({ month: 'short' });
  return f({ day: 'numeric', month: 'short' });
}

/** Etiket yazılacak kategori sıraları: orantılı zaman ekseninde ay/hafta başları, aksi hâlde eşit aralık. */
function tickIndices(labels: string[], times: number[] | null, grain: Grain, plotW: number): number[] {
  const n = labels.length;
  if (n <= 1) return [0];
  if (!times) {
    const est = Math.max(...labels.map((c) => Math.min(14, c.length))) * 6.4 + 14;
    const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / est))));
    return labels.map((_, i) => i).filter((i) => i % step === 0);
  }
  const spanDays = (times[n - 1] - times[0]) / DAY;
  const all = times.map((_, i) => i);
  let cand: number[];
  if (grain === 'day') cand = spanDays <= 75 ? all.filter((i) => i % 7 === 0) : all.filter((i) => new Date(times[i]).getUTCDate() === 1);
  else if (grain === 'month') cand = spanDays > 1100 ? all.filter((i) => new Date(times[i]).getUTCMonth() === 0) : all;
  else cand = all;
  if (!cand.length) cand = [0];
  const maxTicks = Math.max(2, Math.floor(plotW / 70));
  const step = Math.ceil(cand.length / maxTicks);
  return cand.filter((_, k) => k % step === 0);
}

// ---------------------------------------------------------------- Ölçek

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw || 1));
  const x = raw / pow;
  return (x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10) * pow;
}

function yDomain(values: number[], includeZero: boolean, ticks = 4): { lo: number; hi: number; step: number } {
  let lo = values.length ? Math.min(...values) : 0;
  let hi = values.length ? Math.max(...values) : 1;
  if (includeZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (hi === lo) {
    hi += Math.abs(hi) * 0.1 || 1;
    if (!includeZero) lo -= Math.abs(lo) * 0.1 || 1;
  }
  const step = niceStep((hi - lo) / ticks);
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

function range(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 1000; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(Math.max(220, Math.floor(entries[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ---------------------------------------------------------------- Lejant

function LineKey({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="18" height="6" aria-hidden="true" style={{ flex: 'none' }}>
      <line x1="1" y1="3" x2="17" y2="3" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? '3.5 3' : undefined} />
    </svg>
  );
}

export function ChartLegend({ spec }: { spec: ChartSpec }) {
  const t = useT();
  const lineLike = spec.chartType === 'line' || spec.chartType === 'area';
  const items: ReactNode[] = [];
  if (spec.series.length > 1)
    spec.series.forEach((s, i) =>
      items.push(
        <span key={`s${i}`} className="legend-item">
          {lineLike ? <LineKey color={seriesColor(i)} /> : <span className="legend-box" style={{ background: seriesColor(i) }} />}
          {s.name}
        </span>,
      ),
    );
  if (lineLike && spec.forecastStart !== undefined)
    items.push(
      <span key="fc" className="legend-item">
        <LineKey color="var(--muted)" dashed />
        {spec.forecastLabel ?? t.chart.forecast}
      </span>,
    );
  if (lineLike && spec.series.some((s) => s.low && s.high))
    items.push(
      <span key="band" className="legend-item">
        <span className="legend-box" style={{ background: 'var(--muted)', opacity: 0.3 }} />
        {spec.bandLabel ?? t.chart.band}
      </span>,
    );
  if (!items.length) return null;
  return <div className="chart-legend">{items}</div>;
}

// ---------------------------------------------------------------- Çizgi / alan grafiği

function pathFrom(points: Array<[number, number] | null>): string {
  let d = '';
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

function bandPathFrom(xs: number[], low: Array<number | null>, high: Array<number | null>, y: (v: number) => number): string {
  let d = '';
  let run: number[] = [];
  const flush = () => {
    if (run.length >= 2) {
      d += `M${run.map((i) => `${xs[i].toFixed(1)},${y(high[i]!).toFixed(1)}`).join('L')}`;
      d += `L${[...run]
        .reverse()
        .map((i) => `${xs[i].toFixed(1)},${y(low[i]!).toFixed(1)}`)
        .join('L')}Z`;
    }
    run = [];
  };
  for (let i = 0; i < xs.length; i++) {
    if (low[i] !== null && low[i] !== undefined && high[i] !== null && high[i] !== undefined) run.push(i);
    else flush();
  }
  flush();
  return d;
}

export function LineChart({ spec, height = 300 }: { spec: ChartSpec; height?: number }) {
  const lang = useLang();
  const t = useT();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const forecastLabel = spec.forecastLabel ?? t.chart.forecast;

  // Tüm geometri yalnızca veri, genişlik veya dil değişince hesaplanır; üzerine gelme yalnızca
  // dikey çizgiyi ve ipucunu yeniden çizer (210 noktalı grafiklerde akıcı kalır).
  const g = useMemo(() => {
    const { categories, series } = spec;
    const n = categories.length;
    const times = spec.xType === 'time' && categories.every((c) => parseTime(c) !== null) ? categories.map((c) => parseTime(c)!) : null;
    const grain = times ? grainOf(categories[0]) : 'day';
    const spanDays = times && n > 1 ? (times[n - 1] - times[0]) / DAY : 0;
    const fs = spec.forecastStart !== undefined && spec.forecastStart > 0 && spec.forecastStart < n ? spec.forecastStart : null;
    const area = spec.chartType === 'area';
    const multi = series.length > 1;
    const proportional = !!times && !spec.evenSpacing;
    const dots = !area && n <= 24;

    const finite = series
      .flatMap((s) => [...s.values, ...(s.low ?? []), ...(s.high ?? [])])
      .filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
    const minV = finite.length ? Math.min(...finite) : 0;
    const maxV = finite.length ? Math.max(...finite) : 1;
    const includeZero = area || minV < 0 || (minV >= 0 && minV < 0.5 * maxV);
    const { lo, hi, step } = yDomain(finite, includeZero);
    const yTicks = range(lo, hi, step);
    const tickTexts = yTicks.map((v) => fmtValue(v, spec.valueFormat, lang));
    const lastIdx = series.map((s) => {
      for (let i = n - 1; i >= 0; i--) if (s.values[i] !== null && s.values[i] !== undefined) return i;
      return -1;
    });
    const endTexts = series.map((s, si) =>
      lastIdx[si] < 0 ? '' : `${multi ? `${truncate(s.name, 18)}  ` : ''}${fmtValue(s.values[lastIdx[si]], spec.valueFormat, lang)}`,
    );
    const pad = {
      top: 24,
      right: Math.min(190, Math.max(20, Math.max(...endTexts.map((x) => x.length)) * 6.7 + 16)),
      bottom: 30,
      left: Math.max(38, Math.max(...tickTexts.map((x) => x.length)) * 6.6 + 14),
    };
    const plotW = Math.max(80, width - pad.left - pad.right);
    const plotH = height - pad.top - pad.bottom;
    const xs = categories.map((_, i) =>
      proportional && times
        ? pad.left + ((times[i] - times[0]) / Math.max(1, times[n - 1] - times[0])) * plotW
        : pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    );
    const y = (v: number) => pad.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    const tickLabel = (i: number) => (times ? timeLabel(times[i], grain, lang, 'tick', spanDays) : truncate(categories[i], 14));
    const fullLabel = (i: number) => (times ? timeLabel(times[i], grain, lang, 'full', spanDays) : categories[i]);
    const ticks = tickIndices(
      categories.map((_, i) => tickLabel(i)),
      proportional ? times : null,
      grain,
      plotW,
    ).map((i) => ({ i, x: xs[i], text: tickLabel(i) }));

    const paths = series.map((s) => {
      const actual = s.values.map((v, i) => (v !== null && v !== undefined && (fs === null || i < fs) ? ([xs[i], y(v)] as [number, number]) : null));
      const forecast = fs === null ? [] : s.values.map((v, i) => (v !== null && v !== undefined && i >= fs - 1 ? ([xs[i], y(v)] as [number, number]) : null));
      const band = s.low && s.high ? bandPathFrom(xs, s.low, s.high, y) : '';
      let fill = '';
      if (area) {
        const end = fs ?? n;
        const idx = s.values.map((v, i) => (i < end && v !== null && v !== undefined ? i : -1)).filter((i) => i >= 0);
        const baseY = y(includeZero ? Math.max(lo, 0) : lo);
        if (idx.length >= 2)
          fill = `M${xs[idx[0]].toFixed(1)},${baseY.toFixed(1)}L${idx.map((i) => `${xs[i].toFixed(1)},${y(s.values[i]!).toFixed(1)}`).join('L')}L${xs[idx[idx.length - 1]].toFixed(1)},${baseY.toFixed(1)}Z`;
      }
      return { actual: pathFrom(actual), forecast: fs === null ? '' : pathFrom(forecast), band, fill };
    });

    // Doğrudan son değer etiketleri; çakışırsa bağlantı çizgisiyle ayrılır
    const ends = series
      .map((s, si) => ({ si, idx: lastIdx[si], y0: lastIdx[si] >= 0 ? y(s.values[lastIdx[si]]!) : 0 }))
      .filter((e) => e.idx >= 0)
      .map((e) => ({ ...e, y: e.y0 }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    const overflow = ends.length ? ends[ends.length - 1].y - (pad.top + plotH) : 0;
    if (overflow > 0) for (const e of ends) e.y -= overflow;

    const markers = (spec.markers ?? [])
      .filter((m) => m.index < n)
      .map((m) => {
        const v = series[0]?.values[m.index];
        const mx = xs[m.index];
        return {
          x: mx,
          label: !multi && v !== null && v !== undefined ? `${m.label} · ${fmtValue(v, spec.valueFormat, lang)}` : m.label,
          anchor: (mx < pad.left + 60 ? 'start' : mx > pad.left + plotW - 60 ? 'end' : 'middle') as 'start' | 'end' | 'middle',
        };
      });

    return { n, fs, multi, dots, pad, plotW, plotH, xs, y, yTicks, tickTexts, ticks, paths, ends, markers, lastIdx, fullLabel };
  }, [spec, width, height, lang]);

  const { n, fs, multi, pad, plotW, plotH, xs, y } = g;
  const series = spec.series;
  const fsX = fs !== null ? xs[fs - 1] : null;

  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const px = e.clientX - (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect().left;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < px) lo = mid;
      else hi = mid;
    }
    setHover(Math.abs(xs[lo] - px) <= Math.abs(xs[hi] - px) ? lo : hi);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setHover((h) => Math.min(n - 1, Math.max(0, (h ?? (d > 0 ? -1 : n)) + d)));
    } else if (e.key === 'Escape') setHover(null);
  };

  const tipRight = hover !== null && xs[hover] > pad.left + plotW * 0.6;

  return (
    <div
      className="chart-wrap"
      ref={ref}
      tabIndex={0}
      role="img"
      aria-label={t.chart.keyboardHint}
      onKeyDown={onKey}
      onBlur={() => setHover(null)}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={width} height={height} role="presentation">
        <defs>
          <clipPath id={`clip${uid}`}>
            <rect className="chart-reveal" x={pad.left - 8} y={0} width={plotW + pad.right + 16} height={height} />
          </clipPath>
          {series.map((_, si) => (
            <linearGradient key={si} id={`fill${uid}${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(si)} stopOpacity={0.22} />
              <stop offset="100%" stopColor={seriesColor(si)} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* Izgara ve y ekseni */}
        {g.yTicks.map((v, i) => (
          <g key={v}>
            <line x1={pad.left} x2={pad.left + plotW} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={pad.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--faint)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {g.tickTexts[i]}
            </text>
          </g>
        ))}

        {/* Tahmin bölgesi */}
        {fsX !== null && (
          <g>
            <rect x={fsX} y={pad.top} width={pad.left + plotW - fsX} height={plotH} fill="var(--surface-3)" opacity={0.55} />
            <line x1={fsX} x2={fsX} y1={pad.top} y2={pad.top + plotH} stroke="var(--border-hover)" strokeWidth={1} />
            <text x={fsX + 8} y={pad.top + 14} fontSize={11} fontWeight={600} fill="var(--muted)">
              {forecastLabel} →
            </text>
          </g>
        )}

        {/* x ekseni */}
        {g.ticks.map((tk) => (
          <text key={`x${tk.i}`} x={tk.x} y={height - 9} textAnchor={tk.i === 0 && n > 1 ? 'start' : 'middle'} fontSize={11} fill="var(--faint)">
            {tk.text}
          </text>
        ))}

        {/* İşaretçiler */}
        {g.markers.map((m, k) => (
          <g key={`m${k}`}>
            <line x1={m.x} x2={m.x} y1={pad.top - 4} y2={pad.top + plotH} stroke="var(--border-hover)" strokeWidth={1} />
            <text x={m.x} y={pad.top - 9} textAnchor={m.anchor} fontSize={11} fontWeight={600} fill="var(--text-3)">
              {m.label}
            </text>
          </g>
        ))}

        <g clipPath={`url(#clip${uid})`}>
          {g.paths.map((p, si) => (p.band ? <path key={`b${si}`} d={p.band} fill={seriesColor(si)} opacity={0.15} /> : null))}
          {g.paths.map((p, si) => (p.fill ? <path key={`a${si}`} d={p.fill} fill={`url(#fill${uid}${si})`} /> : null))}
          {g.paths.map((p, si) => (
            <g key={`l${si}`}>
              <path d={p.actual} fill="none" stroke={seriesColor(si)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {p.forecast && <path d={p.forecast} fill="none" stroke={seriesColor(si)} strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4" />}
              {g.dots &&
                series[si].values.map((v, i) =>
                  v === null || v === undefined || i === g.lastIdx[si] ? null : (
                    <circle key={i} cx={xs[i]} cy={y(v)} r={3} fill={seriesColor(si)} stroke="var(--surface-2)" strokeWidth={1.5} />
                  ),
                )}
            </g>
          ))}
          {g.ends.map((e) => (
            <g key={`e${e.si}`}>
              <circle cx={xs[e.idx]} cy={e.y0} r={4.5} fill={seriesColor(e.si)} stroke="var(--surface-2)" strokeWidth={2} />
              {Math.abs(e.y - e.y0) > 2 && <path d={`M${xs[e.idx] + 6},${e.y0}L${xs[e.idx] + 12},${e.y}`} stroke="var(--border-hover)" fill="none" />}
              <text x={xs[e.idx] + 14} y={e.y + 4} fontSize={12}>
                {multi && <tspan fill="var(--muted)">{truncate(series[e.si].name, 18)}  </tspan>}
                <tspan fill="var(--text)" fontWeight={600}>
                  {fmtValue(series[e.si].values[e.idx], spec.valueFormat, lang)}
                </tspan>
              </text>
            </g>
          ))}
        </g>

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={xs[hover]} x2={xs[hover]} y1={pad.top} y2={pad.top + plotH} stroke="var(--text-3)" strokeOpacity={0.45} strokeWidth={1} />
            {series.map((s, si) => {
              const v = s.values[hover];
              return v === null || v === undefined ? null : <circle key={si} cx={xs[hover]} cy={y(v)} r={5} fill={seriesColor(si)} stroke="var(--surface-2)" strokeWidth={2} />;
            })}
          </g>
        )}
        <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onPointer} onPointerDown={onPointer} />
      </svg>

      {hover !== null && (
        <div className="tooltip chart-tip" style={{ left: tipRight ? xs[hover] - 14 : xs[hover] + 14, top: pad.top + 2, transform: tipRight ? 'translateX(-100%)' : undefined }}>
          <div className="tooltip-title">
            <span>{g.fullLabel(hover)}</span>
            {fs !== null && hover >= fs && <span className="tip-tag">{forecastLabel}</span>}
          </div>
          {series.map((s, si) => {
            const v = s.values[hover];
            const lowV = s.low?.[hover];
            const highV = s.high?.[hover];
            const showRange = lowV !== null && lowV !== undefined && highV !== null && highV !== undefined && Math.abs(highV - lowV) > 1e-9;
            return (
              <div key={si} className="tip-series">
                <div className="tooltip-row">
                  <span className="tip-name">
                    <LineKey color={seriesColor(si)} dashed={fs !== null && hover >= fs} />
                    <span className="tip-label">{s.name}</span>
                  </span>
                  <strong>{fmtValue(v, spec.valueFormat, lang, 'full')}</strong>
                </div>
                {showRange && (
                  <div className="tip-range-row">
                    {spec.bandLabel ?? t.chart.band}: {fmtValue(lowV, spec.valueFormat, lang)}–{fmtValue(highV, spec.valueFormat, lang)}
                  </div>
                )}
              </div>
            );
          })}
          {spec.unit && spec.valueFormat !== 'percent' && <div className="tip-unit">{spec.unit}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Sütun grafik

const PAD = { top: 16, right: 16, bottom: 30, left: 46 };

export function ColumnChart({ spec, height = 270 }: { spec: ChartSpec; height?: number }) {
  const lang = useLang();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { categories, series } = spec;
  const finite = series.flatMap((s) => s.values).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  const { lo, hi, step } = yDomain(finite, true);
  const tickTexts = range(lo, hi, step).map((v) => fmtValue(v, spec.valueFormat, lang));
  const pad = { ...PAD, left: Math.max(38, Math.max(...tickTexts.map((x) => x.length)) * 6.6 + 14) };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const y = (v: number) => pad.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / categories.length;
  const maxBar = 24;
  const groupW = Math.min(band * 0.72, maxBar * series.length + 2 * (series.length - 1));
  const barW = (groupW - 2 * (series.length - 1)) / series.length;
  const maxChars = Math.max(4, Math.floor(band / 7));
  return (
    <div className="chart-wrap" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="presentation">
        {range(lo, hi, step).map((v, i) => (
          <g key={v}>
            <line x1={pad.left} x2={width - pad.right} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
            <text x={pad.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--faint)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {tickTexts[i]}
            </text>
          </g>
        ))}
        {categories.map((c, ci) => {
          const x0 = pad.left + ci * band + (band - groupW) / 2;
          return (
            <g key={`${c}-${ci}`} onMouseEnter={() => setHover(ci)}>
              <rect x={pad.left + ci * band} y={pad.top} width={band} height={plotH} fill={hover === ci ? 'var(--surface-3)' : 'transparent'} />
              {series.map((s, si) => {
                const v = s.values[ci];
                if (v === null || v === undefined) return null;
                const top = y(Math.max(v, 0));
                const h = Math.max(1, Math.abs(y(v) - y(0)));
                const r = Math.min(4, barW / 2, h);
                const x = x0 + si * (barW + 2);
                const w = Math.max(barW, 2);
                // 4px yuvarlak veri ucu, tabanda köşeli
                const d = v >= 0 ? `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z` : `M${x},${top}V${top + h - r}Q${x},${top + h} ${x + r},${top + h}H${x + w - r}Q${x + w},${top + h} ${x + w},${top + h - r}V${top}Z`;
                return <path key={si} d={d} fill={seriesColor(si)} />;
              })}
              {series.length === 1 && series[0].values[ci] !== null && categories.length <= 12 && (
                <text x={pad.left + ci * band + band / 2} y={y(Math.max(series[0].values[ci]!, 0)) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text-2)">
                  {fmtValue(series[0].values[ci], spec.valueFormat, lang)}
                </text>
              )}
              <text x={pad.left + ci * band + band / 2} y={height - 10} textAnchor="middle" fontSize={11} fill="var(--faint)">
                {truncate(c, maxChars)}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(pad.left + hover * band + band / 2, 90), width - 90), top: 0, transform: 'translate(-50%, -100%)' }}>
          <div className="tooltip-title">{categories[hover]}</div>
          {series.map((s, si) => (
            <div className="tooltip-row" key={si}>
              <span className="tip-name">
                <span className="legend-box" style={{ background: seriesColor(si) }} />
                {truncate(s.name, 28)}
              </span>
              <strong>
                {fmtValue(s.values[hover], spec.valueFormat, lang, 'full')}
                {spec.unit && spec.valueFormat !== 'percent' ? <span className="tip-range"> {spec.unit}</span> : null}
              </strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Yatay çubuk

export function BarChart({ spec }: { spec: ChartSpec }) {
  const lang = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const { categories, series } = spec;
  const max = Math.max(1e-9, ...series.flatMap((s) => s.values).map((v) => Math.abs(v ?? 0)));
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
                  {fmtValue(series[0].values[ci], spec.valueFormat, lang, hover === ci ? 'full' : 'short')}
                  {spec.unit && spec.valueFormat !== 'percent' ? <span className="faint" style={{ fontWeight: 400 }}> {spec.unit}</span> : null}
                </>
              ) : (
                series.map((s, si) => (
                  <span key={si} style={{ marginLeft: si ? 10 : 0 }}>
                    <span className="dot" style={{ background: seriesColor(si), marginRight: 4 }} />
                    {fmtValue(s.values[ci], spec.valueFormat, lang)}
                  </span>
                ))
              )}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {series.map((s, si) => (
              <div key={si} style={{ height: series.length === 1 ? 10 : 8, background: 'var(--surface-4)', borderRadius: '0 4px 4px 0' }}>
                <div className="hbar-fill" style={{ width: `${(Math.abs(s.values[ci] ?? 0) / max) * 100}%`, background: seriesColor(si) }} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Tablo görünümü

export function ChartTable({ spec }: { spec: ChartSpec }) {
  const lang = useLang();
  const t = useT();
  const times = spec.xType === 'time' && spec.categories.every((c) => parseTime(c) !== null) ? spec.categories.map((c) => parseTime(c)!) : null;
  const grain = times ? grainOf(spec.categories[0]) : 'day';
  const banded = spec.series.map((s) => !!(s.low && s.high));
  return (
    <div className="table-wrap chart-table">
      <table className="data-table">
        <thead>
          <tr>
            <th>{times ? t.chart.date : t.chart.category}</th>
            {spec.series.map((s, si) => (
              <th key={si} className="num">
                {s.name}
                {banded[si] && <span className="faint"> ({spec.bandLabel ?? t.chart.band})</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.categories.map((c, i) => (
            <tr key={i} className={spec.forecastStart !== undefined && i >= spec.forecastStart ? 'row-forecast' : undefined}>
              <td>
                {times ? timeLabel(times[i], grain, lang, 'full', 0) : c}
                {spec.forecastStart !== undefined && i >= spec.forecastStart && <span className="tip-tag">{spec.forecastLabel ?? t.chart.forecast}</span>}
              </td>
              {spec.series.map((s, si) => {
                const lowV = s.low?.[i];
                const highV = s.high?.[i];
                return (
                  <td key={si} className="num">
                    {fmtValue(s.values[i], spec.valueFormat, lang, 'full')}
                    {banded[si] && lowV !== null && lowV !== undefined && highV !== null && highV !== undefined && Math.abs(highV - lowV) > 1e-9 && (
                      <span className="faint">
                        {' '}
                        ({fmtValue(lowV, spec.valueFormat, lang)}–{fmtValue(highV, spec.valueFormat, lang)})
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
