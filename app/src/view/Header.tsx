import { manualRefresh, syncState } from '../model/sync';
import { formatDateTime } from '../model/format';
import type { View } from '../controller/router';

/** Barra superior fija: marca, navegación (5 secciones) y nota legal. */
export default function Header({ view }: { view: View }) {
  const onList = view === 'list' || view === 'detail' || view === 'categories';
  const onBanners = view === 'banners' || view === 'bannerDetail';
  const cls = (active: boolean): string => `app-header__link${active ? ' app-header__link--active' : ''}`;
  const cur = (active: boolean): 'page' | undefined => (active ? 'page' : undefined);
  // Señal: al terminar una sincronización (automática cada 5 min o manual) la
  // cabecera se repinta con la fecha/hora de la última actualización.
  // `lastSuccessAt` va en milisegundos; `formatDateTime` espera segundos.
  const sync = syncState.value;
  const lastOk = sync.lastSuccessAt;
  // Chip de resultado: lo que reportó la última corrida ("Al día", "+N
  // nuevas…", o el error amable si la fuente falló). Vacío en idle/checking
  // (el propio botón ya indica "Actualizando…").
  const status = sync.phase === 'checking' || sync.phase === 'idle' ? '' : sync.message;
  // Botón «Actualizar» de la cabecera: mientras corre la sincronización queda
  // deshabilitado (manualRefresh también ignora los pulsos repetidos).
  const busy = sync.phase === 'checking';

  return (
    <header class="app-header">
      <div class="app-header__row">
        <div class="app-header__brand">
          <span class="app-header__logo">DOKKAN FAN GUIDE</span>
          <span class="app-header__region">GLOBAL</span>
          <button
            type="button"
            class={`app-header__refresh${busy ? ' app-header__refresh--busy' : ''}`}
            onClick={() => void manualRefresh()}
            disabled={busy}
            title="Actualizar los datos ahora"
            aria-label="Actualizar los datos ahora"
          >
            {busy ? 'Actualizando…' : '⟳ Actualizar'}
          </button>
          {lastOk !== null && (
            <span class="app-header__updated" title="Última sincronización de los datos">
              Actualizado: {formatDateTime(lastOk / 1000)}
            </span>
          )}
          {status && (
            <span
              class={`app-header__status app-header__status--${sync.phase}`}
              role="status"
              aria-live="polite"
            >
              {status}
            </span>
          )}
        </div>
        <nav class="app-header__nav" aria-label="Secciones">
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
