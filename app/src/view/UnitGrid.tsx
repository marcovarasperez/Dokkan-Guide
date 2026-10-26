import { useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedEvent } from 'preact';
import type { UnitSummary } from '../model/types';
import UnitCard from './UnitCard';

const GAP = 12;
const OVERSCAN = 2; // filas extra renderizadas por encima/debajo del viewport

interface Box {
  w: number;
  h: number;
  /** Dimensiones leídas de las variables CSS (--card-row/--card-ideal/--card-min). */
  rowH: number;
  idealW: number;
  minW: number;
}

const DEFAULT_BOX: Box = { w: 0, h: 0, rowH: 218, idealW: 168, minW: 150 };

/** Lee una medida CSS (var de :root) como número; fallback si no está disponible. */
function cssVarPx(name: string, fallback: number): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Rejilla de tarjetas con virtualización manual (sin librerías):
 * solo se montan las filas visibles + overscan, desplazadas con translateY.
 * Las medidas de celda viven en variables CSS para que la media query de
 * móvil (tarjetas compactas) y este cálculo hablen siempre el mismo idioma.
 */
export default function UnitGrid({ units }: { units: UnitSummary[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>(DEFAULT_BOX);
  const [scrollTop, setScrollTop] = useState(0);

  // Mide contenedor (alto de viewport), capa interna (ancho) y medidas CSS
  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    const update = (): void =>
      setBox({
        w: inner.clientWidth,
        h: container.clientHeight,
        rowH: cssVarPx('--card-row', DEFAULT_BOX.rowH),
        idealW: cssVarPx('--card-ideal', DEFAULT_BOX.idealW),
        minW: cssVarPx('--card-min', DEFAULT_BOX.minW),
      });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  // Al cambiar la lista filtrada, volvemos al principio
  useEffect(() => {
    containerRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [units]);

  // Número de columnas según el ancho disponible y el modo (compacto o no)
  const cols = box.w > 0 ? Math.max(1, Math.floor((box.w + GAP) / (box.idealW + GAP))) : 1;
  const cardW = Math.max(box.minW, Math.floor((box.w - GAP * (cols - 1)) / cols));
  const rows = Math.ceil(units.length / cols);
  const stride = box.rowH + GAP; // paso de fila real (celda + hueco)
  const totalH = rows * stride;
  const viewH = box.h > 0 ? box.h : 600;

  // Filas visibles con overscan; scrollTop acotado por si la lista encoge
  const top = Math.min(Math.max(0, scrollTop), Math.max(0, totalH - viewH));
  const firstRow = Math.max(0, Math.floor(top / stride) - OVERSCAN);
  const lastRow = Math.min(rows, Math.ceil((top + viewH) / stride) + OVERSCAN);
  const start = firstRow * cols;
  const end = Math.min(units.length, lastRow * cols);
  const slice = units.slice(start, end);

  const onScroll = (e: TargetedEvent<HTMLDivElement, Event>): void => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div class="unit-grid" ref={containerRef} onScroll={onScroll}>
      <div class="unit-grid__spacer" ref={innerRef} style={{ height: `${totalH}px` }}>
        <div
          class="unit-grid__layer"
          style={{
            transform: `translateY(${firstRow * stride}px)`,
            gridTemplateColumns: `repeat(${cols}, ${cardW}px)`,
          }}
        >
          {slice.map((u) => (
            <UnitCard key={u.id} unit={u} />
          ))}
        </div>
      </div>
    </div>
  );
}
