import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  eventsState,
  questState,
  dbStoryState,
  zbattlesState,
  wtState,
  missionsState,
  loadEvents,
  loadQuest,
  loadDbStory,
  loadZbattles,
  loadWt,
  loadMissions,
  ensureEventForDeepLink,
} from '../data/game';
import type { EventTab, GameEvent } from '../data/game';
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
 */

const TABS: { key: EventTab; label: string }[] = [
  { key: 'events', label: 'Eventos' },
  { key: 'quest', label: 'Quest' },
  { key: 'dbstory', label: 'Historia DB' },
  { key: 'zbattles', label: 'Z-Battles' },
  { key: 'wt', label: 'Torneos' },
  { key: 'missions', label: 'Misiones' },
];

/** Pestaña a la que pertenece cada tipo de URL de dokkaninfo. */
const TYPE_TAB: Record<string, EventTab> = {
  limited: 'events',
  story: 'events',
  growth: 'events',
  challenge: 'events',
  bonus: 'events',
  quest: 'quest',
  dbstories: 'dbstory',
  zbattle: 'zbattles',
  worldtournament: 'wt',
};

interface EventsViewProps {
  /** Deep-link de obtención: {type}/{id} (?ev=…) desde una ficha o noticia. */
  focus?: { type: string; id: number } | null;
}

const focusKey = (f: { type: string; id: number } | null): string | null =>
  f ? `${f.type}/${f.id}` : null;

export default function EventsView({ focus = null }: EventsViewProps) {
  const [tab, setTab] = useState<EventTab>(focus ? (TYPE_TAB[focus.type] ?? 'events') : 'events');
  const [focused, setFocused] = useState<string | null>(focusKey(focus));

  // Deep-link: cargar/abrir el evento solicitado al cambiar la referencia.
  useEffect(() => {
    if (!focus) return;
    const key = focusKey(focus);
    setTab(TYPE_TAB[focus.type] ?? 'events');
    setFocused(key);
    let cancelled = false;
    void ensureEventForDeepLink(focus.type, focus.id).then(() => {
      if (!cancelled) setFocused(key);
    });
    return () => {
      cancelled = true;
    };
  }, [focus?.type, focus?.id]);

  // Carga inicial de la pestaña activa (si aún no hay nada).
  useEffect(() => {
    if (tab === 'quest' && questState.value.status === 'idle') void loadQuest();
    else if (tab === 'dbstory' && dbStoryState.value.status === 'idle') void loadDbStory();
    else if (tab === 'zbattles' && zbattlesState.value.status === 'idle') void loadZbattles();
    else if (tab === 'wt' && wtState.value.status === 'idle') void loadWt();
    else if (tab === 'missions' && missionsState.value.status === 'idle') void loadMissions();
    else if (tab === 'events' && eventsState.value.status === 'idle') void loadEvents();
  }, [tab]);

  const isFocus = (e: GameEvent): boolean => focused === `${e.type}/${e.id}`;

  let content: JSX.Element;

  switch (tab) {
    case 'quest': {
      const s = questState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={() => void loadQuest({ force: true })} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`q${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={() => void loadQuest({ append: true })} />
        </>
      );
      break;
    }
    case 'dbstory': {
      const s = dbStoryState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={() => void loadDbStory({ force: true })} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`d${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={() => void loadDbStory({ append: true })} />
        </>
      );
      break;
    }
    case 'zbattles': {
      const s = zbattlesState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={() => void loadZbattles({ force: true })} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`z${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={() => void loadZbattles({ append: true })} />
        </>
      );
      break;
    }
    case 'wt': {
      const s = wtState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={() => void loadWt({ force: true })} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`w${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={() => void loadWt({ append: true })} />
        </>
      );
      break;
    }
    case 'missions': {
      const s = missionsState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={() => void loadMissions({ force: true })} />
          ) : (
            <div class="ev-grid">
              {s.items.map((g) => (
                <MissionCard group={g} key={g.id} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={() => void loadMissions({ append: true })} />
        </>
      );
      break;
    }
    default: {
      const s = eventsState.value;
      content = (
        <>
          {s.status === 'error' && !s.items.length ? (
            <StatusBlock status={s.status} onRetry={() => void loadEvents({ force: true })} />
          ) : (
            <div class="ev-grid">
              {s.items.map((e) => (
                <EventCard event={e} focus={isFocus(e)} key={`e${e.type}-${e.id}`} />
              ))}
              {s.status === 'loading' && !s.items.length && <p class="game-loading">Cargando…</p>}
            </div>
          )}
          <LoadMore page={s.page} lastPage={s.lastPage} onMore={() => void loadEvents({ append: true })} />
        </>
      );
    }
  }

  const reload = (): void => {
    if (tab === 'quest') void loadQuest({ force: true });
    else if (tab === 'dbstory') void loadDbStory({ force: true });
    else if (tab === 'zbattles') void loadZbattles({ force: true });
    else if (tab === 'wt') void loadWt({ force: true });
    else if (tab === 'missions') void loadMissions({ force: true });
    else void loadEvents({ force: true });
  };

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
              onClick={() => {
                setTab(t.key);
                setFocused(null);
              }}
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
