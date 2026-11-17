// Tüm MCP sunucularını gerçek bir MCP istemcisiyle başlatır, araçlarını listeler ve
// örnek çağrılar yapar.  Kullanım:  npm run test:mcps            (hepsi)
//                                  npm run test:mcps -- youtube  (tek sunucu)
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2];

const SAMPLES = {
  trends: [
    ['trending_now', { geo: 'TR', limit: 3 }],
    ['news_search', { query: 'soğuk kahve', period: '30d', limit: 3 }],
  ],
  youtube: [
    ['youtube_channel', { channel: '@MrBeast', include_all_videos: false }],
    ['youtube_compare', { channels: ['@nike', '@adidas'] }],
    ['youtube_video', { video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
  ],
  web: [
    ['web_read', { url: 'https://www.starbucks.com.tr', max_chars: 1500 }],
    ['site_audit', { url: 'https://www.starbucks.com.tr' }],
  ],
  browser: [
    ['browser_open', { url: 'https://example.com' }],
    ['browser_screenshot', {}],
    ['browser_close', {}],
  ],
  potential: [
    ['trend_potential', { topics: ['Matcha', 'Kombucha'], lang: 'en', history_days: 180, horizon_days: 30 }],
    ['trend_potential', { topics: ['Dondurma'], history_days: 365, horizon_days: 30 }],
    ['seasonality', { topic: 'Ice cream', lang: 'en', years: 4 }],
    ['market_potential', { countries: ['TR', 'Almanya', 'SAU'], metric: 'online_population', to_year: 2030 }],
    ['market_potential', { countries: ['TR', 'DE'], metric: 'gdp_per_capita', from_year: 2012 }],
  ],
  instagram: [['instagram_profile', { username: 'nike', posts: 2 }]],
  adlibrary: [['meta_ads_search', { query: 'kahve', country: 'TR', limit: 8 }]],
};

const ids = fs
  .readdirSync(path.join(root, 'mcps'))
  .filter((d) => !d.startsWith('_') && fs.existsSync(path.join(root, 'mcps', d, 'mcp.json')))
  .filter((d) => !only || d === only);

let failures = 0;
for (const id of ids) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'mcps', id, 'mcp.json'), 'utf8'));
  const entry = path.join(root, 'mcps', id, manifest.entry);
  console.log(`\n━━━ ${id} (${manifest.name.tr}) ━━━`);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { ...process.env, MARAI_DATA_DIR: path.join(os.tmpdir(), 'mar-ai-test'), MARAI_LANG: 'tr' },
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (d) => process.stderr.write(`   [${id} stderr] ${d}`));
  const client = new Client({ name: 'mar-ai-test', version: '0.1.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    console.log(`araçlar: ${tools.map((t) => t.name).join(', ')}`);
    for (const [name, args] of SAMPLES[id] ?? []) {
      const t = Date.now();
      const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
      const text = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      const images = res.content.filter((c) => c.type === 'image');
      const status = res.isError ? '✗ HATA' : '✓';
      if (res.isError) failures++;
      console.log(`\n${status} ${name} (${Date.now() - t} ms)${images.length ? ` + ${images.length} görsel (${Math.round(images[0].data.length / 1024)} KB)` : ''}`);
      console.log(text.length > 1800 ? text.slice(0, 1800) + `\n… (${text.length} karakter)` : text);
    }
  } catch (err) {
    failures++;
    console.error(`✗ ${id} başlatılamadı: ${err.message}`);
  } finally {
    await client.close().catch(() => undefined);
  }
}
console.log(failures ? `\n${failures} hata` : '\nTüm testler başarılı');
process.exit(failures ? 1 : 0);
