/**
 * Claude Code motorunun bulunması ve bağlantı kontrolü.
 *
 * mar-ai, Claude'a erişmek için kullanıcının KENDİ Claude oturumunu kullanır:
 * kullanıcı resmi Claude Code aracıyla bir kez giriş yapar, mar-ai bu oturumla çalışır.
 * Uygulama içinde API anahtarı istenmez ve giriş bilgileri asla okunmaz/saklanmaz;
 * yalnızca oturum dosyasının var olup olmadığına bakılır.
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, shell } from 'electron';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeCheck, ConnectionTest, Settings } from '../shared/types';
import { appRoot, paths, unpacked } from './paths';

const INSTALL_DOCS = 'https://code.claude.com/docs/en/setup';

function bundledBinary(): string | null {
  const pkg = `claude-agent-sdk-${process.platform}-${process.arch}`;
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const candidates = [
    path.join(appRoot(), 'node_modules', '@anthropic-ai', pkg, exe),
    path.join(appRoot(), 'node_modules', '@anthropic-ai', `${pkg}-musl`, exe),
  ].map(unpacked);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

function systemBinary(): Promise<string | null> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    execFile(cmd, ['claude'], { timeout: 8000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const pick = lines.find((l) => l.endsWith('.exe')) ?? lines.find((l) => l.endsWith('.cmd')) ?? lines[0];
      resolve(pick ?? null);
    });
  });
}

function versionOf(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const isCmd = bin.toLowerCase().endsWith('.cmd');
    execFile(isCmd ? 'cmd.exe' : bin, isCmd ? ['/c', bin, '--version'] : ['--version'], { timeout: 20000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(stdout.trim().split(/\s+/)[0] || null);
    });
  });
}

/** Ayarlarda özel yol yoksa uygulamayla gelen motoru kullanır. */
export function resolveClaudeBinary(settings: Settings): { path: string | null; source: ClaudeCheck['source'] } {
  if (settings.claudePath && fs.existsSync(settings.claudePath)) return { path: settings.claudePath, source: 'custom' };
  const b = bundledBinary();
  return { path: b, source: b ? 'bundled' : null };
}

export function credentialsPresent(): boolean {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  if (fs.existsSync(path.join(configDir, '.credentials.json'))) return true;
  // macOS'ta oturum Anahtar Zinciri'nde tutulur; dosya olmaması oturum olmadığı anlamına gelmez.
  return process.platform === 'darwin' && fs.existsSync(configDir);
}

export async function checkClaude(settings: Settings): Promise<ClaudeCheck> {
  const resolved = resolveClaudeBinary(settings);
  const system = await systemBinary();
  const binary = resolved.path ?? null;
  return {
    binaryFound: !!binary,
    binaryPath: binary,
    source: resolved.source,
    version: binary ? await versionOf(binary) : null,
    credentialsFound: credentialsPresent(),
    apiKeyEnv: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN),
    systemClaudePath: system,
  };
}

/**
 * Resmi Claude Code aracını kullanıcının kendi terminalinde açar; kullanıcı girişi
 * orada, Anthropic'in kendi akışıyla yapar. Claude Code kurulu değilse kurulum sayfası açılır.
 */
export async function openOfficialLogin(): Promise<{ opened: 'terminal' | 'docs' }> {
  const system = await systemBinary();
  if (!system) {
    await shell.openExternal(INSTALL_DOCS);
    return { opened: 'docs' };
  }
  if (process.platform === 'win32') {
    // windowsVerbatimArguments: "start" komutunun pencere başlığı tırnaklarının bozulmaması için
    spawn('cmd.exe', ['/c', 'start "Claude Code" cmd.exe /k claude'], { detached: true, stdio: 'ignore', windowsHide: false, windowsVerbatimArguments: true }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', ['-a', 'Terminal', system], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('x-terminal-emulator', ['-e', 'claude'], { detached: true, stdio: 'ignore' }).unref();
  }
  return { opened: 'terminal' };
}

/** Kullanıcının isteğiyle çok kısa bir deneme isteği gönderir (birkaç token). */
export async function testConnection(settings: Settings): Promise<ConnectionTest> {
  const bin = resolveClaudeBinary(settings).path;
  if (!bin) return { ok: false, error: 'Claude Code motoru bulunamadı.', errorCode: 'no_binary' };
  const result: ConnectionTest = { ok: false };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90_000);
  try {
    const q = query({
      prompt: 'Reply with exactly: OK',
      options: {
        pathToClaudeCodeExecutable: bin,
        cwd: paths.workspace(),
        settingSources: [],
        strictMcpConfig: true,
        tools: [],
        maxTurns: 1,
        permissionMode: 'dontAsk',
        model: settings.model || undefined,
        abortController: abort,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: `mar-ai/${app.getVersion()}` },
      },
    });
    for await (const msg of q) {
      if (msg.type === 'system' && msg.subtype === 'init') {
        result.model = msg.model;
        result.authSource = msg.apiKeySource;
        result.claudeVersion = msg.claude_code_version;
      } else if (msg.type === 'assistant' && msg.error) {
        result.errorCode = msg.error;
      } else if (msg.type === 'result') {
        result.ok = msg.subtype === 'success' && !msg.is_error && !result.errorCode;
        if (!result.ok && !result.error) result.error = msg.subtype === 'success' ? ('result' in msg ? String(msg.result).slice(0, 300) : 'Bilinmeyen hata') : msg.subtype;
      }
    }
  } catch (err) {
    result.ok = false;
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }
  if (result.errorCode === 'authentication_failed') result.error = 'Claude oturumu bulunamadı veya süresi dolmuş.';
  return result;
}
