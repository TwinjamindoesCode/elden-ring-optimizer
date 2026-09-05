/**
 * Converts the raw fanapis dumps in data/raw/ into clean, typed data in src/data/.
 *
 * Run it with:  npm run convert
 *
 * It is safe to run this as many times as you like — it always rebuilds
 * src/data/ from scratch, so nothing can get into a half-converted state.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = 'data/raw';
const OUT = 'src/data';

const warnings = [];
const warn = (msg) => warnings.push(msg);

const readRaw = (name) => JSON.parse(readFileSync(join(RAW, `${name}.json`), 'utf8'));

/**
 * Items missing from the downloaded dumps, supplied by hand in data/patches.json.
 * Each patched entry keeps its own id (the key) instead of being slugified.
 */
const patches = JSON.parse(readFileSync('data/patches.json', 'utf8'));

const patchesFor = (table) =>
  Object.entries(patches[table] ?? {}).map(([id, raw]) => ({ ...raw, __patchId: id }));

/** "Astrologer's Staff" -> "astrologers-staff" */
const slugify = (name) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Turns [{name:'Phy',amount:113}] into {physical:113, magic:0, ...} */
const damageSet = (arr, keyMap) => {
  const out = { physical: 0, magic: 0, fire: 0, lightning: 0, holy: 0 };
  for (const entry of arr ?? []) {
    const key = keyMap[entry.name];
    if (key && key in out) out[key] = Number(entry.amount) || 0;
  }
  return out;
};

const ATTACK_KEYS = { Phy: 'physical', Mag: 'magic', Fire: 'fire', Ligt: 'lightning', Holy: 'holy' };

/** Requirements/scaling use short names in the raw data. */
const ATTR_KEYS = {
  Str: 'strength', Dex: 'dexterity', Int: 'intelligence', Fai: 'faith', Arc: 'arcane',
  Strength: 'strength', Dexterity: 'dexterity', Intelligence: 'intelligence', Faith: 'faith', Arcane: 'arcane',
};

const emptyRequirements = () => ({ strength: 0, dexterity: 0, intelligence: 0, faith: 0, arcane: 0 });

const requirementSet = (arr) => {
  const out = emptyRequirements();
  for (const entry of arr ?? []) {
    const key = ATTR_KEYS[entry.name];
    if (key) out[key] = Number(entry.amount) || 0;
  }
  return out;
};

/**
 * The raw dump only gives letter grades. That is fine — these are for display.
 * The real numbers used for attack-power maths come from the regulation data
 * and live in src/calculator/, so nothing here needs to be estimated.
 */
const VALID_GRADES = new Set(['S', 'A', 'B', 'C', 'D', 'E']);

const scalingSet = (arr, itemName) => {
  const out = {};
  for (const entry of arr ?? []) {
    const key = ATTR_KEYS[entry.name];
    const grade = String(entry.scaling ?? '').trim().toUpperCase();
    if (!key) continue;
    // The dump contains "", "-" and "?" for "no scaling / unknown". Skip those.
    if (!VALID_GRADES.has(grade)) {
      if (grade && grade !== '-') warn(`${itemName}: unreadable scaling grade "${entry.scaling}" for ${key}`);
      continue;
    }
    out[key] = { grade };
  }
  return out;
};

const guardStats = (defence, { canParry, blocksAllPhysical }) => {
  const negation = damageSet(defence, ATTACK_KEYS);
  const boost = (defence ?? []).find((d) => d.name === 'Boost');
  return {
    negation,
    stability: Number(boost?.amount) || 0,
    canParry,
    blocksAllPhysical,
  };
};

const criticalOf = (attack) =>
  Number((attack ?? []).find((a) => a.name === 'Crit')?.amount) || 100;

