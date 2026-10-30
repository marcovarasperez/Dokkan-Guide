import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import type { UnitClass, UnitRarity, UnitType } from '../model/types';
import { TYPE_COLORS, CLASS_COLORS, RARITY_COLORS } from '../model/adapter';
import type { CategoryEntry } from '../model/wiki';

const TYPES: UnitType[] = ['AGL', 'TEQ', 'INT', 'STR', 'PHY'];
const CLASSES: { key: UnitClass; label: string }[] = [
  { key: 'Super', label: 'Súper' },
  { key: 'Extreme', label: 'Extremo' },
];
const RARITIES: UnitRarity[] = ['N', 'R', 'SR', 'SSR', 'UR', 'LR'];

/** Criterios de orden estilo lista de personajes del juego. */
const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'recent', label: 'Última novedad' },
  { key: 'name', label: 'Nombre (A-Z)' },
  { key: 'rarity', label: 'Rareza' },
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' },
  { key: 'cost', label: 'Coste' },
];

interface FilterBarProps {
  query: string;
  onQuery: (v: string) => void;
  selectedTypes: UnitType[];
  onToggleType: (t: UnitType) => void;
  selectedClasses: UnitClass[];
  onToggleClass: (c: UnitClass) => void;
  selectedRarities: UnitRarity[];
  onToggleRarity: (r: UnitRarity) => void;
  selectedCategories: number[];
  onToggleCategory: (catId: number) => void;
  categoryFilterMode: 'any' | 'all';
  onToggleCategoryMode: () => void;
  categoriesIndex: { categories: CategoryEntry[] } | null;
  sortBy: string;
  onSortBy: (k: string) => void;
  onClear: () => void;
  sortDesc: boolean;
  onToggleSort: () => void;
  count: number;
}

/**
 * Buscador SIEMPRE visible + SELECTOR DE FILTROS desplegable a su lado
 * (se abre/cierra cuando el jugador lo desea; buscar funciona sin desplegar).
 * El panel guarda tipo/clase/rareza, orden multi-criterio y el acceso a
 * Categorías; un indicador cuenta los filtros activos cuando está plegado.
 */
