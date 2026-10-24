import { useEffect, useState } from 'preact/hooks';
import type { UnitSummary } from '../data/types';
import { getUnit } from '../data/repository';
import { fetchUnitDetail } from '../data/detail';
import type { UnitFull, AcquireDrop } from '../data/detail';
import { recommendHp, SKILL_LABEL, SKILL_ICON, SKILL_ICON_ON } from '../data/hp';
import type { HpSeed } from '../data/hp';
import { thumbUrl, fullArtUrl, TYPE_COLORS } from '../data/adapter';
import { formatDate, formatNumber } from '../data/format';
import SkillRich, { richInline, withChancePct } from './SkillRich';
import MiniUnitCard from './MiniUnit';
import { loadLinksIndex } from '../data/wiki';
import type { LinksIndex } from '../data/wiki';
import InfoImg from './InfoImg';

/** Seed de guías curated (carga perezosa, best-effort). */
let hpSeedPromise: Promise<HpSeed | null> | null = null;
function loadHpSeed(): Promise<HpSeed | null> {
  hpSeedPromise ??= fetch('/data/hidden_potential.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return hpSeedPromise;
}

const hideBroken = (e: { currentTarget: HTMLImageElement }): void => {
  e.currentTarget.classList.add('img-broken');
};

/** Grupos de superataque en el orden en que el jugador las distingue. */
const SA_GROUPS: { style: string; title: string; mod: string }[] = [
  { style: 'Normal', title: 'Super Attack', mod: 'normal' },
  { style: 'Ultra', title: 'Ultra Super Attack', mod: 'ultra' },
  { style: 'Unit', title: 'Unit Super Attack', mod: 'unit' },
  { style: 'EX', title: 'EX Super Attack', mod: 'ex' },
];

/** Estilo de SA de dokkaninfo → etiqueta del grupo (Hyper = Ultra, Ex = EX). */
const normalizeSaStyle = (style: string): string => {
  const s = (style ?? '').toLowerCase();
  if (s === 'hyper') return 'Ultra';
  if (s === 'ex') return 'EX';
  if (s === 'unit') return 'Unit';
  if (s === 'normal' || s === '') return 'Normal';
  return style;
};

/** ¿Queda en el futuro? (fecha ISO/epoch → chip "previsto") */
const isFuture = (iso: string | null): boolean =>
  !!iso && Date.parse(iso) > Date.now();

/** Etiqueta de estado para textos de aviso. */
const stateLabel = (k: 'base' | 'eza' | 'seza'): string =>
  k === 'base' ? 'Normal' : k === 'eza' ? 'EZA' : 'SEZA';

/**
 * Divide un leader skill en sus porcentajes: componente PRINCIPAL (la
 * categoría que lidera → chip "Líder") y componentes SECUNDARIOS (las partes
 * "; or …" — tipo u otra categoría → chip "Sub"). Cada componente toma el
 * máximo de sus % (p. ej. "HP & ATK +170 % and DEF +130 %" → 170).
 */
function splitLeaderPct(desc: string | null): { main: number | null; sub: number | null } {
  if (!desc) return { main: null, sub: null };
  // Componentes del skill: PRINCIPAL y, tras «;» o «or <Tipo> Type», el
  // SECUNDARIO (fallback). Los «or» ANTES del primer % unen categorías
  // alternativas del mismo componente («"X" or "Y" Category …»): no se parten.
  const segs: string[] = [];
  for (const part of desc.split(/\s*;\s*/)) {
    const cut = /\s+or\s+/gi;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = cut.exec(part))) {
      if (/\d{2,3}\s*%/.test(part.slice(cursor, m.index))) {
        segs.push(part.slice(cursor, m.index));
        cursor = m.index + m[0].length;
      }
    }
    segs.push(part.slice(cursor));
  }
  const clean = segs.map((s) => s.trim()).filter(Boolean);
  const maxPct = (s: string): number | null => {
    const nums = [...s.matchAll(/(\d{2,3})\s*%/g)].map((x) => Number(x[1]));
    return nums.length ? Math.max(...nums) : null;
  };
  const main = clean[0] ? maxPct(clean[0]) : null;
  const rest = clean.slice(1).map(maxPct).filter((n): n is number => n !== null);
  return { main, sub: rest.length ? Math.max(...rest) : null };
}

