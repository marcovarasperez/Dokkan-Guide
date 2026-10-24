import { signal } from '@preact/signals';
import type { UnitSummary, SeedMeta } from './types';
import type { UnitFull } from './detail';
import {
  dbDelete,
  dbGet,
  dbGetAll,
  dbSet,
  STORE_META,
  STORE_UNITS,
} from './localDb';

/**
 * Repositorio local de datos — todo vive en la BASE DE DATOS local
 * (IndexedDB, ver localDb.ts). Sin metadatos sensibles: solo datos del
 * juego y timestamps internos de control; nada sale de este dispositivo.
 *
 *   units → resumen + hash por unidad (clave id): lo que la sincronización
 *           detecta de dokkaninfo (nuevas/modificadas/eliminadas) se encima
 *           a la semilla empaquetada en /data.
 *   meta  → estado de sincronización: última sync, throttle (1 intento por
 *           apertura, ≥15 min) y bajas.
 *   fresh → reservada: el badge "NUEVA" se deriva de las fechas de las
 *           propias unidades (sin estado aparte).
 *
 * La semilla (seed) se mantiene empaquetada para abrir instantáneamente y
 * como línea base offline; la BD aporta lo detectado en caliente. Si
 * IndexedDB no está disponible (modo privado...), todo cae a localStorage
 * — nunca a la red.
 *
 * El detalle completo (UnitFull) vive también en la BD (details, detail.ts);
 * aquí solo se lleva su hash vigente para invalidarlo al cambiar los datos.
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
  /** Lo marcan los feeds que solo traen resúmenes (datamine/dokkan.fyi): en
   *  ese caso la ficha completa NO se escribe en la BD (ver sync.ts). */
  keepDetail?: boolean;
}

interface SyncCounts {
  newUnits: number;
  changedUnits: number;
  freshUnitIds: number[];
}

interface UnitRow {
  summary: UnitSummary;
  hash: string;
  updatedAt: number | null;
}

interface MetaState {
  schemaVersion: 1;
  /** Unidades dadas de baja en dokkaninfo (no se muestran aunque estén en la semilla). */
  removed: number[];
  updatedAt: number | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
}

interface SyncMetaState {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
}

/** Delta previo en localStorage (legacy): origen de migración y fallback. */
interface LegacyDelta {
  schemaVersion: 1;
  hashes: Record<string, string>;
  overrides: Record<string, { summary: UnitSummary; detail?: UnitFull }>;
  removed: number[];
  updatedAt: number | null;
}

const LEGACY_DELTA_KEY = 'dk.delta.v1';
const LEGACY_SYNC_META_KEY = 'dk.syncmeta.v1';
const META_KEY = 'sync';

function defaultMeta(): MetaState {
  return { schemaVersion: 1, removed: [], updatedAt: null, lastAttemptAt: null, lastSuccessAt: null };
}

let summaries = new Map<number, UnitSummary>();
let hashes = new Map<number, string>();
let unitRows = new Map<number, UnitRow>();
let meta: MetaState = defaultMeta();
let stateLoaded = false;
let useLocalFallback = false;
let readyPromise: Promise<void> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/* ---------- localStorage legacy: migración (una vez) + fallback ---------- */

function readLegacyDelta(): LegacyDelta | null {
  try {
    const raw = localStorage.getItem(LEGACY_DELTA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LegacyDelta;
      if (parsed?.schemaVersion === 1) return parsed;
    }
  } catch {
    /* delta corrupto → se ignora (el seed sigue siendo válido) */
  }
  return null;
}

function readLegacyMeta(): SyncMetaState | null {
  try {
    const raw = localStorage.getItem(LEGACY_SYNC_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SyncMetaState;
      return { lastAttemptAt: parsed.lastAttemptAt ?? null, lastSuccessAt: parsed.lastSuccessAt ?? null };
    }
  } catch {
    /* ignorar */
  }
  return null;
}

/** Vuelca el estado a localStorage cuando la BD no está disponible. */
function mirrorLegacy(): void {
  try {
    const hashesRec: Record<string, string> = {};
    const overrides: Record<string, { summary: UnitSummary; detail?: UnitFull }> = {};
    for (const [id, row] of unitRows) {
      hashesRec[String(id)] = row.hash;
      overrides[String(id)] = { summary: row.summary };
    }
    localStorage.setItem(
      LEGACY_DELTA_KEY,
      JSON.stringify({
        schemaVersion: 1,
        hashes: hashesRec,
        overrides,
        removed: meta.removed,
        updatedAt: meta.updatedAt,
      } satisfies LegacyDelta),
    );
    localStorage.setItem(
      LEGACY_SYNC_META_KEY,
      JSON.stringify({ lastAttemptAt: meta.lastAttemptAt, lastSuccessAt: meta.lastSuccessAt }),
    );
  } catch {
    /* sin espacio: el seed sigue siendo válido */
  }
}

