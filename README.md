# Softcap

Softcap is a website that helps you plan Elden Ring builds. Everything runs in the visitor's
browser, so hosting it is free forever.

**Live:** https://softcapbuilds.com

## The three commands you need

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

```bash
npm run verify
```
Checks the attack-power maths against known in-game values. **If this fails, the
numbers are wrong and should not be trusted.** It currently passes every check.

## What's in each folder

| Folder | What it is | Do you edit it? |
|---|---|---|
| `src/` | The website itself — what people see | **Yes** |
| `src/data/` | Clean game data the app reads | **No** — generated, gets overwritten |
| `src/calculator/` | Exact attack-power maths | Rarely |
| `src/types/game-data.ts` | The blueprint describing what a weapon/armor/class looks like | Yes, when adding new fields |
| `data/raw/` | The original downloaded files | No — keep as-is |
| `data/starting-equipment.json` | The 10 classes' starting gear, typed in by hand | **Yes** |
| `data/patches.json` | Items missing from the raw files, typed in by hand | **Yes** |
| `scripts/` | The converter and the verifier | Rarely |
| `dist/` | The built website. Created by `npm run build` | No |

## How the data flows

```
data/raw/*.json  ─────────────┐
data/patches.json             ├──→  npm run convert  ──→  src/data/*.json  ──→  the website
data/starting-equipment.json  ┘
```

The raw files are never modified. If a number is wrong, fix it in `data/patches.json`
and re-run the converter — that way re-downloading the raw data never wipes your work.

## Attack power is exact

Weapon damage does **not** use the fan API's letter grades. It uses real regulation
data extracted from the game, so every number matches what you see in-game:

- base attack at all 26 upgrade levels, across all 13 affinities
- real scaling coefficients (`0.5`, not `"D"`)
- soft-cap curves, so gains correctly shrink at high stats
- the 40% penalty for not meeting requirements
- two-handing (STR x1.5)
- status buildup (bleed, frost, poison, and the rest)

Verified examples: Longsword +25 base physical is exactly 269.5; two-handing at
20 STR gives identical attack power to one-handing at 30 STR; a Longsword at
5 STR / 5 DEX takes exactly the 40% penalty.

The data and formula come from
[elden-ring-weapon-calculator](https://github.com/ThomasJClark/elden-ring-weapon-calculator)
(MIT licensed). See `LICENSE-THIRDPARTY.md` — keeping that notice is a licence
requirement, not a courtesy.

## The optimizer is provably optimal

Given a target level, it finds the exact best stat spread for a weapon — not a
good guess, the actual maximum.

That is possible because attack power is *separable*: each attribute contributes
independently, so the total is a sum of five one-variable functions. Problems of
that shape are solved exactly by dynamic programming. No hill climbing, no local
maxima.

`npm run verify` checks the solver against brute force — literally every possible
allocation — across six weapons covering Standard, Heavy, Sacred, Occult, Magic
and Cold affinities, one-handed and two-handed. Every answer is also re-run
through the attack calculator before it is displayed.

To rank all 3,296 weapons without doing 33,000 full solves, it computes a cheap
upper bound per weapon (using a synthetic class with the lowest floors of all
ten, which no real class can beat), sorts by it, then evaluates from the top down
and stops once the bound falls below the worst result already locked in. The
output is identical to checking every pair; it just skips the ones that provably
cannot win. That took the worst case from ~5.9 seconds to under 100ms.

### What the optimizer deliberately does not claim

- **Total attack power flatters split-damage weapons.** 500 physical + 400 fire
  beats 800 pure physical on paper but usually loses in practice, because the
  target reduces each damage type separately. The UI shows the split and says so.
  Modelling enemy defences would be needed to rank them fairly.
- It ignores talismans, Ashes of War, spell scaling, status buildup as a goal,
  equip load, buffs, and how a weapon feels to use.

## Known gaps in the raw data

`npm run convert` prints warnings every run. The ones that matter:

- **Hand-entered items.** Champion Gaiters, Catch Flame, and Assassin's Approach
  are missing from the downloaded files entirely. Their stats in `data/patches.json`
  were typed in from memory and should be checked against a wiki.
- **Talisman effects are empty.** The raw data only has description text
  ("Raises maximum HP"). Turning those into numbers the optimizer can use is
  hand work — see `StatModifier` in `src/types/game-data.ts`.
- **Talisman weights are all 0.** Not present in the raw data.
- **Armor and spells have no exact-data equivalent yet.** The regulation file
  covers weapons only.

## Status

- [x] Data structures defined
- [x] Raw data converted and validated
- [x] All 10 starting classes with complete starting equipment
- [x] Deployed to Vercel
- [x] Exact attack power, verified against in-game values
- [x] Browse and filter weapons / armor
- [x] The build optimizer (exact stat allocation)
