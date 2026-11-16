/**
 * mar-ai · YouTube Analizi MCP
 * Kaynaklar (ücretsiz, anahtarsız, girişsiz):
 *  - YouTube kanal RSS beslemesi (resmi; son 15 video ve izlenme sayıları)
 *  - YouTube oEmbed (resmi; video başlığı, kanal, küçük resim)
 *  - Herkese açık kanal/video sayfalarının meta etiketleri (bağlantı önizlemesinin okuduğu bilgiler)
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchText, fetchJson, ok, fail, safe, startServer, TtlCache, median, round, MARAI_VERSION } from '../../_shared/common';
import { blocks, tag, attr } from '../../_shared/xml';

const server = new McpServer({ name: 'mar-youtube', version: MARAI_VERSION });
const channelCache = new TtlCache<ChannelReport>(15 * 60_000);

interface VideoItem {
  id: string;
  title: string;
  url: string;
  is_short: boolean;
  published: string;
  views: number | null;
  ratings: number | null;
  thumbnail: string;
  description: string;
}

interface ChannelReport {
  channel_id: string;
  name: string;
  url: string;
  description?: string;
  avatar?: string;
  videos_analyzed: number;
  stats: {
    avg_views: number;
    median_views: number;
    max_views: number;
    uploads_per_week: number;
    shorts_share_pct: number;
    avg_views_shorts: number | null;
    avg_views_long: number | null;
    best_weekday: string | null;
  };
  top_videos: VideoItem[];
  videos: VideoItem[];
}

const WEEKDAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)="${key}"[^>]*content="([^"]*)"`, 'i');
  const re2 = new RegExp(`<meta[^>]+content="([^"]*)"[^>]*(?:property|name|itemprop)="${key}"`, 'i');
  return (html.match(re)?.[1] ?? html.match(re2)?.[1] ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

async function resolveChannelId(input: string): Promise<{ id: string; pageUrl: string; html?: string }> {
  const trimmed = input.trim();
  const direct = trimmed.match(/(UC[\w-]{22})/);
  if (direct) return { id: direct[1], pageUrl: `https://www.youtube.com/channel/${direct[1]}` };
  let pageUrl: string;
  if (/^https?:\/\//i.test(trimmed)) pageUrl = trimmed;
  else pageUrl = `https://www.youtube.com/@${trimmed.replace(/^@/, '')}`;
  const r = await fetchText(pageUrl, { headers: { Cookie: 'SOCS=CAI' } });
  if (r.status === 404) throw new Error(`Kanal bulunamadı: ${input}`);
  const html = r.text;
  const id =
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ??
    html.match(/itemprop="identifier" content="(UC[\w-]{22})"/)?.[1] ??
    html.match(/"externalId":"(UC[\w-]{22})"/)?.[1] ??
    html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  if (!id) throw new Error(`Kanal kimliği çözülemedi: ${input}. Kanalın tam adresini (youtube.com/channel/UC...) deneyin.`);
  return { id, pageUrl, html };
}

async function analyzeChannel(input: string): Promise<ChannelReport> {
  const cached = channelCache.get(input.toLowerCase());
  if (cached) return cached;
  const { id, pageUrl, html } = await resolveChannelId(input);
  const feed = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
  if (feed.status !== 200) throw new Error(`Kanal beslemesi alınamadı (HTTP ${feed.status}).`);
  const name = tag(feed.text.split('<entry>')[0], 'title') || meta(html ?? '', 'og:title');
  const videos: VideoItem[] = blocks(feed.text, 'entry').map((e) => {
    const link = attr(e, 'link', 'href');
    const views = attr(e, 'media:statistics', 'views');
    const ratings = attr(e, 'media:starRating', 'count');
    return {
      id: tag(e, 'yt:videoId'),
      title: tag(e, 'title'),
      url: link,
      is_short: link.includes('/shorts/'),
      published: tag(e, 'published'),
      views: views ? Number(views) : null,
      ratings: ratings ? Number(ratings) : null,
      thumbnail: attr(e, 'media:thumbnail', 'url'),
      description: tag(e, 'media:description').slice(0, 280),
    };
  });
  const withViews = videos.filter((v) => v.views !== null) as Array<VideoItem & { views: number }>;
  const views = withViews.map((v) => v.views);
  const dates = videos.map((v) => new Date(v.published).getTime()).filter((t) => !isNaN(t));
  const spanWeeks = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / (7 * 24 * 3600_000) : 0;
  const shorts = withViews.filter((v) => v.is_short);
  const longs = withViews.filter((v) => !v.is_short);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
  const byDay = new Map<number, number[]>();
  for (const v of withViews) {
    const d = new Date(v.published).getDay();
    byDay.set(d, [...(byDay.get(d) ?? []), v.views]);
  }
  let bestDay: string | null = null;
  let bestAvg = -1;
  for (const [d, vs] of byDay) {
    if (vs.length >= 2 && avg(vs) > bestAvg) {
      bestAvg = avg(vs);
      bestDay = WEEKDAYS_TR[d];
    }
  }
  const report: ChannelReport = {
    channel_id: id,
    name,
    url: `https://www.youtube.com/channel/${id}`,
    description: html ? meta(html, 'og:description').slice(0, 400) || undefined : undefined,
    avatar: html ? meta(html, 'og:image') || undefined : undefined,
    videos_analyzed: videos.length,
    stats: {
      avg_views: avg(views),
      median_views: Math.round(median(views)),
      max_views: views.length ? Math.max(...views) : 0,
      uploads_per_week: spanWeeks > 0 ? round((videos.length - 1) / spanWeeks, 2) : videos.length,
      shorts_share_pct: videos.length ? round((videos.filter((v) => v.is_short).length / videos.length) * 100, 1) : 0,
      avg_views_shorts: shorts.length ? avg(shorts.map((v) => v.views)) : null,
      avg_views_long: longs.length ? avg(longs.map((v) => v.views)) : null,
      best_weekday: bestDay,
    },
    top_videos: [...withViews].sort((a, b) => b.views - a.views).slice(0, 3),
    videos,
  };
  void pageUrl;
  channelCache.set(input.toLowerCase(), report);
  return report;
}

server.registerTool(
  'youtube_channel',
  {
    title: 'YouTube kanal analizi',
    description:
      'Bir YouTube kanalının son 15 videosunu (resmi RSS) analiz eder: ortalama/medyan izlenme, haftalık yükleme sıklığı, Shorts oranı, Shorts ve uzun video performansı, en iyi gün ve en çok izlenen videolar. Kanal adresi, @kullanıcıadı veya UC... kimliği kabul eder.',
    inputSchema: {
      channel: z.string().min(2).describe('Örn. "@MrBeast", "https://www.youtube.com/@nike" veya "UCX6OQ3DkcsbYNE6H8uQQuVA"'),
      include_all_videos: z.boolean().default(true).describe('Tüm video listesini de döndür'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ channel, include_all_videos }) => {
    const report = await analyzeChannel(channel);
    return ok({ source: 'YouTube RSS + herkese açık kanal sayfası', ...report, videos: include_all_videos ? report.videos : undefined });
  }),
);

server.registerTool(
  'youtube_compare',
  {
    title: 'YouTube kanallarını karşılaştır',
    description: 'En fazla 5 kanalı yan yana karşılaştırır (ortalama izlenme, yükleme sıklığı, Shorts oranı). Rakip karşılaştırma grafikleri için idealdir.',
    inputSchema: {
      channels: z.array(z.string().min(2)).min(2).max(5),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ channels }) => {
    const rows = [];
    for (const c of channels) {
      try {
        const r = await analyzeChannel(c);
        rows.push({ input: c, name: r.name, url: r.url, ...r.stats, top_video: r.top_videos[0] ? { title: r.top_videos[0].title, views: r.top_videos[0].views, url: r.top_videos[0].url } : null });
      } catch (e) {
        rows.push({ input: c, error: (e as Error).message });
      }
    }
    return ok({ source: 'YouTube RSS', compared: rows.length, channels: rows });
  }),
);

interface OEmbed {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
}

server.registerTool(
  'youtube_video',
  {
    title: 'YouTube video bilgisi',
    description: 'Bir YouTube videosunun (veya Shorts) başlığını, kanalını, yayın tarihini, süresini, izlenme sayısını, açıklamasını ve anahtar kelimelerini getirir.',
    inputSchema: {
      video: z.string().min(5).describe('Video adresi veya 11 karakterlik video kimliği'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ video }) => {
    const id = video.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1] ?? (video.match(/^[\w-]{11}$/) ? video : null);
    if (!id) return fail('Geçerli bir YouTube video adresi veya kimliği verin.');
    const watchUrl = `https://www.youtube.com/watch?v=${id}`;
    const oembed = await fetchJson<OEmbed>(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`).catch(() => null);
    const page = await fetchText(watchUrl, { headers: { Cookie: 'SOCS=CAI' } }).catch(() => null);
    const html = page?.text ?? '';
    const duration = meta(html, 'duration');
    const durMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const seconds = durMatch ? Number(durMatch[1] ?? 0) * 3600 + Number(durMatch[2] ?? 0) * 60 + Number(durMatch[3] ?? 0) : null;
    const interaction = meta(html, 'interactionCount') || html.match(/"viewCount":"(\d+)"/)?.[1] || '';
    if (!oembed && !html) return fail('Video bilgisi alınamadı (video gizli veya kaldırılmış olabilir).');
    return ok({
      source: 'YouTube oEmbed + herkese açık video sayfası',
      id,
      url: watchUrl,
      title: oembed?.title ?? meta(html, 'og:title'),
      channel: oembed?.author_name ?? '',
      channel_url: oembed?.author_url ?? '',
      thumbnail: oembed?.thumbnail_url ?? meta(html, 'og:image'),
      published: meta(html, 'datePublished') || meta(html, 'uploadDate') || null,
      duration_seconds: seconds,
      views: interaction ? Number(interaction) : null,
      genre: meta(html, 'genre') || null,
      keywords: meta(html, 'keywords')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 25),
      description: meta(html, 'description').slice(0, 600),
    });
  }),
);

await startServer(server, 'mar-youtube');
