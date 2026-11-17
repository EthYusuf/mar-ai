/**
 * Our World in Data (OWID) grafik veri API'si: herkese açık, ücretsiz, anahtarsız; veriler CC BY 4.0.
 * https://ourworldindata.org/grapher/<slug>.csv?csvType=full&useColumnShortNames=true
 * Tablolar 7 gün boyunca diskte önbelleğe alınır; ağ yoksa eski kopya kullanılır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dataDir, fetchText, log } from '../../_shared/common';

const TTL_MS = 7 * 24 * 3600_000;

export interface OwidTable {
  slug: string;
  columns: string[];
  /** kod → yıl → sütun adı → değer */
  rows: Map<string, Map<number, Record<string, number>>>;
  /** varlık adı → kod */
  names: Map<string, string>;
}

const memory = new Map<string, OwidTable>();

/** Tırnaklı alanları destekleyen küçük CSV ayrıştırıcı */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') out.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

async function download(slug: string): Promise<string> {
  const file = path.join(dataDir('cache', 'owid'), `${slug}.csv`);
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < TTL_MS;
  if (fresh) return fs.readFileSync(file, 'utf8');
  try {
    const r = await fetchText(`https://ourworldindata.org/grapher/${slug}.csv?v=1&csvType=full&useColumnShortNames=true`, {
      timeoutMs: 60000,
      minIntervalMs: 300,
      headers: { Accept: 'text/csv' },
    });
    if (r.status !== 200 || !r.text.startsWith('entity,')) throw new Error(`HTTP ${r.status}`);
    fs.writeFileSync(file, r.text);
    return r.text;
  } catch (err) {
    if (fs.existsSync(file)) {
      log(`OWID ${slug}: ağ hatası, önbellekteki eski kopya kullanılıyor (${(err as Error).message})`);
      return fs.readFileSync(file, 'utf8');
    }
    throw new Error(`Our World in Data verisi alınamadı (${slug}): ${(err as Error).message}`);
  }
}

export async function loadOwidTable(slug: string): Promise<OwidTable> {
  const cached = memory.get(slug);
  if (cached) return cached;
  const csv = parseCsv(await download(slug));
  const [header, ...body] = csv;
  const columns = header.slice(3);
  const rows = new Map<string, Map<number, Record<string, number>>>();
  const names = new Map<string, string>();
  for (const r of body) {
    const [entity, code, yearRaw] = r;
    if (!code) continue;
    const year = Number(yearRaw);
    if (!Number.isFinite(year)) continue;
    names.set(entity, code);
    let byYear = rows.get(code);
    if (!byYear) rows.set(code, (byYear = new Map()));
    const rec: Record<string, number> = {};
    columns.forEach((c, i) => {
      const v = r[3 + i];
      if (v !== undefined && v !== '' && Number.isFinite(Number(v))) rec[c] = Number(v);
    });
    byYear.set(year, rec);
  }
  const table = { slug, columns, rows, names };
  memory.set(slug, table);
  return table;
}

/** Bir ülkenin bir sütundaki yıllık değerleri (yıl artan sırada) */
export function yearly(table: OwidTable, code: string, column: string): Array<{ year: number; value: number }> {
  const byYear = table.rows.get(code);
  if (!byYear) return [];
  return [...byYear.entries()]
    .filter(([, rec]) => rec[column] !== undefined)
    .map(([year, rec]) => ({ year, value: rec[column] }))
    .sort((a, b) => a.year - b.year);
}

export function entityName(table: OwidTable, code: string): string {
  for (const [name, c] of table.names) if (c === code) return name;
  return code;
}