/** Sección estándar del detalle (estilo dokkaninfo). */
function Section({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <section class="detail-section">
      <h3 class="detail-section__title">{title}</h3>
      <div class="detail-section__body">{children}</div>
    </section>
  );
}

/**
 * Ficha completa de una unidad — datos de dokkaninfo.com.
 *
 * - Selector de FORMAS: la ficha incluye las formas transformadas publicadas
 *   (cada una con su leader/passive/SAs/stats reales).
 * - Selector de ESTADOS Normal / EZA / SEZA (según lo que tenga la unidad):
 *   los stats de cada estado salen del row de dokkaninfo (estado base) y para
 *   EZA/SEZA de la fórmula exacta (máx + redondeo del 48,39 % del margen
 *   min→máx) o del datamine de dokkan.fyi en la semilla. La fuente solo
 *   publica los textos del estado vigente: los pasados muestran sus stats con
 *   un aviso honesto.
 * - Líderes separados en líderes (200 %+ ) y sublíderes (cobertura parcial),
 *   cada uno con sus porcentajes divididos (líder / sub), y mejores linking
 *   partners según el ranking de la propia fuente.
 * - "¿Dónde conseguirlo?": banners con imagen, evento Z-Battle del EZA (una
 *   vez) y eventos de drop con su foto.
 */
