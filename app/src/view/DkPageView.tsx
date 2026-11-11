import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useDkPageController } from '../controller/dkPageController';
import type { DkTile } from '../model/dkPage';
import { thumbUrl } from '../model/adapter';
import { formatDate } from '../model/date';
import { hideBroken } from './InfoImg';

/**
 * VISTA · Página de catálogo de dokkaninfo (Items, Panel Missions, Schedule,
 * Tips, Awakening Medals y cualquier enlace interno #/dk/…).
 *
 * Pinta los bloques que entrega `model/dkPage.ts`:
 *  - `html`: el contenido de la página ya saneado, con la maquetación en
 *    filas/columnas de la fuente (estilos `.dk-page` en app.css);
 *  - `tiles`: fichas imagen + título + texto (Tips, medallas agrupadas);
 *  - `cards`: miniaturas de personaje que abren su ficha (Schedule).
 *
 * `header` permite a la vista contenedora poner su barra de sub-pestañas.
 */
export default function DkPageView({ path, header, title }: { path: string; header?: ComponentChildren; title?: string }) {
  const { data, status, bodyRef, reload } = useDkPageController(path);

  return (
    <div class="feed-scroll">
      <div class="feed">
        {header}
        <div class="feed__head">
          <h2>{title ?? data?.title ?? 'Cargando…'}</h2>
          <button type="button" class="game-refresh" onClick={reload}>
            Actualizar
          </button>
        </div>

        {status === 'loading' && !data && <p class="game-loading">Cargando…</p>}
        {status === 'error' && !data && (
          <div class="game-error">
            <p>No se pudo cargar la página (¿sin conexión?).</p>
            <button type="button" class="game-retry" onClick={reload}>
              Reintentar
            </button>
          </div>
        )}
        {data && data.blocks.length === 0 && (
          <p class="empty-state">
            Esta sección de dokkaninfo no tiene contenido que se pueda mostrar en la app.
          </p>
        )}

        <div ref={bodyRef}>
          {data?.blocks.map((b, i) =>
            b.kind === 'html' ? (
              <div class="dk-page" key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
            ) : b.kind === 'tiles' ? (
              <Tiles tiles={b.tiles} key={i} />
            ) : (
              <div class="dk-cards" key={i}>
                {b.cards.map((c) => (
                  <a class="dk-card" href={`#/characters/${c.id}`} key={c.id}>
                    <img src={thumbUrl(c.thumbnailId)} alt="" loading="lazy" onError={hideBroken} />
                    <span class="dk-card__name">{c.name}</span>
                    {c.date && <span class="dk-card__date">{formatDate(c.date)}</span>}
                  </a>
                ))}
              </div>
            ),
          )}
        </div>

        <p class="game-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}

/** Fichas agrupadas (si traen `group`, se pinta un encabezado por grupo). */
function Tiles({ tiles }: { tiles: DkTile[] }) {
  const groups: { name: string; items: DkTile[] }[] = [];
  for (const t of tiles) {
    const name = t.group ?? '';
    const g = groups.find((x) => x.name === name);
    if (g) g.items.push(t);
    else groups.push({ name, items: [t] });
  }
  const grid = (items: DkTile[]) => (
    <div class="dk-tiles">
      {items.map((t, i) => (
        <div class="dk-tile" key={i}>
          {t.image && <img src={t.image} data-dinfo="1" alt="" loading="lazy" />}
          <div>
            <b>{t.title}</b>
            <p>{t.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
  if (groups.length < 2) return grid(tiles);
  // Varios grupos (p. ej. medallas por rareza, como las pestañas de la fuente):
  // desplegables, solo el primero abierto, para no pintar miles de fichas.
  return (
    <>
      {groups.map((g, i) => (
        <GroupDetails key={g.name} name={`${g.name} (${g.items.length})`} open={i === 0}>
          {grid(g.items)}
        </GroupDetails>
      ))}
    </>
  );
}

/** Desplegable que solo monta su contenido cuando está abierto. */
function GroupDetails({ name, open, children }: { name: string; open: boolean; children: ComponentChildren }) {
  const [isOpen, setOpen] = useState(open);
  return (
    <details class="game-card dk-group" open={isOpen} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary class="dk-tiles__group">{name}</summary>
      {isOpen && children}
    </details>
  );
}
