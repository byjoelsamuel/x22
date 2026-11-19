/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// In dev, proxy Navidrome and the uploader so the app is same-origin,
// exactly like Caddy does in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const navidrome = env.NAVIDROME_URL || 'http://192.168.0.100:4533'
  const uploader = env.UPLOADER_URL || 'http://192.168.0.100:4600'

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/favicon-64.png', 'icons/apple-touch-icon.png'],
        manifest: {
          name: 'x22',
          short_name: 'x22',
          description: 'Minimal lossless music player for Navidrome',
          id: '/',
          start_url: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#0a0a0a',
          theme_color: '#0a0a0a',
          categories: ['music', 'entertainment'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // App shell only. Audio is never cached (lossless files are huge); covers are.
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/rest\//, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/rest/getCoverArt'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'covers',
                expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com' || url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'fonts' },
            },
          ],
        },
      }),
    ],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: {
      host: true,
      proxy: {
        '/rest': { target: navidrome, changeOrigin: true },
        '/api': { target: uploader, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
    },
  }
})
