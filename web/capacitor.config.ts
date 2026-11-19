import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.x22.player',
  appName: 'x22',
  webDir: 'dist',
  backgroundColor: '#0a0a0a',
  server: {
    // The app runs at http://localhost — still a secure context (AudioWorklet, service
    // worker), but a plain-HTTP Navidrome on the LAN is no longer "mixed content".
    // From an https:// page Android's WebView silently refuses http:// audio streams,
    // which made songs spin at 0:00. HTTPS servers (Caddy) keep working too.
    androidScheme: 'http',
  },
}

export default config
