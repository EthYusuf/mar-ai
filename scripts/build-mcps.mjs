// mcps/<id>/src/index.ts → mcps/<id>/dist/server.mjs (tek dosyalık, bağımlılıkları gömülü paket)
// Yeni bir MCP eklemek için: mcps/ altına mcp.json + src/index.ts içeren bir klasör koyman yeterli.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcpsDir = path.join(root, 'mcps');
const only = process.argv[2];

const ids = fs
  .readdirSync(mcpsDir)
  .filter((d) => !d.startsWith('_') && !d.startsWith('.'))
  .filter((d) => fs.existsSync(path.join(mcpsDir, d, 'mcp.json')))
  .filter((d) => !only || d === only);

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
let failed = 0;

for (const id of ids) {
  const dir = path.join(mcpsDir, id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8'));
  const entry = path.join(dir, 'src', 'index.ts');
  if (!fs.existsSync(entry)) {
    console.error(`✗ ${id}: src/index.ts bulunamadı`);
    failed++;
    continue;
  }
  const t = Date.now();
  try {
    await build({
      entryPoints: [entry],
      outfile: path.join(dir, manifest.entry || 'dist/server.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      // Paketlenmiş CommonJS bağımlılıkları için require() desteği
      banner: { js: "import { createRequire as __marai_cr } from 'node:module'; const require = __marai_cr(import.meta.url);" },
      define: { 'process.env.MARAI_BUILD_VERSION': JSON.stringify(version) },
      external: ['bufferutil', 'utf-8-validate'],
      legalComments: 'none',
      logLevel: 'error',
    });
    const size = fs.statSync(path.join(dir, manifest.entry || 'dist/server.mjs')).size;
    console.log(`✓ ${id.padEnd(12)} ${(size / 1024).toFixed(0).padStart(6)} KB  ${Date.now() - t} ms`);
  } catch (err) {
    failed++;
    console.error(`✗ ${id}: ${err.message}`);
  }
}

if (failed) {
  console.error(`${failed} MCP derlenemedi.`);
  process.exit(1);
}
