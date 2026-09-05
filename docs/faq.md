# Hard questions, honest answers

Prepared replies for the comments you're most likely to get. Keep the tone:
concede what's true immediately, then be specific.

---

## "Total AR is misleading — split damage doesn't work like that"

**This is correct and it is the strongest criticism of the tool. Agree with it
immediately.** Do not defend the ranking.

> You're right, and it's the biggest weakness in the ranking. Total AR adds the
> damage types together, so 500 physical + 400 fire outranks 800 pure physical
> even though it'll usually do less real damage — the game applies each type
> against its own defence and negation separately.
>
> The Split column shows the breakdown and weapons that put everything into one
> type are marked "pure", so you can see it. But I don't model enemy defences,
> so I can't rank them fairly, and I say that in the app rather than pretending
> the number means more than it does.
>
> If you've got a defence profile you'd weight against, I'd genuinely like to
> add it.

---

## "Where did the data come from?"

> Elden Ring's regulation data — base attack per upgrade level, real scaling
> coefficients, calc-correct curves, status buildup — extracted from the game
> and published by Tom Clark in elden-ring-weapon-calculator, MIT licensed. The
> attack-power calculation in Softcap is a port of that project's
> implementation, credited in the footer and in LICENSE-THIRDPARTY.md.
>
> Item names, descriptions, armor and spell data are from the Elden Ring Fan
> API. That's the less reliable half — see the armor question below.

---

## "How is this different from tclark's calculator? Isn't this just a reskin?"

Do not get defensive. His project is the source of your data. Name that first.

> Fair question, and I should be clear: his project is where my data and my
> attack-power formula come from. Credited in the footer.
>
> The difference is direction. His calculator answers "given these stats, what
> does this weapon do" — you enter stats and read damage. Softcap answers the
> inverse: "given a level budget, what's the best possible allocation of
> points" — and solves it exactly with dynamic programming rather than
> searching. It also picks which starting class wastes the fewest points, since
> class stats act as floors you can never go below.
>
> If you want the forward direction, honestly, use his. It's more mature.

---

## "Your armor numbers are wrong"

> Probably. The armor data comes from the fan API dump, not the regulation
> file — the exact weapon data doesn't cover armor. It matches the in-game
> display values but I haven't verified it the way I verified attack power, and
> the app says so on the armor tab.
>
> Tell me which piece and what it should be and I'll fix it. Or open an issue —
> link's in the footer.

---

## "Did an AI write this?"

Do not be cagey. Cagey reads as guilty and it will be the whole thread.

> Yes, I built it with AI assistance — I'm early in learning to code and that's
> how I got it done.
>
> What I'd point at instead of arguing: `npm run verify` checks the attack
> numbers against known in-game values and checks the stat solver against brute
> force over every possible allocation. The maths is either right or it isn't,
> and it's testable either way. If you find a number that's wrong I'll fix it
> and credit you.

---

## "Doesn't optimizing ruin the game / just use what feels good"

> Completely fair, and mostly I agree. This isn't meant to tell anyone what to
> play. It's for the specific moment where you've decided on a weapon and you
> want to know whether 55 STR or 60 STR is actually doing anything for you.
>
> The soft caps are the interesting part — the tool makes it obvious where more
> points stop paying.

---

## "Why does it recommend DLC weapons at the top?"

> Because they're stronger, and because total AR favours the split-damage ones
> which a lot of the DLC weapons are. Use the Category and Affinity filters to
> narrow it, and check the Split column before trusting the order. DLC weapons
> are tagged.

---

## "It's missing talismans / Ashes of War / spell scaling"

> Correct, none of those are modelled yet. Talismans are the next real piece of
> work — the raw data only has the description text ("Raises maximum HP"), so
> each one has to be hand-translated into a number the optimizer can use.
>
> If there are specific talismans you'd want first, tell me and I'll do those.

---

## "The site is broken on my phone / it's slow"

> Tell me the device and browser and I'll fix it. It's a static site with no
> backend so it should be quick — the dataset is 874 KB and ships with the
> page, which is the slowest part of the first load.

---

## If someone finds a genuinely wrong number

The single best outcome available to you. Take it seriously in public:

> That's a real bug, thank you. Opening an issue now and I'll credit you in the
> fix.

Then actually fix it. One publicly-fixed bug buys more credibility than the
entire launch post.
