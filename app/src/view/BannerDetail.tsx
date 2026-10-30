import type { ComponentChild } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import type { BannerCardRef } from '../model/bannerArchive';
import { formatDate } from '../model/format';
import { useBannerDetailController } from '../controller/bannerDetailController';
import InfoImg from './InfoImg';
import UnitCard from './UnitCard';
import type { UnitCardData } from './UnitCard';
import type { UnitSummary } from '../model/types';
import { fetchUnitSummary } from '../model/detail';

/**
 * Detalle de un banner (activo o finalizado): imagen, fechas, descripción y
 * personajes destacados. Los destacados se muestran como ficha in-app cuando
 * los conocemos (por id de personaje) o como enlace con su nombre.
 * Datos: dokkaninfo /banners/{id}.
 * Orden destacados: rareza más alta primero (LR→SSR), luego fecha de publicación (antiguos primero).
 * Solo se muestran rarezas SSR+. Nuevos (latestType === 'initial') van en la primera fila.
 * No destacados: solo SSR+, ordenados por fecha de publicación.
 */

const RARITY_LABEL: Record<number, string> = { 1: 'N', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'LR' };

// Conversión numérica → string para ordenar coherentemente
const NUM_TO_RARITY: Record<number, string> = { 1: 'N', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'LR' };

// Orden de rareza (mayor = más raro)
const RARITY_ORDER: Record<string, number> = { LR: 5, UR: 4, SSR: 3, SR: 2, R: 1, N: 0 };

// Rarezas permitidas (SSR en adelante) - tanto para destacados como no destacados
const ALLOWED_RARITIES = new Set(['SSR', 'UR', 'LR']);

/** Obtiene el orden de rareza (0-5) desde summary (string) o card (number). */
const getRarityOrder = (summary: UnitSummary | null, cardRarity: number | null): number => {
  if (summary) return RARITY_ORDER[summary.rarity] ?? 0;
  if (cardRarity != null) return RARITY_ORDER[NUM_TO_RARITY[cardRarity]] ?? 0;
  return 0;
};

/** Verifica si un personaje es "nuevo en ESTE banner" (su lanzamiento inicial coincide con el inicio del banner). */
const isNewCharacter = (summary: UnitSummary | null, bannerStartsAt: number | null): boolean => {
  if (!summary || !summary.releaseDates.initial || !bannerStartsAt) return false;
  const initialRelease = summary.releaseDates.initial * 1000; // convertir a ms
  const bannerStart = bannerStartsAt * 1000;
  const diffDays = Math.abs(initialRelease - bannerStart) / (1000 * 60 * 60 * 24);
  return diffDays <= 14; // ventana de 14 días: personaje debutó en este banner
};

/** Verifica si la rareza cumple el mínimo (SSR+). */
const isAllowedRarity = (summary: UnitSummary | null, cardRarity: number | null): boolean => {
  if (summary) return ALLOWED_RARITIES.has(summary.rarity);
  if (cardRarity != null) return ALLOWED_RARITIES.has(NUM_TO_RARITY[cardRarity]);
  return false;
};

