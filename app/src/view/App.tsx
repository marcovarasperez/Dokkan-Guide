import { useEffect } from 'preact/hooks';
import {
  bannerDetailId,
  categoryId,
  detailId,
  eventsFocus,
  initRouter,
  newsDetailId,
  view,
} from '../controller/router';
import { useListController } from '../controller/listController';
import Header from './Header';
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
import { SettingsView } from './SettingsView';

/** Aplica el tema guardado (dark por defecto) al arrancar */
function applySavedTheme(): void {
  try {
    const stored = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const theme = (stored === 'dark' || stored === 'light') ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

/**
 * VISTA · Shell de la aplicación.
 *
 * Pinta la cabecera y la vista que corresponda a la ruta actual.
 * Toda la lógica vive fuera:
 *   - rutas y vista activa → `controller/router.ts`
 *   - búsqueda, filtros y orden del listado → `controller/listController.ts`
 *   - el resto de controladores, uno por vista con datos
 *     (`controller/unitDetailController.ts`, `eventsController.ts`, …).
 */
export default function App() {
  // Aplicar tema al montar
  useEffect(applySavedTheme, []);

  // Router por hash (#/ personajes, #/characters/{id}, #/banners, #/eventos…)
  useEffect(() => initRouter(), []);

  const {
    units,
    list,
    count,
    query,
    onQuery,
    selectedTypes,
    onToggleType,
    selectedClasses,
    onToggleClass,
    selectedRarities,
    onToggleRarity,
    onClear,
    sortBy,
    onSortBy,
    sortDesc,
    onToggleSort,
  } = useListController();

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
      </div>
      {currentView === 'news' ? (
        newsDetail !== null ? <NewsDetail id={newsDetail} /> : <NewsView />
      ) : currentView === 'bannerDetail' && bannerDetail !== null ? (
        <BannerDetail id={bannerDetail} units={units} />
      ) : currentView === 'banners' ? (
        <BannersView />
      ) : currentView === 'events' ? (
        <EventosView focus={focus} />
      ) : currentView === 'baba' ? (
        <BabaView />
      ) : currentView === 'settings' ? (
        <SettingsView />
      ) : currentView === 'categories' ? (
        <CategoryView id={category} units={units} />
      ) : detail !== null ? (
        units.length === 0 ? (
          <p class="empty-state">Cargando datos…</p>
        ) : (
          <div class="detail-scroll">
            <UnitDetail id={detail} />
          </div>
        )
      ) : units.length === 0 ? (
        <p class="empty-state">Cargando datos…</p>
      ) : (
        <>
          <FilterBar
            query={query}
            onQuery={onQuery}
            selectedTypes={selectedTypes}
            onToggleType={onToggleType}
            selectedClasses={selectedClasses}
            onToggleClass={onToggleClass}
            selectedRarities={selectedRarities}
            onToggleRarity={onToggleRarity}
            sortBy={sortBy}
            onSortBy={onSortBy}
            onClear={onClear}
            sortDesc={sortDesc}
            onToggleSort={onToggleSort}
            count={count}
          />
          {count === 0 ? (
            <p class="empty-state">Sin resultados con los filtros actuales.</p>
          ) : (
            <UnitGrid units={list} />
          )}
        </>
      )}
    </div>
  );
}
