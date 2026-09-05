import { useState } from 'react';
import { classList, weaponList, armorList } from './data';
import { exactWeapons } from './calculator';
import type { StartingClass } from './types/game-data';
import { ClassesView, toCalculatorAttributes } from './views/ClassesView';
import { WeaponsView } from './views/WeaponsView';
import { ArmorView } from './views/ArmorView';
import { OptimizerView } from './views/OptimizerView';
import { StatControls, type BuildSettings } from './components/StatControls';
import './App.css';

type Tab = 'classes' | 'weapons' | 'armor' | 'optimizer';

const TABS: [Tab, string][] = [
  ['classes', 'Classes'], ['weapons', 'Weapons'], ['armor', 'Armor'], ['optimizer', 'Optimizer'],
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
        <div className="masthead">
          <div className="wordmark">
            <h1>Softcap</h1>
            <p className="tagline">Elden Ring build optimizer</p>
          </div>

          <dl className="figures">
            <div className="figure">
              <dd>{classList.length}</dd>
              <dt>Classes</dt>
            </div>
            <div className="figure">
              <dd>{weaponList.length}</dd>
              <dt>Weapons</dt>
            </div>
            <div className="figure">
              <dd>{exactWeapons.length.toLocaleString()}</dd>
              <dt>Variants</dt>
            </div>
            <div className="figure">
              <dd>{armorList.length}</dd>
              <dt>Armor</dt>
            </div>
            <div className="figure accent">
              <dd>Exact</dd>
              <dt>Numbers</dt>
            </div>
          </dl>
        </div>

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
      {tab === 'optimizer' && <OptimizerView />}
    </div>
  );
}
