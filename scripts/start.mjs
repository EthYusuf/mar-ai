// Derlenmiş uygulamayı Electron ile başlatır.
// Not: VS Code gibi Electron tabanlı ortamlardan gelen ELECTRON_RUN_AS_NODE değişkeni
// Electron'u düz Node gibi çalıştırır; bu yüzden alt süreç ortamından kaldırılır.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electron = require('electron');

export function launchElectron(extraEnv = {}, args = []) {
  const env = { ...process.env, ...extraEnv };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [root, ...args], { stdio: 'inherit', env, cwd: root });
  child.on('exit', (code) => process.exit(code ?? 0));
  return child;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launchElectron({}, process.argv.slice(2));
}