export default function BannerDetail({ id, units }: { id: number; units: UnitSummary[] }) {
  const { st, detail } = useBannerDetailController(id);
  const [summaryCache, setSummaryCache] = useState<Record<number, UnitSummary>>({});
  const [unfeaturedCache, setUnfeaturedCache] = useState<Record<number, UnitSummary>>({});
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [unfeaturedLoading, setUnfeaturedLoading] = useState(false);
  const [showUnfeatured, setShowUnfeatured] = useState(false);

  /** Color por rareza para el placeholder (mismo que los iconos). */
  const rarityColor = (r: number | null): string => {
    const colors: Record<number, string> = {
      1: '#9e9e9e', // N
      2: '#4caf50', // R
      3: '#2196f3', // SR
      4: '#ff9800', // SSR
      5: '#f44336', // LR
    };
    return r ? colors[r] : '#757575';
  };

  /** Fetch de todos los summaries faltantes de los destacados. */
  useEffect(() => {
    if (!detail || detail.featured.length === 0) return;

    const missing = detail.featured.filter(
      (c) => !units.find((u) => u.id === c.id) && !summaryCache[c.id]
    );
    if (missing.length === 0) return;

    let cancelled = false;
    setFeaturedLoading(true);

    Promise.all(
      missing.map((c) => fetchUnitSummary(c.id).then((s) => ({ card: c, summary: s })))
    ).then((results) => {
      if (cancelled) return;
      const newCache: Record<number, UnitSummary> = { ...summaryCache };
      for (const { card, summary } of results) {
        if (summary) newCache[card.id] = summary;
      }
      setSummaryCache(newCache);
      setFeaturedLoading(false);
    });

    return () => { cancelled = true; };
  }, [detail, units, summaryCache]);

  /** Fetch de summaries de no destacados cuando se abre la sección. */
  useEffect(() => {
    if (!showUnfeatured || !detail || detail.unfeatured.length === 0) return;

    const missing = detail.unfeatured.filter(
      (c) => !units.find((u) => u.id === c.id) && !unfeaturedCache[c.id]
    );
    if (missing.length === 0) return;

    let cancelled = false;
    setUnfeaturedLoading(true);

    Promise.all(
      missing.map((c) => fetchUnitSummary(c.id).then((s) => ({ card: c, summary: s })))
    ).then((results) => {
      if (cancelled) return;
      const newCache: Record<number, UnitSummary> = { ...unfeaturedCache };
      for (const { card, summary } of results) {
        if (summary) newCache[card.id] = summary;
      }
      setUnfeaturedCache(newCache);
      setUnfeaturedLoading(false);
    });

    return () => { cancelled = true; };
  }, [showUnfeatured, detail, units, unfeaturedCache]);

  /** Construye la lista completa de destacados con sus datos (local + cache + placeholder), filtrados a SSR+. */
  const featuredWithData = useMemo(() => {
    if (!detail) return [] as Array<{ card: BannerCardRef; summary: UnitSummary | null }>;
    return detail.featured
      .map((c) => {
        const u = units.find((x) => x.id === c.id) ?? summaryCache[c.id] ?? null;
        return { card: c, summary: u };
      })
      .filter(({ summary, card }) => isAllowedRarity(summary, card.rarity));
  }, [detail, units, summaryCache]);

  /** Separa destacados en nuevos (primera fila) y resto. */
  const { newFeatured, otherFeatured } = useMemo(() => {
    const newOnes: Array<{ card: BannerCardRef; summary: UnitSummary | null }> = [];
    const others: Array<{ card: BannerCardRef; summary: UnitSummary | null }> = [];
    for (const item of featuredWithData) {
      if (isNewCharacter(item.summary, detail?.startsAt ?? null)) newOnes.push(item);
      else others.push(item);
    }
    return { newFeatured: newOnes, otherFeatured: others };
  }, [featuredWithData, detail?.startsAt]);

  /** Orden para destacados: rareza descendente (LR→SSR), luego fecha publicación DESCENDENTE (nuevos primero). */
  const sortFeatured = (arr: Array<{ card: BannerCardRef; summary: UnitSummary | null }>) =>
    [...arr].sort((a, b) => {
      const ra = getRarityOrder(a.summary, a.card.rarity);
      const rb = getRarityOrder(b.summary, b.card.rarity);
      if (rb !== ra) return rb - ra;
      const da = a.summary?.releaseDates.initial ?? 0;
      const db = b.summary?.releaseDates.initial ?? 0;
      if (da && db) return db - da; // NUEVOS primero (fecha descendente)
      return 0;
    });

  const sortedNewFeatured = useMemo(() => sortFeatured(newFeatured), [newFeatured]);
  const sortedOtherFeatured = useMemo(() => sortFeatured(otherFeatured), [otherFeatured]);

  /** No destacados con datos (SIN filtro de rareza), ordenados: rareza descendente, luego fecha publicación descendente (nuevos primero). */
  const unfeaturedWithData = useMemo(() => {
    if (!detail || !showUnfeatured) return [] as Array<{ card: BannerCardRef; summary: UnitSummary | null }>;
    return detail.unfeatured
      .map((c) => {
        const u = units.find((x) => x.id === c.id) ?? unfeaturedCache[c.id] ?? null;
        return { card: c, summary: u };
      })
      .sort((a, b) => {
        const ra = getRarityOrder(a.summary, a.card.rarity);
        const rb = getRarityOrder(b.summary, b.card.rarity);
        if (rb !== ra) return rb - ra; // rareza mayor primero
        const da = a.summary?.releaseDates.initial ?? 0;
        const db = b.summary?.releaseDates.initial ?? 0;
        if (da && db) return db - da; // NUEVOS primero
        return 0;
      });
  }, [detail, showUnfeatured, units, unfeaturedCache]);

  /** Total de no destacados (para el contador del botón). */
  const unfeaturedTotal = detail?.unfeatured.length ?? 0;

  /** Render de una celda (UnitCard o placeholder). */
  const renderCell = ({ card, summary }: { card: BannerCardRef; summary: UnitSummary | null }): ComponentChild => {
    if (summary) {
      const data: UnitCardData = {
        id: summary.id,
        name: summary.name,
        type: summary.type,
        class: summary.class,
        rarity: summary.rarity,
        thumbnailId: summary.thumbnailId,
        hasEza: summary.hasEza,
        hasSeza: summary.hasSeza,
      };
      return <UnitCard unit={data} />;
    }
    return (
      <div class="banner-unit-placeholder" style={{ '--rarity-color': rarityColor(card.rarity) }}>
        <span class="banner-unit-placeholder__name">{card.name || `Personaje ${card.id}`}</span>
        {card.rarity && <span class="banner-unit-placeholder__rarity">{RARITY_LABEL[card.rarity]}</span>}
      </div>
    );
  };

  return (
    <div class="feed-scroll">
      <div class="feed feed--banners">
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

            {/* --- PERSONAJES DESTACADOS --- */}
            {(sortedNewFeatured.length > 0 || sortedOtherFeatured.length > 0) && (
              <section class="bdetail__section">
                <h3>Personajes destacados</h3>

                {/* Grid 1: solo personajes nuevos (debut en este banner) */}
                {sortedNewFeatured.length > 0 && (
                  <ul class="banner-featured__grid">
                    {sortedNewFeatured.map(({ card, summary }) => (
                      <li key={card.id} class="banner-featured__item">
                        {renderCell({ card, summary })}
                        <span class="banner-featured__new-badge">Nuevo</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Separador visual entre nuevos y el resto */}
                {sortedNewFeatured.length > 0 && sortedOtherFeatured.length > 0 && (
                  <div class="banner-featured__separator" aria-hidden="true" />
                )}

                {/* Grid 2: resto de destacados */}
                {sortedOtherFeatured.length > 0 && (
                  <ul class="banner-featured__grid">
                    {sortedOtherFeatured.map(({ card, summary }) => (
                      <li key={card.id} class="banner-featured__item">
                        {renderCell({ card, summary })}
                      </li>
                    ))}
                  </ul>
                )}

                {(featuredLoading || unfeaturedLoading) && (
                  <p class="banner-loading-hint">Cargando datos de personajes…</p>
                )}
              </section>
            )}

            {/* --- NO DESTACADOS (botón desplegable) --- */}
            {detail.unfeatured.length > 0 && (
              <section class="bdetail__section">
                <button
                  type="button"
                  class="bdetail__unfeatured-toggle"
                  onClick={() => setShowUnfeatured(!showUnfeatured)}
                  aria-expanded={showUnfeatured}
                >
                  <span>No Destacados</span>
                  <span class="bdetail__unfeatured-count">({unfeaturedTotal})</span>
                  <span class="bdetail__unfeatured-arrow" aria-hidden="true">
                    {showUnfeatured ? '▲' : '▼'}
                  </span>
                </button>

                {showUnfeatured && (
                  <div class="banner-featured__row-group">
                    {unfeaturedLoading ? (
                      <p class="banner-loading-hint">Cargando personajes no destacados…</p>
                    ) : unfeaturedWithData.length > 0 ? (
                      <ul class="banner-featured__list">
                        {unfeaturedWithData.map(({ card, summary }) => (
                          <li class="banner-featured__item" key={card.id}>
                            {renderCell({ card, summary })}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p class="empty-state">No hay personajes no destacados.</p>
                    )}
                  </div>
                )}
              </section>
            )}

          </article>
        ) : null}

        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}