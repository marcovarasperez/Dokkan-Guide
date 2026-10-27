import { useEffect, useMemo } from 'preact/hooks';
import { signal } from '@preact/signals';
import type { UnitClass, UnitRarity, UnitSummary, UnitType } from '../model/types';
import { getUnits, getUpdatedAt, loadRepository } from '../model/repository';
import { checkOnOpen, startAutoRefresh, syncState } from '../model/sync';
import { loadSeedIfEmpty } from '../model/news';

/**
 * CONTROLADOR · Listado de personajes (búsqueda, filtros y orden).
 *
 * Agrupa TODO el estado que la vista `view/App.tsx` usaba inline:
 *  - `units`: personajes del repositorio local (cargados al abrir la app y
 *    refrescados cuando la sincronización termina con cambios).
 *  - filtros (texto, tipos, clases, rarezas) y orden (criterio + sentido).
 *  - el cálculo de la lista filtrada/ordenada (memorizado).
 *
 * La vista solo pinta: llama a `useListController()` y pasa los valores a
 * `FilterBar` y `UnitGrid`. Para cambiar un filtro desde la vista se usan los
 * handlers que devuelve (`onToggleType`, `onQuery`, …).
 */

export const units = signal<UnitSummary[]>([]);
export const query = signal('');
export const selectedTypes = signal<UnitType[]>([]);
export const selectedClasses = signal<UnitClass[]>([]);
export const selectedRarities = signal<UnitRarity[]>([]);

/** Criterio de orden estilo juego: recientes · nombre · rareza · HP · ATK · DEF · coste. */
export type SortKey = 'recent' | 'name' | 'rarity' | 'hp' | 'atk' | 'def' | 'cost';
export const sortBy = signal<SortKey>('recent');
export const sortDesc = signal(true);

/** Normaliza texto para la búsqueda: sin tildes y en minúsculas. */
const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Fecha de referencia para ordenar: la ÚLTIMA novedad (estreno, EZA o SEZA)
 * con fallback al estreno. Así un EZA/SEZA recién aplicado —la noticia del
 * día— encabeza la lista junto a su badge NUEVA; con la fecha de estreno
 * anterior, una unidad con EZA de hoy quedaba hundida en su fecha de 2024.
 * Devuelve epoch seconds (number) para comparación numérica correcta.
 */
const sortDate = (u: UnitSummary): number => u.releaseDates.latest ?? u.releaseDates.initial ?? -1;

/** Caché de claves de orden para evitar recalcular en cada comparación. */
const sortKeyCache = new Map<number, Record<string, number | string>>();

function getSortKeys(u: UnitSummary): Record<string, number | string> {
  const cached = sortKeyCache.get(u.id);
  if (cached) return cached;

  const keys = {
    recent: sortDate(u),
    name: u.name,
    rarity: { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 }[u.rarity],
    hp: u.stats.hp.max,
    atk: u.stats.atk.max,
    def: u.stats.def.max,
    cost: u.cost,
  };
  sortKeyCache.set(u.id, keys);
  return keys;
}

/** Orden de rarezas (del más bajo al más alto), como en el juego. */
const RARITY_INDEX: Record<UnitRarity, number> = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };

/** Comparadores de orden por criterio (sentido descendente por defecto). */
const SORTERS: Record<SortKey, (a: UnitSummary, b: UnitSummary) => number> = {
  recent: (a, b) => {
    const ka = getSortKeys(a).recent as number;
    const kb = getSortKeys(b).recent as number;
    if (ka === kb) return a.id - b.id;
    return ka < kb ? -1 : 1;
  },
  name: (a, b) => (getSortKeys(a).name as string).localeCompare(getSortKeys(b).name as string, 'es'),
  rarity: (a, b) => (getSortKeys(a).rarity as number) - (getSortKeys(b).rarity as number) || a.id - b.id,
  hp: (a, b) => (getSortKeys(a).hp as number) - (getSortKeys(b).hp as number) || a.id - b.id,
  atk: (a, b) => (getSortKeys(a).atk as number) - (getSortKeys(b).atk as number) || a.id - b.id,
  def: (a, b) => (getSortKeys(a).def as number) - (getSortKeys(b).def as number) || a.id - b.id,
  cost: (a, b) => (getSortKeys(a).cost as number) - (getSortKeys(b).cost as number) || a.id - b.id,
};

