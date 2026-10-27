import { signal } from '@preact/signals';
import type { SyncState, UnitSummary } from './types';
import { fetchInfoText } from './http';
import { parseCardsIndex, parseCardPage } from './dinfo';
import { rarityFromCode, typeFromElement } from './adapter';
import type { DkCardRow } from './dinfo';
import { cacheDetail, fullFromCardPage, loadDropsIndex, loadZbattlesIndex, summaryFromCardPage } from './detail';
import { refreshNews } from './news';
import { datamineEnabled, syncFromDatamine } from './datamine';
import { syncFromFyi } from './fyi';
import {
  getUnits, applySyncResult, readSyncMeta, writeSyncMeta, repositoryReady,
} from './repository';
import { hashCardRow } from './hash';
import { datePart } from './date';
import { CHECK_INTERVAL_MS, AUTO_REFRESH_MS, MAX_FETCHES_PER_RUN } from './constants';

/**
 * Servicio de sincronización incremental.
 *
 * Estrategia (prioridad de fuentes):
 *  0. Feed datamine (JSON propio publicado) — cuando está configurado;
 *  1. dokkan.fyi (fuente primaria, sin Cloudflare → sin errores 403);
 *  2. dokkaninfo.com (respaldo, con reintentos ante 403/429).
 *
 * Flujo de catálogo (fuentes 1‑2):
 *  a. descargar el catálogo completo de la fuente activa;
 *  b. comparar cada registro con el resumen vigente del repositorio (nombre,
 *     rareza, tipo, level, stats, fechas, flags EZA/SEZA) — los que
 *     cambiaron (o son nuevos) marcan la unidad como desactualizada;
 *  c. para esas unidades (máximo MAX_FETCHES por corrida, nuevas primero)
 *     descargar la ficha completa y persistirla en la base de datos local.
 *
 * El hash de fila invalida la caché de detalle (IndexedDB) de la unidad.
 * Política: como máximo 1 comprobación por apertura (o vuelta de background)
 * y ≥2 minutos entre intentos. Fallos silenciosos: sin excepciones a pantalla.
 */

export const syncState = signal<SyncState>({
  phase: 'idle',
  message: '',
  lastSuccessAt: null,
  newUnits: 0,
  changedUnits: 0,
  freshUnitIds: [],
});

const idleState = (lastSuccessAt: number | null): SyncState => ({
  phase: 'idle',
  message: '',
  lastSuccessAt,
  newUnits: 0,
  changedUnits: 0,
  freshUnitIds: [],
});

/** Hash estable de una fila del catálogo (FNV-1a sobre los campos usados). */
function rowHash(r: DkCardRow): string {
  return hashCardRow(r);
}

/** ¿La fila del catálogo difiere del resumen vigente? */
function rowDiffers(s: UnitSummary, r: DkCardRow): boolean {
  return (
    s.name !== r.name ||
    s.rarity !== rarityFromCode(r.rarity) ||
    s.type !== typeFromElement(r.element) ||
    s.maxLevel !== (r.lv_max ?? 0) ||
    s.maxSALevel !== (r.skill_lv_max ?? 0) ||
    s.thumbnailId !== (r.icon_id ?? r.id) ||
    s.stats.hp.base !== (r.hp_init ?? 0) ||
    s.stats.hp.max !== (r.hp_max ?? 0) ||
    s.stats.atk.base !== (r.atk_init ?? 0) ||
    s.stats.atk.max !== (r.atk_max ?? 0) ||
    s.stats.def.base !== (r.def_init ?? 0) ||
    s.stats.def.max !== (r.def_max ?? 0) ||
    // Gains de HiPo del resumen (cuando los conoce) frente a los de la fila.
    (s.hpGains != null &&
      (s.hpGains.hp !== (r.hp_hipo ?? 0) - (r.hp_max ?? 0) ||
        s.hpGains.atk !== (r.atk_hipo ?? 0) - (r.atk_max ?? 0) ||
        s.hpGains.def !== (r.def_hipo ?? 0) - (r.def_max ?? 0))) ||
    s.hasEza !== (r.eza === 1) ||
    s.hasSeza !== (r.seza === 1) ||
    datePart(s.releaseDates.initial) !== datePart(r.open_at) ||
    // Fechas de EZA/SEZA: su aparición o cambio re-sincroniza la ficha
    // (una unidad con EZA recién aplicado se cuenta como nueva en applySyncResult).
    datePart(s.releaseDates.eza) !== datePart(r.eza_open_at) ||
    datePart(s.releaseDates.seza) !== datePart(r.seza_open_at)
  );
}

