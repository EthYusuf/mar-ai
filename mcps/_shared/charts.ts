/**
 * Grafik devri (chart_ref): MCP aracı grafiğin verisini uygulamanın veri klasörüne yazar ve
 * kısa bir kimlik döndürür. Claude bu kimliği mcp__panels__show_chart({ chart_ref }) ile verir;
 * panel aracı veriyi dosyadan okur. Böylece yüzlerce sayı modelden geçmez: grafik hızlı çizilir
 * ve araçtan gelen veriyle birebir aynı kalır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { ChartSpec, StoredChart } from '../../shared/types';
import { dataDir, log } from './common';

const MAX_AGE_MS = 3 * 24 * 3600_000;
let pruned = false;

export interface ChartDraft {
  title?: string;
  subtitle?: string;
  note?: string;
  sources?: string[];
  spec: ChartSpec;
}

/** Grafiği kaydeder ve chart_ref kimliğini döndürür. */
export function saveChart(draft: ChartDraft): string {
  const id = `ch_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
  const dir = dataDir('charts');
  const stored: StoredChart = { v: 1, created: new Date().toISOString(), ...draft, spec: tidySpec(draft.spec) };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(stored));
  if (!pruned) {
    pruned = true;
    pruneOld(dir);
  }
  return id;
}

/** Sayıları makul hassasiyete yuvarlar (dosya boyutu ve okunabilirlik için). */
function tidySpec(spec: ChartSpec): ChartSpec {
  const r = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
  return {
    ...spec,
    series: spec.series.map((s) => ({
      name: s.name,
      values: s.values.map(r),
      ...(s.low ? { low: s.low.map(r) } : {}),
      ...(s.high ? { high: s.high.map(r) } : {}),
    })),
  };
}

function pruneOld(dir: string): void {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(dir, f);
      if (now - fs.statSync(p).mtimeMs > MAX_AGE_MS) fs.rmSync(p, { force: true });
    }
  } catch (err) {
    log('chart prune failed:', (err as Error).message);
  }
}

/** Claude'a, grafiği nasıl çizeceğini söyleyen kısa not. */
export function chartHint(ref: string, lang: 'tr' | 'en'): string {
  return lang === 'tr'
    ? `Grafik hazır: mcp__panels__show_chart({ chart_ref: "${ref}" }) çağır (başlığı istersen değiştir). Sayıları kopyalama.`
    : `Chart ready: call mcp__panels__show_chart({ chart_ref: "${ref}" }) (override the title if you like). Do not copy the numbers.`;
}
