/**
 * mar-ai · Tarayıcı Kontrolü MCP (computer use)
 * Yapay zekanın bir tarayıcıyı adım adım kullanmasını sağlar: sayfa aç, ögeleri listele,
 * tıkla, yaz, kaydır, ekran görüntüsü al. Varsayılan olarak arka planda (headless) çalışır;
 * Ayarlar > "Computer use" açıksa pencere görünür olur ve kullanıcı işlemleri izleyebilir.
 *
 * Güvenlik kuralları:
 *  - Parola alanlarına yazmaz; hiçbir siteye giriş yapmaz.
 *  - Yalnızca http/https adreslerini açar (yerel dosya ve tarayıcı iç sayfaları kapalı).
 *  - Kullanıcının kendi tarayıcı profiline değil, ayrı ve boş bir profile bağlanır.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Page } from 'puppeteer-core';
import { ok, okWithImage, fail, safe, startServer, truncate, MARAI_VERSION } from '../../_shared/common';
import { ChromeSession, assertWebUrl, gotoAndSettle } from '../../_shared/chrome';

const headless = process.env.MARAI_BROWSER_HEADLESS !== '0';
const chrome = new ChromeSession({ name: 'browser', headless, idleCloseMs: 10 * 60_000, viewport: { width: 1280, height: 860 } });
const server = new McpServer({ name: 'mar-browser', version: MARAI_VERSION });

let current: Page | null = null;

async function getPage(): Promise<Page> {
  chrome.touch();
  if (current && !current.isClosed()) return current;
  current = await chrome.newPage();
  return current;
}

async function requirePage(): Promise<Page> {
  if (!current || current.isClosed()) throw new Error('Açık bir sayfa yok. Önce browser_open ile bir adres aç.');
  chrome.touch();
  return current;
}

interface SnapItem {
  ref: number;
  role: string;
  name: string;
  in_view: boolean;
  href?: string;
}

/** Sayfa içinde çalışır: etkileşimli ögeleri numaralandırır. */
function snapshotInPage(maxItems: number): { items: SnapItem[]; total: number } {
  document.querySelectorAll('[data-marai-ref]').forEach((e) => e.removeAttribute('data-marai-ref'));
  const selector =
    'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=option],[role=combobox],[contenteditable=true]';
  const all: Array<SnapItem & { el: Element }> = [];
  let n = 0;
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
    n++;
    const tag = el.tagName.toLowerCase();
    const input = el as HTMLInputElement;
    const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'input' ? `input:${input.type || 'text'}` : tag);
    const label =
      el.getAttribute('aria-label') ||
      (el as HTMLElement).innerText ||
      (tag === 'input' || tag === 'textarea' ? input.value || input.placeholder : '') ||
      el.getAttribute('title') ||
      el.getAttribute('alt') ||
      (el.querySelector('img') as HTMLImageElement | null)?.alt ||
      '';
    all.push({
      el,
      ref: n,
      role,
      name: label.replace(/\s+/g, ' ').trim().slice(0, 90),
      in_view: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
      href: tag === 'a' ? (el as HTMLAnchorElement).href.slice(0, 140) : undefined,
    });
  }
  all.sort((a, b) => Number(b.in_view) - Number(a.in_view));
  const picked = all.slice(0, maxItems);
  for (const p of picked) p.el.setAttribute('data-marai-ref', String(p.ref));
  return { items: picked.map(({ el: _el, ...rest }) => rest), total: all.length };
}

async function pageState(page: Page, maxItems = 60) {
  const snap = await page.evaluate(snapshotInPage, maxItems);
  const visibleText = await page.evaluate(() => (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 2500));
  const scroll = await page.evaluate(() => ({
    y: Math.round(scrollY),
    page_height: document.documentElement.scrollHeight,
    viewport_height: innerHeight,
  }));
  return { url: page.url(), title: await page.title(), scroll, elements_total: snap.total, elements: snap.items, visible_text_excerpt: visibleText };
}

async function settle(page: Page, ms = 900): Promise<void> {
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 6000 });
  } catch {
    /* sorun değil */
  }
  await new Promise((r) => setTimeout(r, ms));
}

async function byRef(page: Page, ref: number) {
  const el = await page.$(`[data-marai-ref="${ref}"]`);
  if (!el) throw new Error(`#${ref} numaralı öge bulunamadı. Sayfa değişmiş olabilir; browser_snapshot ile listeyi yenile.`);
  return el;
}

server.registerTool(
  'browser_open',
  {
    title: 'Tarayıcıda adres aç',
    description:
      'Tarayıcıda bir adresi açar ve sayfadaki tıklanabilir ögeleri numaralarıyla (ref) listeler. Ardından browser_click / browser_type ile bu numaraları kullanarak sayfada gezinebilirsin. Görsel kontrol için browser_screenshot kullan.',
    inputSchema: { url: z.string().min(4) },
    annotations: { openWorldHint: true },
  },
  safe(async ({ url }) => {
    const page = await getPage();
    const nav = await gotoAndSettle(page, assertWebUrl(url));
    return ok({ http_status: nav.status, browser: chrome.browserName, mode: headless ? 'arka planda' : 'görünür (computer use)', ...(await pageState(page)) });
  }),
);

