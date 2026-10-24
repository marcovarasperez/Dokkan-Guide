import type { MiniUnit } from '../data/detail';
import { thumbUrl, TYPE_COLORS } from '../data/adapter';

const hideBroken = (e: { currentTarget: HTMLImageElement }): void => {
  e.currentTarget.classList.add('img-broken');
};

/**
 * Tarjeta miniatura de unidad para listas de apoyo: líderes 200%+,
 * linking partners, formas y miembros de una categoría.
 */
export default function MiniUnitCard({ u, sub }: { u: MiniUnit; sub?: preact.ComponentChildren }) {
  const color = TYPE_COLORS[u.type];
  return (
    <div class="mini-unit">
      <a class="mini-unit__art" style={{ borderColor: color }} href={`#/characters/${u.id}`}>
        <img src={thumbUrl(u.iconId ?? u.id)} alt="" loading="lazy" onError={hideBroken} />
      </a>
      <div class="mini-unit__info">
        <a class="mini-unit__name" href={`#/characters/${u.id}`}>
          {u.name}
        </a>
        <span class="mini-unit__tags">
          <span class="mini-unit__type" style={{ background: color }}>
            {u.type}
          </span>
          <span class="mini-unit__rarity">{u.rarity}</span>
        </span>
        {sub}
      </div>
    </div>
  );
}
