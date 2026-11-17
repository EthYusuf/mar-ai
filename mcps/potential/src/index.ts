/**
 * mar-ai · Potansiyel ve Tahmin MCP
 *
 * Pazarlamacının "bu konu büyüyor mu, ne zaman zirve yapar, hangi pazar daha büyük?" sorularına
 * çizgi grafik ve tahminle cevap verir. Kaynakların hepsi ücretsiz, anahtarsız ve girişsizdir:
 *  - Wikimedia Pageviews API (resmi): Wikipedia kullanıcı görüntülenmeleri, ilgi göstergesi
 *  - Our World in Data (CC BY 4.0): ITU internet kullanımı, BM nüfus projeksiyonları, Dünya Bankası
 *
 * Grafik verisi chart_ref ile doğrudan rapor alanına gider (bkz. mcps/_shared/charts.ts).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ChartMarker, ChartSeries } from '../../../shared/types';
import { ok, fail, safe, startServer, uiLang, MARAI_VERSION } from '../../_shared/common';
import {
  addDaysIso,
  coefVar,
  forecastSeries,
  forecastTotal,
  isoDay,
  linearFit,
  mean,
  pctChange,
  quantile,
  rollingMean,
  round,
  smoothedForecast,
  sum,
} from '../../_shared/analytics';
import { dailyViews, monthlyViews, resolveArticle, type WikiArticle } from '../../_shared/wiki';
import { chartHint, saveChart } from '../../_shared/charts';
import { entityName, loadOwidTable, yearly, type OwidTable } from './owid';
import { countryLabel, resolveCountry } from './countries';

const server = new McpServer({ name: 'mar-potential', version: MARAI_VERSION });

const tt = (tr: string, en: string) => (uiLang() === 'tr' ? tr : en);
const r1 = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? null : round(n, 1));
const locale = () => (uiLang() === 'tr' ? 'tr-TR' : 'en-US');
const monthName = (m: number, style: 'short' | 'long') => new Intl.DateTimeFormat(locale(), { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15)));

const WIKI_LANG = z
  .string()
  .regex(/^[a-z]{2,3}$/)
  .optional()
  .describe('Wikipedia dil kodu, örn. tr, en, de, fr, es, ar (varsayılan: arayüz dili; makale bulunamazsa en denenir)');

async function findArticle(topic: string, lang: string, exact: boolean): Promise<WikiArticle | null> {
  const hit = await resolveArticle(topic, lang, exact);
  if (hit || lang === 'en') return hit;
  return resolveArticle(topic, 'en', exact);
}

// ================================================================ trend_potential

type Phase = 'emerging' | 'rising' | 'peaking' | 'cooling' | 'steady';
const PHASE_LABEL: Record<Phase, [string, string]> = {
  emerging: ['Yeni filizleniyor', 'Emerging'],
  rising: ['Yükseliyor', 'Rising'],
  peaking: ['Zirvede', 'Peaking'],
  cooling: ['Soğuyor', 'Cooling'],
  steady: ['Durağan', 'Steady'],
};

interface TopicResult {
  topic: string;
  article: WikiArticle;
  dates: string[];
  raw: number[];
  smoothHist: number[];
  fcPoint: number[];
  fcLow: number[];
  fcHigh: number[];
  out: Record<string, unknown>;
  score: number;
  phase: Phase;
}

function classify(m: { momentum: number | null; growth30: number | null; growth90: number | null; expected: number | null; nearPeak: boolean }): Phase {
  const mom = m.momentum ?? 0;
  const g30 = m.growth30 ?? 0;
  const exp = m.expected ?? 0;
  if ((m.growth90 ?? 0) >= 80 && mom >= 10) return 'emerging';
  if (g30 >= 12 && mom >= -5) return 'rising';
  if (g30 <= -12 || (mom <= -15 && exp <= -5)) return 'cooling';
  if (m.nearPeak && mom < 8 && exp < 3) return 'peaking';
  return 'steady';
}

server.registerTool(
  'trend_potential',
  {
    title: 'Trend potansiyeli ve tahmin',
    description:
      'Bir veya birkaç konunun/markanın/ürünün kamu ilgisini Wikipedia günlük görüntülenmeleriyle ölçer ve önümüzdeki günler için TAHMİN üretir: 7 günlük ortalama çizgisi + kesikli tahmin çizgisi + %80 tahmin aralığı. Her konu için ivme (son 7 gün vs önceki 28 gün), 30 günlük büyüme, 90 gün önceye göre değişim, zirve ve ani sıçramalar, beklenen değişim, faz (Yükseliyor / Zirvede / Soğuyor / Durağan / Yeni filizleniyor) ve 0-100 potansiyel skoru döner. Hazır çizgi grafiği chart_ref ile gelir. "Bu trend büyüyor mu?", "hangisinin potansiyeli daha yüksek?", "içerik için doğru zaman mı?" soruları için kullan.',
    inputSchema: {
      topics: z.array(z.string().min(1).max(120)).min(1).max(4).describe('Konu, marka veya ürün adları; Wikipedia makalesi olarak aranır. Örn. ["Matcha", "Kombucha"]'),
      lang: WIKI_LANG,
      exact: z.boolean().default(false).describe('true: topics, tam Wikipedia makale başlıklarıdır (yanlış makale seçildiyse other_candidates içinden doğrusunu ver)'),
      history_days: z.number().int().min(60).max(730).default(180).describe('Grafikte gösterilecek geçmiş gün sayısı'),
      horizon_days: z.number().int().min(7).max(90).default(30).describe('Kaç gün ileri tahmin edilecek'),
      scale: z.enum(['auto', 'absolute', 'indexed']).default('auto').describe('indexed: her konu kendi dönem ortalamasına göre 100 (ölçekleri çok farklı konular için); auto bunu kendisi seçer'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ topics, lang, exact, history_days, horizon_days, scale }) => {
    const wikiLang = lang ?? uiLang();
    const H = horizon_days;
    const end = addDaysIso(isoDay(Date.now()), -1);
    const fetchDays = Math.max(history_days, 150) + 6 + (history_days >= 395 ? 30 : 0);
    const start = addDaysIso(end, -(fetchDays - 1));

    const errors: Array<{ topic: string; error: string }> = [];
    const loaded: Array<{ topic: string; article: WikiArticle; rows: Array<{ date: string; views: number }> }> = [];
    for (const topic of topics) {
      const article = await findArticle(topic, wikiLang, exact);
      if (!article) {
        errors.push({ topic, error: tt('Wikipedia makalesi bulunamadı; farklı bir ad veya dil deneyin.', 'No Wikipedia article found; try another name or language.') });
        continue;
      }
      const rows = await dailyViews(article.lang, article.title, start, end);
      if (rows.length < 60) {
        errors.push({ topic, error: tt(`"${article.title}" için yeterli görüntülenme verisi yok.`, `Not enough pageview data for "${article.title}".`) });
        continue;
      }
      loaded.push({ topic, article, rows });
    }
    if (!loaded.length) return fail(errors.map((e) => `${e.topic}: ${e.error}`).join(' · '));

    // Ortak son gün (Wikimedia verisi konulara göre birkaç saat farklı yayınlanabilir)
    const lastDate = loaded.map((l) => l.rows[l.rows.length - 1].date).sort()[0];
    const histDates: string[] = [];
    for (let i = history_days - 1; i >= 0; i--) histDates.push(addDaysIso(lastDate, -i));
    const fcDates = Array.from({ length: H }, (_, i) => addDaysIso(lastDate, i + 1));

    const results: TopicResult[] = loaded.map(({ topic, article, rows }) => {
      const cut = rows.filter((r) => r.date <= lastDate);
      const v = cut.map((r) => r.views);
      const n = v.length;
      const avg = (a: number, b: number) => mean(v.slice(Math.max(0, n - a), n - b));
      const avg7 = avg(7, 0);
      const avg30 = avg(30, 0);
      const momentum = pctChange(avg7, avg(35, 7));
      const growth30 = pctChange(avg30, avg(60, 30));
      const growth90 = n >= 120 ? pctChange(avg30, avg(120, 90)) : null;
      const yoy = n >= 395 ? pctChange(avg30, avg(395, 365)) : null;

      const roll7 = rollingMean(v, 7);
      const winRoll = roll7.slice(-history_days);
      const winRaw = v.slice(-history_days);
      const winDates = cut.slice(-history_days).map((r) => r.date);
      let peakIdx = 0;
      winRoll.forEach((x, i) => {
        if (x > winRoll[peakIdx]) peakIdx = i;
      });
      const nearPeak = avg7 >= 0.85 * Math.max(...winRoll);
      const med = quantile([...winRaw].sort((a, b) => a - b), 0.5);
      const spikes = winRaw
        .map((x, i) => ({ date: winDates[i], views: x, x_normal: med > 0 ? round(x / med, 1) : 0 }))
        .filter((s) => s.x_normal >= 3)
        .sort((a, b) => b.x_normal - a.x_normal)
        .filter((s, i, arr) => arr.findIndex((o) => Math.abs(Date.parse(o.date) - Date.parse(s.date)) < 4 * 86400_000) === i)
        .slice(0, 3);

      const fitData = v.slice(Math.max(0, n - 365));
      const fc = forecastSeries(fitData, { horizon: H, season: 7, level: 0.8, paths: 400 });
      const total = forecastTotal(fc);
      const expected = pctChange(total.point / H, avg30);
      const sm = smoothedForecast(fitData, fc, 7);
      const stability = 1 - Math.min(1, coefVar(roll7.slice(-56)));

      const comp = {
        expected_change: 20 * Math.tanh((expected ?? 0) / 30),
        momentum: 14 * Math.tanh((momentum ?? 0) / 40),
        long_trend: 10 * Math.tanh(((growth90 ?? growth30) ?? 0) / 60),
        stability: 6 * (2 * stability - 1),
      };
      const score = Math.max(0, Math.min(100, Math.round(50 + sum(Object.values(comp)))));
      const phase = classify({ momentum, growth30, growth90, expected, nearPeak });
      const label = PHASE_LABEL[phase][uiLang() === 'tr' ? 0 : 1];

      return {
        topic,
        article,
        dates: winDates,
        raw: winRaw,
        smoothHist: winRoll,
        fcPoint: sm.point,
        fcLow: sm.low,
        fcHigh: sm.high,
        score,
        phase,
        out: {
          topic,
          article: article.title,
          url: article.url,
          wiki_lang: article.lang,
          other_candidates: article.candidates.filter((c) => c !== article.title).slice(0, 3),
          avg_daily_views_30d: Math.round(avg30),
          momentum_7d_vs_prev28d_pct: r1(momentum),
          growth_30d_pct: r1(growth30),
          change_vs_90d_ago_pct: r1(growth90),
          yoy_pct: r1(yoy),
          peak_7d_avg: { date: winDates[peakIdx], views_per_day: Math.round(winRoll[peakIdx]) },
          top_spikes: spikes,
          forecast: {
            days: H,
            total_views: Math.round(total.point),
            low_80: Math.round(total.low),
            high_80: Math.round(total.high),
            expected_change_vs_last30d_pct: r1(expected),
          },
          phase,
          phase_label: label,
          potential_score: score,
          data_quality:
            avg30 < 100
              ? tt(
                  'Düşük hacim (günde 100’den az görüntülenme): sonuçlar gürültülü olabilir. Küresel konular için lang "en" ile tekrar dene.',
                  'Low volume (under 100 views a day): results may be noisy. For global topics, retry with lang "en".',
                )
              : undefined,
          score_breakdown: Object.fromEntries(Object.entries(comp).map(([k, x]) => [k, round(x, 1)])),
        },
      };
    });

    // Ölçek seçimi
    const avgs = results.map((r) => mean(r.smoothHist));
    const ratio = Math.max(...avgs) / Math.max(1, Math.min(...avgs));
    const indexed = scale === 'indexed' || (scale === 'auto' && results.length > 1 && ratio > 8);

    const series: ChartSeries[] = results.map((r, i) => {
      const base = indexed ? Math.max(1e-9, avgs[i]) / 100 : 1;
      const hist = r.smoothHist.map((x) => x / base);
      const lastHist = hist[hist.length - 1];
      const pad = Array<number | null>(hist.length - 1).fill(null);
      const dup = results.filter((o) => o.article.title === r.article.title).length > 1;
      return {
        name: dup ? `${r.article.title} (${r.article.lang})` : r.article.title,
        values: [...hist, ...r.fcPoint.map((x) => x / base)],
        low: [...pad, lastHist, ...r.fcLow.map((x) => x / base)],
        high: [...pad, lastHist, ...r.fcHigh.map((x) => x / base)],
      };
    });
    // Geçmiş penceresi kısa kalan konu olursa (yeni makale) başını null ile doldur
    for (const s of series) {
      const missing = history_days + H - s.values.length;
      if (missing > 0) {
        s.values = [...Array(missing).fill(null), ...s.values];
        s.low = [...Array(missing).fill(null), ...(s.low ?? [])];
        s.high = [...Array(missing).fill(null), ...(s.high ?? [])];
      }
    }
    const markers: ChartMarker[] = [];
    if (results.length === 1) {
      const r = results[0];
      let peakIdx = 0;
      r.smoothHist.forEach((x, i) => {
        if (x > r.smoothHist[peakIdx]) peakIdx = i;
      });
      if (peakIdx < r.smoothHist.length - 3) markers.push({ index: peakIdx + (history_days - r.smoothHist.length), label: tt('Zirve', 'Peak') });
    }
    const names = results.map((r) => r.article.title).join(' vs ');
    const chartRef = saveChart({
      title: tt(`${names} · ilgi ve ${H} günlük tahmin`, `${names} · interest and ${H}-day forecast`),
      subtitle: tt(
        `Wikipedia günlük görüntülenme, 7 günlük ortalama${indexed ? ' · 100 = konunun dönem ortalaması' : ''} · kesikli çizgi tahmin`,
        `Wikipedia daily pageviews, 7-day average${indexed ? ' · 100 = topic’s period average' : ''} · dashed line is the forecast`,
      ),
      note: tt(
        'Tahmin: log ölçeğinde, sönümlü trendli Holt-Winters (haftalık mevsimsellik); gölgeli alan 400 simülasyondan %80 aralık. Wikipedia ilgisi, arama ilgisinin bir göstergesidir.',
        'Forecast: damped-trend Holt-Winters on a log scale (weekly seasonality); the shaded area is the 80% range from 400 simulations. Wikipedia interest is a proxy for search interest.',
      ),
      sources: ['Wikimedia Pageviews API'],
      spec: {
        chartType: results.length === 1 ? 'area' : 'line',
        xType: 'time',
        categories: [...histDates, ...fcDates],
        series,
        forecastStart: history_days,
        markers,
        unit: indexed ? tt('endeks', 'index') : tt('görüntülenme/gün', 'views/day'),
        valueFormat: 'number',
        bandLabel: tt('%80 tahmin aralığı', '80% forecast range'),
      },
    });

    const ranking = [...results].sort((a, b) => b.score - a.score).map((r) => ({ topic: r.article.title, potential_score: r.score, phase: PHASE_LABEL[r.phase][uiLang() === 'tr' ? 0 : 1] }));
    return ok({
      source: tt('Wikimedia Pageviews API — Wikipedia kullanıcı görüntülenmeleri (bot trafiği hariç)', 'Wikimedia Pageviews API — Wikipedia user pageviews (bots excluded)'),
      period: { from: histDates[0], to: lastDate, forecast_to: fcDates[H - 1] },
      scale: indexed ? 'indexed' : 'absolute',
      ranking,
      topics: results.map((r) => r.out),
      errors: errors.length ? errors : undefined,
      chart_ref: chartRef,
      chart_hint: chartHint(chartRef, uiLang()),
      how_to_read: tt(
        'Potansiyel skoru 0-100: beklenen değişim %40, ivme %28, uzun vadeli eğilim %20, istikrar %12 ağırlıklı. 60 üstü güçlü, 40-60 nötr, 40 altı zayıf. Mutlak ilgi büyüklüğünü avg_daily_views_30d gösterir.',
        'Potential score 0-100: weights are expected change 40%, momentum 28%, long-term trend 20%, stability 12%. Above 60 strong, 40-60 neutral, below 40 weak. avg_daily_views_30d shows absolute interest.',
      ),
    });
  }),
);

// ================================================================ seasonality

server.registerTool(
  'seasonality',
  {
    title: 'Sezonsallık ve kampanya zamanlaması',
    description:
      'Bir konunun yıllar içindeki aylık ilgisini (Wikipedia, 2-8 yıl) analiz eder: hangi aylarda zirve yaptığı, en düşük aylar, sezonsallık gücü, son 12 ayın önceki 12 aya göre değişimi, bir sonraki zirveye kalan süre ve kampanyaya başlamak için en iyi pencere. İki hazır çizgi grafik döner: aylık sezon profili (ortalama + yıllar arası aralık + son 12 ay) ve çok yıllık aylık seri. "Ne zaman kampanya yapmalıyım?", "bu ürün mevsimsel mi?" soruları için kullan.',
    inputSchema: {
      topic: z.string().min(1).max(120).describe('Konu, ürün veya marka adı, örn. "Dondurma"'),
      lang: WIKI_LANG,
      exact: z.boolean().default(false),
      years: z.number().int().min(2).max(8).default(4).describe('Karşılaştırılacak yıl sayısı'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ topic, lang, exact, years }) => {
    const article = await findArticle(topic, lang ?? uiLang(), exact);
    if (!article) return fail(tt('Wikipedia makalesi bulunamadı; farklı bir ad veya dil deneyin.', 'No Wikipedia article found; try another name or language.'));
    const now = new Date();
    let ey = now.getUTCFullYear();
    let em = now.getUTCMonth(); // önceki ay (1-12)
    if (em === 0) {
      em = 12;
      ey--;
    }
    const totalMonths = years * 12;
    let sy = ey;
    let sm = em - (totalMonths - 1);
    while (sm < 1) {
      sm += 12;
      sy--;
    }
    const pad = (x: number) => String(x).padStart(2, '0');
    let rows = await monthlyViews(article.lang, article.title, `${sy}-${pad(sm)}`, `${ey}-${pad(em)}`);
    const firstNonZero = rows.findIndex((r) => r.views > 0);
    rows = firstNonZero >= 0 ? rows.slice(firstNonZero) : [];
    const blocks = Math.floor(rows.length / 12);
    if (blocks < 2) return fail(tt(`"${article.title}" için en az 24 aylık veri gerekiyor.`, `At least 24 months of data are needed for "${article.title}".`));
    rows = rows.slice(rows.length - blocks * 12);

    // Her 12 aylık blok kendi ortalamasına göre endekslenir; takvim aylarına göre karşılaştırılır.
    const byMonth = new Map<number, number[]>();
    const blockIdx: number[][] = [];
    for (let b = 0; b < blocks; b++) {
      const chunk = rows.slice(b * 12, b * 12 + 12);
      const avg = mean(chunk.map((c) => c.views));
      const idx = chunk.map((c) => (avg > 0 ? (c.views / avg) * 100 : 100));
      blockIdx.push(idx);
      chunk.forEach((c, i) => {
        const m = Number(c.month.slice(5, 7));
        byMonth.set(m, [...(byMonth.get(m) ?? []), idx[i]]);
      });
    }
    // Merkez çizgi medyandır: tek bir yıldaki sıçrama (haber, viral olay) profili bozmasın.
    const profile = Array.from({ length: 12 }, (_, i) => {
      const xs = [...(byMonth.get(i + 1) ?? [100])].sort((a, b) => a - b);
      return { month: i + 1, name: monthName(i + 1, 'short'), avg: quantile(xs, 0.5), min: xs[0], max: xs[xs.length - 1] };
    });
    const lastBlock = rows.slice(-12);
    const lastIdxByMonth = new Map<number, number>();
    lastBlock.forEach((c, i) => lastIdxByMonth.set(Number(c.month.slice(5, 7)), blockIdx[blocks - 1][i]));

    const sorted = [...profile].sort((a, b) => b.avg - a.avg);
    const peak = sorted[0];
    const strengthRatio = sorted[0].avg / Math.max(1e-9, sorted[11].avg);
    const strength = strengthRatio >= 1.6 ? tt('güçlü', 'strong') : strengthRatio >= 1.25 ? tt('orta', 'moderate') : tt('zayıf', 'weak');
    const prepMonth = peak.month === 1 ? 12 : peak.month - 1;
    const currentMonth = now.getUTCMonth() + 1;
    const monthsToPeak = (peak.month - currentMonth + 12) % 12;
    const yoy = blocks >= 2 ? pctChange(sum(rows.slice(-12).map((r) => r.views)), sum(rows.slice(-24, -12).map((r) => r.views))) : null;

    const fromLabel = `${monthName(Number(lastBlock[0].month.slice(5, 7)), 'short')} ${lastBlock[0].month.slice(0, 4)}`;
    const toLabel = `${monthName(Number(lastBlock[11].month.slice(5, 7)), 'short')} ${lastBlock[11].month.slice(0, 4)}`;
    const profileRef = saveChart({
      title: tt(`${article.title} · sezon profili`, `${article.title} · seasonal profile`),
      subtitle: tt(
        `Aylık ilgi endeksi (100 = yıllık ortalama) · tipik yıl: son ${blocks} yılın medyanı · son 12 ay: ${fromLabel} – ${toLabel}`,
        `Monthly interest index (100 = yearly average) · typical year: median of the last ${blocks} years · last 12 months: ${fromLabel} – ${toLabel}`,
      ),
      note: tt(
        `Gölgeli alan yıllar arası en düşük-en yüksek aralık. Zirve ayı ${monthName(peak.month, 'long')}; kampanyaya ${monthName(prepMonth, 'long')} başında başlamak, ilgi yükselirken görünür olmayı sağlar.`,
        `The shaded area is the lowest-highest range across years. Peak month is ${monthName(peak.month, 'long')}; starting the campaign in early ${monthName(prepMonth, 'long')} gets you visible while interest climbs.`,
      ),
      sources: ['Wikimedia Pageviews API'],
      spec: {
        chartType: 'line',
        xType: 'category',
        categories: profile.map((p) => p.name),
        series: [
          { name: tt('Tipik yıl', 'Typical year'), values: profile.map((p) => p.avg), low: profile.map((p) => p.min), high: profile.map((p) => p.max) },
          { name: tt('Son 12 ay', 'Last 12 months'), values: profile.map((p) => lastIdxByMonth.get(p.month) ?? null) },
        ],
        markers: [{ index: peak.month - 1, label: tt('Zirve', 'Peak') }],
        unit: tt('endeks', 'index'),
        valueFormat: 'number',
        bandLabel: tt('Yıllar arası aralık', 'Range across years'),
      },
    });
    const trend = rollingMean(
      rows.map((r) => r.views),
      12,
    ).map((x, i) => (i >= 11 ? x : null));
    const historyRef = saveChart({
      title: tt(`${article.title} · ${blocks} yıllık aylık ilgi`, `${article.title} · ${blocks} years of monthly interest`),
      subtitle: tt('Wikipedia aylık görüntülenme ve 12 aylık hareketli ortalama (uzun vadeli eğilim)', 'Wikipedia monthly pageviews and 12-month moving average (long-term trend)'),
      sources: ['Wikimedia Pageviews API'],
      spec: {
        chartType: 'line',
        xType: 'time',
        categories: rows.map((r) => r.month),
        series: [
          { name: tt('Aylık görüntülenme', 'Monthly pageviews'), values: rows.map((r) => r.views) },
          { name: tt('12 aylık ortalama', '12-month average'), values: trend },
        ],
        unit: tt('görüntülenme', 'views'),
        valueFormat: 'number',
      },
    });

    return ok({
      source: tt('Wikimedia Pageviews API — aylık kullanıcı görüntülenmeleri', 'Wikimedia Pageviews API — monthly user pageviews'),
      topic,
      article: article.title,
      url: article.url,
      wiki_lang: article.lang,
      other_candidates: article.candidates.filter((c) => c !== article.title).slice(0, 3),
      months_analyzed: rows.length,
      years_compared: blocks,
      profile: profile.map((p) => ({ month: p.name, index_avg: round(p.avg), index_min: round(p.min), index_max: round(p.max) })),
      peak_months: sorted.slice(0, 2).map((p) => monthName(p.month, 'long')),
      low_months: sorted.slice(-2).map((p) => monthName(p.month, 'long')),
      seasonality_strength: { peak_to_low_ratio: round(strengthRatio, 2), label: strength },
      best_launch_window: {
        start: monthName(prepMonth, 'long'),
        peak: monthName(peak.month, 'long'),
        text: tt(
          `Kampanyayı ${monthName(prepMonth, 'long')} başında başlat; ilgi ${monthName(peak.month, 'long')} ayında zirve yapıyor.`,
          `Start the campaign in early ${monthName(prepMonth, 'long')}; interest peaks in ${monthName(peak.month, 'long')}.`,
        ),
      },
      next_peak_in_months: monthsToPeak,
      last12_vs_prev12_pct: r1(yoy),
      chart_refs: { profile: profileRef, history: historyRef },
      chart_hint: chartHint(profileRef, uiLang()) + tt(` İkinci grafik: chart_ref "${historyRef}".`, ` Second chart: chart_ref "${historyRef}".`),
    });
  }),
);

// ================================================================ market_potential

type Metric = 'online_population' | 'internet_share' | 'population' | 'gdp_per_capita' | 'mobile_subscriptions';

const SLUG = {
  share: { slug: 'share-of-individuals-using-the-internet', col: 'it_net_user_zs' },
  users: { slug: 'number-of-internet-users', col: 'it_net_user_zs_number' },
  pop: { slug: 'population-with-un-projections', est: 'population__sex_all__age_all__variant_estimates', proj: 'population__sex_all__age_all__variant_medium__projected' },
  gdp: { slug: 'gdp-per-capita-worldbank', col: 'ny_gdp_pcap_pp_kd' },
  mobile: { slug: 'mobile-cellular-subscriptions-per-100-people', col: 'it_cel_sets_p2' },
};

function popSeries(t: OwidTable, code: string): Map<number, number> {
  const out = new Map<number, number>();
  for (const { year, value } of yearly(t, code, SLUG.pop.proj)) out.set(year, value);
  for (const { year, value } of yearly(t, code, SLUG.pop.est)) out.set(year, value);
  return out;
}

/** İnternet kullanım payı projeksiyonu: çevrim dışı payın (100 - pay) üstel azalışı; doygunluğa doğal olarak yaklaşır. */
function projectShare(hist: Array<{ year: number; value: number }>, toYear: number): Map<number, { v: number; lo: number; hi: number }> {
  const out = new Map<number, { v: number; lo: number; hi: number }>();
  const recent = hist.slice(-10);
  if (!recent.length) return out;
  const lastYear = recent[recent.length - 1].year;
  const logOff = recent.map((h) => Math.log(Math.max(0.5, 100 - h.value)));
  const fit = linearFit(logOff);
  const slope = Math.min(0, fit.slope);
  const anchor = logOff[logOff.length - 1];
  for (let y = lastYear + 1; y <= toYear; y++) {
    const h = y - lastYear;
    const spread = 1.2816 * Math.max(0.03, fit.residualStd) * Math.sqrt(h);
    const center = anchor + slope * h;
    const toShare = (lo: number) => Math.min(99.5, Math.max(0, 100 - Math.exp(lo)));
    out.set(y, { v: toShare(center), lo: toShare(center + spread), hi: toShare(center - spread) });
  }
  return out;
}

