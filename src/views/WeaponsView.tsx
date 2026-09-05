import { useMemo, useState } from 'react';
import {
  exactWeapons, getWeaponAttack, scalingGrade, adjustAttributesForTwoHanding,
  AFFINITY_NAMES, WEAPON_TYPE_LABELS, allAttributes, allDamageTypes,
  type DecodedWeapon, type Attribute,
} from '../calculator';
import type { BuildSettings } from '../components/StatControls';

type SortKey = 'attack' | 'name' | 'weight' | 'type';

/** How many rows to actually render. Sorting all 3,296 is cheap; drawing them is not. */
const PAGE_SIZE = 100;

interface Row {
  weapon: DecodedWeapon;
  attack: number;
  breakdown: [number, number][];
  wieldable: boolean;
  missing: Attribute[];
  grades: string;
}

export function WeaponsView({ settings }: { settings: BuildSettings }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('attack');
  const [onlyWieldable, setOnlyWieldable] = useState(true);
  const [affinity, setAffinity] = useState<number | 'all'>(0);
  const [weaponType, setWeaponType] = useState<number | 'all'>('all');
  const [showAll, setShowAll] = useState(false);

  /** Weapon categories present in the data, for the dropdown. */
  const weaponTypes = useMemo(() => {
    const ids = [...new Set(exactWeapons.map((w) => w.weaponType))];
    return ids
      .map((id) => [id, WEAPON_TYPE_LABELS[id] ?? `Type ${id}`] as const)
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, []);

  const rows = useMemo<Row[]>(() => {
    const query = search.trim().toLowerCase();

    return exactWeapons
      .filter((w) => {
        if (affinity !== 'all' && w.affinityId !== affinity) return false;
        if (weaponType !== 'all' && w.weaponType !== weaponType) return false;
        if (query && !w.name.toLowerCase().includes(query)) return false;
        return true;
      })
      .map((weapon) => {
        const result = getWeaponAttack({
          weapon,
          attributes: settings.attributes,
          upgradeLevel: settings.upgradeLevel,
          twoHanding: settings.twoHanding,
        });

        const level = result.upgradeLevel;
        const scalingAtLevel = weapon.attributeScaling[level];
        const grades = allAttributes
          .map((a) => {
            const g = scalingGrade(scalingAtLevel[a] ?? 0, weapon.scalingTiers);
            return g ? `${a.toUpperCase()} ${g}` : null;
          })
          .filter(Boolean)
          .join(' ');

        return {
          weapon,
          attack: result.total,
          breakdown: allDamageTypes
            .map((t) => [t, result.attackPower[t] ?? 0] as [number, number])
            .filter(([, v]) => v > 0),
          wieldable: result.ineffectiveAttributes.length === 0,
          missing: result.ineffectiveAttributes,
          grades,
        };
      })
      .filter((row) => (onlyWieldable ? row.wieldable : true))
      .sort((a, b) => {
        if (sortKey === 'attack') return b.attack - a.attack;
        if (sortKey === 'name') return a.weapon.name.localeCompare(b.weapon.name);
        if (sortKey === 'type') {
          const t = (WEAPON_TYPE_LABELS[a.weapon.weaponType] ?? '').localeCompare(
            WEAPON_TYPE_LABELS[b.weapon.weaponType] ?? '',
          );
          return t !== 0 ? t : b.attack - a.attack;
        }
        return a.weapon.name.localeCompare(b.weapon.name);
      });
  }, [search, sortKey, onlyWieldable, affinity, weaponType, settings]);

  const visible = showAll ? rows : rows.slice(0, PAGE_SIZE);
  const adjusted = adjustAttributesForTwoHanding(
    exactWeapons[0], settings.attributes, settings.twoHanding,
  );

  return (
    <div className="browse">
      <div className="filters">
        <input
          className="search"
          type="search"
          placeholder="Search weapons…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowAll(false); }}
        />

        <label className="select">
          <span>Affinity</span>
          <select
            value={String(affinity)}
            onChange={(e) => setAffinity(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All</option>
            {Object.entries(AFFINITY_NAMES)
              .filter(([id]) => Number(id) >= 0)
              .map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
          </select>
        </label>

        <label className="select">
          <span>Category</span>
          <select
            value={String(weaponType)}
            onChange={(e) => setWeaponType(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All</option>
            {weaponTypes.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>

        <label className="select">
          <span>Sort by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="attack">Attack power</option>
            <option value="name">Name</option>
            <option value="type">Category</option>
          </select>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={onlyWieldable}
            onChange={(e) => setOnlyWieldable(e.target.checked)}
          />
          <span>Only what I can wield</span>
        </label>
      </div>

      <p className="result-count">
        {rows.length.toLocaleString()} match{rows.length === 1 ? '' : 'es'}
        {settings.twoHanding && ` · two-handing at ${adjusted.str} effective STR`}
      </p>

      {/* tabIndex makes the scroll area reachable by keyboard, not just by mouse. */}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Weapon results">
        <table className="data-table">
          <thead>
            <tr>
              <th>Weapon</th>
              <th>Category</th>
              <th className="num">Attack</th>
              <th>Damage</th>
              <th>Scaling</th>
              <th className="num">Requires</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={`${row.weapon.name}-${row.weapon.affinityId}`} className={row.wieldable ? '' : 'unwieldable'}>
                <td>
                  {row.weapon.url ? (
                    <a href={row.weapon.url} target="_blank" rel="noreferrer noopener">
                      {row.weapon.name}
                    </a>
                  ) : (
                    row.weapon.name
                  )}
                  {row.weapon.dlc && <span className="tag">DLC</span>}
                </td>
                <td className="dim" data-label="Category">
                  {WEAPON_TYPE_LABELS[row.weapon.weaponType] ?? '—'}
                </td>
                <td className="num strong" data-label="Attack">{Math.floor(row.attack)}</td>
                <td className="dim small" data-label="Damage">
                  {row.breakdown.map(([, v]) => Math.floor(v)).join(' / ')}
                </td>
                <td className="dim small" data-label="Scaling">{row.grades || '—'}</td>
                <td className="num dim small" data-label="Requires">
                  {Object.entries(row.weapon.requirements)
                    .map(([a, v]) => `${a.toUpperCase()} ${v}`)
                    .join(' ') || '—'}
                  {!row.wieldable && (
                    <span className="miss"> short on {row.missing.join(', ').toUpperCase()}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!showAll && rows.length > PAGE_SIZE && (
        <button className="show-more" onClick={() => setShowAll(true)}>
          Show all {rows.length.toLocaleString()}
        </button>
      )}

      <p className="footnote">
        Attack numbers are exact — the game's own formula and data, at +{settings.upgradeLevel}
        {settings.twoHanding ? ', two-handed' : ', one-handed'}. Damage column splits attack
        into its types. Weapons you cannot wield take a 40% penalty.
      </p>
    </div>
  );
}
