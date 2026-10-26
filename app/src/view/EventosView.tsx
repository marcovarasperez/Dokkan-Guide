import type { JSX } from 'preact';
import {
  eventsState,
  questState,
  dbStoryState,
  zbattlesState,
  wtState,
  missionsState,
} from '../model/game';
import type { EventTab } from '../model/game';
import { useEventsController } from '../controller/eventsController';
import { EventCard, LoadMore, MissionCard, StatusBlock } from './gameShared';

/**
 * Vista "Eventos": las tipologías de contenido del juego (Eventos, Quest,
 * Historia DB, Z-Battles, Torneos y Misiones) como SUB-PESTAÑAS — todos los
 * datos salen de dokkaninfo.com.
 *
 * Cada tarjeta muestra la FOTO del evento y, al expandirse, sus niveles y
 * etapas con los drops (cartas enlazan a la ficha in-app).
 *
 * Acepta el deep-link de la ficha de personaje (#/eventos?ev={type}/{id}):
 * carga la pestaña correspondiente, abre el evento y lo desplaza.
 *
 * Toda la lógica vive en `controller/eventsController.ts`
 * (`useEventsController`): esta vista solo pinta la pestaña activa.
 */

const TABS: { key: EventTab; label: string }[] = [
  { key: 'events', label: 'Eventos' },
  { key: 'quest', label: 'Quest' },
  { key: 'dbstory', label: 'Historia DB' },
  { key: 'zbattles', label: 'Z-Battles' },
  { key: 'wt', label: 'Torneos' },
  { key: 'missions', label: 'Misiones' },
];

interface EventsViewProps {
  /** Deep-link de obtención: {type}/{id} (?ev=…) desde una ficha o noticia. */
  focus?: { type: string; id: number } | null;
}

export default function EventsView({ focus = null }: EventsViewProps) {
  const { tab, onTab, isFocus, reload, onMore } = useEventsController(focus);

  let content: JSX.Element;

  switch (tab) {
    case 'quest': {
      const s = questState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={reload} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`q${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={onMore} />
        </>
      );
      break;
    }
    case 'dbstory': {
      const s = dbStoryState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={reload} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`d${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={onMore} />
        </>
      );
      break;
    }
    case 'zbattles': {
      const s = zbattlesState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={reload} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`z${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={onMore} />
        </>
      );
      break;
    }
    case 'wt': {
      const s = wtState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={reload} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`w${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={onMore} />
        </>
      );
      break;
    }
    case 'missions': {
      const s = missionsState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={reload} />
          ) : (
            <div class="ev-grid">
              {s.items.map((g) => (
                <MissionCard group={g} key={g.id} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={onMore} />
        </>
      );
      break;
    }
    default: {
      const s = eventsState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={reload} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`e${e.type}-${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={onMore} />
        </>
      );
    }
  }

  return (
    <div class="feed-scroll">
      <div class="feed">
        <div class="feed__head">
          <h2>Eventos</h2>
          <button type="button" class="game-refresh" onClick={reload}>
            Actualizar
          </button>
        </div>

        <nav class="game-tabs" aria-label="Tipos de contenido">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.key}
              class={`game-tab${tab === t.key ? ' game-tab--active' : ''}`}
              onClick={() => onTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {content}

        <p class="game-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
