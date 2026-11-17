/**
 * Panel araçları: yapay zekanın rapor alanına grafik, kart, storyboard vb. çizmesini sağlayan,
 * uygulamanın kendi içinde çalışan MCP sunucusu ("panels").
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ChartSpec, Panel, Report, StoredChart } from '../shared/types';
import { dataDir } from './paths';

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

// ---------------------------------------------------------------- Grafik devri (chart_ref)

const CHART_REF = /^ch_[a-z0-9]{6,40}$/;
const numOrNull = z.union([z.number(), z.null()]);
const seriesSchema = z.object({
  name: z.string().max(80),
  values: z.array(numOrNull),
  low: z.array(numOrNull).optional(),
  high: z.array(numOrNull).optional(),
});
const markerSchema = z.object({ index: z.number().int().min(0), label: z.string().max(40) });
/** MCP'lerin yazdığı grafik dosyası da denetlenir (kullanıcı MCP'leri de chart_ref üretebilir). */
const storedChartSchema = z.object({
  v: z.literal(1),
  title: z.string().max(200).optional(),
  subtitle: z.string().max(400).optional(),
  note: z.string().max(800).optional(),
  sources: z.array(z.string().max(120)).max(8).optional(),
  spec: z.object({
    chartType: z.enum(['line', 'area', 'bar', 'column']),
    categories: z.array(z.string().max(100)).min(1).max(1500),
    xType: z.enum(['time', 'category']).optional(),
    evenSpacing: z.boolean().optional(),
    series: z.array(seriesSchema).min(1).max(4),
    forecastStart: z.number().int().min(1).optional(),
    markers: z.array(markerSchema).max(8).optional(),
    unit: z.string().max(40).optional(),
    valueFormat: z.enum(['number', 'compact', 'percent', 'decimal']).optional(),
    bandLabel: z.string().max(60).optional(),
    forecastLabel: z.string().max(40).optional(),
  }),
});

function readStoredChart(ref: string): { chart: Omit<StoredChart, 'created'> } | { error: string } {
  if (!CHART_REF.test(ref)) return { error: `Geçersiz chart_ref: ${ref}` };
  const file = path.join(dataDir('mcp-data', 'charts'), `${ref}.json`);
  if (!fs.existsSync(file)) return { error: `chart_ref bulunamadı (${ref}). Grafiği üreten aracı yeniden çağırıp yeni chart_ref kullan.` };
  try {
    const parsed = storedChartSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (!parsed.success) return { error: `chart_ref dosyası geçersiz: ${parsed.error.issues[0]?.message ?? ''}` };
    return { chart: parsed.data };
  } catch (err) {
    return { error: `chart_ref okunamadı: ${(err as Error).message}` };
  }
}

function validateSpec(spec: ChartSpec): string | null {
  const n = spec.categories.length;
  for (const s of spec.series) {
    if (s.values.length !== n) return `"${s.name}" serisinde ${s.values.length} değer var ama ${n} kategori var. Uzunlukları eşitleyip tekrar çağır.`;
    if (s.low && s.low.length !== n) return `"${s.name}" serisinin low dizisi ${n} uzunlukta olmalı.`;
    if (s.high && s.high.length !== n) return `"${s.name}" serisinin high dizisi ${n} uzunlukta olmalı.`;
    if (!s.values.some((v) => v !== null && Number.isFinite(v))) return `"${s.name}" serisinde hiç sayı yok.`;
  }
  if (spec.forecastStart !== undefined && spec.forecastStart >= n) return `forecast_start (${spec.forecastStart}) kategori sayısından (${n}) küçük olmalı.`;
  if (spec.markers?.some((m) => m.index >= n)) return 'Bir işaretçinin index değeri kategori sayısını aşıyor.';
  return null;
}

