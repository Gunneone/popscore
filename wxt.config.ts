import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { apiHostPermissions, DEFAULT_SERVER_URL } from './src/sites';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // MV3 everywhere: the extension relies on the scripting API and optional host permissions.
  manifestVersion: 3,
  // Entrypoints live in src/entrypoints; `@/` resolves to src/. public/ stays at the root.
  srcDir: 'src',
  // Same layout as Swedeline: dist/chrome, dist/firefox and the store zips next to them.
  // Dev builds (`npm run dev`) go to dist/chrome-dev so they never mix with release builds.
  outDir: 'dist',
  outDirTemplate: '{{browser}}{{modeSuffix}}',
  zip: {
    artifactTemplate: '{{name}}-{{browser}}-{{packageVersion}}.zip',
    sourcesTemplate: '{{name}}-source-{{packageVersion}}.zip',
  },
  vite: () => ({ plugins: [preact()] }),
  // A function, so it runs after WXT has loaded .env (WXT_SERVER_URL for the host permission).
  manifest: () => ({
    name: 'Popscore',
    description:
      'Hover a movie title on cinema and streaming sites to see its IMDb rating. Movie data from TMDB and OMDb.',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: apiHostPermissions(process.env.WXT_SERVER_URL || DEFAULT_SERVER_URL),
    optional_host_permissions: ['<all_urls>'],
    browser_specific_settings: {
      gecko: {
        id: 'popscore@screen-score',
        data_collection_permissions: { required: ['websiteContent'] },
      },
    },
  }),
});
