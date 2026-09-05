/**
 * Converts the Ash of War params into src/data/ashes.json.
 *
 * Run with:  npm run ashes
 *
 * Inputs (extracted from a vanilla 1.17 regulation.bin with WitchyBND):
 *   data/raw/params/EquipParamGem.xml     — the Ash of War items themselves
 *   data/raw/params/SwordArtsParam.xml    — the skills they grant
 *
 * The important subtlety
 * ----------------------
 * WitchyBND omits any attribute whose value equals the paramdef default, and
 * every `configurableWepAttr` field defaults to 1. So a MISSING key means the
 * affinity is ALLOWED, not forbidden. Reading it the naive way inverts the
 * whole dataset — verified against Lion's Claw, Poisonous Mist and Chilling
 * Mist, whose decoded affinities match the game exactly.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const RAW = 'data/raw/params';
const OUT = 'src/data/ashes.json';

const warnings = [];
const warn = (m) => warnings.push(m);

/** Reads a param XML into rows, applying paramdef defaults for omitted fields. */
function readParam(file) {
  const raw = readFileSync(`${RAW}/${file}`, 'utf8');

  const defaults = {};
  for (const m of raw.matchAll(/<field name="([^"]+)"[^>]*?defaultValue="([^"]*)"/g)) {
    defaults[m[1]] = m[2];
  }

  const rows = [];
  for (const m of raw.matchAll(/<row ([^>]*?)\/>/g)) {
    const row = { ...defaults };
    for (const a of m[1].matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)) row[a[1]] = a[2];
    rows.push(row);
  }
  return { rows, defaults };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ */
/* Weapon class mapping                                                */
/* ------------------------------------------------------------------ */

/**
 * The gem param names weapon classes differently from WeaponType. This mapping
 * is written by hand and then checked against the regulation weapon list —
 * getting it wrong would silently hide valid builds, which is worse than not
 * having the feature.
 */
const MOUNT_TO_WEAPON_TYPE = {
  canMountWep_Dagger: 1,
  canMountWep_SwordNormal: 3,
  canMountWep_SwordLarge: 5,
  canMountWep_SwordGigantic: 7,
  canMountWep_SaberNormal: 9,
  canMountWep_SaberLarge: 11,
  canMountWep_katana: 13,
  canMountWep_SwordDoubleEdge: 14,
  canMountWep_SwordPierce: 15,
  canMountWep_RapierHeavy: 16,
  canMountWep_AxeNormal: 17,
  canMountWep_AxeLarge: 19,
  canMountWep_HammerNormal: 21,
  canMountWep_HammerLarge: 23,
  canMountWep_Flail: 24,
  canMountWep_SpearNormal: 25,
  canMountWep_SpearHeavy: 28,
  canMountWep_SpearAxe: 29,
  canMountWep_Sickle: 31,
  canMountWep_Knuckle: 35,
  canMountWep_Claw: 37,
  canMountWep_Whip: 39,
  canMountWep_AxhammerLarge: 41,
  canMountWep_BowSmall: 50,
  canMountWep_BowNormal: 51,
  canMountWep_BowLarge: 53,
  canMountWep_ClossBow: 55,
  canMountWep_Ballista: 56,
  canMountWep_Staff: 57,
  canMountWep_Sorcery: 59,
  canMountWep_Talisman: 61,
  canMountWep_ShieldSmall: 65,
  canMountWep_ShieldNormal: 67,
  canMountWep_ShieldLarge: 69,
  canMountWep_Torch: 87,
  canMountWep_HandToHand: 88,
  canMountWep_PerfumeBottle: 89,
  canMountWep_ThrustingShield: 90,
  canMountWep_ThrowingWeapon: 91,
  canMountWep_ReverseHandSword: 92,
  canMountWep_LightGreatsword: 93,
  canMountWep_GreatKatana: 94,
  canMountWep_BeastClaw: 95,
};

// canMountWep_SpearLarge has no distinct WeaponType — Great Spear is covered by
// SpearHeavy. Left unmapped deliberately rather than guessed at.
const UNMAPPED_MOUNTS = ['canMountWep_SpearLarge'];

const AFFINITY_COUNT = 13;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const { rows: gemRows } = readParam('EquipParamGem.xml');
const { rows: artsRows } = readParam('SwordArtsParam.xml');

const artsById = new Map();
for (const r of artsRows) {
  if (r.paramdexName && r.paramdexName !== '%null%') artsById.set(num(r.id), r);
}

