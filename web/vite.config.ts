import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const outDir = process.env.KUBEAQUARIUM_WEB_OUT_DIR ?? '../internal/webassets/dist';
const base = process.env.KUBEAQUARIUM_WEB_BASE ?? '/';

export default defineConfig({
  base,
  build: {
    outDir: resolve(__dirname, outDir),
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:7777', ws: true, changeOrigin: false },
    },
  },
});
