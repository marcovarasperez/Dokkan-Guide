/**
 * Hash FNV-1a (32-bit) — usado para comparar filas del catálogo y detectar cambios.
 *
 * Unificado desde `sync.ts:rowHash` y `fyi.ts:fnv1a` (eran idénticos).
 */

/** Calcula hash FNV-1a de un string y devuelve hex (8 chars, lowercase). */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Serializa un valor de forma determinista (claves ordenadas) para hashing consistente.
 * Port exacto de `tools/sync.mjs` → `stable()`.
 */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return (
      '{' +
      Object.keys(v as object)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v) ?? 'null';
}

/**
 * Hash de una fila del catálogo (DkCardRow) — usado por sync.ts para rowHash.
 * Serializa solo los campos que importan para detectar cambios reales.
 */
export function hashCardRow(
  row: {
    id: number;
    name: string;
    rarity: number;
    element: string;
    lv_max: number;
    skill_lv_max: number;
    icon_id: number | null;
    hp_init: number;
    hp_max: number;
    hp_hipo: number;
    atk_init: number;
    atk_max: number;
    atk_hipo: number;
    def_init: number;
    def_max: number;
    def_hipo: number;
    open_at: number | null;
    eza: number | null;
    eza_open_at: number | null;
    seza: number | null;
    seza_open_at: number | null;
  }
): string {
  const sig = [
    row.id,
    row.name,
    row.rarity,
    row.element,
    row.lv_max,
    row.skill_lv_max,
    row.icon_id,
    row.hp_init,
    row.hp_max,
    row.hp_hipo,
    row.atk_init,
    row.atk_max,
    row.atk_hipo,
    row.def_init,
    row.def_max,
    row.def_hipo,
    row.open_at,
    row.eza,
    row.eza_open_at,
    row.seza,
    row.seza_open_at,
  ].join('|');
  return fnv1a(sig);
}