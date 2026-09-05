/**
 * Shareable build links.
 *
 * Design rules, in priority order:
 *
 * 1. READABLE. A link someone can partially read is more trustworthy than an
 *    opaque blob. `?w=uchigatana&aff=11&lvl=150` tells you what you are about
 *    to open. No base64.
 *
 * 2. FORWARD COMPATIBLE. Unknown parameters are ignored, missing ones fall back
 *    to defaults. Adding a field later cannot break links already shared.
 *
 * 3. EXACT. The link carries the resulting weapon and the solved stat spread,
 *    not just the inputs. If the data or the solver ever changes, an old link
 *    still renders the build it was created for rather than silently becoming
 *    a different build with the same URL.
 */

import type { Attributes } from '../calculator';

export type ShareObjective =
  | 'attack' | 'bleed' | 'frost' | 'poison' | 'scarletRot' | 'madness' | 'sleep';

export interface ShareState {
  /** Base weapon name, e.g. "Uchigatana" — not the affinity-prefixed name. */
  weaponName: string;
  affinityId: number;
  upgradeLevel: number;
  targetLevel: number;
  vigor: number;
  mind: number;
  endurance: number;
  twoHanding: boolean;
  /** The solved allocation, carried so the link is reproducible. */
  attributes: Attributes;
  classId: string;
  objective: ShareObjective;
  archetype: string;
  infusionMode: string;
  pureOnly: boolean;
  weaponType: number | 'all';
  ashId: number | 'any';
  search: string;
}

export const SHARE_DEFAULTS: Omit<ShareState, 'weaponName' | 'affinityId' | 'attributes' | 'classId'> = {
  upgradeLevel: 25,
  targetLevel: 150,
  vigor: 60,
  mind: 20,
  endurance: 25,
  twoHanding: false,
  objective: 'attack',
  archetype: 'any',
  infusionMode: 'any',
  pureOnly: false,
  weaponType: 'all',
  ashId: 'any',
  search: '',
};

const OBJECTIVES: ShareObjective[] = [
  'attack', 'bleed', 'frost', 'poison', 'scarletRot', 'madness', 'sleep',
];
const ARCHETYPES = ['any', 'str', 'dex', 'int', 'fai', 'arc'];
const INFUSION_MODES = ['any', 'none'];

/* ------------------------------------------------------------------ */
/* Encode                                                              */
/* ------------------------------------------------------------------ */

/** Short, stable parameter names. Never rename one — old links depend on them. */
export function encodeBuild(state: ShareState): URLSearchParams {
  const p = new URLSearchParams();

  p.set('w', state.weaponName);
  p.set('aff', String(state.affinityId));
  p.set('up', String(state.upgradeLevel));
  p.set('lvl', String(state.targetLevel));
  p.set('vig', String(state.vigor));
  p.set('mnd', String(state.mind));
  p.set('end', String(state.endurance));
  p.set('s', [
    state.attributes.str, state.attributes.dex, state.attributes.int,
    state.attributes.fai, state.attributes.arc,
  ].join('-'));
  if (state.classId) p.set('cls', state.classId);

  // Only write non-defaults, so the common link stays short and legible.
  if (state.twoHanding) p.set('2h', '1');
  if (state.objective !== SHARE_DEFAULTS.objective) p.set('obj', state.objective);
  if (state.archetype !== SHARE_DEFAULTS.archetype) p.set('arch', state.archetype);
  if (state.infusionMode !== SHARE_DEFAULTS.infusionMode) p.set('inf', state.infusionMode);
  if (state.pureOnly) p.set('pure', '1');
  if (state.weaponType !== 'all') p.set('wt', String(state.weaponType));
  if (state.ashId !== 'any') p.set('ash', String(state.ashId));
  if (state.search.trim()) p.set('q', state.search.trim());

  return p;
}

/**
 * Share links point at /b, which is served by a small function that rewrites the
 * Open Graph tags for this specific build before returning the app. Normal
 * traffic to the site never touches it.
 */
export function buildShareUrl(state: ShareState, origin: string): string {
  return `${origin}/b?${encodeBuild(state).toString()}#optimizer`;
}

/* ------------------------------------------------------------------ */
/* Decode                                                              */
/* ------------------------------------------------------------------ */

/** Everything a link can carry. Absent fields stay undefined, never throw. */
export interface DecodedBuild {
  weaponName?: string;
  affinityId?: number;
  attributes?: Attributes;
  classId?: string;
  upgradeLevel: number;
  targetLevel: number;
  vigor: number;
  mind: number;
  endurance: number;
  twoHanding: boolean;
  objective: ShareObjective;
  archetype: string;
  infusionMode: string;
  pureOnly: boolean;
  weaponType: number | 'all';
  ashId: number | 'any';
  search: string;
  /** True when the link actually pinned a weapon, rather than being a bare URL. */
  hasBuild: boolean;
}

const clampInt = (raw: string | null, min: number, max: number, fallback: number): number => {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const oneOf = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
  raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;

/**
 * Never throws. A malformed or hand-edited link degrades to defaults rather
 * than showing an error page, and unknown parameters are simply not read.
 */
export function decodeBuild(search: string): DecodedBuild {
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(search);
  } catch {
    p = new URLSearchParams();
  }

  const weaponName = p.get('w')?.trim() || undefined;

  let attributes: Attributes | undefined;
  const rawStats = p.get('s');
  if (rawStats) {
    const parts = rawStats.split('-').map((v) => Number(v));
    if (parts.length === 5 && parts.every((n) => Number.isFinite(n))) {
      const [str, dex, int, fai, arc] = parts.map((n) => Math.max(1, Math.min(99, Math.round(n))));
      attributes = { str, dex, int, fai, arc };
    }
  }

  const rawType = p.get('wt');
  const rawAsh = p.get('ash');

  return {
    weaponName,
    affinityId: p.has('aff') ? clampInt(p.get('aff'), -1, 12, 0) : undefined,
    attributes,
    classId: p.get('cls')?.trim() || undefined,
    upgradeLevel: clampInt(p.get('up'), 0, 25, SHARE_DEFAULTS.upgradeLevel),
    targetLevel: clampInt(p.get('lvl'), 1, 713, SHARE_DEFAULTS.targetLevel),
    vigor: clampInt(p.get('vig'), 1, 99, SHARE_DEFAULTS.vigor),
    mind: clampInt(p.get('mnd'), 1, 99, SHARE_DEFAULTS.mind),
    endurance: clampInt(p.get('end'), 1, 99, SHARE_DEFAULTS.endurance),
    twoHanding: p.get('2h') === '1',
    objective: oneOf(p.get('obj'), OBJECTIVES, SHARE_DEFAULTS.objective),
    archetype: oneOf(p.get('arch'), ARCHETYPES, SHARE_DEFAULTS.archetype),
    infusionMode: oneOf(p.get('inf'), INFUSION_MODES, SHARE_DEFAULTS.infusionMode),
    pureOnly: p.get('pure') === '1',
    weaponType: rawType !== null && Number.isFinite(Number(rawType)) ? Number(rawType) : 'all',
    ashId: rawAsh !== null && Number.isFinite(Number(rawAsh)) ? Number(rawAsh) : 'any',
    search: p.get('q') ?? SHARE_DEFAULTS.search,
    hasBuild: Boolean(weaponName && attributes),
  };
}
