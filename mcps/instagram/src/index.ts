/**
 * mar-ai · Instagram (herkese açık) MCP
 *
 * Yalnızca giriş yapmamış bir ziyaretçinin gördüğü bilgileri okur:
 *  - Profil sayfasının meta etiketleri (takipçi, takip, gönderi sayısı, biyografi)
 *  - Profilde görünen son gönderi bağlantıları
 *  - Gönderi sayfalarının meta etiketleri (beğeni, yorum, tarih, açıklama)
 * Giriş yapmaz, gizli API kullanmaz, kimlik taklidi yapmaz; istekler arasında bekler.
 * Gizli hesaplar ve yalnızca girişle görülen veriler (hikayeler, hashtag sayfaları) kapsam dışıdır.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Page } from 'puppeteer-core';
import { ok, fail, safe, startServer, TtlCache, parseCompactNumber, round, median, hashtags, topCounts, sleep, uiLang, MARAI_VERSION } from '../../_shared/common';
import { ChromeSession, gotoAndSettle } from '../../_shared/chrome';
import { chartHint, saveChart } from '../../_shared/charts';

const tt = (tr: string, en: string) => (uiLang() === 'tr' ? tr : en);

const server = new McpServer({ name: 'mar-instagram', version: MARAI_VERSION });
// Sayfa biçimi İngilizce arayüzde sabit olduğu için ayrıştırma en-US ile yapılır.
const chrome = new ChromeSession({ name: 'instagram', headless: true, lang: 'en-US' });
const profileCache = new TtlCache<ProfileReport>(20 * 60_000);
const postCache = new TtlCache<PostInfo>(60 * 60_000);

const PAGE_GAP_MS = 2200; // Instagram'a nazik davranmak için sayfalar arası bekleme

interface PostInfo {
  url: string;
  shortcode: string;
  type: 'reel' | 'post';
  likes: number | null;
  comments: number | null;
  date: string | null;
  caption: string;
  hashtags: string[];
  thumbnail: string;
}

interface ProfileReport {
  username: string;
  name: string;
  url: string;
  followers: number | null;
  following: number | null;
  posts_total: number | null;
  bio: string;
  profile_picture: string;
  recent_post_urls: string[];
  analyzed_posts: PostInfo[];
  metrics: ReturnType<typeof computeMetrics>;
}

let lastVisit = 0;
async function visit(page: Page, url: string): Promise<void> {
  const wait = lastVisit + PAGE_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastVisit = Date.now();
  await gotoAndSettle(page, url, 900);
  const final = page.url();
  if (/\/accounts\/login|\/challenge\//.test(final)) {
    throw new Error('Instagram şu an ziyaretçi erişimini sınırladı (giriş sayfasına yönlendirdi). Birkaç dakika sonra tekrar deneyin. mar-ai giriş yapmaz.');
  }
}

async function readMeta(page: Page) {
  return page.evaluate(() => {
    const m = (s: string) => document.querySelector(s)?.getAttribute('content') || '';
    return {
      description: m('meta[name="description"]') || m('meta[property="og:description"]'),
      og_title: m('meta[property="og:title"]'),
      og_image: m('meta[property="og:image"]'),
      time: document.querySelector('time[datetime]')?.getAttribute('datetime') || '',
      links: Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h, i, arr) => arr.indexOf(h) === i)
        .slice(0, 12),
    };
  });
}

function normalizeUsername(input: string): string {
  const fromUrl = input.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1];
  return (fromUrl ?? input).replace(/^@/, '').trim().toLowerCase();
}

async function readPost(page: Page, url: string): Promise<PostInfo> {
  const cached = postCache.get(url);
  if (cached) return cached;
  await visit(page, url);
  const meta = await readMeta(page);
  // "16K likes, 122 comments - nike on November 16, 2026: "caption"."
  const d = meta.description;
  const likes = d.match(/([\d.,]+[KMB]?)\s+likes?/i)?.[1];
  const comments = d.match(/([\d.,]+[KMB]?)\s+comments?/i)?.[1];
  const caption = d.match(/:\s*"([\s\S]*)"\.?\s*$/)?.[1] ?? '';
  const info: PostInfo = {
    url,
    shortcode: url.match(/\/(?:p|reel)\/([\w-]+)/)?.[1] ?? '',
    type: url.includes('/reel/') ? 'reel' : 'post',
    likes: parseCompactNumber(likes, 'en'),
    comments: parseCompactNumber(comments, 'en'),
    date: meta.time || null,
    caption: caption.slice(0, 600),
    hashtags: hashtags(caption),
    thumbnail: meta.og_image,
  };
  postCache.set(url, info);
  return info;
}

function computeMetrics(followers: number | null, posts: PostInfo[]) {
  const valid = posts.filter((p) => p.likes !== null);
  if (!valid.length) return null;
  const inter = (p: PostInfo) => (p.likes ?? 0) + (p.comments ?? 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const reels = valid.filter((p) => p.type === 'reel');
  const others = valid.filter((p) => p.type === 'post');
  const dates = valid.map((p) => (p.date ? new Date(p.date).getTime() : NaN)).filter((t) => !isNaN(t));
  const spanDays = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / 86400_000 : 0;
  const er = (xs: PostInfo[]) => (followers && xs.length ? round((avg(xs.map(inter)) / followers) * 100, 3) : null);
  return {
    posts_analyzed: valid.length,
    avg_likes: Math.round(avg(valid.map((p) => p.likes ?? 0))),
    median_likes: Math.round(median(valid.map((p) => p.likes ?? 0))),
    avg_comments: Math.round(avg(valid.map((p) => p.comments ?? 0))),
    engagement_rate_pct: er(valid),
    engagement_rate_reels_pct: er(reels),
    engagement_rate_posts_pct: er(others),
    reels_share_pct: round((reels.length / valid.length) * 100, 1),
    posts_per_week: spanDays > 0 ? round(((valid.length - 1) / spanDays) * 7, 2) : null,
    top_hashtags: topCounts(valid.flatMap((p) => p.hashtags), 10),
    best_post: [...valid].sort((a, b) => inter(b) - inter(a))[0]?.url ?? null,
    note: 'Etkileşim oranı = (ortalama beğeni + yorum) / takipçi. Yalnızca herkese açık gönderi sayfalarındaki sayılar kullanılmıştır.',
  };
}

async function analyzeProfile(usernameInput: string, postsToAnalyze: number): Promise<ProfileReport> {
  const username = normalizeUsername(usernameInput);
  const cacheKey = `${username}:${postsToAnalyze}`;
  const cached = profileCache.get(cacheKey);
  if (cached) return cached;
  return chrome.withPage(async (page) => {
    const url = `https://www.instagram.com/${username}/`;
    await visit(page, url);
    const meta = await readMeta(page);
    // "291M Followers, 271 Following, 1,675 Posts - Nike (@nike) on Instagram: "Just Do It.""
    const d = meta.description;
    if (!/Followers/i.test(d)) {
      throw new Error(`@${username} için herkese açık profil bilgisi bulunamadı (hesap yok, gizli ya da Instagram erişimi sınırladı).`);
    }
    const followers = parseCompactNumber(d.match(/([\d.,]+[KMB]?)\s+Followers/i)?.[1], 'en');
    const following = parseCompactNumber(d.match(/([\d.,]+[KMB]?)\s+Following/i)?.[1], 'en');
    const postsTotal = parseCompactNumber(d.match(/([\d.,]+[KMB]?)\s+Posts/i)?.[1], 'en');
    const name = meta.og_title.replace(/\s*\(@[^)]+\).*$/, '').trim() || username;
    const bio = d.match(/on Instagram:\s*"([\s\S]*)"\s*$/)?.[1] ?? '';
    const postUrls = meta.links;
    const analyzed: PostInfo[] = [];
    for (const p of postUrls.slice(0, postsToAnalyze)) {
      try {
        analyzed.push(await readPost(page, p));
      } catch (e) {
        if (/sınırladı/.test((e as Error).message)) break;
      }
    }
    const report: ProfileReport = {
      username,
      name,
      url,
      followers,
      following,
      posts_total: postsTotal,
      bio,
      profile_picture: meta.og_image,
      recent_post_urls: postUrls,
      analyzed_posts: analyzed,
      metrics: computeMetrics(followers, analyzed),
    };
    profileCache.set(cacheKey, report);
    return report;
  });
}

server.registerTool(
  'instagram_profile',
  {
    title: 'Instagram profil analizi',
    description:
      'Herkese açık bir Instagram hesabını ziyaretçi olarak inceler: takipçi/takip/gönderi sayısı, biyografi, son gönderiler ve (posts > 0 ise) her gönderinin beğeni, yorum, tarih ve açıklaması; ortalama etkileşim oranı, Reels oranı, paylaşım sıklığı ve en çok kullanılan hashtagler. Her gönderi ayrı sayfa olduğu için posts arttıkça süre uzar (gönderi başına ~3 sn).',
    inputSchema: {
      username: z.string().min(1).describe('Kullanıcı adı (@ile veya olmadan) ya da profil adresi'),
      posts: z.number().int().min(0).max(12).default(6).describe('Ayrıntılı incelenecek son gönderi sayısı'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ username, posts }) => {
    const report = await analyzeProfile(username, posts);
    const chartRef = postsChart(report);
    return ok({
      source: 'Instagram herkese açık sayfalar (ziyaretçi görünümü)',
      fetched_at: new Date().toISOString(),
      ...report,
      chart_ref: chartRef ?? undefined,
      chart_hint: chartRef ? chartHint(chartRef, uiLang()) : undefined,
    });
  }),
);

/** Gönderi başına etkileşim (beğeni + yorum) zaman çizgisi */
function postsChart(r: ProfileReport): string | null {
  const posts = r.analyzed_posts.filter((p) => p.likes !== null && p.date).sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? -1 : 1));
  if (posts.length < 3) return null;
  const values = posts.map((p) => (p.likes ?? 0) + (p.comments ?? 0));
  let best = 0;
  values.forEach((v, i) => {
    if (v > values[best]) best = i;
  });
  return saveChart({
    title: tt(`@${r.username} · gönderi başına etkileşim`, `@${r.username} · engagement per post`),
    subtitle: tt(`Son ${posts.length} gönderi, beğeni + yorum`, `Last ${posts.length} posts, likes + comments`),
    sources: ['Instagram'],
    spec: {
      chartType: 'line',
      xType: 'time',
      evenSpacing: true,
      categories: posts.map((p) => (p.date ?? '').slice(0, 10)),
      series: [{ name: tt('Etkileşim', 'Engagement'), values }],
      markers: [{ index: best, label: posts[best].type === 'reel' ? tt('En iyi (Reels)', 'Best (Reel)') : tt('En iyi', 'Best') }],
      unit: tt('etkileşim', 'interactions'),
    },
  });
}

