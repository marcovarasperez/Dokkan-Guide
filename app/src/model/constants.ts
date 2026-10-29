/**
 * Constantes compartidas — evita duplicados entre módulos.
 */

/** CDN base de dokkaninfo.com */
export const INFO_CDN = 'https://dokkaninfo.com';

/** Ruta de assets global/en de dokkaninfo */
export const INFO_ASSET = `${INFO_CDN}/assets/global/en`;

/** CDN de assets del juego (fyi) para paths que no responden en dokkaninfo */
export const CDN_ASSET = 'https://cdn.dokkan.fyi/assets/en';

/** Nombre de la base de datos IndexedDB */
export const DB_NAME = 'dk-detail';

/** Versión de la base de datos (incrementar al añadir stores) */
export const DB_VERSION = 2;

/** Nombres de tiendas (object stores) en IndexedDB */
export const STORE_NAMES = {
  DETAILS: 'details',
  UNITS: 'units',
  META: 'meta',
  NEWS: 'news',
  EVENTS: 'events',
  BANNERS: 'banners',
} as const;

/** Todas las tiendas (para upgrades) */
export const ALL_STORES = Object.values(STORE_NAMES);

/** Sentinela de "sin fecha" usada por dokkaninfo (>= 2038-01-19) */
export const TIME_SENTINEL = 2_145_000_000;

/** TTL por defecto para cachés de lista (6 horas) */
export const LIST_TTL_MS = 6 * 60 * 60 * 1000;

/** TTL por defecto para cachés de detalle (7 días) */
export const DETAIL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Intervalo mínimo entre comprobaciones de sync (2 minutos) */
export const CHECK_INTERVAL_MS = 2 * 60 * 1000;

/** Intervalo de auto-refresco (5 minutos) */
export const AUTO_REFRESH_MS = 5 * 60 * 1000;

/** Máximo de fichas descargadas por corrida de sync */
export const MAX_FETCHES_PER_RUN = 50;

/** Máximo de páginas en carga completa de banners */
export const MAX_ALL_PAGES = 10;

/** Máximo de Z-Battles a enriquecer con detalle */
export const ZB_ENRICH_MAX = 12;

/** Máximo de cuerpos de noticia en caché LRU */
export const BODY_CACHE_MAX = 20;

/** Versión de caché de noticias (para invalidar al cambiar formato) */
export const NEWS_CACHE_VERSION = 3;

/** Versión de caché de banners (v1 explícito) */
export const BANNERS_CACHE_VERSION = 1;

/** Clave de meta de sincronización */
export const SYNC_META_KEY = 'sync';

/**
 * Bonus plano de la columna "+55 %" del Hidden Potential, por tablero de
 * potential (`potential_board_id` del datajson).
 *
 * Cada tablero (potential_board_id) define una distribución distinta de nodos
 * y, por tanto, bonus planos distintos para HP, ATK y DEF al 55 %.
 * Mapeo basado en la tabla `potential_boards` del datamine del juego y verificado
 * contra la columna "+55 %" de dokkaninfo.com.
 *
 * Familias de tablero (rangos de ID):
 *  - 10–14: Estándar/Equilibrado
 *  - 20–24, 120–124: Enfoque ATK
 *  - 30–34: Enfoque DEF
 *  - 40–44: Enfoque HP
 *  - 50–54: Enfoque Crítico
 *  - 60–64: Enfoque Evasión
 *  - 70–74: Enfoque Adicional
 *  - Resto: Estándar (fallback 1600/700/700)
 */
export interface PotentialFlatBonus {
  hp: number;
  atk: number;
  def: number;
}

export function potentialFlatBonus(board: number | null | undefined): PotentialFlatBonus {
  if (board == null) return { hp: 1600, atk: 700, def: 700 };

  // Estándar/Equilibrado (10–14): HP 1200, ATK 700, DEF 700
  if (board >= 10 && board <= 14) return { hp: 1200, atk: 700, def: 700 };

  // Enfoque ATK (20–24, 120–124): HP 1000, ATK 1200, DEF 500
  if ((board >= 20 && board <= 24) || (board >= 120 && board <= 124)) return { hp: 1000, atk: 1200, def: 500 };

  // Enfoque DEF (30–34): HP 1000, ATK 500, DEF 1200
  if (board >= 30 && board <= 34) return { hp: 1000, atk: 500, def: 1200 };

  // Enfoque HP (40–44): HP 1600, ATK 500, DEF 500
  if (board >= 40 && board <= 44) return { hp: 1600, atk: 500, def: 500 };

  // Enfoque Crítico (50–54): HP 1000, ATK 700, DEF 700
  if (board >= 50 && board <= 54) return { hp: 1000, atk: 700, def: 700 };

  // Enfoque Evasión (60–64): HP 1000, ATK 700, DEF 700
  if (board >= 60 && board <= 64) return { hp: 1000, atk: 700, def: 700 };

  // Enfoque Adicional (70–74): HP 1000, ATK 700, DEF 700
  if (board >= 70 && board <= 74) return { hp: 1000, atk: 700, def: 700 };

  // Fallback: Estándar
  return { hp: 1600, atk: 700, def: 700 };
}

/** Tipos de evento principales que alimentan la pestaña "Eventos" */
export const MAIN_EVENT_TYPES = ['limited', 'story', 'growth', 'challenge', 'bonus'] as const;