/** Carga el estado desde localStorage (modo fallback o migración inicial). */
function loadLegacyIntoMemory(): void {
  unitRows = new Map();
  meta = defaultMeta();
  const legacy = readLegacyDelta();
  if (legacy) {
    for (const key of Object.keys(legacy.overrides)) {
      const id = Number(key);
      const s = legacy.overrides[key]?.summary;
      if (Number.isFinite(id) && s) {
        unitRows.set(id, { summary: s, hash: legacy.hashes[key] ?? '', updatedAt: legacy.updatedAt });
      }
    }
    meta.removed = [...legacy.removed];
    meta.updatedAt = legacy.updatedAt;
  }
  const lm = readLegacyMeta();
  if (lm) {
    meta.lastAttemptAt = lm.lastAttemptAt;
    meta.lastSuccessAt = lm.lastSuccessAt;
  }
}

/* ---------- Persistencia (BD primero; si no va, localStorage) ---------- */

/** Persiste las filas afectadas + el registro de meta. Mejor esfuerzo. */
async function persistState(dirtyIds: number[], removedIds: number[]): Promise<void> {
  if (useLocalFallback) {
    mirrorLegacy();
    return;
  }
  let ok = true;
  for (const id of dirtyIds) {
    const row = unitRows.get(id);
    if (row) ok = (await dbSet(STORE_UNITS, id, row)) && ok;
  }
  for (const id of removedIds) ok = (await dbDelete(STORE_UNITS, id)) && ok;
  ok = (await dbSet(STORE_META, META_KEY, meta)) && ok;
  if (!ok) {
    useLocalFallback = true;
    mirrorLegacy();
  }
}

async function persistMeta(): Promise<void> {
  if (useLocalFallback) {
    mirrorLegacy();
    return;
  }
  const ok = await dbSet(STORE_META, META_KEY, meta);
  if (!ok) {
    useLocalFallback = true;
    mirrorLegacy();
  }
}

/* ---------- Carga ---------- */

async function loadState(): Promise<void> {
  const rows = await dbGetAll<UnitRow>(STORE_UNITS);
  if (rows === null) {
    // IndexedDB no disponible → modo localStorage.
    useLocalFallback = true;
    loadLegacyIntoMemory();
    stateLoaded = true;
    return;
  }

  unitRows = new Map(rows.map((r) => [r.summary.id, r]));
  const metaRow = await dbGet<MetaState>(STORE_META, META_KEY);

  if (metaRow) {
    meta = { ...defaultMeta(), ...metaRow };
    stateLoaded = true;
    return;
  }

  if (rows.length > 0) {
    // Filas ya en BD sin registro de meta (escritura interrumpida): se
    // conservan las filas y solo se recupera el throttle de localStorage.
    const lm = readLegacyMeta();
    if (lm) {
      meta.lastAttemptAt = lm.lastAttemptAt;
      meta.lastSuccessAt = lm.lastSuccessAt;
    }
    stateLoaded = true;
    void persistMeta();
    return;
  }

  // Primera ejecución con BD: migrar el overlay previo de localStorage.
  loadLegacyIntoMemory();
  stateLoaded = true;
  void persistState([...unitRows.keys()], meta.removed);
}

/* ---------- API ---------- */

/** Carga semilla + base de datos. Debe llamarse una vez al arrancar; idempotente. */
export function loadRepository(): Promise<void> {
  readyPromise ??= loadInternal();
  return readyPromise;
}

/** Resuelve cuando el repositorio está cargado (la sincronización espera a esto).
 *  Si nadie lanzó aún la carga, se lanza aquí: la sync jamás debe correr
 *  contra un repositorio en memoria vacío. */
export function repositoryReady(): Promise<void> {
  readyPromise ??= loadInternal();
  return readyPromise;
}

async function loadInternal(): Promise<void> {
  const [index, seedMeta] = await Promise.all([
    fetchJson<UnitSummary[]>('/data/units.index.json'),
    fetchJson<SeedMeta>('/data/meta.json'),
  ]);
  await loadState();

  summaries = new Map();
  hashes = new Map();

  const removed = new Set(meta.removed);
  for (const u of index) {
    if (removed.has(u.id)) continue;
    const row = unitRows.get(u.id);
    summaries.set(u.id, row?.summary ?? u);
    hashes.set(u.id, row?.hash ?? seedMeta.hashes[String(u.id)] ?? '');
  }
  // Unidades nuevas detectadas en caliente (no presentes en la semilla).
  for (const [id, row] of unitRows) {
    if (!summaries.has(id) && !removed.has(id)) {
      summaries.set(id, row.summary);
      hashes.set(id, row.hash);
    }
  }

  computeFreshSignal();
}

