# Building an MCP server for mar-ai

Every data source in mar-ai is an **MCP server**. Adding one needs no changes to the app core: put a folder under
`mcps/`, and the build script bundles it, the installer ships it and the app loads it on start.

> Türkçe sürüm: [MCP-GELISTIRME.md](MCP-GELISTIRME.md)

## Folder layout

```
mcps/
  example/
    mcp.json         ← manifest (required)
    src/index.ts     ← server code (required)
    dist/server.mjs  ← build output (generated, git-ignored)
```

## mcp.json

```json
{
  "id": "example",
  "version": "0.1.0",
  "entry": "dist/server.mjs",
  "name": { "tr": "Örnek Kaynak", "en": "Example Source" },
  "description": {
    "tr": "Bu MCP'nin ne yaptığını tek cümleyle anlat.",
    "en": "Describe what this MCP does in one sentence."
  },
  "sources": ["Name of the data source"],
  "usesBrowser": false
}
```

| Field | Meaning |
|---|---|
| `id` | Lowercase letters, digits, `-` or `_`. Claude sees tools as `mcp__<id>__<tool>`. `panels` is reserved. |
| `entry` | Built file (default `dist/server.mjs`). |
| `usesBrowser` | `true` if it drives Chrome/Edge (tool timeout becomes 4 minutes). |
| `timeoutMs` | Optional custom tool timeout. |
| `env` | Optional extra environment variables. |
| `command`, `args` | For non-Node servers (e.g. Python): `"command": "python", "args": ["${dir}/server.py"]`. `${dir}` is replaced with the MCP folder. |

Node servers are started with the Node runtime inside Electron (`ELECTRON_RUN_AS_NODE`), so users never need to install Node.

## Server template (src/index.ts)

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchJson, ok, safe, startServer, MARAI_VERSION } from '../../_shared/common';

const server = new McpServer({ name: 'mar-example', version: MARAI_VERSION });

server.registerTool(
  'example_search',
  {
    title: 'Example search',
    description: 'Claude decides when to use a tool from this text: say clearly what it returns and what it is good for.',
    inputSchema: {
      query: z.string().min(2).describe('Search phrase'),
      limit: z.number().int().min(1).max(50).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ query, limit }) => {
    const data = await fetchJson<{ items: unknown[] }>(`https://example.api/search?q=${encodeURIComponent(query)}`);
    return ok({ source: 'Example API', query, items: data.items.slice(0, limit) });
  }),
);

await startServer(server, 'mar-example');
```

### Shared helpers (`mcps/_shared`)

| Helper | Purpose |
|---|---|
| `ok(data)` / `okWithImage(data, base64)` / `fail(msg)` | Build an MCP result (JSON text, optional image the model can see). |
| `safe(fn)` | Turns unexpected exceptions into a clean tool error. |
| `fetchText` / `fetchJson` | HTTP with timeout, retries and polite per-host pacing. |
| `TtlCache` | Avoid repeating the same request within a short time. |
| `ChromeSession` (`chrome.ts`) | Opens the installed Chromium browser headless with a separate profile and closes it when idle. Honours the browser chosen in Settings. |
| `blocks` / `tag` / `attr` (`xml.ts`) | RSS / Atom parsing. |
| `parseCompactNumber`, `median`, `topCounts`, `hashtags` | Number and text utilities. |

## Principles

1. **Free, no-login sources:** official open APIs, RSS feeds and public pages. No logins, no passwords, no hidden APIs, no impersonation.
2. **Be polite:** `fetchText` paces requests per host; wait between page visits and cache results.
3. **Return structured, summarised data:** numbers, lists and ready-made aggregates (distributions, averages) that Claude can turn into panels. Never return raw HTML.
4. **Name the source:** include a `source` field in every result; Claude carries it into the report's sources list.
5. **Friendly errors:** if a platform limits access, say so plainly.
6. `stdout` is reserved for the MCP protocol; use `log()` (stderr) for diagnostics.

## Test and ship

```bash
npm run build:mcps -- example     # build only this server
npm run test:mcps -- example      # add a sample call to scripts/test-mcps.mjs first
npm start                         # try it in the app: it appears under Settings → Tools
```

When it is ready, bump the version and push a tag (`git tag vX.Y.Z && git push --tags`). GitHub Actions publishes a new installer and
every installed app updates itself.

## Adding a skill

To teach Claude a workflow, create `plugin/skills/<name>/SKILL.md` with `name` and `description` in its YAML front matter. The
`description` decides when Claude uses it. See `plugin/skills/reklam-arastirmasi/SKILL.md` for an example.
