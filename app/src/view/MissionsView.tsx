import { view } from '../controller/router';
import SubTabs, { activeSubTab, type SubTab } from './SubTabs';

const MISSION_TABS: SubTab[] = [
  { id: 'missions', label: 'Missions', href: '#/misiones' },
  { id: 'panelMissions', label: 'Panel Missions', href: '#/misiones/panel' },
];

/**
 * Vista "Missions": contenedor para Missions y Panel Missions.
 */
export default function MissionsView() {
  const currentView = view.value;
  const activeTab = activeSubTab(MISSION_TABS, currentView);

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        <SubTabs tabs={MISSION_TABS} currentView={currentView} navLabel="Tipos de misiones" title="Missions" />

        <p class="empty-state">
          Vista de <strong>{activeTab.label}</strong> en desarrollo.
          Próximamente mostrará el listado completo de misiones con sus recompensas.
        </p>
      </div>
    </div>
  );
}
