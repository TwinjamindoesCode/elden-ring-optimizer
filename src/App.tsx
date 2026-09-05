import { useState } from 'react';
import { classList, weaponList, armorList } from './data';
import { exactWeapons } from './calculator';
import type { StartingClass } from './types/game-data';
import { ClassesView, toCalculatorAttributes } from './views/ClassesView';
import { WeaponsView } from './views/WeaponsView';
import { ArmorView } from './views/ArmorView';
import { StatControls, type BuildSettings } from './components/StatControls';
import './App.css';

type Tab = 'classes' | 'weapons' | 'armor';

const TABS: [Tab, string][] = [
  ['classes', 'Classes'], ['weapons', 'Weapons'], ['armor', 'Armor'],
];

const DEFAULT_SETTINGS: BuildSettings = {
  attributes: { str: 20, dex: 20, int: 12, fai: 12, arc: 10 },
  upgradeLevel: 25,
  twoHanding: false,
};

export default function App() {
  const [tab, setTab] = useState<Tab>('classes');
  const [settings, setSettings] = useState<BuildSettings>(DEFAULT_SETTINGS);

  /** Jump from a class straight into browsing with that class's stats. */
  const useClassStats = (cls: StartingClass) => {
    setSettings((s) => ({ ...s, attributes: toCalculatorAttributes(cls) }));
    setTab('weapons');
  };

  return (
    <div className="app">
      <header>
        <h1>Elden Ring Build Optimizer</h1>
        <p className="subtitle">
          {classList.length} classes · {weaponList.length} weapons ·{' '}
          {exactWeapons.length.toLocaleString()} weapon variants with exact stats ·{' '}
          {armorList.length} armor pieces
        </p>
        <nav className="tabs">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? 'tab active' : 'tab'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Only weapons use these — armor has no stat requirements or scaling. */}
      {tab === 'weapons' && <StatControls settings={settings} onChange={setSettings} />}

      {tab === 'classes' && <ClassesView onUseStats={useClassStats} />}
      {tab === 'weapons' && <WeaponsView settings={settings} />}
      {tab === 'armor' && <ArmorView />}
    </div>
  );
}
