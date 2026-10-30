import { useEffect, useRef, useState } from 'preact/hooks';
import type { Stats, UnitSummary } from '../model/types';
import { getUnit } from '../model/repository';
import {
  clearStateSkillsCache,
  fetchStateSkills,
  fetchUnitDetail,
} from '../model/detail';
import type { StateSkills, UnitFull } from '../model/detail';
import { recommendHp } from '../model/hp';
import type { HpSeed } from '../model/hp';
import { TYPE_COLORS } from '../model/adapter';
import { potentialFlatBonus } from '../model/constants';
import { loadLinksIndex } from '../model/wiki';
import type { LinksIndex } from '../model/wiki';
import { startCardAnim } from '../model/cardAnim';
import { syncState } from '../model/sync';

/**
 * CONTROLADOR · Ficha de un personaje (#/characters/{id}).
 *
 * Aquí vive TODA la lógica de la vista de detalle; la vista
 * (`view/UnitDetail.tsx`) solo pinta lo que este hook devuelve:
 *
 *  - descarga de la ficha completa (dokkaninfo) con caché y estado de carga;
 *  - selector de FORMAS (transformaciones) y su carga perezosa;
 *  - selector de ESTADOS (SEZA → EZA → Normal) —solo si la unidad tiene EZA
 *    y/o SEZA—, con el estado vigente calculado a partir de las fechas;
 *  - datos derivados: stats por estado, super attacks agrupadas, líderes con
 *    sus porcentajes (170 % o más = líder; 169 % o menos = sublíder),
 *    partners, "¿Dónde conseguirlo?" y el subtítulo de la carta;
 *  - la ANIMACIÓN de la carta (lienzo LWF sobre el arte estático), con su
 *    estado de carga y degradación a arte fijo si la fuente no la publica.
 *
 * Flujo de los datos: `model/detail.ts` descarga /cards/{id} de dokkaninfo,
 * lo parsea (`model/dinfo.ts`) y lo cachea en IndexedDB; si falla la red, la
 * vista se apoya en el resumen del índice local (`summary`).
 */

/** Stats en cero: relleno cuando no hay resumen (la vista corta antes de pintar). */
const ZERO_STATS: Stats = {
  hp: { base: 0, max: 0, eza: 0 },
  atk: { base: 0, max: 0, eza: 0 },
  def: { base: 0, max: 0, eza: 0 },
};

