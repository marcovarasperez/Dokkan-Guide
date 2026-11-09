import { useListController } from '../controller/listController';
import UnitGrid from './UnitGrid';
import type { UnitSummary } from '../model/types';

/**
 * Vista "Recientes": los 30 personajes más recientes con su último despertar.
 * Muestra solo la forma más avanzada de cada personaje (mayor rareza:
 * LR > UR > SSR > SR > R > N), que tenga actividad reciente.
 */
export default function RecentView() {
  const { units } = useListController();

  const recentUnits = useMemo(() => {
    // 1. Agrupar por nombre + tipo (ej. "Buu (Kid)|INT")
    // Esto agrupa etapas de despertar (UR→LR) y artes alternativas (mismo rareza) juntas
    const groups = new Map<string, UnitSummary[]>();
    for (const u of units) {
      if (!u.releaseDates?.latest) continue;
      const key = u.name + '|' + u.type;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(u);
    }

    // 2. Por cada grupo (nombre+tipo), quedarse con TODAS las cartas de mayor rareza
    // - Si hay varias con la misma rareza máxima → son artes alternativas (se guardan ambas)
    // - Si hay rarezas distintas → solo la mayor (ej. UR→LR, se queda LR)
    const rarityOrder = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };
    const finalForms: UnitSummary[] = [];
    for (const group of groups.values()) {
      // Encontrar rareza máxima del grupo
      let maxRarity = 0;
      for (const u of group) {
        const r = rarityOrder[u.rarity] ?? 0;
        if (r > maxRarity) maxRarity = r;
      }
      // Solo incluir si la rareza máxima es UR o LR (>= 4)
      if (maxRarity < 4) continue;
      // Añadir todas las cartas que tengan esa rareza máxima (artes alternativas)
      for (const u of group) {
        const r = rarityOrder[u.rarity] ?? 0;
        if (r === maxRarity) {
          finalForms.push(u);
        }
      }
    }

    // 3. Ordenar por fecha más reciente (latest = SEZA > EZA > initial) y tomar 30
    return finalForms
      .sort((a, b) => (b.releaseDates.latest ?? 0) - (a.releaseDates.latest ?? 0))
      .slice(0, 30);
  }, [units]);

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
        {recentUnits.length === 0 ? (
          <p class="empty-state">No hay datos de personajes recientes.</p>
        ) : (
          <UnitGrid units={recentUnits} targetRows={3} />
        )}
        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}

// useMemo helper for Preact
import { useMemo } from 'preact/hooks';