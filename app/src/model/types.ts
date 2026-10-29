/** Modelo de datos de la app. Fuente: dokkaninfo.com (semilla local normalizada). */

export type UnitType = 'AGL' | 'TEQ' | 'INT' | 'STR' | 'PHY';
export type UnitRarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR' | 'LR';
export type UnitClass = 'Super' | 'Extreme';

export interface Stats {
  hp: { base: number; max: number; eza: number };
  atk: { base: number; max: number; eza: number };
  def: { base: number; max: number; eza: number };
}

export interface SkillText {
  name: string;
  description: string;
}

interface ReleaseDates {
  /** Época en segundos (epoch) — se formatea en la vista con formatDate. */
  initial: number | null;
  eza: number | null;
  seza: number | null;
  latest: number | null;
  latestType: string | null; // 'initial' | 'eza' | 'seza' | ...
}

/** Resumen compacto: alimenta el listado, los filtros y el detalle offline básico. */
export interface UnitSummary {
  id: number;
  name: string;
  rarity: UnitRarity;
  type: UnitType;
  class: UnitClass;
  cost: number;
  maxLevel: number;
  maxSALevel: number;
  thumbnailId: number;
  hasImages: boolean;
  hasEza: boolean;
  hasSeza: boolean;
  releaseDates: ReleaseDates;
  stats: Stats;
  hpGains: { hp: number; atk: number; def: number } | null;
  linkIds: number[];
  linkNames: string[];
  leaderSkill: SkillText | null;
  passiveSkill: SkillText | null;
  /** ID de personaje base (agrupa formas, intercambios, transformaciones). */
  characterId: number | null;
  /** true si es forma intercambiada/transformada (no se muestra en el listado principal). */
  isExchangeForm: boolean;
}

export interface SeedMeta {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  attribution: string;
  unitCount: number;
  hashes: Record<string, string>;
}

type SyncPhase = 'idle' | 'checking' | 'updated' | 'up-to-date' | 'error';

export interface SyncState {
  phase: SyncPhase;
  /** Texto breve para el indicador del encabezado. */
  message: string;
  lastSuccessAt: number | null;
  newUnits: number;
  changedUnits: number;
  /** Ids de unidades nuevas desde la última sincronización (para el aviso descartable). */
  freshUnitIds: number[];
}
