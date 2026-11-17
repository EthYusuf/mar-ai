/**
 * mar-ai · Reklam Kütüphanesi MCP (Meta Ad Library)
 *
 * Meta'nın herkese açık, şeffaflık amaçlı Reklam Kütüphanesi sayfasını giriş yapmadan,
 * normal bir ziyaretçi gibi tarayıcıda açar ve görünen reklam kartlarını okur:
 * reklamveren, reklam metni, başlık, CTA, hedef alan adı, yayın başlangıcı, görsel/video.
 * Facebook, Instagram, Messenger ve Audience Network reklamlarını kapsar.
 * Gizli API kullanmaz, giriş yapmaz; tek seferde sınırlı sayıda sonuç okur.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Page } from 'puppeteer-core';
import { ok, okWithImage, fail, safe, startServer, TtlCache, topCounts, round, median, sleep, uiLang, MARAI_VERSION } from '../../_shared/common';
import { ChromeSession, gotoAndSettle } from '../../_shared/chrome';
import { addDaysIso, isoDay, weekStartIso } from '../../_shared/analytics';
import { chartHint, saveChart } from '../../_shared/charts';

const tt = (tr: string, en: string) => (uiLang() === 'tr' ? tr : en);

const server = new McpServer({ name: 'mar-adlibrary', version: MARAI_VERSION });
const chrome = new ChromeSession({ name: 'adlibrary', headless: true, lang: 'en-US', viewport: { width: 1400, height: 1000 } });
const cache = new TtlCache<SearchResult>(15 * 60_000);

interface RawCard {
  text: string;
  logo_alt: string;
  images: string[];
  video_posters: string[];
  has_video: boolean;
}

interface Ad {
  library_id: string;
  library_url: string;
  status: 'active' | 'inactive' | 'unknown';
  advertiser: string;
  started: string | null;
  ended: string | null;
  days_running: number | null;
  multiple_versions: boolean;
  format: 'video' | 'carousel' | 'image' | 'text';
  body: string;
  link_domain: string | null;
  headline: string | null;
  cta: string | null;
  images: string[];
  video_poster: string | null;
}

interface SearchResult {
  search_url: string;
  results_estimate: string | null;
  ads: Ad[];
}

function buildUrl(o: { query: string; country: string; platform: string; status: string; media: string }): string {
  const p = new URLSearchParams({
    active_status: o.status,
    ad_type: 'all',
    country: o.country.toUpperCase(),
    q: o.query,
    search_type: 'keyword_unordered',
    media_type: o.media,
  });
  let url = `https://www.facebook.com/ads/library/?${p.toString()}`;
  if (o.platform !== 'all') url += `&publisher_platforms[0]=${encodeURIComponent(o.platform)}`;
  return url;
}

/** Sayfa içinde çalışır: her "Library ID" içeren kartın görünen içeriğini toplar. */
function collectCardsInPage(): { cards: RawCard[]; estimate: string | null } {
  const leaves = Array.from(document.querySelectorAll('span,div')).filter(
    (el) => el.childElementCount === 0 && /^Library ID: \d+/.test((el.textContent || '').trim()),
  );
  const cards: RawCard[] = [];
  for (const leaf of leaves) {
    let card: Element = leaf;
    while (card.parentElement && (((card.parentElement as HTMLElement).innerText || '').match(/Library ID:/g) || []).length === 1) {
      card = card.parentElement;
    }
    const imgs = Array.from(card.querySelectorAll('img')) as HTMLImageElement[];
    const logo = imgs.find((i) => i.naturalWidth > 0 && i.naturalWidth <= 100 && i.alt);
    const videos = Array.from(card.querySelectorAll('video')) as HTMLVideoElement[];
    cards.push({
      text: (card as HTMLElement).innerText || '',
      logo_alt: logo?.alt || '',
      images: imgs.filter((i) => i.naturalWidth >= 200).map((i) => i.src).slice(0, 6),
      video_posters: videos.map((v) => v.poster).filter(Boolean).slice(0, 2),
      has_video: videos.length > 0,
    });
  }
  const est = (document.body.innerText.match(/~?[\d.,]+\s+results?/) || [])[0] || null;
  return { cards, estimate: est };
}

