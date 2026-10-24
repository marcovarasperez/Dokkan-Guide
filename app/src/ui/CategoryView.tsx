import { useEffect, useMemo, useState } from 'preact/hooks';
import type { UnitSummary } from '../data/types';
import { loadCategoriesIndex } from '../data/wiki';
import type { CategoriesIndex, CategoryEntry, CategoryLeader } from '../data/wiki';
import { formatNumber } from '../data/format';
import MiniUnitCard from './MiniUnit';
import type { MiniUnit } from '../data/detail';

const hideBroken = (e: { currentTarget: HTMLImageElement }): void => {
  e.currentTarget.classList.add('img-broken');
};

/** Imagen oficial de la etiqueta de categoría (assets de dokkaninfo). */
const labelUrl = (id: number): string =>
  `https://dokkaninfo.com/assets/global/en/card_category/label/card_category_label_${String(id).padStart(4, '0')}_b_on.png`;

/** Orden de rarezas (del más bajo al más alto), como en el juego. */
const RARITY_ORDER: Record<string, number> = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };

/** Búsqueda sin tildes y en minúsculas (igual que la lista de personajes). */
const norm = (s: string): string => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Miniatura de unidad para las listas de categoría. */
const toMini = (u: UnitSummary): MiniUnit => ({
  id: u.id,
  name: u.name,
  type: u.type,
  rarity: u.rarity,
  iconId: u.thumbnailId,
});

/**
 * Explorador de CATEGORÍAS (estilo wiki): la lista completa y, al entrar en
 * una categoría, sus LÍDERES (con el boost de su leader skill) y sus
 * PERSONAJES, cada uno con enlace a su ficha. Datos de la semilla local
 * (dokkan.fyi, mismo datamine de los clientes oficiales) + etiquetas oficiales
 * de dokkaninfo. Se llega desde las chips de la ficha o desde Filtros.
 */
export default function CategoryView({ id, units }: { id: number | null; units: UnitSummary[] }) {
  const [idx, setIdx] = useState<CategoriesIndex | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    loadCategoriesIndex().then((d) => {
      if (!alive) return;
      setIdx(d);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  // Índices de membresía (para los contadores de la lista)
  const catMap = useMemo(() => new Map((idx?.categories ?? []).map((c) => [c.id, c])), [idx]);

  const loading = !ready;
  const missing = ready && idx === null;

  // ---------- Lista de categorías ----------
  const q = norm(query.trim());
  const list = useMemo(() => {
    const cats = idx?.categories ?? [];
    const out = q ? cats.filter((c) => norm(c.name).includes(q)) : cats;
    return [...out].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }, [idx, q]);

  // ---------- Detalle de una categoría ----------
  const cat: CategoryEntry | null = id !== null ? catMap.get(id) ?? null : null;
  const leaderRows: { u: MiniUnit; boost: number | null }[] = useMemo(() => {
    if (id === null || !idx) return [];
    const rows: CategoryLeader[] = idx.leaders[String(id)] ?? [];
    return rows
      .map((l) => {
        const u = byId.get(l.id);
        return u ? { u: toMini(u), boost: l.boost } : null;
      })
      .filter((x): x is { u: MiniUnit; boost: number | null } => x !== null);
  }, [id, idx, byId]);

  const memberRows: MiniUnit[] = useMemo(() => {
    if (id === null || !idx) return [];
    const ids = idx.members[String(id)] ?? [];
    const out: UnitSummary[] = [];
    for (const uid of ids) {
      const u = byId.get(uid);
      if (u) out.push(u);
    }
    out.sort(
      (a, b) => (RARITY_ORDER[b.rarity] ?? 0) - (RARITY_ORDER[a.rarity] ?? 0) || a.name.localeCompare(b.name, 'es'),
    );
    return out.map(toMini);
  }, [id, idx, byId]);

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
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
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
