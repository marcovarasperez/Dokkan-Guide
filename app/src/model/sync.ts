import { signal } from '@preact/signals';
import type { SyncState, UnitSummary } from './types';
import { fetchInfoText } from './http';
import { parseCardsIndex, parseCardPage, rarityFromCode, typeFromElement } from './dinfo';
import type { DkCardRow } from './dinfo';
import { cacheDetail, fullFromCardPage, loadDropsIndex, loadZbattlesIndex, summaryFromCardPage } from './detail';
import { refreshNews } from './news';
import { datamineEnabled, syncFromDatamine } from './datamine';
import { syncFromFyi } from './fyi';
import {
  getUnits, applySyncResult, readSyncMeta, writeSyncMeta, repositoryReady,
} from './repository';

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

/**
 * Intervalo mínimo entre comprobaciones automáticas (al abrir o al volver del
 * background). Reducido de 15 min a 2 min para que la app refleje cambios
 * rápidamente sin bombardear las fuentes.
 */
const CHECK_INTERVAL_MS = 2 * 60 * 1000;
/** Refresco automático: cada 5 minutos, con el mismo flujo que el botón. */
export const AUTO_REFRESH_MS = 5 * 60 * 1000;
/** Fichas descargadas como máximo por corrida (banda transportada).
 *  Subido de 12 a 50: en WiFi/4G el coste es mínimo y el catch-up es mucho
 *  más rápido (antes 50 cambios requerían 4+ ciclos = 20+ minutos). */
const MAX_FETCHES_PER_RUN = 50;

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
  const sig = [
    r.id, r.name, r.rarity, r.element, r.lv_max, r.skill_lv_max, r.icon_id,
    r.hp_init, r.hp_max, r.hp_hipo, r.atk_init, r.atk_max, r.atk_hipo,
    r.def_init, r.def_max, r.def_hipo, r.open_at, r.eza, r.eza_open_at,
    r.seza, r.seza_open_at,
  ].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i += 1) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Parte de fecha (YYYY-MM-DD, UTC) para comparar tiempos sin ruido horario. */
const datePart = (v: string | number | null | undefined): string => {
  if (v == null) return '';
  const t = typeof v === 'number' ? v * 1000 : Date.parse(v);
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
};

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
};

