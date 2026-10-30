/**
 * Semillas de la wiki del juego (IndexedDB → cache local actualizado por syncClient),
 * con fallback a los JSON embebidos en la build (public/data/*.json).
 *
 * Flujo:
 *  1. Intenta leer de IndexedDB (datos frescos sincronizados desde dokkaninfo.com)
 *  2. Si no hay nada (primera ejecución sin sync), cae a fetch('/data/*.json')
 *  3. Cachea la promesa para no leer dos veces.
 */

import type { LinksIndex, LinkEntry, CategoriesIndex, CategoryEntry, CategoryLeader } from './wiki';
import { getCategoriesIndexFromCache, getLinksIndexFromCache, getUnitsFromCache, ensureDataReady } from '../sync/syncClient';

// ---- Links ----
let linksPromise: Promise<LinksIndex | null> | null = null;

export async function loadLinksIndex(): Promise<LinksIndex | null> {
  // 1. IndexedDB (sync cliente)
  const cached = await getLinksIndexFromCache();
  if (cached) return cached;

  // 2. Fallback: JSON embebido
  linksPromise ??= fetch('/data/links.index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return linksPromise;
}

// ---- Categorías ----
let catsPromise: Promise<CategoriesIndex | null> | null = null;

export async function loadCategoriesIndex(): Promise<CategoriesIndex | null> {
  // 1. IndexedDB (sync cliente)
  const cached = await getCategoriesIndexFromCache();
  if (cached) return cached;

  // 2. Fallback: JSON embebido
  catsPromise ??= fetch('/data/categories.index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return catsPromise;
}

// ---- Units (para la lista principal) ----
let unitsPromise: Promise<UnitSummary[]> | null = null;

export interface UnitSummary {
  id: number;
  name: string;
  type: string;
  rarity: string;
  cost: number;
  hp: { min: number; max: number };
  atk: { min: number; max: number };
  def: { min: number; max: number };
  leaderSkill: { name: string; effect: string } | null;
  passiveSkill: { name: string; effect: string } | null;
  activeSkill: { name: string; effect: string; ki: number; turns: number } | null;
  superAttack: { name: string; effect: string; multiplier: number } | null;
  links: number[];
  categories: { id: number; name: string }[];
  thumbnailId: number;
  releaseDate: string;
}

export async function loadUnitsIndex(): Promise<UnitSummary[]> {
  // 1. IndexedDB (sync cliente)
  const cached = await getUnitsFromCache();
  if (cached.length) return cached;

  // 2. Fallback: JSON embebido
  unitsPromise ??= fetch('/data/units.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return unitsPromise;
}

// Inicializar sync en background al importar este módulo
ensureDataReady().catch(() => { /* silencioso */ });