import type { JSX } from 'preact';

/**
 * Navegación de sub-pestañas compartida por las vistas contenedor
 * (Items, Missions y Tools): barra `items-tabs` + cabecera `feed__head`.
 */

export interface SubTab {
  /** Id de la vista (`View` del router) que activa la pestaña. */
  id: string;
  label: string;
  href: string;
}

/** Pestaña visible según la vista actual (fallback: la primera). */
export function activeSubTab(tabs: SubTab[], currentView: string): SubTab {
  return tabs.find((t) => t.id === currentView) ?? tabs[0];
}

export default function SubTabs({
  tabs,
  currentView,
  navLabel,
  title,
}: {
  tabs: SubTab[];
  currentView: string;
  navLabel: string;
  title: string;
}): JSX.Element {
  const activeTab = activeSubTab(tabs, currentView);

  return (
    <>
      <nav class="items-tabs" aria-label={navLabel}>
        {tabs.map((tab) => (
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
        <h2>
          {title} · {activeTab.label}
        </h2>
      </div>
    </>
  );
}
