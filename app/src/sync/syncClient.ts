/**
 * Cliente de sincronización contra dokkaninfo.com (browser / WebView).
 * - Descarga lista maestra /cards (paginada)
 * - Compara ETags con IndexedDB
 * - Descarga solo cartas nuevas/actualizadas (/cards/{id})
 * - Reconstruye índice de categorías y links en memoria
 * - Persiste todo en IndexedDB
 * - Emite eventos: 'sync:start' | 'sync:progress' | 'sync:done' | 'sync:error'
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { UnitSummary } from '../model/types';
import type { CategoriesIndex, CategoryEntry, CategoryLeader } from '../model/wiki';
import type { LinksIndex, LinkEntry } from '../model/wiki';

const DB_NAME = 'dokkan-guide-db';
const DB_VERSION = 1;
const CARD_BASE = 'https://dokkaninfo.com/cards';
const LINKS_URL = 'https://dokkaninfo.com/links';

interface SyncState {
  key: 'state';
  lastFullSync: number;           // timestamp
  cardEtags: Record<string, string>; // id -> etag
  totalCards: number;
  version: number;                // schema version
}

interface CardRecord {
  key: 'card';
  id: number;
  data: UnitSummary;              // ya normalizado
  etag: string;
  fetchedAt: number;
}

interface CategoriesRecord {
  key: 'categories';
  index: CategoriesIndex;
  builtAt: number;
}

interface LinksRecord {
  key: 'links';
  index: LinksIndex;
  builtAt: number;
}

interface MyDBSchema extends DBSchema {
  sync: {
    key: string;
    value: SyncState | CardRecord | CategoriesRecord | LinksRecord;
    indexes: { 'by-type': string };
  };
}

let dbPromise: Promise<IDBPDatabase<MyDBSchema>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MyDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('sync', { keyPath: 'key' });
        store.createIndex('by-type', 'key');
      },
    });
  }
  return dbPromise;
}

// ----- Event bus simple -----
type SyncEventType = 'start' | 'progress' | 'done' | 'error';
type SyncListener = (detail: SyncEvent) => void;

interface SyncEvent {
  type: SyncEventType;
  progress?: { done: number; total: number; current?: string };
  error?: string;
  state?: SyncState;
}

const listeners = new Set<SyncListener>();
function emit(event: SyncEvent) {
  listeners.forEach((l) => l(event));
}
export function onSync(listener: SyncListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ----- Utilidades -----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithETag(url: string, etag?: string) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (etag) headers['If-None-Match'] = etag;
  const res = await fetch(url, { headers });
  if (res.status === 304) return { data: null, etag: res.headers.get('ETag') ?? etag };
  const data = await res.json();
  return { data, etag: res.headers.get('ETag') ?? '' };
}

// ----- Normalización de carta (igual que sync.mjs) -----
function normalizeCard(raw: any): UnitSummary {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    rarity: raw.rarity,
    cost: raw.cost ?? 0,
    hp: raw.hp ?? { min: 0, max: 0 },
    atk: raw.atk ?? { min: 0, max: 0 },
    def: raw.def ?? { min: 0, max: 0 },
    leaderSkill: raw.leader_skill ? {
      name: raw.leader_skill.name,
      effect: raw.leader_skill.effect,
    } : null,
    passiveSkill: raw.passive_skill ? {
      name: raw.passive_skill.name,
      effect: raw.passive_skill.effect,
    } : null,
    activeSkill: raw.active_skill ? {
      name: raw.active_skill.name,
      effect: raw.active_skill.effect,
      ki: raw.active_skill.ki ?? 0,
      turns: raw.active_skill.turns ?? 0,
    } : null,
    superAttack: raw.super_attack ? {
      name: raw.super_attack.name,
      effect: raw.super_attack.effect,
      multiplier: raw.super_attack.multiplier ?? 0,
    } : null,
    links: raw.links ?? [],
    categories: raw.categories ?? [],
    thumbnailId: raw.thumbnail_id ?? raw.id,
    releaseDate: raw.release_date ?? '',
    // transformaciones etc. si vienen
  };
}

// ----- Construir índice de categorías desde las cartas -----
function buildCategoriesIndex(cards: UnitSummary[]): CategoriesIndex {
  const catMap = new Map<number, CategoryEntry>();
  const members: Record<string, number[]> = {};
  const leaders: Record<string, CategoryLeader[]> = {};

  for (const c of cards) {
    for (const cat of c.categories) {
      if (!catMap.has(cat.id)) {
        catMap.set(cat.id, {
          id: cat.id,
          name: cat.name,
          bestLeaderId: null,
          bestLeaderName: null,
        });
        members[String(cat.id)] = [];
        leaders[String(cat.id)] = [];
      }
      members[String(cat.id)].push(c.id);

      // Detectar líder: si leaderSkill menciona la categoría
      if (c.leaderSkill?.effect) {
        const boostMatch = c.leaderSkill.effect.match(/(\d+)%/);
        const boost = boostMatch ? parseInt(boostMatch[1], 10) : null;
        if (c.leaderSkill.effect.includes(cat.name) || c.leaderSkill.effect.includes('Category')) {
          leaders[String(cat.id)].push({ id: c.id, boost });
        }
      }
    }
  }

  // Ordenar líderes por boost desc
  for (const key of Object.keys(leaders)) {
    leaders[key].sort((a, b) => (b.boost ?? 0) - (a.boost ?? 0));
    // Mejor líder
    if (leaders[key][0]) {
      const entry = catMap.get(parseInt(key, 10));
      if (entry) {
        entry.bestLeaderId = leaders[key][0].id;
        const leaderCard = cards.find((u) => u.id === leaders[key][0].id);
        entry.bestLeaderName = leaderCard?.name ?? null;
      }
    }
  }

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source: 'dokkaninfo.com (client-sync)',
    categories: Array.from(catMap.values()),
    leaders,
    members,
  };
}

// ----- Construir índice de links -----
async function buildLinksIndex(): Promise<LinksIndex> {
  const { data } = await fetchWithETag(LINKS_URL);
  if (!data) throw new Error('No se pudo obtener links');
  const links: LinkEntry[] = data.map((l: any) => ({
    id: l.id,
    name: l.name,
    lv1: l.level_1 ?? l.lv1 ?? '',
    lv10: l.level_10 ?? l.lv10 ?? '',
  }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'dokkaninfo.com/links',
    links,
  };
}

// ----- SINCRONIZACIÓN PRINCIPAL -----
export async function runFullSync(force = false) {
  emit({ type: 'start' });
  const db = await getDB();

  let state = (await db.get('sync', 'state')) as SyncState | undefined;
  const now = Date.now();

  if (!force && state && now - state.lastFullSync < 1000 * 60 * 60 * 6) {
    // Sync reciente (< 6h) → solo diff
    await runIncrementalSync(state);
    return;
  }

  // --- Full sync ---
  emit({ type: 'progress', progress: { done: 0, total: 1, current: 'Obteniendo lista maestra…' } });

  // 1. Obtener lista paginada de cartas
  const allCards: UnitSummary[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${CARD_BASE}?page=${page}&limit=100`;
    const { data, etag } = await fetchWithETag(url);
    if (!data?.cards?.length) break;

    for (const raw of data.cards) {
      allCards.push(normalizeCard(raw));
    }

    hasMore = data.cards.length === 100;
    page++;
    emit({ type: 'progress', progress: { done: allCards.length, total: data.total ?? allCards.length, current: `Página ${page - 1}` } });
    await sleep(50); // ser educados
  }

  // 2. Guardar cartas + etags
  const tx = db.transaction('sync', 'readwrite');
  const cardEtags: Record<string, string> = {};
  for (const card of allCards) {
    // No tenemos etag por carta en la lista, usamos timestamp
    cardEtags[String(card.id)] = String(now);
    await tx.store.put({
      key: 'card',
      id: card.id,
      data: card,
      etag: String(now),
      fetchedAt: now,
    } as CardRecord);
  }
  await tx.done;

  // 3. Construir y guardar categorías
  emit({ type: 'progress', progress: { done: allCards.length, total: allCards.length, current: 'Construyendo categorías…' } });
  const catsIndex = buildCategoriesIndex(allCards);
  await db.put('sync', { key: 'categories', index: catsIndex, builtAt: now } as CategoriesRecord);

  // 4. Links
  emit({ type: 'progress', progress: { done: allCards.length, total: allCards.length, current: 'Descargando links…' } });
  const linksIndex = await buildLinksIndex();
  await db.put('sync', { key: 'links', index: linksIndex, builtAt: now } as LinksRecord);

  // 5. Actualizar estado
  state = {
    key: 'state',
    lastFullSync: now,
    cardEtags,
    totalCards: allCards.length,
    version: DB_VERSION,
  };
  await db.put('sync', state);

  emit({ type: 'done', state });
}

// ----- SYNC INCREMENTAL (solo cartas nuevas/cambiadas) -----
async function runIncrementalSync(state: SyncState) {
  const db = await getDB();
  emit({ type: 'progress', progress: { done: 0, total: 1, current: 'Comprobando actualizaciones…' } });

  const { data: listData } = await fetchWithETag(`${CARD_BASE}?page=1&limit=100`);
  if (!listData?.cards?.length) {
    emit({ type: 'error', error: 'Lista maestra vacía' });
    return;
  }

  const newCards: UnitSummary[] = [];
  const updatedEtags = { ...state.cardEtags };
  let changed = 0;

  for (const raw of listData.cards) {
    const idStr = String(raw.id);
    const newEtag = String(raw.updated_at ?? Date.now()); // aproximación
    if (!state.cardEtags[idStr] || state.cardEtags[idStr] !== newEtag) {
      // Nueva o modificada → descargar detalle
      const { data: cardData } = await fetchWithETag(`${CARD_BASE}/${raw.id}`);
      if (cardData) {
        newCards.push(normalizeCard(cardData));
        updatedEtags[idStr] = newEtag;
        changed++;
      }
    }
    await sleep(30);
  }

  if (changed === 0) {
    emit({ type: 'done', state });
    return;
  }

  // Merge con cartas existentes
  const allCards: UnitSummary[] = [];
  const cursor = db.transaction('sync').store.index('by-type').openCursor('card');
  for await (const c of cursor) {
    if (c.value.key === 'card') allCards.push(c.value.data);
  }
  // Reemplazar/añadir
  const byId = new Map(allCards.map((c) => [c.id, c]));
  for (const nc of newCards) byId.set(nc.id, nc);
  const merged = Array.from(byId.values());

  // Reconstruir índices
  emit({ type: 'progress', progress: { done: changed, total: changed, current: 'Reconstruyendo índices…' } });
  const catsIndex = buildCategoriesIndex(merged);
  await db.put('sync', { key: 'categories', index: catsIndex, builtAt: Date.now() } as CategoriesRecord);

  // Actualizar estado
  state.lastFullSync = Date.now();
  state.cardEtags = updatedEtags;
  state.totalCards = merged.length;
  await db.put('sync', state);

  emit({ type: 'done', state });
}

// ----- API PÚBLICA DE LECTURA (para wiki.ts / detail.ts) -----
export async function getUnitsFromCache(): Promise<UnitSummary[]> {
  const db = await getDB();
  const cards: UnitSummary[] = [];
  const cursor = db.transaction('sync').store.index('by-type').openCursor('card');
  for await (const c of cursor) {
    if (c.value.key === 'card') cards.push(c.value.data);
  }
  return cards;
}

export async function getCategoriesIndexFromCache(): Promise<CategoriesIndex | null> {
  const db = await getDB();
  const rec = await db.get('sync', 'categories');
  return (rec as CategoriesRecord)?.index ?? null;
}

export async function getLinksIndexFromCache(): Promise<LinksIndex | null> {
  const db = await getDB();
  const rec = await db.get('sync', 'links');
  return (rec as LinksRecord)?.index ?? null;
}

export async function getSyncState(): Promise<SyncState | null> {
  const db = await getDB();
  return (await db.get('sync', 'state')) as SyncState | null;
}

// ----- Inicialización: si no hay datos, hacer full sync en background -----
export async function ensureDataReady() {
  const state = await getSyncState();
  if (!state || state.totalCards === 0) {
    // Primera vez → full sync silencioso
    runFullSync().catch((e) => emit({ type: 'error', error: e.message }));
  }
}