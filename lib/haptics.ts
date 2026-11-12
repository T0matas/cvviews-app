import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** Small confirmation feedback across Capacitor iOS/Android and supported browsers. */
export async function tapHaptic() {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    }

    // The browser vibration API is available on Android, but not iOS Safari/PWA.
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(12);
  } catch {
    // Haptics are optional; unsupported devices should not interrupt the action.
  }
}
