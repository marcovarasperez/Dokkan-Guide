import { useEffect, useState } from 'preact/hooks';
import { EVENT_TYPES, eventListOf, loadEventType, ensureEventForDeepLink } from '../model/game';
import type { GameEvent } from '../model/game';
import { eventsType } from './router';

/**
 * CONTROLADOR · Vista "Events" (`view/EventosView.tsx`).
 *
 *  - La categoría activa sale de la RUTA (`eventsType`: #/eventos/{slug}), así
 *    el desplegable de la cabecera y la barra de sub-pestañas llevan al mismo
 *    sitio. Son las 13 categorías del menú de dokkaninfo (`EVENT_TYPES`).
 *  - Al entrar en una categoría se carga su listado (caché → red).
 *  - Deep-link desde una ficha (#/eventos?ev={type}/{id}): carga la
 *    categoría, abre el evento y lo deja marcado (`isFocus`).
 *  - `reload` (Actualizar / Reintentar) y `onMore` (paginación).
 *
 * Los datos salen de `model/game.ts` (`eventLists` + `loadEventType`).
 */
export function useEventsController(focus: { type: string; id: number } | null = null) {
  const type = eventsType.value;
  const [focused, setFocused] = useState<string | null>(focus ? `${focus.type}/${focus.id}` : null);

  // Deep-link: cargar/abrir el evento solicitado.
  useEffect(() => {
    if (!focus) {
      setFocused(null);
      return;
    }
    const key = `${focus.type}/${focus.id}`;
    setFocused(key);
    let cancelled = false;
    void ensureEventForDeepLink(focus.type, focus.id).then(() => {
      if (!cancelled) setFocused(key);
    });
    return () => {
      cancelled = true;
    };
  }, [focus?.type, focus?.id]);

  // Carga de la categoría activa (si aún no hay nada).
  useEffect(() => {
    if (eventListOf(type).status === 'idle') void loadEventType(type);
  }, [type]);

  return {
    /** Tipo de URL de dokkaninfo de la categoría activa. */
    type,
    /** Nombre de la categoría (como en el menú). */
    label: EVENT_TYPES.find((t) => t.type === type)?.label ?? 'Events',
    /** Listado de la categoría activa (items, estado, paginación). */
    list: eventListOf(type),
    /** ¿La tarjeta `e` es la que abrió el deep-link? */
    isFocus: (e: GameEvent): boolean => focused === `${e.type}/${e.id}`,
    reload: (): void => void loadEventType(type, { force: true }),
    onMore: (): void => void loadEventType(type, { append: true }),
  };
}
