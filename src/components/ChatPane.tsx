import { useEffect, useRef, useState } from 'react';
import type { Attachment, ChatItem, McpInfo, ModuleId } from '../../shared/types';
import { useLang, useT } from '../i18n';
import { describeTool } from '../lib/tools';
import { Icon } from './Icons';
import { Markdown } from './Markdown';

const MAX_BINARY = 10 * 1024 * 1024;
const MAX_TEXT = 2 * 1024 * 1024;

function readFile(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const isBinary = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (file.size > (isBinary ? MAX_BINARY : MAX_TEXT)) return reject(new Error(`${file.name}: dosya çok büyük`));
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const result = String(r.result);
      resolve(
        isBinary
          ? { name: file.name, mime: file.type, data: result.slice(result.indexOf(',') + 1), encoding: 'base64' }
          : { name: file.name, mime: file.type || 'text/plain', data: result, encoding: 'text' },
      );
    };
    if (isBinary) r.readAsDataURL(file);
    else r.readAsText(file);
  });
}

interface Props {
  width: number;
  items: ChatItem[];
  busy: boolean;
  module: ModuleId;
  mcps: McpInfo[];
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onNew: () => void;
}

export function ChatPane({ width, items, busy, module, mcps, onSend, onStop, onNew }: Props) {
  const t = useT();
  const lang = useLang();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  const submit = () => {
    const v = text.trim();
    if (!v || busy) return;
    onSend(v, attachments);
    setText('');
    setAttachments([]);
    stick.current = true;
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files) return;
    setAttachError('');
    try {
      const read = await Promise.all(Array.from(files).slice(0, 5).map(readFile));
      setAttachments((a) => [...a, ...read].slice(0, 5));
    } catch (e) {
      setAttachError((e as Error).message);
    }
  };

  const ready = mcps.filter((m) => m.enabled && m.status !== 'failed').length;
  const lastIsUser = items.length > 0 && items[items.length - 1].kind === 'user';

  return (
    <aside className="chat-pane" style={{ width }} aria-label={t.chat}>
      <div className="chat-head">
        <h2>{t.chat}</h2>
        <button type="button" className="btn btn-sm" onClick={onNew}>
          <Icon.Plus size={14} />
          {t.newChat}
        </button>
      </div>

      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        }}
      >
        {items.length === 0 ? (
          <div className="empty-chat">
            <h3>{t.emptyChatTitle}</h3>
            <p className="muted" style={{ margin: 0 }}>
              {t.emptyChatBody}
            </p>
            <div className="suggestions">
              {t.suggestions[module].map((s) => (
                <button type="button" key={s} className="chip suggestion" onClick={() => onSend(s, [])} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          items.map((item) => {
            if (item.kind === 'user') {
              return (
                <div key={item.id} className="msg-user">
                  {item.text}
                  {item.attachments && item.attachments.length > 0 && (
                    <div className="att">
                      {item.attachments.map((a) => (
                        <span className="pill" key={a}>
                          <Icon.Clip size={12} />
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (item.kind === 'assistant') {
              return (
                <div key={item.id} className="msg-ai">
                  <span className="ai-avatar">
                    <Icon.Sparkle size={15} color="var(--accent-ink)" />
                  </span>
                  <div className="ai-body">
                    <Markdown text={item.text} streaming={item.streaming && busy} />
                  </div>
                </div>
              );
            }
            if (item.kind === 'tools') {
              return (
                <div key={item.id} className="tools-card">
                  <div className="tools-title">
                    <Icon.Sparkle size={13} />
                    {t.toolActivity}
                  </div>
                  {item.steps.map((s) => {
                    const d = describeTool(s.name, s.input, lang);
                    return (
                      <div key={s.toolId} className={`step${d.isPanel ? ' panel' : ''}`}>
                        <span className={`step-icon ${s.status}`}>
                          {s.status === 'done' ? <Icon.Check size={11} /> : s.status === 'error' ? <Icon.X size={11} /> : null}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="step-label">{d.label}</div>
                          {(d.detail || d.server) && (
                            <div className="step-detail">
                              {d.server && !d.isPanel ? `${d.server}` : ''}
                              {d.detail ? `${d.server && !d.isPanel ? ' · ' : ''}${d.detail}` : ''}
                            </div>
                          )}
                          {s.status === 'error' && s.summary && <div className="step-detail" style={{ color: 'var(--bad)' }}>{s.summary.slice(0, 160)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }
            return (
              <div key={item.id} className="msg-error" role="alert">
                <Icon.Alert size={16} />
                <div>{(item.code && t.errors[item.code]) || item.text || t.errors.unknown}</div>
              </div>
            );
          })
        )}
        {busy && lastIsUser && (
          <div className="msg-ai">
            <span className="ai-avatar">
              <Icon.Sparkle size={15} color="var(--accent-ink)" />
            </span>
            <div className="ai-body muted caret">{t.thinking}</div>
          </div>
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void pickFiles(e.dataTransfer.files);
        }}
      >
        <label htmlFor="marai-msg" className="sr-only">
          {t.messageLabel}
        </label>
        {attachments.length > 0 && (
          <div className="attachments">
            {attachments.map((a, i) => (
              <span className="pill" key={`${a.name}-${i}`}>
                <Icon.Clip size={12} />
                {a.name}
                <button
                  type="button"
                  aria-label={t.removeAttachment}
                  onClick={() => setAttachments((list) => list.filter((_, j) => j !== i))}
                  style={{ border: 0, background: 'transparent', padding: 0, display: 'inline-flex', color: 'var(--muted)' }}
                >
                  <Icon.X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {attachError && <div style={{ color: 'var(--bad)', fontSize: 12.5 }}>{attachError}</div>}
        <textarea
          id="marai-msg"
          ref={inputRef}
          rows={2}
          value={text}
          placeholder={t.placeholder[module]}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.txt,.csv,.md,.json,.tsv"
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button type="button" className="btn btn-icon btn-ghost" aria-label={t.attach} title={t.attach} onClick={() => fileRef.current?.click()}>
              <Icon.Clip size={18} />
            </button>
            <span className="composer-hint">Enter ↵ · Shift+Enter</span>
          </div>
          {busy ? (
            <button type="button" className="btn btn-icon" aria-label={t.stop} title={t.stop} onClick={onStop}>
              <Icon.Stop size={16} />
            </button>
          ) : (
            <button type="submit" className="btn btn-icon btn-primary" aria-label={t.send} title={t.send} disabled={!text.trim()}>
              <Icon.Send size={18} />
            </button>
          )}
        </div>
      </form>

      <div className="tools-footer">
        <button type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen((v) => !v)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className={`dot ${ready > 0 ? 'dot-good' : 'dot-idle'}`} />
            {t.toolsReady(ready, mcps.length)}
          </span>
          <Icon.Chevron size={16} style={{ transform: toolsOpen ? 'rotate(180deg)' : undefined }} />
        </button>
        {toolsOpen && (
          <div className="tools-list">
            {mcps.map((m) => (
              <div className="row" key={m.id}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.description}>
                  {m.name}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  <span className={`dot ${m.status === 'failed' ? 'dot-bad' : m.status === 'disabled' ? 'dot-idle' : 'dot-good'}`} />
                  {t.mcpStatus[m.status] ?? m.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
