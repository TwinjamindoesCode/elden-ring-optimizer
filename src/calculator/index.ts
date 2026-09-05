/**
 * Loads the exact weapon data and exposes it to the app.
 *
 * `decodeRegulationData` does a little work up front (expanding scaling curves
 * into lookup tables), so it runs once here and the result is reused.
 */

import regulationJson from '../data/regulation.json';
import {
  decodeRegulationData,
  type DecodedWeapon,
  type EncodedRegulationData,
} from './attack-power';

export * from './attack-power';

/** Every weapon/affinity combination — about 3,300 of them. */
export const exactWeapons: DecodedWeapon[] = decodeRegulationData(
  regulationJson as unknown as EncodedRegulationData,
);

const normalize = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '');

/** Base weapon name -> all its affinity variants. */
export const variantsByWeaponName = new Map<string, DecodedWeapon[]>();
for (const weapon of exactWeapons) {
  const key = normalize(weapon.weaponName);
  const list = variantsByWeaponName.get(key);
  if (list) list.push(weapon);
  else variantsByWeaponName.set(key, [weapon]);
}

/** Looks up exact data for one of our weapons by its display name. */
export function findVariants(weaponName: string): DecodedWeapon[] {
  return variantsByWeaponName.get(normalize(weaponName)) ?? [];
}

/** The Standard-affinity version of a weapon, which is what most people want by default. */
export function findStandard(weaponName: string): DecodedWeapon | undefined {
  const variants = findVariants(weaponName);
  return variants.find((v) => v.affinityId === 0) ?? variants[0];
}

/** Base weapon names that have exact data, sorted. */
export const exactWeaponNames = [...new Set(exactWeapons.map((w) => w.weaponName))].sort();
