import type { Attributes } from '../calculator';

export interface BuildSettings {
  attributes: Attributes;
  upgradeLevel: number;
  twoHanding: boolean;
}

const ATTRIBUTE_LABELS: [keyof Attributes, string][] = [
  ['str', 'STR'], ['dex', 'DEX'], ['int', 'INT'], ['fai', 'FTH'], ['arc', 'ARC'],
];

/**
 * The stat panel shared by the weapon and armor views. Everything downstream
 * recalculates from these values.
 */
export function StatControls({
  settings,
  onChange,
}: {
  settings: BuildSettings;
  onChange: (next: BuildSettings) => void;
}) {
  const setAttribute = (key: keyof Attributes, raw: string) => {
    const value = Math.max(1, Math.min(99, Number(raw) || 1));
    onChange({ ...settings, attributes: { ...settings.attributes, [key]: value } });
  };

  return (
    <div className="controls">
      <div className="control-group">
        <span className="control-title">Your stats</span>
        <div className="attr-inputs">
          {ATTRIBUTE_LABELS.map(([key, label]) => (
            <label className="attr-input" key={key}>
              <span>{label}</span>
              <input
                type="number"
                min={1}
                max={99}
                value={settings.attributes[key]}
                onChange={(e) => setAttribute(key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-title">
          Upgrade <span className="control-hint">+{settings.upgradeLevel}</span>
        </span>
        <input
          className="slider"
          type="range"
          min={0}
          max={25}
          value={settings.upgradeLevel}
          onChange={(e) => onChange({ ...settings, upgradeLevel: Number(e.target.value) })}
        />
        <span className="control-hint">Somber weapons cap at +10 and are capped automatically.</span>
      </div>

      <div className="control-group">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.twoHanding}
            onChange={(e) => onChange({ ...settings, twoHanding: e.target.checked })}
          />
          <span>Two-handing (STR x1.5)</span>
        </label>
      </div>
    </div>
  );
}
