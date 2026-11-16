import type { Lang } from '../../shared/types';

const locale = (lang: Lang) => (lang === 'tr' ? 'tr-TR' : 'en-US');

export function fmtCompact(n: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtNumber(n: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 2 }).format(n);
}

/** 10.000'in altındaki sayıları tam ("1.000"), üstündekileri kısaltılmış ("12,4 B") yazar. */
export function fmtShort(n: number, lang: Lang): string {
  return Math.abs(n) < 10_000 ? fmtNumber(n, lang) : fmtCompact(n, lang);
}

export function fmtDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
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
