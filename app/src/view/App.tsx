import { useEffect, useState } from 'preact/hooks';
import {
  bannerDetailId,
  categoryId,
  detailId,
  eventsFocus,
  EVENT_VIEWS,
  initRouter,
  ITEM_VIEWS,
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
import RecentView from './RecentView';
import LinksView from './LinksView';
import ItemsView from './ItemsView';
import MissionsView from './MissionsView';
import ToolsView from './ToolsView';
import InfoView from './InfoView';
import { manualRefresh, syncState } from '../model/sync';
import { requestPermission, setNotificationPermissionAsked, areNotificationsEnabled, hasAskedNotificationPermission } from '../model/notifications';
import { readSyncMeta } from '../model/repository';
import { applyTheme, getSavedTheme } from '../model/theme';

/** Clave localStorage para marcar primera ejecución completada */
const FIRST_RUN_KEY = 'firstRunComplete';

/** Componente: Pantalla de primera ejecución (solo sincronización inicial) */
function FirstRunScreen({ onComplete }: { onComplete: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async () => {
    setSyncing(true);
    setError(null);
    try {
      await manualRefresh();
      // Marcar primera ejecución como completada
      try { localStorage.setItem(FIRST_RUN_KEY, 'true'); } catch {}
      // Navegar a Recientes tras la primera sincronización
      window.location.hash = '#/recientes';
      onComplete();
    } catch (e) {
      setError('Error al sincronizar. Comprueba tu conexión e inténtalo de nuevo.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div class="first-run-screen">
      <div class="first-run-content">
        <h1 class="first-run-title">Dokkan Fan Guide</h1>
        <p class="first-run-message">
          Bienvenido. Para usar la aplicación es necesario sincronizar los datos
          desde <strong>dokkaninfo.com</strong>.
        </p>
        <p class="first-run-message" style="margin-top: 12px; font-size: 13px; color: var(--text-dim);">
          Este proceso solo se hace la <strong>primera vez</strong> y puede tardar
          <strong> dependiendo de tu conexión</strong>.
        </p>
        <button
          class="btn btn-primary first-run-btn"
          onClick={handleUpdate}
          disabled={syncing}
        >
          {syncing ? '⏳ Sincronizando…' : '🔄 Actualizar ahora'}
        </button>
        {error && <p class="first-run-error">{error}</p>}
        <p class="first-run-hint">La app comprueba novedades automáticamente cada 5 minutos.</p>
      </div>
    </div>
  );
}

/** Componente: Modal de permiso de notificaciones (overlay sobre la app) */
function NotificationPermissionModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  const handleChoice = async (allow: boolean) => {
    setNotificationPermissionAsked();
    if (allow) {
      await requestPermission();
    } else {
      try { localStorage.setItem('notifyNewUnits', 'false'); } catch {}
    }
    onClose();
  };

  return (
    <div class="modal-overlay notif-permission-modal" onClick={onClose}>
      <div class="modal notif-permission-content" onClick={(e) => e.stopPropagation()}>
        <h3>🔔 Notificaciones de nuevos personajes</h3>
        <p style="margin: 12px 0 8px; font-size: 15px; line-height: 1.5;">
          ¿Deseas recibir un aviso cuando la app detecte un <strong>nuevo personaje</strong> en dokkaninfo.com?
        </p>
        <p style="margin: 0 0 20px; font-size: 13px; color: var(--text-dim);">
          Podrás cambiarlo luego en <strong>Ajustes → Notificaciones</strong>.
        </p>
        <div style="display: flex; gap: 12px;">
          <button
            class="btn btn-secondary"
            style="flex: 1;"
            onClick={() => handleChoice(false)}
          >
            Ahora no
          </button>
          <button
            class="btn btn-primary"
            style="flex: 1;"
            onClick={() => handleChoice(true)}
          >
            ✅ Activar
          </button>
        </div>
      </div>
    </div>
  );
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
  const [showFirstRun, setShowFirstRun] = useState(() => {
    try {
      return localStorage.getItem(FIRST_RUN_KEY) !== 'true';
    } catch {
      return true; // si no hay localStorage, mostrar
    }
  });
  const [showNotifModal, setShowNotifModal] = useState(false);

  // Aplicar tema al montar
  useEffect(() => applyTheme(getSavedTheme()), []);

  // Restaurar última sincronización persistida al arrancar
  useEffect(() => {
    readSyncMeta().then((meta) => {
      if (meta.lastSuccessAt != null) {
        syncState.value = { ...syncState.value, lastSuccessAt: meta.lastSuccessAt };
      }
    });
  }, []);

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
    selectedCategories,
    onToggleCategory,
    categoryFilterMode,
    onToggleCategoryMode,
    categoriesIndex,
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

  // Si primera ejecución → pantalla onboarding
  if (showFirstRun) {
    return (
      <FirstRunScreen
        onComplete={() => {
          setShowFirstRun(false);
          // Tras completar primera sincronización, mostrar modal de notificaciones si procede
          const notifEnabled = areNotificationsEnabled();
          if (notifEnabled && !hasAskedNotificationPermission()) {
            setShowNotifModal(true);
          }
        }}
      />
    );
  }

  // Helper para vistas que usan el listado de personajes con filtros
  const isListView = currentView === 'list' || currentView === 'cards' || currentView === 'categories' || currentView === 'links';
  const isDetailView = currentView === 'detail';
  const isNewsView = currentView === 'news' || currentView === 'newsDetail';
  const isBannersView = currentView === 'banners' || currentView === 'bannerDetail' || currentView === 'bannerAnimations';
  const isEventsView = EVENT_VIEWS.includes(currentView);
  const isItemsView = ITEM_VIEWS.includes(currentView);
  const isMissionsView = currentView === 'missions' || currentView === 'panelMissions';
  const isToolsView = currentView === 'tools' || currentView === 'toolsLinkTool' || currentView === 'toolsLeaderSkill';

  return (
    <div class="app-shell">
      <div class="app-top">
        <Header view={currentView} />
      </div>
      {currentView === 'recent' ? (
        <RecentView />
      ) : isNewsView ? (
        newsDetail !== null ? <NewsDetail id={newsDetail} /> : <NewsView />
      ) : isBannersView && bannerDetail !== null ? (
        <BannerDetail id={bannerDetail} units={units} />
      ) : isBannersView ? (
        <BannersView />
      ) : isEventsView ? (
        <EventosView focus={focus} />
      ) : isItemsView ? (
        <ItemsView />
      ) : isMissionsView ? (
        <MissionsView />
      ) : currentView === 'baba' ? (
        <BabaView />
      ) : isToolsView ? (
        <ToolsView />
      ) : currentView === 'info' ? (
        <InfoView />
      ) : currentView === 'settings' ? (
        <SettingsView />
      ) : currentView === 'categories' ? (
        <CategoryView id={category} units={units} />
      ) : currentView === 'links' ? (
        <LinksView />
      ) : isDetailView ? (
        units.length === 0 ? (
          <p class="empty-state">Cargando datos…</p>
        ) : (
          <div class="detail-scroll">
            <UnitDetail id={detail} />
          </div>
        )
      ) : isListView ? (
        units.length === 0 ? (
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
              selectedCategories={selectedCategories}
              onToggleCategory={onToggleCategory}
              categoryFilterMode={categoryFilterMode}
              onToggleCategoryMode={onToggleCategoryMode}
              categoriesIndex={categoriesIndex}
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
            selectedCategories={selectedCategories}
            onToggleCategory={onToggleCategory}
            categoryFilterMode={categoryFilterMode}
            onToggleCategoryMode={onToggleCategoryMode}
            categoriesIndex={categoriesIndex}
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
      {/* Modal de permiso de notificaciones (overlay sobre la app) */}
      <NotificationPermissionModal
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
      />
    </div>
  );
}