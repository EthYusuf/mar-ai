/**
 * mar-ai MCP ortak yardımcıları.
 * Her MCP sunucusu bu dosyayı içe aktarır; derleme sırasında (esbuild) her sunucunun
 * tek dosyalık paketine gömülür.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export const MARAI_VERSION = process.env.MARAI_VERSION || '0.1.0';
export const USER_AGENT = `mar-ai/${MARAI_VERSION} (open-source marketing research assistant)`;

/** Uygulamanın kullanıcı verisi klasörü (Electron tarafından MARAI_DATA_DIR ile verilir). */
export function dataDir(...sub: string[]): string {
  const base = process.env.MARAI_DATA_DIR || path.join(os.tmpdir(), 'mar-ai');
  const dir = path.join(base, ...sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Kullanıcının seçtiği arayüz dili: 'tr' | 'en' */
export function uiLang(): 'tr' | 'en' {
  return process.env.MARAI_LANG === 'en' ? 'en' : 'tr';
}

// ---------------------------------------------------------------- MCP sonuçları

type TextContent = { type: 'text'; text: string };
type ImageContent = { type: 'image'; data: string; mimeType: string };
export type ToolResult = { content: Array<TextContent | ImageContent>; isError?: boolean };

/** Yapılandırılmış veriyi Claude'un kolay okuyacağı JSON metni olarak döndürür. */
export function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] };
}

export function okWithImage(data: unknown, imageBase64: string, mimeType = 'image/jpeg'): ToolResult {
  return {
    content: [
      { type: 'text', text: JSON.stringify(data, null, 1) },
      { type: 'image', data: imageBase64, mimeType },
    ],
  };
}

export function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: `HATA: ${message}` }], isError: true };
}

/** Araç gövdesini sarar: beklenmeyen hataları düzgün bir MCP hatasına çevirir. */
export function safe<A>(fn: (args: A) => Promise<ToolResult>): (args: A) => Promise<ToolResult> {
  return async (args: A) => {
    try {
      return await fn(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('tool error:', msg);
      return fail(msg);
    }
  };
}

/** stdout MCP protokolüne ayrılmıştır; günlükler stderr'e yazılır. */
export function log(...args: unknown[]): void {
  process.stderr.write(`[mar-ai] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`);
}

export async function startServer(server: McpServer, name: string, onShutdown?: () => Promise<void>): Promise<void> {
  const transport = new StdioServerTransport();
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try {
      await onShutdown?.();
    } catch {
      /* kapanırken oluşan hatalar önemsiz */
    }
    process.exit(0);
  };
  process.stdin.on('close', shutdown);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await server.connect(transport);
  log(`${name} hazır`);
}

// ---------------------------------------------------------------- HTTP

const lastHit = new Map<string, number>();

/** Aynı siteye art arda çok hızlı istek atmamak için nazik bekleme. */
export async function politeDelay(url: string, minIntervalMs = 1200): Promise<void> {
  const host = new URL(url).host;
  const now = Date.now();
  const last = lastHit.get(host) ?? 0;
  const wait = last + minIntervalMs - now;
  lastHit.set(host, Math.max(now, last + minIntervalMs));
  if (wait > 0) await sleep(wait);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number;
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<{ status: number; text: string; url: string }> {
  const { headers = {}, timeoutMs = 20000, retries = 1, minIntervalMs = 800 } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await politeDelay(url, minIntervalMs);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': uiLang() === 'tr' ? 'tr-TR,tr;q=0.9,en;q=0.7' : 'en-US,en;q=0.9', ...headers },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      const text = await res.text();
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return { status: res.status, text, url: res.url };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`İstek başarısız (${new URL(url).host}): ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const r = await fetchText(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  return JSON.parse(r.text) as T;
}

// ---------------------------------------------------------------- Önbellek

export class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.v;
  }
  set(key: string, v: V): void {
    this.map.set(key, { v, exp: Date.now() + this.ttlMs });
  }
}

// ---------------------------------------------------------------- Sayı / metin

/**
 * Kısaltılmış sayıları çözer.
 *  en: "291M", "16K", "1,675", "1.2B"  ·  tr: "1,2 Mn", "16 B", "1.675"
 */
export function parseCompactNumber(raw: string | undefined | null, locale: 'en' | 'tr' = 'en'): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/ /g, ' ');
  const m = s.match(/([\d][\d.,]*)\s*([a-zğüşöçı]+)?/);
  if (!m) return null;
  let num = m[1];
  const unit = m[2] ?? '';
  const units: Record<string, number> =
    locale === 'tr'
      ? { b: 1e3, bin: 1e3, mn: 1e6, milyon: 1e6, mr: 1e9, milyar: 1e9 }
      : { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
  num = locale === 'tr' ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  const v = parseFloat(num);
  if (!isFinite(v)) return null;
  return Math.round(v * (units[unit] ?? 1));
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + ` …[${s.length - max} karakter kısaltıldı]`;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

export function hashtags(text: string): string[] {
  return (text.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.toLowerCase());
}

/** Bir dizideki en sık geçen öğeleri sayar. */
export function topCounts(items: string[], limit = 10): Array<{ value: string; count: number }> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}
