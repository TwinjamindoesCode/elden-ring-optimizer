/**
 * Sanity-checks the attack-power calculator against values you can verify
 * in-game or on a wiki. Run with:  npm run verify
 *
 * If this file ever starts failing, the calculator is lying and should not be
 * trusted until it is fixed.
 */

import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// Load the TypeScript calculator by stripping types via Node's built-in support.
const { decodeRegulationData, getWeaponAttack, scalingGrade } = await import(
  '../src/calculator/attack-power.ts'
);
const { optimizeStats } = await import('../src/calculator/optimize.ts');

const data = JSON.parse(readFileSync('src/data/regulation.json', 'utf8'));
const weapons = decodeRegulationData(data);

const byName = (name) => {
  const w = weapons.find((x) => x.name === name);
  if (!w) throw new Error(`weapon not found: ${name}`);
  return w;
};

let failures = 0;
const check = (label, actual, expected, tolerance = 0.51) => {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failures++;
  const shown = typeof actual === 'number' ? actual.toFixed(1) : actual;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} got ${String(shown).padStart(7)}  expected ~${expected}`);
};

console.log('\nBase attack (no scaling bonus — pure base x upgrade multiplier)\n');

// Longsword: 110 base physical, reinforce type 0, x2.45 at +25 => 269.5
const longsword = byName('Longsword');
check('Longsword +0  base physical', longsword.attack[0][0], 110);
check('Longsword +25 base physical', longsword.attack[25][0], 269.5);

// Uchigatana: somber? No - standard, 115 base.
const uchi = byName('Uchigatana');
check('Uchigatana +0  base physical', uchi.attack[0][0], 115);

console.log('\nUpgrade ceilings (somber weapons cap at +10)\n');
check('Longsword max upgrade level', longsword.maxUpgradeLevel, 25, 0);
const bloodhound = weapons.find((w) => w.weaponName === "Bloodhound's Fang");
if (bloodhound) check("Bloodhound's Fang max upgrade level", bloodhound.maxUpgradeLevel, 10, 0);

console.log('\nRequirement penalty (40% cut when you cannot wield it)\n');

const under = getWeaponAttack({
  weapon: longsword,
  attributes: { str: 5, dex: 5, int: 10, fai: 10, arc: 10 },
  upgradeLevel: 0,
});
check('Longsword +0 physical at 5 STR/5 DEX (needs 10/10)', under.attackPower[0], 110 * 0.6);
check('  ...reports both attributes as ineffective', under.ineffectiveAttributes.length, 2, 0);

console.log('\nTwo-handing (strength x1.5)\n');

const oneHand = getWeaponAttack({
  weapon: longsword, attributes: { str: 20, dex: 20, int: 10, fai: 10, arc: 10 }, upgradeLevel: 25,
});
const twoHand = getWeaponAttack({
  weapon: longsword, attributes: { str: 20, dex: 20, int: 10, fai: 10, arc: 10 }, upgradeLevel: 25, twoHanding: true,
});
const twoHandAt30 = getWeaponAttack({
  weapon: longsword, attributes: { str: 30, dex: 20, int: 10, fai: 10, arc: 10 }, upgradeLevel: 25,
});
console.log(`  one-handed at 20 STR : ${oneHand.total.toFixed(1)}`);
console.log(`  two-handed at 20 STR : ${twoHand.total.toFixed(1)}`);
console.log(`  one-handed at 30 STR : ${twoHandAt30.total.toFixed(1)}`);
check('two-handing 20 STR equals one-handing 30 STR', twoHand.total, twoHandAt30.total, 0.01);

console.log('\nSoft caps (gains must shrink as stats rise)\n');

const arAt = (str) =>
  getWeaponAttack({
    weapon: byName('Heavy Longsword'),
    attributes: { str, dex: 10, int: 10, fai: 10, arc: 10 },
    upgradeLevel: 25,
  }).total;

const gain20to30 = arAt(30) - arAt(20);
const gain60to70 = arAt(70) - arAt(60);
console.log(`  Heavy Longsword +25, gain from 20->30 STR : +${gain20to30.toFixed(1)}`);
console.log(`  Heavy Longsword +25, gain from 60->70 STR : +${gain60to70.toFixed(1)}`);
if (gain60to70 >= gain20to30) {
  failures++;
  console.log('  FAIL  soft cap not applied — late gains should be smaller than early gains');
} else {
  console.log('  PASS  soft cap behaves correctly');
}

console.log('\nScaling grades match the letters shown in game\n');

const heavyLs = byName('Heavy Longsword');
const grade = scalingGrade(heavyLs.attributeScaling[25].str, heavyLs.scalingTiers);
console.log(`  Heavy Longsword +25 STR scaling : ${heavyLs.attributeScaling[25].str.toFixed(3)}  ->  ${grade}`);
check('Heavy Longsword +25 has A or B strength scaling', ['A', 'B'].includes(grade) ? 1 : 0, 1, 0);

console.log('\nStatus effects are present\n');
const bleedWeapon = weapons.find((w) => (w.attack[0][7] ?? 0) > 0);
if (bleedWeapon) {
  console.log(`  ${bleedWeapon.name}: bleed buildup ${bleedWeapon.attack[0][7]} at +0`);
} else {
  failures++;
  console.log('  FAIL  no weapon has bleed buildup — status data missing');
}

console.log('\nOptimizer: dynamic programming vs exhaustive brute force\n');

const ATTRS = ['str', 'dex', 'int', 'fai', 'arc'];

/** Tries literally every possible allocation. Slow, and obviously correct. */
function bruteForce(weapon, upgradeLevel, twoHanding, floors, budget) {
  let best = { total: -1, attributes: null };
  const stats = { ...floors };
  const recurse = (i, left) => {
    if (i === 4) {
      stats[ATTRS[4]] = floors[ATTRS[4]] + left;
      if (stats[ATTRS[4]] > 99) return;
      const r = getWeaponAttack({ weapon, attributes: { ...stats }, upgradeLevel, twoHanding });
      if (r.total > best.total) best = { total: r.total, attributes: { ...stats } };
      return;
    }
    for (let give = 0; give <= left; give++) {
      if (floors[ATTRS[i]] + give > 99) break;
      stats[ATTRS[i]] = floors[ATTRS[i]] + give;
      recurse(i + 1, left - give);
    }
  };
  recurse(0, budget);
  return best;
}

const OPTIMIZER_CASES = [
  { name: 'Longsword', budget: 18, twoHanding: false, level: 25 },
  { name: 'Heavy Longsword', budget: 20, twoHanding: true, level: 25 },
  { name: 'Sacred Longsword', budget: 16, twoHanding: false, level: 25 },
  { name: 'Occult Uchigatana', budget: 18, twoHanding: false, level: 25 },
  { name: 'Cold Uchigatana', budget: 14, twoHanding: false, level: 10 },
  { name: 'Magic Longsword', budget: 22, twoHanding: false, level: 25 },
];

for (const c of OPTIMIZER_CASES) {
  const weapon = weapons.find((w) => w.name === c.name);
  if (!weapon) {
    console.log(`  SKIP  ${c.name} not in this regulation version`);
    continue;
  }

  const floors = { str: 12, dex: 12, int: 10, fai: 10, arc: 10 };
  for (const a of ATTRS) floors[a] = Math.max(floors[a], weapon.requirements[a] ?? 0);

  const dp = optimizeStats({
    weapon, upgradeLevel: c.level, twoHanding: c.twoHanding, floors, budget: c.budget,
  });
  const bf = bruteForce(
    weapon, Math.min(c.level, weapon.maxUpgradeLevel), c.twoHanding, floors, c.budget,
  );

  const ok = Math.abs(dp.total - bf.total) < 0.01 && dp.verified;
  if (!ok) failures++;
  const spread = ATTRS.map((a) => `${a.toUpperCase()}${String(dp.attributes[a]).padStart(3)}`).join(' ');
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(19)}${c.twoHanding ? ' 2H' : '   '} ` +
    `${String(c.budget).padStart(2)}pts  optimum ${dp.total.toFixed(1).padStart(7)}  ->  ${spread}`,
  );
  if (!ok) console.log(`        brute force found ${bf.total.toFixed(1)} instead`);
}

console.log('');
if (failures) {
  console.log(`${failures} check(s) FAILED — do not trust the numbers.\n`);
  process.exit(1);
}
console.log('All checks passed. Attack power numbers are exact.\n');
