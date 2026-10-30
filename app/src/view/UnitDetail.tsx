import { useState } from 'preact/hooks';
import { SKILL_LABEL, SKILL_ICON, SKILL_ICON_ON } from '../model/hp';
import { thumbUrl, fullArtUrl } from '../model/adapter';
import { formatDate, formatNumber } from '../model/format';
import { useUnitDetail, isFuture, normalizeSaStyle, LEADER_MIN_PCT } from '../controller/unitDetailController';
import SkillRich, { richInline, withChancePct } from './SkillRich';
import MiniUnitCard from './MiniUnit';
import InfoImg from './InfoImg';

/** Imagen rota (sin red / borrada): se oculta en vez de mostrar el icono. */
const hideBroken = (e: { currentTarget: HTMLImageElement }): void => {
  e.currentTarget.classList.add('img-broken');
};

/** Etiqueta de estado para textos de aviso. */
const stateLabel = (k: 'base' | 'eza' | 'seza'): string =>
  k === 'base' ? 'Normal' : k === 'eza' ? 'EZA' : 'SEZA';

/** Sección estándar del detalle (estilo dokkaninfo). */
function Section({ title, children, onTitleClick, expanded }: { title: string; children: preact.ComponentChildren; onTitleClick?: () => void; expanded?: boolean }) {
  return (
    <section class="detail-section">
      <h3 class="detail-section__title" onClick={onTitleClick} style={onTitleClick ? { cursor: 'pointer' } : undefined}>
        {title}
        {onTitleClick && <span class={`detail-section__chevron${expanded ? ' detail-section__chevron--open' : ''}`} aria-hidden="true">▼</span>}
      </h3>
      <div class="detail-section__body">{children}</div>
    </section>
  );
}

/**
 * Botón "Mostrar más (N)" / "Mostrar menos" de las listas largas de la
 * ficha (líderes, sublíderes y linking partners). Si la lista entera ya
 * cabe en el recorte, no pinta nada.
 */
function MoreBtn({
  total,
  shown,
  showAll,
  onToggle,
  label,
}: {
  total: number;
  shown: number;
  showAll: boolean;
  onToggle: () => void;
  label: string;
}) {
  if (total <= shown) return null;
  return (
    <button type="button" class="list-more" aria-expanded={showAll} onClick={onToggle}>
      {showAll ? `Mostrar menos (${label})` : `Mostrar más (${total - shown} ${label})`}
    </button>
  );
}

/** Forma de un banner de "¿Dónde conseguirlo?" (gemas o tickets). */
interface AcqBannerData {
  id: number;
  name: string;
  startsAt: number | null;
  endsAt: number | null;
  image: string | null;
  active: boolean;
}

function BannerCard({ b }: { b: AcqBannerData }) {
  return (
    <a class="acq-banner" href={`#/banners/${b.id}`}>
      {b.image && <InfoImg url={b.image} alt="" cls="acq-banner__img" />}
      <span class="acq-banner__info">
        <b>{b.name}</b>
        <span class="acq-banner__dates">
          {b.startsAt ? formatDate(b.startsAt) : '…'} →{' '}
          {b.endsAt ? formatDate(b.endsAt) : '…'}
        </span>
        <span class={`acq-banner__tag${b.active ? '' : ' acq-banner__tag--old'}`}>
          {b.active ? 'Activo ahora mismo' : 'Finalizado'}
        </span>
      </span>
    </a>
  );
}

/**
 * VISTA · Ficha completa de una unidad (datos de dokkaninfo.com).
 *
 * Esta vista SOLO pinta: toda la lógica (descarga de la ficha, selector de
 * estados SEZA/EZA/Normal, selector de formas, stats por estado, rankings y
 * "¿Dónde conseguirlo?") vive en `controller/unitDetailController.ts`.
 *
 * - Selector de FORMAS: la ficha incluye las formas transformadas publicadas
 *   (cada una con su leader/passive/SAs/stats reales).
 * - Selector de ESTADOS solo cuando la unidad tiene EZA y/o SEZA, en orden
 *   SEZA → EZA → Normal (si no tiene ninguna, la ficha no muestra selector).
 * - El título de la carta (p. ej. «Secret Weapon of Confidence») se pinta como
 *   subtítulo, en pequeño, antes que el nombre del personaje.
 */
