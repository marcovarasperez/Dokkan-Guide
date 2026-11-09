import type { BabaItem, BabaChest, BabaShopKey } from '../model/game';
import { getUnit } from '../model/repository';
import { thumbUrl } from '../model/adapter';
import { formatDate, formatNumber } from '../model/date';
import { useBabaController } from '../controller/babaController';
import InfoImg, { hideBroken } from './InfoImg';
import { LoadMore, StatusBlock } from './gameShared';

/**
 * Vista "Tienda de Baba" (dokkaninfo.com): Puntos de Intercambio, Zeni,
 * Tesoro y Cofres Secretos. Tesoro es interactivo: cada joya abre su tienda
 * (qué se puede comprar con ella, precio en joyas, stock y vigencia).
 * Los objetos que son cartas muestran la miniatura real del personaje.
 *
 * Toda la lógica vive en `controller/babaController.ts` (`useBabaController`):
 * esta vista solo pinta la sección activa.
 */

const BABA_TABS: { key: BabaShopKey; label: string }[] = [
  { key: 'trade', label: 'Puntos de Intercambio' },
  { key: 'zeni', label: 'Zeni' },
  { key: 'treasure', label: 'Tesoro' },
  { key: 'chests', label: 'Cofres Secretos' },
];

const n = (v: number): string => formatNumber(v);

