/**
 * Semillas de la wiki del juego (links y categorías) desde los JSON empaquetados.
 *
 * Estos índices los genera `tools/wiki_sync.mjs` (links) y
 * `tools/categories_sync.mjs` (categorías) contra dokkaninfo.com y se sirven
 * desde `public/data/*.json` como parte de la build. Son estáticos: se
 * refrescan al recompilar la app, no en caliente.
 *
 * Cada promesa se cachea para no leer dos veces.
 */

import type { LinksIndex, CategoriesIndex } from './types';

// ---- Links ----
let linksPromise: Promise<LinksIndex | null> | null = null;

export async function loadLinksIndex(): Promise<LinksIndex | null> {
  linksPromise ??= fetch('/data/links.index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return linksPromise;
}

// ---- Categorías ----
let catsPromise: Promise<CategoriesIndex | null> | null = null;

export async function loadCategoriesIndex(): Promise<CategoriesIndex | null> {
  catsPromise ??= fetch('/data/categories.index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return catsPromise;
}
