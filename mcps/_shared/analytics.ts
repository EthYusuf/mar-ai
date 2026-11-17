/**
 * mar-ai analitik çekirdeği: zaman serisi istatistikleri ve tahmin.
 *
 * Tahmin modeli: log1p ölçeğinde, sönümlü trendli Holt-Winters (toplamsal mevsimsellik).
 *  - Parametreler (alfa, beta, gama, phi) bir adım ileri tahmin hatası en küçük olacak şekilde
 *    ızgara aramasıyla seçilir.
 *  - Tahmin aralığı: modelin kendi bir adım ileri hatalarından yeniden örnekleme (bootstrap) ile
 *    yüzlerce gelecek yolu simüle edilir; bant bu yolların yüzdeliklerinden gelir.
 *  - Sönümlü trend (phi < 1) uzun vadede patlayan/çöken tahminleri engeller.
 */

export const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- Tarih

export function isoDay(t: number | Date): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, n: number): string {
  return isoDay(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS);
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${bIso}T00:00:00Z`) - Date.parse(`${aIso}T00:00:00Z`)) / DAY_MS);
}

/** Pazartesi başlangıçlı ISO hafta başı */
export function weekStartIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return isoDay(d.getTime() - dow * DAY_MS);
}

// ---------------------------------------------------------------- İstatistik

export function sum(xs: number[]): number {
  let s = 0;
  for (const x of xs) s += x;
  return s;
}

export function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Sıralı dizide doğrusal enterpolasyonlu yüzdelik (q: 0..1) */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function pctChange(now: number, before: number): number | null {
  return before > 0 && Number.isFinite(now) ? ((now - before) / before) * 100 : null;
}

export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Geriye dönük kayan ortalama (ilk noktalarda eldeki kadar değerle) */
export function rollingMean(xs: number[], w: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    acc += xs[i];
    if (i >= w) acc -= xs[i - w];
    out.push(acc / Math.min(i + 1, w));
  }
  return out;
}

export function rollingMedian(xs: number[], w: number): number[] {
  return xs.map((_, i) => {
    const win = xs.slice(Math.max(0, i - w + 1), i + 1).sort((a, b) => a - b);
    return quantile(win, 0.5);
  });
}

/** En küçük kareler doğrusu: y = intercept + slope * x (x = 0..n-1) */
export function linearFit(ys: number[]): { slope: number; intercept: number; residualStd: number } {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, residualStd: 0 };
  const mx = (n - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  const intercept = my - slope * mx;
  const res = ys.map((y, i) => y - (intercept + slope * i));
  return { slope, intercept, residualStd: n > 2 ? Math.sqrt(sum(res.map((r) => r * r)) / (n - 2)) : 0 };
}

/** Değişim katsayısı (std / ortalama) */
export function coefVar(xs: number[]): number {
  const m = mean(xs);
  return m > 0 ? std(xs) / m : 0;
}

// ---------------------------------------------------------------- Tahmin

export interface ForecastResult {
  /** Nokta tahmini (orijinal ölçek, ≥ 0) */
  point: number[];
  /** Simüle edilmiş gelecek yolları (orijinal ölçek) — kayan ortalama bantları için */
  paths: number[][];
  /** Yolların alt/üst yüzdelikleri (orijinal ölçek) */
  low: number[];
  high: number[];
  /** Aralığın güven düzeyi, örn. 0.8 */
  level: number;
  params: { alpha: number; beta: number; gamma: number; phi: number; season: number };
  /** Bir adım ileri hata std'si (log ölçeği) */
  residualStd: number;
}

interface HwState {
  level: number;
  trend: number;
  seasonal: number[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hwInit(z: number[], m: number): { state: HwState; start: number } {
  if (m > 1 && z.length >= 2 * m) {
    const m1 = mean(z.slice(0, m));
    const m2 = mean(z.slice(m, 2 * m));
    return { state: { level: m1, trend: (m2 - m1) / m, seasonal: z.slice(0, m).map((v) => v - m1) }, start: m };
  }
  return { state: { level: z[0], trend: 0, seasonal: [0] }, start: 1 };
}

function hwStep(st: HwState, obs: number, t: number, m: number, a: number, b: number, g: number, phi: number): void {
  const si = t % m;
  const sPrev = st.seasonal[si];
  const level = a * (obs - sPrev) + (1 - a) * (st.level + phi * st.trend);
  const trend = b * (level - st.level) + (1 - b) * phi * st.trend;
  st.seasonal[si] = m > 1 ? g * (obs - level) + (1 - g) * sPrev : 0;
  st.level = level;
  st.trend = trend;
}

function hwFit(z: number[], m: number, a: number, b: number, g: number, phi: number): { sse: number; residuals: number[]; state: HwState } {
  const { state, start } = hwInit(z, m);
  const residuals: number[] = [];
  let sse = 0;
  const warmup = start + Math.max(3, m);
  for (let t = start; t < z.length; t++) {
    const pred = state.level + phi * state.trend + state.seasonal[t % m];
    const e = z[t] - pred;
    if (t >= warmup) {
      residuals.push(e);
      sse += e * e;
    }
    hwStep(state, z[t], t, m, a, b, g, phi);
  }
  return { sse, residuals, state };
}

/**
 * Bir zaman serisini tahmin eder.
 * @param y        gözlemler (≥ 0), eşit aralıklı
 * @param horizon  kaç adım ileri
 * @param season   mevsim uzunluğu (günlük veride 7; yoksa 1)
 */
export function forecastSeries(y: number[], opts: { horizon: number; season?: number; level?: number; paths?: number; seed?: number }): ForecastResult {
  const horizon = Math.max(1, Math.round(opts.horizon));
  const level = opts.level ?? 0.8;
  const nPaths = opts.paths ?? 400;
  const z = y.map((v) => Math.log1p(Math.max(0, v)));
  const n = z.length;

  // Çok kısa seriler: son değer + geniş bant
  if (n < 8) {
    const last = y[n - 1] ?? 0;
    const point = Array(horizon).fill(last);
    return {
      point,
      paths: [point],
      low: point.map((v) => v * 0.6),
      high: point.map((v) => v * 1.5),
      level,
      params: { alpha: 1, beta: 0, gamma: 0, phi: 1, season: 1 },
      residualStd: 0,
    };
  }

  const m = opts.season && opts.season > 1 && n >= 3 * opts.season ? opts.season : 1;
  const alphas = [0.1, 0.2, 0.3, 0.5, 0.7];
  const betas = [0.01, 0.05, 0.1, 0.2];
  const gammas = m > 1 ? [0.05, 0.1, 0.2, 0.35] : [0];
  const phis = [0.8, 0.9, 0.95, 0.98];
  let best = { sse: Infinity, a: 0.3, b: 0.05, g: 0.1, phi: 0.9 };
  for (const a of alphas)
    for (const b of betas)
      for (const g of gammas)
        for (const phi of phis) {
          const { sse } = hwFit(z, m, a, b, g, phi);
          if (sse < best.sse) best = { sse, a, b, g, phi };
        }

  const fit = hwFit(z, m, best.a, best.b, best.g, best.phi);
  const residuals = fit.residuals.length ? fit.residuals : [0];
  const residualStd = std(residuals);

  // Nokta tahmini
  const point: number[] = [];
  let damp = 0;
  for (let h = 1; h <= horizon; h++) {
    damp += best.phi ** h;
    const zh = fit.state.level + damp * fit.state.trend + fit.state.seasonal[(n - 1 + h) % m];
    point.push(Math.max(0, Math.expm1(zh)));
  }

  // Bootstrap yolları
  const rand = mulberry32(opts.seed ?? 20261117);
  const paths: number[][] = [];
  for (let p = 0; p < nPaths; p++) {
    const st: HwState = { level: fit.state.level, trend: fit.state.trend, seasonal: [...fit.state.seasonal] };
    const path: number[] = [];
    for (let h = 1; h <= horizon; h++) {
      const t = n - 1 + h;
      const mu = st.level + best.phi * st.trend + st.seasonal[t % m];
      const zs = mu + residuals[Math.floor(rand() * residuals.length)];
      hwStep(st, zs, t, m, best.a, best.b, best.g, best.phi);
      path.push(Math.max(0, Math.expm1(zs)));
    }
    paths.push(path);
  }
  const qLo = (1 - level) / 2;
  const qHi = 1 - qLo;
  const low: number[] = [];
  const high: number[] = [];
  for (let h = 0; h < horizon; h++) {
    const col = paths.map((p) => p[h]).sort((a, b) => a - b);
    low.push(quantile(col, qLo));
    high.push(quantile(col, qHi));
  }
  return { point, paths, low, high, level, params: { alpha: best.a, beta: best.b, gamma: best.g, phi: best.phi, season: m }, residualStd };
}

/**
 * Gözlemlerin ve tahmin yollarının w günlük kayan ortalaması: grafik için pürüzsüz merkez çizgi ve bant.
 * Tahmin bölgesinin ilk günleri, ortalama penceresine son gözlemleri de katar.
 */
export function smoothedForecast(history: number[], fc: ForecastResult, w: number): { history: number[]; point: number[]; low: number[]; high: number[] } {
  const hist = rollingMean(history, w);
  const tail = history.slice(-(w - 1));
  const roll = (path: number[]) => rollingMean([...tail, ...path], w).slice(tail.length);
  const point = roll(fc.point);
  const rolled = fc.paths.map(roll);
  const qLo = (1 - fc.level) / 2;
  const low: number[] = [];
  const high: number[] = [];
  for (let h = 0; h < fc.point.length; h++) {
    const col = rolled.map((p) => p[h]).sort((a, b) => a - b);
    low.push(Math.min(quantile(col, qLo), point[h]));
    high.push(Math.max(quantile(col, 1 - qLo), point[h]));
  }
  return { history: hist, point, low, high };
}

/** Tahmin edilen dönemin toplamı için aralık (yolların toplamlarının yüzdelikleri) */
export function forecastTotal(fc: ForecastResult): { point: number; low: number; high: number } {
  const totals = fc.paths.map((p) => sum(p)).sort((a, b) => a - b);
  const qLo = (1 - fc.level) / 2;
  return { point: sum(fc.point), low: quantile(totals, qLo), high: quantile(totals, 1 - qLo) };
}
