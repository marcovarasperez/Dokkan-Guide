import { useEffect, useMemo } from 'preact/hooks';
import { signal, computed } from '@preact/signals';
import type { UnitClass, UnitRarity, UnitSummary, UnitType } from '../data/types';
import { loadRepository, getUnits, getUpdatedAt } from '../data/repository';
import { maybeCheckOnOpen, syncState } from '../data/sync';
import { loadSeedIfEmpty } from '../data/news';
import Header from './Header';
import StatusBar from './StatusBar';
import FilterBar from './FilterBar';
import UnitGrid from './UnitGrid';
import UnitDetail from './UnitDetail';
import CategoryView from './CategoryView';
import NewsView from './NewsView';
import NewsDetail from './NewsDetail';
import BannersView from './BannersView';
import BannerDetail from './BannerDetail';
import EventosView from './EventosView';
import BabaView from './BabaView';

// Señales compartidas por los componentes de la interfaz
export const units = signal<UnitSummary[]>([]);
export const query = signal('');
export const selectedTypes = signal<UnitType[]>([]);
export const selectedClasses = signal<UnitClass[]>([]);
export const selectedRarities = signal<UnitRarity[]>([]);
/** Criterio de orden estilo juego: recientes · nombre · rareza · HP · ATK · DEF · coste. */
export type SortKey = 'recent' | 'name' | 'rarity' | 'hp' | 'atk' | 'def' | 'cost';
export const sortBy = signal<SortKey>('recent');
export const sortDesc = signal(true);

