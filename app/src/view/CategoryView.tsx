import type { UnitSummary } from '../model/types';
import { formatNumber } from '../model/format';
import { useCategoryController } from '../controller/categoryController';
import MiniUnitCard from './MiniUnit';

const hideBroken = (e: { currentTarget: HTMLImageElement }): void => {
  e.currentTarget.classList.add('img-broken');
};

/** Imagen oficial de la etiqueta de categoría (assets de dokkaninfo). */
const labelUrl = (id: number): string =>
  `https://dokkaninfo.com/assets/global/en/card_category/label/card_category_label_${String(id).padStart(4, '0')}_b_on.png`;

/**
 * Explorador de CATEGORÍAS (estilo wiki): la lista completa y, al entrar en
 * una categoría, sus LÍDERES (con el boost de su leader skill) y sus
 * PERSONAJES, cada uno con enlace a su ficha. Datos de la semilla local
 * (dokkan.fyi, mismo datamine de los clientes oficiales) + etiquetas oficiales
 * de dokkaninfo. Se llega desde las chips de la ficha o desde Filtros.
 *
 * Toda la lógica vive en `controller/categoryController.ts`
 * (`useCategoryController`): esta vista solo pinta la lista o el detalle.
 */
export default function CategoryView({ id, units }: { id: number | null; units: UnitSummary[] }) {
  const { idx, loading, missing, cat, list, leaderRows, memberRows, query, onQuery } = useCategoryController(
    id,
    units,
  );

  const legal = <p class="detail-legal">Datos: DOKKANINFO · Categorías: semilla local (datamine de los clientes oficiales)</p>;

  if (loading) {
    return (
      <div class="feed-scroll">
        <div class="cat-wrap">
          <p class="empty-state">Cargando categorías…</p>
        </div>
      </div>
    );
  }
  if (missing) {
    return (
      <div class="feed-scroll">
        <div class="cat-wrap">
          <p class="detail-back-row">
            <a class="detail-back" href="#/">
              ← Volver al listado
            </a>
          </p>
          <p class="empty-state">Semilla de categorías no disponible. Vuelve a sincronizar la app.</p>
        </div>
      </div>
    );
  }

  // ----- Detalle -----
  if (id !== null) {
    return (
      <div class="feed-scroll">
        <div class="cat-wrap">
          <p class="detail-back-row">
            <a class="detail-back" href="#/categorias">
              ← Todas las categorías
            </a>
            <a class="detail-back" href="#/">
              ← Volver al listado
            </a>
          </p>
          {!cat ? (
            <p class="empty-state">Categoría no encontrada en la semilla local.</p>
          ) : (
            <>
              <header class="cat-hero">
                <img
                  class="cat-hero__label"
                  src={labelUrl(cat.id)}
                  alt=""
                  width={340}
                  height={70}
                  loading="lazy"
                  onError={hideBroken}
                />
                <h1 class="cat-hero__name">{cat.name}</h1>
                <p class="cat-hero__meta">
                  <b>{formatNumber(memberRows.length)}</b> personajes · <b>{formatNumber(leaderRows.length)}</b>{' '}
                  líderes
                </p>
              </header>

              <section class="detail-section">
                <h3 class="detail-section__title">Líderes de la categoría</h3>
                <div class="detail-section__body">
                  {leaderRows.length ? (
                    <div class="mini-units">
                      {leaderRows.map(({ u, boost }) => (
                        <MiniUnitCard
                          u={u}
                          key={u.id}
                          sub={
                            boost !== null ? (
                              <span class="cat-boost" title="Boost máximo de su leader skill">
                                +{boost}%
                              </span>
                            ) : null
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p class="skill-text skill-text--dim">
                      Sin líderes catalogados (su leader skill no menciona esta categoría).
                    </p>
                  )}
                </div>
              </section>

              <section class="detail-section">
                <h3 class="detail-section__title">Personajes de la categoría</h3>
                <div class="detail-section__body">
                  {memberRows.length ? (
                    <div class="mini-units">
                      {memberRows.map((u) => (
                        <MiniUnitCard u={u} key={u.id} />
                      ))}
                    </div>
                  ) : (
                    <p class="skill-text skill-text--dim">Sin personajes en la semilla local.</p>
                  )}
                </div>
              </section>
            </>
          )}
          {legal}
        </div>
      </div>
    );
  }

  // ----- Lista -----
  return (
    <div class="feed-scroll">
      <div class="cat-wrap">
        <p class="detail-back-row">
          <a class="detail-back" href="#/">
            ← Volver al listado
          </a>
        </p>
        <h1 class="cat-title">
          Categorías <span class="cat-title__count">{formatNumber(idx?.categories.length ?? 0)}</span>
        </h1>
        <input
          type="search"
          class="filter-bar__input cat-search"
          placeholder="Buscar categoría…"
          value={query}
          onInput={(e) => onQuery((e.target as HTMLInputElement).value)}
        />
        <div class="cat-grid">
          {list.map((c) => {
            const nMembers = (idx?.members[String(c.id)] ?? []).length;
            const nLeaders = (idx?.leaders[String(c.id)] ?? []).length;
            return (
              <a class="cat-card" href={`#/categorias/${c.id}`} key={c.id}>
                <img
                  class="cat-card__label"
                  src={labelUrl(c.id)}
                  alt=""
                  width={340}
                  height={70}
                  loading="lazy"
                  onError={hideBroken}
                />
                <span class="cat-card__meta">
                  <b>{formatNumber(nMembers)}</b> personajes · <b>{formatNumber(nLeaders)}</b> líderes
                </span>
                {c.bestLeaderName && (
                  <span class="cat-card__best" title="Mejor líder de la categoría">
                    👑 {c.bestLeaderName}
                  </span>
                )}
              </a>
            );
          })}
          {list.length === 0 && (
            <p class="empty-state">Sin resultados para «{query}».</p>
          )}
        </div>
        {legal}
      </div>
    </div>
  );
}
