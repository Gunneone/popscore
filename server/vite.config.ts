import { defineConfig } from 'vite';

// Bundles the ratings server and the extension code it shares (src/api, src/match) into one file
// Node runs as is: `npm run server:build`, then `node dist/server/index.mjs`.
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'server/index.ts',
    outDir: 'dist/server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'index.mjs' } },
  },
});
