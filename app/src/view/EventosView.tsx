import { useEventsController } from '../controller/eventsController';
import { EventCard, LoadMore, StatusBlock } from './gameShared';
import SubTabs from './SubTabs';

/**
 * VISTA · "Events": una sub-pestaña por categoría del menú de dokkaninfo
 * (Burst Mode, Bonus, Challenge, DB Stories, Extreme Z Battle, Growth,
 * Limited, Pettan Battle, Quest, Story, Dokkan Frontier, Ultimate Clash y
 * World Tournament).
 *
 * Cada tarjeta muestra la FOTO del evento y, al expandirse, sus niveles y
 * etapas con los drops (las cartas enlazan a su ficha en la app).
 *
 * Toda la lógica vive en `controller/eventsController.ts`; esta vista solo
 * pinta la categoría activa.
 */
export default function EventsView({ focus = null }: { focus?: { type: string; id: number } | null }) {
  const { label, list: s, isFocus, reload, onMore } = useEventsController(focus);

  return (
    <div class="feed-scroll">
      <div class="feed">
        <SubTabs section="events" label="Categorías de eventos" />
        <div class="feed__head">
          <h2>Events · {label}</h2>
          <button type="button" class="game-refresh" onClick={reload}>
            Actualizar
          </button>
        </div>

        {s.status === 'error' && !s.items.length ? (
          <StatusBlock status={s.status} onRetry={reload} />
        ) : (
          <div class="ev-grid">
            {s.items.map((e) => (
              <EventCard event={e} focus={isFocus(e)} key={`${e.type}-${e.id}`} />
            ))}
            {(s.status === 'loading' || s.status === 'idle') && !s.items.length && <p class="game-loading">Cargando…</p>}
            {s.status === 'ok' && !s.items.length && <p class="empty-state">No hay eventos en esta categoría ahora mismo.</p>}
          </div>
        )}
        <LoadMore page={s.page} lastPage={s.lastPage} onMore={onMore} />

        <p class="game-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
