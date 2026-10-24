import type { View } from './App';

/** Barra superior fija: marca, navegación (5 secciones) y nota legal. */
export default function Header({ view }: { view: View }) {
  const onList = view === 'list' || view === 'detail' || view === 'categories';
  const onBanners = view === 'banners' || view === 'bannerDetail';
  const cls = (active: boolean): string => `app-header__link${active ? ' app-header__link--active' : ''}`;
  const cur = (active: boolean): 'page' | undefined => (active ? 'page' : undefined);

  return (
    <header class="app-header">
      <div class="app-header__row">
        <div class="app-header__brand">
          <span class="app-header__logo">DOKKAN FAN GUIDE</span>
          <span class="app-header__region">GLOBAL</span>
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
            Tienda de Baba
          </a>
          <a class={cls(view === 'news')} href="#/noticias" aria-current={cur(view === 'news')}>
            Noticias
          </a>
        </nav>
      </div>
      <p class="app-header__legal">Proyecto fan no comercial · Datos: DOKKANINFO</p>
    </header>
  );
}
