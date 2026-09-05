/**
 * Exact Elden Ring attack-power calculation.
 *
 * This is a port of the calculator from ThomasJClark/elden-ring-weapon-calculator
 * (MIT licensed — see LICENSE-THIRDPARTY). The maths here is not approximate:
 * it is the game's own formula, driven by data extracted from regulation.bin.
 *
 * The short version of how attack power works:
 *
 *   1. Every weapon has a base attack value per damage type, multiplied by an
 *      upgrade multiplier for its +0..+25 level.
 *   2. Every weapon has a scaling value per attribute, also multiplied per level.
 *   3. Each attribute contributes a bonus, but not linearly — it runs through a
 *      "calc correct graph", which is where soft caps come from.
 *   4. If you do not meet the weapon's requirements you get a flat 40% penalty
 *      instead of any bonus.
 */

export const AttackPowerType = {
  PHYSICAL: 0,
  MAGIC: 1,
  FIRE: 2,
  LIGHTNING: 3,
  HOLY: 4,
  POISON: 5,
  SCARLET_ROT: 6,
  BLEED: 7,
  FROST: 8,
  SLEEP: 9,
  MADNESS: 10,
  DEATH_BLIGHT: 11,
} as const;

export type AttackPowerType = (typeof AttackPowerType)[keyof typeof AttackPowerType];

export const allDamageTypes: AttackPowerType[] = [0, 1, 2, 3, 4];
export const allStatusTypes: AttackPowerType[] = [5, 6, 7, 8, 9, 10, 11];
export const allAttackPowerTypes: AttackPowerType[] = [...allDamageTypes, ...allStatusTypes];

export const ATTACK_POWER_LABELS: Record<AttackPowerType, string> = {
  0: 'Physical', 1: 'Magic', 2: 'Fire', 3: 'Lightning', 4: 'Holy',
  5: 'Poison', 6: 'Scarlet Rot', 7: 'Bleed', 8: 'Frost',
  9: 'Sleep', 10: 'Madness', 11: 'Death Blight',
};

/** Weapon category ids as used by the game's own data. */
export const WeaponType = {
  DAGGER: 1, STRAIGHT_SWORD: 3, GREATSWORD: 5, COLOSSAL_SWORD: 7,
  CURVED_SWORD: 9, CURVED_GREATSWORD: 11, KATANA: 13, TWINBLADE: 14,
  THRUSTING_SWORD: 15, HEAVY_THRUSTING_SWORD: 16, AXE: 17, GREATAXE: 19,
  HAMMER: 21, GREAT_HAMMER: 23, FLAIL: 24, SPEAR: 25, GREAT_SPEAR: 28,
  HALBERD: 29, REAPER: 31, FIST: 35, CLAW: 37, WHIP: 39, COLOSSAL_WEAPON: 41,
  LIGHT_BOW: 50, BOW: 51, GREATBOW: 53, CROSSBOW: 55, BALLISTA: 56,
  GLINTSTONE_STAFF: 57, DUAL_CATALYST: 59, SACRED_SEAL: 61,
  SMALL_SHIELD: 65, MEDIUM_SHIELD: 67, GREATSHIELD: 69,
  TORCH: 87, HAND_TO_HAND: 88, PERFUME_BOTTLE: 89, THRUSTING_SHIELD: 90,
  THROWING_BLADE: 91, BACKHAND_BLADE: 92, LIGHT_GREATSWORD: 93,
  GREAT_KATANA: 94, BEAST_CLAW: 95,
} as const;

export const WEAPON_TYPE_LABELS: Record<number, string> = Object.fromEntries(
  Object.entries(WeaponType).map(([key, id]) => [
    id,
    key.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  ]),
);

export const allAttributes = ['str', 'dex', 'int', 'fai', 'arc'] as const;
export type Attribute = (typeof allAttributes)[number];
export type Attributes = Record<Attribute, number>;

/** Affinity ids as used by the game's own data. */
export const AFFINITY_NAMES: Record<number, string> = {
  [-1]: 'Unarmed',
  0: 'Standard', 1: 'Heavy', 2: 'Keen', 3: 'Quality', 4: 'Fire', 5: 'Flame Art',
  6: 'Lightning', 7: 'Sacred', 8: 'Magic', 9: 'Cold', 10: 'Poison', 11: 'Blood', 12: 'Occult',
};

