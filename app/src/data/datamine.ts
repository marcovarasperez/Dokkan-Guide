import { fetchTextUrl } from './http';
import { datamineBase } from './sources';
import { applySyncResult, getHashes, getUnits } from './repository';
import type { UnitFull } from './detail';
import type { SeedMeta, UnitSummary } from './types';

/**
 * Feed datamine: autoactualización desde JSON propios publicados (p. ej.
 * GitHub Pages), generados por tools/game_sync.mjs a partir del database.db
 * del cliente del juego. Sin fansites de por medio → sin bloqueos 403.
 *
 * Flujo económico: meta.json (~30 KB, con hash por unidad) se pide siempre;
 * units.index.json (~1,7 MB) solo si el feed trae hashes nuevos. El detalle
 * completo no viaja en el feed: se preserva el override previo si existe y,
 * si no, la ficha se resuelve bajo demanda (detail.ts) cuando hay red.
 *
 * Protección: si el feed trae >10 % menos unidades que las locales (dump
 * parcial o desactualizado), no se aplica nada — un feed roto no debe vaciar
 * la app. Ver docs/DATAMINE.md.
 */

export interface DatamineResult {
  newUnits: number;
  changedUnits: number;
  freshUnitIds: number[];
}

/** ¿Hay un feed datamine configurado? */
export const datamineEnabled = (): boolean => datamineBase().length > 0;

/** Detalle mínimo válido construido desde el resumen (fichas vacías). */
function emptyDetail(s: UnitSummary): UnitFull {
  return {
    stats: s.stats,
    leaderSkill: s.leaderSkill,
    passiveSkill: s.passiveSkill,
    activeSkills: [],
    superAttacks: [],
    linkNames: s.linkNames,
    categories: [],
    maxSaLevel: s.maxSALevel,
    hipoGains: s.hpGains,
    potentialBoardId: null,
    transformationPath: [],
    acquire: { drops: [], banners: [], summonable: null, ezaBattles: [] },
    bestLeaders: [],
    linkPartners: [],
  };
}

/**
 * Comprueba el feed y aplica los cambios pendientes.
 * Devuelve el resultado (aunque sea "sin cambios") o lanza si el feed falla
 * o parece incompleto — el llamante decide si cae a dokkaninfo.
 */
export async function syncFromDatamine(): Promise<DatamineResult> {
  const base = datamineBase();
  if (!base) throw new Error('Feed datamine no configurado');

  const meta = JSON.parse(await fetchTextUrl(`${base}/meta.json`)) as SeedMeta;
  const localHashes = getHashes();
  const changedIds = new Set<string>();
  let remoteCount = 0;
  for (const [id, h] of Object.entries(meta.hashes ?? {})) {
    remoteCount++;
    if (localHashes.get(Number(id)) !== h) changedIds.add(id);
  }
  if (changedIds.size === 0) return { newUnits: 0, changedUnits: 0, freshUnitIds: [] };

  const remote = JSON.parse(await fetchTextUrl(`${base}/units.index.json`, 120000)) as UnitSummary[];

  // Guarda anti-incompleto: el catálogo remoto debe ser al menos el 90 % del local.
  const localCount = getUnits().length;
  if (localCount > 100 && remoteCount < localCount * 0.9) {
    throw new Error(`Feed datamine incompleto (${remoteCount} unidades < 90 % de ${localCount})`);
  }

  const normalized = remote
    .filter((u) => changedIds.has(String(u.id)))
    .map((u) => ({ summary: u, detail: emptyDetail(u), hash: meta.hashes[String(u.id)] ?? '' }));

  const remoteIds = new Set(remote.map((u) => u.id));
  const removedIds = getUnits()
    .map((u) => u.id)
    .filter((id) => !remoteIds.has(id));

  const counts = await applySyncResult({ normalized, removedIds, syncedAt: Date.now(), keepDetail: true });
  console.log(
    `[datamine] Aplicado: +${counts.newUnits} nuevas, ${counts.changedUnits} modificadas, ${removedIds.length} eliminadas.`
  );
  return counts;
}
