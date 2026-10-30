import { syncState, manualRefresh } from '../model/sync';
import { formatDateTime } from '../model/format';
import type { View } from '../controller/router';

/** Barra superior fija: marca, navegación (5 secciones) y nota legal. */
export default function Header({ view }: { view: View }) {
  const onList = view === 'list' || view === 'detail' || view === 'categories';
  const onBanners = view === 'banners' || view === 'bannerDetail';
  const cls = (active: boolean): string => `app-header__link${active ? ' app-header__link--active' : ''}`;
  const cur = (active: boolean): 'page' | undefined => (active ? 'page' : undefined);
  const sync = syncState.value;
  const lastOk = sync.lastSuccessAt;
  const isSyncing = sync.phase === 'checking';
  const isError = sync.phase === 'error';

  const handleManualRefresh = async () => {
    await manualRefresh();
  };

  return (
    <header class="app-header">
      <div class="app-header__row">
        <div class="app-header__brand">
          <span class="app-header__logo">DOKKAN FAN GUIDE</span>
          <span class="app-header__region">GLOBAL</span>
        </div>

        {/* Centro: estado de sincronización / botón de actualizar */}
        <div class="app-header__center">
          {isError && sync.message && (
            <span class="app-header__sync-error" title="Error en la última actualización">
              ⚠ {sync.message} {lastOk !== null ? `· {formatDateTime(lastOk / 1000)}` : ''}
            </span>
          )}
          {!isError && lastOk !== null && (
            <span class="app-header__updated" title="Última sincronización de los datos">
              Actualizado: {formatDateTime(lastOk / 1000)}
            </span>
          )}
          {!isError && lastOk === null && !isSyncing && (
            <span class="app-header__updated" title="Sin sincronización previa">
              Sin actualizar
            </span>
          )}
          {isSyncing && (
            <span class="app-header__sync-pending">
              🔄 Comprobando actualizaciones…
            </span>
          )}
          {!isSyncing && !isError && (
            <button
              type="button"
              class="app-header__refresh-btn"
              onClick={handleManualRefresh}
              aria-label="Actualizar datos desde dokkaninfo.com"
              title="Actualizar datos"
            >
              ⟳
            </button>
          )}
        </div>

        <nav class="app-header__nav" aria-label="Secciones">
          <a class={cls(view === 'recent')} href="#/recientes" aria-current={cur(view === 'recent')}>
            Recientes
          </a>
          <a class={cls(onList)} href="#/" aria-current={cur(onList)}>
            Personajes
          </a>
          <a class={cls(onBanners)} href="#/banners" aria-current={cur(onBanners)}>
            Banners
          </a>
          <a class={cls(view === 'events')} href="#/eventos" aria-current={cur(view === 'events')}>
            Eventos
          </a>
          <a class={cls(view === 'baba')} href="#/baba" aria-current={cur(view === 'baba')}>
            Baba
          </a>
          <a class={cls(view === 'news')} href="#/noticias" aria-current={cur(view === 'news')}>
            Noticias
          </a>
          <a class={cls(view === 'settings')} href="#/ajustes" aria-current={cur(view === 'settings')}>
            Ajustes
          </a>
        </nav>
      </div>
      <p class="app-header__legal">Proyecto fan no comercial · Datos: DOKKANINFO</p>
    </header>
  );
}
