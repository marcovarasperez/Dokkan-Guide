import { useState, useEffect, useRef } from 'preact/hooks';
import { syncState, manualRefresh } from '../model/sync';
import { formatDateTime } from '../model/format';
import type { View } from '../controller/router';

/** Barra superior fija: marca, navegación (dropdowns) y nota legal. */
export default function Header({ view }: { view: View }) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLNavElement>(null);

  const cls = (active: boolean): string => `app-header__link${active ? ' app-header__link--active' : ''}`;
  const cur = (active: boolean): 'page' | undefined => (active ? 'page' : undefined);

  const sync = syncState.value;
  const lastOk = sync.lastSuccessAt;
  const isSyncing = sync.phase === 'checking';
  const isError = sync.phase === 'error';

  const handleManualRefresh = async () => {
    await manualRefresh();
  };

  const isActive = (views: View[]): boolean => views.includes(view);

  // Definición de las pestañas con sus sub-opciones
  const tabs = [
    {
      id: 'recent',
      label: 'Recientes',
      href: '#/recientes',
      active: view === 'recent',
      subItems: [],
    },
    {
      id: 'news',
      label: 'News',
      href: '#/noticias',
      active: isActive(['news', 'newsDetail']),
      subItems: [],
    },
    {
      id: 'banners',
      label: 'Banners',
      href: '#/banners',
      active: isActive(['banners', 'bannerDetail', 'bannerAnimations']),
      subItems: [
        { label: 'Banners', href: '#/banners' },
        { label: 'Banner Animations', href: '#/banners/animaciones' },
      ],
    },
    {
      id: 'cards',
      label: 'Cards',
      href: '#/cartas',
      active: isActive(['cards', 'categories', 'links', 'detail']),
      subItems: [
        { label: 'Cards', href: '#/cartas' },
        { label: 'Categories', href: '#/cartas/categorias' },
        { label: 'Links', href: '#/cartas/links' },
      ],
    },
    {
      id: 'events',
      label: 'Events',
      href: '#/eventos',
      active: isActive([
        'events', 'eventsBurst', 'eventsBonus', 'eventsDbStories',
        'eventsExtremeZBattle', 'eventsGrowth', 'eventsLimited',
        'eventsPettanBattle', 'eventsQuest', 'eventsStory',
        'eventsDokkanFrontier', 'eventsUltimateClash', 'eventsWorldTournament'
      ]),
      subItems: [
        { label: 'Burst Mode', href: '#/eventos/burst' },
        { label: 'Bonus', href: '#/eventos/bonus' },
        { label: 'DB Stories', href: '#/eventos/dbstories' },
        { label: 'Extreme Z Battle', href: '#/eventos/extreme-z-battle' },
        { label: 'Growth', href: '#/eventos/growth' },
        { label: 'Limited', href: '#/eventos/limited' },
        { label: 'Pettan Battle', href: '#/eventos/pettan-battle' },
        { label: 'Quest', href: '#/eventos/quest' },
        { label: 'Story', href: '#/eventos/story' },
        { label: 'Dokkan Frontier', href: '#/eventos/dokkan-frontier' },
        { label: 'Ultimate Clash', href: '#/eventos/ultimate-clash' },
        { label: 'World Tournament', href: '#/eventos/world-tournament' },
      ],
    },
    {
      id: 'items',
      label: 'Items',
      href: '#/items',
      active: isActive([
        'items', 'itemsMeat', 'itemsAwakeningMedals', 'itemsEquipment',
        'itemsKeys', 'itemsPotentialItems', 'itemsSpecialItems',
        'itemsStickers', 'itemsSupportItems', 'itemsSupportMemories',
        'itemsTrainingFields', 'itemsTrainingItems', 'itemsTreasureItems',
        'itemsWallpapers'
      ]),
      subItems: [
        { label: 'Meat', href: '#/items/carne' },
        { label: 'Awakening Medals', href: '#/items/medallas-despertar' },
        { label: 'Equipment', href: '#/items/equipamiento' },
        { label: 'Keys', href: '#/items/llaves' },
        { label: 'Potential Items', href: '#/items/objetos-potencial' },
        { label: 'Special Items', href: '#/items/objetos-especiales' },
        { label: 'Stickers', href: '#/items/stickers' },
        { label: 'Support Items', href: '#/items/objetos-apoyo' },
        { label: 'Support Memories', href: '#/items/memorias-apoyo' },
        { label: 'Training Fields', href: '#/items/campos-entrenamiento' },
        { label: 'Training Items', href: '#/items/objetos-entrenamiento' },
        { label: 'Treasure Items', href: '#/items/objetos-tesoro' },
        { label: 'Wallpapers', href: '#/items/wallpapers' },
      ],
    },
    {
      id: 'missions',
      label: 'Missions',
      href: '#/misiones',
      active: isActive(['missions', 'panelMissions']),
      subItems: [
        { label: 'Missions', href: '#/misiones' },
        { label: 'Panel Missions', href: '#/misiones/panel' },
      ],
    },
    {
      id: 'baba',
      label: 'Baba',
      href: '#/baba',
      active: view === 'baba',
      subItems: [],
    },
    {
      id: 'tools',
      label: 'Tools',
      href: '#/herramientas',
      active: isActive(['tools', 'toolsLinkTool', 'toolsLeaderSkill']),
      subItems: [
        { label: 'Link Tool', href: '#/herramientas/link-tool' },
        { label: '200% + Leader Skill', href: '#/herramientas/leader-skill' },
      ],
    },
    {
      id: 'info',
      label: 'Info',
      href: '#/info',
      active: view === 'info',
      subItems: [],
    },
    {
      id: 'settings',
      label: 'Ajustes',
      href: '#/ajustes',
      active: view === 'settings',
      subItems: [],
    },
  ];

  const toggleDropdown = (id: string, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpenDropdown(openDropdown === id ? null : id);
  };

  const closeDropdowns = () => {
    setOpenDropdown(null);
  };

  // Cerrar dropdowns al hacer click/tap fuera (FUNCIONA EN TODAS LAS PLATAFORMAS)
  // En escritorio usa hover CSS, pero en móvil (touch) necesitamos JS
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        closeDropdowns();
      }
    };
    document.addEventListener('click', handleClickOutside, true);
    document.addEventListener('touchstart', handleClickOutside, true);
    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, []);

  // Cerrar dropdowns al navegar (cambio de vista)
  useEffect(() => {
    closeDropdowns();
  }, [view]);

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

        <nav class="app-header__nav" aria-label="Secciones principales" ref={navRef}>
          {tabs.map((tab) => (
            <div key={tab.id} class="app-header__dropdown">
              {tab.subItems.length > 0 ? (
                // Tabs CON submenú: botón que abre dropdown
                <button
                  class={`${cls(tab.active)} app-header__dropdown-trigger`}
                  aria-current={cur(tab.active)}
                  aria-haspopup="true"
                  aria-expanded={openDropdown === tab.id}
                  onClick={(e) => toggleDropdown(tab.id, e)}
                  style={{ background: 'transparent', border: 'none', padding: '6px 10px', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                >
                  {tab.label}
                  <span class="app-header__chevron">▼</span>
                </button>
              ) : (
                // SIN submenú: enlace directo para navegación
                <a
                  class={cls(tab.active)}
                  href={tab.href}
                  aria-current={cur(tab.active)}
                >
                  {tab.label}
                </a>
              )}
              {tab.subItems.length > 0 && openDropdown === tab.id && (
                <div class="app-header__dropdown-menu" role="menu">
                  {tab.subItems.map((item, idx) => (
                    <a
                      key={idx}
                      class="app-header__dropdown-item"
                      href={item.href}
                      role="menuitem"
                      onClick={closeDropdowns}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
      <p class="app-header__legal">Proyecto fan no comercial · Datos: DOKKANINFO</p>
    </header>
  );
}