const DEFAULT_DAMAGE_CALC_CORRECT_GRAPH_ID = 0;
const DEFAULT_STATUS_CALC_CORRECT_GRAPH_ID = 6;

/* ------------------------------------------------------------------ */
/* Shapes of the raw regulation file                                   */
/* ------------------------------------------------------------------ */

type CalcCorrectGraph = { maxVal: number; maxGrowVal: number; adjPt: number }[];

interface ReinforceParam {
  attack: Partial<Record<number, number>>;
  attributeScaling: Record<Attribute, number>;
  statusSpEffectId1?: number;
  statusSpEffectId2?: number;
  statusSpEffectId3?: number;
}

export interface EncodedWeapon {
  name: string;
  weaponName: string;
  variant?: string;
  url?: string | null;
  affinityId: number;
  weaponType: number;
  requirements: Partial<Record<Attribute, number>>;
  attributeScaling: (readonly [Attribute, number])[];
  attack: (readonly [number, number])[];
  statusSpEffectParamIds?: number[];
  reinforceTypeId: number;
  attackElementCorrectId: number;
  calcCorrectGraphIds?: Partial<Record<number, number>>;
  paired?: boolean;
  sorceryTool?: boolean;
  incantationTool?: boolean;
  dlc?: boolean;
}

export interface EncodedRegulationData {
  calcCorrectGraphs: Record<number, CalcCorrectGraph>;
  attackElementCorrects: Record<number, Partial<Record<number, Partial<Record<Attribute, number | true>>>>>;
  reinforceTypes: Record<number, ReinforceParam[]>;
  statusSpEffectParams: Record<number, Partial<Record<number, number>>>;
  scalingTiers: [number, string][];
  weapons: EncodedWeapon[];
}

/* ------------------------------------------------------------------ */
/* Decoded shape the app actually uses                                 */
/* ------------------------------------------------------------------ */

export interface DecodedWeapon {
  /** Full name including affinity, e.g. "Heavy Longsword". */
  name: string;
  /** Base name without affinity, e.g. "Longsword". */
  weaponName: string;
  url: string | null;
  affinityId: number;
  affinityName: string;
  weaponType: number;
  requirements: Partial<Record<Attribute, number>>;
  /** Indexed by upgrade level. */
  attributeScaling: Partial<Record<Attribute, number>>[];
  /** Indexed by upgrade level. */
  attack: Partial<Record<number, number>>[];
  attackElementCorrect: Partial<Record<number, Partial<Record<Attribute, number | true>>>>;
  /** Indexed by AttackPowerType, then by attribute value. */
  calcCorrectGraphs: Record<number, number[]>;
  scalingTiers: [number, string][];
  /** Highest upgrade this weapon accepts: 25 for normal, 10 for somber. */
  maxUpgradeLevel: number;
  paired: boolean;
  sorceryTool: boolean;
  incantationTool: boolean;
  dlc: boolean;
}

/**
 * Turns a calc correct graph's handful of breakpoints into a lookup table with
 * one entry per attribute value. This is where soft caps come from: the curve
 * between breakpoints is bent by `adjPt`.
 */
function evaluateCalcCorrectGraph(graph: CalcCorrectGraph): number[] {
  const arr: number[] = [];

  for (let i = 1; i < graph.length; i++) {
    const prev = graph[i - 1];
    const stage = graph[i];

    const minAttributeValue = i === 1 ? 1 : prev.maxVal + 1;
    const maxAttributeValue = i === graph.length - 1 ? 148 : stage.maxVal;

    for (let v = minAttributeValue; v <= maxAttributeValue; v++) {
      if (!arr[v]) {
        let ratio = Math.max(0, Math.min(1, (v - prev.maxVal) / (stage.maxVal - prev.maxVal)));

        if (prev.adjPt > 0) ratio = ratio ** prev.adjPt;
        else if (prev.adjPt < 0) ratio = 1 - (1 - ratio) ** -prev.adjPt;

        arr[v] = prev.maxGrowVal + (stage.maxGrowVal - prev.maxGrowVal) * ratio;
      }
    }
  }

  return arr;
}

