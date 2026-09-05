/**
 * Checks that share links round-trip exactly, survive tampering, and stay
 * forward compatible. Run with:  npm run verify:links
 *
 * A share link that silently decodes to a different build is worse than no
 * share feature at all, so this is checked rather than assumed.
 */

import { readFileSync } from 'node:fs';

const { encodeBuild, decodeBuild, buildShareUrl, SHARE_DEFAULTS } = await import(
  '../src/share/build-link.ts'
);
const { decodeRegulationData, getWeaponAttack } = await import(
  '../src/calculator/attack-power.ts'
);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const sample = {
  weaponName: 'Uchigatana',
  affinityId: 12,
  upgradeLevel: 25,
  targetLevel: 150,
  vigor: 60,
  mind: 20,
  endurance: 25,
  twoHanding: true,
  attributes: { str: 18, dex: 45, int: 9, fai: 8, arc: 55 },
  classId: 'bandit',
  objective: 'bleed',
  archetype: 'arc',
  infusionMode: 'any',
  pureOnly: false,
  weaponType: 'all',
  ashId: 'any',
  search: '',
};

console.log('\nRound trip\n');

const params = encodeBuild(sample);
const decoded = decodeBuild(params.toString());

check('weapon name survives', decoded.weaponName === sample.weaponName);
check('affinity survives', decoded.affinityId === sample.affinityId);
check('upgrade level survives', decoded.upgradeLevel === sample.upgradeLevel);
check('target level survives', decoded.targetLevel === sample.targetLevel);
check('reserved stats survive',
  decoded.vigor === sample.vigor && decoded.mind === sample.mind && decoded.endurance === sample.endurance);
check('two-handing survives', decoded.twoHanding === sample.twoHanding);
check('class survives', decoded.classId === sample.classId);
check('objective survives', decoded.objective === sample.objective);
check('archetype survives', decoded.archetype === sample.archetype);
check('stat allocation survives',
  JSON.stringify(decoded.attributes) === JSON.stringify(sample.attributes),
  JSON.stringify(decoded.attributes));
check('reports itself as a build link', decoded.hasBuild === true);

console.log('\nReadability\n');
const url = buildShareUrl(sample, 'https://softcapbuilds.com');
console.log(`  ${url}`);
check('under 200 characters', url.length < 200, `${url.length} chars`);
check('no base64 blob', !/[A-Za-z0-9+/]{40,}={0,2}/.test(url));
check('weapon name is readable in the URL', url.includes('w=Uchigatana'));

console.log('\nDefaults are omitted, not written\n');
const minimal = {
  ...sample,
  ...SHARE_DEFAULTS,
  weaponName: 'Longsword',
  affinityId: 0,
  attributes: { str: 40, dex: 40, int: 10, fai: 10, arc: 10 },
  classId: 'vagabond',
};
const minimalUrl = buildShareUrl(minimal, 'https://softcapbuilds.com');
console.log(`  ${minimalUrl}`);
check('default objective not written', !minimalUrl.includes('obj='));
check('default archetype not written', !minimalUrl.includes('arch='));
check('two-handing off not written', !minimalUrl.includes('2h='));

console.log('\nForward compatibility and tampering\n');

const withUnknown = decodeBuild(`${params.toString()}&futureField=whatever&another=3`);
check('unknown parameters ignored',
  withUnknown.weaponName === sample.weaponName && withUnknown.objective === sample.objective);

check('empty string decodes to defaults',
  decodeBuild('').targetLevel === SHARE_DEFAULTS.targetLevel && decodeBuild('').hasBuild === false);

check('garbage does not throw', (() => {
  try {
    decodeBuild('w=&aff=notanumber&lvl=abc&s=1-2&up=999&vig=-40');
    return true;
  } catch {
    return false;
  }
})());

const clamped = decodeBuild('lvl=99999&up=999&vig=-40&aff=99');
check('out-of-range values clamped',
  clamped.targetLevel === 713 && clamped.upgradeLevel === 25 && clamped.vigor === 1 && clamped.affinityId === 12,
  `lvl=${clamped.targetLevel} up=${clamped.upgradeLevel} vig=${clamped.vigor} aff=${clamped.affinityId}`);

const badStats = decodeBuild('w=Longsword&s=1-2');
check('malformed stat list rejected, not half-read', badStats.attributes === undefined);

console.log('\nThe decoded build renders the same numbers\n');

const regulation = JSON.parse(readFileSync('src/data/regulation.json', 'utf8'));
const weapons = decodeRegulationData(regulation);

const findVariant = (name, affinityId) =>
  weapons.find((w) => w.weaponName === name && w.affinityId === affinityId);

const original = findVariant(sample.weaponName, sample.affinityId);
if (!original) {
  failures++;
  console.log(`  FAIL  ${sample.weaponName} (affinity ${sample.affinityId}) not found`);
} else {
  const before = getWeaponAttack({
    weapon: original,
    attributes: sample.attributes,
    upgradeLevel: sample.upgradeLevel,
    twoHanding: sample.twoHanding,
  });
  const rebuilt = findVariant(decoded.weaponName, decoded.affinityId);
  const after = getWeaponAttack({
    weapon: rebuilt,
    attributes: decoded.attributes,
    upgradeLevel: decoded.upgradeLevel,
    twoHanding: decoded.twoHanding,
  });
  check('same weapon variant resolved', rebuilt?.name === original.name, original.name);
  check('attack power identical', Math.abs(before.total - after.total) < 1e-9,
    `${before.total.toFixed(2)} vs ${after.total.toFixed(2)}`);
  check('bleed buildup identical',
    Math.abs((before.attackPower[7] ?? 0) - (after.attackPower[7] ?? 0)) < 1e-9,
    `${(before.attackPower[7] ?? 0).toFixed(2)}`);
}

console.log('');
if (failures) {
  console.log(`${failures} check(s) FAILED — share links are not trustworthy.\n`);
  process.exit(1);
}
console.log('All share-link checks passed.\n');
