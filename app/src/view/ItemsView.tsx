import { useState } from 'preact/hooks';
import { view } from '../controller/router';

/**
 * Vista "Items": contenedor para todas las sub-vistas de items.
 * Cada sub-pestaña muestra un tipo diferente de objeto.
 */
export default function ItemsView() {
  const currentView = view.value;

  // Extraer el tipo de item de la vista actual
  const itemType = currentView.replace('items', '').toLowerCase().replace('items', '');

  const itemTabs = [
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

  const activeTab = itemTabs.find(t => t.id === currentView) || itemTabs[0];

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        {/* Sub-tabs navigation */}
        <nav class="items-tabs" aria-label="Tipos de items">
          {itemTabs.map((tab) => (
            <a
              key={tab.id}
              class={`items-tab${tab.id === currentView ? ' items-tab--active' : ''}`}
              href={tab.href}
              aria-current={tab.id === currentView ? 'page' : undefined}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <div class="feed__head">
          <h2>Items · {activeTab.label}</h2>
        </div>

        <p class="empty-state">
          Vista de <strong>{activeTab.label}</strong> en desarrollo.
          Próximamente mostrará el listado completo con filtros, búsqueda y detalles.
        </p>
      </div>
    </div>
  );
}