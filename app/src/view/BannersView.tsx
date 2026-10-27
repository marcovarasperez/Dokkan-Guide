import type { ArchiveBanner } from '../model/bannerArchive';
import { formatDate } from '../model/format';
import { useBannersController } from '../controller/bannersController';
import InfoImg from './InfoImg';
import { LoadMore, StatusBlock } from './gameShared';

/**
 * Sección Banners, dividida en ACTIVOS y FINALIZADOS — fuente: dokkaninfo.com.
 *
 * Solo pinta: la pestaña, la descarga/refresco del archivo, la paginación y la
 * agrupación de los banners activos viven en `controller/bannersController.ts`.
 * Cualquier banner → detalle en-app (#/banners/{id}) con sus destacados.
 */

const fmtEpoch = (sec: number): string =>
  sec ? formatDate(sec) : '—';

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
  const { tab, setTab, arch, groups, empty, refresh, loadMore } = useBannersController();

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
          <LoadMore page={arch.page} lastPage={arch.lastPage} onMore={loadMore} />
        )}

        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
