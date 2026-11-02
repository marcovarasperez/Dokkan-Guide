import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración de Capacitor (Android → APK).
 * - webDir: build de Vite (dist/).
 * - El transporte HTTP nativo (CapacitorHttp de @capacitor/core) se detecta en runtime
 *   desde src/model/http.ts; no hace falta configurar proxies.
 */
const config: CapacitorConfig = {
  appId: 'fan.dokkanguide.global',
  appName: 'Dokkan Fan Guide',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // Sin zoom por gestos (pellizco/doble toque) en el APK.
    zoomEnabled: false,
  },
};

export default config;
