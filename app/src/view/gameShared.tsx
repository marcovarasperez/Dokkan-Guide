import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameEvent, EventDetailState, MissionGroup } from '../model/game';
import { eventDetails, loadEventDetail } from '../model/game';
import type { DkEventStageDrop } from '../model/dinfo';
import { formatDate, formatNumber } from '../model/date';
import InfoImg, { hideBroken } from './InfoImg';
import { thumbUrl } from '../model/adapter';

/**
 * Piezas compartidas de las vistas de contenido del juego
 * (Eventos y Tienda de Baba): estados, tarjetas de evento y paginación.
 *
 * Las tarjetas de evento muestran la FOTO del evento (assets de dokkaninfo,
 * cargados vía ORB con InfoImg) y, al expandirse, sus niveles/etapas con las
 * recompensas: cartas (enlazan a la ficha in-app) y objetos con su icono.
 */

/** Bloque reutilizable de estado vacío / error. */
export function StatusBlock({ status, onRetry }: { status: string; onRetry: () => void }) {
  if (status === 'loading') return <p class="game-loading">Cargando…</p>;
  return (
    <div class="game-error">
      <p>No se pudo cargar el contenido (¿sin conexión?).</p>
      <button type="button" class="game-retry" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

/** Fila de lista "cargar más". */
export function LoadMore({ page, lastPage, onMore }: { page: number; lastPage: number; onMore: () => void }) {
  if (page >= lastPage) return null;
  return (
    <button type="button" class="game-more" onClick={onMore}>
      Cargar más (página {page + 1} de {lastPage})
    </button>
  );
}

const isEventActive = (e: GameEvent): boolean => !e.endsAt || e.endsAt * 1000 > Date.now();

/** Icono de un drop: carta → thumb enlazada; objeto → miniatura de item. */
function RewardChip({ drop }: { drop: DkEventStageDrop }) {
  const qty = drop.quantity > 1 ? ` ×${drop.quantity}` : '';
  if (drop.kind === 'card') {
    return (
      <a class="ev-reward ev-reward--card" href={`#/characters/${drop.id}`} title={`${drop.name}${qty}`}>
        {drop.image && <InfoImg url={drop.image} alt="" cls="ev-reward__icon" />}
        <span class="ev-reward__name">
          {drop.name || `Carta ${drop.id}`}
          {qty}
        </span>
      </a>
    );
  }
  return (
    <span class="ev-reward" title={`${drop.name}${qty}`}>
      {drop.image ? (
        <InfoImg url={drop.image} alt="" cls="ev-reward__icon" />
      ) : (
        <span class="ev-reward__ph" aria-hidden="true" />
      )}
      <span class="ev-reward__name">
        {drop.name}
        {qty}
      </span>
    </span>
  );
}

function RewardRow({ label, rewards }: { label: string; rewards: DkEventStageDrop[] }) {
  if (!rewards.length) return null;
  return (
    <div class="ev-rewards__group">
      <span class="ev-rewards__label">{label}</span>
      <div class="ev-rewards__list">
        {rewards.map((d, i) => (
          <RewardChip drop={d} key={`${d.kind}-${d.id}-${i}`} />
        ))}
      </div>
    </div>
  );
}

/** Contenido desplegado de un evento: niveles → etapas → recompensas. */
function EventDetailBody({ state, onRetry }: { state: EventDetailState | undefined; onRetry: () => void }) {
  if (!state || state.status === 'idle' || state.status === 'loading') {
    return <p class="game-loading">Cargando etapas y drops…</p>;
  }
  if (state.status === 'error' && !state.detail) {
    return (
      <div class="game-error game-error--inline">
        <p>No se pudo cargar el detalle del evento.</p>
        <button type="button" class="game-retry" onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
  const detail = state.detail;
  if (!detail || detail.levels.length === 0) {
    return <p class="game-empty">Este evento no tiene etapas publicadas (puede ser un menú de intercambio).</p>;
  }
  return (
    <div class="ev-levels">
      {detail.levels.map((level, li) => (
        <section class="ev-level" key={`lv-${li}`}>
          {level.name && <h4 class="ev-level__title">{level.name}</h4>}
          {level.stages.map((stage) => (
            <div class="ev-stage" key={stage.id ?? `s${li}`}>
              <div class="ev-stage__head">
                {stage.difficulty && <b class="ev-stage__diff">{stage.difficulty}</b>}
                {stage.stamina !== null && <span>{stage.stamina} STA</span>}
                {stage.userExp !== null && <span>EXP {formatNumber(stage.userExp)}</span>}
                {stage.zeni !== null && <span>{formatNumber(stage.zeni)} Zeni</span>}
                {stage.linkRate !== null && <span>Link ×{stage.linkRate}</span>}
              </div>
              <RewardRow label="Recompensa al superar" rewards={stage.clearRewards} />
              <RewardRow label="Drops del jefe" rewards={stage.dropRewards} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Tarjeta desplegable de un evento con su foto; al abrirla carga el detalle
 * (niveles, etapas y drops con iconos). `focus` (deep-link desde la ficha de
 * una personaje) la abre y la desplaza.
 */
export function EventCard({ event, focus = false }: { event: GameEvent; focus?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [wantDetail, setWantDetail] = useState(focus);
  const key = `${event.type}/${event.id}`;
  const state = eventDetails.value[key];
  const active = isEventActive(event);

  useEffect(() => {
    if (wantDetail) void loadEventDetail(event.type, event.id);
  }, [wantDetail, event.type, event.id]);

  if (focus && ref.current && !ref.current.open) {
    ref.current.open = true;
    // Fuera del render: programado tras el paint para poder hacer scroll.
    setTimeout(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
  }

  return (
    <details
      class={`game-card ev-card${focus ? ' game-card--focus' : ''}`}
      ref={ref}
      open={focus || undefined}
      onToggle={(e) => {
        if (e.currentTarget.open) setWantDetail(true);
      }}
    >
      <summary class="ev-card__head">
        <span class="ev-card__media">
          {event.image ? (
            <InfoImg url={event.image} alt="" cls="ev-card__img" />
          ) : (
            <span class="ev-card__ph" aria-hidden="true" />
          )}
          {active && <span class="ev-card__badge">Activo</span>}
        </span>
        <span class="ev-card__info">
          <b class="ev-card__title">{event.name || `Evento ${event.id}`}</b>
          <span class="ev-card__meta">
            {event.startsAt && <span>{formatDate(event.startsAt)}</span>}
            {event.startsAt && event.endsAt && <span> → </span>}
            {event.endsAt && <span>{formatDate(event.endsAt)}</span>}
            {!active && <span class="ev-card__ended">· Finalizado</span>}
          </span>
          {event.unit && (
            <a
              class="ev-card__unit"
              href={`#/characters/${event.unit.id}`}
              title={`Ficha de ${event.unit.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <img src={thumbUrl(event.unit.thumbnailId)} alt={event.unit.name} loading="lazy" onError={hideBroken} />
              <span>{event.unit.name}</span>
            </a>
          )}
        </span>
      </summary>
      <div class="ev-card__body">
        <EventDetailBody state={state} onRetry={() => void loadEventDetail(event.type, event.id)} />
      </div>
    </details>
  );
}

/** Tarjeta de grupo de misiones (banner + misiones con recompensas). */
export function MissionCard({ group }: { group: MissionGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <details class="game-card ms-card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary class="ms-card__head">
        {group.image && <InfoImg url={group.image} alt="" cls="ms-card__img" />}
        <span class="ms-card__info">
          <b>{group.title}</b>
          <span class="ms-card__meta">{group.count} misiones</span>
        </span>
      </summary>
      {open && (
        <ul class="ms-card__list">
          {group.missions.map((m) => (
            <li class="ms-mission" key={m.id}>
              <span class="ms-mission__name">{m.name}</span>
              {m.rewards.length > 0 && (
                <span class="ms-mission__rewards">
                  {m.rewards.map((r, i) =>
                    r.cardId !== null ? (
                      <a class="ev-reward ev-reward--card" href={`#/characters/${r.cardId}`} title={r.name} key={i}>
                        {r.image && <InfoImg url={r.image} alt="" cls="ev-reward__icon" />}
                        <span class="ev-reward__name">
                          {r.name}
                          {r.qty > 1 ? ` ×${r.qty}` : ''}
                        </span>
                      </a>
                    ) : (
                      <span class="ev-reward" title={r.name} key={i}>
                        {r.image ? (
                          <InfoImg url={r.image} alt="" cls="ev-reward__icon" />
                        ) : (
                          <span class="ev-reward__ph" aria-hidden="true" />
                        )}
                        <span class="ev-reward__name">
                          {r.name}
                          {r.qty > 1 ? ` ×${r.qty}` : ''}
                        </span>
                      </span>
                    ),
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
