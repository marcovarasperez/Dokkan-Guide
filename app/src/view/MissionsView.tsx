import { view } from '../controller/router';

/**
 * Vista "Missions": contenedor para Missions y Panel Missions.
 */
export default function MissionsView() {
  const currentView = view.value;

  const missionTabs = [
    { id: 'missions', label: 'Missions', href: '#/misiones' },
    { id: 'panelMissions', label: 'Panel Missions', href: '#/misiones/panel' },
  ];

  const activeTab = missionTabs.find(t => t.id === currentView) || missionTabs[0];

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        <nav class="items-tabs" aria-label="Tipos de misiones">
          {missionTabs.map((tab) => (
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
          <h2>Missions · {activeTab.label}</h2>
        </div>

        <p class="empty-state">
          Vista de <strong>{activeTab.label}</strong> en desarrollo.
          Próximamente mostrará el listado completo de misiones con sus recompensas.
        </p>
      </div>
    </div>
  );
}