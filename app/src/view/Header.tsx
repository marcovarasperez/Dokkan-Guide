import { useState, useEffect, useRef } from 'preact/hooks';
import { syncState, manualRefresh } from '../model/sync';
import { formatDateTime } from '../model/date';
import type { View } from '../controller/router';
import { NAV_TABS } from '../controller/navigation';
/** Barra superior fija: marca, navegación (dropdowns) y nota legal. */
export default function Header({ view }: { view: View }) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const cls = (active: boolean): string => `app-header__link${active ? ' app-header__link--active' : ''}`;
  const cur = (active: boolean): 'page' | undefined => (active ? 'page' : undefined);

  const sync = syncState.value;
  const lastOk = sync.lastSuccessAt;
  const isSyncing = sync.phase === 'checking';
  const isError = sync.phase === 'error';

  const handleManualRefresh = async () => {
    await manualRefresh();
  };

  // Pestañas y sub-pestañas: árbol único en controller/navigation.ts (espejo del menú de dokkaninfo).
  const tabs = NAV_TABS.map((t) => ({ ...t, active: t.active() }));

  const toggleDropdown = (id: string, e?: Event) => {
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
              ⚠ {sync.message} {lastOk !== null ? `· ${formatDateTime(lastOk / 1000)}` : ''}
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