server.registerTool(
  'instagram_post',
  {
    title: 'Instagram gönderi bilgisi',
    description: 'Herkese açık tek bir Instagram gönderisinin veya Reels videosunun beğeni, yorum, tarih, açıklama ve hashtaglerini getirir.',
    inputSchema: {
      url: z.string().regex(/instagram\.com\/.*(p|reel)\//, 'Instagram gönderi/reel adresi olmalı'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ url }) => {
    const clean = url.split('?')[0];
    const info = await chrome.withPage((page) => readPost(page, clean));
    if (info.likes === null && !info.caption) return fail('Gönderi bilgisi okunamadı (gönderi gizli, silinmiş ya da erişim sınırlanmış olabilir).');
    return ok({ source: 'Instagram herkese açık gönderi sayfası', ...info });
  }),
);

server.registerTool(
  'instagram_compare',
  {
    title: 'Instagram hesaplarını karşılaştır',
    description:
      'En fazla 4 herkese açık hesabı yan yana karşılaştırır: takipçi, ortalama beğeni/yorum, etkileşim oranı, Reels oranı ve paylaşım sıklığı. Rakip analizi ve karşılaştırma grafikleri için kullan.',
    inputSchema: {
      usernames: z.array(z.string().min(1)).min(2).max(4),
      posts_per_account: z.number().int().min(0).max(6).default(3),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ usernames, posts_per_account }) => {
    type Row = {
      username: string;
      name: string;
      followers: number | null;
      posts_total: number | null;
      avg_likes: number | null;
      avg_comments: number | null;
      engagement_rate_pct: number | null;
      reels_share_pct: number | null;
      posts_per_week: number | null;
    };
    const rows: Array<Row | { username: string; error: string }> = [];
    for (const u of usernames) {
      try {
        const r = await analyzeProfile(u, posts_per_account);
        rows.push({
          username: r.username,
          name: r.name,
          followers: r.followers,
          posts_total: r.posts_total,
          avg_likes: r.metrics?.avg_likes ?? null,
          avg_comments: r.metrics?.avg_comments ?? null,
          engagement_rate_pct: r.metrics?.engagement_rate_pct ?? null,
          reels_share_pct: r.metrics?.reels_share_pct ?? null,
          posts_per_week: r.metrics?.posts_per_week ?? null,
        });
      } catch (e) {
        rows.push({ username: normalizeUsername(u), error: (e as Error).message });
      }
    }
    const good = rows.filter((r): r is Row => 'name' in r);
    const charts: Record<string, string> = {};
    if (good.filter((r) => r.engagement_rate_pct !== null).length >= 2)
      charts.engagement_rate = saveChart({
        title: tt('Etkileşim oranı (beğeni + yorum / takipçi)', 'Engagement rate (likes + comments / followers)'),
        sources: ['Instagram'],
        spec: { chartType: 'column', categories: good.map((r) => `@${r.username}`), series: [{ name: tt('Etkileşim oranı', 'Engagement rate'), values: good.map((r) => r.engagement_rate_pct) }], valueFormat: 'percent' },
      });
    if (good.filter((r) => r.followers !== null).length >= 2)
      charts.followers = saveChart({
        title: tt('Takipçi sayısı', 'Followers'),
        sources: ['Instagram'],
        spec: { chartType: 'bar', categories: good.map((r) => `@${r.username}`), series: [{ name: tt('Takipçi', 'Followers'), values: good.map((r) => r.followers) }], valueFormat: 'compact' },
      });
    return ok({
      source: 'Instagram herkese açık sayfalar',
      accounts: rows,
      chart_refs: Object.keys(charts).length ? charts : undefined,
      chart_hint: charts.engagement_rate ? chartHint(charts.engagement_rate, uiLang()) : undefined,
    });
  }),
);

await startServer(server, 'mar-instagram', () => chrome.close());
