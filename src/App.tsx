import { useState } from 'react';
import { classList, weaponList, armorList } from './data';
import type { StartingClass, EntityRef } from './types/game-data';
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
