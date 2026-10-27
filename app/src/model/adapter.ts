import type { UnitType, UnitRarity, UnitClass } from './types';

/**
 * Mapeos de presentación de la lista de unidades: URLs de arte (miniaturas,
 * marcos e iconos de tipo/rareza) y colores por tipo.
 *
 * Nota: el ARTE de las unidades (thumbs/marcos/iconos, misma key/art que el
 * juego) se sirve desde el CDN de assets para que el WebView lo cachee y la
 * lista abra instantáneamente incluso sin conexión; todos los DATOS y el resto
 * de imágenes (eventos, banners, noticias, objetos) vienen de dokkaninfo.com.
 */

const CDN = 'https://cdn.dokkan.fyi/assets/en';

/** Índices de tipo en la fuente: 0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY. */
const TYPE_INDEX: Record<UnitType, number> = { AGL: 0, TEQ: 1, INT: 2, STR: 3, PHY: 4 };
/** Índices de clase: 1=Super, 2=Extreme. */
const CLASS_INDEX: Record<UnitClass, number> = { Super: 1, Extreme: 2 };
/** Índices de rareza para los marcos: N=1 … LR=5. */
const RARITY_INDEX: Record<UnitRarity, number> = { N: 1, R: 2, SR: 3, SSR: 3, UR: 4, LR: 5 };

/** Orden de tipos según `element` de dokkaninfo (dígito 2). */
const TYPE_ORDER: UnitType[] = ['AGL', 'TEQ', 'INT', 'STR', 'PHY'];
/** Orden de rarezas según código numérico de dokkaninfo. */
const RARITY_ORDER: UnitRarity[] = ['N', 'R', 'SR', 'SSR', 'UR', 'LR'];

export const TYPE_COLORS: Record<UnitType, string> = {
  AGL: '#1976d2',
  TEQ: '#388e3c',
  INT: '#7b1fa2',
  STR: '#d32f2f',
  PHY: '#f9a825',
};

/**
 * Convierte el `element` numérico de dokkaninfo (p.ej. "10", "21") a tipo.
 * Dígito 2 (unidades): 0=AGL, 1=TEQ, 2=INT, 3=STR, 4=PHY.
 */
export function typeFromElement(element: string | null | undefined): UnitType {
  const digit = Number(String(element ?? '0').slice(-1));
  return TYPE_ORDER[digit] ?? 'AGL';
}

/**
 * Convierte el `element` numérico de dokkaninfo a clase.
 * Dígito 1 (decenas): 1=Super, 2=Extreme (0 → 'Super' por defecto).
 */
export function classFromElement(element: string | null | undefined): UnitClass {
  return Number(String(element ?? '0')[0]) === 2 ? 'Extreme' : 'Super';
}

/** Convierte código numérico de rareza (0-5) a etiqueta. */
export function rarityFromCode(code: number | null | undefined): UnitRarity {
  return RARITY_ORDER[code ?? 3] ?? 'SSR';
}

/** Marco de la tarjeta (fondo con borde según tipo y rareza). */
export function frameUrl(type: UnitType, rarity: UnitRarity): string {
  const t = String(TYPE_INDEX[type]).padStart(2, '0');
  const r = String(RARITY_INDEX[rarity]).padStart(2, '0');
  return `${CDN}/layout/en/image/character_thumb_bg/cha_base_${t}_${r}.png`;
}

/** Miniatura del arte de la tarjeta (recorte cuadrado). */
export function thumbUrl(thumbnailId: number): string {
  return `${CDN}/character/thumb/card_${thumbnailId}_thumb/card_${thumbnailId}_thumb.png`;
}

/**
 * Arte COMPLETO de la ficha (ilustración sin recortar,426×568) — lo sirve la
 * propia fuente (dokkaninfo) porque el CDN de arte no publica esta capa.
 */
export function fullArtUrl(thumbnailId: number): string {
  return `https://dokkaninfo.com/assets/global/en/character/card/${thumbnailId}/${thumbnailId}.png`;
}

/** Icono de tipo+clase (arriba a la derecha de la tarjeta). */
export function typeIconUrl(type: UnitType, unitClass: UnitClass): string {
  const code = CLASS_INDEX[unitClass] * 10 + TYPE_INDEX[type];
  return `${CDN}/layout/en/image/cha_type_icon_${code}.png`;
}

/** Icono de rareza (abajo a la izquierda de la tarjeta). */
export function rarityIconUrl(rarity: UnitRarity): string {
  return `${CDN}/layout/en/image/cha_rare_sm_${rarity.toLowerCase()}.png`;
}

/**
 * Miniatura de una medalla de despertar (`AwakeningItem`) — mismo patrón que
 * las otras URLs de assets; los thumbnails responden 200 en el
 * assets CDN de dokkaninfo.
 */
export function awakeningMedalImg(itemId: number | null | undefined): string | null {
  if (!itemId) return null;
  const p5 = String(itemId).padStart(5, '0');
  return `${CDN}/item/awaken/en/thumb/thumb_awaken_items_${p5}/thumb_awaken_items_${p5}.png`;
}
