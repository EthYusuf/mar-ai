/**
 * mar-ai · Web Araştırma MCP (headless Chrome)
 * Sayfaları gerçek bir tarayıcıda (arka planda) açar: JavaScript ile oluşan içerikleri de okur,
 * ekran görüntüsü alır ve pazarlama/SEO denetimi yapar. Giriş yapmaz, form doldurmaz.
 * Genel web araması için Claude'un yerleşik WebSearch aracı kullanılır.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ok, okWithImage, safe, startServer, truncate, MARAI_VERSION } from '../../_shared/common';
import { ChromeSession, assertWebUrl, gotoAndSettle } from '../../_shared/chrome';

const server = new McpServer({ name: 'mar-web', version: MARAI_VERSION });
const chrome = new ChromeSession({ name: 'web', headless: true });

const SOCIAL_HOSTS: Record<string, string> = {
  'instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'facebook.com': 'facebook',
  'x.com': 'x',
  'twitter.com': 'x',
  'linkedin.com': 'linkedin',
  'pinterest.com': 'pinterest',
  'threads.net': 'threads',
  'threads.com': 'threads',
};

/** Sayfa içinde çalışır: ana içeriği, başlıkları ve sosyal bağlantıları çıkarır. */
function extractInPage(socialHosts: Record<string, string>) {
  const q = (sel: string) => document.querySelector(sel);
  const metaContent = (sel: string) => (q(sel) as HTMLMetaElement | null)?.content?.trim() || '';
  const articles = document.querySelectorAll('article');
  const root =
    (q('main') as HTMLElement | null) ||
    (q('[role="main"]') as HTMLElement | null) ||
    (articles.length === 1 ? (articles[0] as HTMLElement) : null) ||
    document.body;
  const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .map((h) => ({ level: h.tagName.toLowerCase(), text: (h.textContent || '').replace(/\s+/g, ' ').trim() }))
    .filter((h) => h.text)
    .slice(0, 40);
  const socials: Record<string, string> = {};
  document.querySelectorAll('a[href]').forEach((a) => {
    try {
      const u = new URL((a as HTMLAnchorElement).href);
      const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
      const key = Object.keys(socialHosts).find((h) => host === h || host.endsWith('.' + h));
      if (key && !socials[socialHosts[key]] && u.pathname.length > 1) socials[socialHosts[key]] = u.href;
    } catch {
      /* geçersiz bağlantı */
    }
  });
  // Sekme okuma sonrası kapatılacağı için gürültü ögeleri canlı sayfadan kaldırılır;
  // innerText yalnızca canlı (yerleşimi hesaplanmış) ögelerde satır sonlarını korur.
  root.querySelectorAll('script,style,noscript,svg,iframe,nav,footer,form,[aria-hidden="true"]').forEach((el) => el.remove());
  const text = (root.innerText || root.textContent || '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
  return {
    title: document.title,
    description: metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]'),
    lang: document.documentElement.lang || '',
    canonical: (q('link[rel="canonical"]') as HTMLLinkElement | null)?.href || '',
    og_image: metaContent('meta[property="og:image"]'),
    headings,
    social_profiles: socials,
    text,
    word_count: text ? text.split(/\s+/).length : 0,
  };
}

server.registerTool(
  'web_read',
  {
    title: 'Sayfayı oku (headless Chrome)',
    description:
      'Bir web sayfasını arka planda çalışan gerçek bir tarayıcıda açar ve ana metni, başlıkları, meta açıklamasını ve sosyal medya hesap bağlantılarını döndürür. JavaScript ile oluşan sayfalarda (rakip siteleri, kampanya sayfaları, ürün sayfaları) WebFetch yerine bunu kullan.',
    inputSchema: {
      url: z.string().min(4).describe('Okunacak sayfa adresi'),
      max_chars: z.number().int().min(1000).max(60000).default(15000).describe('Döndürülecek en fazla metin uzunluğu'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ url, max_chars }) => {
    const target = assertWebUrl(url);
    return chrome.withPage(async (page) => {
      const nav = await gotoAndSettle(page, target);
      const data = await page.evaluate(extractInPage, SOCIAL_HOSTS);
      return ok({ url: nav.finalUrl, http_status: nav.status, load_ms: nav.loadMs, ...data, text: truncate(data.text, max_chars) });
    });
  }),
);

