import { useState } from 'preact/hooks';
import type { UnitClass, UnitRarity, UnitType } from '../model/types';
import { TYPE_COLORS } from '../model/adapter';

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
    sortBy, onSortBy, onClear, sortDesc, onToggleSort,
  } = props;
  const [open, setOpen] = useState(false);

  const hasFilters =
    selectedTypes.length > 0 || selectedClasses.length > 0 || selectedRarities.length > 0;
  const nonDefaultSort = sortBy !== 'recent' || sortDesc;
  // El ORDEN no es un filtro: no suma al contador del botón (solo tipos/clases/rarezas).
  const activeCount = selectedTypes.length + selectedClasses.length + selectedRarities.length;

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
        <span class="filter-bar__caret" aria-hidden="true">
          ▼
        </span>
        Filtros
        {activeCount > 0 && <b class="filter-bar__badge">{activeCount}</b>}
      </button>

      {open && (
        <div class="filter-bar__panel" id="filter-panel" role="group" aria-label="Filtros y orden">
          <div class="filter-bar__types" role="group" aria-label="Filtrar por tipo">
            {TYPES.map((t) => {
              const on = selectedTypes.includes(t);
              const color = TYPE_COLORS[t];
              return (
                <button
                  type="button"
                  key={t}
                  class="type-chip"
                  aria-pressed={on}
                  style={on ? { background: color, borderColor: color, color: '#fff' } : { borderColor: color, color }}
                  onClick={() => onToggleType(t)}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div class="filter-bar__group" role="group" aria-label="Filtrar por clase">
            <span class="filter-bar__legend">Clase</span>
            {CLASSES.map((c) => {
              const on = selectedClasses.includes(c.key);
              return (
                <button
                  type="button"
                  key={c.key}
                  class={`class-chip${on ? ' class-chip--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onToggleClass(c.key)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div class="filter-bar__group" role="group" aria-label="Filtrar por rareza">
            <span class="filter-bar__legend">Rareza</span>
            {RARITIES.map((r) => {
              const on = selectedRarities.includes(r);
              return (
                <button
                  type="button"
                  key={r}
                  class={`rarity-chip${on ? ' rarity-chip--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onToggleRarity(r)}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div class="filter-bar__group" role="group" aria-label="Ordenar">
            <span class="filter-bar__legend">Orden</span>
            <select
              class="filter-bar__sort-select"
              value={sortBy}
              onChange={(e) => onSortBy((e.target as HTMLSelectElement).value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              class="filter-bar__sort"
              aria-label={sortDesc ? 'Descendente (bajar a ascendente)' : 'Ascendente (bajar a descendente)'}
              title={sortDesc ? 'Descendente' : 'Ascendente'}
              onClick={onToggleSort}
            >
              {sortDesc ? '▼' : '▲'}
            </button>
          </div>
          <a class="filter-bar__cats" href="#/categorias">
            📋 Categorías
          </a>
          {(hasFilters || query !== '' || nonDefaultSort) && (
            <button type="button" class="filter-bar__clear" onClick={onClear}>
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
