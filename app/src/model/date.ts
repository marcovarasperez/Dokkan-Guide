/**
 * Utilidades de fechas centralizadas — elimina duplicados en dinfo.ts, news.ts, bannerArchive.ts.
 */

/** Sentinelas de "sin fecha" (>= 2038-01-19) que usa dokkaninfo. */
const TIME_SENTINEL = 2_145_000_000;

/**
 * Convierte epoch seconds, ISO string, 'YYYY-MM-DD HH:MM:SS' u objeto {open_at}
 * a epoch seconds (número) o null si inválido/sin fecha.
 * Port exacto de `dkTime` de dinfo.ts.
 */
export function parseEpoch(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    return value > 0 && value < TIME_SENTINEL ? Math.round(value) : null;
  }
  if (typeof value === 'string') {
    if (!value || /^\s*$/.test(value)) return null;
    // 'YYYY-MM-DD HH:MM:SS' (UTC) o ISO con Z.
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const s = Math.round(t / 1000);
    return s < TIME_SENTINEL ? s : null;
  }
  if (typeof value === 'object') {
    return parseEpoch((value as { open_at?: unknown }).open_at);
  }
  return null;
}

/**
 * Formatea epoch seconds a fecha local (es-ES) — 'DD/MM/YYYY'.
 */
export function formatDate(epochSec: number | null | undefined): string {
  if (!epochSec) return '—';
  const d = new Date(epochSec * 1000);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formatea epoch seconds a fecha+hora local (es-ES) — 'DD/MM/YYYY HH:MM'.
 */
export function formatDateTime(epochSec: number | null | undefined): string {
  if (!epochSec) return '—';
  return new Date(epochSec * 1000).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Parte de fecha (YYYY-MM-DD, UTC) a partir de epoch seconds, ISO, number, u objeto.
 * Para comparar fechas sin ruido horario.
 * Port exacto de `datePart` de sync.ts.
 */
export function datePart(value: string | number | null | undefined): string {
  if (value == null) return '';
  const t = typeof value === 'number' ? value * 1000 : Date.parse(String(value));
  return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

/** Formatea número con separadores de miles (es-ES). */
export function formatNumber(n: number): string {
  return n.toLocaleString('es-ES');
}

/**
 * Chip de frescura: 'Al día' · 'Al día · hace N min' · 'Al día · hace N h'
 * a partir de un epoch seconds (null → cadena vacía).
 */
export function freshnessText(at: number | null | undefined): string {
  if (!at) return '';
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'Al día';
  if (mins < 60) return `Al día · hace ${mins} min`;
  return `Al día · hace ${Math.round(mins / 60)} h`;
}

/** Convierte epoch seconds a ISO string (UTC). */
export function epochToISO(epochSec: number | null | undefined): string | null {
  if (!epochSec) return null;
  const d = new Date(epochSec * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}