const NOISE = new Set(['', '​', 'Active', 'Inactive', 'Platforms', 'This ad has multiple versions', 'Open Drop-down', 'See ad details', 'See summary details', 'Sponsored', 'Open dropdown']);

function parseCard(raw: RawCard): Ad | null {
  const lines = raw.text
    .split('\n')
    .map((l) => l.replace(/​/g, '').trim())
    .filter((l) => l.length > 0);
  const idLine = lines.find((l) => /^Library ID: \d+/.test(l));
  if (!idLine) return null;
  const libraryId = idLine.replace(/\D/g, '');
  const status = lines.includes('Active') ? 'active' : lines.includes('Inactive') ? 'inactive' : 'unknown';
  let started: string | null = null;
  let ended: string | null = null;
  const startLine = lines.find((l) => /^Started running on /.test(l));
  const rangeLine = lines.find((l) => /^\d{1,2} \w{3} \d{4} - \d{1,2} \w{3} \d{4}$/.test(l));
  if (startLine) started = startLine.replace('Started running on ', '').split(' · ')[0].trim();
  else if (rangeLine) [started, ended] = rangeLine.split(' - ').map((s) => s.trim());
  const toIso = (s: string | null) => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  };
  const startIso = toIso(started);
  const endIso = toIso(ended);
  const endTime = endIso ? new Date(endIso).getTime() : Date.now();
  const days = startIso ? Math.max(0, Math.round((endTime - new Date(startIso).getTime()) / 86400_000)) : null;

  // Reklam gövdesi "See ad details" / reklamveren / "Sponsored" satırlarından sonra gelir.
  const sponsoredIdx = lines.indexOf('Sponsored');
  const after = sponsoredIdx >= 0 ? lines.slice(sponsoredIdx + 1) : [];
  const advertiser = raw.logo_alt || (sponsoredIdx > 0 ? lines[sponsoredIdx - 1] : '');
  const domainIdx = after.findIndex((l) => /^[A-Z0-9.-]+\.[A-Z]{2,}(\/.*)?$/.test(l));
  const bodyLines = (domainIdx >= 0 ? after.slice(0, domainIdx) : after.slice(0, 3)).filter((l) => !NOISE.has(l));
  const tail = domainIdx >= 0 ? after.slice(domainIdx + 1).filter((l) => !NOISE.has(l)) : [];
  const cta = tail.length >= 2 ? tail[tail.length - 1] : null;
  const headline = tail.length >= 1 ? tail[0] : null;
  const format: Ad['format'] = raw.has_video ? 'video' : raw.images.length > 1 ? 'carousel' : raw.images.length === 1 ? 'image' : 'text';
  return {
    library_id: libraryId,
    library_url: `https://www.facebook.com/ads/library/?id=${libraryId}`,
    status,
    advertiser,
    started: startIso,
    ended: endIso,
    days_running: days,
    multiple_versions: lines.includes('This ad has multiple versions'),
    format,
    body: bodyLines.join('\n').slice(0, 700),
    link_domain: domainIdx >= 0 ? after[domainIdx].toLowerCase() : null,
    headline: headline && headline !== cta ? headline.slice(0, 200) : null,
    cta,
    images: raw.images,
    video_poster: raw.video_posters[0] ?? null,
  };
}

async function scrollAndCollect(page: Page, limit: number): Promise<{ cards: RawCard[]; estimate: string | null }> {
  let result = await page.evaluate(collectCardsInPage);
  let stagnant = 0;
  for (let i = 0; i < 8 && result.cards.length < limit && stagnant < 2; i++) {
    const before = result.cards.length;
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
    await sleep(1800);
    try {
      await page.waitForNetworkIdle({ idleTime: 600, timeout: 5000 });
    } catch {
      /* devam */
    }
    result = await page.evaluate(collectCardsInPage);
    stagnant = result.cards.length === before ? stagnant + 1 : 0;
  }
  return result;
}

