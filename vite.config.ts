import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/airline-manager/").
// Locally the game is served from the root "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Airline Manager',
        short_name: 'Airline Mgr',
        description: 'A realistic airline management game.',
        lang: 'en',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        // The world data chunk is ~1.4 MB; allow precaching it so the map works offline.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            // Map label fonts from OpenFreeMap: keep them once downloaded.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/fonts\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-fonts',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // ES-module workers can load parts of themselves on demand (the engine loads airport data that way).
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
    // GitHub's build machine is several times slower than a laptop (see src/testing/slow.ts).
    testTimeout: process.env.CI ? 20_000 : 5_000,
  },
});
