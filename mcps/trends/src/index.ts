/**
 * mar-ai · Trendler ve Haberler MCP
 * Kaynaklar (hepsi ücretsiz, anahtarsız, girişsiz ve resmi/herkese açık):
 *  - Google Trends günlük trend beslemesi (RSS)
 *  - Google News arama beslemesi (RSS)
 *  - Wikimedia sayfa görüntüleme API'si (ilgi göstergesi olarak)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchJson, fetchText, ok, fail, safe, startServer, TtlCache, round, topCounts, uiLang, MARAI_VERSION } from '../../_shared/common';
import { blocks, tag, attr } from '../../_shared/xml';

const server = new McpServer({ name: 'mar-trends', version: MARAI_VERSION });
const cache = new TtlCache<unknown>(10 * 60_000);

// ---------------------------------------------------------------- trending_now

server.registerTool(
  'trending_now',
  {
    title: 'Şu an yükselen aramalar',
    description:
      'Google Trends günlük trend beslemesinden bir ülkede şu an yükselen aramaları getirir: arama terimi, yaklaşık arama hacmi ve konuyla ilgili haber başlıkları. Gündem yakalama (trend jacking) ve içerik fikri için kullan.',
    inputSchema: {
      geo: z.string().length(2).default('TR').describe('Ülke kodu, örn. TR, US, DE'),
      limit: z.number().int().min(1).max(30).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ geo, limit }) => {
    const key = `trend:${geo}`;
    let items = cache.get(key) as ReturnType<typeof parseTrends> | undefined;
    if (!items) {
      const r = await fetchText(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo.toUpperCase())}`);
      if (r.status !== 200) return fail(`Google Trends yanıt vermedi (HTTP ${r.status}).`);
      items = parseTrends(r.text);
      cache.set(key, items);
    }
    return ok({
      source: 'Google Trends (günlük trend RSS)',
      geo: geo.toUpperCase(),
      fetched_at: new Date().toISOString(),
      count: Math.min(items.length, limit),
      trends: items.slice(0, limit),
    });
  }),
);

function parseTrends(xml: string) {
  return blocks(xml, 'item').map((b) => ({
    query: tag(b, 'title'),
    approx_searches: tag(b, 'ht:approx_traffic'),
    started: tag(b, 'pubDate'),
    picture: tag(b, 'ht:picture') || undefined,
    news: blocks(b, 'ht:news_item')
      .slice(0, 3)
      .map((n) => ({ title: tag(n, 'ht:news_item_title'), source: tag(n, 'ht:news_item_source'), url: tag(n, 'ht:news_item_url') })),
  }));
}

// ---------------------------------------------------------------- news_search

server.registerTool(
  'news_search',
  {
    title: 'Haber araması',
    description:
      'Google News arama beslemesinden bir marka, ürün, rakip veya konu hakkındaki güncel haberleri getirir. Kaynak dağılımı ve günlük haber hacmi de hesaplanır (marka gündemi / PR takibi için).',
    inputSchema: {
      query: z.string().min(2).describe('Aranacak ifade, örn. "Starbucks Türkiye" veya "soğuk kahve"'),
      period: z.enum(['1d', '7d', '30d', '1y', 'all']).default('30d').describe('Zaman aralığı'),
      lang: z.enum(['tr', 'en']).optional().describe('Haber dili (varsayılan: arayüz dili)'),
      limit: z.number().int().min(1).max(60).default(20),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ query, period, lang, limit }) => {
    const l = lang ?? uiLang();
    const loc = l === 'tr' ? { hl: 'tr', gl: 'TR', ceid: 'TR:tr' } : { hl: 'en-US', gl: 'US', ceid: 'US:en' };
    const q = period === 'all' ? query : `${query} when:${period}`;
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${loc.hl}&gl=${loc.gl}&ceid=${loc.ceid}`;
    const r = await fetchText(url);
    if (r.status !== 200) return fail(`Google News yanıt vermedi (HTTP ${r.status}).`);
    const all = blocks(r.text, 'item').map((b) => {
      const source = tag(b, 'source');
      let title = tag(b, 'title');
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const pub = tag(b, 'pubDate');
      return { title, source, source_site: attr(b, 'source', 'url') || undefined, published: pub ? new Date(pub).toISOString() : '', url: tag(b, 'link') };
    });
    all.sort((a, b) => (b.published > a.published ? 1 : -1));
    const perDay = topCounts(all.filter((a) => a.published).map((a) => a.published.slice(0, 10)), 400).sort((a, b) => (a.value > b.value ? 1 : -1));
    return ok({
      source: 'Google News (RSS)',
      query,
      period,
      total_found: all.length,
      top_sources: topCounts(all.map((a) => a.source).filter(Boolean), 8),
      articles_per_day: perDay.map((d) => ({ date: d.value, count: d.count })),
      articles: all.slice(0, limit),
    });
  }),
);

// ---------------------------------------------------------------- wiki_interest

interface PageviewsResponse {
  items?: Array<{ timestamp: string; views: number }>;
}
interface WikiSearchResponse {
  query?: { search?: Array<{ title: string }> };
}

server.registerTool(
  'interest_over_time',
  {
    title: 'Zaman içinde ilgi (Wikipedia görüntülenmeleri)',
    description:
      'Bir veya birden fazla konunun zaman içindeki kamu ilgisini, Wikipedia sayfa görüntülenme sayılarıyla (Wikimedia resmi API) ölçer. Haftalık seri, toplam ve son 30 günün önceki 30 güne göre değişimi döner. Markalar/konular arasında ilgi karşılaştırması ve grafik için uygundur. Not: Google Trends değil, Wikipedia ilgisidir.',
    inputSchema: {
      terms: z.array(z.string().min(1)).min(1).max(5).describe('Konu veya marka adları, örn. ["Kahve", "Çay"]'),
      lang: z.enum(['tr', 'en', 'de', 'fr', 'es']).optional().describe('Wikipedia dili (varsayılan: arayüz dili)'),
      days: z.number().int().min(14).max(365).default(90),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ terms, lang, days }) => {
    const l = lang ?? uiLang();
    const end = new Date(Date.now() - 24 * 3600_000);
    const start = new Date(end.getTime() - (days - 1) * 24 * 3600_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const results = [];
    for (const term of terms) {
      const search = await fetchJson<WikiSearchResponse>(
        `https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=1&format=json`,
      );
      const title = search.query?.search?.[0]?.title;
      if (!title) {
        results.push({ term, error: 'Wikipedia sayfası bulunamadı' });
        continue;
      }
      const article = encodeURIComponent(title.replace(/ /g, '_'));
      let pv: PageviewsResponse;
      try {
        pv = await fetchJson<PageviewsResponse>(
          `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${l}.wikipedia/all-access/user/${article}/daily/${fmt(start)}/${fmt(end)}`,
        );
      } catch (e) {
        results.push({ term, article: title, error: `Görüntülenme verisi alınamadı: ${(e as Error).message}` });
        continue;
      }
      const daily = (pv.items ?? []).map((i) => ({ date: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}-${i.timestamp.slice(6, 8)}`, views: i.views }));
      const weekly: Array<{ week_start: string; views: number }> = [];
      for (let i = 0; i < daily.length; i += 7) {
        const chunk = daily.slice(i, i + 7);
        weekly.push({ week_start: chunk[0].date, views: chunk.reduce((s, d) => s + d.views, 0) });
      }
      const total = daily.reduce((s, d) => s + d.views, 0);
      const last30 = daily.slice(-30).reduce((s, d) => s + d.views, 0);
      const prev30 = daily.slice(-60, -30).reduce((s, d) => s + d.views, 0);
      results.push({
        term,
        article: title,
        url: `https://${l}.wikipedia.org/wiki/${article}`,
        total_views: total,
        avg_daily_views: daily.length ? Math.round(total / daily.length) : 0,
        change_last30_vs_prev30_pct: prev30 > 0 ? round(((last30 - prev30) / prev30) * 100, 1) : null,
        peak_day: daily.reduce((m, d) => (d.views > m.views ? d : m), { date: '', views: 0 }),
        weekly,
      });
    }
    return ok({ source: 'Wikimedia pageviews API', lang: l, from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), results });
  }),
);

await startServer(server, 'mar-trends');
