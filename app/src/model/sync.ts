import { signal } from '@preact/signals';
import type { SyncState, UnitSummary } from './types';
import { fetchInfoText } from './http';
import { parseCardsIndex, parseCardPage } from './dinfo';
import { rarityFromCode, typeFromElement } from './adapter';
import type { DkCardRow } from './dinfo';
import { cacheDetail, fullFromCardPage, loadDropsIndex, loadZbattlesIndex, summaryFromCardPage } from './detail';
import { refreshNews } from './news';
import {
  getUnits, getUnit, applySyncResult, writeSyncMeta,
} from './repository';
import { hashCardRow } from './hash';
import { datePart } from './date';
import { AUTO_REFRESH_MS, MAX_FETCHES_PER_RUN } from './constants';
import { showNotification, areNotificationsEnabled, isNotificationVibrationEnabled } from './notifications';

/**
 * Servicio de sincronización incremental — fuente única: dokkaninfo.com.
 *
 * El transporte nativo (Tauri: tauri-plugin-http / Capacitor: CapacitorHttp)
 * se activa automáticamente en `fetchInfoText` y permite acceder a
 * dokkaninfo.com sin CORS ni bloqueos Cloudflare.
 *
 * Flujo:
 *  a. Descargar catálogo completo `/cards` (v-bind:cardsjson)
 *  b. Comparar cada registro con el resumen local (hash FNV-1a por fila)
 *  c. Descargar fichas completas de unidades nuevas/modificadas (máx. MAX_FETCHES_PER_RUN)
 *  c. Persistir en BD local + cachear detalles en IndexedDB
 *
 * Política: 1 comprobación por apertura, ≥2 min entre intentos.
 * Fallos silenciosos: sin excepciones a pantalla, se muestra caché.
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
    // Gains de HiPo del resumen frente a los de la fila.
    (s.hpGains != null &&
      (s.hpGains.hp !== (r.hp_hipo ?? 0) - (r.hp_max ?? 0) ||
        s.hpGains.atk !== (r.atk_hipo ?? 0) - (r.atk_max ?? 0) ||
        s.hpGains.def !== (r.def_hipo ?? 0) - (r.def_max ?? 0))) ||
    s.hasEza !== (r.eza === 1) ||
    s.hasSeza !== (r.seza === 1) ||
    datePart(s.releaseDates.initial) !== datePart(r.open_at) ||
    datePart(s.releaseDates.eza) !== datePart(r.eza_open_at) ||
    datePart(s.releaseDates.seza) !== datePart(r.seza_open_at)
  );
}

/** ¿La fila introduce o cambia un EZA/SEZA? */
function stateChangeDiffers(s: UnitSummary, r: DkCardRow): boolean {
  return (
    s.hasEza !== (r.eza === 1) ||
    s.hasSeza !== (r.seza === 1) ||
    datePart(s.releaseDates.eza) !== datePart(r.eza_open_at) ||
    datePart(s.releaseDates.seza) !== datePart(r.seza_open_at)
  );
}

/**
 * Nuevas unidades SSR+ no especulares (espejos 9xxxxxx se excluyen).
 * Se excluyen variantes sin página propia (icon_id apunta a otra fila),
 * formas pre-despertar (awoken_max < 1), estados transformados (id >= 4000000)
 * y filas sin fecha de estreno publicada — misma regla que el widget
 * "Most Recent Cards" de dokkaninfo.com y que tools/sync.mjs.
 */
const isNewCandidate = (r: DkCardRow, known: Set<number>, catalogIds: Set<number>): boolean => {
  const icon = r.icon_id ?? r.id;
  const variant = icon !== r.id && catalogIds.has(icon);
  const open = r.open_at ?? 0;
  return (
    !known.has(r.id) &&
    !variant &&
    r.rarity >= 3 &&
    r.id < 4000000 &&
    (r.awoken_max ?? 0) >= 1 &&
    !String(r.id).startsWith('9') &&
    open > 0 &&
    open < Date.now() / 1000
  );
}

interface CatalogDiff {
  stateChanged: DkCardRow[];
  changed: DkCardRow[];
  added: DkCardRow[];
}

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

function buildFetchQueue(diff: CatalogDiff): DkCardRow[] {
  return [...diff.stateChanged, ...diff.changed, ...diff.added].slice(0, MAX_FETCHES_PER_RUN);
}

// Concurrencia máxima de peticiones de detalle paralelas
const MAX_CONCURRENT_DETAIL_FETCHES = 4;

// Caché en memoria de índices pesados (drops, Z-Battles)
let cachedDropsIndex: Awaited<ReturnType<typeof loadDropsIndex>> | null = null;
let cachedZbIndex: Awaited<ReturnType<typeof loadZbattlesIndex>> | null = null;