/** ¿La fila introduce o cambia un EZA/SEZA (información nueva de estado)? */
function stateChangeDiffers(s: UnitSummary, r: DkCardRow): boolean {
  return (
    s.hasEza !== (r.eza === 1) ||
    s.hasSeza !== (r.seza === 1) ||
    datePart(s.releaseDates.eza) !== datePart(r.eza_open_at) ||
    datePart(s.releaseDates.seza) !== datePart(r.seza_open_at)
  );
}

/**
 * Nuevas unidades SSR+ no especulares (los espejos 9xxxxxx se excluyen).
 *
 * Se excluyen también las VARIANTES SIN PÁGINA: si `icon_id` apunta a otra
 * fila del catálogo, dokkaninfo redirige `/cards/{id}` con HTTP 302 (es el
 * mismo personaje en otro estado). Metidas en la cola consumían las 12
 * descargas de cada corrida sin resultado y bloqueaban los cambios reales
 * (p. ej. un EZA/SEZA recién aplicado) para siempre.
 */
const isNewCandidate = (r: DkCardRow, known: Set<number>, catalogIds: Set<number>): boolean => {
  const icon = r.icon_id ?? r.id;
  const variant = icon !== r.id && catalogIds.has(icon);
  return (
    !known.has(r.id) &&
    !variant &&
    r.rarity >= 3 &&
    !String(r.id).startsWith('9') &&
    (r.open_at ?? 0) < Date.now() / 1000
  );
}

/** Resultado de la comparación de catálogo contra unidades conocidas. */
interface CatalogDiff {
  stateChanged: DkCardRow[];
  changed: DkCardRow[];
  added: DkCardRow[];
}

/** Categoriza las filas del catálogo según su estado respecto a lo conocido. */
function categorizeCatalogRows(rows: DkCardRow[]): CatalogDiff {
  const known = new Map(getUnits().map((u) => [u.id, u]));
  const knownIds = new Set(known.keys());
  const catalogIds = new Set(rows.map((r) => r.id));

  const stateChanged: DkCardRow[] = [];
  const changed: DkCardRow[] = [];
  const added: DkCardRow[] = [];

  for (const row of rows) {
    const current = known.get(row.id);
    if (current) {
      if (stateChangeDiffers(current, row)) stateChanged.push(row);
      else if (rowDiffers(current, row)) changed.push(row);
    } else if (isNewCandidate(row, knownIds, catalogIds)) {
      added.push(row);
    }
  }
  return { stateChanged, changed, added };
}

/** Construye la cola de descarga priorizando: stateChanged > changed > added. */
function buildFetchQueue(diff: CatalogDiff): { queue: DkCardRow[]; leftOver: number } {
  const pendingTotal = diff.stateChanged.length + diff.changed.length + diff.added.length;
  const queue = [...diff.stateChanged, ...diff.changed, ...diff.added].slice(0, MAX_FETCHES_PER_RUN);
  const leftOver = pendingTotal - queue.length;
  return { queue, leftOver };
}

/** Descarga y normaliza las fichas completas para la cola de unidades. */
async function fetchAndNormalizeDetails(queue: DkCardRow[]): Promise<NormalizedUnit[]> {
  const dropsIndex = await loadDropsIndex();
  const zbIndex = await loadZbattlesIndex();
  const normalized: NormalizedUnit[] = [];

  for (const row of queue) {
    try {
      const page = parseCardPage(await fetchInfoText(`/cards/${row.id}`));
      if (!page) continue;
      const summary = summaryFromCardPage(row.id, page, {
        hasEza: row.eza === 1,
        hasSeza: row.seza === 1,
        openAt: row.open_at,
        ezaOpenAt: row.eza_open_at,
        sezaOpenAt: row.seza_open_at,
      });
      normalized.push({ summary, detail: fullFromCardPage(page, dropsIndex, zbIndex), hash: rowHash(row) });
    } catch {
      /* unidad puntual: se reintenta en la próxima corrida */
    }
  }
  return normalized;
}

