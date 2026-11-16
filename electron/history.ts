import fs from 'node:fs';
import path from 'node:path';
import type { Conversation, ConversationMeta } from '../shared/types';
import { paths } from './paths';

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

function fileFor(id: string): string {
  if (!ID_RE.test(id)) throw new Error('Geçersiz sohbet kimliği');
  return path.join(paths.conversations(), `${id}.json`);
}

export function saveConversation(c: Conversation): void {
  fs.writeFileSync(fileFor(c.id), JSON.stringify(c), 'utf8');
}

export function loadConversation(id: string): Conversation | null {
  try {
    return JSON.parse(fs.readFileSync(fileFor(id), 'utf8')) as Conversation;
  } catch {
    return null;
  }
}

export function deleteConversation(id: string): void {
  fs.rmSync(fileFor(id), { force: true });
}

export function listConversations(limit = 60): ConversationMeta[] {
  const dir = paths.conversations();
  const metas: ConversationMeta[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Conversation;
      metas.push({ id: c.id, title: c.title, module: c.module, updatedAt: c.updatedAt, hasReport: !!c.report?.panels.length });
    } catch {
      /* bozuk dosya: atla */
    }
  }
  return metas.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, limit);
}
