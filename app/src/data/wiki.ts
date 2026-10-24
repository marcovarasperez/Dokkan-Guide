/**
 * Semillas de la wiki del juego (tools/wiki_sync.mjs), carga perezosa y
 * cacheada como hidden_potential.json:
 *
 *  - links.index.json      → efectos de cada link skill a Nv.1 y Nv.10
 *                            (dokkaninfo.com/links); los chips de la ficha
 *                            muestran el efecto a Nv.10 al pulsarlos.
 *  - categories.index.json → categorías con sus líderes (con boost) y sus
 *                            personajes por id (dokkan.fyi); el fichero solo
 *                            guarda ids y los datos salen del índice local.
 */

export interface LinkEntry {
  id: number;
  name: string;
  lv1: string;
  lv10: string;
}

export interface LinksIndex {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  links: LinkEntry[];
}

export interface CategoryEntry {
  id: number;
  name: string;
  bestLeaderId: number | null;
  bestLeaderName: string | null;
}

export interface CategoryLeader {
  id: number;
  /** Boost máximo del leader skill ("+200%"); null si no se pudo leer. */
  boost: number | null;
}

export interface CategoriesIndex {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  categories: CategoryEntry[];
  /** catId → líderes (ordenados por boost desc). */
  leaders: Record<string, CategoryLeader[]>;
  /** catId → ids de los personajes de la categoría. */
  members: Record<string, number[]>;
}

let linksPromise: Promise<LinksIndex | null> | null = null;
let catsPromise: Promise<CategoriesIndex | null> | null = null;

/** Carga (una sola vez) el índice de links; null si el fichero falta. */
export function loadLinksIndex(): Promise<LinksIndex | null> {
  linksPromise ??= fetch('/data/links.index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return linksPromise;
}

/** Carga (una sola vez) el índice de categorías; null si el fichero falta. */
export function loadCategoriesIndex(): Promise<CategoriesIndex | null> {
  catsPromise ??= fetch('/data/categories.index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return catsPromise;
}
