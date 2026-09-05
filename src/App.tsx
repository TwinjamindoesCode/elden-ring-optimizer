import { useState } from 'react';
import { classList, weaponList, armorList } from './data';
import type { StartingClass, EntityRef } from './types/game-data';
import {
  findStandard, getWeaponAttack, scalingGrade,
  ATTACK_POWER_LABELS, allDamageTypes, allAttributes,
  type Attributes,
} from './calculator';
import './App.css';

const ATTRIBUTES = [
  ['vigor', 'VIG'], ['mind', 'MND'], ['endurance', 'END'], ['strength', 'STR'],
  ['dexterity', 'DEX'], ['intelligence', 'INT'], ['faith', 'FTH'], ['arcane', 'ARC'],
] as const;

/** Renders one row of the starting-equipment list. */
function GearRow({ label, items }: { label: string; items: (EntityRef | null)[] }) {
  const present = items.filter(Boolean) as EntityRef[];
  return (
    <div className="gear-row">
      <span className="gear-label">{label}</span>
      <span className="gear-items">
        {present.length ? present.map((i) => i.name).join(', ') : <em>none</em>}
      </span>
    </div>
  );
}

/** Our class stats use full names; the calculator uses the game's short names. */
function toCalculatorAttributes(cls: StartingClass): Attributes {
  return {
    str: cls.stats.strength,
    dex: cls.stats.dexterity,
    int: cls.stats.intelligence,
    fai: cls.stats.faith,
    arc: cls.stats.arcane,
  };
}

/**
 * Exact attack power for a class's starting weapon, using the real game formula.
 * Every number here matches what you would see in-game.
 */
function StartingWeaponAttack({ cls }: { cls: StartingClass }) {
  const weaponRef = cls.startingEquipment.rightHand[0];
  if (!weaponRef) return null;

  const weapon = findStandard(weaponRef.name);
  if (!weapon) return null;

  const attributes = toCalculatorAttributes(cls);
  const result = getWeaponAttack({ weapon, attributes, upgradeLevel: 0 });
  const damage = allDamageTypes
    .map((t) => [t, result.attackPower[t] ?? 0] as const)
    .filter(([, v]) => v > 0);

  const scalingAtZero = weapon.attributeScaling[0];
  const grades = allAttributes
    .map((a) => [a, scalingGrade(scalingAtZero[a] ?? 0, weapon.scalingTiers)] as const)
    .filter(([, g]) => g);

  return (
    <>
      <h3>
        {weapon.weaponName} <span className="at-level">at +0, one-handed</span>
      </h3>
      <div className="ar-row">
        <div className="ar-total">
          <span className="ar-value">{Math.floor(result.total)}</span>
          <span className="ar-label">ATTACK POWER</span>
        </div>
        <div className="ar-breakdown">
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
      {result.ineffectiveAttributes.length > 0 && (
        <p className="warn">
          Requirements not met ({result.ineffectiveAttributes.join(', ').toUpperCase()}) — 40% penalty applied.
        </p>
      )}
    </>
  );
}

function ClassDetail({ cls }: { cls: StartingClass }) {
  const gear = cls.startingEquipment;
  const armorPieces = [gear.armor.head, gear.armor.chest, gear.armor.hands, gear.armor.legs];
  const spells = [...gear.sorceries, ...gear.incantations];

  return (
    <div className="detail">
      <h2>{cls.name}</h2>
      <p className="desc">{cls.description}</p>

      <div className="stat-grid">
        <div className="stat level">
          <span className="stat-value">{cls.startingLevel}</span>
          <span className="stat-name">LEVEL</span>
        </div>
        {ATTRIBUTES.map(([key, short]) => (
          <div className="stat" key={key}>
            <span className="stat-value">{cls.stats[key]}</span>
            <span className="stat-name">{short}</span>
          </div>
        ))}
      </div>

      <h3>Starting Equipment</h3>
      <GearRow label="Right hand" items={gear.rightHand} />
      <GearRow label="Left hand" items={gear.leftHand} />
      <GearRow label="Shield" items={gear.shields} />
      <GearRow label="Armor" items={armorPieces} />
      <GearRow label="Spells" items={spells} />
      {gear.ammunition.length > 0 && (
        <div className="gear-row">
          <span className="gear-label">Ammo</span>
          <span className="gear-items">
            {gear.ammunition.map((a) => `${a.ref.name} ×${a.quantity}`).join(', ')}
          </span>
        </div>
      )}

      <StartingWeaponAttack cls={cls} />
    </div>
  );
}

export default function App() {
  const [selectedId, setSelectedId] = useState(classList[0]?.id ?? '');
  const selected = classList.find((c) => c.id === selectedId);

  return (
    <div className="app">
      <header>
        <h1>Elden Ring Build Optimizer</h1>
        <p className="subtitle">
          {classList.length} classes · {weaponList.length} weapons · {armorList.length} armor pieces
        </p>
      </header>

      <div className="layout">
        <nav className="class-list">
          {classList.map((cls) => (
            <button
              key={cls.id}
              className={cls.id === selectedId ? 'class-button active' : 'class-button'}
              onClick={() => setSelectedId(cls.id)}
            >
              <span className="class-name">{cls.name}</span>
              <span className="class-level">Lv {cls.startingLevel}</span>
            </button>
          ))}
        </nav>

        {selected && <ClassDetail cls={selected} />}
      </div>
    </div>
  );
}