// Router por hash (5 secciones): #/ personajes, #/banners[/{id}],
// #/eventos[?ev=…], #/baba y #/noticias[/{id}].
// (Hash routing: funciona igual en dev, Tauri y Capacitor sin servidor.)
const route = signal(location.hash);
const detailId = computed<number | null>(() => {
  const m = route.value.match(/^#\/characters\/(\d+)$/);
  return m ? Number(m[1]) : null;
});
const newsDetailId = computed<number | null>(() => {
  const m = route.value.match(/^#\/noticias\/(\d+)$/);
  return m ? Number(m[1]) : null;
});
const bannerDetailId = computed<number | null>(() => {
  const m = route.value.match(/^#\/banners\/(\d+)$/);
  return m ? Number(m[1]) : null;
});
/** Ruta de categoría: #/categorias[/{id}] (sub-vista de Personajes). */
const categoryId = computed<number | null>(() => {
  const m = route.value.match(/^#\/categorias\/(\d+)$/);
  return m ? Number(m[1]) : null;
});
/** Deep-link de obtención: #/eventos?ev={type}/{id} (ej. ?ev=quest/12) */
const eventsFocus = computed<{ type: string; id: number } | null>(() => {
  const m = route.value.match(/^#\/eventos(?:\?[^#]*)?$/);
  if (!m) return null;
  const qs = new URLSearchParams(route.value.split('?')[1] ?? '');
  const parts = (qs.get('ev') ?? '').match(/^([a-z]+)\/(\d+)$/);
  if (!parts) return null;
  return { type: parts[1], id: Number(parts[2]) };
});

export type View =
  | 'list'
  | 'detail'
  | 'news'
  | 'banners'
  | 'bannerDetail'
  | 'events'
  | 'baba'
  | 'categories';
const view = computed<View>(() => {
  if (route.value.startsWith('#/noticias')) return 'news';
  if (bannerDetailId.value !== null) return 'bannerDetail';
  if (route.value.startsWith('#/banners')) return 'banners';
  // '#/juego' (ruta antigua) sigue abriendo Eventos.
  if (route.value.startsWith('#/eventos') || route.value.startsWith('#/juego')) return 'events';
  if (route.value.startsWith('#/baba')) return 'baba';
  if (route.value.startsWith('#/categorias')) return 'categories';
  return detailId.value !== null ? 'detail' : 'list';
});

/** Normaliza texto para la búsqueda: sin tildes y en minúsculas. */
const normalizeText = (s: string): string =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Fecha de referencia para ordenar: la ÚLTIMA novedad (estreno, EZA o SEZA)
 * con fallback al estreno. Así un EZA/SEZA recién aplicado —la noticia del
 * día— encabeza la lista junto a su badge NUEVA; con la fecha de estreno
 * anterior, una unidad con EZA de hoy quedaba hundida en su fecha de 2024.
 */
const sortDate = (u: UnitSummary): string => u.releaseDates.latest ?? u.releaseDates.initial ?? '';

/** Orden de rarezas (del más bajo al más alto), como en el juego. */
const RARITY_INDEX: Record<UnitRarity, number> = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };

/** Comparadores de orden por criterio (sentido descendente por defecto). */
const SORTERS: Record<SortKey, (a: UnitSummary, b: UnitSummary) => number> = {
  recent: (a, b) => {
    const da = sortDate(a);
    const db = sortDate(b);
    if (da === db) return a.id - b.id; // desempate estable por id
    return da < db ? -1 : 1;
  },
  name: (a, b) => a.name.localeCompare(b.name, 'es'),
  rarity: (a, b) => RARITY_INDEX[a.rarity] - RARITY_INDEX[b.rarity] || a.id - b.id,
  hp: (a, b) => a.stats.hp.max - b.stats.hp.max || a.id - b.id,
  atk: (a, b) => a.stats.atk.max - b.stats.atk.max || a.id - b.id,
  def: (a, b) => a.stats.def.max - b.stats.def.max || a.id - b.id,
  cost: (a, b) => a.cost - b.cost || a.id - b.id,
};

export default function App() {
  useEffect(() => {
    const onHash = (): void => {
      route.value = location.hash;
    };
    addEventListener('hashchange', onHash);
    // Carga local (instantánea) y sincronización en segundo plano
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
    maybeCheckOnOpen().catch(() => {
      /* el chip de estado refleja el error */
    });
    return () => removeEventListener('hashchange', onHash);
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
  const lista = useMemo(() => {
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

  const toggleSort = (): void => {
    sortDesc.value = !sortDesc.value;
  };

  const currentView = view.value;
  const detail = detailId.value;
  const newsDetail = newsDetailId.value;
  const bannerDetail = bannerDetailId.value;
  const category = categoryId.value;
  const focus = eventsFocus.value;

  return (
    <div class="app-shell">
      <div class="app-top">
        <Header view={currentView} />
        <StatusBar updatedAt={getUpdatedAt()} />
      </div>
      {currentView === 'news' ? (
        newsDetail !== null ? <NewsDetail id={newsDetail} /> : <NewsView />
      ) : currentView === 'bannerDetail' && bannerDetail !== null ? (
        <BannerDetail id={bannerDetail} units={units.value} />
      ) : currentView === 'banners' ? (
        <BannersView />
      ) : currentView === 'events' ? (
        <EventosView focus={focus} />
      ) : currentView === 'baba' ? (
        <BabaView />
      ) : currentView === 'categories' ? (
        <CategoryView id={category} units={units.value} />
      ) : detail !== null ? (
        units.value.length === 0 ? (
          <p class="empty-state">Cargando datos…</p>
        ) : (
          <div class="detail-scroll">
            <UnitDetail id={detail} />
          </div>
        )
      ) : units.value.length === 0 ? (
        <p class="empty-state">Cargando datos…</p>
      ) : (
        <>
          <FilterBar
            query={query.value}
            onQuery={(v) => {
              query.value = v;
            }}
            selectedTypes={selectedTypes.value}
            onToggleType={toggleType}
            selectedClasses={selectedClasses.value}
            onToggleClass={toggleClass}
            selectedRarities={selectedRarities.value}
            onToggleRarity={toggleRarity}
            sortBy={sortBy.value}
            onSortBy={(k) => {
              sortBy.value = k as SortKey;
            }}
            onClear={clearFilters}
            sortDesc={sortDesc.value}
            onToggleSort={toggleSort}
            count={lista.length}
          />
          {lista.length === 0 ? (
            <p class="empty-state">Sin resultados con los filtros actuales.</p>
          ) : (
            <UnitGrid units={lista} />
          )}
        </>
      )}
    </div>
  );
}
