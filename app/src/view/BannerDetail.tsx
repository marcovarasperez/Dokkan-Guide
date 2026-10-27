import type { ComponentChild } from 'preact';
import type { BannerCardRef } from '../model/bannerArchive';
import { formatDate } from '../model/format';
import { useBannerDetailController } from '../controller/bannerDetailController';
import InfoImg from './InfoImg';
import UnitCard from './UnitCard';
import type { UnitCardData } from './UnitCard';
import type { UnitSummary } from '../model/types';

/**
 * Detalle de un banner (activo o finalizado): imagen, fechas, descripción y
 * personajes destacados. Los destacados se muestran como ficha in-app cuando
 * los conocemos (por id de personaje) o como enlace con su nombre.
 * Datos: dokkaninfo /banners/{id}.
 */

const RARITY_LABEL: Record<number, string> = { 1: 'N', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'LR' };

export default function BannerDetail({ id, units }: { id: number; units: UnitSummary[] }) {
  const { st, detail } = useBannerDetailController(id);

  /** Destacado → celda con nuestra propia miniatura si la conocemos. */
  const featuredCell = (c: BannerCardRef): ComponentChild => {
    const u = units.find((x) => x.id === c.id);
    if (u) {
      const data: UnitCardData = {
        id: u.id,
        name: u.name,
        type: u.type,
        class: u.class,
        rarity: u.rarity,
        thumbnailId: u.thumbnailId,
        hasEza: u.hasEza,
        hasSeza: u.hasSeza,
      };
      return <UnitCard unit={data} />;
    }
    return (
      <a class="banner-unit-chip" href={`#/characters/${c.id}`}>
        {c.name || `Personaje ${c.id}`}
        {c.rarity && RARITY_LABEL[c.rarity] ? ` (${RARITY_LABEL[c.rarity]})` : ''}
      </a>
    );
  };

  return (
    <div class="feed-scroll">
      <div class="feed">
        <a class="tj-back" href="#/banners">
          ← Todos los banners
        </a>

        {st.status === 'loading' || (st.id === id && !detail && st.status !== 'error') ? (
          <p class="empty-state">Cargando banner…</p>
        ) : st.status === 'error' && !detail ? (
          <p class="empty-state">No se pudo cargar el banner (¿sin conexión?).</p>
        ) : detail ? (
          <article class="bdetail">
            {detail.image && <InfoImg url={detail.image} alt={detail.name} cls="bdetail__img" />}
            <div class="bdetail__meta">
              <span class="banner-card__dates">
                {detail.startsAt ? formatDate(detail.startsAt) : '…'} →{' '}
                {detail.endsAt ? formatDate(detail.endsAt) : '…'}
              </span>
            </div>
            <h2 class="bdetail__title">{detail.name}</h2>
            {detail.description && <p class="bdetail__desc">{detail.description}</p>}

            {detail.featured.length > 0 && (
              <section class="bdetail__section">
                <h3>Personajes destacados</h3>
                <ul class="banner-featured__list">
                  {detail.featured.map((c) => (
                    <li class="banner-featured__item" key={c.id}>
                      {featuredCell(c)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {detail.unfeatured.length > 0 && (
              <details class="bdetail__more">
                <summary>Pool de no destacados ({detail.unfeatured.length})</summary>
                <div class="link-chips link-chips--cat">
                  {detail.unfeatured.map((c) => (
                    <a class="link-chip" href={`#/characters/${c.id}`} key={c.id}>
                      {c.name || `Personaje ${c.id}`}
                    </a>
                  ))}
                </div>
              </details>
            )}
          </article>
        ) : null}

        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
