import { useEffect } from 'preact/hooks';
import { view } from '../controller/router';
import { loadMissions, missionsState } from '../model/game';
import { LoadMore, MissionCard, StatusBlock } from './gameShared';
import DkPageView from './DkPageView';
import SubTabs from './SubTabs';

/**
 * VISTA · "Missions" con sus dos sub-pestañas, como dokkaninfo:
 *  - Missions (#/misiones): categorías paginadas con sus misiones y
 *    recompensas (`model/game.ts` → `loadMissions`);
 *  - Panel Missions (#/misiones/panel): página /panels de dokkaninfo en el
 *    visor genérico (cada panel abre /panels/{id} dentro de la app).
 */
export default function MissionsView() {
  const tabs = <SubTabs section="missions" label="Tipos de misiones" />;
  if (view.value === 'panelMissions') return <DkPageView path="panels" header={tabs} title="Panel Missions" />;
  return <MissionList tabs={tabs} />;
}

function MissionList({ tabs }: { tabs: preact.ComponentChildren }) {
  const s = missionsState.value;
  useEffect(() => {
    if (missionsState.value.status === 'idle') void loadMissions();
  }, []);
  const reload = (): void => void loadMissions({ force: true });

  return (
    <div class="feed-scroll">
      <div class="feed">
        {tabs}
        <div class="feed__head">
          <h2>Missions</h2>
          <button type="button" class="game-refresh" onClick={reload}>
            Actualizar
          </button>
        </div>
        {s.status === 'error' && !s.items.length ? (
          <StatusBlock status={s.status} onRetry={reload} />
        ) : (
          <div class="ev-grid">
            {s.items.map((g) => (
              <MissionCard group={g} key={g.id} />
            ))}
            {s.status !== 'ok' && !s.items.length && <p class="game-loading">Cargando…</p>}
          </div>
        )}
        <LoadMore page={s.page} lastPage={s.lastPage} onMore={() => void loadMissions({ append: true })} />
        <p class="game-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
