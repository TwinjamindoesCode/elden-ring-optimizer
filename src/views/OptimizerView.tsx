import { useEffect, useMemo, useState } from 'react';
import { classList } from '../data';
import {
  exactWeapons, optimizeStats, buildAttributeCurves, computeBudget, getWeaponAttack,
  infusionRequirement, objectiveScalesWithStats, OBJECTIVE_LABELS,
  AFFINITY_NAMES, WEAPON_TYPE_LABELS, allAttributes, allDamageTypes,
  ATTACK_POWER_LABELS, scalingGrade,
  type DecodedWeapon, type Attributes, type Objective,
} from '../calculator';

const ATTRIBUTE_LABELS: [keyof Attributes, string][] = [
  ['str', 'STR'], ['dex', 'DEX'], ['int', 'INT'], ['fai', 'FTH'], ['arc', 'ARC'],
];

interface Candidate {
  weapon: DecodedWeapon;
  attributes: Attributes;
  total: number;
  objectiveTotal: number;
  className: string;
  classId: string;
  verified: boolean;
}

/** How many results the page shows. */
const SHOWN = 40;

/**
 * The lowest value each attribute takes across all ten classes. A build with
 * these floors is not achievable in game — it is a lower bound on the
 * constraints, used only to compute an upper bound on attack power.
 */
const MINIMUM_CLASS_STATS: Record<string, number> = (() => {
  const keys = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];
  const out: Record<string, number> = {};
  for (const key of keys) {
    out[key] = Math.min(...classList.map((c) => c.stats[key as keyof typeof c.stats]));
  }
  return out;
})();

/**
 * Best attack power this weapon could possibly reach if class floors were as
 * permissive as they ever get. Always >= the true answer for every real class,
 * which is what makes it safe to prune with.
 */
function upperBound(
  weapon: DecodedWeapon,
  targetLevel: number,
  vigor: number,
  mind: number,
  endurance: number,
  twoHanding: boolean,
  upgradeLevel: number,
  objective: Objective,
): number {
  const { floors, budget, shortfall } = computeBudget({
    targetLevel,
    classStats: MINIMUM_CLASS_STATS,
    vigor, mind, endurance,
    requirements: weapon.requirements,
    twoHanding,
  });
  if (shortfall > 0) return 0;
  return optimizeStats({ weapon, upgradeLevel, twoHanding, floors, budget, objective }).objectiveTotal;
}

/**
 * Runs the optimizer for one weapon across every starting class and keeps the
 * best. Class choice matters because a class's starting stats are a floor —
 * points already sunk into a stat you do not want are permanently wasted.
 */
function bestForWeapon(
  weapon: DecodedWeapon,
  targetLevel: number,
  vigor: number,
  mind: number,
  endurance: number,
  twoHanding: boolean,
  upgradeLevel: number,
  lockedClassId: string | 'best',
  objective: Objective,
): Candidate | null {
  let best: Candidate | null = null;

  // The scaling curves depend on the weapon, not the class, so build them once
  // and reuse across all ten classes. This is most of the speed of this screen.
  const curves = buildAttributeCurves(weapon, upgradeLevel, twoHanding, objective);

  for (const cls of classList) {
    if (lockedClassId !== 'best' && cls.id !== lockedClassId) continue;

    const { floors, budget, shortfall } = computeBudget({
      targetLevel,
      classStats: cls.stats,
      vigor, mind, endurance,
      requirements: weapon.requirements,
      twoHanding,
    });
    if (shortfall > 0) continue;

    const result = optimizeStats({ weapon, upgradeLevel, twoHanding, floors, budget, objective, curves });

    // A build that cannot meet requirements is disqualified rather than shown
    // with its 40% penalty — it is never the answer to "what is best".
    if (result.ineffectiveAttributes.length > 0) continue;

    if (!best || result.objectiveTotal > best.objectiveTotal) {
      best = {
        weapon,
        attributes: result.attributes,
        total: result.total,
        objectiveTotal: result.objectiveTotal,
        className: cls.name,
        classId: cls.id,
        verified: result.verified,
      };
    }
  }

  return best;
}

/**
 * Shows how attack power is divided between damage types. This matters a lot:
 * a weapon dealing 500 physical + 400 fire has a bigger total than one dealing
 * 800 pure physical, but usually performs worse, because each damage type is
 * reduced separately by the target's defences and negation.
 */
