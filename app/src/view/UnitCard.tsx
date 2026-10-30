import type { TargetedEvent } from 'preact';
import type { UnitSummary } from '../model/types';
import { freshIds } from '../model/repository';
import { frameUrl, thumbUrl, typeIconUrl, rarityIconUrl } from '../model/adapter';

/**
 * Nota: no se usa `<picture>` con variante `.avif` — la fuente solo publica
 * `.png` (el `.avif` devolvía 404 y la tarjeta se quedaba sin arte). Cloudflare
 * de dokkaninfo ya negocia WebP solo por la cabecera `Accept`.
 */
/** Imagen rota → oculta; el marco de color de la celda hace de fallback. */
const hideBroken = (e: TargetedEvent<HTMLImageElement, Event>): void => {
  e.currentTarget.classList.add('img-broken');
};

/** Forma mínima que necesita la celda (el UnitSummary del índice la cumple). */
export type UnitCardData = Pick<
  UnitSummary,
  'id' | 'name' | 'type' | 'class' | 'rarity' | 'thumbnailId' | 'hasEza' | 'hasSeza'
>;

/** Celda del listado: arte + marco + iconos, replicando la composición del juego. */
export default function UnitCard({ unit }: { unit: UnitCardData }) {
  const frame = frameUrl(unit.type, unit.rarity);
  const thumb = thumbUrl(unit.thumbnailId);
  const badge = unit.hasSeza ? 'SEZA' : unit.hasEza ? 'EZA' : null;
  // Nueva (o EZA/SEZA recién aplicado) según la última sincronización.
  const fresh = freshIds.value.has(unit.id);

  return (
    <article class="unit-card" title={unit.name}>
      <a class="unit-card__link" href={`#/characters/${unit.id}`} aria-label={`Ver ficha de ${unit.name}`}></a>
      <div class="unit-card__art">
        {fresh && <span class="unit-card__badge unit-card__badge--new">NUEVA</span>}
        {badge && (
          <span class={`unit-card__badge unit-card__badge--${badge.toLowerCase()}`}>{badge}</span>
        )}
        {/* Contenedores div (no <picture>): el CSS escala el img dentro
            (.unit-card__frame img / .unit-card__thumb img). */}
        <div class="unit-card__frame">
          <img
            src={frame}
            width={120}
            height={120}
            alt=""
            loading="lazy"
            draggable={false}
            onError={hideBroken}
          />
        </div>
        <div class="unit-card__thumb">
          <img
            src={thumb}
            width={150}
            height={150}
            alt={`Arte de ${unit.name}`}
            title={unit.name}
            loading="lazy"
            draggable={false}
            onError={hideBroken}
          />
        </div>
        <img
          class="unit-card__type-icon"
          src={typeIconUrl(unit.type, unit.class)}
          width={58}
          height={58}
          alt={`Tipo ${unit.type} ${unit.class}`}
          loading="lazy"
          draggable={false}
          onError={hideBroken}
        />
        <img
          class="unit-card__rarity-icon"
          src={rarityIconUrl(unit.rarity)}
          width={72}
          height={72}
          alt={`Rareza ${unit.rarity}`}
          loading="lazy"
          draggable={false}
          onError={hideBroken}
        />
      </div>
      <p class="unit-card__name" title={unit.name}>
        {unit.name}
      </p>
      {/* La barra "LR · #id" se eliminó a petición: la rareza ya va en el
          icono del arte y el id no aporta nada en el listado. */}
    </article>
  );
}
