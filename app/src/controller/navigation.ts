import { EVENT_TYPES } from '../model/game';
import { ITEM_PAGES } from '../model/dkPage';
import { BABA_SHOPS } from '../model/game';
import { babaShop, eventsType, itemsSlug, route, view } from './router';
import type { View } from './router';

/**
 * CONTROLADOR · Árbol de navegación (pestañas y sub-pestañas).
 *
 * ÚNICA fuente de verdad del menú: la cabecera (`view/Header.tsx`) pinta las
 * pestañas con sus desplegables y cada vista contenedor pinta la barra de
 * sub-pestañas de su sección (`view/SubTabs.tsx`) a partir de este árbol.
 * Reproduce el menú de dokkaninfo.com (mismo orden y agrupación).
 */

export interface NavItem {
  label: string;
  href: string;
  /** ¿Es la sub-pestaña visible ahora? */
  active: () => boolean;
}

export interface NavTab {
  id: string;
  label: string;
  href: string;
  active: () => boolean;
  subItems: NavItem[];
}

const isView = (...views: View[]) => (): boolean => views.includes(view.value);
const routeIs = (hash: string) => (): boolean => route.value.split('?')[0] === hash;

export const NAV_TABS: NavTab[] = [
  { id: 'recent', label: 'Recientes', href: '#/recientes', active: isView('recent'), subItems: [] },
  { id: 'news', label: 'News', href: '#/noticias', active: isView('news', 'newsDetail'), subItems: [] },
  {
    id: 'banners',
    label: 'Banners',
    href: '#/banners',
    active: isView('banners', 'bannerDetail'),
    subItems: [{ label: 'Banners', href: '#/banners', active: isView('banners', 'bannerDetail') }],
  },
  {
    id: 'cards',
    label: 'Cards',
    href: '#/cartas',
    active: isView('list', 'detail', 'categories', 'links', 'schedule'),
    subItems: [
      { label: 'Cards', href: '#/cartas', active: isView('list', 'detail') },
      { label: 'Categories', href: '#/cartas/categorias', active: isView('categories') },
      { label: 'Links', href: '#/cartas/links', active: isView('links') },
      { label: 'Schedule', href: '#/cartas/calendario', active: isView('schedule') },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    href: '#/eventos',
    active: isView('events'),
    subItems: EVENT_TYPES.map((t) => ({
      label: t.label,
      href: `#/eventos/${t.slug}`,
      active: () => view.value === 'events' && eventsType.value === t.type,
    })),
  },
  {
    id: 'items',
    label: 'Items',
    href: `#/items/${ITEM_PAGES[0].slug}`,
    active: isView('items'),
    subItems: ITEM_PAGES.map((p, i) => ({
      label: p.label,
      href: `#/items/${p.slug}`,
      active: () => view.value === 'items' && (itemsSlug.value === p.slug || (i === 0 && !itemsSlug.value)),
    })),
  },
  {
    id: 'missions',
    label: 'Missions',
    href: '#/misiones',
    active: isView('missions', 'panelMissions'),
    subItems: [
      { label: 'Missions', href: '#/misiones', active: isView('missions') },
      { label: 'Panel Missions', href: '#/misiones/panel', active: isView('panelMissions') },
    ],
  },
  {
    id: 'baba',
    label: "Baba's Shop",
    href: '#/baba',
    active: isView('baba'),
    subItems: BABA_SHOPS.map((s, i) => ({
      label: s.label,
      href: `#/baba/${s.slug}`,
      active: () => view.value === 'baba' && (babaShop.value === s.slug || (i === 0 && !babaShop.value)),
    })),
  },
  {
    id: 'tools',
    label: 'Tools',
    href: '#/herramientas/link-tool',
    active: isView('toolsLinkTool', 'toolsLeaderSkill'),
    subItems: [
      { label: 'Link Tool', href: '#/herramientas/link-tool', active: isView('toolsLinkTool') },
      { label: '200%+ Leader Skill', href: '#/herramientas/leader-skill', active: isView('toolsLeaderSkill') },
    ],
  },
  { id: 'info', label: 'Info', href: '#/info', active: routeIs('#/info'), subItems: [] },
  { id: 'settings', label: 'Ajustes', href: '#/ajustes', active: isView('settings'), subItems: [] },
];

/** Sub-pestañas de una sección (para la barra bajo la cabecera). */
export const subTabsOf = (id: string): NavItem[] => NAV_TABS.find((t) => t.id === id)?.subItems ?? [];
