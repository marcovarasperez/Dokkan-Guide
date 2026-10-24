import { useEffect, useState } from 'preact/hooks';
import { loadArchive, loadArchiveAll, type ArchiveBanner } from '../data/bannerArchive';
import { archiveState } from '../data/bannerArchive';
import { formatDate } from '../data/format';
import InfoImg from './InfoImg';
import { LoadMore, StatusBlock } from './gameShared';

/**
 * Sección Banners, dividida en ACTIVOS y FINALIZADOS — fuente: dokkaninfo.com.
 *
 *  - Activos: agrupados en 4 categorías como en la fuente:
 *      Recommended   → StoneGasha "de personaje" (Dokkan Festival / partidas),
 *      Dragon Stone  → StoneGasha de kais (Elder Kai, Mysterious Ritual),
 *      Ticket        → TicketGasha,
 *      Friend Pts.   → PointGasha + TutorialGasha.
 *  - Finalizados: archivo histórico paginado (status=Inactive).
 * Cualquier banner → detalle en-app (#/banners/{id}) con sus destacados.
 */

const fmtEpoch = (sec: number): string =>
  sec ? formatDate(new Date(sec * 1000).toISOString()) : '—';

type BannerTab = 'active' | 'ended';

type BannerGroupKey = 'recommended' | 'stone' | 'ticket' | 'friend';

const GROUPS: { key: BannerGroupKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'stone', label: 'Dragon Stone' },
  { key: 'ticket', label: 'Ticket' },
  { key: 'friend', label: 'Friend Pts.' },
];

/** Clasificación de un banner activo según su tipo y nombre. */
function groupOf(b: ArchiveBanner): BannerGroupKey {
  const t = (b.type ?? '').toLowerCase();
  const name = (b.name ?? '').toLowerCase();
  if (t.includes('ticket')) return 'ticket';
  if (t.includes('point') || t.includes('tutorial')) return 'friend';
  if (t.includes('stone') && /elder kai|mysterious ritual/.test(name)) return 'stone';
  return 'recommended';
}

function archiveStatus(b: ArchiveBanner): 'active' | 'upcoming' | 'ended' {
  const now = Date.now() / 1000;
  if (b.startsAt && now < b.startsAt) return 'upcoming';
  if (b.endsAt && now < b.endsAt) return 'active';
  return 'ended';
}

const STATUS_LABEL: Record<'active' | 'upcoming' | 'ended', string> = {
  active: 'Activo',
  upcoming: 'Próximamente',
  ended: 'Finalizado',
};

function BannerCard({ b }: { b: ArchiveBanner }) {
  const status = archiveStatus(b);
  const description = b.description.trim();
  return (
    <li class="banner-card">
      <a class="banner-card__link" href={`#/banners/${b.id}`}>
        <div class="banner-card__media">
          {b.image && <InfoImg url={b.image} alt={b.name} cls="banner-card__img" />}
        </div>
        <div class="banner-card__body">
          <div class="banner-card__meta">
            <span class={`banner-card__status banner-card__status--${status}`}>{STATUS_LABEL[status]}</span>
            <span class="banner-card__dates">
              {fmtEpoch(b.startsAt)} → {fmtEpoch(b.endsAt)}
            </span>
          </div>
          <h3 class="banner-card__title">{b.name}</h3>
          {description && <p class="news-card__summary">{description}</p>}
          <span class="banner-card__cta">Ver detalle del banner →</span>
        </div>
      </a>
    </li>
  );
}

/** Chip de frescura del listado (ya que el refresco lo hace la sincronización). */
function updatedAtText(at: number | null): string {
  if (!at) return '';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'Al día';
  if (mins < 60) return `Al día · hace ${mins} min`;
  return `Al día · hace ${Math.round(mins / 60)} h`;
}

export default function BannersView() {
  const [tab, setTab] = useState<BannerTab>('active');

  useEffect(() => {
    if (tab === 'active') void loadArchiveAll('active');
    else void loadArchive('ended');
  }, [tab]);

  const refresh = (): void => {
    if (tab === 'active') void loadArchiveAll('active', { force: true });
    else void loadArchive('ended', { force: true });
  };

  const arch = archiveState.value[tab];

  // Activos: 4 grupos (Recommended / Dragon Stone / Ticket / Friend Pts.).
  const groups = GROUPS.map((g) => ({ ...g, items: arch.items.filter((b) => groupOf(b) === g.key) })).filter(
    (g) => g.items.length > 0,
  );

  const empty = tab === 'active' ? groups.length === 0 : arch.items.length === 0;

  return (
    <div class="feed-scroll">
      <div class="feed">
        <div class="feed__head">
          <h2>Banners</h2>
          <span class="feed__status">{tab === 'active' ? updatedAtText(arch.updatedAt) : ''}</span>
          <button type="button" class="game-refresh" onClick={refresh} title="Actualizar esta sección">
            ⟳ Actualizar
          </button>
        </div>

        <nav class="game-tabs" aria-label="Estado de los banners">
          <button
            type="button"
            class={`game-tab${tab === 'active' ? ' game-tab--active' : ''}`}
            aria-current={tab === 'active' ? 'page' : undefined}
            onClick={() => setTab('active')}
          >
            Activos
          </button>
          <button
            type="button"
            class={`game-tab${tab === 'ended' ? ' game-tab--active' : ''}`}
            aria-current={tab === 'ended' ? 'page' : undefined}
            onClick={() => setTab('ended')}
          >
            Finalizados
          </button>
        </nav>

        {empty && arch.status === 'loading' ? (
          <p class="empty-state">Cargando banners…</p>
        ) : empty ? (
          <StatusBlock status={arch.status} onRetry={refresh} />
        ) : tab === 'active' ? (
          groups.map((g) => (
            <section class="banner-group" key={g.key}>
              <h3 class="banner-group__title">{g.label}</h3>
              <ul class="banner-list">
                {g.items.map((b) => (
                  <BannerCard b={b} key={b.id} />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <ul class="banner-list">
            {arch.items.map((b) => (
              <BannerCard b={b} key={b.id} />
            ))}
          </ul>
        )}

        {arch.status === 'ok' && (
          <LoadMore page={arch.page} lastPage={arch.lastPage} onMore={() => void loadArchive('ended', { append: true })} />
        )}

        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