export default function FilterBar(props: FilterBarProps) {
  const {
    query, onQuery, selectedTypes, onToggleType,
    selectedClasses, onToggleClass, selectedRarities, onToggleRarity,
    selectedCategories, onToggleCategory, categoryFilterMode, onToggleCategoryMode,
    categoriesIndex,
    sortBy, onSortBy, onClear, sortDesc, onToggleSort,
  } = props;
  const [open, setOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const catDropdownRef = useRef<HTMLDivElement>(null);
  const catTriggerRef = useRef<HTMLButtonElement>(null);

  const hasFilters =
    selectedTypes.length > 0 || selectedClasses.length > 0 || selectedRarities.length > 0 || selectedCategories.length > 0;
  const nonDefaultSort = sortBy !== 'recent' || sortDesc;
  const activeCount = selectedTypes.length + selectedClasses.length + selectedRarities.length + selectedCategories.length;

  const sortOption = SORT_OPTIONS.find(o => o.key === sortBy)?.label ?? 'Última novedad';

  // Filtrar categorías por búsqueda
  const filteredCategories = useMemo(() =>
    categoriesIndex?.categories
      .filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')) ?? [],
    [categoriesIndex, catSearch]
  );

  // Categorías seleccionadas con info
  const selectedCatsInfo = useMemo(() =>
    selectedCategories.map(id => categoriesIndex?.categories.find(c => c.id === id)).filter(Boolean) as CategoryEntry[],
    [selectedCategories, categoriesIndex]
  );

  const handleCategoryChange = (catId: number) => {
    onToggleCategory(catId);
  };

  const clearCategories = () => {
    selectedCategories.forEach((id) => onToggleCategory(id));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node)) {
        if (catTriggerRef.current && !catTriggerRef.current.contains(e.target as Node)) {
          setCatOpen(false);
          setCatSearch('');
        }
      }
    }
    if (catOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [catOpen]);

  // Reset search when closing
  const toggleCatOpen = () => {
    setCatOpen(!catOpen);
    if (!catOpen) setCatSearch('');
  };

  return (
    <div class="filter-bar">
      <input
        type="search"
        class="filter-bar__input"
        placeholder="Buscar personaje…"
        value={query}
        onInput={(e) => onQuery((e.target as HTMLInputElement).value)}
      />
      <button
        type="button"
        class={`filter-bar__toggle${open ? ' filter-bar__toggle--on' : ''}`}
        aria-expanded={open}
        aria-controls="filter-panel"
        onClick={() => setOpen(!open)}
      >
        <span class="filter-bar__caret" aria-hidden="true">▼</span>
        Filtros
        {activeCount > 0 && <b class="filter-bar__badge">{activeCount}</b>}
      </button>

      {open && (
        <div class="filter-bar__panel" id="filter-panel" role="group" aria-label="Filtros y orden">

          {/* Afinidad - chips simples */}
          <fieldset class="filter-bar__section">
            <legend class="filter-bar__legend">Afinidad</legend>
            <div class="filter-bar__chips" role="group" aria-label="Filtrar por afinidad">
              {TYPES.map((t) => {
                const on = selectedTypes.includes(t);
                const color = TYPE_COLORS[t];
                return (
                  <button
                    type="button"
                    key={t}
                    class={`filter-chip${on ? ' filter-chip--on' : ''}`}
                    aria-pressed={on}
                    style={{ '--chip-color': color }}
                    onClick={() => onToggleType(t)}
                    title={t}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Clase - chips simples */}
          <fieldset class="filter-bar__section">
            <legend class="filter-bar__legend">Clase</legend>
            <div class="filter-bar__chips" role="group" aria-label="Filtrar por clase">
              {CLASSES.map((c) => {
                const on = selectedClasses.includes(c.key);
                const color = CLASS_COLORS[c.key];
                return (
                  <button
                    type="button"
                    key={c.key}
                    class={`filter-chip${on ? ' filter-chip--on' : ''}`}
                    aria-pressed={on}
                    style={{ '--chip-color': color }}
                    onClick={() => onToggleClass(c.key)}
                    title={c.label}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Rareza - chips simples */}
          <fieldset class="filter-bar__section">
            <legend class="filter-bar__legend">Rareza</legend>
            <div class="filter-bar__chips" role="group" aria-label="Filtrar por rareza">
              {RARITIES.map((r) => {
                const on = selectedRarities.includes(r);
                const color = RARITY_COLORS[r];
                return (
                  <button
                    type="button"
                    key={r}
                    class={`filter-chip${on ? ' filter-chip--on' : ''}`}
                    aria-pressed={on}
                    style={{ '--chip-color': color }}
                    onClick={() => onToggleRarity(r)}
                    title={r}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Categorías - dropdown compacto */}
          <fieldset class="filter-bar__section filter-bar__section--categories">
            <legend class="filter-bar__legend">Categoría</legend>

            <div class="filter-bar__cat-dropdown">
              <button
                ref={catTriggerRef}
                type="button"
                class={`filter-bar__cat-trigger${catOpen ? ' filter-bar__cat-trigger--open' : ''}`}
                onClick={toggleCatOpen}
                aria-expanded={catOpen}
                aria-haspopup="listbox"
                aria-label={`Categoría${selectedCategories.length > 0 ? `, ${selectedCategories.length} seleccionada${selectedCategories.length > 1 ? 's' : ''}` : ''}`}
              >
                <span class="filter-bar__cat-trigger-label">Categoría</span>
                {selectedCategories.length > 0 && (
                  <span class="filter-bar__cat-trigger-count">{selectedCategories.length}</span>
                )}
                <span class="filter-bar__cat-trigger-arrow" aria-hidden="true">{catOpen ? '▲' : '▼'}</span>
              </button>

              {catOpen && (
                <div ref={catDropdownRef} class="filter-bar__cat-dropdown-panel" role="listbox" aria-label="Seleccionar categorías">
                  <div class="filter-bar__cat-dropdown-header">
                    <input
                      type="search"
                      class="filter-bar__cat-search"
                      placeholder="Buscar categoría…"
                      value={catSearch}
                      onInput={(e) => setCatSearch((e.target as HTMLInputElement).value)}
                      aria-label="Buscar categoría"
                      autoFocus
                    />
                    <div class="filter-bar__cat-mode">
                      <button
                        type="button"
                        class={`filter-bar__mode-btn${categoryFilterMode === 'any' ? ' filter-bar__mode-btn--active' : ''}`}
                        onClick={onToggleCategoryMode}
                        aria-pressed={categoryFilterMode === 'any'}
                      >
                        Cualquiera
                      </button>
                      <button
                        type="button"
                        class={`filter-bar__mode-btn${categoryFilterMode === 'all' ? ' filter-bar__mode-btn--active' : ''}`}
                        onClick={onToggleCategoryMode}
                        aria-pressed={categoryFilterMode === 'all'}
                      >
                        Todas
                      </button>
                    </div>
                    {selectedCategories.length > 0 && (
                      <button
                        type="button"
                        class="filter-bar__category-clear"
                        onClick={clearCategories}
                        aria-label="Limpiar filtro de categoría"
                      >
                        Limpiar todo
                      </button>
                    )}
                  </div>
                  <div class="filter-bar__cat-dropdown-list" role="group" aria-label="Lista de categorías">
                    {filteredCategories.map((c) => {
                      const on = selectedCategories.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={on}
                          class={`filter-bar__cat-item${on ? ' filter-bar__cat-item--on' : ''}`}
                          onClick={() => handleCategoryChange(c.id)}
                        >
                          <span class="filter-bar__cat-name">{c.name}</span>
                          {on && <span class="filter-bar__cat-check" aria-hidden="true">✓</span>}
                        </button>
                      );
                    })}
                    {filteredCategories.length === 0 && categoriesIndex && (
                      <div class="filter-bar__cat-empty">Sin coincidencias</div>
                    )}
                    {!categoriesIndex && (
                      <div class="filter-bar__cat-empty">Cargando categorías…</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {/* Orden - dropdown simplificado con botón de dirección integrado */}
          <fieldset class="filter-bar__section filter-bar__section--sort">
            <legend class="filter-bar__legend">Orden</legend>
            <div class="filter-bar__sort-wrap">
              <div class="filter-bar__sort-select-wrap">
                <select
                  class="filter-bar__sort-select"
                  value={sortBy}
                  onChange={(e) => onSortBy((e.target as HTMLSelectElement).value)}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  class="filter-bar__sort-dir"
                  aria-label={sortDesc ? 'Descendente' : 'Ascendente'}
                  aria-pressed={sortDesc}
                  onClick={onToggleSort}
                >
                  {sortDesc ? '▼' : '▲'}
                </button>
              </div>
            </div>
          </fieldset>

          {/* Acciones */}
          <div class="filter-bar__actions">
            <button type="button" class="filter-bar__clear" onClick={onClear}>
              <span aria-hidden="true">✕</span> Limpiar todo
            </button>
          </div>

        </div>
      )}
    </div>
  );
}