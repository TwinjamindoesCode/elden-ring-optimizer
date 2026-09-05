/**
 * Stat allocation optimizer.
 *
 * The question this answers: "I want to be level 150 using this weapon —
 * exactly how should I spend my points?"
 *
 * Why the answer is exact rather than a guess
 * -------------------------------------------
 * Attack power for one damage type is:
 *
 *     AR_d = base_d * (1 + SUM over attributes a of  scaling_{a,d} * curve_d(stat_a))
 *
 * Summing over damage types and rearranging:
 *
 *     total AR = (constant base) + SUM over a of [ f_a(stat_a) ]
 *
 * where f_a depends ONLY on that one attribute. The attributes never interact.
 * That makes this a separable resource-allocation problem, which dynamic
 * programming solves exactly — no hill climbing, no local maxima, no guessing.
 *
 * The one wrinkle is the 40% penalty for not meeting requirements, which is not
 * separable. We handle it by treating requirements as hard floors: any build
 * that fails them is so much worse that meeting them is always correct.
 */

import {
  getWeaponAttack, allAttributes, allDamageTypes, AttackPowerType,
  type Attribute, type Attributes, type DecodedWeapon,
} from './attack-power.ts';

export interface OptimizeInput {
  weapon: DecodedWeapon;
  upgradeLevel: number;
  twoHanding: boolean;
  /** Lowest each attribute may go — class starting stats, and weapon requirements. */
  floors: Attributes;
  /** Extra points available to spend above the floors. */
  budget: number;
  /** What to maximise. Defaults to attack power. */
  objective?: Objective;
}

export interface OptimizeResult {
  attributes: Attributes;
  /** Total attack power (the five damage types added together). */
  total: number;
  /** Value of the objective actually being maximised. Equals total when objective is attack. */
  objectiveTotal: number;
  pointsSpent: number;
  /** True if the result was re-checked against the real calculator and matched. */
  verified: boolean;
  /** Requirements still unmet after optimizing — the build takes the 40% penalty. */
  ineffectiveAttributes: Attribute[];
}

const MAX_ATTRIBUTE = 99;

/**
 * What the solver is trying to maximise. `attack` is the sum of the five damage
 * types — the number people mean by AR. The others are status buildup.
 */
export type Objective = 'attack' | 'bleed' | 'frost' | 'poison' | 'scarletRot' | 'madness' | 'sleep';

export const OBJECTIVE_TYPES: Record<Objective, AttackPowerType[]> = {
  attack: allDamageTypes,
  bleed: [AttackPowerType.BLEED],
  frost: [AttackPowerType.FROST],
  poison: [AttackPowerType.POISON],
  scarletRot: [AttackPowerType.SCARLET_ROT],
  madness: [AttackPowerType.MADNESS],
  sleep: [AttackPowerType.SLEEP],
};

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  attack: 'Attack power',
  bleed: 'Bleed buildup',
  frost: 'Frost buildup',
  poison: 'Poison buildup',
  scarletRot: 'Scarlet rot buildup',
  madness: 'Madness buildup',
  sleep: 'Sleep buildup',
};

/**
 * In vanilla only poison, bleed, madness and sleep scale with arcane. Frost,
 * scarlet rot and death blight are flat — no allocation changes them, so for
 * those the spread is decided entirely by the tie-break below.
 */
export const SCALING_OBJECTIVES: Objective[] = ['attack', 'bleed', 'poison', 'madness', 'sleep'];

export function objectiveScalesWithStats(objective: Objective): boolean {
  return SCALING_OBJECTIVES.includes(objective);
}

/**
 * Weight given to attack power when it is not the objective. Small enough that
 * it can never outrank a real difference in buildup — the smallest gap between
 * two buildup values is 1, and attack power tops out around 1000, so at 1e-6
 * the tie-break contributes at most ~0.001. Its only job is to decide between
 * allocations that are exactly equal on the real objective, which is what makes
 * "best frost weapon" still return a sensible build rather than an arbitrary one.
 */
const TIE_BREAK_WEIGHT = 1e-6;

function weightFor(type: AttackPowerType, objective: Objective): number {
  if (OBJECTIVE_TYPES[objective].includes(type)) return 1;
  if (allDamageTypes.includes(type)) return TIE_BREAK_WEIGHT;
  return 0;
}

/** Every type the solver ever needs to look at. */
const CONSIDERED_TYPES: AttackPowerType[] = [
  ...allDamageTypes,
  AttackPowerType.BLEED, AttackPowerType.FROST, AttackPowerType.POISON,
  AttackPowerType.SCARLET_ROT, AttackPowerType.MADNESS, AttackPowerType.SLEEP,
];

/**
 * How much one attribute contributes to the objective at each possible value.
 * Everything that does not depend on this attribute is left out — it is constant
 * and gets added back at the end.
 */
