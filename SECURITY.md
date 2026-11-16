# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include steps to reproduce and the affected version.

We aim to acknowledge reports within a few days and to ship a fix in the next release.

## Scope and design notes

- mar-ai never stores or reads Claude credentials; it relies on the user's own Claude Code session.
- MCP servers only access public data and never type into password fields.
- The renderer runs sandboxed with context isolation and a strict Content Security Policy; remote images are proxied through the main process.
- Research browsers run with a separate, empty profile.

---

**Türkçe:** Güvenlik açıklarını lütfen herkese açık issue olarak değil, depodaki **Security → Report a vulnerability** bölümünden gizli olarak bildir.
