/**
 * Wikipedia / Wikimedia yardımcıları (resmi, ücretsiz, anahtarsız API'ler):
 *  - MediaWiki arama API'si: konu adını makale başlığına çevirir
 *  - Wikimedia Pageviews REST API: günlük/aylık kullanıcı görüntülenmeleri (bot trafiği hariç)
 */
import { fetchJson } from './common';
import { addDaysIso } from './analytics';

export interface WikiArticle {
  lang: string;
  title: string;
  url: string;
  /** Aramada çıkan diğer adaylar (yanlış makale seçildiyse doğru başlıkla tekrar çağırmak için) */
  candidates: string[];
}

interface SearchResponse {
  query?: { search?: Array<{ title: string }> };
}
interface TitlesResponse {
  query?: { pages?: Record<string, { title: string; missing?: string }> };
}
interface PageviewsResponse {
  items?: Array<{ timestamp: string; views: number }>;
}

export function articleUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

/** Konu adını Wikipedia makalesine çözer. exact=true ise verilen başlığı (yönlendirmeleri izleyerek) kullanır. */
export async function resolveArticle(query: string, lang: string, exact = false): Promise<WikiArticle | null> {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  if (exact) {
    const r = await fetchJson<TitlesResponse>(`${api}?action=query&titles=${encodeURIComponent(query.trim())}&redirects=1&format=json`);
    const page = Object.values(r.query?.pages ?? {})[0];
    if (!page || page.missing !== undefined) return null;
    return { lang, title: page.title, url: articleUrl(lang, page.title), candidates: [page.title] };
  }
  const r = await fetchJson<SearchResponse>(
    `${api}?action=query&list=search&srsearch=${encodeURIComponent(query.trim())}&srlimit=5&srnamespace=0&format=json`,
  );
  const titles = (r.query?.search ?? []).map((s) => s.title);
  if (!titles.length) return null;
  const needle = query.trim().toLocaleLowerCase(lang);
  const title = titles.find((t) => t.toLocaleLowerCase(lang) === needle) ?? titles[0];
  return { lang, title, url: articleUrl(lang, title), candidates: titles };
}

const ymd = (iso: string) => iso.replace(/-/g, '');

async function pageviews(url: string): Promise<PageviewsResponse> {
  try {
    return await fetchJson<PageviewsResponse>(url);
  } catch (err) {
    // 404: bu aralıkta hiç görüntülenme yok (yeni ya da çok az okunan makale)
    if (/HTTP 404/.test((err as Error).message)) return { items: [] };
    throw err;
  }
}

/**
 * Günlük görüntülenmeler. Aradaki eksik günler 0 sayılır; henüz yayınlanmamış son günler
 * (Wikimedia verisi ~1 gün gecikmeli gelir) kesilir ki seri yapay bir düşüşle bitmesin.
 */
export async function dailyViews(lang: string, title: string, startIso: string, endIso: string): Promise<Array<{ date: string; views: number }>> {
  const article = encodeURIComponent(title.replace(/ /g, '_'));
  const r = await pageviews(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${article}/daily/${ymd(startIso)}00/${ymd(endIso)}00`,
  );
  const map = new Map<string, number>();
  for (const it of r.items ?? []) map.set(`${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`, it.views);
  if (!map.size) return [];
  const lastPresent = [...map.keys()].sort().pop()!;
  const out: Array<{ date: string; views: number }> = [];
  for (let d = startIso; d <= lastPresent; d = addDaysIso(d, 1)) out.push({ date: d, views: map.get(d) ?? 0 });
  return out;
}

/** Aylık görüntülenmeler: startMonth/endMonth "YYYY-MM" (her ikisi dahil) */
export async function monthlyViews(lang: string, title: string, startMonth: string, endMonth: string): Promise<Array<{ month: string; views: number }>> {
  const article = encodeURIComponent(title.replace(/ /g, '_'));
  const [ey, em] = endMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  const r = await pageviews(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/all-access/user/${article}/monthly/${ymd(startMonth)}0100/${ymd(endMonth)}${String(lastDay).padStart(2, '0')}00`,
  );
  const map = new Map<string, number>();
  for (const it of r.items ?? []) map.set(`${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}`, it.views);
  const out: Array<{ month: string; views: number }> = [];
  let [y, m] = startMonth.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ month: key, views: map.get(key) ?? 0 });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