function attributeCurve(
  weapon: DecodedWeapon,
  level: number,
  attribute: Attribute,
  twoHanding: boolean,
  objective: Objective,
): Float64Array {
  const curve = new Float64Array(MAX_ATTRIBUTE + 1);
  const scalingAtLevel = weapon.attributeScaling[level];
  const scalingAtZero = weapon.attributeScaling[0];

  // Two-handing raises effective strength by 50%, which is what the curve reads.
  const strBonus = twoHanding && !weapon.paired && attribute === 'str';

  for (const type of CONSIDERED_TYPES) {
    const weight = weightFor(type, objective);
    if (!weight) continue;

    const base = weapon.attack[level][type] ?? 0;
    if (!base) continue;

    const attributeCorrect = weapon.attackElementCorrect[type]?.[attribute];
    if (!attributeCorrect) continue;

    const scaling =
      attributeCorrect === true
        ? (scalingAtLevel[attribute] ?? 0)
        : (attributeCorrect * (scalingAtLevel[attribute] ?? 0)) / (scalingAtZero[attribute] ?? 0);

    if (!scaling) continue;

    const graph = weapon.calcCorrectGraphs[type];
    for (let v = 1; v <= MAX_ATTRIBUTE; v++) {
      const effective = strBonus ? Math.floor(v * 1.5) : v;
      curve[v] += weight * base * scaling * (graph[effective] ?? 0);
    }
  }

  return curve;
}

/** The part of the objective that does not depend on any attribute. */
function constantPart(weapon: DecodedWeapon, level: number, objective: Objective): number {
  let sum = 0;
  for (const type of CONSIDERED_TYPES) {
    const weight = weightFor(type, objective);
    if (weight) sum += weight * (weapon.attack[level][type] ?? 0);
  }
  return sum;
}

/** The true, unweighted value of the objective for a finished result. */
export function objectiveValue(
  attackPower: Partial<Record<number, number>>,
  objective: Objective,
): number {
  return OBJECTIVE_TYPES[objective].reduce<number>((sum, t) => sum + (attackPower[t] ?? 0), 0);
}

/**
 * Exact optimum via dynamic programming over the five attributes.
 *
 * dp[c] = the best total contribution achievable having spent exactly c points
 * so far. Processing one attribute at a time keeps this O(5 * budget * 99),
 * which is a few tens of thousands of operations — instant.
 */
/**
 * The five attribute curves for one weapon. These depend only on the weapon,
 * upgrade level and grip — not on the class — so when comparing classes for the
 * same weapon, build them once and pass them in.
 */
export function buildAttributeCurves(
  weapon: DecodedWeapon,
  upgradeLevel: number,
  twoHanding: boolean,
  objective: Objective = 'attack',
): Float64Array[] {
  const level = Math.min(upgradeLevel, weapon.maxUpgradeLevel);
  return allAttributes.map((a) => attributeCurve(weapon, level, a, twoHanding, objective));
}

/**
 * Scratch buffers reused across calls. The optimizer runs tens of thousands of
 * times when ranking every weapon against every class, and allocating fresh
 * arrays each time costs more than the arithmetic does.
 */
const scratch = {
  size: 0,
  current: new Float64Array(0),
  next: new Float64Array(0),
  choices: [] as Int16Array[],
};

function ensureScratch(budget: number) {
  const size = budget + 1;
  if (scratch.size >= size) return;
  scratch.size = size;
  scratch.current = new Float64Array(size);
  scratch.next = new Float64Array(size);
  scratch.choices = allAttributes.map(() => new Int16Array(size));
}

