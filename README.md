# Elden Ring Build Optimizer

A website that helps you plan Elden Ring builds. Everything runs in the visitor's
browser, so hosting it is free forever.

## The two commands you need

```bash
npm run dev
```
Starts the site on your own computer at http://localhost:5173. Leave it running
while you work — it updates the moment you save a file. Press `Ctrl+C` to stop.

```bash
npm run convert
```
Re-reads the raw game data and rebuilds the clean version. Only needed when you
change something in the `data/` folder.

## What's in each folder

| Folder | What it is | Do you edit it? |
|---|---|---|
| `src/` | The website itself — what people see | **Yes** |
| `src/data/` | Clean game data the app reads | **No** — generated, gets overwritten |
| `src/types/game-data.ts` | The blueprint describing what a weapon/armor/class looks like | Yes, when adding new fields |
| `data/raw/` | The original 7 files you downloaded | No — keep as-is |
| `data/starting-equipment.json` | The 10 classes' starting gear, typed in by hand | **Yes** |
| `data/patches.json` | Items missing from the raw files, typed in by hand | **Yes** |
| `scripts/convert.mjs` | Turns `data/` into `src/data/` | Rarely |
| `dist/` | The built website. Created by `npm run build` | No |

## How the data flows

```
data/raw/*.json  ─┐
                  ├─→  npm run convert  ─→  src/data/*.json  ─→  the website
data/patches.json ┘
data/starting-equipment.json
```

The raw files are never modified. If a number is wrong, fix it in `data/patches.json`
and re-run the converter — that way re-downloading the raw data never wipes your work.

## Known gaps in the raw data

`npm run convert` prints warnings every time. The ones that matter:

- **`needsVerification` items** — Champion Gaiters, Catch Flame, and Assassin's
  Approach are missing from the downloaded files entirely. Their stats in
  `data/patches.json` were typed in by hand and should be checked against a wiki.
- **Scaling coefficients are estimates.** The raw data has letter grades (D, C, B…)
  but not the real numbers behind them. `scripts/convert.mjs` uses rough stand-ins
  so the app works today. Attack-power numbers will be approximate until real
  per-upgrade-level values are added.
- **Talisman effects are empty.** The raw data only has the description text
  ("Raises maximum HP"). Turning those into numbers the optimizer can use is a
  hand-written job — see `StatModifier` in `src/types/game-data.ts`.
- **Talisman weights are all 0.** Not present in the raw data.
- **Weapon skills / status effects (bleed, frost…) are missing.** Not in the raw data.

## Status

- [x] Data structures defined
- [x] Raw data converted and validated
- [x] All 10 starting classes with complete starting equipment
- [ ] Browse and filter weapons/armor
- [ ] The actual build optimizer
- [ ] Deploy to Vercel
