import { useEffect, useMemo, useState } from 'preact/hooks';
import type { UnitSummary } from '../model/types';
import { loadCategoriesIndex } from '../model/wiki';
import type { CategoriesIndex, CategoryEntry, CategoryLeader } from '../model/types';
import type { MiniUnit } from '../model/detail';

/**
 * CONTROLADOR · Explorador de CATEGORÍAS (estilo wiki).
 *
 * Agrupa TODA la lógica que la vista `view/CategoryView.tsx` usaba inline:
 *  - descarga del índice de categorías (semilla local) con estado de carga;
 *  - `query` de búsqueda y la lista de categorías filtrada/ordenada;
 *  - detalle de la categoría activa (`cat`) con sus LÍDERES (con el boost de
 *    su leader skill) y sus PERSONAJES, memorizados para no reordenar en cada
 *    render.
 *
 * Flujo de los datos: `model/wiki.ts` carga la semilla local generada por
 * `tools/categories_sync.mjs` (categorías scrapeadas de /cards/{id} de
 * dokkaninfo.com) + etiquetas oficiales de dokkaninfo; los personajes salen
 * del repositorio local (`units`, pasado desde la vista). La etiqueta de cada
 * categoría (`labelUrl`) y los helpers de pintado (`hideBroken`) se quedan
 * en la vista.
 */

/** Orden de rarezas (del más bajo al más alto), como en el juego. */
const RARITY_ORDER: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };

/** Búsqueda sin tildes y en minúsculas (igual que la lista de personajes). */
const norm = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Miniatura de unidad para las listas de categoría. */
const toMini = (u: UnitSummary): MiniUnit => ({
  id: u.id,
  name: u.name,
  type: u.type,
  rarity: u.rarity,
  iconId: u.thumbnailId,
});

export function useCategoryController(id: number | null, units: UnitSummary[]) {
  const [idx, setIdx] = useState<CategoriesIndex | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadCategoriesIndex().then((d) => {
      if (!alive) return;
      setIdx(d);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  // Índices de membresía (para los contadores de la lista)
  const catMap = useMemo(() => new Map((idx?.categories ?? []).map((c) => [c.id, c])), [idx]);

  const loading = !ready;
  const missing = ready && idx === null;

  // ---------- Lista de categorías ----------
  const q = norm(query.trim());
  const list = useMemo(() => {
    const cats = idx?.categories ?? [];
    const out = q ? cats.filter((c) => norm(c.name).includes(q)) : cats;
    return [...out].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }, [idx, q]);

  // ---------- Detalle de una categoría ----------
  const cat: CategoryEntry | null = id !== null ? catMap.get(id) ?? null : null;
  const leaderRows: { u: MiniUnit; boost: number | null }[] = useMemo(() => {
    if (id === null || !idx) return [];
    const rows: CategoryLeader[] = idx.leaders[String(id)] ?? [];
    return rows
      .map((l) => {
        const u = byId.get(l.id);
        return u ? { u: toMini(u), boost: l.boost } : null;
      })
      .filter((x): x is { u: MiniUnit; boost: number | null } => x !== null);
  }, [id, idx, byId]);

  const memberRows: MiniUnit[] = useMemo(() => {
    if (id === null || !idx) return [];
    const ids = idx.members[String(id)] ?? [];
    const out: UnitSummary[] = [];
    for (const uid of ids) {
      const u = byId.get(uid);
      if (u) out.push(u);
    }
    out.sort(
      (a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0) || a.name.localeCompare(b.name, 'es'),
    );
    return out.map(toMini);
  }, [id, idx, byId]);

  return {
    /** Índice completo de categorías (membresías, líderes, contador total). */
    idx,
    loading,
    missing,
    /** Categoría abierta (null si es solo la lista). */
    cat,
    /** Lista filtrada por `query` y ordenada alfabéticamente. */
    list,
    leaderRows,
    memberRows,
    query,
    onQuery: (v: string): void => {
      setQuery(v);
    },
  };
}
