import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { isNative } from './platform'

/** A light tick on taps / gestures (APK only; silent in the browser). */
export function haptic(strength: 'light' | 'medium' = 'light') {
  if (!isNative()) return
  void Haptics.impact({ style: strength === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }).catch(() => {})
}
