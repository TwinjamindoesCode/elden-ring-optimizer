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
  getWeaponAttack, allAttributes, allDamageTypes,
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
}

export interface OptimizeResult {
  attributes: Attributes;
  /** Total attack power (the five damage types added together). */
  total: number;
  pointsSpent: number;
  /** True if the result was re-checked against the real calculator and matched. */
  verified: boolean;
  /** Requirements still unmet after optimizing — the build takes the 40% penalty. */
  ineffectiveAttributes: Attribute[];
}

const MAX_ATTRIBUTE = 99;

/**
 * How much total attack power one attribute contributes at each possible value.
 * Everything that does not depend on this attribute is left out — it is constant
 * and gets added back at the end.
 */
function attributeCurve(
  weapon: DecodedWeapon,
  level: number,
  attribute: Attribute,
  twoHanding: boolean,
): Float64Array {
  const curve = new Float64Array(MAX_ATTRIBUTE + 1);
  const scalingAtLevel = weapon.attributeScaling[level];
  const scalingAtZero = weapon.attributeScaling[0];

  // Two-handing raises effective strength by 50%, which is what the curve reads.
  const strBonus = twoHanding && !weapon.paired && attribute === 'str';

  for (const damageType of allDamageTypes) {
    const base = weapon.attack[level][damageType] ?? 0;
    if (!base) continue;

    const attributeCorrect = weapon.attackElementCorrect[damageType]?.[attribute];
    if (!attributeCorrect) continue;

    const scaling =
      attributeCorrect === true
        ? (scalingAtLevel[attribute] ?? 0)
        : (attributeCorrect * (scalingAtLevel[attribute] ?? 0)) / (scalingAtZero[attribute] ?? 0);

    if (!scaling) continue;

    const graph = weapon.calcCorrectGraphs[damageType];
    for (let v = 1; v <= MAX_ATTRIBUTE; v++) {
      const effective = strBonus ? Math.floor(v * 1.5) : v;
      curve[v] += base * scaling * (graph[effective] ?? 0);
    }
  }

  return curve;
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
): Float64Array[] {
  const level = Math.min(upgradeLevel, weapon.maxUpgradeLevel);
  return allAttributes.map((a) => attributeCurve(weapon, level, a, twoHanding));
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
  weapon, upgradeLevel, twoHanding, floors, budget, curves: providedCurves,
}: OptimizeInput & { curves?: Float64Array[] }): OptimizeResult {
  const level = Math.min(upgradeLevel, weapon.maxUpgradeLevel);
  const safeBudget = Math.max(0, Math.floor(budget));

  const curves = providedCurves ?? buildAttributeCurves(weapon, level, twoHanding);

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
  // disagree, the optimizer is broken and we would rather know.
  const check = getWeaponAttack({ weapon, attributes, upgradeLevel: level, twoHanding });
  const constantBase = allDamageTypes.reduce<number>(
    (sum, d) => sum + (weapon.attack[level][d] ?? 0), 0,
  );
  const predicted = constantBase + bestValue;
  const verified = Math.abs(predicted - check.total) < 0.01;

  return {
    attributes,
    total: check.total,
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
