import type { ComponentChildren } from 'preact';

/**
 * Renderizador de textos de habilidades con formato rico (negritas, números
 * resaltados, encabezados de condición en naranja) al estilo de las guías del
 * juego. Sin texto en azul: las stats van en negrita del color del texto y el
 * naranja queda reservado a las condiciones.
 *
 * La fuente trae la pasiva con un markup propio:
 *   *Encabezado de sección*          → línea en MAYÚSCULAS
 *   - punto de la lista              → viñeta (flechita) de la lista
 *   {passiveImg:up_g}                → icono/ flecha PNG del CDN
 *   120% / +150% / +2                → números resaltados
 *   ATK / DEF / HP                   → stats en negrita
 *   Great chance / high chance       → se anota su % estándar (70% / 50%)
 *
 * El parser replica el de la fuente (passiveDescription): se parte por
 * *encabezados* y cada línea “- ” abre un punto de la lista; las líneas
 * siguientes se continúan en el punto anterior. Si el texto no trae
 * encabezados se muestra como una única lista para no perder contenido.
 */

const ICON_BASE = 'https://cdn.dokkan.fyi/assets/en/layout/en/image/battle/skill_dialog/passive_skill_dialog_';
const ICON_MAP: Record<string, string> = {
  up_g: 'arrow01',
  down_r: 'arrow02',
  down_y: 'arrow03',
  down_g: 'arrow04',
  once: 'icon_01',
  forever: 'icon_02',
};

const iconUrl = (name: string): string => `${ICON_BASE}${ICON_MAP[name] ?? name}.png`;

interface RichSection {
  heading: string;
  items: string[];
}

/** Port del parser de la fuente (+ respaldo sin encabezados). */
function parseSections(text: string): RichSection[] {
  const clean = text ?? '';
  if (!clean.trim()) return [];
  const parts = clean.split(/\*([^*]+)\*/);
  const out: RichSection[] = [];

  // Texto inicial anterior al primer encabezado (la fuente lo descarta; nosotros lo conservamos).
  const lead = (parts[0] ?? '').trim();
  if (lead) out.push({ heading: '', items: bulletize(lead) });

  for (let i = 1; i < parts.length; i += 2) {
    const heading = (parts[i] ?? '').trim();
    const body = (parts[i + 1] ?? '').trim();
    const items = bulletize(body);
    if (heading || items.length) out.push({ heading, items });
  }

  return out;
}

/** Agrupa líneas en puntos de lista: “- ” abre punto; el resto continúa el anterior. */
function bulletize(body: string): string[] {
  const items: string[] = [];
  let current = '';
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('- ')) {
      if (current) items.push(current);
      current = line.slice(2);
    } else if (line) {
      current = current ? `${current} ${line}` : line;
    }
  }
  if (current) items.push(current);
  return items;
}

/* ---------- Texto enriquecido en línea ---------- */

/** % estándar de Dokkan tras las frases de probabilidad (wiki oficial). */
const CHANCE_PCT: Record<string, number> = {
  'very high chance': 90,
  'great chance': 70,
  'high chance': 50,
  'medium chance': 30,
  'rare chance': 10,
};

/**
 * "Great chance" → "Great chance (70%)", "high chance" → "(50%)"… Los
 * porcentajes ya presentes en el texto se respetan (no se duplican).
 */
