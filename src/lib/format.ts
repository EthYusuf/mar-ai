import type { Lang } from '../../shared/types';

const locale = (lang: Lang) => (lang === 'tr' ? 'tr-TR' : 'en-US');

// Intl biçimlendiricileri pahalıdır (her oluşturmada yerel veri yüklenir); grafikler yüzlerce etiket
// biçimlendirdiği için seçeneklere göre önbelleğe alınır.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function numberFormat(lang: Lang, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lang}|${JSON.stringify(options)}`;
  let f = numberFormats.get(key);
  if (!f) numberFormats.set(key, (f = new Intl.NumberFormat(locale(lang), options)));
  return f;
}

export function dateFormat(lang: Lang, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${lang}|${JSON.stringify(options)}`;
  let f = dateFormats.get(key);
  if (!f) dateFormats.set(key, (f = new Intl.DateTimeFormat(locale(lang), options)));
  return f;
}

export function fmtCompact(n: number, lang: Lang): string {
  return numberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtNumber(n: number, lang: Lang): string {
  return numberFormat(lang, { maximumFractionDigits: 2 }).format(n);
}

/** 10.000'in altındaki sayıları tam ("1.000"), üstündekileri kısaltılmış ("12,4 B") yazar. */
export function fmtShort(n: number, lang: Lang): string {
  return Math.abs(n) < 10_000 ? fmtNumber(n, lang) : fmtCompact(n, lang);
}

export function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return dateFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** Uzak görselleri ana süreçteki vekil üzerinden yükler (Instagram/Meta CDN kısıtlamalarına karşı). */
export function imgSrc(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https:\/\//i.test(url)) return `marai-img://img/?u=${encodeURIComponent(url)}`;
  return url;
}

export function uid(): string {
  return crypto.randomUUID();
}

export function clockTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
