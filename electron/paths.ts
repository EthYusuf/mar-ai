import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** Geliştirmede proje kökü, paketlenmiş uygulamada resources/app.asar */
export function appRoot(): string {
  return app.getAppPath();
}

/** Paketle birlikte gelen kaynaklar (mcps/, plugin/): paketlenmişte resources/ altında */
export function resourcePath(...parts: string[]): string {
  return app.isPackaged ? path.join(process.resourcesPath, ...parts) : path.join(appRoot(), ...parts);
}

/** asar içindeki bir yolu, çalıştırılabilir dosyalar için asar.unpacked karşılığına çevirir */
export function unpacked(p: string): string {
  return p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

export function ensureDir(p: string): string {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function dataDir(...parts: string[]): string {
  return ensureDir(path.join(app.getPath('userData'), ...parts));
}

export const paths = {
  settingsFile: () => path.join(dataDir(), 'settings.json'),
  conversations: () => dataDir('conversations'),
  workspace: () => dataDir('workspace'),
  userMcps: () => dataDir('mcps'),
  builtinMcps: () => resourcePath('mcps'),
  plugin: () => resourcePath('plugin'),
  logs: () => dataDir('logs'),
};