server.registerTool(
  'browser_snapshot',
  {
    title: 'Sayfa ögelerini listele',
    description: 'Açık sayfanın güncel durumunu verir: adres, başlık, kaydırma konumu, numaralı etkileşimli ögeler ve görünen metnin özeti.',
    inputSchema: { max_items: z.number().int().min(10).max(200).default(60) },
    annotations: { readOnlyHint: true },
  },
  safe(async ({ max_items }) => ok(await pageState(await requirePage(), max_items))),
);

server.registerTool(
  'browser_click',
  {
    title: 'Ögeye tıkla',
    description: 'browser_open / browser_snapshot listesindeki numarası (ref) verilen ögeye gerçek bir fare tıklamasıyla tıklar ve yeni sayfa durumunu döndürür.',
    inputSchema: { ref: z.number().int().min(1) },
    annotations: { openWorldHint: true },
  },
  safe(async ({ ref }) => {
    const page = await requirePage();
    const el = await byRef(page, ref);
    await el.scrollIntoView().catch(() => undefined);
    await el.click();
    await settle(page);
    return ok(await pageState(page));
  }),
);

server.registerTool(
  'browser_type',
  {
    title: 'Alana yaz',
    description: 'Numarası verilen metin alanına (arama kutusu, filtre vb.) yazar; submit=true ise Enter tuşuna basar. Parola alanlarına yazmaz ve giriş formu doldurmaz.',
    inputSchema: {
      ref: z.number().int().min(1),
      text: z.string().max(2000),
      submit: z.boolean().default(false),
    },
    annotations: { openWorldHint: true },
  },
  safe(async ({ ref, text, submit }) => {
    const page = await requirePage();
    const el = await byRef(page, ref);
    const kind = await el.evaluate((node) => ({
      type: ((node as HTMLInputElement).type || '').toLowerCase(),
      autocomplete: ((node as HTMLInputElement).autocomplete || '').toLowerCase(),
    }));
    if (kind.type === 'password' || /password|current-password|new-password|one-time-code/.test(kind.autocomplete)) {
      return fail('Güvenlik: mar-ai parola alanlarına yazmaz ve hesaplara giriş yapmaz.');
    }
    await el.scrollIntoView().catch(() => undefined);
    await el.click({ count: 3 });
    await page.keyboard.type(text, { delay: 12 });
    if (submit) await page.keyboard.press('Enter');
    await settle(page);
    return ok(await pageState(page));
  }),
);

server.registerTool(
  'browser_press_key',
  {
    title: 'Tuşa bas',
    description: 'Klavye tuşuna basar. Örn. Enter, Escape, Tab, ArrowDown, PageDown.',
    inputSchema: { key: z.enum(['Enter', 'Escape', 'Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', 'Space']) },
    annotations: { openWorldHint: true },
  },
  safe(async ({ key }) => {
    const page = await requirePage();
    await page.keyboard.press(key === 'Space' ? ' ' : key);
    await settle(page, 500);
    return ok(await pageState(page, 40));
  }),
);

server.registerTool(
  'browser_scroll',
  {
    title: 'Kaydır',
    description: 'Sayfayı aşağı/yukarı kaydırır (ekran boyu cinsinden). Sonsuz kaydırmalı sayfalarda yeni içeriklerin yüklenmesini sağlar.',
    inputSchema: {
      direction: z.enum(['down', 'up']).default('down'),
      screens: z.number().min(0.25).max(10).default(1),
    },
    annotations: { readOnlyHint: true },
  },
  safe(async ({ direction, screens }) => {
    const page = await requirePage();
    await page.evaluate((dy) => window.scrollBy({ top: dy * innerHeight, behavior: 'instant' as ScrollBehavior }), direction === 'down' ? screens : -screens);
    await settle(page, 700);
    return ok(await pageState(page, 40));
  }),
);

server.registerTool(
  'browser_screenshot',
  {
    title: 'Ekran görüntüsü',
    description: 'Açık sayfanın şu an görünen kısmının ekran görüntüsünü döndürür (görseli görerek karar vermek için).',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  safe(async () => {
    const page = await requirePage();
    const shot = await page.screenshot({ type: 'jpeg', quality: 70, encoding: 'base64' });
    return okWithImage({ url: page.url(), title: await page.title() }, shot as string, 'image/jpeg');
  }),
);

server.registerTool(
  'browser_read',
  {
    title: 'Sayfa metnini oku',
    description: 'Açık sayfadaki tüm görünür metni okur (kaydırarak yüklenen içerikler dahil).',
    inputSchema: { max_chars: z.number().int().min(1000).max(60000).default(15000) },
    annotations: { readOnlyHint: true },
  },
  safe(async ({ max_chars }) => {
    const page = await requirePage();
    const text = await page.evaluate(() => (document.body?.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim());
    return ok({ url: page.url(), title: await page.title(), text: truncate(text, max_chars) });
  }),
);

server.registerTool(
  'browser_back',
  {
    title: 'Geri git',
    description: 'Tarayıcı geçmişinde bir önceki sayfaya döner.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  safe(async () => {
    const page = await requirePage();
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await settle(page);
    return ok(await pageState(page));
  }),
);

server.registerTool(
  'browser_close',
  {
    title: 'Tarayıcıyı kapat',
    description: 'İş bitince tarayıcıyı kapatır ve belleği boşaltır.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  safe(async () => {
    current = null;
    await chrome.close();
    return ok({ closed: true });
  }),
);

await startServer(server, 'mar-browser', () => chrome.close());