/** Guarantees every item gets a unique id even if two share a name. */
const makeUniqueId = (seen, base, itemName, kind) => {
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  let n = 2;
  while (seen.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`;
  seen.add(id);
  warn(`${kind}: duplicate name "${itemName}" — second copy stored as id "${id}"`);
  return id;
};

const baseEntity = (raw, id, category) => ({
  id,
  name: raw.name,
  category,
  description: raw.description?.trim() || undefined,
  imageUrl: raw.image ?? null,
  sourceId: raw.id,
});

/* ------------------------------------------------------------------ */
/* Weapons                                                             */
/* ------------------------------------------------------------------ */

const convertWeapons = () => {
  const seen = new Set();
  const out = {};
  for (const raw of readRaw('weapons')) {
    const id = makeUniqueId(seen, slugify(raw.name), raw.name, 'weapon');
    const weaponClass = raw.category ?? 'Unknown';

    const weapon = {
      ...baseEntity(raw, id, 'weapon'),
      weaponClass,
      weight: Number(raw.weight) || 0,
      requirements: requirementSet(raw.requiredAttributes),
      scaling: scalingSet(raw.scalesWith, raw.name),
      attack: damageSet(raw.attack, ATTACK_KEYS),
      criticalMultiplier: criticalOf(raw.attack),
      statusBuildup: {},
      guard: guardStats(raw.defence, { canParry: false, blocksAllPhysical: false }),
      upgrade: { path: 'standard', level: 0, maxLevel: 25 },
      affinity: 'standard',
      skill: null,
      twoHandable: true,
    };

    if (weaponClass === 'Glintstone Staff') {
      weapon.catalyst = { school: 'sorcery', scalingStat: 'intelligence' };
    } else if (weaponClass === 'Sacred Seal') {
      weapon.catalyst = { school: 'incantation', scalingStat: 'faith' };
    }

    const AMMO = { Bow: 'arrow', 'Light Bow': 'arrow', Greatbow: 'greatarrow', Crossbow: 'bolt', Ballista: 'greatbolt' };
    if (AMMO[weaponClass]) weapon.ammunitionType = AMMO[weaponClass];

    out[id] = weapon;
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Shields                                                             */
/* ------------------------------------------------------------------ */

const SHIELD_CLASS = {
  'Small Shield': 'Small Shield',
  'Small Shields': 'Small Shield',
  'Medium Shield': 'Medium Shield',
  Greatshield: 'Greatshield',
};

const convertShields = () => {
  const seen = new Set();
  const out = {};
  for (const raw of readRaw('shields')) {
    const id = makeUniqueId(seen, slugify(raw.name), raw.name, 'shield');
    let shieldClass = SHIELD_CLASS[raw.category];
    if (!shieldClass) {
      shieldClass = 'Medium Shield';
      warn(`shield "${raw.name}": missing/unknown category "${raw.category}" — defaulted to Medium Shield`);
    }
    const negation = damageSet(raw.defence, ATTACK_KEYS);
    out[id] = {
      ...baseEntity(raw, id, 'shield'),
      weaponClass: shieldClass,
      shieldClass,
      weight: Number(raw.weight) || 0,
      requirements: requirementSet(raw.requiredAttributes),
      scaling: scalingSet(raw.scalesWith, raw.name),
      attack: damageSet(raw.attack, ATTACK_KEYS),
      criticalMultiplier: criticalOf(raw.attack),
      statusBuildup: {},
      guard: guardStats(raw.defence, {
        canParry: shieldClass !== 'Greatshield',
        blocksAllPhysical: negation.physical >= 100,
      }),
      upgrade: { path: 'standard', level: 0, maxLevel: 25 },
      affinity: 'standard',
      skill: null,
      twoHandable: true,
    };
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Armor                                                               */
/* ------------------------------------------------------------------ */

const ARMOR_SLOT = {
  Helm: 'head',
  'Chest Armor': 'chest',
  Gauntlets: 'hands',
  Gauntlet: 'hands',
  'Leg Armor': 'legs',
};

const NEGATION_KEYS = {
  Phy: 'physical', Strike: 'strike', Slash: 'slash', Pierce: 'pierce',
  Magic: 'magic', Fire: 'fire', Ligt: 'lightning', Holy: 'holy',
};

const convertArmors = () => {
  const seen = new Set();
  const out = {};
  for (const raw of [...readRaw('armors'), ...patchesFor('armors')]) {
    const slot = ARMOR_SLOT[raw.category];
    if (!slot) {
      warn(`armor "${raw.name}": unknown category "${raw.category}" — skipped`);
      continue;
    }
    const id = raw.__patchId ?? makeUniqueId(seen, slugify(raw.name), raw.name, 'armor');
    if (raw.needsVerification) warn(`armor "${raw.name}": hand-entered patch — verify its stats against a wiki`);

    const damageNegation = { standard: 0, strike: 0, slash: 0, pierce: 0, physical: 0, magic: 0, fire: 0, lightning: 0, holy: 0 };
    for (const entry of raw.dmgNegation ?? []) {
      const key = NEGATION_KEYS[entry.name];
      if (key) damageNegation[key] = Number(entry.amount) || 0;
    }
    damageNegation.standard = damageNegation.physical;

    const resistance = {};
    let poise = 0;
    for (const entry of raw.resistance ?? []) {
      const amount = Number(entry.amount) || 0;
      if (entry.name === 'Poise') poise = amount;
      else if (['Immunity', 'Robustness', 'Focus', 'Vitality'].includes(entry.name)) {
        resistance[entry.name.toLowerCase()] = amount;
      }
    }

    out[id] = {
      ...baseEntity(raw, id, 'armor'),
      slot,
      weight: Number(raw.weight) || 0,
      damageNegation,
      resistance,
      poise,
    };
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Talismans                                                           */
/* ------------------------------------------------------------------ */

const convertTalismans = () => {
  const seen = new Set();
  const out = {};
  for (const raw of readRaw('talismans')) {
    const id = makeUniqueId(seen, slugify(raw.name), raw.name, 'talisman');
    out[id] = {
      ...baseEntity(raw, id, 'talisman'),
      // The dump has no talisman weights. 0 keeps equip-load math from breaking;
      // fill these in later if you want exact numbers.
      weight: 0,
      effectText: raw.effect?.trim() || '',
      // Effects stay empty until they are hand-written as StatModifiers.
      // The optimizer ignores a talisman with no effects rather than guessing.
      effects: [],
    };
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Spells                                                              */
/* ------------------------------------------------------------------ */

const convertSpells = (fileName, category, defaultCatalyst) => {
  const seen = new Set();
  const out = {};
  for (const raw of [...readRaw(fileName), ...patchesFor(fileName)]) {
    const id = raw.__patchId ?? makeUniqueId(seen, slugify(raw.name), raw.name, category);
    const requirements = requirementSet(raw.requires);
    if (!raw.requires) warn(`${category} "${raw.name}": no requirements listed in raw data — stored as all zeroes`);
    if (raw.needsVerification) warn(`${category} "${raw.name}": hand-entered patch — verify its stats against a wiki`);

    const spell = {
      ...baseEntity(raw, id, category),
      requirements,
      fpCost: Number(raw.cost) || 0,
      memorySlots: Number(raw.slots) || 1,
      effectText: raw.effects?.trim() || '',
      damageTypes: [],
      statusBuildup: {},
      requiredCatalyst: defaultCatalyst,
    };

    if (category === 'incantation' && requirements.arcane > 0) {
      spell.isDragonCommunion = true;
    }
    out[id] = spell;
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Classes                                                             */
/* ------------------------------------------------------------------ */

const BASE_CLASSES = [
  'Vagabond', 'Warrior', 'Hero', 'Bandit', 'Astrologer',
  'Prophet', 'Samurai', 'Prisoner', 'Confessor', 'Wretch',
];

const ATTRIBUTES = ['vigor', 'mind', 'endurance', 'strength', 'dexterity', 'intelligence', 'faith', 'arcane'];

const convertClasses = (tables) => {
  const startingEquipment = JSON.parse(readFileSync('data/starting-equipment.json', 'utf8'));
  const out = {};

  /** Looks an id up in a real table so a typo becomes a warning, not a silent bug. */
  const ref = (id, table, tableName, className) => {
    if (!id) return null;
    const item = tables[table][id];
    if (!item) {
      warn(`${className}: starting ${tableName} "${id}" not found in ${table} — stored as unresolved`);
      return { id, name: id, category: tableName, unresolved: true };
    }
    return { id: item.id, name: item.name, category: item.category };
  };

  for (const raw of readRaw('classes')) {
    if (!BASE_CLASSES.includes(raw.name)) continue;
    const id = slugify(raw.name);
    if (out[id]) continue; // the raw dump lists Warrior twice

    const stats = {};
    for (const attr of ATTRIBUTES) stats[attr] = Number(raw.stats[attr]) || 0;
    const total = ATTRIBUTES.reduce((sum, a) => sum + stats[a], 0);
    const level = Number(raw.stats.level) || 0;

    // In Elden Ring, level always equals (sum of attributes - 79). Catches bad data.
    if (total - 79 !== level) {
      warn(`class "${raw.name}": level ${level} does not match attribute total ${total} (expected level ${total - 79})`);
    }

    const gear = startingEquipment[id];
    if (!gear) {
      warn(`class "${raw.name}": no starting equipment defined in data/starting-equipment.json`);
      continue;
    }

    out[id] = {
      ...baseEntity(raw, id, 'class'),
      startingLevel: level,
      stats,
      totalAttributePoints: total,
      isBaseClass: true,
      startingEquipment: {
        rightHand: gear.rightHand.map((w) => ref(w, 'weapons', 'weapon', raw.name)),
        leftHand: gear.leftHand.map((w) => ref(w, 'weapons', 'weapon', raw.name)),
        shields: gear.shields.map((s) => ref(s, 'shields', 'shield', raw.name)),
        armor: {
          head: ref(gear.armor.head, 'armors', 'armor', raw.name),
          chest: ref(gear.armor.chest, 'armors', 'armor', raw.name),
          hands: ref(gear.armor.hands, 'armors', 'armor', raw.name),
          legs: ref(gear.armor.legs, 'armors', 'armor', raw.name),
        },
        sorceries: gear.sorceries.map((s) => ref(s, 'sorceries', 'sorcery', raw.name)),
        incantations: gear.incantations.map((s) => ref(s, 'incantations', 'incantation', raw.name)),
        talismans: [],
        ammunition: gear.ammunition.map((a) => ({
          ref: { id: a.id, name: a.name, category: 'weapon' },
          quantity: a.quantity,
        })),
        keepsake: null,
      },
    };
  }

  const missing = BASE_CLASSES.filter((n) => !out[slugify(n)]);
  if (missing.length) warn(`missing base classes: ${missing.join(', ')}`);

  return out;
};

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const tables = {
  weapons: convertWeapons(),
  shields: convertShields(),
  armors: convertArmors(),
  talismans: convertTalismans(),
  sorceries: convertSpells('sorceries', 'sorcery', 'glintstone-staff'),
  incantations: convertSpells('incantations', 'incantation', 'sacred-seal'),
};
tables.classes = convertClasses(tables);

mkdirSync(OUT, { recursive: true });
for (const [name, table] of Object.entries(tables)) {
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify(table, null, 2));
  console.log(`  ${name.padEnd(13)} ${String(Object.keys(table).length).padStart(4)} items`);
}

// The exact attack-power data (extracted from the game by the MIT-licensed
// elden-ring-weapon-calculator project) is copied through untouched — the
// calculator in src/calculator/ decodes it at runtime.
const REGULATION = 'regulation-vanilla-v1.17.json';
const regulation = JSON.parse(readFileSync(join(RAW, REGULATION), 'utf8'));
writeFileSync(join(OUT, 'regulation.json'), JSON.stringify(regulation));
console.log(`  ${'regulation'.padEnd(13)} ${String(regulation.weapons.length).padStart(4)} weapon variants (exact attack data)`);

// Cross-check: how many of our weapons have exact data available?
const normalize = (s) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '');
const exactNames = new Set(regulation.weapons.map((w) => normalize(w.weaponName)));
const noExactData = Object.values(tables.weapons)
  .filter((w) => !exactNames.has(normalize(w.name)))
  .map((w) => w.name);
if (noExactData.length) {
  warn(`${noExactData.length} weapon(s) have no exact attack data: ${noExactData.join(', ')}`);
}

console.log('');
if (warnings.length) {
  console.log(`${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
} else {
  console.log('No warnings. Everything converted cleanly.');
}
console.log('\nDone. Clean data written to src/data/');