async function syncOnce(): Promise<void> {
  syncState.value = { ...syncState.value, phase: 'checking', message: 'Comprobando…' };

  // 1) Feed datamine (JSON propio publicado): primario cuando está configurado
  //    y trae cambios — así la actualización no depende de dokkaninfo (sin 403).
  //    Las noticias siguen refrescándose desde dokkaninfo (fallos silenciosos).
  if (datamineEnabled()) {
    try {
      const dm = await syncFromDatamine();
      if (dm.newUnits + dm.changedUnits > 0) {
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
        return;
      }
      // Sin cambios en el feed: se continúa con el flujo principal.
    } catch (e) {
      // Feed caído/incompleto: se registra y se cae al flujo habitual.
      console.warn('[sync] Feed datamine no disponible:', e instanceof Error ? e.message : String(e));
    }
  }

  // 2) Catálogo: dokkan.fyi es el primario (sin Cloudflare → nunca 403).
  //    Si fyi falla, se intenta dokkaninfo como respaldo (con reintentos).
  try {
    await repositoryReady();

    // —— Intento primario: dokkan.fyi (sin Cloudflare, fiable) ——
    let fyiOk = false;
    try {
      const fb = await syncFromFyi();
      fyiOk = true;
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
      // Refresco de noticias dentro del mismo ciclo (fallos silenciosos).
      void refreshNews();
      return;
    } catch (e) {
      console.warn('[sync] dokkan.fyi no disponible:', e instanceof Error ? e.message : String(e));
    }

    // —— Respaldo: dokkaninfo (puede dar 403 de Cloudflare, con reintentos) ——
    let rows: DkCardRow[] | null = null;
    try {
      const parsed = parseCardsIndex(await fetchInfoText('/cards'));
      rows = parsed.length ? parsed : null;
    } catch (e) {
      console.warn('[sync] Catálogo dokkaninfo no disponible:', e instanceof Error ? e.message : String(e));
    }

    if (!rows) {
      // Ambas fuentes fallaron: si fyi dio datos parciales arriba y no se
      // aplicaron (por la salvaguarda anti-incompleto), el error ya está
      // en consola. Se muestra la caché.
      if (!fyiOk) throw new Error('Ninguna fuente de datos disponible');
      return;
    }

    const known = new Map(getUnits().map((u) => [u.id, u]));
    const knownIds = new Set(known.keys());
    // Ids de TODAS las filas del catálogo: descartan variantes sin página.
    const catalogIds = new Set(rows.map((r) => r.id));

    const changed: DkCardRow[] = [];
    const stateChanged: DkCardRow[] = [];
    const added: DkCardRow[] = [];
    for (const row of rows) {
      const current = known.get(row.id);
      if (current) {
        // Un EZA/SEZA nuevo o con fecha nueva es prioridad: su ficha se
        // descarga primero (el badge NUEVA lo decide la fecha de novedad).
        if (stateChangeDiffers(current, row)) stateChanged.push(row);
        else if (rowDiffers(current, row)) changed.push(row);
      } else if (isNewCandidate(row, knownIds, catalogIds)) {
        added.push(row);
      }
    }

    // Prioridad: cambios de estado (EZA/SEZA recién aplicados) > resto de
    // actualizaciones > altas pendientes: una novedad real no debe esperar
    // detrás de la cola de unidades nuevas por catalogar.
    const pendingTotal = stateChanged.length + changed.length + added.length;
    const queue = [...stateChanged, ...changed, ...added].slice(0, MAX_FETCHES_PER_RUN);
    const leftOver = pendingTotal - queue.length;
    if (queue.length === 0) {
      const syncedAt = Date.now();
      await applySyncResult({ normalized: [], removedIds: [], syncedAt });
      await writeSyncMeta({ lastAttemptAt: syncedAt, lastSuccessAt: syncedAt });
      syncState.value = { ...idleState(syncedAt), phase: 'up-to-date', message: 'Al día' };
      void refreshNews();
      return;
    }

    const dropsIndex = await loadDropsIndex();
    const zbIndex = await loadZbattlesIndex();
    const normalized = [];
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

    const syncedAt = Date.now();
    const counts = await applySyncResult({ normalized, removedIds: [], syncedAt });
    await writeSyncMeta({ lastAttemptAt: syncedAt, lastSuccessAt: syncedAt });
    // Las fichas descargadas pasan a la base de datos local (store `details`):
    // la vista las muestra sin volver a pedirlas a la red (y offline).
    for (const rec of normalized) cacheDetail(rec.summary.id, rec.hash, rec.detail);
    const failed = queue.length - normalized.length;
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
    // Refresco de noticias dentro del mismo ciclo (fallos silenciosos).
    void refreshNews();
  } catch (e) {
    // Fallo real (red/HTTP en ambas fuentes): se registra en consola y el chip
    // lo muestra con mensaje amable (nunca el crudo "Error HTTP 403").
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[sync] Fallo al comprobar actualizaciones:', detail);
    syncState.value = { ...syncState.value, phase: 'error', message: friendlySyncMessage(detail) };
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

/** ¿Corresponde comprobar ahora? (1 intento por apertura, ≥15 min). */
export async function maybeCheckOnOpen(): Promise<void> {
  const meta = await readSyncMeta();
  const last = meta.lastAttemptAt ?? 0;
  if (Date.now() - last < CHECK_INTERVAL_MS) {
    syncState.value = idleState(meta.lastSuccessAt);
    return;
  }
  await writeSyncMeta({ ...meta, lastAttemptAt: Date.now() });
  await syncOnce();
}

/** Actualización manual (botón de la barra de estado): sin throttle de15 min,
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
