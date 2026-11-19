import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.x22.player',
  appName: 'x22',
  webDir: 'dist',
  backgroundColor: '#0a0a0a',
  server: {
    // App runs at https://localhost, so it can talk to Navidrome behind Caddy (HTTPS).
    androidScheme: 'https',
  },
  android: {
    // Lets a plain-HTTP LAN Navidrome work too. HTTPS (deploy/) is still recommended.
    allowMixedContent: true,
  },
}

export default config