export function withChancePct(text: string): string {
  if (!text) return text;
  return text.replace(
    /\b(very high chance|great chance|high chance|medium chance|rare chance)(?!\s*\()/gi,
    (_m, phrase: string) => `${phrase} (${CHANCE_PCT[phrase.toLowerCase()] ?? ''}%)`,
  );
}

/**
 * ¿El encabezado es una CONDICIÓN (cuándo se activa)? Se pintan en naranja
 * tanto las condiciones como los efectos básicos ("Basic effect(s)"), que
 * quedan del mismo color — petición explícita; el resto (multi-turn, etc.)
 * sigue neutro.
 */
function isCondHeading(heading: string): boolean {
  if (/effect/i.test(heading)) return true; // "Basic effect(s)" → color de condiciones
  if (/condition/i.test(heading)) return true;
  // Condiciones: "When HP is…", "After receiving…", "With a TEQ Ki Sphere…",
  // "For 7 turn(s)…", "Activates the Entrance…", "7 or more Ki Spheres…",
  // "As the 1st/2nd/3rd attacker in a turn" (condición de slot), etc.
  return /^(?:when|after|with|for|activates?|if|at|on|once|by|per|during|each|every|starting|while|under|upon|within|until|in|from|same|received|performing|obtained|entry|exchange|transformation|revival|having|launching|performing|as|\d)/i.test(
    heading,
  );
}

/**
 * Condición de SLOT (posición en el orden de ataque) escrita DENTRO de una
 * viñeta: "…as the 1st attacker in a turn", "when attacking as the 2nd or 3rd
 * attacker in a turn", "when the character is the 1st attacker at the start of
 * turn"… → se pinta en naranja como los encabezados de condición.
 */
const SLOT_COND_SRC =
  '(?:when attacking\\s+)?as the \\d(?:st|nd|rd)(?:\\s+or\\s+\\d(?:st|nd|rd))?\\s+attacker(?:\\s+in a turn)?(?:\\s+at the start of turn)?|' +
  'when (?:this |the )?character is(?:t)? the \\d(?:st|nd|rd)(?:\\s+or\\s+\\d(?:st|nd|rd))?\\s+attacker(?:\\s+at the start of turn)?';

/** Iconos, números (+150%, +2, −1) resaltados. */
const EM_TOKEN = /(\{passiveImg:[A-Za-z0-9_]+\}|\+?\d+(?:\.\d+)?%|\+\d+(?:\.\d+)?|-\d+(?:\.\d+)?)/;
/** Palabras de stat (replica el split alterno de la fuente). */
const STAT_TOKEN = /\b(ATK|DEF|HP)\b/;

/** Segmenta texto plano en iconos/números resaltados y stats en negrita. */
function renderTokens(text: string, key: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = new RegExp(EM_TOKEN, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(...renderTokensPlain(text.slice(last, m.index), `${key}${n}`));
    const token = m[0];
    if (token.startsWith('{passiveImg:')) {
      const name = token.slice('{passiveImg:'.length, -1);
      out.push(<img class="rich-img" src={iconUrl(name)} alt={name} title={name} key={`${key}i${n}`} />);
    } else {
      out.push(
        <b class="rich-em" key={`${key}e${n}`}>
          {token}
        </b>,
      );
    }
    last = m.index + token.length;
    n++;
  }
  if (last < text.length) out.push(...renderTokensPlain(text.slice(last), `${key}${n}`));
  return out;
}

/** Texto con stats en negrita (sin iconos/números). */
function renderTokensPlain(text: string, key: string): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const parts = text.split(STAT_TOKEN);
  parts.forEach((part, i) => {
    if (!part) return;
    out.push(
      i % 2 === 1 ? (
        <b class="rich-stat" key={`${key}s${i}`}>
          {part}
        </b>
      ) : (
        <span key={`${key}t${i}`}>{part}</span>
      ),
    );
  });
  return out;
}

/**
 * Segmenta en: condición de slot (→ naranja) | resto (iconos/números/stats).
 * La condición de slot queda fuera del reparto de tokens para que su texto se
 * pinte entero, igual que un encabezado de condición.
 */
export function richInline(text: string, key = 'r'): ComponentChildren[] {
  if (!text) return [];
  const withChances = withChancePct(text);
  const out: ComponentChildren[] = [];
  const re = new RegExp(`(${SLOT_COND_SRC})`, 'gi');
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(withChances)) !== null) {
    if (m.index > last) out.push(...renderTokens(withChances.slice(last, m.index), `${key}b${n}`));
    out.push(
      <b class="rich-cond-inline" key={`${key}c${n}`}>
        {m[0]}
      </b>,
    );
    last = m.index + m[0].length;
    n++;
  }
  if (last < withChances.length) out.push(...renderTokens(withChances.slice(last), `${key}b${n}`));
  return out;
}

/** Texto de habilidad completo: encabezados en mayúsculas + listas con viñetas. */
export default function SkillRich({ text }: { text: string }) {
  const sections = parseSections(text);
  if (!sections.length) return null;
  return (
    <div class="rich-body">
      {sections.map((s, i) => (
        <div class="rich-section" key={`sec${i}`}>
          {s.heading ? (
            // Naranja SOLO para condiciones; los efectos ("Basic effect(s)")
            // y el resto de encabezados quedan en color neutro.
            <p class={`rich-heading${isCondHeading(s.heading) ? ' rich-heading--cond' : ''}`}>
              {s.heading}
            </p>
          ) : null}
          <ul class="rich-list">
            {s.items.map((item, j) => (
              <li key={`i${i}-${j}`}>{richInline(item, `i${i}-${j}`)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
