import { useEffect, useState } from 'preact/hooks';
import { useListController } from '../controller/listController';
import UnitGrid from './UnitGrid';
import FilterBar from './FilterBar';

/**
 * Vista "Links": listado de todos los Link Skills disponibles.
 * Permite filtrar y buscar entre todos los links del juego.
 */
export default function LinksView() {
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
    sortBy,
    onSortBy,
    sortDesc,
    onToggleSort,
    onClear,
  } = useListController();

  // En esta vista mostramos los links, no las unidades
  // Por simplicidad, reutilizamos la estructura de listado

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        <div class="feed__head">
          <h2>Links</h2>
        </div>
        <p class="empty-state">Vista de Links en desarrollo. Próximamente mostrará todos los Link Skills con sus efectos, unidades que los poseen, y filtros por nombre/efecto.</p>
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
      </div>
    </div>
  );
}