function splitLabel(candidate: Candidate, upgradeLevel: number, twoHanding: boolean): string {
  const result = getWeaponAttack({
    weapon: candidate.weapon,
    attributes: candidate.attributes,
    upgradeLevel,
    twoHanding,
  });
  const parts = allDamageTypes
    .map((t) => result.attackPower[t] ?? 0)
    .filter((v) => v > 0);
  return parts.length > 1 ? `${parts.map((v) => Math.floor(v)).join(' / ')}` : 'pure';
}

/** How many damage types this build actually deals. 1 means "pure". */
function damageTypeCount(candidate: Candidate, upgradeLevel: number, twoHanding: boolean): number {
  const result = getWeaponAttack({
    weapon: candidate.weapon, attributes: candidate.attributes, upgradeLevel, twoHanding,
  });
  return allDamageTypes.filter((t) => (result.attackPower[t] ?? 0) > 0).length;
}

/**
 * Which attribute actually earns this build its attack power — the one whose
 * scaling contributes most at the optimum. This is what "a DEX build" means
 * here: not what the weapon's letters say, but where the damage comes from.
 */
function dominantAttribute(
  candidate: Candidate, upgradeLevel: number, twoHanding: boolean,
): keyof Attributes {
  const { weapon, attributes } = candidate;
  const level = Math.min(upgradeLevel, weapon.maxUpgradeLevel);
  const full = getWeaponAttack({ weapon, attributes, upgradeLevel: level, twoHanding }).total;

  let bestAttr: keyof Attributes = 'str';
  let bestDrop = -Infinity;

  // Drop each attribute to its requirement floor and see which loses the most.
  for (const attribute of allAttributes) {
    const floor = Math.max(1, weapon.requirements[attribute] ?? 1);
    if (attributes[attribute] <= floor) continue;
    const reduced = { ...attributes, [attribute]: floor };
    const drop = full - getWeaponAttack({
      weapon, attributes: reduced, upgradeLevel: level, twoHanding,
    }).total;
    if (drop > bestDrop) {
      bestDrop = drop;
      bestAttr = attribute;
    }
  }
  return bestAttr;
}

