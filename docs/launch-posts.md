# Launch post drafts

Every number below is checked against the data in `src/data/`. If you change
the dataset, re-check before posting.

Verified as of writing: 10 classes · 307 base weapons from the fan API ·
3,296 weapon/affinity variants with exact stats · 569 armor pieces ·
13 affinities · 26 upgrade levels · Longsword +25 base physical = 269.5.

**Do not post any of these until you have checked that subreddit's rules.**
See `subreddit-rules.md`.

---

## Variant A — r/EldenRingBuilds (most likely venue)

Leads with the use case. This community cares about builds, not algorithms.

> **Title:** I built a tool that finds the mathematically optimal stat spread for any weapon at any level
>
> Softcap: https://softcapbuilds.com/#optimizer
>
> You tell it your target level and how much VIG/MND/END you want to keep. It
> tells you the exact best allocation of the remaining points for a given
> weapon, and which starting class wastes the fewest points getting there.
>
> Two things I want to be upfront about, because they're the whole reason I
> built it:
>
> **The attack numbers are the game's, not estimates.** Most tools work off the
> letter grades (D, C, B). Those are labels for a range, not the actual values.
> This reads the real scaling coefficients, base damage at all 26 upgrade
> levels across all 13 affinities, and the soft-cap curves — so a Longsword +25
> shows 269.5 base physical because that's what it is, not because I
> approximated it.
>
> **The stat spread is provably optimal, not a good guess.** Attack power is
> separable — each attribute contributes independently — which means the best
> spread can be solved exactly with dynamic programming rather than hill
> climbing. I test it against brute force over every possible allocation.
>
> **What it does NOT do**, and I'd rather say it than have you find it:
> total attack power flatters split-damage weapons. 500 physical + 400 fire
> beats 800 pure physical on paper but usually loses in practice, because the
> target reduces each damage type separately. The tool shows you the split and
> says so, but it doesn't model enemy defences, so it can't rank those two
> fairly. It also ignores talismans, Ashes of War, and how a weapon actually
> feels to swing.
>
> Data and the attack-power formula come from Tom Clark's
> elden-ring-weapon-calculator (MIT) — credited in the footer. Item names and
> armor stats come from the Elden Ring Fan API. Armor numbers aren't verified
> to the same standard as weapons and I've labelled them as such in the app.
>
> Free, no ads, no accounts, runs entirely in your browser. Source is on
> GitHub. I'd genuinely like to hear where the numbers look wrong to you.

---

## Variant B — r/Eldenring (only if promotion is permitted)

Shorter, less technical, leads with the single most checkable claim.

> **Title:** Made a free build planner that uses the game's actual damage numbers instead of the letter grades
>
> https://softcapbuilds.com
>
> Pick a weapon and a target level, and it works out the exact best stat spread
> — and which class gets you there with the fewest wasted points.
>
> The numbers come from the game's own regulation data rather than from the
> S/A/B/C scaling letters, so a +25 Longsword reads 269.5 base physical because
> that's the real value.
>
> Being honest about the limits: it ranks by total attack power, which makes
> split-damage weapons look better than they play, since the game reduces each
> damage type separately. It shows you the split so you can judge. No talismans
> or Ashes of War yet.
>
> Free, no ads, no sign-up. Data credited in the footer. Happy to hear what's
> wrong with it.

---

## Variant C — Hacker News (Show HN) or r/webdev

Different audience. The algorithm is the story; the game is context.

> **Title:** Show HN: Softcap – exact stat optimization for Elden Ring builds via dynamic programming
>
> https://softcapbuilds.com
>
> Elden Ring build calculators generally let you enter stats and read off the
> resulting damage. I wanted the inverse: given a level budget, what is the
> best possible allocation?
>
> That turns out to be exactly solvable rather than a search problem. Attack
> power for one damage type is
>
>     AR_d = base_d * (1 + Σ_a scaling_{a,d} * curve_d(stat_a))
>
> Summing over damage types and rearranging, the total is a constant plus a sum
> of five independent single-variable functions. The attributes never interact,
> so it's a separable resource-allocation problem — solved exactly by DP in
> O(5 · budget · 99), a few tens of thousands of operations. No hill climbing,
> no local maxima.
>
> The awkward part was ranking all 3,296 weapon/affinity variants against all
> 10 starting classes, since class starting stats act as floors. Naively that's
> ~33,000 DP solves and took 5.9s. Branch and bound fixed it: score each weapon
> once against a synthetic class holding the minimum of all ten classes' stats
> — fewer constraints, so no real class can beat it — sort by that bound, then
> evaluate top-down and stop when the bound drops below the worst result already
> locked in. Provably identical output, under 100ms.
>
> Regulation data and the attack-power formula are from Tom Clark's
> elden-ring-weapon-calculator (MIT). `npm run verify` checks the solver against
> brute force over every possible allocation, and every displayed answer is
> re-run through the calculator before rendering.
>
> Vite + React, no backend, no database — the dataset is 874 KB and ships with
> the page. Source: github.com/TwinjamindoesCode/elden-ring-optimizer

---

## Posting notes

- **Link to `#optimizer`, not the root.** The root opens on Classes and hides
  the thing worth showing.
- **Post once per subreddit, spaced out.** Same link to five subs in an hour is
  the classic spam pattern.
- **Reply to every comment for the first two hours.** Early engagement is most
  of what decides whether a post travels, and this is a feedback launch — the
  comments are the point.
- **Do not argue with the split-damage criticism.** It's correct. Agree, point
  at the Split column, and ask what they'd weight it by.
