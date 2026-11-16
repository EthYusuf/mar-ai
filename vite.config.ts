import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: marai-img:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Yalnızca üretim derlemesine sıkı içerik güvenlik politikası ekler (geliştirmede HMR çalışsın diye). */
function csp(): Plugin {
  return {
    name: 'marai-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  base: './',
  plugins: [react(), csp()],
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)),
    emptyOutDir: true,
    target: 'chrome130',
    chunkSizeWarningLimit: 1500,
  },
  server: { port: 5173, strictPort: true },
});
