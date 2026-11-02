import { useEffect, useState } from 'preact/hooks';
import { archiveState, loadArchive, loadArchiveAll } from '../model/bannerArchive';
import type { ArchiveBanner } from '../model/bannerArchive';

/**
 * CONTROLADOR · Sección Banners, dividida en ACTIVOS y FINALIZADOS — fuente: dokkaninfo.com.
 *
 * Agrupa TODO el estado que la vista `view/BannersView.tsx` usaba inline:
 *  - `tab`: pestaña visible (activos / finalizados) y la DESCARGA del archivo
 *    correspondiente al cambiar de pestaña;
 *  - `refresh`: refresco manual de la pestaña visible (ignora la caché);
 *  - `loadMore`: paginación del archivo de finalizados (LoadMore);
 *  - los ACTIVOS agrupados en 4 categorías como en la fuente:
 *      Recommended   → StoneGasha "de personaje" (Dokkan Festival / partidas),
 *      Dragon Stone  → StoneGasha de kais (Elder Kai, Mysterious Ritual),
 *      Ticket        → TicketGasha,
 *      Friend Pts.   → PointGasha + TutorialGasha.
 *  - `empty`: si la pestaña visible no tiene ningún banner.
 *
 * Flujo de los datos: `model/bannerArchive.ts` descarga el listado de
 * dokkaninfo (activos de una vez, finalizados paginado), lo cachea y publica
 * `archiveState`; la vista solo pinta lo que este hook devuelve y dibuja cada
 * tarjeta con sus helpers locales (`BannerCard`, `fmtEpoch`, `updatedAtText`).
 * Cualquier banner → detalle en-app (#/banners/{id}) con sus destacados.
 */

/** Pestaña del listado: activos (agrupados) o finalizados (archivo paginado). */
type BannerTab = 'active' | 'ended';

/** Categorías de los banners activos, en el orden en que las agrupa la fuente. */
type BannerGroupKey = 'recommended' | 'stone' | 'ticket' | 'friend';

const GROUPS: { key: BannerGroupKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'stone', label: 'Dragon Stone' },
  { key: 'ticket', label: 'Ticket' },
  { key: 'friend', label: 'Friend Pts.' },
];

/** Clasificación de un banner activo según su tipo y nombre. */
function groupOf(b: ArchiveBanner): BannerGroupKey {
  const t = (b.type ?? '').toLowerCase();
  const name = (b.name ?? '').toLowerCase();
  // Excluir Tutorial Summon
  if (name.includes('tutorial')) return 'exclude';
  if (t.includes('ticket')) return 'ticket';
  if (t.includes('point') || t.includes('tutorial')) return 'friend';
  if (t.includes('stone') && /elder kai|mysterious ritual/.test(name)) return 'stone';
  return 'recommended';
}

export function useBannersController() {
  const [tab, setTab] = useState<BannerTab>('active');

  // Descarga del archivo según la pestaña visible (dispara al cambiar de pestaña).
  useEffect(() => {
    if (tab === 'active') void loadArchiveAll('active');
    else void loadArchive('ended');
  }, [tab]);

  /** Refresco manual de la pestaña visible (force: ignora la caché). */
  const refresh = (): void => {
    if (tab === 'active') void loadArchiveAll('active', { force: true });
    else void loadArchive('ended', { force: true });
  };

  /** Siguiente página del archivo de finalizados (botón «Cargar más»). */
  const loadMore = (): void => void loadArchive('ended', { append: true });

  const arch = archiveState.value[tab];

  // Activos: 4 grupos (Recommended / Dragon Stone / Ticket / Friend Pts.).
  const groups = GROUPS.map((g) => ({ ...g, items: arch.items.filter((b) => groupOf(b) === g.key) })).filter(
    (g) => g.items.length > 0,
  );

  // Filtrar banners "exclude" (Tutorial Summon) del archivo de finalizados también
  const filteredEndedItems = arch.items.filter((b) => groupOf(b) !== 'exclude');

  const empty = tab === 'active' ? groups.length === 0 : filteredEndedItems.length === 0;

  return {
    /** Pestaña visible: activos · finalizados. */
    tab,
    setTab,
    /** Estado del archivo de la pestaña (items, status, paginación, updatedAt). */
    arch: {
      ...arch,
      items: tab === 'active' ? arch.items : filteredEndedItems,
    },
    /** Banners ACTIVOS ya agrupados (solo grupos con contenido). */
    groups,
    /** ¿La pestaña visible no tiene ningún banner? */
    empty,
    refresh,
    loadMore,
  };
}