/** Status effects scale with arcane for every weapon, so it is not stored per-weapon. */
const STATUS_ARCANE_CORRECT = {
  [AttackPowerType.POISON]: { arc: true as const },
  [AttackPowerType.BLEED]: { arc: true as const },
  [AttackPowerType.MADNESS]: { arc: true as const },
  [AttackPowerType.SLEEP]: { arc: true as const },
};

export function decodeRegulationData(data: EncodedRegulationData): DecodedWeapon[] {
  const graphsById = new Map<number, number[]>(
    Object.entries(data.calcCorrectGraphs).map(([id, g]) => [Number(id), evaluateCalcCorrectGraph(g)]),
  );

  const correctsById = new Map(
    Object.entries(data.attackElementCorrects).map(([id, correct]) => [
      Number(id),
      { ...correct, ...STATUS_ARCANE_CORRECT },
    ]),
  );

  const graphFor = (id: number, weaponName: string) => {
    const g = graphsById.get(id);
    if (!g) throw new Error(`No CalcCorrectGraph id=${id} for weapon=${weaponName}`);
    return g;
  };

  return data.weapons.map((w) => {
    const attackElementCorrect = correctsById.get(w.attackElementCorrectId);
    if (!attackElementCorrect) {
      throw new Error(`No AttackElementCorrectParam id=${w.attackElementCorrectId} for ${w.name}`);
    }

    const reinforceParams = data.reinforceTypes[w.reinforceTypeId];
    if (!reinforceParams) {
      throw new Error(`No ReinforceParamWeapon id=${w.reinforceTypeId} for ${w.name}`);
    }

    const calcCorrectGraphs: Record<number, number[]> = {};
    for (const t of allDamageTypes) {
      calcCorrectGraphs[t] = graphFor(w.calcCorrectGraphIds?.[t] ?? DEFAULT_DAMAGE_CALC_CORRECT_GRAPH_ID, w.name);
    }
    for (const t of allStatusTypes) {
      calcCorrectGraphs[t] = graphFor(w.calcCorrectGraphIds?.[t] ?? DEFAULT_STATUS_CALC_CORRECT_GRAPH_ID, w.name);
    }

    // Base attack at every upgrade level, including status buildup.
    const attack = reinforceParams.map((reinforce) => {
      const atLevel: Partial<Record<number, number>> = {};

      for (const [type, base] of w.attack) {
        atLevel[type] = base * (reinforce.attack[type] ?? 0);
      }

      const offsets = [reinforce.statusSpEffectId1, reinforce.statusSpEffectId2, reinforce.statusSpEffectId3];
      w.statusSpEffectParamIds?.forEach((spEffectParamId, i) => {
        if (spEffectParamId) {
          Object.assign(atLevel, data.statusSpEffectParams[spEffectParamId + (offsets[i] ?? 0)]);
        }
      });

      return atLevel;
    });

    // Scaling at every upgrade level.
    const attributeScaling = reinforceParams.map((reinforce) => {
      const atLevel: Partial<Record<Attribute, number>> = {};
      for (const [attr, base] of w.attributeScaling) {
        atLevel[attr] = base * reinforce.attributeScaling[attr];
      }
      return atLevel;
    });

    return {
      name: w.name,
      weaponName: w.weaponName,
      url: w.url === undefined ? `https://eldenring.wiki.gg/wiki/${w.weaponName.replaceAll(' ', '_')}` : w.url,
      affinityId: w.affinityId,
      affinityName: AFFINITY_NAMES[w.affinityId] ?? `Affinity ${w.affinityId}`,
      weaponType: w.weaponType,
      requirements: w.requirements,
      attributeScaling,
      attack,
      attackElementCorrect,
      calcCorrectGraphs,
      scalingTiers: data.scalingTiers,
      maxUpgradeLevel: reinforceParams.length - 1,
      paired: w.paired ?? false,
      sorceryTool: w.sorceryTool ?? false,
      incantationTool: w.incantationTool ?? false,
      dlc: w.dlc ?? false,
    };
  });
}

/* ------------------------------------------------------------------ */
/* The calculation                                                     */
/* ------------------------------------------------------------------ */

