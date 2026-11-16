/**
 * Chromium tabanlı tarayıcı tespiti (yalnızca Node: ana süreç ve MCP sunucuları kullanır).
 *
 * Otomatik tercih sırası: Chrome → Edge → Brave → Vivaldi → Chromium → Opera → Opera GX.
 * Edge her Windows 10/11'de kurulu geldiği için Chrome'u olmayan (Opera, Brave, Firefox… kullanan)
 * kişilerde de mar-ai çalışır. Kullanıcı Ayarlar'dan listedeki herhangi bir tarayıcıyı ya da özel bir
 * yolu seçebilir. mar-ai seçilen tarayıcıyı her zaman AYRI ve boş bir profille açar; kişinin kendi
 * profiline, çerezlerine veya şifrelerine dokunmaz.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DetectedBrowser } from './types';

interface Spec {
  id: string;
  name: string;
  /** Windows "App Paths" kayıt anahtarındaki exe adı (varsa) */
  appPath?: string;
  win: (dirs: WinDirs) => string[];
  mac: string[];
  linux: string[];
}

interface WinDirs {
  pf: string;
  pf86: string;
  local: string;
}

/** Opera'da kök klasördeki opera.exe bir başlatıcıdır; asıl tarayıcı en güncel sürüm klasöründedir. */
function operaBinaries(installDir: string): string[] {
  const out: string[] = [];
  try {
    const versions = fs
      .readdirSync(installDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+(\.\d+)+$/.test(d.name))
      .map((d) => d.name)
      .sort((a, b) => {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
          if (diff) return diff;
        }
        return 0;
      });
    for (const v of versions) out.push(path.join(installDir, v, 'opera.exe'));
  } catch {
    /* klasör yok */
  }
  out.push(path.join(installDir, 'opera.exe'));
  return out;
}