export default function UnitDetail({ id }: { id: number }) {
  const {
    summary,
    loading,
    failed,
    detailStyle,
    // selector de estados
    stateChips,
    currentState,
    setEzaView,
    isStateActive,
    viewState,
    pastState,
    stateStatus,
    ezaSelected,
    sezaSelected,
    // selector de formas
    forms,
    setFormIdx,
    activeForm,
    formLoading,
    viewingForm,
    // datos de la vista activa
    viewFull,
    viewName,
    viewIcon,
    viewType,
    viewRarity,
    viewColor,
    subtitle,
    // animación de la carta (canvas sobre el arte estático)
    animCanvasRef,
    animReady,
    animAssetId,
    leader,
    passive,
    stats,
    stateMax,
    allSa,
    saGroups,
    saMaxLevel,
    // Hidden Potential
    hp,
    hipo,
    hipoFlat,
    // relaciones y obtención
    mainLeaders,
    subLeaders,
    partners,
    mainLeadersView,
    subLeadersView,
    partnersView,
    listLimit,
    showAllLeaders,
    showAllSubs,
    showAllPartners,
    toggleLeaders,
    toggleSubs,
    togglePartners,
    bestPartner,
    acquire,
    noAcquireData,
    bannerGroups,
    acqEvents,
    acqEventsTotal,
    showAllEvents,
    toggleEvents,
    ezaEvents,
    ezaEventsTotal,
    showAllEza,
    toggleEza,
    ezaMedals,
    ezaMedalsTotal,
    showAllMedals,
    toggleMedals,
    sezaMedals,
    sezaMedalsTotal,
    showAllSezaMedals,
    toggleSezaMedals,
    ezaEventMissing,
    // links
    openLink,
    setOpenLink,
    linksReady,
    linksIndex,
    linkEntry,
  // Recompensas de Torneo Mundial
    tournamentRewards,
  } = useUnitDetail(id);

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
      </div>

      <div class="detail-grid">
        {/* Columna fija: arte + identidad + stats + Hidden Potential */}
        <div class="detail-col detail-col--side">
          <div class="detail-hero" style={{ borderColor: viewColor }}>
            <div class="detail-hero__art">
              {/* Arte por transporte nativo (InfoImg): el <img> directo a
                  dokkaninfo queda bloqueado por ORB en la WebView y la carta
                  no se veía. */}
              <InfoImg url={fullArtUrl(viewIcon)} alt={viewName} cls="detail-hero__art-img" />
              {/* Animación de la carta (motor LWF) sobre el arte: si la fuente
                  no la publica o algo falla, el lienzo no llega a montarse /
                  no se marca como listo y se ve el arte estático de detrás. */}
              {animAssetId !== null && (
                <canvas
                  ref={animCanvasRef}
                  class={`detail-hero__anim${animReady ? ' is-ready' : ''}`}
                  width={426}
                  height={568}
                  aria-hidden="true"
                />
              )}
            </div>
            <div class="detail-hero__info">
              {/* Estados (SEZA → EZA → Normal) y, debajo, las formas
                  transformadas: los dos selectores encima del cuadro del
                  nombre, en ese orden. Cada carta visible (base o forma)
                  muestra SUS estados; cambiar de estado no toca la forma. */}
              {stateChips.length > 0 && (
                <div class="hero-states" role="group" aria-label="Estados de la unidad">
                  {stateChips.map((c) => (
                    <button
                      type="button"
                      class={`form-chip form-chip--state${isStateActive(c.key) ? ' form-chip--active' : ''}`}
                      aria-pressed={isStateActive(c.key)}
                      key={c.key}
                      title={
                        c.key === currentState
                          ? 'Estado vigente en el juego'
                          : `Información del estado ${c.label.toLowerCase()} (leader, pasiva, Super Attacks y nivel máx. de SA)`
                      }
                      onClick={() => {
                        setEzaView(c.key);
                      }}
                    >
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {forms.length > 0 && (
                <div class="hero-forms" role="group" aria-label="Formas de la unidad">
                  <button
                    type="button"
                    class={`form-chip${!viewingForm ? ' form-chip--active' : ''}`}
                    aria-pressed={!viewingForm}
                    title="Ver la forma actual de la unidad"
                    onClick={() => {
                      setFormIdx(0);
                      setEzaView('vigente');
                    }}
                  >
                    <img src={thumbUrl(summary.thumbnailId)} alt="" loading="lazy" onError={hideBroken} />
                    <span>Estado actual</span>
                  </button>
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
              {subtitle && <p class="detail-hero__subtitle">{subtitle}</p>}
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
          {hp && !viewingForm && !pastState && (
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

          {(() => {
              const hipoCols = !!hipo && (viewRarity === 'UR' || viewRarity === 'LR');
              const [showHipoNote, setShowHipoNote] = useState(false);
              const statsTitle = ezaSelected
                ? 'Stats (estado EZA)'
                : sezaSelected
                  ? 'Stats (estado SEZA)'
                  : !viewingForm && stateChips.length > 0
                    ? 'Stats (estado Normal)'
                    : 'Stats';
              return (
                <Section title={statsTitle} onTitleClick={() => setShowHipoNote(!showHipoNote)} expanded={showHipoNote}>
                  {/* Columnas 55 %/100 %: solo UR/LR (dokkaninfo no las muestra en
                      rareza ≤ 3, `rarity>3` en su bundle). */}
                  <table class="stats-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Nv. 1</th>
                        <th>Nv. máx.</th>
                        {hipoCols && <th>55 %</th>}
                        {hipoCols && <th>100 %</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(['hp', 'atk', 'def'] as const).map((k) => (
                        <tr key={k}>
                          <th>{k.toUpperCase()}</th>
                          <td>{formatNumber(stats[k].base)}</td>
                          <td>{formatNumber(stateMax(k))}</td>
                          {hipoCols && hipo && (
                            <td>{formatNumber(stateMax(k) + hipoFlat[k])}</td>
                          )}
                          {hipoCols && hipo && (
                            <td>{formatNumber(stateMax(k) + hipo[k])}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {hipoCols && showHipoNote && (
                    <p class="skill-note">
                      Hidden Potential: 55 % = máx. del estado + bonus plano del
                      tablero de potential; 100 % = máx. + ganancias completas del
                      potential.
                    </p>
                  )}
                  {(ezaSelected || sezaSelected) && (
                    <p class="skill-note">
                      {ezaSelected
                        ? 'Stats EZA: fórmula de dokkaninfo (máx. + 48,39 % del margen min→máx), válida solo para rareza < 5 (LR usa máx. base).'
                        : 'Stats SEZA: dokkaninfo no publica stats SEZA y su fórmula no cubre LR → se muestra máx. base.'}
                    </p>
                  )}
                </Section>
              );
            })()}
        </div>

        {/* Columna principal: habilidades + relaciones */}
        <div class="detail-col detail-col--main">
          <Section title="Leader Skill">
            {leader ? (
              <p class="skill-text">{richInline(leader.description, 'ld')}</p>
            ) : pastState ? (
              <p class="skill-text skill-text--dim">
                {stateStatus === 'loading'
                  ? `Cargando la información del estado ${stateLabel(viewState)}…`
                  : `dokkaninfo solo publica los textos del estado vigente (${stateLabel(currentState)}); del
                estado ${stateLabel(viewState)} se muestran sus stats.`}
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
                {stateStatus === 'loading'
                  ? `Cargando las Super Attacks del estado ${stateLabel(viewState)}…`
                  : `dokkaninfo no publica las Super Attacks del estado ${stateLabel(viewState)}; solo sus
                stats.`}
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
                {stateStatus === 'loading'
                  ? `Cargando la pasiva del estado ${stateLabel(viewState)}…`
                  : `dokkaninfo no publica la pasiva del estado ${stateLabel(viewState)}; solo sus stats.`}
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

          {/* Líderes que la cubren: separados líderes (170 %+ ) de sublíderes
              (169 % o menos), cada tarjeta con sus porcentajes divididos. */}
          {!viewingForm && !pastState && mainLeaders.length + subLeaders.length > 0 && (
            <Section title="Líderes que la cubren">
              {mainLeaders.length > 0 && (
                <>
                  <p class="rank-note">
                    <b>Líderes</b> — cubren a {summary.name} con {LEADER_MIN_PCT} % o más:
                  </p>
                  <div class="mini-units">
                    {mainLeadersView.map(({ u, main, sub }) => (
                      <MiniUnitCard
                        u={u}
                        key={u.id}
                        sub={
                          <span class="leader-pcts">
                            <b class="leader-pct leader-pct--main">
                              Líder {main != null ? `${main} %` : `${LEADER_MIN_PCT} %+`}
                            </b>
                            {sub != null && (
                              <span class="leader-pct leader-pct--sub">Sub {sub} %</span>
                            )}
                          </span>
                        }
                      />
                    ))}
                  </div>
                  <MoreBtn
                    total={mainLeaders.length}
                    shown={listLimit}
                    showAll={showAllLeaders}
                    onToggle={toggleLeaders}
                    label="líderes"
                  />
                </>
              )}
              {subLeaders.length > 0 && (
                <>
                  <p class="rank-note">
                    <b>Sublíderes</b> — cobertura parcial (menos del {LEADER_MIN_PCT} %):
                  </p>
                  <div class="mini-units">
                    {subLeadersView.map(({ u, main, sub }) => (
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
                  <MoreBtn
                    total={subLeaders.length}
                    shown={listLimit}
                    showAll={showAllSubs}
                    onToggle={toggleSubs}
                    label="sublíderes"
                  />
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
                {partnersView.map((p) => (
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
              <MoreBtn
                total={partners.length}
                shown={listLimit}
                showAll={showAllPartners}
                onToggle={togglePartners}
                label="partners"
              />
            </Section>
          )}

          {/* ¿Dónde conseguir el EZA/SEZA? — el evento Z-Battle (con su
              cartel, enlazado a Eventos) y las medallas de despertar que hay
              que gastar para subir la mejora. Se sale de «¿Dónde conseguirlo?»
              porque son mejoras, no obtención de la carta. */}
          {!viewingForm &&
            (ezaEvents.length > 0 || ezaMedals.length > 0 || sezaMedals.length > 0 || ezaEventMissing) && (
            <Section
              title={summary.hasSeza ? '¿Dónde conseguir el EZA/SEZA?' : '¿Dónde conseguir el EZA?'}
            >
              {ezaEventMissing && (
                <p class="skill-text skill-text--dim">
                  El evento Z-Battle de esta unidad aún no está indexado. Las medallas del EZA/SEZA
                  se obtienen superando su evento Z-Battle.
                </p>
              )}
              {ezaEvents.length > 0 && (
                <div class="acq-block">
                  <h4 class="acq-sub">Evento Z-Battle</h4>
                  <div class="acq-events">
                    {ezaEvents.map((e) => (
                      <a class="acq-event acq-event--eza" href={`#/eventos?ev=${e.key}`} key={e.key}>
                        {e.image && <InfoImg url={e.image} alt="" cls="acq-event__img" />}
                        <span class="acq-event__info">
                          <b>{e.name}</b>
                          {e.lines.map((l, i) => (
                            <span class="acq-event__stage" key={`${e.key}-${i}`}>
                              {l}
                            </span>
                          ))}
                          <span class="acq-banner__tag">Ver evento →</span>
                        </span>
                      </a>
                    ))}
                  </div>
                  <MoreBtn
                    total={ezaEventsTotal}
                    shown={listLimit}
                    showAll={showAllEza}
                    onToggle={toggleEza}
                    label="eventos"
                  />
                </div>
              )}
              {(ezaMedals.length > 0 || sezaMedals.length > 0) && (
                <div class="acq-block">
                  <h4 class="acq-sub">Medallas necesarias</h4>
                  {ezaMedals.length > 0 && (
                    <div class="acq-sub-block">
                      <h5 class="acq-sub2 acq-sub2--eza">Para el EZA</h5>
                      <div class="acq-medals">
                        {ezaMedals.map((m) => (
                          <span class="acq-medal" key={m.name}>
                            {m.image && <InfoImg url={m.image} alt="" cls="acq-medal__img" />}
                            <b>{m.name}</b>
                            <i>×{m.quantity}</i>
                          </span>
                        ))}
                      </div>
                      <MoreBtn
                        total={ezaMedalsTotal}
                        shown={listLimit}
                        showAll={showAllMedals}
                        onToggle={toggleMedals}
                        label="medallas"
                      />
                    </div>
                  )}
                  {sezaMedals.length > 0 && (
                    <div class="acq-sub-block">
                      <h5 class="acq-sub2 acq-sub2--seza">Para el SEZA (Super EZA)</h5>
                      <div class="acq-medals">
                        {sezaMedals.map((m) => (
                          <span class="acq-medal acq-medal--seza" key={m.name}>
                            {m.image && <InfoImg url={m.image} alt="" cls="acq-medal__img" />}
                            <b>{m.name}</b>
                            <i>×{m.quantity}</i>
                          </span>
                        ))}
                      </div>
                      <MoreBtn
                        total={sezaMedalsTotal}
                        shown={listLimit}
                        showAll={showAllSezaMedals}
                        onToggle={toggleSezaMedals}
                        label="medallas"
                      />
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* ¿Dónde conseguirlo? — banners separados por moneda (gemas vs
              tickets) y, dentro de cada moneda, por estado (Activos /
              Finalizados), más los eventos con su cartel; cada subgrupo saca 6
              y el resto va detrás del botón "Mostrar más". Es información de
              OBTENCIÓN: no depende del estado visible, así que se muestra
              siempre. */}
          {!viewingForm && (
            <Section title="¿Dónde conseguirlo?">
              {bannerGroups.map((g) =>
                g.subs.some((s) => s.total > 0) ? (
                  <div class="acq-block" key={g.key}>
                    <h4 class="acq-sub">{g.title}</h4>
                    {g.subs.map((s) =>
                      s.total > 0 ? (
                        <div class="acq-sub-block" key={s.key}>
                          <h5 class="acq-sub2">
                            {s.label}
                            <span class="acq-sub2__count">{s.total}</span>
                          </h5>
                          <div class="acq-banners">
                            {s.items.map((b) => (
                              <BannerCard b={b} key={`${s.key}-${b.id}`} />
                            ))}
                          </div>
                          <MoreBtn
                            total={s.total}
                            shown={listLimit}
                            showAll={s.showAll}
                            onToggle={s.toggle}
                            label="banners"
                          />
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : null,
              )}
              {acqEvents.length > 0 && (
                <div class="acq-block">
                  <h4 class="acq-sub">Eventos</h4>
                  <div class="acq-events">
                    {acqEvents.map((e) => (
                      <a class="acq-event" href={`#/eventos?ev=${e.key}`} key={e.key}>
                        {e.image && <InfoImg url={e.image} alt="" cls="acq-event__img" />}
                        <span class="acq-event__info">
                          <b>{e.name}</b>
                          {e.lines.map((l, i) => (
                            <span class="acq-event__stage" key={`${e.key}-${i}`}>
                              {l}
                            </span>
                          ))}
                          <span class="acq-banner__tag">Ver evento →</span>
                        </span>
                      </a>
                    ))}
                  </div>
                  <MoreBtn
                    total={acqEventsTotal}
                    shown={listLimit}
                    showAll={showAllEvents}
                    onToggle={toggleEvents}
                    label="eventos"
                  />
                </div>
              )}
              {tournamentRewards.length > 0 && (
                <div class="acq-block">
                  <h4 class="acq-sub">Torneo Mundial</h4>
                  <div class="acq-events">
                    {tournamentRewards.map((r) => (
                      <a class="acq-event" key={r.name} href={r.tournamentId ? `#/eventos?ev=worldtournament/${r.tournamentId}` : '#'}>
                        {r.image && <InfoImg url={r.image} alt="" cls="acq-event__img" />}
                        <span class="acq-event__info">
                          <b>{r.name}</b>
                          <span class="acq-event__stage">Recompensa del torneo · {r.points.toLocaleString()} puntos</span>
                          <span class="acq-banner__tag">{r.tournamentId ? 'Ver torneo →' : 'Sin enlace'}</span>
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
