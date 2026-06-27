import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Pokémon Champions Team Lab',
        short_name: 'Champions Lab',
        description: 'Constructor y analizador de equipos de Pokémon Champions (VGC, dobles).',
        lang: 'es',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // Sprites de Pokémon/objetos (Showdown) y fallback de PokeAPI (GitHub):
            // CacheFirst → tras la primera carga salen al instante.
            urlPattern: ({ url }) =>
              url.origin === 'https://play.pokemonshowdown.com' ||
              url.origin === 'https://raw.githubusercontent.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'sprites',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Datos de Champions: se sirven de caché y se revalidan en segundo plano.
            urlPattern: ({ url }) => url.pathname.startsWith('/data/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'champions-data' },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@pkmn/mods/champions'],
  },
  build: {
    rollupOptions: {
      output: {
        // React y el router cambian poco: en su propio chunk se cachean
        // entre despliegues aunque cambie el código de la app.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
