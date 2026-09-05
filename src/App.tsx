import { useEffect, useState } from 'react';
import { classList, weaponList, armorList } from './data';
import { exactWeapons } from './calculator';
import type { StartingClass } from './types/game-data';
import { ClassesView, toCalculatorAttributes } from './views/ClassesView';
import { WeaponsView } from './views/WeaponsView';
import { ArmorView } from './views/ArmorView';
import { OptimizerView } from './views/OptimizerView';
import { StatControls, type BuildSettings } from './components/StatControls';
import { SiteFooter } from './components/SiteFooter';
import './App.css';

type Tab = 'classes' | 'weapons' | 'armor' | 'optimizer';

const TABS: [Tab, string][] = [
  ['classes', 'Classes'], ['weapons', 'Weapons'], ['armor', 'Armor'], ['optimizer', 'Optimizer'],
];

const TAB_IDS = TABS.map(([id]) => id) as string[];

const DEFAULT_SETTINGS: BuildSettings = {
  attributes: { str: 20, dex: 20, int: 12, fai: 12, arc: 10 },
  upgradeLevel: 25,
  twoHanding: false,
};

/**
 * The tab is kept in the URL hash so a link can point at one directly —
 * softcapbuilds.com/#optimizer opens the solver rather than the landing tab.
 * An unknown or missing hash falls back to Classes, which also means the
 * back button out of #weapons lands somewhere sensible.
 */
function tabFromHash(): Tab {
  const raw = window.location.hash.replace(/^#/, '').toLowerCase();
  return TAB_IDS.includes(raw) ? (raw as Tab) : 'classes';
}

export default function App() {
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [settings, setSettings] = useState<BuildSettings>(DEFAULT_SETTINGS);

  // Back and forward move between tabs.
  useEffect(() => {
    const onHashChange = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /**
   * Writing the hash is what changes the tab — the hashchange listener above
   * updates state. That keeps clicks and browser navigation on one path.
   */
  const setTab = (next: Tab) => {
    if (tabFromHash() === next) {
      setTabState(next);
      return;
    }
    window.location.hash = next;
  };

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

        {/* The claim that separates this from a wiki table, stated once, up top. */}
        <p className="premise">
          Attack power is read from the game&rsquo;s own regulation data, not from letter
          grades. The stat solver returns the <em>exact</em> optimum, not a close guess.
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
      {tab === 'optimizer' && <OptimizerView />}

      <SiteFooter />
    </div>
  );
}
