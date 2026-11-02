import { view } from '../controller/router';

/**
 * Vista "Tools": contenedor para Link Tool y 200% + Leader Skill.
 */
export default function ToolsView() {
  const currentView = view.value;

  const toolTabs = [
    { id: 'tools', label: 'Tools', href: '#/herramientas' },
    { id: 'toolsLinkTool', label: 'Link Tool', href: '#/herramientas/link-tool' },
    { id: 'toolsLeaderSkill', label: '200% + Leader Skill', href: '#/herramientas/leader-skill' },
  ];

  const activeTab = toolTabs.find(t => t.id === currentView) || toolTabs[0];

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        <nav class="items-tabs" aria-label="Herramientas">
          {toolTabs.map((tab) => (
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
          <h2>Tools · {activeTab.label}</h2>
        </div>

        {currentView === 'toolsLinkTool' && (
          <div class="tool-link-tool">
            <h3>Link Tool</h3>
            <p class="empty-state">
              Herramienta para calcular y buscar Link Skills entre unidades.
              Permite seleccionar unidades y ver qué links comparten, niveles de link, y bonificaciones.
            </p>
            <p>En desarrollo...</p>
          </div>
        )}

        {currentView === 'toolsLeaderSkill' && (
          <div class="tool-leader-skill">
            <h3>200% + Leader Skill</h3>
            <p class="empty-state">
              Herramienta para encontrar líderes que cubran el 200% o más en HP, ATK y DEF
              para una categoría o tipo específico.
            </p>
            <p>En desarrollo...</p>
          </div>
        )}

        {currentView === 'tools' && (
          <p class="empty-state">
            Selecciona una herramienta del menú superior.
          </p>
        )}
      </div>
    </div>
  );
}