export interface AttackResult {
  upgradeLevel: number;
  /** Attack power per damage type and status effect. */
  attackPower: Partial<Record<number, number>>;
  /** Total of the five damage types — the number people mean by "AR". */
  total: number;
  /** Spell scaling percentage, for staffs and seals only. */
  spellScaling: Partial<Record<number, number>>;
  /** Attributes you are short on. Non-empty means you are taking the penalty. */
  ineffectiveAttributes: Attribute[];
}

/** Weapon types that can only ever be two-handed, so they always get the bonus. */
const ALWAYS_TWO_HANDED = new Set([
  WeaponType.LIGHT_BOW,
  WeaponType.BOW,
  WeaponType.GREATBOW,
  WeaponType.BALLISTA,
]);

/** Two-handing multiplies strength by 1.5. Paired weapons do not get it; bows always do. */
export function adjustAttributesForTwoHanding(
  weapon: DecodedWeapon,
  attributes: Attributes,
  twoHanding: boolean,
): Attributes {
  let bonus = twoHanding;
  if (weapon.paired) bonus = false;
  if (ALWAYS_TWO_HANDED.has(weapon.weaponType as never)) bonus = true;

  return bonus ? { ...attributes, str: Math.floor(attributes.str * 1.5) } : attributes;
}

const INEFFECTIVE_ATTRIBUTE_PENALTY = 0.4;

export function getWeaponAttack({
  weapon,
  attributes,
  upgradeLevel,
  twoHanding = false,
}: {
  weapon: DecodedWeapon;
  attributes: Attributes;
  upgradeLevel: number;
  twoHanding?: boolean;
}): AttackResult {
  const level = Math.min(upgradeLevel, weapon.maxUpgradeLevel);
  const adjusted = adjustAttributesForTwoHanding(weapon, attributes, twoHanding);

  const ineffectiveAttributes = (Object.entries(weapon.requirements) as [Attribute, number][])
    .filter(([attribute, requirement]) => adjusted[attribute] < requirement)
    .map(([attribute]) => attribute);

  const attackPower: Partial<Record<number, number>> = {};
  const spellScaling: Partial<Record<number, number>> = {};

  for (const type of allAttackPowerTypes) {
    const isDamageType = allDamageTypes.includes(type);
    const baseAttackPower = weapon.attack[level][type] ?? 0;

    if (!baseAttackPower && !weapon.sorceryTool && !weapon.incantationTool) continue;

    const scalingAttributes = weapon.attackElementCorrect[type] ?? {};
    let totalScaling = 1;

    if (ineffectiveAttributes.some((attribute) => scalingAttributes[attribute])) {
      // Requirements not met: a flat penalty replaces any scaling bonus.
      totalScaling = 1 - INEFFECTIVE_ATTRIBUTE_PENALTY;
    } else {
      const effective = isDamageType ? adjusted : attributes;
      for (const attribute of allAttributes) {
        const attributeCorrect = scalingAttributes[attribute];
        if (!attributeCorrect) continue;

        const scaling =
          attributeCorrect === true
            ? (weapon.attributeScaling[level][attribute] ?? 0)
            : (attributeCorrect * (weapon.attributeScaling[level][attribute] ?? 0)) /
              (weapon.attributeScaling[0][attribute] ?? 0);

        if (scaling) {
          totalScaling += weapon.calcCorrectGraphs[type][effective[attribute]] * scaling;
        }
      }
    }

    if (baseAttackPower) attackPower[type] = baseAttackPower * totalScaling;
    if (isDamageType && (weapon.sorceryTool || weapon.incantationTool)) {
      spellScaling[type] = 100 * totalScaling;
    }
  }

  const total = allDamageTypes.reduce<number>((sum, t) => sum + (attackPower[t] ?? 0), 0);

  return { upgradeLevel: level, attackPower, total, spellScaling, ineffectiveAttributes };
}

/** Converts a raw scaling number into the letter grade the game shows. */
export function scalingGrade(value: number, tiers: [number, string][]): string | null {
  if (!value) return null;
  for (const [threshold, label] of tiers) {
    if (value >= threshold) return label;
  }
  return null;
}