interface NormalizedUnit {
  summary: UnitSummary;
  detail: ReturnType<typeof fullFromCardPage>;
  hash: string;
}

/** Aplica resultados, cachea detalles y actualiza el estado de sync. */
async function applyAndCacheResults(
  normalized: NormalizedUnit[],
  syncedAt: number,
  leftOver: number,
  failed: number
): Promise<void> {
  const counts = await applySyncResult({ normalized: normalized.map(n => ({ summary: n.summary, detail: n.detail, hash: n.hash })), removedIds: [], syncedAt });
  await writeSyncMeta({ lastAttemptAt: syncedAt, lastSuccessAt: syncedAt });

  for (const rec of normalized) cacheDetail(rec.summary.id, rec.hash, rec.detail);

  syncState.value = {
    phase: 'updated',
    message:
      `+${counts.newUnits} nuevas, ${counts.changedUnits} modificadas` +
      (failed > 0 ? ` · ${failed} sin descargar` : '') +
      (leftOver > 0 ? ` · quedan ${leftOver} pendientes` : ''),
    lastSuccessAt: syncedAt,
    newUnits: counts.newUnits,
    changedUnits: counts.changedUnits,
    freshUnitIds: counts.freshUnitIds,
  };
  void refreshNews();
}

/** Marca el estado como error con mensaje amable. */
function setErrorState(detail: string): void {
  const msg = friendlySyncMessage(detail);
  console.error('[sync] Fallo al comprobar actualizaciones:', detail);
  syncState.value = { ...syncState.value, phase: 'error', message: msg };
}

