import { subTabsOf } from '../controller/navigation';

/**
 * VISTA · Barra de SUB-PESTAÑAS de una sección (Cards, Events, Items,
 * Missions, Baba's Shop, Tools…), como la fila de sub-secciones de
 * dokkaninfo. Las pestañas salen del árbol único `controller/navigation.ts`;
 * la activa se marca según la ruta actual. Desplazable en horizontal en móvil.
 */
export default function SubTabs({ section, label }: { section: string; label: string }) {
  const tabs = subTabsOf(section);
  if (tabs.length < 2) return null;
  return (
    <nav class="items-tabs" aria-label={label}>
      {tabs.map((t) => {
        const on = t.active();
        return (
          <a
            key={t.href}
            class={`items-tab${on ? ' items-tab--active' : ''}`}
            href={t.href}
            aria-current={on ? 'page' : undefined}
          >
            {t.label}
          </a>
        );
      })}
    </nav>
  );
}