const SPECS: Spec[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    appPath: 'chrome.exe',
    win: ({ pf, pf86, local }) => [pf, pf86, local].map((r) => path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    mac: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'],
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    appPath: 'msedge.exe',
    win: ({ pf, pf86, local }) => [pf86, pf, local].map((r) => path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    mac: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable', '/opt/microsoft/msedge/msedge'],
  },
  {
    id: 'brave',
    name: 'Brave',
    appPath: 'brave.exe',
    win: ({ pf, pf86, local }) => [pf, pf86, local].map((r) => path.join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')),
    mac: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    linux: ['/usr/bin/brave-browser', '/usr/bin/brave', '/snap/bin/brave', '/opt/brave.com/brave/brave'],
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    appPath: 'vivaldi.exe',
    win: ({ pf, pf86, local }) => [local, pf, pf86].map((r) => path.join(r, 'Vivaldi', 'Application', 'vivaldi.exe')),
    mac: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
    linux: ['/usr/bin/vivaldi', '/usr/bin/vivaldi-stable', '/opt/vivaldi/vivaldi'],
  },
  {
    id: 'chromium',
    name: 'Chromium',
    win: ({ pf, pf86, local }) => [local, pf, pf86].map((r) => path.join(r, 'Chromium', 'Application', 'chrome.exe')),
    mac: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
  },
  {
    id: 'opera',
    name: 'Opera',
    win: ({ pf, local }) => [...operaBinaries(path.join(local, 'Programs', 'Opera')), ...operaBinaries(path.join(pf, 'Opera'))],
    mac: ['/Applications/Opera.app/Contents/MacOS/Opera'],
    linux: ['/usr/bin/opera', '/snap/bin/opera'],
  },
  {
    id: 'opera-gx',
    name: 'Opera GX',
    win: ({ pf, local }) => [...operaBinaries(path.join(local, 'Programs', 'Opera GX')), ...operaBinaries(path.join(pf, 'Opera GX'))],
    mac: ['/Applications/Opera GX.app/Contents/MacOS/Opera'],
    linux: [],
  },
];

let appPathsCache: Map<string, string> | null = null;

/**
 * Windows kayıt defterindeki "App Paths" girdileri (standart dışı kurulum klasörleri için).
 * Tek seferde iki toplu sorgu yapılır (HKLM + HKCU) ve sonuç önbelleğe alınır.
 */
function registryAppPaths(): Map<string, string> {
  if (appPathsCache) return appPathsCache;
  const map = new Map<string, string>();
  if (process.platform === 'win32') {
    for (const hive of ['HKCU', 'HKLM']) {
      try {
        const out = execFileSync('reg.exe', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths`, '/s'], {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5000,
          maxBuffer: 8 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        let key = '';
        for (const line of out.split(/\r?\n/)) {
          if (line.startsWith('HKEY_')) {
            key = line.slice(line.lastIndexOf('\\') + 1).toLowerCase();
            continue;
          }
          // Varsayılan değer satırı: dile göre "(Default)" / "(Varsayılan)"
          const m = line.match(/^\s+\([^)]*\)\s+REG_(?:EXPAND_)?SZ[ \t]+(.+?)[ \t]*$/);
          const value = m?.[1]?.replace(/^"|"$/g, '').trim();
          if (key && value && !map.has(key)) map.set(key, value);
        }
      } catch {
        /* sorgu başarısız: standart yollar yeterli */
      }
    }
  }
  appPathsCache = map;
  return map;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

let cache: DetectedBrowser[] | null = null;

/** Bilgisayardaki tüm uyumlu tarayıcılar, otomatik tercih sırasıyla. */
export function detectBrowsers(refresh = false): DetectedBrowser[] {
  if (cache && !refresh) return cache;
  if (refresh) appPathsCache = null;
  const dirs: WinDirs = {
    pf: process.env['ProgramFiles'] || 'C:\\Program Files',
    pf86: process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    local: process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local'),
  };
  const seen = new Set<string>();
  const found: DetectedBrowser[] = [];
  for (const spec of SPECS) {
    let candidates: string[];
    if (process.platform === 'win32') {
      candidates = spec.win(dirs);
      const reg = spec.appPath ? registryAppPaths().get(spec.appPath) : undefined;
      if (reg) candidates.push(reg);
    } else if (process.platform === 'darwin') {
      candidates = spec.mac;
    } else {
      candidates = spec.linux;
    }
    const hit = candidates.find(isFile);
    if (!hit) continue;
    const key = path.resolve(hit).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ id: spec.id, name: spec.name, path: hit });
  }
  cache = found;
  return found;
}

/** Bir dosya yolunun hangi tarayıcıya ait olduğunu tahmin eder (özel yollar için). */
export function describeBrowserPath(p: string): DetectedBrowser {
  const known = detectBrowsers().find((b) => path.resolve(b.path).toLowerCase() === path.resolve(p).toLowerCase());
  if (known) return known;
  const lower = p.toLowerCase();
  const guess =
    lower.includes('opera gx') ? 'Opera GX' : lower.includes('opera') ? 'Opera' : lower.includes('brave') ? 'Brave' : lower.includes('vivaldi') ? 'Vivaldi' : lower.includes('edge') ? 'Microsoft Edge' : lower.includes('chromium') ? 'Chromium' : lower.includes('chrome') ? 'Google Chrome' : path.basename(p);
  return { id: 'custom', name: guess, path: p };
}

/**
 * Kullanılacak tarayıcıyı seçer: geçerli bir tercih yolu varsa o, yoksa otomatik sıradaki ilk tarayıcı.
 */
export function pickBrowser(preferredPath?: string | null): { browser: DetectedBrowser | null; preferredMissing: boolean } {
  if (preferredPath) {
    if (isFile(preferredPath)) return { browser: describeBrowserPath(preferredPath), preferredMissing: false };
    return { browser: detectBrowsers()[0] ?? null, preferredMissing: true };
  }
  return { browser: detectBrowsers()[0] ?? null, preferredMissing: false };
}