/** Seed de guías de Hidden Potential (carga perezosa, best-effort). */
let hpSeedPromise: Promise<HpSeed | null> | null = null;
function loadHpSeed(): Promise<HpSeed | null> {
  hpSeedPromise ??= fetch('/data/hidden_potential.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return hpSeedPromise;
}

/** Grupos de superataque en el orden en que el jugador las distingue. */
const SA_GROUPS: { style: string; title: string; mod: string }[] = [
  { style: 'Normal', title: 'Super Attack', mod: 'normal' },
  { style: 'Ultra', title: 'Ultra Super Attack', mod: 'ultra' },
  { style: 'Unit', title: 'Unit Super Attack', mod: 'unit' },
  { style: 'EX', title: 'EX Super Attack', mod: 'ex' },
];

/** Estilo de SA de dokkaninfo → etiqueta del grupo (Hyper = Ultra, Ex = EX). */
export const normalizeSaStyle = (style: string): string => {
  const s = (style ?? '').toLowerCase();
  if (s === 'hyper') return 'Ultra';
  if (s === 'ex') return 'EX';
  if (s === 'unit') return 'Unit';
  if (s === 'normal' || s === '') return 'Normal';
  return style;
};

/** ¿Queda en el futuro? (epoch seconds → chip "previsto" en las fechas). */
export const isFuture = (epochSec: number | null): boolean =>
  epochSec !== null && epochSec * 1000 > Date.now();

/**
 * Umbral de cobertura de un leader skill: con 170 % o más en HP, ATK o DEF
 * la unidad es LÍDER; de 169 % para abajo es SUBLÍDER (cobertura parcial).
 * Lo usan el controlador (clasificación) y la vista (textos).
 */
export const LEADER_MIN_PCT = 170;

/**
 * Tarjetas visibles por defecto en las listas largas de la ficha (líderes,
 * sublíderes y mejores linking partners): el resto se despliega con el
 * botón "Mostrar más" de la vista.
 */
export const LIST_LIMIT = 6;

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

/** Estado seleccionado en el selector: vigente, base, EZA o SEZA. */
export type EzaView = 'vigente' | 'base' | 'eza' | 'seza';
export type UnitState = 'base' | 'eza' | 'seza';

export function useUnitDetail(id: number) {
  const summary: UnitSummary | null = getUnit(id);
  const [full, setFull] = useState<UnitFull | null>(null);
  const [formFull, setFormFull] = useState<UnitFull | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formIdx, setFormIdx] = useState(0); // 0 = forma actual · n = transformación n-1
  const [ezaView, setEzaView] = useState<EzaView>('vigente');
  // Habilidades del estado EZA/SEZA seleccionado (leader/pasiva/SAs del step
  // donde aplica ese awakening). `key` es `${unidad}:${step}` para no mezclar
  // los datos de un estado con el de otro mientras se cargan.
  const [stateSkills, setStateSkills] = useState<{ key: string; data: StateSkills | null } | null>(null);
  const [seed, setSeed] = useState<HpSeed | null>(null);
  const [linksIndex, setLinksIndex] = useState<LinksIndex | null>(null);
  const [linksReady, setLinksReady] = useState(false);
  const [openLink, setOpenLink] = useState<string | null>(null);
  // Despliegue de las listas largas (líderes / sublíderes / partners):
  // false = solo LIST_LIMIT tarjetas, true = lista completa.
  const [showAllLeaders, setShowAllLeaders] = useState(false);
  const [showAllSubs, setShowAllSubs] = useState(false);
  const [showAllPartners, setShowAllPartners] = useState(false);
  // Despliegue de "¿Dónde conseguirlo?": banners separados además por estado
  // (activos / finalizados dentro de cada moneda) y eventos.
  const [showAllStone, setShowAllStone] = useState(false);
  const [showAllStoneEnded, setShowAllStoneEnded] = useState(false);
  const [showAllTicket, setShowAllTicket] = useState(false);
  const [showAllTicketEnded, setShowAllTicketEnded] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  // Despliegue de "¿Dónde conseguir el EZA/SEZA?" (eventos Z-Battle y medallas)
  const [showAllEza, setShowAllEza] = useState(false);
  const [showAllMedals, setShowAllMedals] = useState(false);
  const [showAllSezaMedals, setShowAllSezaMedals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Animación de la carta: lienzo, estado de la carga y clave fallida
  // (para no reintentar en la misma carta si el motor no pudo con ella).
  const animCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [animReady, setAnimReady] = useState(false);
  const [animFailedKey, setAnimFailedKey] = useState<string | null>(null);
  // Unidad/forma a la que pertenecen `full` y `formFull`: mientras no
  // coincidan con la vista, esos datos son de la ficha ANTERIOR y no deben
  // decidir si la carta nueva se anima.
  const [fullFor, setFullFor] = useState<number | null>(null);
  const [formFullFor, setFormFullFor] = useState<number | null>(null);

  // Ficha completa + semillas auxiliares (cambia al abrir otra unidad)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setFormIdx(0);
    setEzaView('vigente');
    setFormFull(null);
    setStateSkills(null); // los estados de la unidad anterior no sirven
    setOpenLink(null);
    setShowAllLeaders(false);
    setShowAllSubs(false);
    setShowAllPartners(false);
    setShowAllStone(false);
    setShowAllStoneEnded(false);
    setShowAllTicket(false);
    setShowAllTicketEnded(false);
    setShowAllEvents(false);
    setShowAllEza(false);
    setShowAllMedals(false);
    setShowAllSezaMedals(false);
    setAnimFailedKey(null); // la animación vuelve a intentarse en la nueva unidad
    loadHpSeed().then((s) => alive && setSeed(s));
    loadLinksIndex().then((d) => {
      if (!alive) return;
      setLinksIndex(d);
      setLinksReady(true);
    });
    fetchUnitDetail(id)
      .then((d) => {
        if (alive) {
          setFull(d);
          setFullFor(id);
        }
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
      setFormFullFor(null);
      return;
    }
    setFormLoading(true);
    setFormFullFor(null); // `formFull` es de la forma anterior hasta que llegue
    fetchUnitDetail(activeForm.id)
      .then((d) => {
        if (!alive) return;
        setFormFull(d);
        setFormFullFor(activeForm.id);
      })
      .catch(() => alive && setFormFull(null))
      .finally(() => alive && setFormLoading(false));
    return () => {
      alive = false;
    };
  }, [activeForm?.id]);

  const color = summary ? TYPE_COLORS[summary.type] : '#444';
  const hp = summary ? recommendHp(summary, full, seed) : null;

  // ¿Se ve una forma transformada? Solo cuando su ficha YA llegó y
  // corresponde a la forma pedida (`formFull` puede ser aún de la anterior).
  const viewingForm = activeForm !== null && formFull !== null && formFullFor === activeForm.id;

  // Estado vigente de la CARTA VISIBLE: el EZA/SEZA cuenta cuando ya llegó
  // (o cuando la fuente lo marca sin fecha — está en el juego). Cada forma
  // transformada tiene sus PROPIAS fechas (salen de su propia ficha), igual
  // que su propio step de awakening.
  const liveState = (o: {
    hasSeza: boolean;
    hasEza: boolean;
    sezaAt: number | null;
    ezaAt: number | null;
  }): UnitState => {
    const sezaLive = o.hasSeza && !(o.sezaAt !== null && isFuture(o.sezaAt));
    const ezaLive = (o.hasEza && !(o.ezaAt !== null && isFuture(o.ezaAt))) || sezaLive;
    return sezaLive ? 'seza' : ezaLive ? 'eza' : 'base';
  };

  const currentState: UnitState =
    viewingForm && formFull
      ? liveState({
          hasSeza: formFull.sezaStep !== null,
          hasEza: formFull.ezaStep !== null,
          sezaAt: formFull.releaseDates.seza,
          ezaAt: formFull.releaseDates.eza,
        })
      : liveState({
          hasSeza: !!summary?.hasSeza,
          hasEza: !!summary?.hasEza,
          sezaAt: summary?.releaseDates.seza ?? null,
          ezaAt: summary?.releaseDates.eza ?? null,
        });

  // Selector de estados de la carta visible, en el orden en que el jugador
  // los distingue: SEZA → EZA → Normal. Las formas transformadas TAMBIÉN
  // tienen sus estados (se piden a la fuente con SU id); sin EZA ni SEZA no
  // hay selector (la ficha se ve directamente en su estado único).
  const chipsSeza = viewingForm && formFull ? formFull.sezaStep !== null : !!summary?.hasSeza;
  const chipsEza = viewingForm && formFull ? formFull.ezaStep !== null : !!summary?.hasEza;
  const stateChips: { key: UnitState; label: string }[] =
    chipsSeza || chipsEza
      ? [
          ...(chipsSeza ? [{ key: 'seza' as const, label: 'SEZA' }] : []),
          ...(chipsEza ? [{ key: 'eza' as const, label: 'EZA' }] : []),
          { key: 'base', label: 'Normal' },
        ]
      : [];

  const viewState: UnitState = ezaView === 'vigente' ? currentState : ezaView;
  // Estado ≠ vigente: la ficha pasa a mostrar la información de ESE estado.
  const pastState = stateChips.length > 0 && viewState !== currentState;

  /** ¿Está activo el chip de estado `key`? (la carta en vigente usa `vigente`). */
  const isStateActive = (key: UnitState): boolean =>
    ezaView === 'vigente' ? currentState === key : ezaView === key;

  // Red de seguridad: si la carta visible no ofrece el estado seleccionado
  // (p. ej. al cambiar a una forma sin EZA/SEZA), se vuelve al vigente para
  // no mostrar textos de un estado que no existe en esa carta.
  useEffect(() => {
    if (ezaView !== 'seza' && ezaView !== 'eza') return;
    if (ezaView === 'seza' ? !chipsSeza : !chipsEza) setEzaView('vigente');
  }, [chipsSeza, chipsEza, ezaView]);

  // Datos efectivos según la vista (forma actual / forma transformada / estado)
  const viewFull = viewingForm ? formFull : full;
  const viewName = viewingForm && activeForm && summary ? activeForm.name : summary?.name ?? '';
  const viewIcon =
    viewingForm && activeForm && summary ? activeForm.iconId ?? summary.thumbnailId : summary?.thumbnailId ?? 0;
  const viewType = viewingForm && activeForm && summary ? activeForm.type : summary?.type ?? 'AGL';
  const viewRarity = viewingForm && activeForm && summary ? activeForm.rarity : summary?.rarity ?? 'N';
  const viewColor = TYPE_COLORS[viewType];

  // Subtítulo de la carta (p. ej. «Secret Weapon of Confidence»): en la fuente
  // viene como el NOMBRE de la leader skill, pero no es de la habilidad sino
  // del personaje — se muestra en pequeño antes que el nombre y NO dentro de
  // la sección Leader Skill. No depende del estado visible (es del personaje).
  const rawSubtitle = viewingForm
    ? formFull?.leaderSkill?.name
    : full?.leaderSkill?.name ?? summary?.leaderSkill?.name;
  const subtitle = rawSubtitle?.trim() || null;

  // ── Habilidades del estado EZA/SEZA ────────────────────────────────────
  // El datajson de `/cards/{id}` es SIEMPRE la carta base (lo mismo vale para
  // cada forma transformada): para que el chip EZA/SEZA muestre la
  // información "de cuando se hizo" ese awakening hay que pedir el step donde
  // aplica (`/api/cards/{id}/eza?step=N`) con el ID de la carta VISIBLE, la
  // misma API que usa dokkaninfo. `Normal` se queda en la carta base.
  const wantsState = viewState === 'eza' || viewState === 'seza';
  const viewFullIsMine = viewingForm ? formFullFor === activeForm?.id : fullFor === id;
  const viewCardId = viewingForm && activeForm ? activeForm.id : id;
  const stateStep =
    wantsState && viewFullIsMine
      ? viewState === 'seza'
        ? viewFull?.sezaStep ?? null
        : viewFull?.ezaStep ?? null
      : null;
  const stateKey: string | null = stateStep !== null ? `${viewCardId}:${stateStep}` : null;
  // Datos SOLO del estado pedido: así nunca se cuelan los de otro step.
  const stateData = stateKey !== null && stateSkills?.key === stateKey ? stateSkills.data : null;
  /** Estado de la carga de habilidades (para el aviso de la cabecera). */
  const stateStatus: 'none' | 'loading' | 'ready' | 'failed' = !wantsState
    ? 'none'
    : stateData
      ? 'ready'
      : !viewFullIsMine || loading || formLoading
        ? 'loading' // la ficha base aún no está: se pide en cuanto llegue
        : stateKey !== null && stateSkills?.key === stateKey
          ? 'failed' // se pidió y la fuente no devolvió datos
          : stateKey === null
            ? 'failed' // la fuente no publica ese step
            : 'loading';

  // Textos efectivos: los del estado en EZA/SEZA; la carta base cuando no se
  // pide otro estado (Normal) o cuando la API de estados no respondió.
  const baseTexts = stateStatus === 'none' || stateStatus === 'failed';
  const leader =
    stateData?.leaderSkill ?? (baseTexts ? viewFull?.leaderSkill ?? summary?.leaderSkill ?? null : null);
  const passive =
    stateData?.passiveSkill ?? (baseTexts ? viewFull?.passiveSkill ?? summary?.passiveSkill ?? null : null);
  // Si `summary` es null la vista corta antes de pintar: el valor de relleno
  // solo existe para que el tipado no exija comprobaciones en el render.
  const stats = viewFull?.stats ?? summary?.stats ?? ZERO_STATS;

  // Super Attacks divididas por tipo (Super / Ultra / Unit / EX), como el
  // jugador las distingue (estilo normalizado desde dokkaninfo).
  const allSa = stateData?.superAttacks ?? (baseTexts ? viewFull?.superAttacks ?? [] : []);
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
  const saMaxLevel =
    stateData?.maxSaLevel ?? (baseTexts ? viewFull?.maxSaLevel ?? summary?.maxSALevel ?? 0 : 0);

  // Descarga (una vez por carta+step) de las habilidades del estado pedido.
  useEffect(() => {
    if (stateStep === null || stateKey === null) return;
    if (stateSkills?.key === stateKey) return; // ya pedido (datos o fallo)
    let alive = true;
    fetchStateSkills(viewCardId, stateStep)
      .then((d) => {
        if (alive) setStateSkills({ key: stateKey, data: d });
      })
      .catch(() => {
        if (alive) setStateSkills({ key: stateKey, data: null });
      });
    return () => {
      alive = false;
    };
  }, [viewCardId, stateStep, stateKey, stateSkills?.key]);

  // Refresco automático (cada 5 minutos): cuando una sincronización trae
  // cambios, la ficha abierta se vuelve a pedir a la fuente. No se marca
  // `loading` (no debe parpadear) y la caché de estados se vacía, porque los
  // textos de EZA/SEZA también pueden haber cambiado.
  const lastSyncAt = useRef<number>(0);
  useEffect(() => {
    lastSyncAt.current = syncState.value.lastSuccessAt ?? 0;
    let alive = true;
    const unsub = syncState.subscribe(() => {
      const s = syncState.value;
      const at = s.lastSuccessAt ?? 0;
      if (s.phase !== 'updated' || at <= lastSyncAt.current) return;
      lastSyncAt.current = at;
      clearStateSkillsCache();
      setStateSkills(null); // se vuelve a pedir si la vista está en EZA/SEZA
      fetchUnitDetail(id, true)
        .then((d) => {
          if (alive) {
            setFull(d);
            setFullFor(id);
          }
        })
        .catch(() => {
          /* sin conexión: siguen vigentes los datos en caché */
        });
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [id]);

  // ── ¿Dónde conseguirlo? ────────────────────────────────────────────────
  // Todo de dokkaninfo: banners (histórico completo con su cartel) y eventos
  // de drop (drops.index.json). Los banners se DIVIDEN por la moneda de pago
  // —«Banner de gemas» vs «Banner de tickets»— y cada moneda se parte en
  // «Activos» y «Finalizados». Los Z-Battle y las medallas viven en su propia
  // sección (EZA/SEZA), así que aquí no aparecen.
  const acquire = full?.acquire;
  const banners = acquire?.banners ?? [];
  const isTicketBanner = (b: { type?: string | undefined }): boolean => /ticket/i.test(b.type ?? '');
  /** Separa los banners de un grupo en vigentes y finalizados, cada uno por recencia. */
  const splitByStatus = (list: typeof banners): { active: typeof banners; ended: typeof banners } => ({
    active: list
      .filter((b) => b.active)
      .sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0) || b.id - a.id),
    ended: list
      .filter((b) => !b.active)
      .sort(
        (a, b) =>
          (b.endsAt ?? 0) - (a.endsAt ?? 0) ||
          (b.startsAt ?? 0) - (a.startsAt ?? 0) ||
          b.id - a.id,
      ),
  });
  const stone = splitByStatus(banners.filter((b) => !isTicketBanner(b)));
  const ticket = splitByStatus(banners.filter(isTicketBanner));
  // Los Z-Battle y las medallas viven en su propia sección (EZA/SEZA), así
  // que el "sin datos" de «¿Dónde conseguirlo?» solo mira banners y caídas.
  const noAcquireData = !loading && (acquire ? !banners.length && !acquire.drops.length : true);

  // ── ¿Dónde conseguir el EZA/SEZA? ──────────────────────────────────────
  // El evento Z-Battle PROPIO de la unidad y las medallas de despertar que
  // exigen subir su EZA/SEZA. El cruce se hace con zbattles.index.json: el
  // `extreme_z_battles` del datajson trae eventos de OTRAS unidades (para
  // Perfect Cell devuelve 49), así que no sirve tal cual.
  const ezaEvents = (acquire?.ezaEvents ?? []).map((z) => ({
    key: `zbattle/${z.id}`,
    name: z.title,
    image: z.image,
    lines: [summary?.hasSeza ? 'Mejora SEZA de esta unidad' : 'Mejora EZA de esta unidad'],
  }));
  const ezaMedals = acquire?.ezaMedals ?? [];
  const sezaMedals = acquire?.sezaMedals ?? [];
  // Recompensas de Torneo Mundial (World Tournament)
  const tournamentRewards = acquire?.tournamentRewards ?? [];
  // La unidad tiene EZA/SEZA pero el índice no enlaza ningún evento (todavía
  // no está en la fuente): se avisa en lugar de dejar la sección muda.
  const ezaEventMissing =
    ezaEvents.length === 0 &&
    ezaMedals.length === 0 &&
    sezaMedals.length === 0 &&
    (!!summary?.hasEza || !!summary?.hasSeza);

  // Eventos con su cartel (lo que pide la ficha: el evento Y su imagen): los
  // eventos donde cae la unidad, cada uno con sus etapas/dificultades y el
  // enlace a la sección Eventos. El Z-Battle NO va aquí: está en su sección.
  const acqEvents: { key: string; name: string; image: string | null; lines: string[] }[] = [];
  for (const d of acquire?.drops ?? []) {
    const line = `${d.stageName}${d.difficulty ? ` · ${d.difficulty}` : ''}`;
    const cur = acqEvents.find((a) => a.key === d.eventKey);
    if (cur) cur.lines.push(line);
    else acqEvents.push({ key: d.eventKey, name: d.eventName, image: d.eventImage, lines: [line] });
  }

  // Stats del estado seleccionado (el row de la fuente SIEMPRE es el estado
  // base; EZA/SEZA usan stats.eza — valor real de la semilla o fórmula de
  // dokkaninfo: máx. + 48,39 % del margen min→máx, ver detail.ts).
  const ezaSelected = viewState === 'eza';
  const sezaSelected = viewState === 'seza';
  const stateMax = (k: 'hp' | 'atk' | 'def'): number =>
    ezaSelected || sezaSelected ? stats[k].eza : stats[k].max;

  // Columnas 55 %/100 % del Hidden Potential (mismas fórmulas que dokkaninfo):
  // 55 % = bonus plano según el tablero de potential (por stat: hp/atk/def),
  // mapeo exacto de la fuente en constants.potentialFlatBonus); 100 % =
  // ganancias absolutas del potential.
  const hipo = viewFull?.hipoGains ?? null;
  const hipoBoard = viewFull?.potentialBoardId ?? null;
  const hipoFlat = potentialFlatBonus(hipoBoard);

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
    .filter((e) => e.main == null || e.main >= LEADER_MIN_PCT)
    .sort((a, b) => (b.main ?? LEADER_MIN_PCT) - (a.main ?? LEADER_MIN_PCT));
  const subLeaders = leaderEntries
    .filter((e) => e.main != null && e.main < LEADER_MIN_PCT)
    .sort((a, b) => (b.main ?? 0) - (a.main ?? 0));

  // Vistas recortadas de esas listas: por defecto solo las LIST_LIMIT
  // primeras tarjetas de cada grupo (la vista pinta el botón "Mostrar más"
  // cuando queda algo detrás).
  const mainLeadersView = showAllLeaders ? mainLeaders : mainLeaders.slice(0, LIST_LIMIT);
  const subLeadersView = showAllSubs ? subLeaders : subLeaders.slice(0, LIST_LIMIT);
  const partnersView = showAllPartners ? partners : partners.slice(0, LIST_LIMIT);
  // "¿Dónde conseguirlo?": banners agrupados por moneda y, dentro de cada uno,
  // por estado (Activos / Finalizados); cada subgrupo saca sus LIST_LIMIT
  // primeras entradas y el resto va detrás de su botón "Mostrar más".
  type BannerRow = (typeof banners)[number];
  type BannerSubGroup = {
    key: string;
    label: string;
    items: BannerRow[];
    total: number;
    showAll: boolean;
    toggle: () => void;
  };
  type BannerGroup = { key: string; title: string; subs: BannerSubGroup[] };
  const bannerSub = (
    key: string,
    label: string,
    list: BannerRow[],
    showAll: boolean,
    toggle: () => void,
  ): BannerSubGroup => ({
    key,
    label,
    items: showAll ? list : list.slice(0, LIST_LIMIT),
    total: list.length,
    showAll,
    toggle,
  });
  const bannerGroups: BannerGroup[] = [
    {
      key: 'stone',
      title: 'Banner de gemas',
      subs: [
        bannerSub('stone-active', 'Activos', stone.active, showAllStone, () => setShowAllStone((v) => !v)),
        bannerSub('stone-ended', 'Finalizados', stone.ended, showAllStoneEnded, () => setShowAllStoneEnded((v) => !v)),
      ],
    },
    {
      key: 'ticket',
      title: 'Banner de tickets',
      subs: [
        bannerSub('ticket-active', 'Activos', ticket.active, showAllTicket, () => setShowAllTicket((v) => !v)),
        bannerSub('ticket-ended', 'Finalizados', ticket.ended, showAllTicketEnded, () => setShowAllTicketEnded((v) => !v)),
      ],
    },
  ];
  const acqEventsView = showAllEvents ? acqEvents : acqEvents.slice(0, LIST_LIMIT);
  // "¿Dónde conseguir el EZA/SEZA?": el Z-Battle y las medallas (separadas en
  // EZA y SEZA) también respetan el recorte de 6 con su propio despliegue.
  const ezaEventsView = showAllEza ? ezaEvents : ezaEvents.slice(0, LIST_LIMIT);
  const ezaMedalsView = showAllMedals ? ezaMedals : ezaMedals.slice(0, LIST_LIMIT);
  const sezaMedalsView = showAllSezaMedals ? sezaMedals : sezaMedals.slice(0, LIST_LIMIT);

  // Efecto del link abierto (Nv.10/Nv.1 desde la semilla de links)
  const linkEntry =
    openLink && linksIndex ? linksIndex.links.find((e) => e.name === openLink) ?? null : null;

  // ── Animación de la carta (motor LWF) ────────────────────────────────
  // La ficha pinta un <canvas> encima del arte estático con la animación que
  // publica la fuente (rareza SR+ con el flag `lwf`). Si el motor, el .lwf o
  // las texturas fallan, la clave se marca como fallida y la vista se queda
  // con el arte estático de detrás, que nunca se desmonta.
  // (`full`/`formFull` pueden ser todavía de la ficha anterior mientras
  // llega la nueva: solo manda el dato cuya unidad coincide con la vista).
  const fullIsCurrent = viewingForm ? formFullFor === activeForm?.id : fullFor === id;
  const animAssetId = !loading && fullIsCurrent && viewFull?.anim === true && viewIcon > 0 ? viewIcon : null;
  const animKey: string | null = animAssetId !== null ? String(animAssetId) : null;

  useEffect(() => {
    const canvas = animCanvasRef.current;
    if (animAssetId === null || !canvas || animFailedKey === animKey) {
      setAnimReady(false);
      return;
    }
    let alive = true;
    let dispose: (() => void) | null = null;
    const isCancelled = (): boolean => !alive;
    setAnimReady(false);
    startCardAnim(canvas, animAssetId, isCancelled)
      .then((d) => {
        if (!alive) {
          d();
          return;
        }
        dispose = d;
        setAnimReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setAnimReady(false);
        if (animKey !== null) setAnimFailedKey(animKey);
      });
    return () => {
      alive = false;
      if (dispose) {
        dispose();
        dispose = null;
      }
    };
  }, [animAssetId, animKey, animFailedKey]);

  return {
    // identidad y estado de carga
    summary,
    loading,
    failed,
    color,
    detailStyle: { ['--type-tint']: color } as Record<string, string>,
    // selector de estados
    stateChips,
    currentState,
    ezaView,
    setEzaView,
    isStateActive,
    viewState,
    pastState,
    stateStatus,
    ezaSelected,
    sezaSelected,
    // selector de formas
    forms,
    formIdx,
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
    // animación de la carta
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
    leaderEntries,
    mainLeaders,
    subLeaders,
    partners,
    // listas recortadas + despliegue "Mostrar más / menos"
    mainLeadersView,
    subLeadersView,
    partnersView,
    listLimit: LIST_LIMIT,
    showAllLeaders,
    showAllSubs,
    showAllPartners,
    toggleLeaders: () => setShowAllLeaders((v) => !v),
    toggleSubs: () => setShowAllSubs((v) => !v),
    togglePartners: () => setShowAllPartners((v) => !v),
    bestPartner,
    acquire,
    noAcquireData,
    // "¿Dónde conseguirlo?" por moneda y estado (visibles + despliegue)
    bannerGroups,
    acqEvents: acqEventsView,
    acqEventsTotal: acqEvents.length,
    showAllEvents,
    toggleEvents: () => setShowAllEvents((v) => !v),
    // "¿Dónde conseguir el EZA/SEZA?" (Z-Battle + medallas EZA/SEZA)
    ezaEvents: ezaEventsView,
    ezaEventsTotal: ezaEvents.length,
    showAllEza,
    toggleEza: () => setShowAllEza((v) => !v),
    ezaMedals: ezaMedalsView,
    ezaMedalsTotal: ezaMedals.length,
    showAllMedals,
    toggleMedals: () => setShowAllMedals((v) => !v),
    sezaMedals: sezaMedalsView,
    sezaMedalsTotal: sezaMedals.length,
    showAllSezaMedals,
    toggleSezaMedals: () => setShowAllSezaMedals((v) => !v),
    ezaEventMissing,
    // Recompensas de Torneo Mundial
    tournamentRewards,
    // links
    openLink,
    setOpenLink,
    linksReady,
    linksIndex,
    linkEntry,
  };
}