export function optimizeStats({
  weapon, upgradeLevel, twoHanding, floors, budget, objective = 'attack', curves: providedCurves,
}: OptimizeInput & { curves?: Float64Array[] }): OptimizeResult {
  const level = Math.min(upgradeLevel, weapon.maxUpgradeLevel);
  const safeBudget = Math.max(0, Math.floor(budget));

  const curves = providedCurves ?? buildAttributeCurves(weapon, level, twoHanding, objective);

  ensureScratch(safeBudget);
  let dp = scratch.current;
  let next = scratch.next;
  const choices = scratch.choices;

  dp.fill(-Infinity, 0, safeBudget + 1);
  dp[0] = 0;

  for (let i = 0; i < allAttributes.length; i++) {
    const attribute = allAttributes[i];
    const floor = Math.max(1, Math.min(MAX_ATTRIBUTE, Math.round(floors[attribute])));
    const curve = curves[i];
    const choice = choices[i];

    next.fill(-Infinity, 0, safeBudget + 1);
    choice.fill(0, 0, safeBudget + 1);

    const maxExtra = MAX_ATTRIBUTE - floor;

    for (let spent = 0; spent <= safeBudget; spent++) {
      const base = dp[spent];
      if (base === -Infinity) continue;
      const limit = Math.min(maxExtra, safeBudget - spent);

      for (let extra = 0; extra <= limit; extra++) {
        const value = base + curve[floor + extra];
        const at = spent + extra;
        if (value > next[at]) {
          next[at] = value;
          choice[at] = extra;
        }
      }
    }

    // Swap the two buffers rather than allocating a new one.
    const swap = dp;
    dp = next;
    next = swap;
  }

  // Best total spend (spending everything is usually best, but not always —
  // a maxed-out stat can leave points with nowhere useful to go).
  let bestSpend = 0;
  for (let c = 1; c <= safeBudget; c++) {
    if (dp[c] > dp[bestSpend]) bestSpend = c;
  }
  const bestValue = dp[bestSpend];

  // Walk the choices backwards to recover the actual attribute values.
  const attributes = { ...floors };
  let remaining = bestSpend;
  for (let i = allAttributes.length - 1; i >= 0; i--) {
    const extra = choices[i][remaining];
    const attribute = allAttributes[i];
    attributes[attribute] = Math.max(1, Math.round(floors[attribute])) + Math.max(0, extra);
    remaining -= Math.max(0, extra);
  }

  // Re-run the real calculator on the answer. If the DP and the calculator
  // disagree, the optimizer is broken and we would rather know. The comparison
  // uses the same weighted objective the DP maximised, tie-break included.
  const check = getWeaponAttack({ weapon, attributes, upgradeLevel: level, twoHanding });
  const predicted = constantPart(weapon, level, objective) + bestValue;
  const actualWeighted = CONSIDERED_TYPES.reduce<number>(
    (sum, t) => sum + weightFor(t, objective) * (check.attackPower[t] ?? 0), 0,
  );
  const verified = Math.abs(predicted - actualWeighted) < 0.01;

  return {
    attributes,
    total: check.total,
    objectiveTotal: objectiveValue(check.attackPower, objective),
    pointsSpent: bestSpend,
    verified,
    ineffectiveAttributes: check.ineffectiveAttributes,
  };
}

/* ------------------------------------------------------------------ */
/* Level budgeting                                                     */
/* ------------------------------------------------------------------ */

/** In Elden Ring, character level always equals (sum of all 8 attributes) - 79. */
export const LEVEL_OFFSET = 79;

export interface BudgetInput {
  targetLevel: number;
  /** The class's starting values for all eight attributes. */
  classStats: Record<string, number>;
  /** Survivability stats the player wants locked in before combat stats. */
  vigor: number;
  mind: number;
  endurance: number;
  /** Weapon requirements, which must be met or the build takes a 40% penalty. */
  requirements: Partial<Record<Attribute, number>>;
  twoHanding: boolean;
}

export interface BudgetResult {
  floors: Attributes;
  budget: number;
  /** Points consumed by vigor/mind/endurance and by the floors. */
  reserved: { vigor: number; mind: number; endurance: number };
  /** Set when the target level cannot cover the floors and requirements. */
  shortfall: number;
}

/**
 * Works out how many points are actually free to distribute, after class
 * minimums, the player's chosen survivability stats, and weapon requirements.
 */
export function computeBudget({
  targetLevel, classStats, vigor, mind, endurance, requirements, twoHanding,
}: BudgetInput): BudgetResult {
  const clampedVigor = Math.max(classStats.vigor, vigor);
  const clampedMind = Math.max(classStats.mind, mind);
  const clampedEndurance = Math.max(classStats.endurance, endurance);

  const floors: Attributes = {
    str: classStats.strength,
    dex: classStats.dexterity,
    int: classStats.intelligence,
    fai: classStats.faith,
    arc: classStats.arcane,
  };

  // Requirements become floors too. Two-handing means the strength requirement
  // can be met with fewer actual points: you need ceil(req / 1.5).
  for (const attribute of allAttributes) {
    const required = requirements[attribute] ?? 0;
    if (!required) continue;
    const effectiveRequired =
      attribute === 'str' && twoHanding ? Math.ceil(required / 1.5) : required;
    floors[attribute] = Math.max(floors[attribute], effectiveRequired);
  }

  const totalPoints = targetLevel + LEVEL_OFFSET;
  const spentElsewhere = clampedVigor + clampedMind + clampedEndurance;
  const floorCost = allAttributes.reduce((sum, a) => sum + floors[a], 0);
  const budget = totalPoints - spentElsewhere - floorCost;

  return {
    floors,
    budget: Math.max(0, budget),
    reserved: { vigor: clampedVigor, mind: clampedMind, endurance: clampedEndurance },
    shortfall: budget < 0 ? -budget : 0,
  };
}

/** The character level implied by a finished set of attributes. */
export function levelFor(attributes: Attributes, vigor: number, mind: number, endurance: number) {
  const combat = allAttributes.reduce((sum, a) => sum + attributes[a], 0);
  return combat + vigor + mind + endurance - LEVEL_OFFSET;
}
