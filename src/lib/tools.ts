import type { Lang } from '../../shared/types';

const LABELS: Record<string, { tr: string; en: string }> = {
  meta_ads_search: { tr: 'Meta Reklam Kütüphanesi taranıyor', en: 'Searching Meta Ad Library' },
  meta_ads_screenshot: { tr: 'Reklam kütüphanesinin görüntüsü alınıyor', en: 'Capturing Ad Library' },
  instagram_profile: { tr: 'Instagram profili inceleniyor', en: 'Analyzing Instagram profile' },
  instagram_post: { tr: 'Instagram gönderisi okunuyor', en: 'Reading Instagram post' },
  instagram_compare: { tr: 'Instagram hesapları karşılaştırılıyor', en: 'Comparing Instagram accounts' },
  youtube_channel: { tr: 'YouTube kanalı analiz ediliyor', en: 'Analyzing YouTube channel' },
  youtube_video: { tr: 'YouTube videosu inceleniyor', en: 'Inspecting YouTube video' },
  youtube_compare: { tr: 'YouTube kanalları karşılaştırılıyor', en: 'Comparing YouTube channels' },
  trending_now: { tr: 'Yükselen aramalar alınıyor', en: 'Fetching rising searches' },
  news_search: { tr: 'Haberler taranıyor', en: 'Scanning news' },
  interest_over_time: { tr: 'İlgi grafiği hesaplanıyor', en: 'Measuring interest over time' },
  web_read: { tr: 'Sayfa okunuyor (headless Chrome)', en: 'Reading page (headless Chrome)' },
  web_screenshot: { tr: 'Sayfanın ekran görüntüsü alınıyor', en: 'Capturing page screenshot' },
  site_audit: { tr: 'Site denetleniyor', en: 'Auditing website' },
  browser_open: { tr: 'Tarayıcıda açılıyor', en: 'Opening in browser' },
  browser_snapshot: { tr: 'Sayfa inceleniyor', en: 'Inspecting page' },
  browser_click: { tr: 'Tıklanıyor', en: 'Clicking' },
  browser_type: { tr: 'Yazılıyor', en: 'Typing' },
  browser_press_key: { tr: 'Tuşa basılıyor', en: 'Pressing key' },
  browser_scroll: { tr: 'Sayfa kaydırılıyor', en: 'Scrolling' },
  browser_screenshot: { tr: 'Ekran görüntüsü alınıyor', en: 'Taking screenshot' },
  browser_read: { tr: 'Sayfa metni okunuyor', en: 'Reading page text' },
  browser_back: { tr: 'Geri gidiliyor', en: 'Going back' },
  browser_close: { tr: 'Tarayıcı kapatılıyor', en: 'Closing browser' },
  report_start: { tr: 'Rapor başlatıldı', en: 'Report started' },
  show_kpis: { tr: 'Özet kartları eklendi', en: 'KPI cards added' },
  show_chart: { tr: 'Grafik çizildi', en: 'Chart drawn' },
  show_cards: { tr: 'Kartlar eklendi', en: 'Cards added' },
  show_storyboard: { tr: 'Storyboard hazırlandı', en: 'Storyboard prepared' },
  show_insights: { tr: 'İçgörüler eklendi', en: 'Insights added' },
  show_table: { tr: 'Tablo eklendi', en: 'Table added' },
  show_text: { tr: 'Metin paneli eklendi', en: 'Text panel added' },
  WebSearch: { tr: "Web'de aranıyor", en: 'Searching the web' },
  WebFetch: { tr: 'Sayfa getiriliyor', en: 'Fetching page' },
  Skill: { tr: 'Uzmanlık rehberi yükleniyor', en: 'Loading skill' },
  ToolSearch: { tr: 'Uygun araç aranıyor', en: 'Finding the right tool' },
};

export interface ToolDisplay {
  server: string | null;
  short: string;
  label: string;
  detail: string;
  isPanel: boolean;
}

export function describeTool(fullName: string, input: Record<string, unknown>, lang: Lang): ToolDisplay {
  const m = fullName.match(/^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/);
  const server = m ? m[1] : null;
  const short = m ? m[2] : fullName;
  const label = LABELS[short]?.[lang] ?? short.replace(/_/g, ' ');
  const pick = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : Array.isArray(input[k]) ? (input[k] as unknown[]).join(', ') : '');
  const detail =
    pick('query') || pick('username') || pick('usernames') || pick('channel') || pick('channels') || pick('video') || pick('url') || pick('terms') || pick('title') || pick('geo') || pick('skill') || pick('prompt');
  return { server, short, label, detail: detail.slice(0, 90), isPanel: server === 'panels' };
}