server.registerTool(
  'web_screenshot',
  {
    title: 'Sayfa ekran görüntüsü',
    description:
      'Bir web sayfasının ekran görüntüsünü alır ve görsel olarak döndürür; böylece açılış sayfası tasarımını, kampanya görsellerini, fiyat kutularını ve mesaj hiyerarşisini görerek yorumlayabilirsin. Mobil görünüm için mobile=true kullan.',
    inputSchema: {
      url: z.string().min(4),
      mobile: z.boolean().default(false).describe('Telefon boyutunda (390x844) görüntü al'),
      full_page: z.boolean().default(false).describe('Tüm sayfayı (kaydırarak) yakala; uzun sayfalarda görüntü küçülür'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ url, mobile, full_page }) => {
    const target = assertWebUrl(url);
    return chrome.withPage(async (page) => {
      if (mobile) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const nav = await gotoAndSettle(page, target, 1500);
      const shot = await page.screenshot({ type: 'jpeg', quality: 70, fullPage: full_page, encoding: 'base64', captureBeyondViewport: full_page });
      const title = await page.title();
      return okWithImage({ url: nav.finalUrl, title, view: mobile ? 'mobil' : 'masaüstü' }, shot as string, 'image/jpeg');
    });
  }),
);

const TRACKERS: Array<{ name: string; test: RegExp }> = [
  { name: 'Google Analytics 4 / gtag', test: /googletagmanager\.com\/gtag\/js|google-analytics\.com\/(g\/collect|analytics\.js)/ },
  { name: 'Google Tag Manager', test: /googletagmanager\.com\/gtm\.js/ },
  { name: 'Google Ads', test: /googleadservices\.com|googleads\.g\.doubleclick\.net|AW-\d+/ },
  { name: 'Meta (Facebook) Pixel', test: /connect\.facebook\.net\/.+\/fbevents\.js|facebook\.com\/tr\?/ },
  { name: 'TikTok Pixel', test: /analytics\.tiktok\.com/ },
  { name: 'LinkedIn Insight', test: /snap\.licdn\.com|px\.ads\.linkedin\.com/ },
  { name: 'Pinterest Tag', test: /s\.pinimg\.com\/ct\/core\.js|ct\.pinterest\.com/ },
  { name: 'Snap Pixel', test: /sc-static\.net\/scevent/ },
  { name: 'X (Twitter) Pixel', test: /static\.ads-twitter\.com|analytics\.twitter\.com/ },
  { name: 'Hotjar', test: /static\.hotjar\.com/ },
  { name: 'Microsoft Clarity', test: /clarity\.ms/ },
  { name: 'Yandex Metrica', test: /mc\.yandex\.ru/ },
  { name: 'Criteo', test: /static\.criteo\.net|criteo\.com/ },
  { name: 'Klaviyo', test: /klaviyo\.com/ },
  { name: 'HubSpot', test: /js\.hs-scripts\.com|hs-analytics\.net/ },
  { name: 'Shopify', test: /cdn\.shopify\.com/ },
  { name: 'WordPress', test: /wp-content\/|wp-includes\// },
  { name: 'Ticimax', test: /ticimax/ },
  { name: 'IdeaSoft', test: /ideasoft/ },
  { name: 'Insider', test: /useinsider\.com|api\.useinsider/ },
];

server.registerTool(
  'site_audit',
  {
    title: 'Pazarlama ve SEO denetimi',
    description:
      'Bir sitenin pazarlama altyapısını denetler: başlık/açıklama uzunlukları, Open Graph ve sosyal paylaşım etiketleri, H1 yapısı, yapılandırılmış veri, mobil uyumluluk etiketi, alt metni eksik görseller, yükleme süresi ve sayfada çalışan reklam/analitik pikselleri (Meta Pixel, TikTok Pixel, Google Ads, GA4 vb.). Rakibin hangi kanallarda reklam verdiğini anlamak için de kullanılır.',
    inputSchema: {
      url: z.string().min(4),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ url }) => {
    const target = assertWebUrl(url);
    return chrome.withPage(async (page) => {
      const requests: string[] = [];
      page.on('request', (req) => {
        if (requests.length < 1500) requests.push(req.url());
      });
      const nav = await gotoAndSettle(page, target, 2500);
      const dom = await page.evaluate(() => {
        const m = (sel: string) => (document.querySelector(sel) as HTMLMetaElement | null)?.content?.trim() || '';
        const imgs = Array.from(document.images);
        const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .flatMap((s) => {
            try {
              const j = JSON.parse(s.textContent || '{}');
              const arr = Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j];
              return arr.map((x: Record<string, unknown>) => String(x['@type'] ?? '')).filter(Boolean);
            } catch {
              return [];
            }
          })
          .slice(0, 15);
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const transfer = resources.reduce((s, r) => s + (r.transferSize || 0), 0) + (nav?.transferSize || 0);
        return {
          title: document.title,
          description: m('meta[name="description"]'),
          canonical: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || '',
          lang: document.documentElement.lang || '',
          viewport: m('meta[name="viewport"]'),
          og: { title: m('meta[property="og:title"]'), description: m('meta[property="og:description"]'), image: m('meta[property="og:image"]'), type: m('meta[property="og:type"]') },
          twitter_card: m('meta[name="twitter:card"]'),
          h1: Array.from(document.querySelectorAll('h1')).map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 5),
          h2_count: document.querySelectorAll('h2').length,
          images: imgs.length,
          images_without_alt: imgs.filter((i) => !i.getAttribute('alt')).length,
          structured_data_types: ld,
          dom_content_loaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
          load_ms: nav ? Math.round(nav.loadEventEnd) : null,
          transfer_kb: Math.round(transfer / 1024),
          request_count: resources.length + 1,
          html_snippet_for_trackers: Array.from(document.scripts).map((s) => s.src || (s.textContent || '').slice(0, 400)).join('\n').slice(0, 60000),
        };
      });
      const haystack = requests.join('\n') + '\n' + dom.html_snippet_for_trackers;
      const trackers = TRACKERS.filter((t) => t.test.test(haystack)).map((t) => t.name);
      const issues: string[] = [];
      if (!dom.title) issues.push('Sayfa başlığı (title) yok');
      else if (dom.title.length > 60) issues.push(`Başlık uzun (${dom.title.length} karakter; ideal 50-60)`);
      if (!dom.description) issues.push('Meta açıklaması yok');
      else if (dom.description.length > 160) issues.push(`Meta açıklaması uzun (${dom.description.length} karakter; ideal 120-160)`);
      if (!dom.og.image) issues.push('og:image yok (sosyal medyada paylaşılınca görsel çıkmaz)');
      if (dom.h1.length === 0) issues.push('H1 başlığı yok');
      if (dom.h1.length > 1) issues.push(`Birden fazla H1 var (${dom.h1.length})`);
      if (!dom.viewport) issues.push('Mobil viewport etiketi yok');
      if (dom.images_without_alt > 0) issues.push(`${dom.images_without_alt} görselde alt metni yok`);
      if (dom.load_ms && dom.load_ms > 5000) issues.push(`Sayfa yavaş yükleniyor (${(dom.load_ms / 1000).toFixed(1)} sn)`);
      const score = Math.max(0, 100 - issues.length * 9);
      const { html_snippet_for_trackers: _omit, ...rest } = dom;
      void _omit;
      return ok({
        url: nav.finalUrl,
        http_status: nav.status,
        score,
        issues,
        advertising_and_analytics: trackers,
        runs_paid_social_hint: trackers.some((t) => /Meta|TikTok|Snap|Pinterest|LinkedIn|X \(/.test(t)),
        ...rest,
      });
    });
  }),
);

await startServer(server, 'mar-web', () => chrome.close());
