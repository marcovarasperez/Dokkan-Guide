import { newsStatusText } from '../model/news';
import { formatDate, epochToISO } from '../model/date';
import { useNewsController } from '../controller/newsController';
import InfoImg from './InfoImg';

/**
 * Sección Noticias: campañas y eventos del juego (fuente: dokkaninfo.com).
 * Se leen dentro de la app, sin salir de ella. Solo pinta: la lista, el estado
 * de refresco y el error viven en `controller/newsController.ts`.
 */
export default function NewsView() {
  const { refreshing, failed, items } = useNewsController();

  return (
    <div class="feed-scroll">
      <div class="feed">
        <div class="feed__head">
          <h2>Noticias</h2>
          <span class={`feed__status${refreshing ? ' feed__status--busy' : ''}`}>{newsStatusText()}</span>
        </div>

        {items.length === 0 ? (
          <p class="empty-state">
            {failed ? 'Sin conexión · las noticias se cargarán en la próxima actualización.' : 'Cargando noticias…'}
          </p>
        ) : (
          <ul class="news-list">
            {items.map((n) => (
              <li class="news-card" key={n.id}>
                <a class="news-card__link" href={`#/noticias/${n.id}`}>
                  <div class="news-card__media">
                    {n.banner && <InfoImg url={n.banner} alt="" cls="news-card__img" />}
                  </div>
                  <div class="news-card__body">
                    <div class="news-card__meta">
                      {n.tab && <span class="news-card__tab">{n.tab}</span>}
                      {n.category && <span class="news-card__cat">{n.category}</span>}
                      <time datetime={epochToISO(n.startAt) ?? undefined}>{formatDate(n.startAt)}</time>
                    </div>
                    <h3 class="news-card__title">{n.title}</h3>
                    {n.summary && <p class="news-card__summary">{n.summary}</p>}
                    <span class="news-card__cta">Leer →</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}

        <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
