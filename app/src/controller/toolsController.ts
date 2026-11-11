import { useEffect, useMemo, useState } from 'preact/hooks';
import { getUnits, getUnit } from '../model/repository';
import { loadLinksIndex } from '../model/wiki';
import { fetchUnitDetail } from '../model/detail';
import type { MiniUnit } from '../model/detail';
import type { LinkEntry, UnitSummary } from '../model/types';

/**
 * CONTROLADOR · Herramientas (sección Tools) y vista Links.
 *
 *  - `useUnitSearch`: buscador de personajes por nombre sobre la base local.
 *  - `useLinksIndex`: índice de links (Nv.1 / Nv.10) del seed `links.index.json`.
 *  - `useLinkTool`: hasta 7 personajes → links que comparten TODOS y, por
 *    personaje, cuántos links comparte con el resto (como el Link Tool de
 *    dokkaninfo, pero calculado en local, sin red).
 *  - `useLeaderTool`: personaje → sus líderes 200%+ (ranking
 *    `two_hundred_leaders` de su ficha de dokkaninfo, con caché local).
 */

const MAX_LINK_UNITS = 7;

/** Búsqueda por nombre (máx. 30 resultados; solo cartas del listado principal). */
export function useUnitSearch() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return getUnits()
      .filter((u) => !u.isExchangeForm && u.name.toLowerCase().includes(q))
      .sort((a, b) => (b.releaseDates.latest ?? 0) - (a.releaseDates.latest ?? 0))
      .slice(0, 30);
  }, [query]);
  return { query, setQuery, results };
}

/** Índice de links por nombre (carga perezosa del seed). */
export function useLinksIndex(): Map<string, LinkEntry> {
  const [map, setMap] = useState<Map<string, LinkEntry>>(new Map());
  useEffect(() => {
    void loadLinksIndex().then((idx) => {
      if (idx) setMap(new Map(idx.links.map((l) => [l.name, l])));
    });
  }, []);
  return map;
}

export function useLinkTool() {
  const [ids, setIds] = useState<number[]>([]);
  // Links de cada personaje: el seed empaquetado no los trae, así que se
  // leen de su ficha completa (descarga perezosa, cacheada en la BD local).
  const [unitLinks, setUnitLinks] = useState<Record<number, string[] | 'loading' | 'error'>>({});
  const links = useLinksIndex();
  const selected = ids.map((id) => getUnit(id)).filter((u): u is UnitSummary => !!u);

  useEffect(() => {
    for (const id of ids) {
      if (unitLinks[id]) continue;
      const own = getUnit(id)?.linkNames ?? [];
      if (own.length) {
        setUnitLinks((m) => ({ ...m, [id]: own }));
        continue;
      }
      setUnitLinks((m) => ({ ...m, [id]: 'loading' }));
      fetchUnitDetail(id)
        .then((full) => setUnitLinks((m) => ({ ...m, [id]: full.linkNames })))
        .catch(() => setUnitLinks((m) => ({ ...m, [id]: 'error' })));
    }
  }, [ids.join(',')]);

  const namesOf = (id: number): string[] => {
    const v = unitLinks[id];
    return Array.isArray(v) ? v : [];
  };
  const loading = selected.some((u) => unitLinks[u.id] === 'loading' || !unitLinks[u.id]);

  // Links que comparten TODOS los seleccionados.
  const shared =
    selected.length < 2 ? [] : namesOf(selected[0].id).filter((n) => selected.every((u) => namesOf(u.id).includes(n)));

  // Por personaje: links que comparte con cada uno de los demás (mín.–máx.).
  const perUnit = selected.map((u) => {
    const mine = namesOf(u.id);
    const others = selected.filter((o) => o.id !== u.id);
    const counts = others.map((o) => mine.filter((n) => namesOf(o.id).includes(n)).length);
    return {
      u,
      total: mine.length,
      status: unitLinks[u.id],
      best: counts.length ? Math.max(...counts) : 0,
      worst: counts.length ? Math.min(...counts) : 0,
    };
  });

  return {
    loading,
    selected,
    shared: shared.map((name) => links.get(name) ?? { id: 0, name, lv1: '', lv10: '' }),
    perUnit,
    full: ids.length >= MAX_LINK_UNITS,
    add: (id: number): void => setIds((cur) => (cur.includes(id) || cur.length >= MAX_LINK_UNITS ? cur : [...cur, id])),
    remove: (id: number): void => setIds((cur) => cur.filter((x) => x !== id)),
    clear: (): void => setIds([]),
  };
}

export function useLeaderTool() {
  const [unitId, setUnitId] = useState<number | null>(null);
  const [leaders, setLeaders] = useState<MiniUnit[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  useEffect(() => {
    if (unitId === null) return;
    let alive = true;
    setStatus('loading');
    fetchUnitDetail(unitId)
      .then((full) => {
        if (!alive) return;
        setLeaders(full.bestLeaders);
        setStatus('ok');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [unitId]);

  return {
    unit: unitId !== null ? getUnit(unitId) : null,
    leaders,
    status,
    pick: setUnitId,
    retry: (): void => {
      const id = unitId;
      setUnitId(null);
      setTimeout(() => setUnitId(id), 0);
    },
  };
}
