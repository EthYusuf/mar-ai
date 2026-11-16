# MCP geliştirme rehberi

> English version: [MCP-DEVELOPMENT.md](MCP-DEVELOPMENT.md)

mar-ai'de her veri kaynağı bir **MCP sunucusudur**. Yeni bir MCP eklemek için uygulamanın çekirdek koduna
dokunmana gerek yok: `mcps/` altına bir klasör koyman yeterli. Derleme betiği onu bulur, paketler ve
kurulum dosyasına ekler; uygulama açılışta otomatik yükler.

## Klasör yapısı

```
mcps/
  ornek/
    mcp.json         ← tanım dosyası (zorunlu)
    src/index.ts     ← sunucu kodu (zorunlu)
    dist/server.mjs  ← derleme çıktısı (otomatik üretilir, git'e girmez)
```

## mcp.json

```json
{
  "id": "ornek",
  "version": "0.1.0",
  "entry": "dist/server.mjs",
  "name": { "tr": "Örnek Kaynak", "en": "Example Source" },
  "description": {
    "tr": "Bu MCP'nin ne yaptığını tek cümleyle anlat.",
    "en": "Describe what this MCP does in one sentence."
  },
  "sources": ["Kaynağın adı"],
  "usesBrowser": false
}
```

| Alan | Açıklama |
|---|---|
| `id` | Küçük harf, rakam, `-` veya `_`. Claude'da araçlar `mcp__<id>__<araç>` adıyla görünür. `panels` ayrılmıştır. |
| `entry` | Derlenmiş dosya (varsayılan `dist/server.mjs`). |
| `usesBrowser` | Chrome/Edge kullanıyorsa `true` (araç zaman aşımı 4 dk olur). |
| `timeoutMs` | İsteğe bağlı özel araç zaman aşımı. |
| `env` | İsteğe bağlı ek ortam değişkenleri. |
| `command`, `args` | Node dışı bir sunucu için (örn. Python): `"command": "python", "args": ["${dir}/server.py"]`. `${dir}` MCP klasörüyle değiştirilir. |

## Sunucu şablonu (src/index.ts)

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { fetchJson, ok, safe, startServer, MARAI_VERSION } from '../../_shared/common';

const server = new McpServer({ name: 'mar-ornek', version: MARAI_VERSION });

server.registerTool(
  'ornek_ara',
  {
    title: 'Örnek arama',
    description: 'Claude bu açıklamaya bakarak aracı ne zaman kullanacağına karar verir: ne döndürdüğünü ve ne için iyi olduğunu net yaz.',
    inputSchema: {
      query: z.string().min(2).describe('Aranacak ifade'),
      limit: z.number().int().min(1).max(50).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  safe(async ({ query, limit }) => {
    const data = await fetchJson<{ items: unknown[] }>(`https://ornek.api/search?q=${encodeURIComponent(query)}`);
    return ok({ source: 'Örnek API', query, items: data.items.slice(0, limit) });
  }),
);

await startServer(server, 'mar-ornek');
```

### Ortak yardımcılar (`mcps/_shared`)

| Yardımcı | Ne işe yarar |
|---|---|
| `ok(data)` / `okWithImage(data, base64)` / `fail(msg)` | MCP sonucunu üretir (JSON metin, isteğe bağlı görsel). |
| `safe(fn)` | Hataları yakalayıp düzgün bir araç hatasına çevirir. |
| `fetchText` / `fetchJson` | Zaman aşımı, yeniden deneme ve site başına nazik bekleme içeren HTTP. |
| `TtlCache` | Aynı isteği kısa sürede tekrarlamamak için önbellek. |
| `ChromeSession` (`chrome.ts`) | Kurulu Chrome/Edge'i ayrı bir profille arka planda açar, boşta kalınca kapatır. |
| `blocks` / `tag` / `attr` (`xml.ts`) | RSS/Atom ayrıştırma. |
| `parseCompactNumber`, `median`, `topCounts`, `hashtags` | Sayı ve metin yardımcıları. |

## İlkeler

1. **Ücretsiz ve girişsiz kaynaklar:** resmi açık API'ler, RSS beslemeleri ve herkese açık sayfalar. Giriş yapma, parola isteme, gizli API veya kimlik taklidi yok.
2. **Nazik ol:** `fetchText` site başına bekleme uygular; tarayıcıyla gezerken sayfalar arasında bekle, sonuçları önbelleğe al.
3. **Yapılandırılmış ve özet veri döndür:** Claude'un panellere dönüştürebileceği sayılar, listeler ve hazır özetler (dağılımlar, ortalamalar). Ham HTML döndürme.
4. **Kaynağı belirt:** her sonuçta `source` alanı olsun; Claude bunu rapordaki kaynaklar listesine taşır.
5. **Hata mesajları kullanıcı dostu olsun:** platform erişimi sınırlarsa bunu açıkça söyle.
6. `stdout` MCP protokolüne ayrılmıştır; günlükler için `log()` (stderr) kullan.

## Test ve yayın

```bash
npm run build:mcps -- ornek      # yalnızca bu MCP'yi derle
npm run test:mcps -- ornek       # scripts/test-mcps.mjs içine örnek çağrı ekleyerek test et
npm start                        # uygulamada dene: Ayarlar → Araçlar listesinde görünmeli
```

Hazır olunca sürümü artırıp etiketle (`git tag vX.Y.Z && git push --tags`); GitHub Actions yeni kurulum dosyasını yayınlar
ve kullanıcıların uygulaması otomatik güncellenir.

## Skill eklemek

Claude'a bir iş akışını öğretmek için `plugin/skills/<ad>/SKILL.md` oluştur (YAML başlığında `name` ve `description`).
`description`, Claude'un skill'i ne zaman kullanacağını belirler. Örnekler: `plugin/skills/reklam-arastirmasi/SKILL.md`.
