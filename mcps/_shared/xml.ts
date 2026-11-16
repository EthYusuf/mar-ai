/** RSS / Atom beslemeleri için küçük, bağımlılıksız ayrıştırıcı. */
import { decodeEntities } from './common';

function escapeTag(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** <item> / <entry> bloklarını döndürür. */
export function blocks(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${escapeTag(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tagName)}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/** Bir bloğun içindeki ilk etiketin metni (yoksa ''). */
export function tag(block: string, tagName: string): string {
  const re = new RegExp(`<${escapeTag(tagName)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeTag(tagName)}>`);
  const m = block.match(re);
  return m ? decodeEntities(m[1]).trim() : '';
}

/** Bir etiketin bir özniteliği (kendiliğinden kapanan etiketler dahil). */
export function attr(block: string, tagName: string, attrName: string): string {
  const re = new RegExp(`<${escapeTag(tagName)}\\b[^>]*\\b${escapeTag(attrName)}="([^"]*)"`);
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

/** HTML etiketlerini temizleyip düz metin yapar. */
export function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}