export function useListController() {
  // Carga local (instantánea) + semilla de noticias + comprobación de sync.
  useEffect(() => {
    loadRepository()
      .then(() => {
        units.value = getUnits();
      })
      .catch(() => {
        /* el estado vacío de la UI ya comunica el fallo */
      });
    loadSeedIfEmpty().catch(() => {
      /* la vista de noticias maneja su estado vacío */
    });
    checkOnOpen().catch(() => {
      /* el chip de estado refleja el error */
    });
    // Refresco automático: la información se actualiza sola cada 5 minutos
    // (mismo flujo que el botón «⟳ Actualizar» de la barra de estado).
    const stopAutoRefresh = startAutoRefresh();
    return () => stopAutoRefresh();
  }, []);

  // Tras una sincronización exitosa la lista se refresca YA: antes `units`
  // solo se recargaba al montar y no se veía ningún cambio hasta reiniciar.
  useEffect(
    () =>
      syncState.subscribe(() => {
        if (syncState.value.phase === 'updated') units.value = getUnits();
      }),
    [],
  );

  // Lista filtrada y ordenada (memorizada para no reordenar en cada render)
  const list = useMemo(() => {
    const q = normalizeText(query.value.trim());
    const types = selectedTypes.value;
    const classes = selectedClasses.value;
    const rarities = selectedRarities.value;
    const key = sortBy.value;
    const dir = sortDesc.value ? -1 : 1;

    let out = units.value;
    if (q) out = out.filter((u) => normalizeText(u.name).includes(q));
    if (types.length > 0) out = out.filter((u) => types.includes(u.type));
    if (classes.length > 0) out = out.filter((u) => classes.includes(u.class));
    if (rarities.length > 0) out = out.filter((u) => rarities.includes(u.rarity));

    return [...out].sort((a, b) => SORTERS[key](a, b) * dir);
  }, [
    units.value,
    query.value,
    selectedTypes.value,
    selectedClasses.value,
    selectedRarities.value,
    sortBy.value,
    sortDesc.value,
  ]);

  const toggleType = (t: UnitType): void => {
    const cur = selectedTypes.value;
    selectedTypes.value = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t];
  };

  const toggleClass = (c: UnitClass): void => {
    const cur = selectedClasses.value;
    selectedClasses.value = cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c];
  };

  const toggleRarity = (r: UnitRarity): void => {
    const cur = selectedRarities.value;
    selectedRarities.value = cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r];
  };

  const clearFilters = (): void => {
    query.value = '';
    selectedTypes.value = [];
    selectedClasses.value = [];
    selectedRarities.value = [];
    sortBy.value = 'recent';
    sortDesc.value = true;
  };

  return {
    /** Personajes completos (sin filtrar). */
    units: units.value,
    /** Lista ya filtrada y ordenada para pintar en la rejilla. */
    list,
    count: list.length,
    updatedAt: getUpdatedAt(),
    // búsqueda
    query: query.value,
    onQuery: (v: string): void => {
      query.value = v;
    },
    // filtros
    selectedTypes: selectedTypes.value,
    onToggleType: toggleType,
    selectedClasses: selectedClasses.value,
    onToggleClass: toggleClass,
    selectedRarities: selectedRarities.value,
    onToggleRarity: toggleRarity,
    onClear: clearFilters,
    // orden (FilterBar pasa el valor del <select> como string)
    sortBy: sortBy.value,
    onSortBy: (k: string): void => {
      sortBy.value = (k in SORTERS ? k : 'recent') as SortKey;
    },
    sortDesc: sortDesc.value,
    onToggleSort: (): void => {
      sortDesc.value = !sortDesc.value;
    },
  };
}
