import { useEffect, useState } from 'preact/hooks';
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
} from '../model/game';
import type { EventTab, GameEvent } from '../model/game';

/**
 * CONTROLADOR · Vista "Eventos" (tipologías de contenido del juego).
 *
 * Agrupa TODA la lógica que la vista `view/EventosView.tsx` usaba inline:
 *  - `tab`: sub-pestaña activa (Eventos · Quest · Historia DB · Z-Battles ·
 *    Torneos · Misiones); al activarla se cargan sus datos si aún no hay nada.
 *  - deep-link de la ficha de personaje (#/eventos?ev={type}/{id}): carga la
 *    pestaña correspondiente, abre el evento y lo deja marcado (`isFocus`).
 *  - handlers: cambiar de pestaña, recargar (force) y paginar la activa.
 *
 * Flujo de los datos: todo sale de dokkaninfo.com vía `model/game.ts` — las
 * señales `*State` (que la vista lee al pintar cada rama) y las cargas
 * `load*`. Aquí vive `TYPE_TAB` (mapeo tipo-de-URL de dokkaninfo → pestaña);
 * las etiquetas de las pestañas (`TABS`) son texto de UI y se quedan en la
 * vista.
 */

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

/** Clave `type/id` de un deep-link de obtención (?ev=…) o null. */
const focusKey = (f: { type: string; id: number } | null): string | null =>
  f ? `${f.type}/${f.id}` : null;

export function useEventsController(focus: { type: string; id: number } | null = null) {
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

  /** Cambia de pestaña (al hacerlo se limpia el foco del deep-link). */
  const onTab = (k: EventTab): void => {
    setTab(k);
    setFocused(null);
  };

  /** Recarga (force) de la pestaña activa: botón «Actualizar» y reintento. */
  const reload = (): void => {
    if (tab === 'quest') void loadQuest({ force: true });
    else if (tab === 'dbstory') void loadDbStory({ force: true });
    else if (tab === 'zbattles') void loadZbattles({ force: true });
    else if (tab === 'wt') void loadWt({ force: true });
    else if (tab === 'missions') void loadMissions({ force: true });
    else void loadEvents({ force: true });
  };

  /** Siguiente página de la pestaña activa («Cargar más»). */
  const onMore = (): void => {
    if (tab === 'quest') void loadQuest({ append: true });
    else if (tab === 'dbstory') void loadDbStory({ append: true });
    else if (tab === 'zbattles') void loadZbattles({ append: true });
    else if (tab === 'wt') void loadWt({ append: true });
    else if (tab === 'missions') void loadMissions({ append: true });
    else void loadEvents({ append: true });
  };

  return {
    /** Sub-pestaña activa. */
    tab,
    onTab,
    /** ¿La tarjeta `e` es la que abrió el deep-link? */
    isFocus,
    reload,
    onMore,
  };
}
