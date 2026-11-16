/**
 * Panel araçları: yapay zekanın rapor alanına grafik, kart, storyboard vb. çizmesini sağlayan,
 * uygulamanın kendi içinde çalışan MCP sunucusu ("panels").
 */
import { randomUUID } from 'node:crypto';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { Panel, Report } from '../shared/types';

type Listener = (report: Report | null) => void;

export class ReportStore {
  private report: Report | null = null;
  private listeners = new Set<Listener>();

  get current(): Report | null {
    return this.report;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.report);
  }

  start(title: string, subtitle?: string, tags: string[] = []): Report {
    this.report = { id: randomUUID(), title, subtitle, tags, sources: [], createdAt: new Date().toISOString(), panels: [] };
    this.emit();
    return this.report;
  }

  add(panel: Panel, sources: string[] = []): void {
    if (!this.report) this.start('Rapor');
    const r = this.report!;
    r.panels.push(panel);
    for (const s of sources) if (s && !r.sources.includes(s)) r.sources.push(s);
    this.emit();
  }

  load(report: Report | null): void {
    this.report = report;
    this.emit();
  }
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const error = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true });
const sourcesField = z.array(z.string()).max(8).optional().describe('Bu paneldeki verinin kaynakları, örn. ["Meta Ad Library", "Instagram"]');
const newId = () => randomUUID().slice(0, 8);