/**
 * The gem param holds two different kinds of row under the same names. The low
 * ids are internal entries for skills weapons ship with — they all report
 * Standard affinity and mount on 35 classes, which is not what the item does.
 * The real, findable Ash of War items are the ones with sellValue 300, and
 * their defaults match the game: Seppuku is Blood, Chilling Mist is Cold,
 * Lion's Claw is Heavy on 15 weapon classes.
 *
 * Without this filter, 85 of 120 names come out duplicated and most of them
 * carry the wrong affinity.
 */
const REAL_ASH_SELL_VALUE = '300';

const ashes = [];
const seenNames = new Map();

for (const gem of gemRows) {
  const name = gem.paramdexName;
  if (!name || name === '%null%' || /^test gem/i.test(name)) continue;
  if (gem.sellValue !== REAL_ASH_SELL_VALUE) continue;

  // A few ashes have a second, higher-rarity duplicate row. Keep the first.
  if (seenNames.has(name)) continue;
  seenNames.set(name, true);

  // Affinities: a field set to "1" (explicitly or by default) is allowed.
  const affinities = [];
  for (let i = 0; i < AFFINITY_COUNT; i++) {
    const key = `configurableWepAttr${String(i).padStart(2, '0')}`;
    if (gem[key] === '1') affinities.push(i);
  }

  const mounts = [];
  for (const [field, weaponType] of Object.entries(MOUNT_TO_WEAPON_TYPE)) {
    if (gem[field] === '1') mounts.push(weaponType);
  }

  const arts = artsById.get(num(gem.swordArtsParamId));
  // FP cost lives in the right-hand-two-handed slot for almost every skill.
  const fp = arts ? Math.max(0, num(arts.useMagicPoint_L2)) : 0;

  ashes.push({
    id: num(gem.id),
    // Item names read "Ash of War: Lion's Claw"; the skill is the useful half.
    name: name.replace(/^Ash of War:\s*/, ''),
    itemName: name,
    skillId: num(gem.swordArtsParamId),
    skillName: arts?.paramdexName ?? null,
    fpCost: fp,
    defaultAffinity: num(gem.defaultWepAttr),
    affinities,
    weaponTypes: mounts,
  });
}

/* ------------------------------------------------------------------ */
/* Which (weapon class, affinity) pairs are actually achievable        */
/* ------------------------------------------------------------------ */

/** weaponType -> sorted affinity ids that at least one Ash can apply to it. */
const achievable = {};
for (const ash of ashes) {
  for (const wt of ash.weaponTypes) {
    const set = (achievable[wt] ??= new Set());
    for (const aff of ash.affinities) set.add(aff);
  }
}
const achievableOut = Object.fromEntries(
  Object.entries(achievable).map(([wt, set]) => [wt, [...set].sort((a, b) => a - b)]),
);

/* ------------------------------------------------------------------ */
/* Cross-check against the weapons we already ship                     */
/* ------------------------------------------------------------------ */

const regulation = JSON.parse(readFileSync('src/data/regulation.json', 'utf8'));

// Every infusible weapon in the regulation data appears once per affinity,
// generated mechanically. Comparing that against what Ashes can actually do
// tells us which of those variants cannot be created in game.
const impossible = [];
const seenPairs = new Set();
for (const w of regulation.weapons) {
  if (w.affinityId < 0) continue;            // unique weapons, cannot be infused
  if (w.affinityId === 0) continue;          // standard is the as-found state
  const key = `${w.weaponType}:${w.affinityId}`;
  if (seenPairs.has(key)) continue;
  seenPairs.add(key);
  if (!achievable[w.weaponType]?.has(w.affinityId)) {
    impossible.push({ weaponType: w.weaponType, affinityId: w.affinityId });
  }
}

const unmappedInUse = UNMAPPED_MOUNTS.filter((f) => gemRows.some((g) => g[f] === '1'));
if (unmappedInUse.length) {
  warn(`mount fields with no WeaponType mapping, ignored: ${unmappedInUse.join(', ')}`);
}
if (!ashes.length) warn('no ashes parsed — the param format may have changed');

writeFileSync(
  OUT,
  JSON.stringify({ ashes, achievableAffinities: achievableOut }, null, 2),
);

console.log(`  ashes                ${String(ashes.length).padStart(4)}`);
console.log(`  with a named skill   ${String(ashes.filter((a) => a.skillName).length).padStart(4)}`);
console.log(`  weapon classes       ${String(Object.keys(achievableOut).length).padStart(4)}`);
console.log(
  `  weapon/affinity pairs checked ${seenPairs.size}, of which NOT achievable in game: ${impossible.length}`,
);
console.log('');
if (warnings.length) {
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}
console.log(`Written to ${OUT}`);
