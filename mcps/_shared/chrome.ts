/**
 * Tarayıcı oturum yöneticisi (puppeteer-core).
 * - Bilgisayarda kurulu Chromium tabanlı tarayıcıyı kullanır, tarayıcı indirmez.
 *   Otomatik sıra: Chrome → Edge → Brave → Vivaldi → Chromium → Opera → Opera GX
 *   (Edge her Windows'ta bulunur). Ayarlar'dan seçilen tarayıcı MARAI_CHROME_PATH ile gelir.
 * - Her MCP ve her tarayıcı için ayrı profil klasörü kullanılır: kullanıcının kişisel tarayıcı
 *   profiline, çerezlerine veya oturumlarına asla dokunulmaz.
 * - Boşta kalan tarayıcı belleği boşaltmak için otomatik kapanır.
 */
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import type { DetectedBrowser } from '../../shared/types';
import { pickBrowser } from '../../shared/browsers';
import { dataDir, log, uiLang } from './common';

/** Kullanılacak tarayıcı: Ayarlar'daki seçim (MARAI_CHROME_PATH) ya da otomatik sıradaki ilk tarayıcı. */
export function resolveBrowser(): DetectedBrowser {
  const { browser, preferredMissing } = pickBrowser(process.env.MARAI_CHROME_PATH);
  if (preferredMissing) log(`seçilen tarayıcı bulunamadı (${process.env.MARAI_CHROME_PATH}); otomatik seçime dönülüyor`);
  if (!browser) {
    throw new Error(
      'Uyumlu bir tarayıcı bulunamadı. Google Chrome veya Microsoft Edge kurun (Brave, Vivaldi, Opera ve Opera GX de desteklenir) ya da Ayarlar > Tarayıcı bölümünden tarayıcı yolunu seçin.',
    );
  }
  return browser;
}

export interface ChromeSessionOptions {
  /** Profil klasörü adı (her MCP için ayrı) */
  name: string;
  /** true: arka planda (görünmez), false: görünür pencere (computer use modu) */
  headless?: boolean;
  /** Tarayıcı dili, örn. 'tr-TR' */
  lang?: string;
  /** Boşta kalınca kapanma süresi (ms) */
  idleCloseMs?: number;
  viewport?: { width: number; height: number };
}

export class ChromeSession {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private used: DetectedBrowser | null = null;

  constructor(private readonly opts: ChromeSessionOptions) {}

  get headless(): boolean {
    return this.opts.headless ?? true;
  }

  /** Son başlatılan tarayıcının adı (örn. "Microsoft Edge"), henüz başlatılmadıysa null */
  get browserName(): string | null {
    return this.used?.name ?? null;
  }

  get lang(): string {
    return this.opts.lang ?? (uiLang() === 'tr' ? 'tr-TR' : 'en-US');
  }

  async getBrowser(): Promise<Browser> {
    this.touch();
    if (this.browser && this.browser.connected) return this.browser;
    if (!this.launching) {
      this.launching = this.launch().finally(() => {
        this.launching = null;
      });
    }
    this.browser = await this.launching;
    return this.browser;
  }

  private async launch(): Promise<Browser> {
    const chosen = resolveBrowser();
    this.used = chosen;
    const vp = this.opts.viewport ?? { width: 1366, height: 900 };
    log(`tarayıcı başlatılıyor: ${chosen.name} (${path.basename(chosen.path)}, ${this.headless ? 'arka planda' : 'görünür'})`);
    const browser = await puppeteer.launch({
      executablePath: chosen.path,
      headless: this.headless,
      // Tarayıcıya özel ayrı profil: farklı tarayıcılar aynı profil klasörünü paylaşmaz
      userDataDir: dataDir('chrome-profiles', `${this.opts.name}-${chosen.id}`),
      timeout: 45_000,
      defaultViewport: this.headless ? vp : null,
      args: [
        `--lang=${this.lang}`,
        `--window-size=${vp.width},${vp.height}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-sync',
        '--disable-features=Translate,MediaRouter,OptimizationHints',
        '--mute-audio',
      ],
    });
    browser.on('disconnected', () => {
      if (this.browser === browser) this.browser = null;
    });
    return browser;
  }

  /** Hazır ayarlanmış yeni bir sekme açar. */
  async newPage(): Promise<Page> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': `${this.lang},${this.lang.split('-')[0]};q=0.9,en;q=0.7` });
    page.setDefaultNavigationTimeout(35000);
    page.setDefaultTimeout(20000);
    return page;
  }

  /** Bir sayfayı açar, çalıştırır ve sekmeyi her durumda kapatır. */
  async withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const page = await this.newPage();
    try {
      return await fn(page);
    } finally {
      this.touch();
      await page.close().catch(() => undefined);
    }
  }

  touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const ms = this.opts.idleCloseMs ?? 3 * 60_000;
    this.idleTimer = setTimeout(() => {
      void this.close();
    }, ms);
    this.idleTimer.unref?.();
  }

  async close(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const b = this.browser;
    this.browser = null;
    if (b) await b.close().catch(() => undefined);
  }
}

/** Yalnızca http/https adreslerine izin verir; yerel dosya ve tarayıcı iç sayfalarını engeller. */
export function assertWebUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    throw new Error(`Geçersiz adres: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Yalnızca http/https adresleri açılabilir.');
  }
  return u.toString();
}

/** Sayfanın yüklenmesini bekler; ağ tamamen susmasa da makul sürede devam eder. */
export async function gotoAndSettle(page: Page, url: string, extraWaitMs = 1200): Promise<{ status: number | null; finalUrl: string; loadMs: number }> {
  const t = Date.now();
  const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForNetworkIdle({ idleTime: 700, timeout: 8000 });
  } catch {
    /* bazı siteler sürekli istek atar; sorun değil */
  }
  if (extraWaitMs > 0) await new Promise((r) => setTimeout(r, extraWaitMs));
  return { status: res?.status() ?? null, finalUrl: page.url(), loadMs: Date.now() - t };
}
