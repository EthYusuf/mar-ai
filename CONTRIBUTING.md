# Contributing to mar-ai

Thanks for helping! mar-ai grows through new data sources (MCP servers), skills, report panels, translations and fixes.

> Türkçe özet aşağıda.

## Ways to contribute

- **New MCP server**: a free, no-login data source marketers need. Start with [docs/MCP-DEVELOPMENT.md](docs/MCP-DEVELOPMENT.md).
- **Skills**: better workflows in `plugin/skills/*/SKILL.md`.
- **Panels and UI**: new report panel types, charts, accessibility and design polish.
- **Translations**: UI strings live in `src/i18n.ts`.
- **Bug reports and ideas**: use the issue templates.

## Development setup

```bash
npm install
npm run dev          # hot-reload development
npm run typecheck
npm run test:mcps    # live tests for MCP servers
```

You need a Claude Pro/Max plan and a one-time Claude Code sign-in to run end-to-end requests.

## Pull requests

1. Open an issue first for larger changes so we can agree on the approach.
2. Keep PRs focused; one feature or fix per PR.
3. `npm run typecheck` and `npm run build` must pass. For MCP changes, include the output of `npm run test:mcps -- <id>`.
4. UI changes: add a screenshot or short GIF to the PR.
5. Data sources must be **public, free and no-login**: no hidden APIs, no impersonation, no CAPTCHA or login bypass.

## Code style

- TypeScript everywhere, strict mode.
- User-facing strings go through `src/i18n.ts` (Turkish and English).
- Keep tool outputs structured and summarised, with a `source` field.

---

## Türkçe özet

- **Katkı alanları:** yeni MCP sunucusu (ücretsiz ve girişsiz kaynaklar), skill'ler, rapor panelleri, çeviriler, hata düzeltmeleri.
- **Kurulum:** `npm install`, ardından `npm run dev`. Uçtan uca istekler için Claude Pro/Max ve bir kerelik Claude Code girişi gerekir.
- **PR kuralları:** büyük değişiklikler için önce issue aç; `npm run typecheck` ve `npm run build` geçmeli; MCP değişikliklerinde `npm run test:mcps -- <id>` çıktısını ekle; arayüz değişikliklerine ekran görüntüsü ekle.
- **Veri kaynakları** herkese açık, ücretsiz ve girişsiz olmalı: gizli API, kimlik taklidi, CAPTCHA veya giriş atlatma yok.
- Rehber: [docs/MCP-GELISTIRME.md](docs/MCP-GELISTIRME.md)
