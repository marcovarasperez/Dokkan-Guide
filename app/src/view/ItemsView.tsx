import { view } from '../controller/router';
import SubTabs, { activeSubTab, type SubTab } from './SubTabs';

const ITEM_TABS: SubTab[] = [
  { id: 'items', label: 'Todos', href: '#/items' },
  { id: 'itemsMeat', label: 'Meat', href: '#/items/carne' },
  { id: 'itemsAwakeningMedals', label: 'Awakening Medals', href: '#/items/medallas-despertar' },
  { id: 'itemsEquipment', label: 'Equipment', href: '#/items/equipamiento' },
  { id: 'itemsKeys', label: 'Keys', href: '#/items/llaves' },
  { id: 'itemsPotentialItems', label: 'Potential Items', href: '#/items/objetos-potencial' },
  { id: 'itemsSpecialItems', label: 'Special Items', href: '#/items/objetos-especiales' },
  { id: 'itemsStickers', label: 'Stickers', href: '#/items/stickers' },
  { id: 'itemsSupportItems', label: 'Support Items', href: '#/items/objetos-apoyo' },
  { id: 'itemsSupportMemories', label: 'Support Memories', href: '#/items/memorias-apoyo' },
  { id: 'itemsTrainingFields', label: 'Training Fields', href: '#/items/campos-entrenamiento' },
  { id: 'itemsTrainingItems', label: 'Training Items', href: '#/items/objetos-entrenamiento' },
  { id: 'itemsTreasureItems', label: 'Treasure Items', href: '#/items/objetos-tesoro' },
  { id: 'itemsWallpapers', label: 'Wallpapers', href: '#/items/wallpapers' },
];

/**
 * Vista "Items": contenedor para todas las sub-vistas de items.
 * Cada sub-pestaña muestra un tipo diferente de objeto.
 */
export default function ItemsView() {
  const currentView = view.value;
  const activeTab = activeSubTab(ITEM_TABS, currentView);

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        <SubTabs tabs={ITEM_TABS} currentView={currentView} navLabel="Tipos de items" title="Items" />

        <p class="empty-state">
          Vista de <strong>{activeTab.label}</strong> en desarrollo.
          Próximamente mostrará el listado completo con filtros, búsqueda y detalles.
        </p>
      </div>
    </div>
  );
}