export const getUnits = (): UnitSummary[] => Array.from(summaries.values());
export const getUnit = (id: number): UnitSummary | null => summaries.get(id) ?? null;
export const getHashes = (): Map<number, string> => hashes;
/** Timestamp (ms) de la última sincronización exitosa, o null. */
export const getUpdatedAt = (): number | null => meta.updatedAt;

/* ---------- Unidades "nuevas" (badge en la lista) ---------- */

/** Ids marcados como nuevos: recién añadidos o con EZA/SEZA recién aplicado. */
export const freshIds = signal<ReadonlySet<number>>(new Set());

/**
 * Instante (ms) de la ÚLTIMA NOVEDAD de la unidad: estreno, EZA o SEZA
 * (el mayor de los tres). Así un EZA/SEZA recién aplicado —o un estreno de
 * hace días— queda marcado como NUEVA dentro del TTL de 14 días.
 */
function lastStateChange(u: UnitSummary): number | null {
  const one = (v: string | number | null | undefined): number => {
    if (v == null) return -1;
    const t = typeof v === 'number' ? v * 1000 : Date.parse(v);
    return Number.isNaN(t) ? -1 : t;
  };
  const t = Math.max(
    one(u.releaseDates.latest ?? u.releaseDates.initial),
    one(u.releaseDates.initial),
    one(u.releaseDates.eza),
    one(u.releaseDates.seza),
  );
  return t > 0 ? t : null;
}

/**
 * Recalcula el badge "NUEVA": lo muestra el contenido del DÍA con la
 * novedad más reciente — es decir, lo último que el juego ha implementado
 * (personaje nuevo, EZA o SEZA). Sin intervalos de tiempo: el badge no
 * caduca solo; se quita cuando sale algo con fecha de novedad más nueva.
 */
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

/** Aplica el resultado de una sincronización al repositorio y lo persiste.
 *  La persistencia se ESPERA: si la página se recarga con la escritura en
 *  vuelo, IndexedDB cancela las transacciones y las filas nuevas se pierden
 *  (la siguiente carga arrancaría vacía y la lista bajaría de golpe). */
export async function applySyncResult(input: SyncApplyInput): Promise<SyncCounts> {
  const freshUnitIds: number[] = [];
  let newUnits = 0;
  let changedUnits = 0;

  for (const rec of input.normalized) {
    const before = summaries.get(rec.summary.id) ?? null;
    const existed = before !== null;
    summaries.set(rec.summary.id, rec.summary);
    hashes.set(rec.summary.id, rec.hash);
    unitRows.set(rec.summary.id, { summary: rec.summary, hash: rec.hash, updatedAt: input.syncedAt });
    // Una unidad dada de baja que vuelve a aparecer deja de estarlo.
    if (meta.removed.includes(rec.summary.id)) {
      meta.removed = meta.removed.filter((x) => x !== rec.summary.id);
    }
    // Un EZA/SEZA recién aplicado cuenta como NUEVO (badge "NUEVA" incluido).
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
    unitRows.delete(id);
    if (!meta.removed.includes(id)) meta.removed.push(id);
  }

  computeFreshSignal();
  meta.updatedAt = input.syncedAt;
  await persistState(
    input.normalized.map((r) => r.summary.id),
    input.removedIds,
  );
  return { newUnits, changedUnits, freshUnitIds };
}

/** Throttle de sincronización (1 intento por apertura, ≥15 min entre intentos). */
export async function readSyncMeta(): Promise<SyncMetaState> {
  if (!useLocalFallback) {
    const m = await dbGet<MetaState>(STORE_META, META_KEY);
    if (m) return { lastAttemptAt: m.lastAttemptAt ?? null, lastSuccessAt: m.lastSuccessAt ?? null };
  }
  return readLegacyMeta() ?? { lastAttemptAt: null, lastSuccessAt: null };
}

export async function writeSyncMeta(patch: SyncMetaState): Promise<void> {
  if (stateLoaded) {
    meta.lastAttemptAt = patch.lastAttemptAt;
    meta.lastSuccessAt = patch.lastSuccessAt;
    await persistMeta();
    return;
  }
  // El repositorio aún no cargó: leer-modificar-escribir el registro de meta
  // para no pisar el resto del estado que se cargará después.
  if (!useLocalFallback) {
    const current = await dbGet<MetaState>(STORE_META, META_KEY);
    if (current) {
      current.lastAttemptAt = patch.lastAttemptAt;
      current.lastSuccessAt = patch.lastSuccessAt;
      if (await dbSet(STORE_META, META_KEY, current)) return;
      useLocalFallback = true;
    }
  }
  const lm = readLegacyMeta() ?? { lastAttemptAt: null, lastSuccessAt: null };
  lm.lastAttemptAt = patch.lastAttemptAt;
  lm.lastSuccessAt = patch.lastSuccessAt;
  try {
    localStorage.setItem(LEGACY_SYNC_META_KEY, JSON.stringify(lm));
  } catch {
    /* ignorar */
  }
}
