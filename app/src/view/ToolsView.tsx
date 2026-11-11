import { view } from '../controller/router';
import { useLeaderTool, useLinkTool, useUnitSearch } from '../controller/toolsController';
import type { UnitSummary } from '../model/types';
import { thumbUrl, TYPE_COLORS } from '../model/adapter';
import MiniUnitCard from './MiniUnit';
import { hideBroken } from './InfoImg';
import SubTabs from './SubTabs';

/**
 * VISTA · "Tools" (sub-pestañas Link Tool y 200%+ Leader Skill).
 * La lógica vive en `controller/toolsController.ts`.
 */
export default function ToolsView() {
  const isLeader = view.value === 'toolsLeaderSkill';
  return (
    <div class="feed-scroll">
      <div class="feed">
        <SubTabs section="tools" label="Herramientas" />
        {isLeader ? <LeaderTool /> : <LinkTool />}
        <p class="game-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}

/** Buscador con resultados en miniatura; `onPick` recibe el personaje elegido. */
function UnitPicker({ onPick, disabled }: { onPick: (u: UnitSummary) => void; disabled?: boolean }) {
  const { query, setQuery, results } = useUnitSearch();
  return (
    <div class="tool-picker">
      <input
        type="search"
        class="filter-bar__input"
        placeholder={disabled ? 'Máximo alcanzado' : 'Buscar personaje (mín. 2 letras)…'}
        value={query}
        disabled={disabled}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />
      {results.length > 0 && (
        <div class="tool-results">
          {results.map((u) => (
            <button
              type="button"
              class="tool-result"
              key={u.id}
              onClick={() => {
                onPick(u);
                setQuery('');
              }}
            >
              <img src={thumbUrl(u.thumbnailId)} alt="" loading="lazy" onError={hideBroken} style={{ borderColor: TYPE_COLORS[u.type] }} />
              <span>
                {u.name}
                <small>
                  {' '}
                  {u.rarity} · {u.type}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const mini = (u: UnitSummary) => ({ id: u.id, name: u.name, type: u.type, rarity: u.rarity, iconId: u.thumbnailId });

function LinkTool() {
  const t = useLinkTool();
  return (
    <>
      <div class="feed__head">
        <h2>Link Tool</h2>
        {t.selected.length > 0 && (
          <button type="button" class="game-refresh" onClick={t.clear}>
            Vaciar
          </button>
        )}
      </div>
      <p class="skill-note">Elige hasta 7 personajes para ver los links que comparten todos.</p>
      <UnitPicker onPick={(u) => t.add(u.id)} disabled={t.full} />

      {t.selected.length > 0 && (
        <div class="mini-units">
          {t.perUnit.map(({ u, best, worst, total, status }) => (
            <MiniUnitCard
              key={u.id}
              u={mini(u)}
              sub={
                <span class="tool-sub">
                  {status === 'loading' || !status
                    ? 'Cargando links…'
                    : status === 'error'
                      ? 'Sin conexión'
                      : t.selected.length > 1
                        ? `Links en común: ${worst}–${best}`
                        : `${total} links`}{' '}
                  <button type="button" class="tool-remove" onClick={() => t.remove(u.id)} aria-label={`Quitar ${u.name}`}>
                    ✕
                  </button>
                </span>
              }
            />
          ))}
        </div>
      )}

      {t.selected.length >= 2 && t.loading && <p class="game-loading">Cargando links…</p>}
      {t.selected.length >= 2 && !t.loading && (
        <section class="tool-links">
          <h3>Links compartidos por todos ({t.shared.length})</h3>
          {t.shared.length === 0 ? (
            <p class="empty-state">No comparten ningún link.</p>
          ) : (
            <table class="links-table">
              <thead>
                <tr>
                  <th>Link</th>
                  <th>Nv. 1</th>
                  <th>Nv. 10</th>
                </tr>
              </thead>
              <tbody>
                {t.shared.map((l) => (
                  <tr key={l.name}>
                    <th>{l.name}</th>
                    <td>{l.lv1}</td>
                    <td>{l.lv10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}

function LeaderTool() {
  const t = useLeaderTool();
  return (
    <>
      <div class="feed__head">
        <h2>200%+ Leader Skill</h2>
      </div>
      <p class="skill-note">Elige un personaje para ver los líderes que le dan 200 % o más (ranking de dokkaninfo).</p>
      <UnitPicker onPick={(u) => t.pick(u.id)} />
      {t.unit && (
        <>
          <div class="mini-units">
            <MiniUnitCard u={mini(t.unit)} />
          </div>
          {t.status === 'loading' && <p class="game-loading">Cargando líderes…</p>}
          {t.status === 'error' && (
            <div class="game-error">
              <p>No se pudo cargar la ficha (¿sin conexión?).</p>
              <button type="button" class="game-retry" onClick={t.retry}>
                Reintentar
              </button>
            </div>
          )}
          {t.status === 'ok' && (
            <section class="tool-links">
              <h3>Líderes 200%+ ({t.leaders.length})</h3>
              {t.leaders.length === 0 ? (
                <p class="empty-state">dokkaninfo no lista líderes 200%+ para este personaje.</p>
              ) : (
                <div class="mini-units">
                  {t.leaders.map((u) => (
                    <MiniUnitCard key={u.id} u={u} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
