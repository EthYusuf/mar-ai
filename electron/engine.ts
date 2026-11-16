/**
 * Claude motoru: Claude Agent SDK üzerinden, kullanıcının kendi Claude oturumuyla çalışan
 * kalıcı bir sohbet oturumu yönetir. Mesajları akış (streaming input) modunda iletir,
 * yanıtları ve araç adımlarını arayüze olay olarak yollar.
 */
import fs from 'node:fs';
import { app } from 'electron';
import { query, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { EngineEvent, SendPayload, Settings } from '../shared/types';
import { resolveClaudeBinary } from './claude';
import { createPanelServer, type ReportStore } from './panels';
import { paths } from './paths';
import type { McpRegistry } from './registry';
import { buildSystemPrompt, moduleContext } from './system-prompt';

class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: Array<(r: IteratorResult<T>) => void> = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    this.closed = true;
    for (const w of this.waiters) w({ value: undefined as never, done: true });
    this.waiters = [];
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift() as T, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

export interface EngineDeps {
  getSettings(): Settings;
  registry: McpRegistry;
  store: ReportStore;
  emit(ev: EngineEvent): void;
  log(line: string): void;
}

type ContentBlock = { type: string; [k: string]: unknown };

function summarizeToolResult(content: unknown): string {
  if (typeof content === 'string') return content.slice(0, 280);
  if (Array.isArray(content)) {
    const texts = content
      .filter((c): c is { type: 'text'; text: string } => !!c && typeof c === 'object' && (c as ContentBlock).type === 'text')
      .map((c) => c.text);
    const images = content.filter((c) => c && typeof c === 'object' && (c as ContentBlock).type === 'image').length;
    return (texts.join(' ').slice(0, 280) + (images ? ` [+${images} görsel]` : '')).trim();
  }
  return '';
}

export class ClaudeEngine {
  private q: Query | null = null;
  private input: AsyncQueue<SDKUserMessage> | null = null;
  private sessionId: string | null = null;
  private resumeId: string | undefined;
  private busy = false;
  private configKey = '';
  private deltaSeen = new Set<string>();
  private currentMsgId = '';

  constructor(private readonly deps: EngineDeps) {}

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  private fingerprint(s: Settings): string {
    return JSON.stringify([s.model, s.claudePath, s.lang, s.browserVisible, s.browserPath, [...s.disabledMcps].sort(), this.deps.registry.enabledIds(s)]);
  }

  async send(payload: SendPayload): Promise<void> {
    const settings = this.deps.getSettings();
    if (this.q && this.fingerprint(settings) !== this.configKey) {
      // Ayarlar değişti (model, dil, MCP'ler…): sohbeti koruyarak oturumu yeniden başlat
      this.resumeId = this.sessionId ?? undefined;
      this.shutdown();
    }
    if (!this.q) this.start(settings);
    this.busy = true;
    this.deps.emit({ type: 'state', state: 'busy' });
    this.input!.push(this.toUserMessage(payload, settings));
  }

  async interrupt(): Promise<void> {
    if (!this.q) return;
    try {
      await this.q.interrupt();
    } catch (err) {
      this.deps.log(`interrupt: ${String(err)}`);
    }
  }

  /** Yeni sohbet: oturumu kapatır, sonraki mesaj sıfırdan başlar. */
  reset(resumeSessionId?: string): void {
    this.shutdown();
    this.sessionId = resumeSessionId ?? null;
    this.resumeId = resumeSessionId;
  }

  dispose(): void {
    this.shutdown();
  }

  private shutdown(): void {
    const q = this.q;
    this.q = null;
    this.input?.close();
    this.input = null;
    if (q) {
      try {
        q.close();
      } catch {
        /* zaten kapalı */
      }
    }
    if (this.busy) {
      this.busy = false;
      this.deps.emit({ type: 'turn_end', ok: false, durationMs: 0, error: 'stopped' });
    }
    this.deps.emit({ type: 'state', state: 'idle' });
  }

  private start(settings: Settings): void {
    const bin = resolveClaudeBinary(settings).path;
    if (!bin) {
      this.deps.emit({ type: 'error', code: 'no_binary', message: 'Claude Code motoru bulunamadı.' });
      throw new Error('Claude Code motoru bulunamadı.');
    }
    const mcpServers = { ...this.deps.registry.toSdkConfig(settings), panels: createPanelServer(this.deps.store) };
    const allowedTools = ['WebSearch', 'WebFetch', ...Object.keys(mcpServers).map((id) => `mcp__${id}`)];
    const plugins = fs.existsSync(paths.plugin()) ? [{ type: 'local' as const, path: paths.plugin(), skipMcpDiscovery: true }] : [];
    this.input = new AsyncQueue<SDKUserMessage>();
    this.configKey = this.fingerprint(settings);
    this.deltaSeen.clear();
    this.deps.emit({ type: 'state', state: 'starting' });
    const q = query({
      prompt: this.input,
      options: {
        pathToClaudeCodeExecutable: bin,
        cwd: paths.workspace(),
        settingSources: [],
        strictMcpConfig: true,
        mcpServers,
        plugins,
        skills: 'all',
        tools: ['WebSearch', 'WebFetch'],
        allowedTools,
        permissionMode: 'dontAsk',
        includePartialMessages: true,
        systemPrompt: { type: 'custom', prompt: buildSystemPrompt(settings.lang), snapshot: true },
        model: settings.model || undefined,
        resume: this.resumeId,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: `mar-ai/${app.getVersion()}` },
        stderr: (data: string) => this.deps.log(data.trimEnd()),
      },
    });
    this.q = q;
    void this.consume(q);
  }

  private async consume(q: Query): Promise<void> {
    try {
      for await (const msg of q) {
        if (this.q !== q) break;
        this.handle(msg);
      }
    } catch (err) {
      if (this.q === q) {
        const message = err instanceof Error ? err.message : String(err);
        this.deps.log(`engine error: ${message}`);
        this.deps.emit({ type: 'error', code: 'engine_crashed', message });
      }
    } finally {
      if (this.q === q) {
        this.q = null;
        this.input = null;
        this.resumeId = this.sessionId ?? undefined;
        if (this.busy) {
          this.busy = false;
          this.deps.emit({ type: 'turn_end', ok: false, durationMs: 0, error: 'engine_stopped' });
        }
        this.deps.emit({ type: 'state', state: 'idle' });
      }
    }
  }

  private handle(msg: SDKMessage): void {
    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init') {
          this.sessionId = msg.session_id;
          this.resumeId = undefined;
          this.deps.registry.setStatuses(msg.mcp_servers);
          this.deps.emit({
            type: 'session',
            sessionId: msg.session_id,
            model: msg.model,
            claudeVersion: msg.claude_code_version,
            authSource: msg.apiKeySource,
            mcp: msg.mcp_servers.map((s) => ({ name: s.name, status: s.status })),
            skills: msg.skills,
          });
          this.deps.emit({ type: 'state', state: this.busy ? 'busy' : 'ready' });
        }
        return;
      }
      case 'stream_event': {
        if (msg.parent_tool_use_id) return;
        const ev = msg.event as { type: string; message?: { id: string }; delta?: { type: string; text?: string }; content_block?: { type: string } };
        if (ev.type === 'message_start' && ev.message) {
          this.currentMsgId = ev.message.id;
        } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'text' && this.deltaSeen.has(this.currentMsgId)) {
          this.deps.emit({ type: 'text_delta', messageId: this.currentMsgId, text: '\n\n' });
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          this.deltaSeen.add(this.currentMsgId);
          this.deps.emit({ type: 'text_delta', messageId: this.currentMsgId, text: ev.delta.text });
        }
        return;
      }
      case 'assistant': {
        if (msg.parent_tool_use_id) return;
        if (msg.error) this.deps.emit({ type: 'error', code: msg.error, message: msg.error });
        const id = msg.message.id;
        for (const block of msg.message.content as unknown as ContentBlock[]) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text && !this.deltaSeen.has(id)) {
            this.deps.emit({ type: 'text_delta', messageId: id, text: block.text });
          } else if (block.type === 'tool_use') {
            this.deps.emit({ type: 'tool_start', toolId: String(block.id), name: String(block.name), input: (block.input as Record<string, unknown>) ?? {} });
          }
        }
        return;
      }
      case 'user': {
        if (msg.parent_tool_use_id) return;
        const content = msg.message.content;
        if (!Array.isArray(content)) return;
        for (const block of content as unknown as ContentBlock[]) {
          if (block.type === 'tool_result') {
            this.deps.emit({ type: 'tool_end', toolId: String(block.tool_use_id), isError: !!block.is_error, summary: summarizeToolResult(block.content) });
          }
        }
        return;
      }
      case 'result': {
        this.busy = false;
        const ok = msg.subtype === 'success' && !msg.is_error;
        this.deps.emit({ type: 'turn_end', ok, durationMs: msg.duration_ms, error: ok ? undefined : msg.subtype });
        this.deps.emit({ type: 'state', state: 'ready' });
        return;
      }
      default:
        return;
    }
  }

  private toUserMessage(payload: SendPayload, settings: Settings): SDKUserMessage {
    const blocks: Array<Record<string, unknown>> = [{ type: 'text', text: moduleContext(payload.module, settings.lang) }];
    for (const a of payload.attachments) {
      if (a.encoding === 'base64' && /^image\/(png|jpeg|gif|webp)$/.test(a.mime)) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } });
      } else if (a.encoding === 'base64' && a.mime === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data }, title: a.name });
      } else if (a.encoding === 'text') {
        blocks.push({ type: 'text', text: `Ek dosya: ${a.name}\n\`\`\`\n${a.data.slice(0, 150_000)}\n\`\`\`` });
      }
    }
    blocks.push({ type: 'text', text: payload.text });
    return {
      type: 'user',
      message: { role: 'user', content: blocks as never },
      parent_tool_use_id: null,
      session_id: this.sessionId ?? '',
    } as SDKUserMessage;
  }
}