async function search(o: { query: string; country: string; platform: string; status: string; media: string; limit: number }): Promise<SearchResult> {
  const url = buildUrl(o);
  const key = `${url}#${o.limit}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const res = await chrome.withPage(async (page) => {
    await gotoAndSettle(page, url, 1500);
    if (/login/.test(page.url())) throw new Error('Reklam Kütüphanesi giriş sayfasına yönlendirdi; daha sonra tekrar deneyin.');
    const { cards, estimate } = await scrollAndCollect(page, o.limit);
    const ads = cards.map(parseCard).filter((a): a is Ad => !!a);
    const unique = ads.filter((a, i) => ads.findIndex((b) => b.library_id === a.library_id) === i);
    return { search_url: url, results_estimate: estimate, ads: unique.slice(0, o.limit) };
  });
  cache.set(key, res);
  return res;
}

function summarize(ads: Ad[]) {
  const days = ads.map((a) => a.days_running).filter((d): d is number => d !== null);
  return {
    ads_read: ads.length,
    active: ads.filter((a) => a.status === 'active').length,
    formats: topCounts(ads.map((a) => a.format), 5),
    top_advertisers: topCounts(ads.map((a) => a.advertiser).filter(Boolean), 10),
    top_ctas: topCounts(ads.map((a) => a.cta ?? '').filter(Boolean), 8),
    top_domains: topCounts(ads.map((a) => a.link_domain ?? '').filter(Boolean), 8),
    avg_days_running: days.length ? round(days.reduce((s, d) => s + d, 0) / days.length, 1) : null,
    median_days_running: days.length ? median(days) : null,
    longest_running: [...ads]
      .filter((a) => a.days_running !== null)
      .sort((a, b) => (b.days_running ?? 0) - (a.days_running ?? 0))
      .slice(0, 5)
      .map((a) => ({ advertiser: a.advertiser, days_running: a.days_running, library_url: a.library_url, body: a.body.slice(0, 140) })),
    note: 'Uzun süre yayında kalan reklamlar genellikle iyi performans gösteren reklamlardır (reklamveren kârsız reklamı kapatır). Harcama ve gösterim verisi Meta tarafından yalnızca siyasi/AB reklamları için paylaşılır.',
  };
}

/** Okunan reklamlardan iki hazır grafik: haftalık yeni reklam çizgisi ve yayında kalma süresi dağılımı. */
function adCharts(ads: Ad[], query: string): { launches?: string; longevity?: string } {
  const out: { launches?: string; longevity?: string } = {};
  const weeks = ads
    .map((a) => a.started)
    .filter((s): s is string => !!s)
    .map(weekStartIso)
    .sort();
  if (weeks.length >= 5) {
    const last = weekStartIso(isoDay(Date.now()));
    const floor = addDaysIso(last, -7 * 25);
    const first = weeks[0] < floor ? floor : weeks[0];
    const cats: string[] = [];
    for (let w = first; w <= last; w = addDaysIso(w, 7)) cats.push(w);
    const older = weeks.filter((w) => w < first).length;
    if (cats.length >= 3)
      out.launches = saveChart({
        title: tt(`"${query}" · haftalık yeni reklam`, `"${query}" · new ads per week`),
        subtitle: tt('Okunan reklamların yayına girdiği hafta (reklamveren aktivitesinin göstergesi)', 'Week each sampled ad went live (a signal of advertiser activity)'),
        note: older ? tt(`${older} reklam bu aralıktan önce başlamış ve hâlâ yayında.`, `${older} ads started before this range and are still running.`) : undefined,
        sources: ['Meta Ad Library'],
        spec: {
          chartType: 'area',
          xType: 'time',
          categories: cats,
          series: [{ name: tt('Yeni başlayan reklam', 'New ads started'), values: cats.map((w) => weeks.filter((x) => x === w).length) }],
          unit: tt('reklam', 'ads'),
        },
      });
  }
  const days = ads.map((a) => a.days_running).filter((d): d is number => d !== null);
  if (days.length >= 5) {
    const buckets: Array<[number, number, string, string]> = [
      [0, 7, '0-7 gün', '0-7 days'],
      [8, 30, '8-30 gün', '8-30 days'],
      [31, 90, '31-90 gün', '31-90 days'],
      [91, Infinity, '90+ gün', '90+ days'],
    ];
    out.longevity = saveChart({
      title: tt('Reklamlar ne kadar süredir yayında?', 'How long have the ads been running?'),
      subtitle: tt('Uzun süre yayında kalan reklamlar genellikle kârlı olanlardır', 'Long-running ads are usually the profitable ones'),
      sources: ['Meta Ad Library'],
      spec: {
        chartType: 'column',
        categories: buckets.map((b) => tt(b[2], b[3])),
        series: [{ name: tt('Reklam sayısı', 'Ads'), values: buckets.map(([lo, hi]) => days.filter((d) => d >= lo && d <= hi).length) }],
        unit: tt('reklam', 'ads'),
      },
    });
  }
  return out;
}

const commonInput = {
  query: z.string().min(2).describe('Anahtar kelime veya reklamveren adı, örn. "soğuk kahve" ya da "Starbucks"'),
  country: z.string().length(2).default('TR').describe('Ülke kodu (TR, US, DE…)'),
  platform: z.enum(['all', 'instagram', 'facebook', 'messenger', 'audience_network']).default('all'),
  status: z.enum(['active', 'all']).default('active').describe('active: yalnızca şu an yayında olanlar'),
  media: z.enum(['all', 'image', 'video']).default('all'),
};

server.registerTool(
  'meta_ads_search',
  {
    title: 'Meta reklam araştırması',
    description:
      'Meta Reklam Kütüphanesinde (Facebook + Instagram reklamları) anahtar kelime veya marka ile arama yapar; her reklamın reklamvereni, metni, başlığı, CTA butonu, hedef alan adı, formatı (video/görsel/carousel), yayın başlangıcı ve kaç gündür yayında olduğunu döndürür. Ayrıca format dağılımı, en çok reklam veren markalar, en sık CTA ve en uzun yayında kalan reklamların özetini çıkarır; hazır grafikler (chart_refs) döner: haftalık yeni reklam çizgisi ve yayında kalma süresi dağılımı. Bir sayfa 20-30 reklam okur, daha fazlası için kaydırır (~10-30 sn).',
    inputSchema: {
      ...commonInput,
      advertiser: z.string().optional().describe('Sonuçları bu reklamveren adını içerenlerle sınırla'),
      limit: z.number().int().min(5).max(60).default(25),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ query, country, platform, status, media, advertiser, limit }) => {
    const res = await search({ query, country, platform, status, media, limit: advertiser ? Math.max(limit, 40) : limit });
    let ads = res.ads;
    if (advertiser) {
      const needle = advertiser.toLocaleLowerCase('tr');
      ads = ads.filter((a) => a.advertiser.toLocaleLowerCase('tr').includes(needle)).slice(0, limit);
    }
    if (!ads.length) {
      return ok({ source: 'Meta Ad Library (herkese açık)', search_url: res.search_url, results_estimate: res.results_estimate, ads: [], message: 'Bu aramada okunabilir reklam bulunamadı. Farklı anahtar kelime, ülke veya status=all deneyin.' });
    }
    const charts = adCharts(ads, advertiser ?? query);
    return ok({
      source: 'Meta Ad Library (herkese açık)',
      fetched_at: new Date().toISOString(),
      search_url: res.search_url,
      results_estimate: res.results_estimate,
      summary: summarize(ads),
      chart_refs: Object.keys(charts).length ? charts : undefined,
      chart_hint: charts.launches ? chartHint(charts.launches, uiLang()) : charts.longevity ? chartHint(charts.longevity, uiLang()) : undefined,
      ads,
    });
  }),
);

server.registerTool(
  'meta_ads_screenshot',
  {
    title: 'Reklam kütüphanesi ekran görüntüsü',
    description:
      'Reklam Kütüphanesi arama sonuçlarının ekran görüntüsünü döndürür; reklam görsellerini, renklerini, tipografisini ve kreatif yaklaşımlarını görsel olarak analiz etmek için kullan.',
    inputSchema: commonInput,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ query, country, platform, status, media }) => {
    const url = buildUrl({ query, country, platform, status, media });
    return chrome.withPage(async (page) => {
      await gotoAndSettle(page, url, 2500);
      const first = await page.$('xpath/.//*[starts-with(normalize-space(text()), "Library ID:")]');
      if (!first) return fail('Ekranda reklam bulunamadı.');
      await first.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -80));
      await sleep(1200);
      const shot = await page.screenshot({ type: 'jpeg', quality: 72, encoding: 'base64' });
      return okWithImage({ search_url: url, note: 'Görüntü, arama sonuçlarının ilk ekranını gösterir.' }, shot as string, 'image/jpeg');
    });
  }),
);

await startServer(server, 'mar-adlibrary', () => chrome.close());
