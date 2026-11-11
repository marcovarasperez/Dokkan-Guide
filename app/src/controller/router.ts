import { computed, signal } from '@preact/signals';
import { EVENT_TYPES } from '../model/game';

/**
 * CONTROLADOR · Router de la aplicación.
 *
 * Toda la navegación es HASH ROUTING (#/…): funciona igual en dev, en el .exe
 * (Tauri) y en el APK (Capacitor) sin servidor ni rewrites.
 *
 * Rutas (espejo del menú de dokkaninfo.com, ver `navigation.ts`):
 *   #/recientes                         novedades (pantalla de inicio)
 *   #/noticias[/{id}]                   noticias o lector de una noticia
 *   #/banners[/{id}]                    banners activos/finalizados o detalle
 *   #/cartas                            listado de personajes (con filtros)
 *   #/characters/{id}                   ficha de un personaje
 *   #/cartas/categorias[/{id}]          categorías o miembros de una categoría
 *   #/cartas/links                      todos los Link Skills (Nv.1 / Nv.10)
 *   #/cartas/calendario                 próximas cartas (Schedule)
 *   #/eventos[/{slug}][?ev=tipo/id]     eventos por categoría (+ deep-link)
 *   #/items/{slug}                      objetos por categoría
 *   #/misiones[/panel]                  misiones / panel missions
 *   #/baba[/{tienda}]                   tienda de Baba (4 tiendas)
 *   #/herramientas/{link-tool|leader-skill}
 *   #/info · #/ajustes
 *   #/dk/{ruta}                         visor genérico de cualquier página de
 *                                       dokkaninfo (enlaces internos)
 *
 * `route` es una señal: al cambiar el hash se actualiza una vez y todo lo
 * derivado (`view`, `detailId`, …) se recalcula solo. Las vistas SOLO leen
 * estas señales; navegar = escribir el hash (enlaces <a href="#/…">).
 */
export const route = signal(location.hash);

/** Ruta sin la query (?…). */
const path = computed(() => route.value.split('?')[0]);

const match = (re: RegExp): RegExpMatchArray | null => path.value.match(re);

/** #/characters/{id} → id de la ficha abierta. */
export const detailId = computed<number | null>(() => {
  const m = match(/^#\/characters\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** #/noticias/{id} → id de la noticia abierta. */
export const newsDetailId = computed<number | null>(() => {
  const m = match(/^#\/noticias\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** #/banners/{id} → id del banner abierto. */
export const bannerDetailId = computed<number | null>(() => {
  const m = match(/^#\/banners\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** #/cartas/categorias/{id} (o el antiguo #/categorias/{id}) → id de la categoría. */
export const categoryId = computed<number | null>(() => {
  const m = match(/^#\/(?:cartas\/)?categorias\/(\d+)$/);
  return m ? Number(m[1]) : null;
});

/** Deep-link de obtención: #/eventos?ev={type}/{id} (ej. ?ev=quest/12). */
export const eventsFocus = computed<{ type: string; id: number } | null>(() => {
  if (!route.value.startsWith('#/eventos')) return null;
  const qs = new URLSearchParams(route.value.split('?')[1] ?? '');
  const parts = (qs.get('ev') ?? '').match(/^([a-z]+)\/(\d+)$/);
  if (!parts) return null;
  return { type: parts[1], id: Number(parts[2]) };
});

/** Categoría de eventos pedida (tipo de URL de dokkaninfo). Por defecto: Limited. */
export const eventsType = computed<string>(() => {
  const focus = eventsFocus.value;
  if (focus) return focus.type;
  const slug = match(/^#\/eventos\/([a-z-]+)/)?.[1];
  return EVENT_TYPES.find((t) => t.slug === slug || t.type === slug)?.type ?? 'limited';
});

/** #/items/{slug} → slug de la categoría de objetos. */
export const itemsSlug = computed<string | null>(() => match(/^#\/items\/([a-z-]+)/)?.[1] ?? null);

/** #/baba/{tienda} → tienda de Baba. */
export const babaShop = computed<string | null>(() => match(/^#\/baba\/([a-z]+)/)?.[1] ?? null);

/** #/dk/{ruta} → ruta de dokkaninfo para el visor genérico (sin barra inicial). */
export const dkPath = computed<string | null>(() => {
  const m = route.value.match(/^#\/dk\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
});

export type View =
  | 'list'
  | 'detail'
  | 'recent'
  | 'news'
  | 'newsDetail'
  | 'banners'
  | 'bannerDetail'
  | 'categories'
  | 'links'
  | 'schedule'
  | 'events'
  | 'items'
  | 'missions'
  | 'panelMissions'
  | 'baba'
  | 'toolsLinkTool'
  | 'toolsLeaderSkill'
  | 'info'
  | 'settings'
  | 'dkPage';

/** Vista activa derivada de la ruta (el orden importa: lo más específico gana). */
export const view = computed<View>(() => {
  const p = path.value;
  const is = (prefix: string): boolean => p === prefix || p.startsWith(`${prefix}/`);
  if (detailId.value !== null) return 'detail';
  if (is('#/noticias')) return newsDetailId.value !== null ? 'newsDetail' : 'news';
  if (bannerDetailId.value !== null) return 'bannerDetail';
  if (is('#/banners')) return 'banners';
  if (is('#/cartas/categorias') || is('#/categorias')) return 'categories';
  if (is('#/cartas/links')) return 'links';
  if (is('#/cartas/calendario')) return 'schedule';
  if (is('#/eventos') || is('#/juego')) return 'events';
  if (is('#/items')) return 'items';
  if (is('#/misiones/panel')) return 'panelMissions';
  if (is('#/misiones')) return 'missions';
  if (is('#/baba')) return 'baba';
  if (is('#/herramientas/leader-skill')) return 'toolsLeaderSkill';
  if (is('#/herramientas')) return 'toolsLinkTool';
  if (is('#/info')) return 'info';
  if (is('#/ajustes')) return 'settings';
  if (is('#/recientes')) return 'recent';
  if (is('#/dk')) return 'dkPage';
  return 'list';
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
  // Al arrancar sin hash: Recientes (pantalla de inicio).
  if (!location.hash) location.hash = '#/recientes';
  return () => removeEventListener('hashchange', onHash);
}