server.registerTool(
  'market_potential',
  {
    title: 'Pazar potansiyeli (ülkeler)',
    description:
      'Ülkelerin dijital pazar büyüklüğünü yıllara göre karşılaştırır ve projeksiyon yapar. metric: online_population (internete bağlı kişi sayısı, varsayılan), internet_share (% nüfus), population (BM orta senaryo projeksiyonu), gdp_per_capita (PPP, sabit $), mobile_subscriptions (100 kişide abonelik). online_population ve internet_share için to_year yılına kadar projeksiyon ve %80 aralık üretir; çevrim dışı kalan nüfus (büyüme alanı) ve 5 yıllık bileşik büyüme de döner. Yurt dışına açılma, pazar seçimi ve "hangi ülkede kitle büyüyor?" soruları için kullan. Hazır çizgi grafiği chart_ref ile gelir.',
    inputSchema: {
      countries: z.array(z.string().min(2).max(60)).min(1).max(4).describe('En fazla 4 ülke: kod veya ad, örn. ["TR", "DE", "SA"] veya ["Türkiye", "Almanya"]; "World" da olur'),
      metric: z.enum(['online_population', 'internet_share', 'population', 'gdp_per_capita', 'mobile_subscriptions']).default('online_population'),
      from_year: z.number().int().min(1990).max(2024).default(2010),
      to_year: z.number().int().min(2026).max(2035).default(2030).describe('Projeksiyon yılı (online_population, internet_share, population için)'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ countries, metric, from_year, to_year }) => {
    const m = metric as Metric;
    const lang = uiLang();
    const need = {
      share: m === 'online_population' || m === 'internet_share',
      users: m === 'online_population',
      pop: m === 'online_population' || m === 'population',
      gdp: m === 'gdp_per_capita',
      mobile: m === 'mobile_subscriptions',
    };
    const tables: Partial<Record<keyof typeof SLUG, OwidTable>> = {};
    for (const key of Object.keys(need) as Array<keyof typeof need>) if (need[key]) tables[key] = await loadOwidTable(SLUG[key].slug);
    const anyTable = Object.values(tables)[0]!;

    const errors: string[] = [];
    const codes: string[] = [];
    for (const c of countries) {
      const code = resolveCountry(c, anyTable.names);
      if (!code || !anyTable.rows.has(code)) errors.push(tt(`"${c}" bulunamadı`, `"${c}" not found`));
      else if (!codes.includes(code)) codes.push(code);
    }
    if (!codes.length) return fail(errors.join(' · '));

    interface Row {
      code: string;
      name: string;
      hist: Map<number, number>;
      proj: Map<number, { v: number; lo: number | null; hi: number | null }>;
      lastYear: number;
    }
    const rows: Row[] = [];
    for (const code of codes) {
      const name = countryLabel(code, lang, entityName(anyTable, code));
      const hist = new Map<number, number>();
      const proj = new Map<number, { v: number; lo: number | null; hi: number | null }>();
      if (m === 'internet_share' || m === 'online_population') {
        const share = yearly(tables.share!, code, SLUG.share.col);
        const shareProj = projectShare(share, to_year);
        if (m === 'internet_share') {
          for (const s of share) hist.set(s.year, s.value);
          for (const [y, p] of shareProj) proj.set(y, { v: p.v, lo: p.lo, hi: p.hi });
        } else {
          const users = yearly(tables.users!, code, SLUG.users.col);
          const pop = popSeries(tables.pop!, code);
          for (const u of users) hist.set(u.year, u.value);
          const lastUser = users[users.length - 1];
          if (lastUser) {
            const shareAt = share.find((s) => s.year === lastUser.year)?.value ?? shareProj.get(lastUser.year)?.v;
            const popAt = pop.get(lastUser.year);
            const calib = shareAt && popAt ? lastUser.value / ((shareAt / 100) * popAt) : 1;
            const lastShareYear = share[share.length - 1]?.year ?? lastUser.year;
            for (let y = lastUser.year + 1; y <= to_year; y++) {
              const p = pop.get(y);
              if (!p) continue;
              const actualShare = y <= lastShareYear ? share.find((s) => s.year === y)?.value : undefined;
              const sp = actualShare !== undefined ? { v: actualShare, lo: actualShare, hi: actualShare } : shareProj.get(y);
              if (!sp) continue;
              proj.set(y, { v: (sp.v / 100) * p * calib, lo: (sp.lo / 100) * p * calib, hi: (sp.hi / 100) * p * calib });
            }
          }
        }
      } else if (m === 'population') {
        const est = yearly(tables.pop!, code, SLUG.pop.est);
        for (const e of est) hist.set(e.year, e.value);
        for (const p of yearly(tables.pop!, code, SLUG.pop.proj)) if (p.year <= to_year && !hist.has(p.year)) proj.set(p.year, { v: p.value, lo: null, hi: null });
      } else {
        const key = m === 'gdp_per_capita' ? 'gdp' : 'mobile';
        for (const e of yearly(tables[key]!, code, SLUG[key].col)) hist.set(e.year, e.value);
      }
      const years = [...hist.keys()].filter((y) => y >= from_year);
      if (!years.length) {
        errors.push(tt(`${name}: veri yok`, `${name}: no data`));
        continue;
      }
      rows.push({ code, name, hist, proj, lastYear: Math.max(...years) });
    }
    if (!rows.length) return fail(errors.join(' · '));

    const cutoff = Math.min(...rows.map((r) => r.lastYear));
    const hasProj = rows.some((r) => r.proj.size > 0);
    const lastChartYear = hasProj ? to_year : Math.max(...rows.map((r) => r.lastYear));
    const yearsAxis: number[] = [];
    for (let y = from_year; y <= lastChartYear; y++) yearsAxis.push(y);

    const series: ChartSeries[] = rows.map((r) => {
      const values = yearsAxis.map((y) => r.hist.get(y) ?? r.proj.get(y)?.v ?? null);
      const low = yearsAxis.map((y) => (y === cutoff ? (r.hist.get(y) ?? null) : y > cutoff ? (r.proj.get(y)?.lo ?? r.hist.get(y) ?? null) : null));
      const high = yearsAxis.map((y) => (y === cutoff ? (r.hist.get(y) ?? null) : y > cutoff ? (r.proj.get(y)?.hi ?? r.hist.get(y) ?? null) : null));
      const withBand = r.proj.size > 0 && [...r.proj.values()].some((p) => p.lo !== null);
      return { name: r.name, values, ...(withBand ? { low, high } : {}) };
    });

    const metricLabel: Record<Metric, [string, string, string, string]> = {
      online_population: ['Çevrim içi kitle', 'Online population', 'kişi', 'people'],
      internet_share: ['İnternet kullanan nüfus payı', 'Share of population online', '%', '%'],
      population: ['Nüfus', 'Population', 'kişi', 'people'],
      gdp_per_capita: ['Kişi başına GSYH (SAGP, sabit 2021 $)', 'GDP per capita (PPP, constant 2021 $)', '$', '$'],
      mobile_subscriptions: ['Mobil abonelik (100 kişide)', 'Mobile subscriptions (per 100 people)', 'abonelik', 'subscriptions'],
    };
    const [labTr, labEn, unitTr, unitEn] = metricLabel[m];
    const forecastStart = hasProj ? yearsAxis.indexOf(cutoff + 1) : -1;
    const chartRef = saveChart({
      title: tt(`${labTr}: ${rows.map((r) => r.name).join(', ')}`, `${labEn}: ${rows.map((r) => r.name).join(', ')}`),
      subtitle: hasProj
        ? tt(`${from_year}–${cutoff} gerçekleşen, ${cutoff + 1}–${to_year} projeksiyon (kesikli)`, `${from_year}–${cutoff} actual, ${cutoff + 1}–${to_year} projection (dashed)`)
        : tt(`${from_year}–${cutoff}`, `${from_year}–${cutoff}`),
      note:
        m === 'online_population' || m === 'internet_share'
          ? tt(
              'Projeksiyon: internet kullanmayan nüfus payının son 10 yıldaki azalış hızı sürdürülür (doygunluğa yaklaşır) ve BM orta senaryo nüfus projeksiyonuyla çarpılır; gölge %80 aralık. Kaynak: Our World in Data (ITU, BM WPP 2024).',
              'Projection: the last 10 years’ rate of decline in the offline share is carried forward (approaching saturation) and multiplied by the UN medium-variant population projection; shading is the 80% range. Source: Our World in Data (ITU, UN WPP 2024).',
            )
          : m === 'population'
            ? tt('Kesikli kısım BM Dünya Nüfus Beklentileri 2024 orta senaryosudur.', 'The dashed part is the UN World Population Prospects 2024 medium variant.')
            : tt('Kaynak: Our World in Data (Dünya Bankası / ITU).', 'Source: Our World in Data (World Bank / ITU).'),
      sources: ['Our World in Data'],
      spec: {
        chartType: 'line',
        xType: 'time',
        categories: yearsAxis.map(String),
        series,
        forecastStart: forecastStart > 0 ? forecastStart : undefined,
        unit: lang === 'tr' ? unitTr : unitEn,
        valueFormat: m === 'internet_share' ? 'percent' : m === 'online_population' || m === 'population' ? 'compact' : 'number',
        bandLabel: tt('%80 projeksiyon aralığı', '80% projection range'),
        forecastLabel: tt('Projeksiyon', 'Projection'),
      },
    });

    const summary = rows.map((r) => {
      const latest = r.hist.get(r.lastYear)!;
      const fiveAgo = r.hist.get(r.lastYear - 5);
      const cagr = fiveAgo && fiveAgo > 0 ? (Math.pow(latest / fiveAgo, 1 / 5) - 1) * 100 : null;
      const target = r.proj.get(to_year);
      const out: Record<string, unknown> = {
        country: r.name,
        code: r.code,
        last_data_year: r.lastYear,
        latest_value: m === 'internet_share' || m === 'mobile_subscriptions' ? round(latest, 1) : Math.round(latest),
        cagr_5y_pct: r1(cagr),
      };
      if (target) {
        out[`projected_${to_year}`] = {
          value: m === 'internet_share' ? round(target.v, 1) : Math.round(target.v),
          low_80: target.lo === null ? null : m === 'internet_share' ? round(target.lo, 1) : Math.round(target.lo),
          high_80: target.hi === null ? null : m === 'internet_share' ? round(target.hi, 1) : Math.round(target.hi),
        };
        out.change_to_target_pct = r1(pctChange(target.v, latest));
      }
      if (m === 'online_population' && tables.pop) {
        const pop = popSeries(tables.pop, r.code);
        const popNow = pop.get(r.lastYear);
        const popTarget = pop.get(to_year);
        if (popNow) out.offline_people_now = Math.max(0, Math.round(popNow - latest));
        if (popTarget && target) out[`offline_people_${to_year}`] = Math.max(0, Math.round(popTarget - target.v));
        if (target) out[`new_online_people_by_${to_year}`] = Math.max(0, Math.round(target.v - latest));
      }
      return out;
    });

    return ok({
      source: tt(
        'Our World in Data (CC BY 4.0) — ITU internet kullanımı, BM Dünya Nüfus Beklentileri 2024, Dünya Bankası',
        'Our World in Data (CC BY 4.0) — ITU internet use, UN World Population Prospects 2024, World Bank',
      ),
      metric: m,
      unit: lang === 'tr' ? unitTr : unitEn,
      years: { from: from_year, last_actual: cutoff, projection_to: hasProj ? to_year : null },
      countries: summary,
      errors: errors.length ? errors : undefined,
      chart_ref: chartRef,
      chart_hint: chartHint(chartRef, lang),
    });
  }),
);

await startServer(server, 'mar-potential');
