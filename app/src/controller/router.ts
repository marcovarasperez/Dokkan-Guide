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
  | 'recent'
  | 'news'
  | 'newsDetail'
  | 'banners'
  | 'bannerDetail'
  | 'bannerAnimations'
  | 'cards'
  | 'categories'
  | 'links'
  | 'events'
  | 'eventsBurst'
  | 'eventsBonus'
  | 'eventsDbStories'
  | 'eventsExtremeZBattle'
  | 'eventsGrowth'
  | 'eventsLimited'
  | 'eventsPettanBattle'
  | 'eventsQuest'
  | 'eventsStory'
  | 'eventsDokkanFrontier'
  | 'eventsUltimateClash'
  | 'eventsWorldTournament'
  | 'items'
  | 'itemsMeat'
  | 'itemsAwakeningMedals'
  | 'itemsEquipment'
  | 'itemsKeys'
  | 'itemsPotentialItems'
  | 'itemsSpecialItems'
  | 'itemsStickers'
  | 'itemsSupportItems'
  | 'itemsSupportMemories'
  | 'itemsTrainingFields'
  | 'itemsTrainingItems'
  | 'itemsTreasureItems'
  | 'itemsWallpapers'
  | 'missions'
  | 'panelMissions'
  | 'baba'
  | 'tools'
  | 'toolsLinkTool'
  | 'toolsLeaderSkill'
  | 'info'
  | 'settings';

/** Vista activa derivada de la ruta (el orden importa: lo más específico gana). */
export const view = computed<View>(() => {
  if (route.value.startsWith('#/noticias')) {
    if (newsDetailId.value !== null) return 'newsDetail';
    return 'news';
  }
  if (bannerDetailId.value !== null) return 'bannerDetail';
  if (route.value.startsWith('#/banners/animaciones')) return 'bannerAnimations';
  if (route.value.startsWith('#/banners')) return 'banners';
  if (route.value.startsWith('#/cartas/categorias')) return 'categories';
  if (route.value.startsWith('#/cartas/links')) return 'links';
  if (route.value.startsWith('#/cartas')) return 'cards';
  if (route.value.startsWith('#/eventos/burst')) return 'eventsBurst';
  if (route.value.startsWith('#/eventos/bonus')) return 'eventsBonus';
  if (route.value.startsWith('#/eventos/dbstories')) return 'eventsDbStories';
  if (route.value.startsWith('#/eventos/extreme-z-battle')) return 'eventsExtremeZBattle';
  if (route.value.startsWith('#/eventos/growth')) return 'eventsGrowth';
  if (route.value.startsWith('#/eventos/limited')) return 'eventsLimited';
  if (route.value.startsWith('#/eventos/pettan-battle')) return 'eventsPettanBattle';
  if (route.value.startsWith('#/eventos/quest')) return 'eventsQuest';
  if (route.value.startsWith('#/eventos/story')) return 'eventsStory';
  if (route.value.startsWith('#/eventos/dokkan-frontier')) return 'eventsDokkanFrontier';
  if (route.value.startsWith('#/eventos/ultimate-clash')) return 'eventsUltimateClash';
  if (route.value.startsWith('#/eventos/world-tournament')) return 'eventsWorldTournament';
  if (route.value.startsWith('#/eventos') || route.value.startsWith('#/juego')) return 'events';
  if (route.value.startsWith('#/items/carne')) return 'itemsMeat';
  if (route.value.startsWith('#/items/medallas-despertar')) return 'itemsAwakeningMedals';
  if (route.value.startsWith('#/items/equipamiento')) return 'itemsEquipment';
  if (route.value.startsWith('#/items/llaves')) return 'itemsKeys';
  if (route.value.startsWith('#/items/objetos-potencial')) return 'itemsPotentialItems';
  if (route.value.startsWith('#/items/objetos-especiales')) return 'itemsSpecialItems';
  if (route.value.startsWith('#/items/stickers')) return 'itemsStickers';
  if (route.value.startsWith('#/items/objetos-apoyo')) return 'itemsSupportItems';
  if (route.value.startsWith('#/items/memorias-apoyo')) return 'itemsSupportMemories';
  if (route.value.startsWith('#/items/campos-entrenamiento')) return 'itemsTrainingFields';
  if (route.value.startsWith('#/items/objetos-entrenamiento')) return 'itemsTrainingItems';
  if (route.value.startsWith('#/items/objetos-tesoro')) return 'itemsTreasureItems';
  if (route.value.startsWith('#/items/wallpapers')) return 'itemsWallpapers';
  if (route.value.startsWith('#/items')) return 'items';
  if (route.value.startsWith('#/misiones/panel')) return 'panelMissions';
  if (route.value.startsWith('#/misiones')) return 'missions';
  if (route.value.startsWith('#/baba')) return 'baba';
  if (route.value.startsWith('#/herramientas/link-tool')) return 'toolsLinkTool';
  if (route.value.startsWith('#/herramientas/leader-skill')) return 'toolsLeaderSkill';
  if (route.value.startsWith('#/herramientas')) return 'tools';
  if (route.value.startsWith('#/info')) return 'info';
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