/** Intenta sincronizar desde el feed datamine (JSON propio). */
async function tryDatamineSync(): Promise<boolean> {
  if (!datamineEnabled()) return false;

  try {
    const dm = await syncFromDatamine();
    if (dm.newUnits + dm.changedUnits === 0) return false;

    const syncedAt = Date.now();
    await writeSyncMeta({ lastAttemptAt: syncedAt, lastSuccessAt: syncedAt });
    syncState.value = {
      phase: 'updated',
      message: `+${dm.newUnits} nuevas, ${dm.changedUnits} modificadas (datos propios)`,
      lastSuccessAt: syncedAt,
      newUnits: dm.newUnits,
      changedUnits: dm.changedUnits,
      freshUnitIds: dm.freshUnitIds,
    };
    void refreshNews();
    return true;
  } catch (e) {
    console.warn('[sync] Feed datamine no disponible:', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Intenta sincronizar desde dokkan.fyi (fuente primaria). */
async function tryFyiSync(): Promise<{ success: boolean; fyiOk: boolean }> {
  try {
    await repositoryReady();
    const fb = await syncFromFyi();
    const syncedAt = Date.now();
    await writeSyncMeta({ lastAttemptAt: syncedAt, lastSuccessAt: syncedAt });
    const total = fb.newUnits + fb.changedUnits;
    syncState.value =
      total > 0
        ? {
            phase: 'updated',
            message: `+${fb.newUnits} nuevas, ${fb.changedUnits} modificadas`,
            lastSuccessAt: syncedAt,
            newUnits: fb.newUnits,
            changedUnits: fb.changedUnits,
            freshUnitIds: fb.freshUnitIds,
          }
        : { ...idleState(syncedAt), phase: 'up-to-date', message: 'Al día' };
    void refreshNews();
    return { success: true, fyiOk: true };
  } catch (e) {
    console.warn('[sync] dokkan.fyi no disponible:', e instanceof Error ? e.message : String(e));
    return { success: false, fyiOk: false };
  }
}

/** Intenta sincronizar desde dokkaninfo (respaldo). */
async function tryDokkaninfoSync(fyiOk: boolean): Promise<DkCardRow[] | null> {
  let rows: DkCardRow[] | null = null;
  try {
    const parsed = parseCardsIndex(await fetchInfoText('/cards'));
    rows = parsed.length ? parsed : null;
  } catch (e) {
    console.warn('[sync] Catálogo dokkaninfo no disponible:', e instanceof Error ? e.message : String(e));
  }

  if (!rows) {
    if (!fyiOk) throw new Error('Ninguna fuente de datos disponible');
  }
  return rows;
}

/** Procesa el catálogo: compara, prioriza, descarga y aplica. */
async function processCatalog(rows: DkCardRow[]): Promise<void> {
  const diff = categorizeCatalogRows(rows);
  const { queue, leftOver } = buildFetchQueue(diff);

  if (queue.length === 0) {
    const syncedAt = Date.now();
    await applySyncResult({ normalized: [], removedIds: [], syncedAt });
    await writeSyncMeta({ lastAttemptAt: syncedAt, lastSuccessAt: syncedAt });
    syncState.value = { ...idleState(syncedAt), phase: 'up-to-date', message: 'Al día' };
    void refreshNews();
    return;
  }

  const normalized = await fetchAndNormalizeDetails(queue);
  const syncedAt = Date.now();
  const failed = queue.length - normalized.length;
  await applyAndCacheResults(normalized, syncedAt, leftOver, failed);
}

/** Función principal de sincronización (una corrida completa). */
async function syncOnce(): Promise<void> {
  syncState.value = { ...syncState.value, phase: 'checking', message: 'Comprobando…' };

  // 1) Feed datamine (JSON propio publicado): primario cuando está configurado
  //    y trae cambios — así la actualización no depende de dokkaninfo (sin 403).
  //    Las noticias siguen refrescándose desde dokkaninfo (fallos silenciosos).
  if (await tryDatamineSync()) return;

  // 2) Catálogo: dokkan.fyi es el primario (sin Cloudflare → nunca 403).
  //    Si fyi falla, se intenta dokkaninfo como respaldo (con reintentos).
  try {
    const { fyiOk } = await tryFyiSync();
    if (fyiOk) return;

    // 3) Respaldo: dokkaninfo (puede dar 403 de Cloudflare, con reintentos).
    const rows = await tryDokkaninfoSync(fyiOk);
    if (rows) await processCatalog(rows);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    setErrorState(detail);
  }
}

/** Mensaje amable para el chip de estado (fuentes caídas o bloqueadas). */
function friendlySyncMessage(detail: string): string {
  const status = /^HTTP (\d{3})/.exec(detail)?.[1];
  if (status === '403' || status === '429') return 'Fuente saturada — mostrando datos de la caché';
  if (status?.startsWith('5')) return 'La fuente tiene incidencias — mostrando datos de la caché';
  if (status) return `La fuente falló (HTTP ${status}) — mostrando datos de la caché`;
  return 'Sin conexión — mostrando datos de la caché';
}

/** Comprueba actualizaciones al abrir la app (siempre, sin throttle). */
export async function checkOnOpen(): Promise<void> {
  const meta = await readSyncMeta();
  await writeSyncMeta({ ...meta, lastAttemptAt: Date.now() });
  await syncOnce();
}

/** Comprueba actualizaciones con throttle (1 intento por apertura, ≥2 min).
 *  Se mantiene por compatibilidad pero ya no se usa en el arranque. */
export async function maybeCheckOnOpen(): Promise<void> {
  const meta = await readSyncMeta();
  const last = meta.lastAttemptAt ?? 0;
  if (Date.now() - last < CHECK_INTERVAL_MS) {
    syncState.value = idleState(meta.lastSuccessAt);
    return;
  }
  await checkOnOpen();
}

/** Actualización manual (botón de la barra de estado): sin throttle,
 *  pero protegida contra pulsos repetidos mientras hay una corrida en curso. */
let refreshInFlight = false;
export async function manualRefresh(): Promise<void> {
  if (refreshInFlight || syncState.value.phase === 'checking') return;
  refreshInFlight = true;
  try {
    await syncOnce();
  } finally {
    refreshInFlight = false;
  }
}

/**
 * Refresco automático cada 5 minutos: el mismo `syncOnce` del botón, sin
 * intervención del usuario. Devuelve el limpiador (se llama al desmontar).
 * Mientras hay una corrida en curso, `manualRefresh` la ignora: nunca se
 * solapan dos sincronizaciones.
 */
export function startAutoRefresh(): () => void {
  const timer = window.setInterval(() => {
    void manualRefresh();
  }, AUTO_REFRESH_MS);
  return () => window.clearInterval(timer);
}