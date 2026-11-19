import { Capacitor } from '@capacitor/core'

/** True inside the Android APK (Capacitor), false in the browser / PWA. */
export const isNative = () => Capacitor.isNativePlatform()
