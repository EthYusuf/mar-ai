// Geliştirme modu: Vite (anlık yenileme) + ana süreç izleme + Electron
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchElectron } from './start.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(root, cmd), ...args], { stdio: 'inherit', cwd: root });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}`))));
  });

await run('scripts/build-mcps.mjs', []);
await run('scripts/build-main.mjs', []);
spawn(process.execPath, [path.join(root, 'scripts/build-main.mjs'), '--watch'], { stdio: 'inherit', cwd: root });

const server = await createServer({ configFile: path.join(root, 'vite.config.ts') });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';
console.log(`arayüz: ${url}`);
launchElectron({ VITE_DEV_SERVER_URL: url });
