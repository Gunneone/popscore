import { build } from 'vite';

await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: 'dist/probe',
    emptyOutDir: true,
    lib: {
      entry: 'scripts/probe-entry.ts',
      formats: ['iife'],
      name: 'worthItProbe',
      fileName: () => 'probe.js',
    },
  },
});
console.log(
  'Wrote dist/probe/probe.js. Paste it into the DevTools console, then run worthItProbe.watch().',
);