async function fetchAndNormalizeDetails(queue: DkCardRow[]): Promise<NormalizedUnit[]> {
  // Cargar índices una sola vez (caché en memoria)
  if (!cachedDropsIndex) cachedDropsIndex = await loadDropsIndex();
  if (!cachedZbIndex) cachedZbIndex = await loadZbattlesIndex();
  const dropsIndex = cachedDropsIndex;
  const zbIndex = cachedZbIndex;

  const normalized: NormalizedUnit[] = [];
  // Mapa characterId -> { id, openAt } de la base ya en repo + las que vamos añadiendo
  const charBaseMap = new Map<number, { id: number; openAt: number | null }>();
  for (const u of getUnits()) {
    if (u.characterId != null && u.releaseDates.initial != null) {
      charBaseMap.set(u.characterId, { id: u.id, openAt: u.releaseDates.initial });
    }
  }

  // Procesar en lotes paralelos con concurrencia limitada
  for (let i = 0; i < queue.length; i += MAX_CONCURRENT_DETAIL_FETCHES) {
    const batch = queue.slice(i, i + MAX_CONCURRENT_DETAIL_FETCHES);

    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const page = parseCardPage(await fetchInfoText(`/cards/${row.id}`));
        if (!page) return null;

        const prevStats = getUnit(row.id)?.stats ?? null;
        const characterId = page.card.character_id ?? null;
        let isExchangeForm = false;

        // Detectar exchange form: mismo characterId que otra unidad con openAt anterior
        if (characterId != null) {
          const base = charBaseMap.get(characterId);
          const rowOpenAt = row.open_at ?? 0;
          if (base && base.openAt !== null && rowOpenAt > base.openAt) {
            isExchangeForm = true;
          } else {
            charBaseMap.set(characterId, { id: row.id, openAt: rowOpenAt });
          }
        }

        if (isExchangeForm) return null;

        const summary = summaryFromCardPage(row.id, page, {
          hasEza: row.eza === 1,
          hasSeza: row.seza === 1,
          openAt: row.open_at,
          ezaOpenAt: row.eza_open_at,
          sezaOpenAt: row.seza_open_at,
          prevStats,
          characterId,
          isExchangeForm: false,
        });
        return {
          summary,
          detail: fullFromCardPage(page, dropsIndex, zbIndex, prevStats),
          hash: rowHash(row),
        };
      })
    );

    // Recoger resultados exitosos
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        normalized.push(result.value);
      }
      // Los errores (rejected) se ignoran → se reintentan en próxima sync
    }
  }
  return normalized;
}

interface NormalizedUnit {
  summary: UnitSummary;
  detail: ReturnType<typeof fullFromCardPage>;
  hash: string;
}

async function applyAndCacheResults(
  normalized: NormalizedUnit[],
  syncedAt: number
): Promise<void> {
  const counts = await applySyncResult({ normalized: normalized.map(n => ({ summary: n.summary, detail: n.detail, hash: n.hash })), removedIds: [], syncedAt });
  await writeSyncMeta({ lastAttemptAt: syncedAt, lastSuccessAt: syncedAt });

  for (const rec of normalized) cacheDetail(rec.summary.id, rec.hash, rec.detail);

  // Notificar nuevos personajes (solo la primera vez que se detectan y si el usuario lo activó)
  if (areNotificationsEnabled() && counts.newUnits > 0 && counts.freshUnitIds.length > 0) {
    const { getUnit } = await import('./repository');
    const names = counts.freshUnitIds
      .map((id) => getUnit(id)?.name)
      .filter((n): n is string => Boolean(n));

    if (names.length > 0) {
      const body = names.length === 1 ? names[0] : `${names.length} personajes nuevos: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;
      await showNotification({
        title: '¡Nuevo personaje en Dokkan!',
        body,
        id: Math.floor(syncedAt / 1000), // ID basado en timestamp
        smallIcon: 'ic_stat_icon',
        iconColor: '#FF6B35',
        vibration: isNotificationVibrationEnabled(),
      });
    }
  }

  syncState.value = {
    phase: 'updated',
    message: 'Datos actualizados',
    lastSuccessAt: syncedAt,
    newUnits: counts.newUnits,
    changedUnits: counts.changedUnits,
    freshUnitIds: counts.freshUnitIds,
  };
  void refreshNews();
}

function setErrorState(detail: string): void {
  const msg = friendlySyncMessage(detail);
  console.error('[sync] Fallo al comprobar actualizaciones:', detail);
  syncState.value = { ...syncState.value, phase: 'error', message: msg };
}

/** Sincroniza catálogo y fichas desde dokkaninfo.com (fuente única). */
async function syncFromDokkaninfo(): Promise<void> {
  let rows: DkCardRow[] | null = null;
  try {
    const parsed = parseCardsIndex(await fetchInfoText('/cards'));
    rows = parsed.length ? parsed : null;
  } catch (e) {
    console.warn('[sync] Catálogo dokkaninfo no disponible:', e instanceof Error ? e.message : String(e));
  }

  if (!rows) throw new Error('Fuente dokkaninfo no disponible');

  const diff = categorizeCatalogRows(rows);
  const queue = buildFetchQueue(diff);

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
  await applyAndCacheResults(normalized, syncedAt);
}

/** Función principal de sincronización (una corrida completa). */
async function syncOnce(): Promise<void> {
  syncState.value = { ...syncState.value, phase: 'checking', message: 'Comprobando…' };

  try {
    await syncFromDokkaninfo();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[sync] syncOnce error:', detail, e);
    setErrorState(detail);
  }
}

function friendlySyncMessage(detail: string): string {
  const status = /^HTTP (\d{3})/.exec(detail)?.[1];
  if (status === '403' || status === '429') return 'Fuente saturada — mostrando datos de la caché';
  if (status?.startsWith('5')) return 'La fuente tiene incidencias — mostrando datos de la caché';
  if (status) return `La fuente falló (HTTP ${status}) — mostrando datos de la caché`;
  return 'Sin conexión — mostrando datos de la caché';
}

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

export function startAutoRefresh(): () => void {
  const timer = window.setInterval(() => {
    void manualRefresh();
  }, AUTO_REFRESH_MS);
  return () => window.clearInterval(timer);
}