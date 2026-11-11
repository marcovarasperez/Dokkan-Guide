import { useMemo, useState } from 'preact/hooks';
import { useLinksIndex } from '../controller/toolsController';
import SubTabs from './SubTabs';

/**
 * VISTA · "Cards › Links": todos los Link Skills con su efecto a Nv. 1 y
 * Nv. 10 (seed `links.index.json`, de dokkaninfo /links), con buscador por
 * nombre o efecto. Cada link abre su página de dokkaninfo dentro de la app
 * (#/dk/links/{id}: los 10 niveles y los personajes que lo tienen).
 */
export default function LinksView() {
  const links = useLinksIndex();
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const all = Array.from(links.values()).sort((a, b) => a.name.localeCompare(b.name));
    return s ? all.filter((l) => `${l.name} ${l.lv1} ${l.lv10}`.toLowerCase().includes(s)) : all;
  }, [links, q]);

  return (
    <div class="feed-scroll">
      <div class="feed">
        <SubTabs section="cards" label="Secciones de cartas" />
        <div class="feed__head">
          <h2>Links ({rows.length})</h2>
        </div>
        <input
          type="search"
          class="filter-bar__input"
          placeholder="Buscar link o efecto…"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
        {links.size === 0 && <p class="game-loading">Cargando…</p>}
        <div class="links-list">
          {rows.map((l) => (
            <a class="game-card links-item" key={l.name} href={`#/dk/${encodeURIComponent(`links/${l.id}`)}`}>
              <b>{l.name}</b>
              <span class="links-item__fx">
                <span>Nv. 1: {l.lv1}</span>
                <span>Nv. 10: {l.lv10}</span>
              </span>
            </a>
          ))}
        </div>
        <p class="game-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
      </div>
    </div>
  );
}
