import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { API_HOST_PERMISSIONS } from './src/sites';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // MV3 everywhere: the extension relies on the scripting API and optional host permissions.
  manifestVersion: 3,
  // Same layout as Swedeline: dist/chrome, dist/firefox and the store zips next to them.
  // Dev builds (`npm run dev`) go to dist/chrome-dev so they never mix with release builds.
  outDir: 'dist',
  outDirTemplate: '{{browser}}{{modeSuffix}}',
  zip: {
    artifactTemplate: '{{name}}-{{browser}}-{{packageVersion}}.zip',
    sourcesTemplate: '{{name}}-source-{{packageVersion}}.zip',
  },
  vite: () => ({ plugins: [preact()] }),
  manifest: {
    name: 'Popscore',
    description:
      'Hover a movie title on cinema and streaming sites to see its IMDb rating. Movie data from TMDB and OMDb.',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: API_HOST_PERMISSIONS,
    optional_host_permissions: ['<all_urls>'],
    browser_specific_settings: {
      gecko: {
        id: 'popscore@screen-score',
        data_collection_permissions: { required: ['websiteContent'] },
      },
    },
  },
});
