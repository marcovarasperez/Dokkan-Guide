import { signal } from '@preact/signals';
import type { UnitSummary, SeedMeta } from './types';
import type { UnitFull } from './detail';
import { parseEpoch } from './date';
import { dbGet, dbSet, STORE_UNITS, STORE_META } from './localDb';
import { SYNC_META_KEY } from './constants';

const UNITS_CACHE_KEY = 'synced-units'; // clave en store 'units'

/**
 * Repositorio en memoria — datos en memoria, sin persistencia local.
 * La semilla (seed) se carga al inicio para mostrar datos instantáneos;
 * la sincronización actualiza desde la red (dokkaninfo.com).
 */

interface NormalizedRecord {
  summary: UnitSummary;
  detail: UnitFull;
  hash: string;
}

interface SyncApplyInput {
  normalized: NormalizedRecord[];
  removedIds: number[];
  syncedAt: number;
  keepDetail?: boolean;
}

interface SyncCounts {
  newUnits: number;
  changedUnits: number;
  freshUnitIds: number[];
}

interface SyncMetaState {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
}

let summaries = new Map<number, UnitSummary>();
let hashes = new Map<number, string>();
let meta = { lastAttemptAt: null as number | null, lastSuccessAt: null as number | null };
let readyPromise: Promise<void> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/** Carga semilla. Debe llamarse una vez al arrancar; idempotente. */
export function loadRepository(): Promise<void> {
  readyPromise ??= loadInternal();
  return readyPromise;
}

interface CachedUnits {
  summaries: [number, UnitSummary][];
  hashes: [number, string][];
  syncedAt: number;
}

async function loadInternal(): Promise<void> {
  // 1) Cargar seed estático + meta del seed
  const [index, seedMeta] = await Promise.all([
    fetchJson<UnitSummary[]>('/data/units.index.json'),
    fetchJson<SeedMeta>('/data/meta.json'),
  ]);

  const seedDate = seedMeta.date ? parseEpoch(seedMeta.date) * 1000 : 0;

  // 2) Intentar leer caché local (IndexedDB)
  const cached = await dbGet<CachedUnits>(STORE_UNITS, UNITS_CACHE_KEY);
  if (cached && cached.syncedAt > seedDate) {
    // Caché más fresca que el seed → usarla
    summaries = new Map(cached.summaries);
    hashes = new Map(cached.hashes);
    meta.lastSuccessAt = cached.syncedAt;
    computeFreshSignal();
    return;
  }

  // 3) Fallback: seed estático
  const convertDates = (u: UnitSummary): UnitSummary => ({
    ...u,
    characterId: u.characterId ?? null,
    isExchangeForm: u.isExchangeForm ?? false,
    releaseDates: {
      initial: parseEpoch(u.releaseDates.initial),
      eza: parseEpoch(u.releaseDates.eza),
      seza: parseEpoch(u.releaseDates.seza),
      latest: parseEpoch(u.releaseDates.latest),
      latestType: u.releaseDates.latestType,
    },
  });

  summaries = new Map();
  hashes = new Map();

  for (const u of index) {
    const converted = convertDates(u);
    summaries.set(converted.id, converted);
    hashes.set(converted.id, seedMeta.hashes[String(converted.id)] ?? '');
  }

  computeFreshSignal();
}

export const getUnits = (): UnitSummary[] => Array.from(summaries.values());
export const getUnit = (id: number): UnitSummary | null => summaries.get(id) ?? null;
export const getHashes = (): Map<number, string> => hashes;
/** Timestamp (ms) de la última sincronización exitosa, o null. */
export const getUpdatedAt = (): number | null => meta.lastSuccessAt;

/* ---------- Unidades "nuevas" (badge en la lista) ---------- */

/** Ids marcados como nuevos: recién añadidos o con EZA/SEZA recién aplicado. */
export const freshIds = signal<ReadonlySet<number>>(new Set());

function lastStateChange(u: UnitSummary): number | null {
  const one = (v: number | null | undefined): number => {
    if (v == null) return -1;
    return v * 1000;
  };
  const t = Math.max(
    one(u.releaseDates.latest ?? u.releaseDates.initial),
    one(u.releaseDates.initial),
    one(u.releaseDates.eza),
    one(u.releaseDates.seza),
  );
  return t > 0 ? t : null;
}

function computeFreshSignal(): void {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  let maxDay = -1;
  const days = new Map<number, number>();
  for (const u of summaries.values()) {
    const t = lastStateChange(u);
    const d = t !== null && t <= now ? Math.floor(t / DAY_MS) : -1;
    days.set(u.id, d);
    if (d > maxDay) maxDay = d;
  }
  const fresh = new Set<number>();
  if (maxDay >= 0) {
    for (const [id, d] of days) if (d === maxDay) fresh.add(id);
  }
  freshIds.value = fresh;
}

/** Aplica el resultado de una sincronización al repositorio. */
export async function applySyncResult(input: SyncApplyInput): Promise<SyncCounts> {
  const freshUnitIds: number[] = [];
  let newUnits = 0;
  let changedUnits = 0;

  for (const rec of input.normalized) {
    const before = summaries.get(rec.summary.id) ?? null;
    const existed = before !== null;
    summaries.set(rec.summary.id, rec.summary);
    hashes.set(rec.summary.id, rec.hash);

    const gainedState =
      before !== null &&
      ((!before.hasEza && rec.summary.hasEza) || (!before.hasSeza && rec.summary.hasSeza));
    if (!existed || gainedState) {
      newUnits++;
      freshUnitIds.push(rec.summary.id);
    } else {
      changedUnits++;
    }
  }

  for (const id of input.removedIds) {
    summaries.delete(id);
    hashes.delete(id);
  }

  computeFreshSignal();
  meta.lastSuccessAt = input.syncedAt;

  // Persistir en IndexedDB para sobrevivir a reinicios
  await dbSet<CachedUnits>(STORE_UNITS, UNITS_CACHE_KEY, {
    summaries: Array.from(summaries.entries()),
    hashes: Array.from(hashes.entries()),
    syncedAt: input.syncedAt,
  });

  return { newUnits, changedUnits, freshUnitIds };
}

/** Unidades para el listado principal: excluye formas intercambiadas/transformadas. */
export function getUnitsForList(): UnitSummary[] {
  return Array.from(summaries.values()).filter((u) => !u.isExchangeForm);
}

/** Throttle de sincronización: persistido en IDB (tienda `meta`, clave
 *  'sync') para que la última fecha conocida sobreviva a recargar la app.
 *  Solo en memoria hasta la primera lectura; IDB best-effort (si no está
 *  disponible se queda en RAM, como antes). */
let metaHydrated = false;

export async function readSyncMeta(): Promise<SyncMetaState> {
  if (!metaHydrated) {
    metaHydrated = true;
    const stored = await dbGet<SyncMetaState>(STORE_META, SYNC_META_KEY);
    if (stored) {
      meta.lastAttemptAt = stored.lastAttemptAt ?? null;
      meta.lastSuccessAt = stored.lastSuccessAt ?? null;
    }
  }
  return { lastAttemptAt: meta.lastAttemptAt, lastSuccessAt: meta.lastSuccessAt };
}

export async function writeSyncMeta(patch: SyncMetaState): Promise<void> {
  meta.lastAttemptAt = patch.lastAttemptAt;
  meta.lastSuccessAt = patch.lastSuccessAt;
  await dbSet<SyncMetaState>(STORE_META, SYNC_META_KEY, {
    lastAttemptAt: meta.lastAttemptAt,
    lastSuccessAt: meta.lastSuccessAt,
  });
}