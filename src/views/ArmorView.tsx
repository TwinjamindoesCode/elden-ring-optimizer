import { useMemo, useState } from 'react';
import { armorList } from '../data';
import type { Armor, ArmorSlot } from '../types/game-data';

type SortKey = 'poise' | 'physical' | 'weight' | 'efficiency' | 'name';

const SLOTS: [ArmorSlot | 'all', string][] = [
  ['all', 'All slots'], ['head', 'Head'], ['chest', 'Chest'], ['hands', 'Hands'], ['legs', 'Legs'],
];

const PAGE_SIZE = 100;

/** Average of the eight negation values — a rough "how tanky is this" number. */
function averageNegation(armor: Armor): number {
  const v = armor.damageNegation;
  return (v.physical + v.strike + v.slash + v.pierce + v.magic + v.fire + v.lightning + v.holy) / 8;
}

export function ArmorView() {
  const [search, setSearch] = useState('');
  const [slot, setSlot] = useState<ArmorSlot | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('poise');
  const [maxWeight, setMaxWeight] = useState(30);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return armorList
      .filter((a) => {
        if (slot !== 'all' && a.slot !== slot) return false;
        if (a.weight > maxWeight) return false;
        if (query && !a.name.toLowerCase().includes(query)) return false;
        return true;
      })
      .map((armor) => ({
        armor,
        avg: averageNegation(armor),
        // Poise per unit of weight — the number that actually matters when
        // you are trying to hit a poise breakpoint without fat-rolling.
        efficiency: armor.weight > 0 ? armor.poise / armor.weight : 0,
      }))
      .sort((a, b) => {
        switch (sortKey) {
          case 'poise': return b.armor.poise - a.armor.poise || a.armor.weight - b.armor.weight;
          case 'physical': return b.armor.damageNegation.physical - a.armor.damageNegation.physical;
          case 'weight': return a.armor.weight - b.armor.weight;
          case 'efficiency': return b.efficiency - a.efficiency;
          default: return a.armor.name.localeCompare(b.armor.name);
        }
      });
  }, [search, slot, sortKey, maxWeight]);

  const visible = showAll ? rows : rows.slice(0, PAGE_SIZE);

  return (
    <div className="browse">
      <div className="filters">
        <input
          className="search"
          type="search"
          placeholder="Search armor…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowAll(false); }}
        />

        <label className="select">
          <span>Slot</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value as ArmorSlot | 'all')}>
            {SLOTS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="select">
          <span>Sort by</span>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="poise">Poise</option>
            <option value="efficiency">Poise per weight</option>
            <option value="physical">Physical negation</option>
            <option value="weight">Weight (lightest)</option>
            <option value="name">Name</option>
          </select>
        </label>

        <label className="select">
          <span>Max weight <span className="control-hint">{maxWeight}</span></span>
          <input
            className="slider"
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={maxWeight}
            onChange={(e) => setMaxWeight(Number(e.target.value))}
          />
        </label>
      </div>

      <p className="result-count">{rows.length.toLocaleString()} match{rows.length === 1 ? '' : 'es'}</p>

      {/* tabIndex makes the scroll area reachable by keyboard, not just by mouse. */}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Armor results">
        <table className="data-table">
          <thead>
            <tr>
              <th>Armor</th>
              <th>Slot</th>
              <th className="num">Weight</th>
              <th className="num">Poise</th>
              <th className="num">Poise/wt</th>
              <th className="num">Phys</th>
              <th className="num">Avg neg.</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ armor, avg, efficiency }) => (
              <tr key={armor.id}>
                <td>{armor.name}</td>
                <td className="dim" data-label="Slot">{armor.slot}</td>
                <td className="num" data-label="Weight">{armor.weight.toFixed(1)}</td>
                <td className="num strong" data-label="Poise">{armor.poise}</td>
                <td className="num dim" data-label="Poise/wt">{efficiency.toFixed(2)}</td>
                <td className="num dim" data-label="Physical">
                  {armor.damageNegation.physical.toFixed(1)}
                </td>
                <td className="num dim" data-label="Avg negation">{avg.toFixed(1)}</td>
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
        Armor numbers come from the fan API dump, not the regulation file — the exact
        weapon data does not cover armor. They match the in-game display values but
        have not been verified the way attack power has.
      </p>
    </div>
  );
}
