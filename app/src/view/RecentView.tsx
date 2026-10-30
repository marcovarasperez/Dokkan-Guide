import { useListController } from '../controller/listController';
import UnitGrid from './UnitGrid';
import type { UnitSummary } from '../model/types';

/**
 * Vista "Recientes": los 30 personajes más recientes por fecha de publicación inicial.
 * Usa el mismo UnitGrid que el listado principal.
 */
export default function RecentView() {
  const { units } = useListController();

  // Filtrar solo los que tienen fecha de publicación inicial y ordenar descendente (más recientes primero)
  const recentUnits = useMemo(
    () =>
      units
        .filter((u): u is UnitSummary & { releaseDates: { initial: number } } =>
          Boolean(u.releaseDates?.initial)
        )
        .sort((a, b) => (b.releaseDates.initial ?? 0) - (a.releaseDates.initial ?? 0))
        .slice(0, 30),
    [units]
  );

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        <div class="feed__head">
          <h2>Personajes recientes</h2>
          <span class="feed__status">
            {recentUnits.length} personajes más recientes por publicación
          </span>
        </div>
        {recentUnits.length === 0 ? (
          <p class="empty-state">No hay datos de personajes recientes.</p>
        ) : (
          <UnitGrid units={recentUnits} />
        )}
        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}

// useMemo helper for Preact
import { useMemo } from 'preact/hooks';