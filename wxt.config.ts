import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { API_HOST_PERMISSIONS } from './src/sites';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // MV3 everywhere: the extension relies on the scripting API and optional host permissions.
  manifestVersion: 3,
  vite: () => ({ plugins: [preact()] }),
  manifest: {
    name: 'Worth It?',
    description:
      'Hover a movie title on cinema and streaming sites to see its IMDb rating. Movie data from TMDB and OMDb.',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: API_HOST_PERMISSIONS,
    optional_host_permissions: ['<all_urls>'],
    browser_specific_settings: {
      gecko: {
        id: 'worth-it@screen-score',
        data_collection_permissions: { required: ['websiteContent'] },
      },
    },
  },
});
