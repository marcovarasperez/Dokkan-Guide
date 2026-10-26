import { newsState } from '../model/news';

/**
 * CONTROLADOR · Sección Noticias (campañas y eventos del juego) — fuente: dokkaninfo.com.
 *
 * Expone el estado global de noticias que publica `model/news.ts`:
 *  - `items`: lista cacheada de noticias (vacía mientras no haya datos);
 *  - `refreshing`: hay una actualización en curso;
 *  - `failed`: la última actualización falló (sin conexión).
 *
 * La CARGA no arranca aquí: la semilla del paquete local se lee al abrir la
 * app y la actualización la dispara la sincronización (`model/sync.ts` llama a
 * `refreshNews`), igual que en `controller/listController.ts`. Este hook solo
 * lee el estado para que la vista `view/NewsView.tsx` pinte la lista y el chip
 * de estado (`newsStatusText()`).
 */
export function useNewsController() {
  const { cache, refreshing, failed } = newsState.value;
  /** Noticias ya cacheadas (vacío → la vista pinta su estado de carga). */
  const items = cache?.news ?? [];

  return {
    /** Hay una actualización en curso (chip de estado ocupado). */
    refreshing,
    /** La última actualización falló (mensaje de sin conexión). */
    failed,
    /** Noticias listas para pintar. */
    items,
  };
}
