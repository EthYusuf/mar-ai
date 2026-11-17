/**
 * mar-ai · Trendler ve Haberler MCP
 * Kaynaklar (hepsi ücretsiz, anahtarsız, girişsiz ve resmi/herkese açık):
 *  - Google Trends günlük trend beslemesi (RSS)
 *  - Google News arama beslemesi (RSS)
 * Konuların zaman içindeki ilgisi ve tahmini için "potential" MCP'sindeki trend_potential aracına bakın.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchText, ok, fail, safe, startServer, TtlCache, topCounts, parseCompactNumber, uiLang, MARAI_VERSION } from '../../_shared/common';
import { blocks, tag, attr } from '../../_shared/xml';
import { addDaysIso, isoDay } from '../../_shared/analytics';
import { chartHint, saveChart } from '../../_shared/charts';

const server = new McpServer({ name: 'mar-trends', version: MARAI_VERSION });
const cache = new TtlCache<unknown>(10 * 60_000);
const tt = (tr: string, en: string) => (uiLang() === 'tr' ? tr : en);

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
    const top = items
      .slice(0, limit)
      .map((i) => ({ q: i.query, v: parseCompactNumber(i.approx_searches.replace(/\+/g, ''), 'en') }))
      .filter((x): x is { q: string; v: number } => x.v !== null && x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 10);
    const chartRef =
      top.length >= 3
        ? saveChart({
            title: tt(`Şu an yükselen aramalar · ${geo.toUpperCase()}`, `Rising searches right now · ${geo.toUpperCase()}`),
            subtitle: tt('Google Trends yaklaşık arama hacmi (alt sınır, örn. 2.000+)', 'Google Trends approximate search volume (lower bound, e.g. 2,000+)'),
            sources: ['Google Trends'],
            spec: { chartType: 'bar', categories: top.map((x) => x.q), series: [{ name: tt('Yaklaşık arama', 'Approx. searches'), values: top.map((x) => x.v) }], unit: tt('arama', 'searches'), valueFormat: 'compact' },
          })
        : null;
    return ok({
      source: 'Google Trends (günlük trend RSS)',
      geo: geo.toUpperCase(),
      fetched_at: new Date().toISOString(),
      count: Math.min(items.length, limit),
      trends: items.slice(0, limit),
      chart_ref: chartRef ?? undefined,
      chart_hint: chartRef ? chartHint(chartRef, uiLang()) : undefined,
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
    let chartRef: string | null = null;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 0;
    if (days && all.length >= 5) {
      const today = isoDay(Date.now());
      const cats = Array.from({ length: days }, (_, i) => addDaysIso(today, i - days + 1));
      const counts = new Map(perDay.map((d) => [d.value, d.count]));
      chartRef = saveChart({
        title: tt(`"${query}" · günlük haber yoğunluğu`, `"${query}" · daily news volume`),
        subtitle: tt(
          `Google News, son ${days} gün${all.length >= 100 ? ' · besleme en yeni 100 haberle sınırlı olduğu için eski günler eksik görünebilir' : ''}`,
          `Google News, last ${days} days${all.length >= 100 ? ' · the feed is capped at the newest 100 stories, so older days may look low' : ''}`,
        ),
        sources: ['Google News'],
        spec: { chartType: 'area', xType: 'time', categories: cats, series: [{ name: tt('Haber', 'Stories'), values: cats.map((d) => counts.get(d) ?? 0) }], unit: tt('haber', 'stories') },
      });
    }
    return ok({
      source: 'Google News (RSS)',
      query,
      period,
      total_found: all.length,
      top_sources: topCounts(all.map((a) => a.source).filter(Boolean), 8),
      articles_per_day: perDay.map((d) => ({ date: d.value, count: d.count })),
      chart_ref: chartRef ?? undefined,
      chart_hint: chartRef ? chartHint(chartRef, uiLang()) : undefined,
      articles: all.slice(0, limit),
    });
  }),
);

await startServer(server, 'mar-trends');