export function createPanelServer(store: ReportStore) {
  return createSdkMcpServer({
    name: 'panels',
    version: '0.1.0',
    alwaysLoad: true,
    instructions:
      'Bu araçlar kullanıcının ekranındaki rapor alanına profesyonel paneller çizer. Araştırma sonuçlarını sohbette uzun uzun yazmak yerine bu panellerle göster: önce report_start, sonra show_kpis / show_chart / show_cards / show_insights. Reels planı için show_storyboard kullan. Yalnızca araçlardan gelen gerçek verileri göster; tahminleri açıkça belirt.',
    tools: [
      tool(
        'report_start',
        'Rapor alanında yeni bir rapor başlatır (öncekini temizler). Her yeni araştırma veya plan için bir kez, panellerden önce çağır.',
        {
          title: z.string().min(2).max(200).describe('Rapor başlığı, örn. "Kahve sektörü rakip reklam analizi"'),
          subtitle: z.string().max(400).optional().describe('Kapsam, örn. "3 rakip · Instagram + Facebook · Son 30 gün"'),
          tags: z.array(z.string().max(60)).max(8).optional().describe('Kısa etiketler, örn. ["Meta Ad Library", "TR"]'),
        },
        async ({ title, subtitle, tags }) => {
          store.start(title, subtitle, tags ?? []);
          return text('Rapor başlatıldı. Şimdi panelleri ekle.');
        },
      ),
      tool(
        'show_kpis',
        'Öne çıkan sayıları (2-6 adet) büyük özet kartları olarak gösterir. Değerleri biçimlendirilmiş metin olarak ver (örn. "12,4 B", "%3,2", "11 gün").',
        {
          title: z.string().max(140).optional(),
          items: z
            .array(
              z.object({
                label: z.string().max(100),
                value: z.string().max(48),
                sub: z.string().max(200).optional().describe('Açıklama veya karşılaştırma, örn. "Geçen aya göre +%12"'),
                trend: z.enum(['up', 'down', 'flat']).optional(),
              }),
            )
            .min(1)
            .max(6),
          sources: sourcesField,
        },
        async ({ title, items, sources }) => {
          store.add({ kind: 'kpis', id: newId(), title, items }, sources);
          return text(`${items.length} özet kartı eklendi.`);
        },
      ),
      tool(
        'show_chart',
        'Grafik çizer. bar: yatay çubuk (kategori karşılaştırma, uzun etiketler), column: dikey sütun (az sayıda kategori veya gruplu karşılaştırma), line: zaman serisi. En fazla 4 seri ve 24 kategori. Her serinin values dizisi categories ile aynı uzunlukta olmalı. Tek ölçü birimi kullan; farklı ölçekler için ayrı grafik çiz.',
        {
          title: z.string().max(160),
          subtitle: z.string().max(300).optional(),
          chart_type: z.enum(['bar', 'column', 'line']),
          categories: z.array(z.string().max(100)).min(1).max(24),
          series: z.array(z.object({ name: z.string().max(80), values: z.array(z.number()) })).min(1).max(4),
          unit: z.string().max(40).optional().describe('Birim, örn. "%", "reklam", "izlenme"'),
          note: z.string().max(500).optional().describe('Grafiğin altındaki kısa yorum veya kaynak notu'),
          width: z.enum(['half', 'full']).optional().describe('half: yan yana iki grafik için'),
          sources: sourcesField,
        },
        async ({ title, subtitle, chart_type, categories, series, unit, note, width, sources }) => {
          const bad = series.find((s) => s.values.length !== categories.length);
          if (bad) return error(`"${bad.name}" serisinde ${bad.values.length} değer var ama ${categories.length} kategori var. Uzunlukları eşitleyip tekrar çağır.`);
          store.add(
            { kind: 'chart', id: newId(), title, subtitle, chartType: chart_type, categories, series, unit, note, width: width ?? (chart_type === 'line' ? 'full' : 'half') },
            sources,
          );
          return text('Grafik eklendi.');
        },
      ),
      tool(
        'show_cards',
        'Kart ızgarası gösterir: reklam örnekleri, gönderiler, rakip profilleri, videolar. image alanına araçlardan gelen gerçek görsel adresini koy. why alanı "neden işe yarıyor" yorumudur.',
        {
          title: z.string().max(160),
          subtitle: z.string().max(300).optional(),
          cards: z
            .array(
              z.object({
                title: z.string().max(140).describe('Örn. reklamveren veya hesap adı'),
                subtitle: z.string().max(200).optional(),
                badge: z.string().max(60).optional().describe('Örn. "Instagram Reels", "Video", "Yayında 34 gün"'),
                image: z.string().url().optional(),
                quote: z.string().max(400).optional().describe('Kanca/başlık gibi öne çıkan metin'),
                body: z.string().max(1200).optional(),
                why: z.string().max(700).optional(),
                metrics: z.array(z.object({ label: z.string().max(50), value: z.string().max(50) })).max(6).optional(),
                url: z.string().url().optional(),
              }),
            )
            .min(1)
            .max(12),
          sources: sourcesField,
        },
        async ({ title, subtitle, cards, sources }) => {
          store.add({ kind: 'cards', id: newId(), title, subtitle, cards }, sources);
          return text(`${cards.length} kart eklendi.`);
        },
      ),
      tool(
        'show_storyboard',
        'Reels/TikTok/Shorts planını gösterir: kanca alternatifleri (puanlı), zaman çizelgesi ve sahne sahne storyboard, açıklama metni, hashtagler, müzik ve yayın önerisi. Sahne süreleri toplam süreyi kesintisiz kapsamalı.',
        {
          title: z.string().max(200),
          duration_sec: z.number().int().min(5).max(180),
          hooks: z
            .array(z.object({ text: z.string().max(300), kind: z.string().max(50).optional(), score: z.number().min(0).max(100).optional() }))
            .max(5)
            .optional(),
          scenes: z
            .array(
              z.object({
                role: z.string().max(60).describe('Örn. Kanca, Sorun, Ürün, Gösterim, Sonuç, Çağrı'),
                start: z.number().min(0),
                end: z.number().min(0),
                shot: z.string().max(80).optional().describe('Çekim tipi, örn. Yakın çekim'),
                overlay: z.string().max(200).optional().describe('Ekran yazısı'),
                visual: z.string().max(700),
                audio: z.string().max(400).optional(),
              }),
            )
            .min(2)
            .max(12),
          caption: z.string().max(2200).optional(),
          hashtags: z.array(z.string().max(60)).max(30).optional(),
          music: z.string().max(400).optional(),
          posting_tip: z.string().max(500).optional(),
          sources: sourcesField,
        },
        async ({ title, duration_sec, hooks, scenes, caption, hashtags, music, posting_tip, sources }) => {
          const sorted = [...scenes].sort((a, b) => a.start - b.start);
          if (sorted.some((s) => s.end <= s.start)) return error('Her sahnede end > start olmalı.');
          store.add(
            { kind: 'storyboard', id: newId(), title, durationSec: duration_sec, hooks, scenes: sorted, caption, hashtags, music, postingTip: posting_tip },
            sources,
          );
          return text(`Storyboard eklendi (${sorted.length} sahne).`);
        },
      ),
      tool(
        'show_insights',
        'Numaralı içgörüler ve önerilen sonraki adımı gösterir. Her içgörü veriye dayalı ve uygulanabilir olmalı. next_step.prompt, kullanıcı butona basınca gönderilecek mesajdır.',
        {
          title: z.string().max(160).optional(),
          items: z.array(z.object({ title: z.string().max(160), body: z.string().max(900) })).min(1).max(8),
          next_step: z.object({ title: z.string().max(200), body: z.string().max(500).optional(), prompt: z.string().max(1000).optional() }).optional(),
          sources: sourcesField,
        },
        async ({ title, items, next_step, sources }) => {
          store.add({ kind: 'insights', id: newId(), title: title ?? 'İçgörüler', items, nextStep: next_step }, sources);
          return text('İçgörüler eklendi.');
        },
      ),
      tool(
        'show_table',
        'Tablo gösterir (karşılaştırma, liste, ayrıntılı veri). En fazla 8 sütun ve 50 satır.',
        {
          title: z.string().max(160),
          columns: z.array(z.string().max(80)).min(1).max(10),
          rows: z.array(z.array(z.union([z.string().max(600), z.number()]))).min(1).max(60),
          note: z.string().max(500).optional(),
          sources: sourcesField,
        },
        async ({ title, columns, rows, note, sources }) => {
          const bad = rows.findIndex((r) => r.length !== columns.length);
          if (bad >= 0) return error(`${bad + 1}. satırda ${rows[bad].length} hücre var, ${columns.length} olmalı.`);
          store.add({ kind: 'table', id: newId(), title, columns, rows, note }, sources);
          return text('Tablo eklendi.');
        },
      ),
      tool(
        'show_text',
        'Biçimlendirilmiş metin paneli (Markdown): senaryo metni, brief, e-posta taslağı, yöntem notu gibi uzun içerikler için.',
        {
          title: z.string().max(160).optional(),
          markdown: z.string().min(1).max(30000),
          sources: sourcesField,
        },
        async ({ title, markdown, sources }) => {
          store.add({ kind: 'text', id: newId(), title, markdown }, sources);
          return text('Metin paneli eklendi.');
        },
      ),
    ],
  });
}
