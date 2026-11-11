/**
 * Constantes compartidas — evita duplicados entre módulos.
 *
 * Solo se incluyen las que se importan desde otros módulos. Las constantes
 * con un único consumidor (o con valores específicos por módulo) viven en su
 * propio fichero para no acoplar.
 */

/** CDN base de dokkaninfo.com */
export const INFO_CDN = 'https://dokkaninfo.com';

/** Ruta de assets global/en de dokkaninfo (datos, arte e iconos) */
export const INFO_ASSET = `${INFO_CDN}/assets/global/en`;

/** Máximo de fichas descargadas por corrida de sync (típico: 0-5 cambios/día) */
export const MAX_FETCHES_PER_RUN = 15;

/** Clave de meta de sincronización */
export const SYNC_META_KEY = 'sync';

/**
 * Bonus plano de la columna "55 %" del Hidden Potential, por tablero de
 * potential (`potential_board_id` del datajson).
 *
 * Copia EXACTA de la regla de dokkaninfo.com (bundle app.js, tabla de stats
 * de la ficha): el MISMO bonus se suma a HP, ATK y DEF:
 *   - tablero 10–14            → +1200
 *   - tablero 20–24 o 120–124  → +2000
 *   - tablero 30–34            → +2800
 *   - cualquier otro / sin dato → +1600
 * (La versión anterior usaba valores distintos por stat que no salían de la
 * fuente y daban cifras erróneas en la columna 55 %.)
 */
export interface PotentialFlatBonus {
  hp: number;
  atk: number;
  def: number;
}

export function potentialFlatBonus(board: number | null | undefined): PotentialFlatBonus {
  const b = board ?? -1;
  const v =
    b >= 10 && b <= 14
      ? 1200
      : (b >= 20 && b <= 24) || (b >= 120 && b <= 124)
        ? 2000
        : b >= 30 && b <= 34
          ? 2800
          : 1600;
  return { hp: v, atk: v, def: v };
}
