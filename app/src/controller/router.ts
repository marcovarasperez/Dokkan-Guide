import { computed, signal } from '@preact/signals';

/**
 * CONTROLADOR · Router de la aplicación.
 *
 * Toda la navegación de la app es HASH ROUTING (#/…): funciona igual en dev,
 * en el binario de escritorio (Tauri) y en la app móvil (Capacitor) sin
 * necesidad de servidor ni configuración de rewrites.
 *
 * Rutas soportadas:
 *   #/                      listado de personajes (vista `list`)
 *   #/characters/{id}       ficha de un personaje   (vista `detail`)
 *   #/categorias[/{id}]     explorador de categorías (vista `categories`)
 *   #/banners[/{id}]        banners activos/finalizados o su detalle
 *   #/eventos[?ev=tipo/id]  eventos del juego (deep-link desde una ficha)
 *   #/baba                  tienda de Baba
 *   #/noticias[/{id}]       noticias o lector de una noticia
 *
 * `route` es una señal: al cambiar el hash se actualiza una sola vez y las
 * vistas derivadas (`view`, `detailId`, …) se recalculan solas. Las vistas SOLO
 * leen estas señales; escribir en `route` (navegar) se hace con enlaces <a>.
 */
export const route = signal(location.hash);

/** #/characters/{id} → id de la ficha abierta. */
export const detailId = computed<number | null>(() => {
  const m = route.value.match(/^#\/characters\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** #/noticias/{id} → id de la noticia abierta. */
export const newsDetailId = computed<number | null>(() => {
  const m = route.value.match(/^#\/noticias\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** #/banners/{id} → id del banner abierto. */
export const bannerDetailId = computed<number | null>(() => {
  const m = route.value.match(/^#\/banners\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** #/categorias/{id} → id de la categoría abierta (sub-vista de Personajes). */
export const categoryId = computed<number | null>(() => {
  const m = route.value.match(/^#\/categorias\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** Deep-link de obtención: #/eventos?ev={type}/{id} (ej. ?ev=quest/12). */
export const eventsFocus = computed<{ type: string; id: number } | null>(() => {
  const m = route.value.match(/^#\/eventos(?:\?[^#]*)?$/);
  if (!m) return null;
  const qs = new URLSearchParams(route.value.split('?')[1] ?? '');
  const parts = (qs.get('ev') ?? '').match(/^([a-z]+)\/(\d+)$/);
  if (!parts) return null;
  return { type: parts[1], id: Number(parts[2]) };
});

export type View =
  | 'list'
  | 'detail'
  | 'news'
  | 'banners'
  | 'bannerDetail'
  | 'events'
  | 'baba'
  | 'categories'
  | 'settings'
  | 'recent';

/** Vista activa derivada de la ruta (el orden importa: lo más específico gana). */
export const view = computed<View>(() => {
  if (route.value.startsWith('#/noticias')) return 'news';
  if (bannerDetailId.value !== null) return 'bannerDetail';
  if (route.value.startsWith('#/banners')) return 'banners';
  // '#/juego' (ruta antigua) sigue abriendo Eventos.
  if (route.value.startsWith('#/eventos') || route.value.startsWith('#/juego')) return 'events';
  if (route.value.startsWith('#/baba')) return 'baba';
  if (route.value.startsWith('#/categorias')) return 'categories';
  if (route.value.startsWith('#/ajustes')) return 'settings';
  if (route.value.startsWith('#/recientes')) return 'recent';
  return detailId.value !== null ? 'detail' : 'list';
});

/**
 * Escucha los cambios de hash. Devuelve la función de limpieza para el
 * `useEffect` de la vista shell (`App`).
 */
export function initRouter(): () => void {
  const onHash = (): void => {
    route.value = location.hash;
  };
  addEventListener('hashchange', onHash);
  // Al cargar, si no hay hash, ir a Recientes
  if (!location.hash) {
    location.hash = '#/recientes';
  }
  return () => removeEventListener('hashchange', onHash);
}
