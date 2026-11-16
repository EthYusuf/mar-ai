import fs from 'node:fs';
import { DEFAULT_SETTINGS, type Settings } from '../shared/types';
import { paths } from './paths';

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(paths.settingsFile(), 'utf8')) as Partial<Settings>;
    cache = { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  next.chatWidth = Math.round(Math.min(Math.max(next.chatWidth, 300), 900));
  cache = next;
  fs.writeFileSync(paths.settingsFile(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}