/** Delays a fast-changing value so heavy recomputation happens once you pause. */
function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function OptimizerView() {
  const [targetLevel, setTargetLevel] = useState(150);
  const [vigor, setVigor] = useState(60);
  const [mind, setMind] = useState(20);
  const [endurance, setEndurance] = useState(25);
  const [twoHanding, setTwoHanding] = useState(false);
  const [upgradeLevel, setUpgradeLevel] = useState(25);
  const [affinity, setAffinity] = useState<number | 'all'>('all');
  const [weaponType, setWeaponType] = useState<number | 'all'>('all');
  const [lockedClass, setLockedClass] = useState<string | 'best'>('best');
  const [search, setSearch] = useState('');
  const [objective, setObjective] = useState<Objective>('attack');
  const [pureOnly, setPureOnly] = useState(false);
  const [archetype, setArchetype] = useState<keyof Attributes | 'any'>('any');
  const [infusionMode, setInfusionMode] = useState<'any' | 'none'>('any');

  const weaponTypes = useMemo(() => {
    const ids = [...new Set(exactWeapons.map((w) => w.weaponType))];
    return ids
      .map((id) => [id, WEAPON_TYPE_LABELS[id] ?? `Type ${id}`] as const)
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, []);

  const dTargetLevel = useDebounced(targetLevel);
  const dVigor = useDebounced(vigor);
  const dMind = useDebounced(mind);
  const dEndurance = useDebounced(endurance);
  const dSearch = useDebounced(search);

  /**
   * Upper bound for every weapon, ranked. This depends only on the level budget
   * and grip — not on the class or any filter — so it survives changing those,
   * which is what makes switching class or affinity feel instant.
   */
  const rankedBounds = useMemo(() => {
    return exactWeapons
      // Catalysts scale spells, not weapon attacks — ranking them by AR is misleading.
      .filter((w) => !w.sorceryTool && !w.incantationTool)
      .map((weapon) => ({
        weapon,
        bound: upperBound(
          weapon, dTargetLevel, dVigor, dMind, dEndurance, twoHanding, upgradeLevel, objective,
        ),
      }))
      .filter((entry) => entry.bound > 0)
      .sort((a, b) => b.bound - a.bound);
  }, [dTargetLevel, dVigor, dMind, dEndurance, twoHanding, upgradeLevel, objective]);

  const candidates = useMemo(() => {
    const query = dSearch.trim().toLowerCase();

    // Evaluating all ten classes for all ~3,300 weapons is far more work than
    // needed. The bound above comes from a synthetic class whose stats are the
    // lowest of all ten: fewer constraints can only ever help, so no real class
    // can beat it. Working down that ranking, we can stop as soon as the bound
    // falls below the worst result already locked in — anything further down is
    // provably worse. The output is identical to checking every pair.
    const bounded = rankedBounds.filter(({ weapon }) => {
      if (affinity !== 'all' && weapon.affinityId !== affinity) return false;
      // 'No infusion needed' means as-found or a unique weapon you cannot infuse anyway.
      if (infusionMode === 'none' && infusionRequirement(weapon.affinityId).needsInfusion) return false;
      if (weaponType !== 'all' && weapon.weaponType !== weaponType) return false;
      if (query && !weapon.name.toLowerCase().includes(query)) return false;
      return true;
    });

    const results: Candidate[] = [];
    let cutoff = -Infinity;

    for (const { weapon, bound } of bounded) {
      if (results.length >= SHOWN && bound <= cutoff) break;

      const best = bestForWeapon(
        weapon, dTargetLevel, dVigor, dMind, dEndurance, twoHanding, upgradeLevel, lockedClass, objective,
      );
      if (!best) continue;
      if (pureOnly && damageTypeCount(best, upgradeLevel, twoHanding) > 1) continue;
      if (archetype !== 'any' && dominantAttribute(best, upgradeLevel, twoHanding) !== archetype) continue;

      results.push(best);
      if (results.length >= SHOWN) {
        results.sort((a, b) => b.objectiveTotal - a.objectiveTotal);
        results.length = SHOWN;
        cutoff = results[SHOWN - 1].objectiveTotal;
      }
    }

    return results.sort((a, b) => b.objectiveTotal - a.objectiveTotal).slice(0, SHOWN);
  }, [rankedBounds, dTargetLevel, dVigor, dMind, dEndurance, twoHanding, upgradeLevel, affinity, weaponType, lockedClass, dSearch, objective, pureOnly, archetype, infusionMode]);

  const top = candidates[0];
  const pointsUsed = vigor + mind + endurance;
  const totalPoints = targetLevel + 79;
  const anyUnverified = candidates.some((c) => !c.verified);

  return (
    <div className="browse">
      <div className="controls">
        <div className="control-group">
          <span className="control-title">Target level</span>
          <input
            className="level-input"
            type="number"
            min={1}
            max={713}
            value={targetLevel}
            onChange={(e) => setTargetLevel(Math.max(1, Math.min(713, Number(e.target.value) || 1)))}
          />
          <span className="control-hint">{totalPoints} points total</span>
        </div>

        <div className="control-group">
          <span className="control-title">Reserved for survival</span>
          <div className="attr-inputs">
            {([['VIG', vigor, setVigor], ['MND', mind, setMind], ['END', endurance, setEndurance]] as const).map(
              ([label, value, set]) => (
                <label className="attr-input" key={label}>
                  <span>{label}</span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={value}
                    onChange={(e) => set(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                  />
                </label>
              ),
            )}
          </div>
          <span className="control-hint">{pointsUsed} points held back</span>
        </div>

        <div className="control-group">
          <span className="control-title">
            Upgrade <span className="control-hint">+{upgradeLevel}</span>
          </span>
          <input
            className="slider"
            type="range"
            min={0}
            max={25}
            value={upgradeLevel}
            onChange={(e) => setUpgradeLevel(Number(e.target.value))}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={twoHanding}
              onChange={(e) => setTwoHanding(e.target.checked)}
            />
            <span>Two-handing</span>
          </label>
        </div>
      </div>

      <div className="filters">
        <input
          className="search"
          type="search"
          placeholder="Restrict to weapons matching…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <label className="select">
          <span>Maximise</span>
          <select
            value={objective}
            onChange={(e) => setObjective(e.target.value as Objective)}
          >
            {(Object.keys(OBJECTIVE_LABELS) as Objective[]).map((o) => (
              <option key={o} value={o}>{OBJECTIVE_LABELS[o]}</option>
            ))}
          </select>
        </label>

        <label className="select">
          <span>Build around</span>
          <select
            value={archetype}
            onChange={(e) => setArchetype(e.target.value as keyof Attributes | 'any')}
          >
            <option value="any">Any stat</option>
            <option value="str">Strength</option>
            <option value="dex">Dexterity</option>
            <option value="int">Intelligence</option>
            <option value="fai">Faith</option>
            <option value="arc">Arcane</option>
          </select>
        </label>

        <label className="select">
          <span>Infusion</span>
          <select
            value={infusionMode}
            onChange={(e) => setInfusionMode(e.target.value as 'any' | 'none')}
          >
            <option value="any">Any — will re-infuse</option>
            <option value="none">No infusion needed</option>
          </select>
        </label>

        <label className="select">
          <span>Starting class</span>
          <select value={lockedClass} onChange={(e) => setLockedClass(e.target.value)}>
            <option value="best">Best for each weapon</option>
            {classList.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={pureOnly}
            onChange={(e) => setPureOnly(e.target.checked)}
          />
          <span>Pure damage only</span>
        </label>

        <label className="select">
          <span>Affinity</span>
          <select
            value={String(affinity)}
            onChange={(e) => setAffinity(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All</option>
            {Object.entries(AFFINITY_NAMES)
              .filter(([id]) => Number(id) >= 0)
              .map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>

        <label className="select">
          <span>Category</span>
          <select
            value={String(weaponType)}
            onChange={(e) => setWeaponType(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All</option>
            {weaponTypes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>

      {top && <BestBuild candidate={top} upgradeLevel={upgradeLevel} twoHanding={twoHanding}
                         vigor={vigor} mind={mind} endurance={endurance} objective={objective} />}

      {candidates.length === 0 && (
        <p className="empty">
          No build is possible at level {targetLevel} with {pointsUsed} points reserved.
          Lower your VIG/MND/END, or raise the target level.
        </p>
      )}

      {candidates.length > 1 && (
        <>
          <h3 className="section">Next best options</h3>
          {/* tabIndex makes the scroll area reachable by keyboard, not just by mouse. */}
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Alternative builds">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Weapon</th>
                  <th>Infusion</th>
                  <th>Class</th>
                  <th className="num">{objective === 'attack' ? 'Attack' : 'Buildup'}</th>
                  <th className="num">Split</th>
                  <th className="num">Optimal spread</th>
                </tr>
              </thead>
              <tbody>
                {candidates.slice(1).map((c) => (
                  <tr key={`${c.weapon.name}-${c.classId}`}>
                    <td>
                      {c.weapon.url ? (
                        <a href={c.weapon.url} target="_blank" rel="noreferrer noopener">{c.weapon.name}</a>
                      ) : c.weapon.name}
                      {c.weapon.dlc && <span className="tag">DLC</span>}
                    </td>
                    <td className="dim small" data-label="Infusion">
                      {infusionRequirement(c.weapon.affinityId).needsInfusion
                        ? AFFINITY_NAMES[c.weapon.affinityId]
                        : '—'}
                    </td>
                    <td className="dim" data-label="Class">{c.className}</td>
                    <td className="num strong" data-label="Score">{Math.floor(c.objectiveTotal)}</td>
                    <td className="num dim small" data-label="Split">
                      {splitLabel(c, upgradeLevel, twoHanding)}
                    </td>
                    <td className="num dim small" data-label="Spread">
                      {ATTRIBUTE_LABELS.map(([k, l]) => `${l} ${c.attributes[k]}`).join('  ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="footnote">
        <strong>These allocations are provably optimal, not guesses.</strong> Because each
        attribute contributes to attack power independently, the best spread can be solved
        exactly with dynamic programming. <code>npm run verify</code> checks the solver against
        brute force over every possible allocation, and every answer is re-run through the
        attack calculator before being shown.
        {anyUnverified && ' (Warning: some results failed that re-check.)'}
        <br /><br />
        <strong>Infusion column.</strong> A value there means the weapon is not in that state
        when you find it — you have to apply an Ash of War with that affinity to get these
        numbers. A dash means it is as-found, or a unique weapon that cannot be infused at all.
        Set Infusion to "No infusion needed" to rank only weapons you can use straight away.
        <br /><br />
        <strong>Read the Split column before trusting the ranking.</strong> Total attack power
        adds the damage types together, which flatters split-damage weapons. A weapon dealing
        500 physical + 400 fire shows a higher total than one dealing 800 pure physical, but
        will usually do less real damage, because the target reduces each damage type
        separately with its own defence and negation. Weapons marked <em>pure</em> put all
        their attack into one type. This tool does not model enemy defences, so it cannot
        rank the two fairly — that is a genuine limitation, not an oversight.
        <br /><br />
        <strong>Also not accounted for:</strong> talismans, weapon skills and Ashes of War,
        spell scaling, status buildup as a goal, equip load, physick tears, buffs, or how a
        weapon actually feels to swing. It maximises raw attack power on one weapon — a real
        question, but not the only one.
      </p>
    </div>
  );
}

function BestBuild({
  candidate, upgradeLevel, twoHanding, vigor, mind, endurance, objective,
}: {
  candidate: Candidate;
  upgradeLevel: number;
  twoHanding: boolean;
  vigor: number;
  mind: number;
  endurance: number;
  objective: Objective;
}) {
  const { weapon, attributes, total, objectiveTotal, className } = candidate;
  const infusion = infusionRequirement(weapon.affinityId);
  const result = getWeaponAttack({ weapon, attributes, upgradeLevel, twoHanding });
  const level = result.upgradeLevel;

  const damage = allDamageTypes
    .map((t) => [t, result.attackPower[t] ?? 0] as const)
    .filter(([, v]) => v > 0);

  const scalingAtLevel = weapon.attributeScaling[level];
  const grades = allAttributes
    .map((a) => [a, scalingGrade(scalingAtLevel[a] ?? 0, weapon.scalingTiers)] as const)
    .filter(([, g]) => g);

  return (
    <div className="best-build">
      <div className="best-head">
        <div>
          <span className="best-eyebrow">Optimal build · {className}</span>
          <h2>
            {weapon.url ? (
              <a href={weapon.url} target="_blank" rel="noreferrer noopener">{weapon.name}</a>
            ) : weapon.name}{' '}
            <span className="at-level">+{level}{twoHanding ? ', two-handed' : ', one-handed'}</span>
          </h2>
        </div>
        <div className="ar-total">
          <span className="ar-value">{Math.floor(objectiveTotal)}</span>
          <span className="ar-label">{OBJECTIVE_LABELS[objective].toUpperCase()}</span>
        </div>
      </div>

      <p className={infusion.needsInfusion ? 'infusion-note required' : 'infusion-note'}>
        <strong>{infusion.label}.</strong> {infusion.detail}
      </p>

      {objective !== 'attack' && !objectiveScalesWithStats(objective) && (
        <p className="infusion-note">
          <strong>Buildup is fixed.</strong> {OBJECTIVE_LABELS[objective]} does not scale with any
          attribute in vanilla, so no allocation changes it. The spread below maximises attack
          power among the builds that reach this buildup.
        </p>
      )}

      {objective !== 'attack' && (
        <p className="infusion-note">
          <strong>Attack power {Math.floor(total)}.</strong> Shown for reference — it is not what
          this ranking is sorted by.
        </p>
      )}

      <div className="spread">
        {([['VIG', vigor], ['MND', mind], ['END', endurance]] as const).map(([label, value]) => (
          <div className="stat reserved" key={label}>
            <span className="stat-value">{value}</span>
            <span className="stat-name">{label}</span>
          </div>
        ))}
        {ATTRIBUTE_LABELS.map(([key, label]) => (
          <div className="stat" key={key}>
            <span className="stat-value">{attributes[key]}</span>
            <span className="stat-name">{label}</span>
          </div>
        ))}
      </div>

      <div className="ar-breakdown wide">
        {damage.map(([type, value]) => (
          <div className="ar-part" key={type}>
            <span>{ATTACK_POWER_LABELS[type]}</span>
            <span>{Math.floor(value)}</span>
          </div>
        ))}
        {grades.length > 0 && (
          <div className="ar-part scaling">
            <span>Scaling</span>
            <span>{grades.map(([a, g]) => `${a.toUpperCase()} ${g}`).join('  ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
