import { useEffect, useState } from 'preact/hooks';
import { babaState, treasureDetail, loadBaba, loadTreasureDetail, closeTreasureDetail } from '../model/game';
import type { BabaItem, BabaShopKey } from '../model/game';

/**
 * CONTROLADOR · Vista "Tienda de Baba" (dokkaninfo.com).
 *
 * Agrupa TODA la lógica que la vista `view/BabaView.tsx` usaba inline:
 *  - `tab`: sección activa (Puntos de Intercambio · Zeni · Tesoro · Cofres
 *    Secretos), con su recarga automática al cambiar.
 *  - handlers de sección: cambio (al salir de Tesoro cierra el detalle de la
 *    joya), recarga «Actualizar», reintento del aviso de error y paginación.
 *  - interacción de TESORO: abrir la tienda de una joya, reintentar su carga
 *    y volver a la rejilla de joyas.
 *
 * Flujo de los datos: salen de `model/game.ts` (señales `babaState` y
 * `treasureDetail` + cargas `loadBaba`/`loadTreasureDetail`); la vista solo
 * pinta la sección activa. Las etiquetas de las pestañas (`BABA_TABS`) son
 * texto de UI y se quedan en la vista, igual que los helpers de pintado
 * (`n`, `hideBroken`, `BabaItemCard`).
 */

export function useBabaController() {
  const [tab, setTab] = useState<BabaShopKey>('trade');

  useEffect(() => {
    void loadBaba(tab);
  }, [tab]);

  /** Cambio de sección: al salir de Tesoro se cierra el detalle de la joya. */
  const pickTab = (k: BabaShopKey): void => {
    if (k !== 'treasure' && tab === 'treasure') closeTreasureDetail();
    setTab(k);
  };

  /** Botón «Actualizar»: recarga (force) la sección activa. */
  const refresh = (): void => {
    if (tab === 'treasure') closeTreasureDetail();
    void loadBaba(tab, { force: true });
  };

  /** Reintento del aviso de error de la sección activa (no cierra el detalle). */
  const onRetry = (): void => {
    void loadBaba(tab, { force: true });
  };

  /** Siguiente página de la sección activa («Cargar más»). */
  const onMore = (): void => {
    void loadBaba(tab, { append: true });
  };

  const baba = babaState.value[tab];
  const td = treasureDetail.value;

  /** Abre la tienda de una joya (qué se puede comprar con ella). */
  const openTreasure = (it: BabaItem): void => {
    if (it.ref) void loadTreasureDetail(it.ref, it.name, it.img);
  };

  /** Reintento del detalle de la joya abierta. */
  const retryTreasure = (): void => {
    if (td.ref !== null) void loadTreasureDetail(td.ref, td.name, td.img);
  };

  /** Vuelve de la joya a la rejilla de joyas. */
  const closeTreasure = (): void => {
    closeTreasureDetail();
  };

  /** Moneda de la sección activa (Zeni · Puntos de intercambio). */
  const unit = tab === 'zeni' ? 'Zeni' : 'Pts.';

  return {
    /** Sección activa. */
    tab,
    pickTab,
    refresh,
    onRetry,
    onMore,
    /** Estado de la sección activa (items, paginación, estado de carga). */
    baba,
    /** Detalle de la joya abierta en Tesoro (ref null = rejilla de joyas). */
    treasure: td,
    unit,
    openTreasure,
    retryTreasure,
    closeTreasure,
  };
}