export default function UnitDetail({ id }: { id: number }) {
  const summary: UnitSummary | null = getUnit(id);
  const [full, setFull] = useState<UnitFull | null>(null);
  const [formFull, setFormFull] = useState<UnitFull | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formIdx, setFormIdx] = useState(0); // 0 = forma actual · n = transformación n-1
  const [ezaView, setEzaView] = useState<'vigente' | 'base' | 'eza' | 'seza'>('vigente');
  const [seed, setSeed] = useState<HpSeed | null>(null);
  const [linksIndex, setLinksIndex] = useState<LinksIndex | null>(null);
  const [linksReady, setLinksReady] = useState(false);
  const [openLink, setOpenLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setFormIdx(0);
    setEzaView('vigente');
    setFormFull(null);
    setOpenLink(null);
    loadHpSeed().then((s) => alive && setSeed(s));
    loadLinksIndex().then((d) => {
      if (!alive) return;
      setLinksIndex(d);
      setLinksReady(true);
    });
    fetchUnitDetail(id)
      .then((d) => {
        if (alive) setFull(d);
      })
      .catch(() => {
        if (alive) setFailed(true); // ficha parcial con los datos del índice
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const forms = full?.transformationPath.filter((f) => f.id !== id) ?? [];
  const activeForm = formIdx > 0 ? forms[formIdx - 1] ?? null : null;

  // Carga perezosa de la ficha de la forma transformada seleccionada
  useEffect(() => {
    let alive = true;
    if (!activeForm) {
      setFormFull(null);
      return;
    }
    setFormLoading(true);
    fetchUnitDetail(activeForm.id)
      .then((d) => alive && setFormFull(d))
      .catch(() => alive && setFormFull(null))
      .finally(() => alive && setFormLoading(false));
    return () => {
      alive = false;
    };
  }, [activeForm?.id]);

  if (!summary) {
    return (
      <div class="detail">
        <p class="empty-state">Unidad no encontrada en la caché local.</p>
        <p class="detail-back-row">
          <a class="detail-back" href="#/">
            ← Volver al listado
          </a>
        </p>
      </div>
    );
  }

  const color = TYPE_COLORS[summary.type];
  const hp = recommendHp(summary, full, seed);

  const sezaAnnounced = summary.releaseDates.seza !== null && isFuture(summary.releaseDates.seza);
  const ezaAnnounced = summary.releaseDates.eza !== null && isFuture(summary.releaseDates.eza);
  // Estado que se juega hoy: el EZA/SEZA cuenta como vigente cuando ya llegó
  // (o cuando la fuente lo marca sin fecha — está en el juego).
  const sezaLive = summary.hasSeza && !sezaAnnounced;
  const ezaLive = (summary.hasEza && !ezaAnnounced) || sezaLive;
  const currentState: 'base' | 'eza' | 'seza' = sezaLive ? 'seza' : ezaLive ? 'eza' : 'base';
  // Selector Normal / EZA / SEZA según lo que tenga la unidad:
  // sin EZA → sin selector de estados (solo la forma vigente).
  const stateChips: { key: 'base' | 'eza' | 'seza'; label: string }[] =
    summary.hasEza || summary.hasSeza
      ? [
          { key: 'base', label: 'Normal' },
          ...(summary.hasEza ? [{ key: 'eza' as const, label: 'EZA' }] : []),
          ...(summary.hasSeza ? [{ key: 'seza' as const, label: 'SEZA' }] : []),
        ]
      : [];
  const viewingForm = activeForm !== null && formFull !== null;
  const viewState: 'base' | 'eza' | 'seza' = ezaView === 'vigente' ? currentState : ezaView;
  // Estado pasado = se muestran solo sus stats (los textos no existen en la fuente).
  const pastState = !viewingForm && stateChips.length > 0 && viewState !== currentState;

  // Datos efectivos según la vista (forma actual / forma transformada / estado)
  const viewFull = viewingForm ? formFull : full;
  const viewName = viewingForm && activeForm ? activeForm.name : summary.name;
  const viewIcon = viewingForm && activeForm ? activeForm.iconId ?? summary.thumbnailId : summary.thumbnailId;
  const viewType = viewingForm && activeForm ? activeForm.type : summary.type;
  const viewRarity = viewingForm && activeForm ? activeForm.rarity : summary.rarity;
  const viewColor = TYPE_COLORS[viewType];

  // Textos: la fuente solo publica el estado vigente de la unidad.
  const leader = pastState ? null : viewFull?.leaderSkill ?? summary.leaderSkill;
  const passive = pastState ? null : viewFull?.passiveSkill ?? summary.passiveSkill;
  const stats = viewFull?.stats ?? summary.stats;

  // Super Attacks divididas por tipo (Super / Ultra / Unit / EX), como el
  // jugador las distingue (estilo normalizado desde dokkaninfo).
  const allSa = pastState ? [] : viewFull?.superAttacks ?? [];
  const knownStyles = SA_GROUPS.map((g) => g.style);
  const saGroups = [
    ...SA_GROUPS.map((g) => ({ ...g, list: allSa.filter((s) => normalizeSaStyle(s.style) === g.style) })),
    {
      style: '',
      title: 'Otras',
      mod: 'normal',
      list: allSa.filter((s) => !knownStyles.includes(normalizeSaStyle(s.style))),
    },
  ].filter((g) => g.list.length > 0);
  const saMaxLevel = viewFull?.maxSaLevel ?? summary.maxSALevel ?? 0;

  // ¿Dónde conseguirlo? (todo dokkaninfo): banners del datajson (histórico
  // completo con imágenes), eventos de drop (drops.index.json) y Z-Battle.
  const acquire = full?.acquire;
  const banners = acquire?.banners ?? [];
  const activeBanners = banners.filter((b) => b.active);
  const oldBanners = banners.filter((b) => !b.active);
  const noAcquireData =
    !loading && (acquire ? !banners.length && !acquire.drops.length && !acquire.ezaBattles.length : true);

  // Eventos de drop agrupados por evento → tarjeta con la foto del evento
  // que enlaza a Eventos y despliega ese evento en concreto (?ev={type}/{id}).
  const dropEvents: { key: string; name: string; image: string | null; stages: AcquireDrop[] }[] = [];
  for (const d of acquire?.drops ?? []) {
    const cur = dropEvents.find((a) => a.key === d.eventKey);
    if (cur) cur.stages.push(d);
    else dropEvents.push({ key: d.eventKey, name: d.eventName, image: d.eventImage, stages: [d] });
  }

  // Stats del estado seleccionado (el row de la fuente SIEMPRE es el estado
  // base; EZA/SEZA usan stats.eza — valor real del datamine o fórmula de
  // dokkaninfo: máx. + 48,39 % del margen min→máx, ver detail.ts).
  const ezaSelected = !viewingForm && viewState === 'eza';
  const sezaSelected = !viewingForm && viewState === 'seza';
  const stateMax = (k: 'hp' | 'atk' | 'def'): number =>
    ezaSelected || sezaSelected ? stats[k].eza : stats[k].max;

  // Columnas 55 %/100 % del Hidden Potential (mismas fórmulas que dokkaninfo):
  // 55 % = bonus plano fijo según tablero de potential (1600; 2800 en los
  // tableros grandes 30–34); 100 % = ganancias absolutas del potential.
  const hipo = viewFull?.hipoGains ?? null;
  const hipoBoard = viewFull?.potentialBoardId ?? null;
  const hipoFlat = hipoBoard !== null && hipoBoard >= 30 && hipoBoard <= 34 ? 2800 : 1600;

  // Rankings de la ficha (líderes con sus porcentajes + linking partners)
  const leaders = full?.bestLeaders ?? [];
  const partners = full?.linkPartners ?? [];
  const bestPartner = partners.reduce<(typeof partners)[number] | null>(
    (a, b) => (a && a.shared >= b.shared ? a : b),
    null,
  );
  // Cada líder con sus porcentajes divididos (componente líder / sub): el
  // skill sale de la base local — los líderes listados son unidades del
  // propio repositorio. Separación en dos grupos según la cobertura.
  const leaderEntries = leaders.map((u) => ({
    u,
    ...splitLeaderPct(getUnit(u.id)?.leaderSkill?.description ?? null),
  }));
  const mainLeaders = leaderEntries
    .filter((e) => e.main == null || e.main >= 200)
    .sort((a, b) => (b.main ?? 200) - (a.main ?? 200));
  const subLeaders = leaderEntries
    .filter((e) => e.main != null && e.main < 200)
    .sort((a, b) => (b.main ?? 0) - (a.main ?? 0));

  // Efecto del link abierto (Nv.10/Nv.1 desde la semilla de links)
  const linkEntry =
    openLink && linksIndex ? linksIndex.links.find((e) => e.name === openLink) ?? null : null;

  // Lavado de fondo con la afinidad del tipo (custom property --type-tint).
  const detailStyle = { ['--type-tint']: color } as Record<string, string>;

  return (
    <div class="detail" style={detailStyle}>
      <div class="detail-back-row">
        <a class="detail-back" href="#/">
          ← Volver al listado
        </a>
        {loading && <span class="detail-loading">Cargando ficha…</span>}
        {failed && <span class="detail-warn">Sin conexión: mostrando datos de la caché del listado.</span>}
        {viewingForm && activeForm && (
          <span class="detail-formnote">Viendo la forma: {activeForm.name}</span>
        )}
        {!viewingForm && activeForm && formLoading && (
          <span class="detail-formnote">Cargando la forma…</span>
        )}
        {pastState && (
          <span class="detail-formnote">
            Viendo el estado {stateLabel(viewState)} — solo stats (la fuente no publica sus textos)
          </span>
        )}
      </div>

      {/* Selector: estado actual · estados EZA/SEZA · formas transformadas */}
      {(forms.length > 0 || stateChips.length > 0) && (
        <div class="form-bar" role="group" aria-label="Estados y formas de la unidad">
          <button
            type="button"
            class={`form-chip${!viewingForm && ezaView === 'vigente' ? ' form-chip--active' : ''}`}
            aria-pressed={!viewingForm && ezaView === 'vigente'}
            onClick={() => {
              setFormIdx(0);
              setEzaView('vigente');
            }}
          >
            <img src={thumbUrl(summary.thumbnailId)} alt="" loading="lazy" onError={hideBroken} />
            <span>Estado actual{stateChips.length > 0 ? ` (${stateLabel(currentState)})` : ''}</span>
          </button>
          {stateChips.map((c) => (
            <button
              type="button"
              class={`form-chip form-chip--state${!viewingForm && ezaView === c.key ? ' form-chip--active' : ''}`}
              aria-pressed={!viewingForm && ezaView === c.key}
              key={c.key}
              title={
                c.key === currentState
                  ? 'Estado vigente en el juego'
                  : `Stats del estado ${c.label.toLowerCase()} (textos no publicados por la fuente)`
              }
              onClick={() => {
                setFormIdx(0);
                setEzaView(c.key);
              }}
            >
              <span>
                {c.label}
                {c.key === currentState ? ' · vigente' : ''}
              </span>
            </button>
          ))}
          {forms.map((f, i) => (
            <button
              type="button"
              class={`form-chip${activeForm?.id === f.id ? ' form-chip--active' : ''}`}
              aria-pressed={activeForm?.id === f.id}
              key={f.id}
              onClick={() => {
                setEzaView('vigente');
                setFormIdx(i + 1);
              }}
            >
              <img src={thumbUrl(f.iconId ?? summary.thumbnailId)} alt="" loading="lazy" onError={hideBroken} />
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      )}

      <div class="detail-grid">
        {/* Columna fija: arte + identidad + stats + Hidden Potential */}
        <div class="detail-col detail-col--side">
          <div class="detail-hero" style={{ borderColor: viewColor }}>
            <div class="detail-hero__art">
              {/* Arte por transporte nativo (InfoImg): el <img> directo a
                  dokkaninfo queda bloqueado por ORB en la WebView y la carta
                  no se veía. */}
              <InfoImg url={fullArtUrl(viewIcon)} alt={viewName} cls="detail-hero__art-img" />
            </div>
            <div class="detail-hero__info">
              <h1 class="detail-hero__name">{viewName}</h1>
              <div class="detail-hero__tags">
                <span class="tag" style={{ background: viewColor }}>
                  {viewType} {viewingForm && activeForm ? '' : summary.class}
                </span>
                <span class="tag tag--muted">{viewRarity}</span>
                {!viewingForm && <span class="tag tag--muted">Coste {summary.cost}</span>}
                {!viewingForm && summary.hasSeza && <span class="tag tag--seza">SEZA</span>}
                {!viewingForm && summary.hasEza && !summary.hasSeza && <span class="tag tag--eza">EZA</span>}
              </div>

              {!viewingForm && (
                <ul class="detail-dates">
                  <li>
                    <span>Publicación</span> <b>{formatDate(summary.releaseDates.initial)}</b>
                  </li>
                  {summary.releaseDates.eza && (
                    <li>
                      <span>{isFuture(summary.releaseDates.eza) ? 'EZA previsto' : 'EZA'}</span>{' '}
                      <b>{formatDate(summary.releaseDates.eza)}</b>
                    </li>
                  )}
                  {summary.releaseDates.seza && (
                    <li>
                      <span>{isFuture(summary.releaseDates.seza) ? 'SEZA prevista' : 'SEZA'}</span>{' '}
                      <b>{formatDate(summary.releaseDates.seza)}</b>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Hidden Potential: resumen minimalista (solo en la vista vigente) */}
          {!viewingForm && !pastState && (
            <section class="hp-card">
              <header class="hp-card__head">
                <h3>Hidden Potential</h3>
              </header>
              <div class="hp-card__levels">
                {(['additional', 'critical', 'evasion'] as const).map((k) => {
                  const total = hp.levels[k];
                  return (
                    <span class={`hp-level${total === 0 ? ' hp-level--zero' : ''}`} key={k}>
                      <img
                        src={(total > 0 ? SKILL_ICON_ON : SKILL_ICON)[k]}
                        alt={SKILL_LABEL[k]}
                        width={34}
                        height={34}
                        loading="lazy"
                        onError={hideBroken}
                      />
                      <b class="hp-level__value">{total}</b>
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          <Section
            title={
              ezaSelected
                ? 'Stats (estado EZA)'
                : sezaSelected
                  ? 'Stats (estado SEZA)'
                  : !viewingForm && stateChips.length > 0
                    ? 'Stats (estado Normal)'
                    : 'Stats'
            }
          >
            <table class="stats-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Nv. 1</th>
                  <th>Nv. máx.</th>
                  {hipo && <th>55 %</th>}
                  {hipo && <th>100 %</th>}
                </tr>
              </thead>
              <tbody>
                {(['hp', 'atk', 'def'] as const).map((k) => (
                  <tr key={k}>
                    <th>{k.toUpperCase()}</th>
                    <td>{formatNumber(stats[k].base)}</td>
                    <td>{formatNumber(stateMax(k))}</td>
                    {hipo && <td>{formatNumber(stateMax(k) + hipoFlat)}</td>}
                    {hipo && <td>{formatNumber(stateMax(k) + hipo[k])}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {hipo && (
              <p class="skill-note">
                Hidden Potential: 55 % = máx. del estado + bonus plano del primer
                camino; 100 % = máx. + ganancias completas del potential.
              </p>
            )}
            {(ezaSelected || sezaSelected) && (
              <p class="skill-note">
                {ezaSelected
                  ? 'Stats EZA por la fórmula de dokkaninfo (máx. + 48,39 % del margen min→máx) o el datamine de dokkan.fyi.'
                  : 'Stats SEZA estimados con la fórmula de dokkaninfo (máx. + 48,39 % del margen min→máx): el datamine no publica stats SEZA.'}
              </p>
            )}
          </Section>
        </div>

        {/* Columna principal: habilidades + relaciones */}
        <div class="detail-col detail-col--main">
          <Section title="Leader Skill">
            {leader ? (
              <>
                <b class="skill-name">{leader.name}</b>
                <p class="skill-text">{richInline(leader.description, 'ld')}</p>
              </>
            ) : pastState ? (
              <p class="skill-text skill-text--dim">
                dokkaninfo solo publica los textos del estado vigente ({stateLabel(currentState)}); del
                estado {stateLabel(viewState)} se muestran sus stats.
              </p>
            ) : (
              <p class="skill-text skill-text--dim">Sin leader skill.</p>
            )}
          </Section>

          <Section title={allSa.length === 1 ? 'Super Attack' : 'Super Attacks'}>
            {saGroups.length ? (
              saGroups.map((g) => (
                <div class="sa-group" key={g.title}>
                  <h4 class={`sa-group-title sa-group-title--${g.mod}`}>
                    {g.title}
                    {g.list.length > 1 ? 's' : ''}
                  </h4>
                  {g.list.map((sa) => {
                    const style = normalizeSaStyle(sa.style);
                    // Tinte de fondo por tipo: amarillo Ultra, morado Unit, rojo EX.
                    const tint =
                      style === 'Unit' ? 'unit' : style === 'EX' ? 'ex' : sa.ki >= 18 ? 'ultra' : '';
                    // Multiplicador: 100 + base, y con bonus por nivel hasta el máximo vigente.
                    const multLv1 = sa.atkMultiplier !== null ? 100 + sa.atkMultiplier : null;
                    const multMax =
                      multLv1 !== null && sa.atkMultiplierBonus !== null && saMaxLevel > 0
                        ? multLv1 + sa.atkMultiplierBonus * (saMaxLevel - 1)
                        : null;
                    return (
                      <div class={`skill-block${tint ? ` skill-block--${tint}` : ''}`} key={`${sa.ki}-${sa.name}`}>
                        <div class="sa-head">
                          <b class="skill-name">{sa.name}</b>
                          <span class="skill-ki">({sa.ki} Ki)</span>
                        </div>
                        <p class="skill-text">{richInline(sa.description, `sa${sa.ki}`)}</p>
                        {sa.condition && (
                          <p class="sa-condition">
                            <b>Condición:</b>{' '}
                            {withChancePct(sa.condition.replace(/\s*\n\s*/g, ' '))}
                          </p>
                        )}
                        {multLv1 !== null && multMax !== null && (
                          <p class="sa-details">
                            {richInline(
                              `Se lanza desde ${sa.ki} Ki · Multiplicador de SA: ${multLv1}% (Nv. 1) → ${multMax}% (Nv. ${saMaxLevel})`,
                              `sad${sa.ki}`,
                            )}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : pastState ? (
              <p class="skill-text skill-text--dim">
                dokkaninfo no publica las Super Attacks del estado {stateLabel(viewState)}; solo sus
                stats.
              </p>
            ) : (
              <p class="skill-text skill-text--dim">
                {formLoading ? 'Cargando la forma…' : 'Detalles no disponibles sin conexión.'}
              </p>
            )}
          </Section>

          <Section title="Passive Skill">
            {passive ? (
              <>
                <b class="skill-name skill-name--passive">{passive.name}</b>
                <SkillRich text={passive.description} />
              </>
            ) : pastState ? (
              <p class="skill-text skill-text--dim">
                dokkaninfo no publica la pasiva del estado {stateLabel(viewState)}; solo sus stats.
              </p>
            ) : (
              <p class="skill-text skill-text--dim">Pasiva no disponible sin conexión.</p>
            )}
          </Section>

          {!pastState &&
            viewFull?.activeSkills.map((a) => (
              <Section title="Active Skill" key={a.name}>
                <b class="skill-name">{a.name}</b>
                <p class="skill-text">{richInline(a.description, `ac${a.name}`)}</p>
              </Section>
            ))}

          <Section title="Link Skills">
            <div class="link-chips">
              {(viewFull?.linkNames ?? summary.linkNames).map((l) => (
                <button
                  type="button"
                  key={l}
                  class={`link-chip link-chip--btn${openLink === l ? ' link-chip--on' : ''}`}
                  aria-pressed={openLink === l}
                  title={`Ver efecto de ${l}`}
                  onClick={() => setOpenLink(openLink === l ? null : l)}
                >
                  {l}
                </button>
              ))}
            </div>
            {openLink && (
              <div class="link-effect">
                <b class="link-effect__name">{openLink}</b>
                {linksReady && linksIndex ? (
                  linkEntry ? (
                    <>
                      <p class="link-effect__row link-effect__row--main">
                        <span class="link-effect__lv">Nv. 10</span>
                        {linkEntry.lv10 || '—'}
                      </p>
                      <p class="link-effect__row">
                        <span class="link-effect__lv">Nv. 1</span>
                        {linkEntry.lv1 || '—'}
                      </p>
                    </>
                  ) : (
                    <p class="skill-note">Efecto no disponible para este link.</p>
                  )
                ) : linksReady ? (
                  <p class="skill-note">Semilla de links no disponible.</p>
                ) : (
                  <p class="skill-note">Cargando efectos…</p>
                )}
              </div>
            )}
          </Section>

          {(viewFull?.categories.length ?? 0) > 0 && (
            <Section title="Categories">
              <div class="link-chips link-chips--cat">
                {viewFull?.categories.map((c) => (
                  <a class="link-chip link-chip--cat" href={`#/categorias/${c.id}`} key={c.id}>
                    {c.name}
                  </a>
                ))}
              </div>
              <p class="skill-note">Pulsa una categoría para ver sus líderes y sus personajes.</p>
            </Section>
          )}

          {/* Líderes que la cubren: separados líderes (200 %+ ) de sublíderes
              (parcial), cada tarjeta con sus porcentajes divididos. */}
          {!viewingForm && !pastState && leaderEntries.length > 0 && (
            <Section title="Líderes que la cubren">
              {mainLeaders.length > 0 && (
                <>
                  <p class="rank-note">
                    <b>Líderes</b> — cubren a {summary.name} con 200 % o más:
                  </p>
                  <div class="mini-units">
                    {mainLeaders.map(({ u, main, sub }) => (
                      <MiniUnitCard
                        u={u}
                        key={u.id}
                        sub={
                          <span class="leader-pcts">
                            <b class="leader-pct leader-pct--main">
                              Líder {main != null ? `${main} %` : '200 %+'}
                            </b>
                            {sub != null && (
                              <span class="leader-pct leader-pct--sub">Sub {sub} %</span>
                            )}
                          </span>
                        }
                      />
                    ))}
                  </div>
                </>
              )}
              {subLeaders.length > 0 && (
                <>
                  <p class="rank-note">
                    <b>Sublíderes</b> — cobertura parcial (menos del 200 %):
                  </p>
                  <div class="mini-units">
                    {subLeaders.map(({ u, main, sub }) => (
                      <MiniUnitCard
                        u={u}
                        key={u.id}
                        sub={
                          <span class="leader-pcts">
                            <b class="leader-pct leader-pct--sub">Sublíder {main} %</b>
                            {sub != null && (
                              <span class="leader-pct leader-pct--sub">Sec {sub} %</span>
                            )}
                          </span>
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </Section>
          )}

          {/* Mejores linking partners (ranking de dokkaninfo) */}
          {!viewingForm && !pastState && partners.length > 0 && (
            <Section title="Mejores linking partners">
              <p class="rank-note">
                Unidades con más links en común según dokkaninfo (comparten{' '}
                {bestPartner ? bestPartner.shared : 0} como máximo).
              </p>
              <div class="mini-units mini-units--partners">
                {partners.slice(0, 12).map((p) => (
                  <MiniUnitCard
                    u={p.unit}
                    key={p.unit.id}
                    sub={
                      <>
                        <span class="partner__count">{p.shared} links en común</span>
                        {p.sharedLinkNames.length > 0 && (
                          <span class="partner__links">
                            {p.sharedLinkNames.slice(0, 4).map((n) => (
                              <span class="link-chip link-chip--sm" key={n}>
                                {n}
                              </span>
                            ))}
                          </span>
                        )}
                      </>
                    }
                  />
                ))}
              </div>
            </Section>
          )}

          {/* ¿Dónde conseguirlo? — evento EZA, banners y eventos con drops (dokkaninfo) */}
          {!viewingForm && !pastState && (
            <Section title="¿Dónde conseguirlo?">
              {acquire?.ezaBattles.length ? (
                <div class="acq-block">
                  <h4 class="acq-sub">Evento EZA (Z-Battle)</h4>
                  <div class="acq-events">
                    {acquire.ezaBattles.slice(0, 1).map((z) => (
                      <a class="acq-event acq-event--eza" href={`#/eventos?ev=zbattle/${z.id}`} key={z.id}>
                        {z.image && <InfoImg url={z.image} alt="" cls="acq-event__img" />}
                        <span class="acq-event__info">
                          <b>Z-Battle de {summary.name}</b>
                          <span class="acq-event__stage">
                            {summary.hasSeza ? 'Mejora SEZA de esta unidad' : 'Mejora EZA de esta unidad'}
                          </span>
                          <span class="acq-banner__tag">Ver evento →</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
              {(activeBanners.length > 0 || oldBanners.length > 0) && (
                <div class="acq-block">
                  <h4 class="acq-sub">Banners</h4>
                  <div class="acq-banners">
                    {activeBanners.map((b) => (
                      <a class="acq-banner" href={`#/banners/${b.id}`} key={`a-${b.id}`}>
                        {b.image && <InfoImg url={b.image} alt="" cls="acq-banner__img" />}
                        <span class="acq-banner__info">
                          <b>{b.name}</b>
                          <span class="acq-banner__dates">
                            {b.startsAt ? formatDate(new Date(b.startsAt * 1000).toISOString()) : '…'} →{' '}
                            {b.endsAt ? formatDate(new Date(b.endsAt * 1000).toISOString()) : '…'}
                          </span>
                          <span class="acq-banner__tag">Activo ahora mismo</span>
                        </span>
                      </a>
                    ))}
                    {oldBanners.map((b) => (
                      <a class="acq-banner" href={`#/banners/${b.id}`} key={`h-${b.id}`}>
                        {b.image && <InfoImg url={b.image} alt="" cls="acq-banner__img" />}
                        <span class="acq-banner__info">
                          <b>{b.name}</b>
                          <span class="acq-banner__dates">
                            {b.startsAt ? formatDate(new Date(b.startsAt * 1000).toISOString()) : '…'} →{' '}
                            {b.endsAt ? formatDate(new Date(b.endsAt * 1000).toISOString()) : '…'}
                          </span>
                          <span class="acq-banner__tag acq-banner__tag--old">Finalizado</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {dropEvents.length > 0 && (
                <div class="acq-block">
                  <h4 class="acq-sub">Eventos donde cae</h4>
                  <div class="acq-events">
                    {dropEvents.map((a) => (
                      <a class="acq-event" href={`#/eventos?ev=${a.key}`} key={a.key}>
                        {a.image && <InfoImg url={a.image} alt="" cls="acq-event__img" />}
                        <span class="acq-event__info">
                          <b>{a.name}</b>
                          {a.stages.map((s, i) => (
                            <span class="acq-event__stage" key={`${s.eventKey}-${i}`}>
                              {s.stageName}
                              {s.difficulty ? ` · ${s.difficulty}` : ''}
                            </span>
                          ))}
                          <span class="acq-banner__tag">Ver evento →</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {acquire?.summonable && (
                <span class={`acq-chip${acquire.summonable === 'FreeToPlay' ? ' acq-chip--f2p' : ''}`}>
                  {acquire.summonable === 'FreeToPlay' ? 'Free to Play' : 'Obtenible por Summons'}
                </span>
              )}
              {noAcquireData && (
                <p class="skill-text skill-text--dim">
                  Se consigue principalmente mediante Summons. Consulta la sección{' '}
                  <a href="#/banners">Banners</a> (activos y finalizados); el resto de
                  contenido del juego está en <a href="#/eventos">Eventos</a> y{' '}
                  <a href="#/baba">Tienda de Baba</a>.
                </p>
              )}
            </Section>
          )}
        </div>
      </div>

      <p class="detail-legal">Datos: DOKKANINFO · Proyecto fan no comercial</p>
    </div>
  );
}