export function createPanelServer(store: ReportStore) {
  return createSdkMcpServer({
    name: 'panels',
    version: '0.1.0',
    alwaysLoad: true,
    instructions:
      'Bu araçlar kullanıcının ekranındaki rapor alanına profesyonel paneller çizer. Sonuçları uzun metinle değil GRAFİKLERLE anlat: önce report_start, sonra show_kpis ve en az bir show_chart; ardından show_cards / show_insights. Bir araç chart_ref döndürdüyse show_chart({ chart_ref }) çağır, sayıları kopyalama. Zaman boyutu olan her veri çizgi grafiktir. Reels planı için show_storyboard. Yalnızca araçlardan gelen gerçek verileri göster; tahminleri açıkça belirt.',
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
                meter: z.number().min(0).max(100).optional().describe('0-100 ince ölçer çubuğu, örn. potansiyel skoru'),
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
        'Grafik çizer. Bir MCP aracı chart_ref döndürdüyse YALNIZCA chart_ref ver: veri dosyadan birebir okunur (title/subtitle/note isteğe bağlı değiştirilebilir). Elle grafik için chart_type + categories + series ver: line zaman serisi ve trend, area tek serili zaman serisi, bar sıralama (uzun etiketler), column az kategori karşılaştırma. values içinde null = veri yok. Tahmin göstermek için forecast_start (tahminin başladığı kategori sırası) ve serilere low/high (aynı uzunlukta, bant olmayan yerde null) ekle. x_type "time" ise categories ISO tarih olmalı. En fazla 4 seri; grafik başına tek ölçü birimi.',
        {
          chart_ref: z.string().optional().describe('MCP aracının döndürdüğü grafik kimliği, örn. "ch_mwk1x9..."'),
          title: z.string().max(160).optional(),
          subtitle: z.string().max(300).optional(),
          chart_type: z.enum(['line', 'area', 'bar', 'column']).optional(),
          categories: z.array(z.string().max(100)).min(1).max(120).optional(),
          x_type: z.enum(['time', 'category']).optional(),
          series: z.array(seriesSchema).min(1).max(4).optional(),
          forecast_start: z.number().int().min(1).optional(),
          markers: z.array(markerSchema).max(6).optional().describe('Dikey işaretler, örn. [{ index: 12, label: "Kampanya" }]'),
          unit: z.string().max(40).optional().describe('Birim, örn. "%", "reklam", "izlenme"'),
          value_format: z.enum(['number', 'compact', 'percent', 'decimal']).optional().describe('percent: değerler 0-100 arası yüzde'),
          note: z.string().max(600).optional().describe('Grafiğin altındaki kısa yorum veya kaynak notu'),
          width: z.enum(['half', 'full']).optional().describe('half: yan yana iki grafik için'),
          sources: sourcesField,
        },
        async (a) => {
          let spec: ChartSpec;
          let meta: { title?: string; subtitle?: string; note?: string; sources?: string[] } = {};
          if (a.chart_ref) {
            const loaded = readStoredChart(a.chart_ref.trim());
            if ('error' in loaded) return error(loaded.error);
            spec = { ...loaded.chart.spec };
            meta = loaded.chart;
          } else {
            if (!a.chart_type || !a.categories || !a.series) return error('Ya chart_ref ya da chart_type + categories + series ver.');
            spec = { chartType: a.chart_type, categories: a.categories, xType: a.x_type, series: a.series, forecastStart: a.forecast_start, markers: a.markers };
          }
          if (a.unit) spec.unit = a.unit;
          if (a.value_format) spec.valueFormat = a.value_format;
          const problem = validateSpec(spec);
          if (problem) return error(problem);
          const title = a.title ?? meta.title ?? 'Grafik';
          const lineLike = spec.chartType === 'line' || spec.chartType === 'area';
          store.add(
            { kind: 'chart', id: newId(), title, subtitle: a.subtitle ?? meta.subtitle, note: a.note ?? meta.note, width: a.width ?? (lineLike ? 'full' : 'half'), ...spec },
            [...(meta.sources ?? []), ...(a.sources ?? [])],
          );
          const fc = spec.forecastStart !== undefined ? `, son ${spec.categories.length - spec.forecastStart} nokta tahmin` : '';
          return text(`Grafik eklendi: "${title}" — ${spec.series.length} seri, ${spec.categories.length} nokta${fc}.`);
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
