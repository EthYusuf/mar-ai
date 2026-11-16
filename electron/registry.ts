/**
 * MCP kayıt defteri.
 * İki klasörü tarar:
 *  1. Uygulamayla gelen MCP'ler  (repo: mcps/, kurulu uygulama: resources/mcps/)
 *  2. Kullanıcının kendi MCP'leri (%APPDATA%/mar-ai/mcps/)
 * Her alt klasörde bir mcp.json bulunur. Node tabanlı MCP'ler Electron'un içindeki Node ile
 * (ELECTRON_RUN_AS_NODE) çalıştırılır; kullanıcının ayrıca Node kurmasına gerek yoktur.
 * mcp.json içinde "command" verilirse (örn. python) o komut kullanılır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import type { Lang, McpInfo, Settings } from '../shared/types';
import { dataDir, paths } from './paths';

interface Manifest {
  id: string;
  version?: string;
  entry?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  name?: Partial<Record<Lang, string>> | string;
  description?: Partial<Record<Lang, string>> | string;
  sources?: string[];
  usesBrowser?: boolean;
  timeoutMs?: number;
}

interface Entry {
  manifest: Manifest;
  dir: string;
  origin: 'builtin' | 'user';
}

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/;

function localized(v: Manifest['name'], lang: Lang, fallback: string): string {
  if (!v) return fallback;
  if (typeof v === 'string') return v;
  return v[lang] ?? v.tr ?? v.en ?? fallback;
}

export class McpRegistry {
  private entries: Entry[] = [];
  private statuses = new Map<string, string>();

  scan(): void {
    const found: Entry[] = [];
    const roots: Array<[string, 'builtin' | 'user']> = [
      [paths.builtinMcps(), 'builtin'],
      [paths.userMcps(), 'user'],
    ];
    for (const [root, origin] of roots) {
      if (!fs.existsSync(root)) continue;
      for (const name of fs.readdirSync(root)) {
        if (name.startsWith('_') || name.startsWith('.')) continue;
        const dir = path.join(root, name);
        const manifestPath = path.join(dir, 'mcp.json');
        if (!fs.existsSync(manifestPath)) continue;
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
          manifest.id = (manifest.id || name).toLowerCase();
          if (!ID_RE.test(manifest.id) || manifest.id === 'panels') continue;
          if (!manifest.command && !fs.existsSync(path.join(dir, manifest.entry || 'dist/server.mjs'))) continue;
          // Kullanıcı klasöründeki aynı kimlikli MCP, gömülü olanın yerine geçer
          const idx = found.findIndex((e) => e.manifest.id === manifest.id);
          if (idx >= 0) found.splice(idx, 1);
          found.push({ manifest, dir, origin });
        } catch {
          /* bozuk mcp.json: atla */
        }
      }
    }
    this.entries = found;
  }

  list(settings: Settings): McpInfo[] {
    return this.entries.map(({ manifest, origin }) => {
      const enabled = !settings.disabledMcps.includes(manifest.id);
      return {
        id: manifest.id,
        name: localized(manifest.name, settings.lang, manifest.id),
        description: localized(manifest.description, settings.lang, ''),
        version: manifest.version ?? '0.0.0',
        sources: manifest.sources ?? [],
        usesBrowser: !!manifest.usesBrowser,
        origin,
        enabled,
        status: enabled ? (this.statuses.get(manifest.id) ?? 'unknown') : 'disabled',
      };
    });
  }

  enabledIds(settings: Settings): string[] {
    return this.entries.map((e) => e.manifest.id).filter((id) => !settings.disabledMcps.includes(id));
  }

  setStatuses(list: Array<{ name: string; status: string }>): void {
    for (const s of list) this.statuses.set(s.name, s.status);
  }

  /** Claude Agent SDK için mcpServers yapılandırması */
  toSdkConfig(settings: Settings): Record<string, McpServerConfig> {
    const out: Record<string, McpServerConfig> = {};
    const baseEnv: Record<string, string> = {
      MARAI_DATA_DIR: dataDir('mcp-data'),
      MARAI_LANG: settings.lang,
      MARAI_VERSION: app.getVersion(),
      MARAI_BROWSER_HEADLESS: settings.browserVisible ? '0' : '1',
    };
    // Ayarlar'da seçilen tarayıcı; boşsa MCP'ler otomatik seçer (Chrome → Edge → Brave → …)
    if (settings.browserPath) baseEnv.MARAI_CHROME_PATH = settings.browserPath;
    for (const { manifest, dir } of this.entries) {
      if (settings.disabledMcps.includes(manifest.id)) continue;
      const env = { ...baseEnv, ...(manifest.env ?? {}) };
      const timeout = manifest.timeoutMs ?? (manifest.usesBrowser ? 240_000 : 90_000);
      if (manifest.command) {
        out[manifest.id] = {
          type: 'stdio',
          command: manifest.command,
          args: (manifest.args ?? []).map((a) => a.replace('${dir}', dir)),
          env,
          timeout,
          alwaysLoad: true,
        };
      } else {
        out[manifest.id] = {
          type: 'stdio',
          command: process.execPath,
          args: [path.join(dir, manifest.entry || 'dist/server.mjs')],
          env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
          timeout,
          alwaysLoad: true,
        };
      }
    }
    return out;
  }
}