/** Tarjeta de objeto de la tienda (compartida entre secciones y detalle de joya). */
function BabaItemCard({ it, unit }: { it: BabaItem; unit: string }) {
  // Si el objeto es una carta, usa su miniatura real (con fallback al icono del objeto).
  const cardIcon = it.cardId !== null ? getUnit(it.cardId)?.thumbnailId ?? it.cardId : null;
  return (
    <article class="baba-item">
      {cardIcon !== null ? (
        <a class="baba-item__icon baba-item__icon--card" href={`#/characters/${it.cardId}`}>
          <img src={thumbUrl(cardIcon)} alt="" loading="lazy" onError={hideBroken} />
        </a>
      ) : (
        it.img && <InfoImg url={it.img} alt={it.name} cls="baba-item__icon" />
      )}
      <div class="baba-item__info">
        {it.cardId !== null ? (
          <a class="baba-item__name baba-item__name--card" href={`#/characters/${it.cardId}`}>
            {it.name}
            <span class="baba-item__hint">Ver ficha →</span>
          </a>
        ) : (
          <b class="baba-item__name">{it.name}</b>
        )}
        <ul class="baba-rows">
          {it.rows.map((r, i) => (
            <li class={`baba-row${r.sale ? ' baba-row--sale' : ''}`} key={i}>
              <span>x{n(r.qty)}</span>
              {r.sale && r.discount !== null ? (
                <>
                  <s class="baba-row__old">{n(r.price)}</s>
                  <em class="baba-row__new">{n(r.discount)} {unit}</em>
                </>
              ) : (
                <b>
                  {n(r.price)} {unit}
                </b>
              )}
              {r.stock != null && (
                <span class="baba-row__stock">
                  {r.stock === 'infinite' ? 'Stock ∞' : `${n(r.stock)} disp.`}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export default function BabaView() {
  const { tab, baba, treasure: td, unit, pickTab, refresh, onRetry, onMore, openTreasure, retryTreasure, closeTreasure } =
    useBabaController();

  return (
    <main class="game">
      <header class="game-head">
        <h1 class="game-title">Tienda de Baba</h1>
        <button type="button" class="game-refresh" onClick={refresh} title="Actualizar esta sección">
          ⟳ Actualizar
        </button>
      </header>

      <nav class="baba-tabs" aria-label="Secciones de la tienda de Baba">
        {BABA_TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            class={`baba-tab${tab === t.key ? ' baba-tab--active' : ''}`}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => pickTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div class="game-body">
        {tab === 'chests' ? (
          baba.status === 'ok' && baba.items.length ? (
            <>
              <p class="baba-note">Cofres de tesoro secreto: se compran con Dragon Stones o Puntos de Baba.</p>
              <div class="baba-grid baba-grid--chests">
                {(baba.items as BabaChest[]).map((c) => (
                  <article class="baba-chest" key={c.id}>
                    <span class="baba-chest__glyph" aria-hidden="true">
                      🎁
                    </span>
                    <b class="baba-chest__title">{c.title}</b>
                    <span class="baba-chest__price">
                      {n(c.price)} {c.premium ? '· Dragon Stones' : '· Pts. de Baba'}
                    </span>
                    <span class="baba-chest__dates">
                      {c.startsAt ? formatDate(c.startsAt) : ''} →{' '}
                      {c.endsAt ? formatDate(c.endsAt) : ''}
                    </span>
                    {!c.buyable && <span class="baba-chest__off">No disponible</span>}
                  </article>
                ))}
              </div>
              <LoadMore page={baba.page} lastPage={baba.lastPage} onMore={onMore} />
            </>
          ) : (
            <StatusBlock status={baba.status} onRetry={onRetry} />
          )
        ) : tab === 'treasure' ? (
          td.ref !== null ? (
            /* ---- Detalle: qué se puede comprar con la joya ---- */
            <section class="tj-detail">
              <button type="button" class="tj-back" onClick={closeTreasure}>
                ← Todas las joyas
              </button>
              <header class="tj-head">
                {td.img && <InfoImg url={td.img} alt={td.name} cls="tj-head__img" />}
                <div class="tj-head__text">
                  <h2>{td.name}</h2>
                  <span>
                    {td.status === 'ok'
                      ? `${td.items.length} ${td.items.length === 1 ? 'objeto comprable' : 'objetos comprables'}`
                      : 'Cargando compras…'}
                  </span>
                </div>
              </header>
              {td.status === 'ok' && td.items.length ? (
                <div class="baba-grid">
                  {td.items.map((it) => (
                    <BabaItemCard it={it} unit="joyas" key={it.key} />
                  ))}
                </div>
              ) : td.status === 'loading' ? (
                <p class="game-loading">Cargando la tienda de esta joya…</p>
              ) : (
                <StatusBlock status={td.status} onRetry={retryTreasure} />
              )}
            </section>
          ) : baba.status === 'ok' && baba.items.length ? (
            /* ---- Rejilla de joyas: clic → tienda de esa joya ---- */
            <>
              <p class="baba-note">
                Monedas de intercambio del juego. Toca una joya para ver qué puedes comprar con ella.
              </p>
              <div class="baba-grid baba-grid--jewels">
                {(baba.items as BabaItem[]).map((it) =>
                  it.ref ? (
                    <button
                      type="button"
                      class="baba-jewel"
                      key={it.key}
                      onClick={() => openTreasure(it)}
                      title={`Ver qué se puede comprar con ${it.name}`}
                    >
                      {it.img && <InfoImg url={it.img} alt={it.name} cls="baba-jewel__img" />}
                      <span class="baba-jewel__name">{it.name}</span>
                      <span class="baba-jewel__hint">Ver compras →</span>
                    </button>
                  ) : (
                    <figure class="baba-jewel baba-jewel--static" key={it.key} title={it.name}>
                      {it.img && <InfoImg url={it.img} alt={it.name} cls="baba-jewel__img" />}
                      <span class="baba-jewel__name">{it.name}</span>
                    </figure>
                  ),
                )}
              </div>
            </>
          ) : (
            <StatusBlock status={baba.status} onRetry={onRetry} />
          )
        ) : baba.status === 'ok' && baba.items.length ? (
          <>
            {tab === 'trade' && <p class="baba-note">Objetos a cambio de Puntos de Intercambio de Baba.</p>}
            {tab === 'zeni' && <p class="baba-note">Objetos a cambio de Zeni.</p>}
            <div class="baba-grid">
              {(baba.items as BabaItem[]).map((it) => (
                <BabaItemCard it={it} unit={unit} key={it.key} />
              ))}
            </div>
          </>
        ) : (
          <StatusBlock status={baba.status} onRetry={onRetry} />
        )}
      </div>

      <p class="game-legal">Datos: DOKKANINFO.COM · Proyecto fan no comercial</p>
    </main>
  );
}
