/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// In dev, proxy Navidrome and the uploader so the app is same-origin,
// exactly like Caddy does in production.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const navidrome = env.NAVIDROME_URL || 'http://192.168.0.100:4533'
  const uploader = env.UPLOADER_URL || 'http://192.168.0.100:4600'

  return {
    plugins: [react()],
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
