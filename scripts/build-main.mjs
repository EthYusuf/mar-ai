// Electron ana süreci (ESM) ve preload (CommonJS, sandbox uyumlu) derlemesi
import { build, context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

// Çalışma zamanında node_modules'tan yüklenecek paketler (asar içine dahil edilir)
const external = ['electron', '@anthropic-ai/claude-agent-sdk', 'electron-updater', 'zod', '@modelcontextprotocol/sdk'];

const configs = [
  {
    entryPoints: [path.join(root, 'electron', 'main.ts')],
    outfile: path.join(root, 'dist', 'main', 'main.mjs'),
    format: 'esm',
    external,
  },
  {
    entryPoints: [path.join(root, 'electron', 'preload.ts')],
    outfile: path.join(root, 'dist', 'main', 'preload.cjs'),
    format: 'cjs',
    external: ['electron'],
  },
].map((c) => ({ ...c, bundle: true, platform: 'node', target: 'node22', sourcemap: 'linked', logLevel: 'error' }));

if (watch) {
  for (const c of configs) {
    const ctx = await context(c);
    await ctx.watch();
  }
  console.log('ana süreç izleniyor…');
} else {
  await Promise.all(configs.map((c) => build(c)));
  console.log('✓ ana süreç derlendi');
}
