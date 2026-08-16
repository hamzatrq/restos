// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2). No implementation of `ItemTile` or `ItemGrid`
// was read, opened, grepped or inferred while this file was written — and that remains true of
// every round since, including round 5, which ran its mutants against its OWN out-of-tree build.
//
// ⚠ **`ItemTile.tsx` HAS SINCE LANDED IN THIS DIRECTORY (`0ddf9b1`), SO THE "does not exist yet,
// committed RED on purpose" THAT STOOD HERE IS NO LONGER TRUE** (measured 2026-08-16). The oracle
// author does not read it; the only things known about it here are what the COMPILER says. The
// `TS2459` this note used to report — `CategoryName` declared locally and not exported — is
// CLOSED, and the contract below still declares it an EXPORTED type on purpose (`27-F74` (e)'s
// twelve allocated slugs, so the union is load-bearing rather than hand-copied — `K-3`'s recorded
// failure).
//
// ⚠ **AND THE OTHER HALF OF THAT TYPECHECK WAS THIS FILE'S OWN, WHICH IS WORSE.** `npx turbo run
// typecheck` reported **20 `TS2379` errors and every one was here**: `mount({ photo: undefined })`
// under `exactOptionalPropertyTypes`, in ten places, while `PLATE_STATES` twelve hundred lines
// below carried a comment explaining that the fix is to OMIT the key. So the file knew the answer,
// in writing, and had never been run through the gate that asks. Fixed 2026-08-16, and stated
// plainly because it is the cheapest lesson in this header: **a gate that cannot pass `pnpm
// verify` is not a gate** — it is a file that will be edited to compile by whoever is blocked by
// it, at the moment they are least interested in what it asserts.
//
// The FR text below is transcribed from
// `specs/27-design-language.md`, `specs/02-pos-app.md` and `specs/01-kernel-sync.md`; the only
// code read was `Tile.tsx`, `MoneyValue.tsx`, `theme.tsx`, `tokens/` and two sibling
// `.dom.test.tsx` files, and only for API shape and the harness idiom.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE CANNOT SEE — said first, because a reader who forgets it will over-trust it
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// **happy-dom performs NO layout.** Every `getBoundingClientRect` is zeroes. So this suite can
// assert *"the price is in the document"* and never *"the price is on the screen"* — and the
// second is the one that was actually broken for the whole of Wave 1 (`27-F69`'s own filing note:
// *"36 tiles, no price on any of them"*). Every millimetre claim, every composition claim, every
// "does the tile still fit at 1024×600 once it grew a plate and a price" claim belongs to
// `pnpm -C apps/pos-electron layout:check` and to nothing here. §F below reads the tile's
// DECLARED `27-F8` floor out of its inline style; that is a claim about what the component asks
// for, not about what the panel gave it.
//
// It also asserts nothing about contrast, the `27-F15` ladder or the `27-F21` gates —
// `src/tokens/`'s oracles measure those over the whole manifest, including the twelve identity
// colours this component spends. And it does not re-assert `27-F19`/`27-F67` polarity: the
// `useColor()` guard in `discipline.test.ts` sweeps every file in this directory, so `ItemTile`
// is held to it the moment it lands.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CONTRACT THIS SUITE FIXES
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
//   type ItemTileProps = {
//     posture: Posture;
//     name: string;
//     paisa: Paisa | null;          // ← null is UNKNOWN, and is NOT paisa(0)
//     category: CategoryName;        // ← one of the twelve `27-F74` (e) allocated slugs
//     coverage?: "full" | "partial" | "none";
//     photo?: string;
//     soldOut?: boolean;
//     onPress?: () => void;
//   };
//
// Four deviations from the proposed shape, each forced by an FR rather than preferred:
//
// **(1) `paisa: Paisa | null`, because `27-F69` requires the unknown case to be expressible.**
// *"A price that is unknown is stated as unknown (`00 §5.7`) and the tile is not sellable; it is
// never rendered as blank or as zero."* A required non-null `Paisa` cannot carry that state, so a
// host holding an entry with no `(branch, channel)` row would have to invent `paisa(0)` — which is
// the exact render the FR forbids, and which `01-F60` distinguishes in terms: **a free modifier
// carries an explicit `0` on every enabled pair**, so `Rs 0` is a real, sellable price and
// `unknown` is a different fact. `null` is first-class and `?? 0` is the mutant §A4 exists to kill.
// (Same shape, same reason, as `OrderRow.age`'s `null` in `order-age.dom.test.tsx`.)
//
// **(2) `coverage`, because `27-F70` (c) is a MENU-level fact the tile cannot derive from its own
// props.** *"A menu with no photography at all drops plates entirely and the tile collapses to a
// compact row with a category rule."* An item with no photo in a `partial` menu gets a lettered
// plate (b); the *same* item in a `none` menu gets no plate at all (c). Those two are
// indistinguishable from inside the tile, so the grid must say which menu this is. The FR's own
// three words are the prop's three values. Default `"partial"` — the state a real restaurant
// arrives at, and the one that exercises (a) and (b) together.
//
// **(3) `category` is one of the twelve allocated slugs, and the tile renders it as the label.**
// `27-F74` (e): *"The set is capped at 12 and allocated in the token manifest, not chosen per
// restaurant — an owner names his categories, he does not pick their colours."* The manifest ships
// exactly twelve `bgColor-identity-*` entries, so `CategoryName` is that union. §C asserts the
// rendered label CONTAINS the slug case-insensitively — so `karahi` may render as `Karahi` and
// `bbq` as `BBQ`, and the tile is free to case it — but it may not invent a different word, since
// `27-F74` (b) makes the name the thing that keeps the tint from being the only signal.
//
// **(4) Two rendering conventions this file must be able to read, declared rather than assumed:**
// the tile expresses its `27-F8` floor as inline `minWidth`/`minHeight` (what `Tile.tsx` does and
// what `layout:check` measures), and **the price renders as ONE text run** — a price split across
// two elements cannot be struck, sized or coloured as one thing, which §A2, §D3 and §G all depend
// on. Both are stated here so an implementer is not guessing.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE `86` CONFLICT IS NOW RESOLVED IN THE CORPUS — THIS FILE'S READING WAS RIGHT, AND `27-F75`
// HAS BEEN AMENDED TO SAY SO. §D4's ASSERTIONS ARE UNCHANGED.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// This file was authored against `27-F75`'s first draft, which wrote *"the struck price and `86`
// flag on the Order grid"*, and pinned the opposite reading of the WORD from `02-F52`. The FR now
// carries the correction in its own text (August 2026):
//
// > **⚠ The rendered word is `Sold out`, never `86`, and this FR got that wrong in its first
// > draft** … *"it is not a word, it is a number that has to be TAUGHT … it never reaches glass or
// > paper"*, the two rendered strings being `Sold out` and `01-F58`'s `Sold out — disputed`. …
// > **This FR decides the slot, the fill weight and the placement; `02-F52` decides the
// > vocabulary, and where they meet, `02-F52` wins.**
//
// So the two halves stand exactly as §D asserts them: the SLOT, the SOLID FILL and the PLACEMENT
// come from `27-F75` (§D1, §D2, §D3), and the VOCABULARY comes from `02-F52` — **the flag is
// required, and the flag says `Sold out`** (§D4, including that the digits `86` never reach glass).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE SECOND PINNED INTERPRETATION: `coverage` OUTRANKS `photo`, AND §B4 ASSERTS IT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `27-F70` (c) is *"a menu with **no** photography at all drops plates **entirely** and the tile
// collapses to a compact row"*. An item carrying a `photo` inside a `coverage: "none"` menu is a
// contradiction the props can express, so this file decides which side wins: **`coverage` does.**
// The reading, stated so an implementer can dispute it rather than discover it:
//   · the FR's word is *entirely*, not *the lettered ones*, and (b)'s plate is the only kind (c)
//     could otherwise be talking about — a (c) that means "drop the lettered plates" says nothing
//     the sentence does not already say in (b);
//   · *"collapses to a compact row"* is a claim about the ROW, and a row that reflows around one
//     surviving photograph is not a compact row — a grid of two row heights is the `27-F4`
//     positional defect the same FR spends a paragraph protecting.
// The simpler alternative — *a photo always wins, `coverage` only decides what a photoless item
// does* — is coherent and is the one an implementer will reach for first, which is exactly why it
// is named here rather than left to be inferred from a red test.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MUTATION EVIDENCE — the round-3 law, discharged. NUMBERS, not a claim that the tests bite.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// A plausible implementation was built out of this file's declared contract, in a scratch
// directory outside the shipped tree, and deleted afterwards. **22/22 green against it** — which
// is the half of the law that stops this suite from being one of the three that stayed RED under
// a correct implementation and blocked their implementer indefinitely. Then 23 mutants, one
// behaviour each; **23/23 killed**, and the § named is where each one lands FIRST:
//
// (⚠ The § numbers in §B moved when the adversarial round added three tests to it; the mapping
// below is the CURRENT one, re-read off the file rather than carried forward.)
//
//   M1  price removed entirely (the FR's filed defect) → A1 A2 A4 B5 D3 E1 G  (7 tests)
//   M2a price sized EQUAL to the name                  → **SURVIVES, CORRECTLY** — see below
//   M2b price at caption type (12px under a 14px name) → A2
//   M2c the name enlarged above an unchanged price     → A2
//   M2d price size inherited while the name is enlarged→ A2
//   M3  `paisa ?? 0` — unknown rendered as `Rs 0`      → A3 E3
//   M4  `Boolean(paisa)` — the falsy test              → A4        ← and A3 still passes
//   M5  the photo prop ignored                         → B1
//   M6  an empty, untinted plate box                   → B3 C1 C3 E1
//   M7  `coverage` ignored                             → B5
//   M8  one constant identity tint for every category   → B2 C1 C3
//   M9  the category name dropped                      → C2
//   M10 the tint switched by availability              → C3
//   M11 the identity hue painted on the sold-out flag  → C4 D1 D2
//   M12 sold-out painted `fault` instead of `abnormal` → C4 D1 D2
//   M13 the abnormal fill softened to `opacity: 0.15`  → D2         ← D1 alone passes it
//   M14 the price not struck                           → D3
//   M15 the flag reads `86` instead of `Sold out`      → C4 D1 D2 D4
//   M16 `if (soldOut) return null`                     → C3 C4 D1 D2 D3 D4 E1 E2  (8 tests)
//   M17 `disabled={soldOut}`                           → E2         ← E3 still passes
//   M18 no refusal — an unpriced item sells            → E3         ← E2 still passes
//   M19 the 27-F8 floor pinned at 76                   → F1 F2
//   M20 the floor pinned at the LARGEST value (126)    → F2         ← F1's `>=` passes it
//   M21 the price coloured with the accent             → G
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ AN ADVERSARY THEN MUTATED A **CORRECT** IMPLEMENTATION AND FOUND FIVE HOLES. ALL FIVE ARE
// CLOSED BELOW, AND THE MATRIX ABOVE IS WHY THEY WERE INVISIBLE: IT ONLY EVER LISTED THE MUTANTS
// THIS AUTHOR THOUGHT OF. A KILL COUNT IS EVIDENCE ABOUT THE MUTANTS RUN, NEVER ABOUT COVERAGE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Each of these nine passed the suite **22/22** before the assertion named beside it existed. The
// three groups they fall into are worth more than the list, because they are what to check next
// time this file grows a test:
//
//   **(i) THE FIXTURE ANSWERED THE QUESTION.** The item was `Chicken Karahi` in category `karahi`,
//   so every `toContain("karahi")` was satisfied by the item's own NAME and no category label was
//   ever checked. Two mutants lived there — in the exact two states §B3 and §E1 exist to protect.
//   Closed by a fixture whose name shares no substring with any of the twelve slugs, and by §0,
//   which asserts that property rather than trusting the next author to preserve it.
//     M22 the category label dropped when `coverage === "none"`            → B5   (§0 guards it)
//     M23 the category label dropped when `soldOut`                        → E1   (§0 guards it)
//     M24 the plate's letter hard-coded to the fixture's initial (`"C"`)   → B4
//   M24 is `K-4`'s recorded failure one axis over: twelve categories were varied and the NAME
//   never was, so nothing established the letter as belonging to the ITEM.
//
//   **(ii) A PROP WAS EXERCISED AT 2 OF ITS 3 VALUES.** `coverage: "full"` was mounted nowhere,
//   and §B3 owned the word *entirely* while mounting `photo: undefined`, so the case the word is
//   about was never rendered. All three values are now mounted, and `"none"` is mounted WITH a
//   photo — the state the second pinned interpretation above is about.
//     M25 plates dropped on a fully photographed menu                      → B2
//     M26 the photo plate kept on a menu whose coverage says `none`        → B6
//
//   **(iii) AN ASSERTION WAS WEAKER THAN ITS OWN MESSAGE.** `toContain` cannot see a suffix, and
//   `styleUp`/`isStruck` walk UP — which is what keeps this suite off DOM structure and is also
//   what let three properties be satisfied by the WRONG element. Each is now anchored to the
//   element that owns the property, and the walk-up is kept for everything else.
//     M27 `Rs 2,500.00` — decimals on an operational screen (`27-F23`)     → A1
//     M28 the identity tint on the whole tile, the plate left untinted     → B3
//     M29 `line-through` on the whole tile, so the item's NAME is struck   → D3
//     M30 `opacity: 0.4` on the struck price, the flag's fill left solid   → D3
//   M27 previously died in A2, D3 and G — three tests whose messages talk about type size, strike
//   and colour — so the suite reported a formatting defect as three unrelated ones. A test that
//   fails for the right reason and SAYS the wrong one costs the implementer as much as a hole.
//   M28's survival is the sharpest of the nine: §B3's message is literally *"an empty box"*, which
//   is the render the FR forbids by name, and the assertion carrying that message passed on it.
//
// **THE NUMBERS FOR THIS ROUND, measured 2026-08-16 and not carried forward from the round above.**
// A SECOND plausible implementation was written from this file's contract — by the author of these
// closures, out of tree, without reading the first one — and the closed suite is **26/26 green**
// against it, which is the half of the law that keeps a fixed suite from becoming one that blocks
// a correct build. Then the nine mutants, one behaviour each, **9/9 killed**, and the attribution
// is the part worth reading because six of them are one-branch controls:
//
//   M23 → E1 alone (1 failed / 25 passed)   M24 → B4 alone   M25 → B2 alone   M26 → B6 alone
//   M28 → B3 alone                          M29 → D3 alone   M30 → D3 alone
//   M22 → B5 and B6 (both assert the label on a plateless menu; B5 owns the case)
//   M27 → A1 first, then A2, A4, D3, G — see the note above about what that cost before A1 existed
//
// **The `27-F70` (b) tint mutant, M28, is worth quoting because it shows the anchor working:**
//   `expected 'MMutton BiryaniRiceRs 2,500' not to contain 'Mutton Biryani'`
// — the box that declares the tint is the whole tile, and the plate inside it is empty.
//
// **And the fixture claim was measured rather than argued.** Restoring the old fixture in a copy of
// THIS suite (`Chicken Karahi` in category `karahi`, everything else identical) and running M23 —
// the category label dropped when the item sells out — gives **1 failed / 25 passed**, and the one
// failure is **§0**, not §E1. So §E1 goes green on a tile that has dropped the very label it says
// it is checking, purely because the dish is named after its category; and the tripwire that would
// have told the author is now in the file rather than in an adversary's report.
//
// **M2a survives and that is the correct verdict, not a hole.** `27-F69` says the price is "at a
// size no smaller than the item's own name", so equal sizes are compliant and an assertion that
// reddened here would be a test that blocks a correct implementation. M2b/M2c/M2d are the three
// directions in which the requirement can actually be violated, and A2 kills all three — including
// M2d, where the price carries no inline size of its own and inherits the tile's.
//
// **The four one-branch controls are the point of the matrix, not the kill count.** M17/M18 are
// the same shape of bug pointed at opposite conditions and each is caught by exactly one test, so
// §E2 and §E3 are proved to be AIMED and not merely present — an implementation that greys and
// refuses everything, which is what "sold out" intuitively suggests, dies on E2 while satisfying
// E3. M4 dies on A4 while A3 stays green, so "refused because unknown" is proved distinguishable
// from "refused because zero". M13 dies on D2 alone, so the solid-fill claim is not riding D1's
// token check. M20 dies on F2 alone, which is the whole reason F2 exists beside F1's `>=`.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE ADVERSARY CAME BACK AND FOUND ONE ROOT CAUSE WITH FIVE SURVIVORS: `photo` WAS EXERCISED
// AT TWO VALUES AND ASSERTED AT ONE. §P IS THE ANSWER, AND IT IS A TRIPWIRE RATHER THAN FOUR
// MORE TESTS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `mount()` defaults `photo` to undefined, so **every content assertion above runs on a plateless
// tile.** §B1/§B2 mount a photograph and each asserts exactly one thing — the plate's `src` — and
// §B6 mounts one under `coverage: "none"`, where the photo branch is never taken. So the
// photographed tile's TEXT was asserted nowhere, and five mutants lived in that gap at 26/26:
//
//   N1 the price not rendered when the tile shows a photograph → `Mutton BiryaniRice`
//   N2 the category label dropped when photographed            → `Mutton BiryaniRs 2,500`
//   N5 the item's name dropped when photographed               → `RiceRs 2,500`
//   N6 the `Sold out` flag dropped when photographed           → sold out, photographed, no flag
//   N3 `minWidth` pinned while `minHeight` still derives        → §F1's `>=` and §F2's one axis
//
// **N1 is the one to feel.** `27-F69` was filed against *"36 tiles, no price on any of them"*, and
// that exact defect survived the suite written to prevent it — on the tiles of a restaurant that
// paid to photograph its menu, which is the majority case this component is designed around.
//
// This is the same shape as the two holes the round above closed, for the third time: **(i)** the
// fixture answered the question, **(ii)** a prop was exercised at 2 of its 3 values, and now
// **(iii)** a prop is exercised at both values and asserted at one. §B2's own comment named the
// pattern — *"the default covers one, the interesting case covers another, and the third is
// nobody's fixture"* — and the pattern then happened to the photographed state one section below
// the sentence describing it. So the fix is deliberately NOT four hand-written photographed tests:
// four tests close five mutants and leave the sixth undiscovered.
//
// **§P instead makes the two tiles carry the same assertions BY CONSTRUCTION.** (⚠ *This read
// "the same CONTENT assertions", and the word was load-bearing in the wrong direction: content is
// what the first draft swept and what the round-5 adversary then walked around. See the round-5
// section below.*) Every claim is a named entry in one registry; every claim is swept across all five rendered
// plate states (plateless, photographed, photographed on a `full` menu, collapsed, collapsed with
// a photo the menu suppresses); and two tripwires keep it from rotting:
//   (⚠ *Round 6 superseded the AXIS and kept the registry: the plate states are one axis of a
//   five-axis cross product now, there are six of them, and the sweep is all-pairs. The two
//   tripwires below still exist under the same names and do more. Read the round-6 section at the
//   end of this header for what §P8 and §P9 assert TODAY — this paragraph describes round 4.*)
//   · **§P8 — the matrix**: every (claim × plate state) pair must actually have RUN. A future
//     author who adds a claim and skips a state fails here, by the pair's name.
//   · **§P9 — the source scan**: this file reads ITSELF, finds every `it` that mounts without a
//     photograph and asserts on the tile's text, and requires each asserted token to be covered by
//     the registry. Add a content assertion on the default mount — a `27-F72` badge, an allergen
//     mark, a second money field — and §P9 reddens naming the test and the token, because that
//     assertion has no photographed twin. It is §0's move one level up: assert the PROPERTY of the
//     file rather than trusting the next author to remember.
//
// **Round-4 numbers, measured 2026-08-16** against a third plausible implementation written
// out-of-tree from this file's contract (the implementation is not in the tree and never was —
// `ItemTile.tsx` does not exist yet, so this suite is still committed RED against the product):
// **35/35 green**, and the untouched implementation is the CONTROL at 35/35. Then seven mutants,
// one behaviour each, **7/7 killed**. §P's tests are numbered by position: P1 name, P2 price,
// P3 category, P4 price-size, P5 unknown price, P6 free item, P7 sold out.
//
//   N1 price dropped when photographed      → 5 failed / 30 passed — P2 P4 P5 P6 P7, all in §P
//   N2 category dropped when photographed   → P3 ALONE   (1 failed / 34 passed)
//   N5 name dropped when photographed       → 3 failed / 32 — P1 P4 P5, all in §P
//   N6 `Sold out` dropped when photographed → P7 ALONE   (1 / 34)
//   N3 `minWidth` pinned at the largest floor, `minHeight` still deriving → F2 ALONE (1 / 34)
//   N7 price at caption type when photographed      → P4 ALONE (1 / 34)  ← mine, same axis
//   N8 unknown-price line dropped when photographed → P5 ALONE (1 / 34)  ← mine, same axis
//
// **N1 and N5 are the two that spread, and the spread is a property of the CLAIMS not of the
// suite:** deleting the whole price node also deletes the unknown-price line and the free item's
// `Rs 0`, and deleting the name also deletes the element P4 measures the price AGAINST. Five
// claims read the price and three read the name, so a mutant that removes one dies five and three
// times. The first test named owns the diagnosis; the others are consequences, and they say so.
//
// **N7 and N8 are mine, and they are the whole argument for a registry over four hand-written
// photographed tests:** neither was in the adversary's list, both are on the axis it found, and
// both die because a claim already existed and the sweep pointed it at a photograph. Four tests
// aimed at N1/N2/N5/N6 would have closed exactly those four.
//
// **The tripwires were mutated too, because a guard nobody has broken is a guard nobody has
// tested** — and this file's own round-3 note records a fix in which the wave's defect reproduced
// inside it. Mutating the TEST FILE rather than the implementation:
//
//   T1 a TRUE content assertion (`toContain("Rice")`) added to a plateless test only — it PASSES
//      on the plateless tile, so nothing else in the suite reacts   → **P9 ALONE** (1 / 34)
//   T2 one of the two photographed plate states deleted     → **SURVIVES, CORRECTLY** — the other
//      still takes the photograph branch, so nothing is lost and a red here would be noise
//   T2b BOTH photographed states deleted                    → P8 ALONE (1 / 34)
//   T2c both replaced by collapsed ones, axis length preserved (the honest version of T2b: the
//      axis still LOOKS five-wide and takes the branch nowhere) → P8 ALONE, on the fixture-property
//      assertion by name: *"no plate state actually takes the photograph branch"*
//   T3 one claim skipped in the photographed states         → P8 ALONE (1 / 34)
//   T4 the registry emptied                                 → 8 failed / 27 — the seven sweeps and
//      P8's `24-F14` floor, which is the assertion that exists for exactly this
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE ADVERSARY CAME BACK A THIRD TIME AND FOUND THE SAME HOLE ONE AXIS OVER: `CLAIMS` SWEPT
// **TEXT** AND NOTHING ELSE. THE FIX IS THE SAME SHAPE AS §P ITSELF — WIDEN THE CLAIM, NOT THE
// TEST COUNT — AND THE LESSON IS THAT A REGISTRY IS ONLY AS WIDE AS ITS ASSERT SIGNATURE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// `Claim.assert` took a bare `HTMLElement`. So the sweep could ask what the tile SAID in every
// plate state and could not ask anything else: the press handler, the flag's fill, the price's
// colour and the `27-F8` floor were asserted on the plateless default mount only, exactly as the
// price had been before §P existed. Five one-branch mutants lived there at **35/35**:
//
//   N12 a photographed tile does not sell   → `27-F70`'s CLOSING CLAUSE, the sentence §P quotes
//                                             as its own epigraph
//   N9  the flag painted `fault` when photographed          → `27-F75`, red is for broken things
//   N13 the flag painted the identity hue when photographed → `27-F74` (c)
//   N10 the price coloured when photographed                → `27-F16`
//   N11 the floor pinned at the largest value when photographed → `27-F68` (a)
//
// **N12 is the one to feel.** There were five `press(` sites in this file and **not one pressed a
// tile that renders a photograph** — §B7 presses a photoless tile and a `coverage: "none"` tile,
// which are the two states where the photograph branch is never taken. A restaurant that paid to
// shoot its menu could ring nothing, and every test was green. That is N1's shape one axis over,
// which makes it the THIRD time this file has been caught by "the prop is exercised at both values
// and asserted at one" — and the first time the unasserted half was not text at all.
//
// **The fix is `Claim.assert(mounted, plate)`**: the whole mount (so a claim can press) and the
// plate props it was mounted under (so the geometry claim can re-mount four postures inside its
// own plate state). Six claims joined the registry — the press, the sold-out press, the unpriced
// refusal as their control, the flag's fill, the money's colour, the floor — and `FACT_PROBES`
// teaches §P9 to police them the way it already policed text.
//
// **AND §P9's OWN SCAN HAD TWO EVASIONS, both one line, both found by the same adversary:**
//   · **TW2 — this file's own idiom escaped it.** The scan read `.toContain(`, `.toMatch(` and
//     `exactText(x,` only, so the same true plateless-only fact written as find-then-assert
//     (`const el = elements(c).find(e => norm(e.textContent) === "Rice"); expect(el)
//     .toBeDefined()`) contributed **0** to `checked` — and that is how `exactText` and
//     `letteredPlate` are themselves written here, so it is the form a future author reaches for
//     first. Closed by four more token forms.
//   · **TW7 — §G WAS ALREADY EXEMPT.** The skip was textual and whole-block, and a block ran to
//     the next `it(`/`describe(` — so §G's block swallowed the top-level registry region below it,
//     matched `photo: PHOTO`, and was classified photographed. An orphan `toContain("Rice")` added
//     to §G passed 35/35. Closed twice over: blocks now end at the registry marker as well, and
//     the skip is §P8's SEMANTIC predicate applied per `mount(` call — because §B6 is this file's
//     own proof that `photo:` present ≠ photograph rendered.
//
// **Round-5 numbers, measured 2026-08-16** against a fourth plausible implementation written
// out-of-tree from this file's contract: **41/41 green**, and the untouched
// implementation is the CONTROL at 41/41. Then seven implementation mutants, one behaviour each,
// **7/7 killed**, every one by the sweep that owns it and by NO other test:
//
//   N12 photographed tile does not sell → 2 failed / 39: "sells whatever the plate is doing" and
//       "still sells a sold-out item" — two claims read the press, so both name it; the unpriced
//       control stays GREEN, which is what proves the pair is aimed rather than merely present
//   N9  flag painted `fault`            → the flag-fill sweep ALONE (1 / 40), on the assertion
//       whose message is *"sold out painted as a fault"*: `expected #9B0A0F not to be #9B0A0F`
//   N13 flag painted the identity hue   → the flag-fill sweep ALONE (1 / 40), on the assertion
//       naming `27-F74` (c): `the identity hue for "rice" on a status surface`
//   N10 price coloured                  → the money sweep ALONE (1 / 40)
//   N11 floor pinned at the largest     → the floor sweep ALONE (1 / 40)
//   N14 the unpriced REFUSAL lost when photographed → the unpriced sweep ALONE (1 / 40)  ← mine
//   N15 the flag's fill softened by `opacity` when photographed → the flag sweep ALONE  ← mine
//
// **N9 and N13 land on the same test and on DIFFERENT assertions, and that cost an edit.** The
// claim's first draft asserted the exact `abnormal` token first, which subsumes both — a fill that
// IS `abnormal` is neither `fault` nor an identity hue — so the two FR-specific assertions beside
// it could never be the one that failed, and both mutants reported the same generic message. That
// is `K-3`'s dead-oracle shape in miniature: an assertion present, correct, and unreachable.
// Specific diagnosis first, catch-all last.
//
// **N14 and N15 are mine, on the axis the adversary found, and they are again the argument for a
// registry over hand-written photographed tests:** neither was in its list, and both die because a
// claim already existed and the sweep pointed it at a photograph.
//
// **The tripwires were re-attacked, including both evasions, and two of the fixes needed a
// tripwire of their own because they could not redden by themselves:**
//
//   TW7 an orphan `toContain("Rice")` on §G (true, plateless-only)    → **P9 ALONE** (1 / 40),
//       naming the token and the test: `"Rice"   (asserted by "renders the price in the default
//       foreground…")`. Against the previous draft this was green.
//   TW2 the same fact as find-then-assert                             → **P9 ALONE** (1 / 40)
//   T1  the round-4 orphan, re-run on §A                              → P9 ALONE (1 / 40)
//   T5  a NEW KIND of probe (`borderOf`) added plateless-only         → P9 ALONE, and T5b — the
//       same helper with nothing else to catch it — dies on the classification list BY NAME
//       (`borderOf`), which is the assertion that exists so round 5 cannot happen a second time
//   T6  the money claim DELETED from the registry → P9 names `styleUp` as an orphan probe
//   T7  the floor claim DELETED  → P9 names `minHeight` and `minWidth` (`px` and `tileOf` stay
//       covered by other claims, which is the correct answer and not a miss)
//   T8  the registry-marker bound reverted   → P9 ALONE, naming §G by title
//   T9  the semantic skip reverted to the textual whole-block one → P9 ALONE
//   T2b both photographed plate states deleted → P8 ALONE · T2c the honest version → P8 ALONE
//   T3  one claim skipped in the photographed states → P8 ALONE
//   T4  the registry emptied → 14 failed / 27: every sweep plus P8's `24-F14` floor
//
// **T8 SURVIVED ITS FIRST DRAFT AT 41/41 AND THE REASON IS WORTH MORE THAN THE FIX.** The bounds
// tripwire was written as `b.text.includes("CONTENT-CLAIM-REGISTRY")` — and `b.text` is the
// COMMENT-STRIPPED view, while the markers are comments. So the guard against a swallowed registry
// read a view with the registry's own markers deleted from it. That is `§C`'s vacuous-guard
// pattern reproduced inside the fix for it, for the third time in this file's history, and it was
// found only by mutating. It asserts on the block's `end` offset now.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ AND THE ADVERSARY CAME BACK A FOURTH TIME, FOUND THE SAME DISEASE ON THREE MORE AXES, AND THE
// FIX IS THE LAST ONE THIS FILE SHOULD EVER NEED TO MAKE: STOP CHOOSING AN AXIS.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Rounds 3, 4 and 5 each closed ONE axis — the fixture (`Chicken Karahi`), then `photo`, then the
// non-text facts — and each was beaten on the next. Round 6's adversary found **eight one-branch
// survivors at 41/41**, and its diagnosis is about method rather than about the eight:
//
//   > `posture` is exercised at four values and asserted at one; `category` at twelve and asserted
//   > at one; `coverage × photo` at five cells of six. This is group (ii) of the file's own
//   > recorded round-3 findings, reproduced one axis over, **inside the fix for it.**
//
//   X1 no price when `posture: "handheld"`                    → `27-F69`, the FR's OWN filed defect
//   X6 no price when `category: "extra"`                      → `27-F69`, one slug of twelve
//   X2 no price on `coverage: "full"` with no photo           → `27-F69`, one cell of six
//   X5 the plate dropped on `coverage: "full"` with no photo  → `27-F70` (b)
//   X3 an unpriced item sells when it is ALSO `soldOut`       → `27-F69`/`01-F60`
//   X7 the flag painted `fault` when `posture: "handheld"`    → `27-F75`
//   X8 all twelve tints collapse to one at `handheld`         → `27-F74`
//
// **Adding a posture axis and a category axis would have produced a seventh round on whatever axis
// was left.** So §P no longer sweeps a chosen axis: it sweeps the CROSS PRODUCT of every
// small-domain prop — `posture` (4) × plate state (6, the sixth being X2/X5's missing cell) ×
// `category` (12) × `name` (4) × `soldOut` (2) × price kind (3) — at **all-pairs (pairwise)
// coverage**, which is the standard mechanism for exactly this and is small: **72 cells of 6,912**
// (48 where a scope narrows the plate axis), generated by greedy set cover rather than written by
// hand. (⚠ *`name` is the round-7 addition and the count is the round-6 count: the space went from
// 1,728 to 6,912 and the sweeps still run 72 cells, because all-pairs is bounded by the largest
// PAIR product and 12 categories × 6 plates did not move.*)
//
// **THE DELIVERABLE IS §P8, NOT THE SWEEPS.** It asserts the COVERAGE PROPERTY over the cells that
// actually RAN: every feasible value of every axis, and every feasible PAIR of values, for every
// claim. §P8b asserts the other direction — every prop of the declared contract is an axis or is
// named with the reason it is not — so **a prop added later with no cells reddens BY NAME** rather
// than being swept silently at whatever value `mount()` defaults it to. That pair is what makes a
// seventh round unnecessary: the next unasserted prop value is not reachable by choosing better.
//
// **Round-6 numbers, measured 2026-08-16** against a FIFTH plausible implementation written
// out-of-tree from this file's contract (this author's, written without reading the shipped one):
// **45/45 green**, and the untouched implementation is the CONTROL at 45/45. All seven mutants
// above were first confirmed to SURVIVE the round-5 suite at 41/41 against that same
// implementation, then **7/7 killed**, each by the sweep that owns it:
//
//   X3 → "refuses an unpriced item in every cell" ALONE (1 failed / 44), on 12 of its 72 cells:
//        `[… soldOut=sold out, price=unpriced] an item with no price added a line anyway`
//   X7 → "fills the sold-out flag with `abnormal`, solid" ALONE (1 / 44), 36 of 72 cells, on the
//        `27-F75` assertion by name: `expected #9B0A0F not to be #9B0A0F`
//   X8 → "tints the lettered plate with its own category" ALONE (1 / 44), 11 of 48 cells:
//        `the identity tint for "karahi": expected #9A6809 to be #A2432B`
//   X5 → the plate sweep (which owns the diagnosis) and the tint sweep (2 / 43) — the tint claim's
//        scope contains the cell whose plate has just been deleted, so it says so too
//   X1 X2 X6 → 6 / 39 each, "carries its price in every cell" first and then the five other claims
//        that read a price. That spread is a property of the CLAIMS and not of the suite: deleting
//        the price node also deletes the free item's `Rs 0`, the struck price and the money whose
//        colour §G is about. The first test named owns the diagnosis; the rest are consequences.
//
// **NOTHING WAS BLUNTED, and that was measured rather than asserted.** Every mutant from rounds 3,
// 4 and 5 was re-run against the same implementation: M1 M3 M4 M8 M9 M11–M21 M24–M27 M30 and
// N1 N2 N5 N6 N9–N15 — **all still killed**. The two one-branch CONTROLS that make the kill counts
// mean anything both survive intact: **M17** (`disabled={soldOut}`) fails the two press sweeps and
// **NOT** the unpriced refusal, **M18** (no refusal at all) fails the refusal sweep and **NOT**
// the sold-out press, and **M4** (`Boolean(paisa)`) still fails the free-item claims while the
// unknown-price claim stays green.
//
// **The two scan evasions this round found are TW8 and TW9b, and both needed a control of their
// own because a tripwire cannot redden by itself:**
//
//   TW8  §P9's NON-TEXT HALF COULD NOT FIRE AT ALL. It asked whether each of the 13 `FACT_PROBES`
//        NAMES appeared in the registry region — and all 13 did, so the orphan list was
//        structurally empty and only a brand-new probe could ever have produced one. Proven end to
//        end: a real `27-F64`/`27-F66` assertion on the sold-out flag's own FOREGROUND, added to
//        §D1 and asserted nowhere else, was green. It keys on the FACT now — probe, SUBJECT and
//        literal argument, with the block's `const` aliases resolved — so the mutant dies **P9
//        ALONE (1 / 44)** naming `styleUp("Sold out", "color") (a NON-TEXT fact probed by "takes
//        `abnormal`, not `fault`")`, while `styleUp(PRICE_TEXT, "color")` stays covered by the
//        money claim. **The CONTROL is the same assertion with the keying reverted to probe names:
//        45/45 GREEN.** A second tripwire inside §P9 fails if every fact key ever collapses back
//        to its probe's name.
//   TW9b THE HELPER-EXHAUSTIVENESS SCAN MISSED `function` DECLARATIONS. `/^const (\w+) = \(/gm`
//        does not match `function borderOf(el) {…}`, so the one form a JS author is likeliest to
//        reach for walked past the check that exists to stop round 5 recurring. Mutant: that
//        helper, used on a default mount only → **P9 ALONE (1 / 44)**, `expected [ 'borderOf' ] to
//        deeply equal []`. **CONTROL: the same helper with the scan reverted → 45/45 GREEN.**
//
// **The older tripwires were re-attacked and all still bite** (T1 → 2 / 43, §A first and P9
// second; TW2 the find-then-assert form → P9 ALONE; T8 the swallowed registry → P9 ALONE; T9 the
// textual skip → P9 ALONE), **and four new ones cover the new machinery:**
//   T3   `pairwiseCells(...).slice(0, 10)` — the sweep quietly stops covering the space it claims
//        → **P8 ALONE**, naming 2,255 gaps beginning `name: no cell had category=sides`
//   T4   a claim added to the registry and swept by no test → **P8 ALONE**, by the claim's name
//        (this one fired for real during authoring, an hour after being written — see the free
//        item's achromatic zero)
//   T2b  both photographed plate states deleted · T2c the honest version, replaced by collapsed
//        ones so the axis still LOOKS six wide → **P8b ALONE** both times: `expected [ 'lettered',
//        'none' ] to deeply equal [ 'lettered', 'none', 'photo' ]`
//   T2d  a plate state MISLABELLED (`plate: "photo"` over props that render a letter) → the plate
//        sweep and P8b, because the declared kind is asserted against the props that produce it
//   T10  a new prop on the contract (`density?: "regular" | "large"`) with no axis → **P8b ALONE**,
//        `expected [ 'density' ] to deeply equal []`
//   T11  a claim pointed at a scope that cannot reach the cell it is about → its own sweep, 72/72
//
// **One false positive was found by running this and it is worth recording, because the fix could
// have gone the other way.** The money-achromatic claim first read `exactText(c, shown)` where
// `shown` was a ternary over the cell's price kind — so its FACT key named `"Rs 0"`, §G's named
// `PRICE_TEXT`, and §P9 reported §G as an orphan. The tempting fix is to loosen the fact key; the
// correct one was to split the claim in two, one per price kind, each naming its own literal —
// which also asserts both money strings achromatic instead of whichever the ternary happened to
// pick. **A scan that is precise enough to fire is precise enough to be wrong, and the answer to a
// false positive is a clearer claim, never a blunter scan.**
//
// ⚠ **AND THE SAME LESSON BIT A THIRD TIME IN THE SAME HOUR, ONE RAIL OVER.** Running this
// package's own suite after the typecheck was clean found `discipline.test.ts` RED — *"item-tile
// .dom.test.tsx contains a hex colour"* — because the ROUND-5 header quoted a mutation's output
// verbatim, with the hex inside the single quotes vitest prints, and that rail bans a quoted hex
// anywhere in this directory, comments included. **It was red before this round started**, so the
// round-5 evidence paragraph shipped a failing package suite for as long as it stood, and the
// round-6 draft added two more instances before anyone ran it. The quotes are dropped now
// (`expected #9B0A0F not to be #9B0A0F`), which is what the rail actually objects to — a hex
// wearing the costume of a VALUE — and the digits stay because they are the evidence. The general
// point, for the third time on this page: **an oracle that has never been run under its own
// package's gates is not evidence about anything, and the gate it fails is usually not the one it
// was thinking about.**
//
// ⚠ *And then the paragraph you are reading REPRODUCED THE DEFECT IT DESCRIBES* — its first draft
// quoted the offending line verbatim, quotes and all, and reddened the same rail one run later. It
// is left recorded rather than quietly fixed because this file has now done that four times (a
// tripwire that read a comment-stripped view of the comments it guarded; a "no degradation" guard
// that banned a field it required; a vacuous fix inside a fix) and the shape is always the same:
// **the example of a defect is written in the defect's own language, by the person who has just
// understood it.**
//
// **Measured against the SHIPPED component, 2026-08-16, after all of the above landed:
// `pnpm -C packages/ui test` is `Test Files 28 passed (28)` · `Tests 437 passed (437)`** — so the
// eight survivors above are mutants of an out-of-tree build and are NOT defects of `ItemTile.tsx`
// as it stands. That is worth stating in both directions: this round found no defect in the
// shipped component, and it closed the eight ways one could have been shipped without a red test.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ AND A SEVENTH TIME — BUT NOT ON AN AXIS. BOTH SURVIVORS WERE IN THE MECHANISM ITSELF: A
// COVERAGE PROPERTY MEASURED AGAINST THE THING IT GUARDS, AND AN EXEMPTION WRITTEN IN PROSE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Round 6 replaced *choosing an axis* with the cross product and said that made a seventh round
// unnecessary. It was right about the axes and wrong about the mechanism, and the two holes below
// are the same defect one level up: **a guard whose oracle is the thing it is guarding.**
//
// **(1) §P8 COULD NOT SEE A NARROWED AXIS, BY CONSTRUCTION.** It measures the cells that RAN
// against `feasible()` — and `feasible()` is built from the same `AXES` literal, so **both sides
// move together**. §P8b asserted the SOURCE constants (twelve slugs, `27-F8`'s order, `27-F70`'s
// three words) and never that the axes ARE those constants, and a `.slice()` sits exactly in that
// gap. Measured against the round-6 file, one keystroke each, all against a CORRECT
// implementation:
//
//   posture: FLOOR_POSTURES.slice(0, 2)          → **45/45 GREEN**  (brings back X1, X7, X8)
//   category: CATEGORIES.slice(0, 6)             → **45/45 GREEN**  (brings back X6)
//   plate: PLATE_STATES.slice(0, 3).map(…)       → **45/45 GREEN**  (brings back X2, X5)
//
// Five of this file's seven headline mutants, resurrected by three keystrokes that no assertion
// in it could see. And it is not a vandalism-only case: this header's own closing paragraph names
// the pressure — *"a suite that takes a minute is a suite people stop running"* — so a `.slice()`
// on the slowest axis is the first thing a blocked implementer reaches for. **Closed by six
// `toEqual` lines in §P8b**, each axis against the constant it claims to be.
//
// **(2) `SWEPT_BY` WAS UNVERIFIED PROSE, AND ONE ENTRY WAS FALSE.** The table mapped each prop to
// the axis that sweeps it *or to a sentence*, and `name` carried
// *"not a small domain — §B4 sweeps four names and four initials instead"*. **§B4 sweeps four
// names at ONE posture, ONE category, ONE plate and ONE price kind.** Nothing checked that a
// stated reason was true, so a prop could be exempted from the cross product BY WRITING A
// SENTENCE — the disease re-entering through the door built to stop it. Live in that gap:
//
//   X9 the plate's letter hard-coded to the fixture's initial whenever `posture !== "counter"`
//      → **SURVIVED 45/45**. That is M24 — this file's own round-3 kill — alive again one axis
//      over: `letteredPlate(c, NAME)` accepts the constant because `NAME` is the only name the
//      sweep mounts, and §P9 cannot see it because `letteredPlate` is a `PLATE_PROBE`, exempt by
//      name. The CONTROL X10 (the letter keyed to the CATEGORY) died 7/38, so the plate claims
//      were aimed all along — at one name.
//
// **Closed by crossing `name` and by making the table checkable rather than droppable.** Three
// things, and the third is the one that closes the class:
//   · `name` is the sixth axis. The space is 4 × 6 × 12 × 4 × 2 × 3 = **6,912 cells**, and the
//     sweeps still run **72** of them (48 where a scope narrows the plate axis) — **multiplying
//     the space by four cost ZERO cells**, because all-pairs is bounded by the largest pair
//     product (12 categories × 6 plates) and that did not move. That is the whole argument for
//     crossing a prop instead of exempting it, in one measurement.
//   · `SWEPT_BY` is `Record<string, AxisName>`, so **a sentence no longer COMPILES** —
//     `TS2322: Type '"not a small domain — …"' is not assignable to type '"category" | "name" |
//     "plate" | "posture" | "price" | "soldOut"'`, which is the earliest a false claim can
//     possibly be reported.
//   · every mapping is then checked against what was actually MOUNTED: the prop must take more
//     than one value across the cells that RAN. An axis can exist, be full, and reach the
//     component at one value anyway — which is exactly what `name` did through `propsOf`.
//   · the one prop with no value domain (`onPress`, the harness's own spy) discharges a
//     machine-checked obligation instead of a reason: more than one claim must read it, and their
//     recorded cells must cover every value of every axis.
//
// **Round-7 numbers, measured 2026-08-16** against a SIXTH plausible implementation written
// out-of-tree from this file's contract by this author, without reading the shipped one:
// **45/45 green**, and the untouched implementation is the CONTROL at 45/45. Then **43
// implementation mutants, 43/43 killed** — the seven round-6 X mutants, the M set (M1 M2b M3 M4
// M8 M9 M11–M21 M24–M27 M30) and the N set (N1 N2 N5 N6 N9–N15), all re-run against the same
// build, **nothing blunted**:
//
//   X9  → **2 / 43**: the plate sweep (which owns the diagnosis) and the tint sweep, whose scope
//         contains the cell whose plate has just gone missing — the same pair, in the same order,
//         as X5. Against the round-6 suite the same mutant was 0 / 45.
//   X10 → 7 / 38 (CONTROL, unchanged) · X11 (the NAME dropped only off-counter, mine) → 5 / 40
//   X1 X2 X6 → 7 / 38 each · X3 → the refusal sweep ALONE · X7 → the flag sweep ALONE
//   X5 → 2 / 43 · X8 → the tint sweep ALONE
//   **The three one-branch CONTROLS still separate what they were built to separate:** M17
//   (`disabled={soldOut}`) fails the two press sweeps and NOT the unpriced refusal; M18 (no
//   refusal at all) fails the refusal sweep and NOT the sold-out press; M4 (`Boolean(paisa)`)
//   fails the free-item claims while the unknown-price claim stays green.
//
// **The tripwires were mutated too, and every one bites ALONE unless it says otherwise:**
//   A1–A4 each axis narrowed (posture, category, plate, name) → **P8b ALONE (1 / 44)**, by the
//         axis's name · A5 (price) and A6 (a substituted `soldOut` list of the SAME LENGTH) →
//         P8 and P8b, because emptying a scope also empties a sweep
//   B1b   a prop + axis + `SWEPT_BY` row added and never wired into `propsOf`, read by no claim
//         → **P8b ALONE**, which is the control proving the mapping check is aimed rather than
//         riding the sweeps
//   B2    one of the three claims stops reading `onPress` → **P8b ALONE**, naming the price value
//         its cells no longer cover · B3 a new prop with no axis → **P8b ALONE**
//   T3    `pairwiseCells(...).slice(0, 10)` → P8 · T4 a claim swept by no test → **P8 ALONE**
//   T2b   both photographed plate states deleted → **P8b ALONE**
//   T1    a true plateless-only `toContain` → **P9 ALONE** · TW2 the find-then-assert form →
//         **P9 ALONE** · T8 the swallowed registry → **P9 ALONE** · T9 the textual skip →
//         **P9 ALONE** · TW9b a `function`-declared probe → **P9 ALONE**
//   TW8   a real `27-F64` assertion on the flag's own FOREGROUND, added to §D1 and asserted
//         nowhere else → **P9 ALONE**, which is what proves the round-6 fact keying still FIRES
//         after this round touched it.
//
// **ONE FALSE POSITIVE, AND IT IS THE PART WORTH READING.** Crossing `name` re-points every claim
// that read the fixture at `cell.name` — and §P9 then reported `fontPx(NAME)`, `fillOf(NAME)` and
// `isStruck(NAME)` as orphans of §A2, §B3, §C1, §C3 and §D3: **five assertions declared unswept by
// the widening that had just swept them.** `NAME` and `cell.name` are one fact under two names,
// exactly as `CATEGORY` and `cell.category` are — and the token scan had already been given that
// rule, with that reason, one screen below. So the fold is now applied to identifier subjects and
// **not** to string literals, which is the half that tells `styleUp("Sold out", …)` from
// `styleUp(PRICE_TEXT, …)` and is the whole of the round-6 TW8 fix. **CONTROL: reverting the fold
// is 1 / 44 on §P9** (the false positive returns) and TW8's mutant still dies **P9 ALONE** with
// the fold in place — so the scan was made narrower in one place and lost nothing in the other.
// The file's standing rule survives intact: the answer to a false positive is a clearer claim,
// never a blunter scan — and here the clearer claim is that a fixture and the axis that sweeps it
// are the same subject.
//
// **What this round says about the next one, which is the only reason it is written down:** both
// survivors were guards checked against their own input. §P8 asked whether the cells covered the
// axes and took the axes from the literal it was auditing; `SWEPT_BY` asked nothing at all and
// took a sentence. **When a guard's oracle is derived from the thing it guards, it reports the
// mutant as compliant** — and no amount of crossing more props fixes that, because the defect is
// not in the space, it is in what the property is measured against. The test to apply to the next
// guard added here: *name the input this assertion would fail on, and check that the input cannot
// be edited into agreement with it.*
//
// **Owed, and deliberately not invented here:** `01-F58`'s contested case (`Sold out — disputed`)
// needs a third state on this prop, and its producer is the availability fold's contested flag,
// which is a data-path decision above this component. A `soldOut?: boolean` cannot express it.
// Recorded so the implementer's plan can raise it rather than discover it.
//
// **Also owed, and named so the next adversary does not have to find it:** all-pairs coverage is a
// claim about PAIRS. A defect that needs three specific values at once — say a price dropped only
// on a sold-out handheld with no photo — is not guaranteed to be reached, and every one of round
// 6's eight survivors and both of round 7's needed only one or two. Raising the strength to 3-wise
// is a one-line change to `pairsOf` and multiplies the cell count by roughly the third axis's
// width; it is not done here because nothing has yet been found that needs it, and a suite that
// takes a minute is a suite people stop running. ⚠ **That last clause is now load-bearing in the
// other direction too**: it is the motive the round-7 `.slice()` mutants imitate, and §P8b's six
// `toEqual` lines are what make a shortcut taken under that pressure fail loudly instead of
// quietly.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Paisa, paisa } from "@restos/domain";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { type Posture, palette, targetFor } from "../tokens/index";
import { type CategoryName, ItemTile } from "./ItemTile";

afterEach(cleanup);

/**
 * The twelve `27-F74` (e) slugs, as a `Record` over `CategoryName` so the list is EXHAUSTIVE by
 * construction and not merely well-typed.
 *
 * ⚠ IT WAS A `readonly CategoryName[]` UNTIL ROUND 6, WHICH IS A WEAKER CLAIM THAN IT LOOKS: an
 * annotated array catches a slug that is not in the union and cannot catch a slug the union has
 * and the array does not. That mattered the moment `category` became a swept AXIS — an axis is
 * exactly as complete as its domain, and a thirteenth allocated identity would otherwise be
 * asserted at zero cells while every test stayed green. As a `Record` it fails to COMPILE, which
 * is the earliest a missing value can possibly be reported. (`K-3`'s recorded failure was an
 * oracle that declared the interface it existed to deliver and then asserted against a hand-copy,
 * leaving both symbols dead; this is the same lesson at the level of a set.)
 */
const CATEGORY_SLUGS: Record<CategoryName, true> = {
  rice: true,
  karahi: true,
  bbq: true,
  bread: true,
  drinks: true,
  sweet: true,
  sides: true,
  soup: true,
  snacks: true,
  cold: true,
  combo: true,
  extra: true,
};
const CATEGORIES = Object.keys(CATEGORY_SLUGS) as readonly CategoryName[];

/** The light palette is the one every surface ships (`27-F19`, amended August 2026). */
const light = palette.light;

/**
 * ⚠ THE ITEM'S NAME AND ITS CATEGORY SHARE NO SUBSTRING, AND §0 ASSERTS THAT RATHER THAN TRUSTING
 * IT. This file's first draft mounted `"Chicken Karahi"` in category `karahi`, so every
 * `tileText().toLowerCase()).toContain("karahi")` in §B and §E was satisfied by the ITEM'S OWN
 * NAME — and an implementation that dropped the category label in exactly the two states those
 * assertions exist to protect (a plateless menu, a sold-out tile) passed the whole suite. A
 * fixture that answers the question is the quietest way for a test to go vacuous, because nothing
 * about the assertion looks wrong.
 */
const NAME = "Mutton Biryani";
/** `rice` occurs in no string this file mounts or expects, so `toContain(CATEGORY)` has one source. */
const CATEGORY: CategoryName = "rice";
const IDENTITY_TINT = light[`bgColor-identity-${CATEGORY}` as const];
/**
 * Four names, four initials, none containing any of the twelve slugs (§0 checks all four).
 * `NAMES[0]` is `NAME`, so the default mount is one of them and §B4 varies what every other test
 * holds fixed — the `K-4` axis this file had left unvaried.
 */
const NAMES: readonly string[] = [NAME, "Seekh Kabab", "Falooda", "Zinger Burger"];
/** Rs 2,500 exercises `27-F23`'s Western 3-digit grouping; no digits of it are `86` (§D4). */
const PRICE = paisa(250_000);
const PRICE_TEXT = "Rs 2,500";

type Props = {
  posture?: Posture;
  name?: string;
  paisa?: Paisa | null;
  category?: CategoryName;
  coverage?: "full" | "partial" | "none";
  photo?: string;
  soldOut?: boolean;
  onPress?: () => void;
};

const mount = (over: Props = {}) => {
  const onPress = vi.fn();
  const { container } = render(
    <ThemeProvider>
      <ItemTile
        posture="counter"
        name={NAME}
        paisa={PRICE}
        category={CATEGORY}
        onPress={onPress}
        {...over}
      />
    </ThemeProvider>,
  );
  return { onPress, container };
};

const norm = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** Everything the tile puts in front of the cashier, as one string. */
const tileText = (container: HTMLElement): string => norm(container.textContent);

/** Every element in the tile, deepest-first, so a text match lands on the leaf that owns it. */
const elements = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>("*")).sort(
    (a, b) => b.querySelectorAll("*").length - a.querySelectorAll("*").length,
  );

/** The innermost element whose whole text is exactly `text`, or `undefined`. */
const exactText = (container: HTMLElement, text: string): HTMLElement | undefined =>
  elements(container)
    .reverse()
    .find((el) => norm(el.textContent) === text);

/**
 * The first inline value of `prop` on `el` or any ancestor inside the tile.
 *
 * Walking UP rather than reading `el` is deliberate and is what keeps this suite from pinning DOM
 * structure: an implementation is free to put the fill on the tile and the text in a bare span, or
 * to bound the flag in its own box, and either answers the same question.
 */
const styleUp = (
  el: HTMLElement | undefined,
  prop: "background" | "backgroundColor" | "color" | "fontSize" | "textDecoration" | "opacity",
): string => {
  for (let node: HTMLElement | null = el ?? null; node; node = node.parentElement) {
    const value = node.style?.[prop];
    if (value) return value;
    if (node.tagName === "BODY") break;
  }
  return "";
};

const fillOf = (el: HTMLElement | undefined): string =>
  styleUp(el, "background") || styleUp(el, "backgroundColor");

/**
 * The nearest self-or-ancestor that actually declares the fill — the box that OWNS the colour.
 *
 * `fillOf` answers *"what colour is behind this?"*, which is the right question for §C's twelve-way
 * sweep and the wrong one for `27-F70` (b): painting the identity tint on the WHOLE TILE and
 * leaving the plate an empty box answers it identically. This says WHICH box is tinted, so an
 * assertion can ask whether that box is a plate or the tile.
 */
const filledBox = (el: HTMLElement | undefined): HTMLElement | undefined => {
  for (let node: HTMLElement | null = el ?? null; node; node = node.parentElement) {
    if (node.style?.background || node.style?.backgroundColor) return node;
    if (node.tagName === "BODY") break;
  }
  return undefined;
};

/**
 * Every inline `opacity` declared from `el` up to the tile root.
 *
 * `opacity` for state is banned in this package by `discipline.test.ts` — it shipped disabled-
 * reason text at 1.88:1 and defeated `27-F4` — so any value below 1 on a chain carrying a fact is
 * a defect, and both §D2 (the flag's solid fill) and §D3 (the struck price stays readable) ask
 * this about their OWN element rather than about the tile.
 */
const opacitiesUp = (el: HTMLElement | undefined): number[] => {
  const found: number[] = [];
  for (let node: HTMLElement | null = el ?? null; node; node = node.parentElement) {
    const raw = node.style?.opacity;
    if (raw) found.push(Number.parseFloat(raw));
    if (node.tagName === "BODY") break;
  }
  return found;
};

const fontPx = (el: HTMLElement | undefined, what: string): number => {
  const raw = styleUp(el, "fontSize");
  const value = Number.parseFloat(raw);
  expect(
    Number.isFinite(value),
    `${what} declares no inline fontSize — see the rendering conventions in this file's header. ` +
      "(If §A1 is also red, fix that first: this message is about type, and a price rendered as " +
      "`Rs 2,500.00` is not found here at all, which reads as a missing size and is not one.)",
  ).toBe(true);
  return value;
};

const px = (raw: string, what: string): number => {
  const value = Number.parseFloat(raw);
  expect(Number.isFinite(value), `the tile declares no inline ${what}`).toBe(true);
  return value;
};

/** `27-F75` — the price is STRUCK. Either the CSS or the semantic element satisfies it. */
const isStruck = (el: HTMLElement | undefined): boolean => {
  for (let node: HTMLElement | null = el ?? null; node; node = node.parentElement) {
    if (node.tagName === "S" || node.tagName === "DEL") return true;
    if ((node.style?.textDecoration ?? "").includes("line-through")) return true;
    if ((node.style?.textDecorationLine ?? "").includes("line-through")) return true;
    if (node.tagName === "BODY") break;
  }
  return false;
};

/** The pressable tile. Falls back to the rendered root so a refusing tile is still clickable. */
const tileOf = (container: HTMLElement): HTMLElement =>
  (container.querySelector<HTMLElement>("button") ?? container.firstElementChild) as HTMLElement;

const press = (container: HTMLElement): void => {
  fireEvent.click(tileOf(container));
};

/** The plate, in either of `27-F70`'s two rendered forms. */
const photoPlate = (container: HTMLElement): HTMLImageElement | null =>
  container.querySelector("img");
const letteredPlate = (container: HTMLElement, name: string): HTMLElement | undefined => {
  const initial = (name[0] ?? "").toLowerCase();
  return elements(container)
    .reverse()
    .find((el) => {
      const t = norm(el.textContent);
      return t.length > 0 && t.length <= 2 && t.toLowerCase().startsWith(initial);
    });
};

/**
 * `27-F8`'s table, in its own strictly-ascending order. Read by §F, by the floor claim in §P, and
 * — since round 6 — as the `posture` AXIS of the cross product.
 *
 * A `Record` over `Posture` for the same reason `CATEGORY_SLUGS` is one: a fifth posture must fail
 * to COMPILE rather than be swept at four values out of five. The declaration order is `27-F8`'s
 * own ascending order and §P8b asserts that `targetFor` agrees with it, because a `Record`'s keys
 * carry insertion order and nothing in the type system carries an ergonomic ladder.
 */
const POSTURE_FLOORS: Record<Posture, true> = {
  handheld: true,
  counter: true,
  kitchen: true,
  keypad: true,
};
const FLOOR_POSTURES = Object.keys(POSTURE_FLOORS) as readonly Posture[];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE PROBE CLASSIFICATION — every helper above is filed here, and §P9's last assertion requires
// the filing to be exhaustive.
//
// ⚠ THIS EXISTS BECAUSE §P9's FIRST DRAFT SWEPT **TEXT** AND NOTHING ELSE. Fill, colour, geometry
// and the press handler were asserted on the plateless default mount only, and five one-branch
// mutants lived there at 35/35 — including *"a photographed tile does not sell"*, which is
// `27-F70`'s closing clause, the sentence §P quotes as its own epigraph. A tripwire that scans one
// KIND of assertion is the same hole as a fixture that renders one VALUE of a prop; it just takes
// an axis longer to find.
//
// So the three lists below are the vocabulary §P9 reasons about, and the exhaustiveness check is
// what stops a future author adding a fourth kind of probe and inheriting the same hole silently.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Probes whose answer the plate is ALLOWED to change — and it is exactly three, all of them
 * questions about the plate itself. `27-F70` (a)/(b)/(c) is a statement about what the plate does;
 * everything else on the tile is what the FR's closing clause says the plate may not touch.
 */
const PLATE_PROBES: readonly string[] = ["photoPlate", "letteredPlate", "filledBox"];

/**
 * Non-text facts. A default-mount-only probe of any of these is an orphan exactly as a
 * default-mount-only `toContain` is, and §P9 treats the two identically — which was the whole of
 * the round-5 fix. (The list is names, not helpers: `onPress`, `minHeight` and `getAttribute` are
 * read directly.)
 *
 * ⚠ THE LIST IS NO LONGER THE KEY, AND THAT WAS ROUND 6's SECOND FINDING (TW8). §P9 asked whether
 * each NAME here appeared in the registry region; all thirteen did, so the orphan list was
 * structurally empty and only a brand-new probe could ever have produced one. It keys on the FACT
 * now — `styleUp` of WHICH element, for WHICH property — and this list is the vocabulary the fact
 * keys are built from rather than the check itself.
 */
const FACT_PROBES: readonly string[] = [
  "onPress",
  "press",
  "fillOf",
  "styleUp",
  "isStruck",
  "opacitiesUp",
  "fontPx",
  "px",
  "tileOf",
  "minHeight",
  "minWidth",
  "hasAttribute",
  "getAttribute",
];

/**
 * Text extraction, and the cross-product harness. Their SUBJECTS are what §P9's token scan reads;
 * none of them asks the tile a question, so none of them is owed a swept twin.
 */
const TEXT_AND_HARNESS: readonly string[] = [
  "mount",
  "norm",
  "tileText",
  "elements",
  "exactText",
  // The round-6 generator. `plateOf`, `propsOf`, `cellName`, `valuesOf` and `pairsOf` read CELLS,
  // never the DOM, and `pairwiseCells`/`feasible`/`sweep` are the machinery that mounts them.
  "plateOf",
  "propsOf",
  "cellName",
  "valuesOf",
  "pairsOf",
  "feasible",
  "pairwiseCells",
  "sweep",
];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §0 — THE FIXTURE ITSELF, ASSERTED RATHER THAN ASSUMED
//
// Not a claim about the component. A claim about this FILE, because the most serious hole an
// adversary found in it was not a missing assertion — it was a fixture that answered the question
// two present assertions were asking.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§0 — no item in this file is named after a category", () => {
  it("keeps every category assertion in §B, §C and §E honest", () => {
    // KILLS M22 and M23 (the two most serious, and both passed 22/22): the category label dropped
    // when `coverage === "none"`, and dropped when `soldOut` — the exact two states §B5 and §E1
    // were written to protect. Both survived because the item was `Chicken Karahi` in category
    // `karahi`: `toContain("karahi")` was satisfied by the NAME, so the LABEL was never checked in
    // either state, while both assertions read as though it were.
    //
    // This test does not close those holes — the fixture does. What it closes is the RECURRENCE:
    // rename the dish to `Chicken Karahi`, `Beef Bihari BBQ` or `Sweet Lassi` and this fails here,
    // by name, instead of silently emptying four assertions three sections away.
    const rendered = [...NAMES, PRICE_TEXT, "Rs 0", "Sold out"].join(" ").toLowerCase();
    for (const category of CATEGORIES) {
      expect(
        rendered.includes(category),
        `the fixture text already contains the slug "${category}" — every ` +
          `toContain(category) assertion in this file can now pass without a category label`,
      ).toBe(false);
    }
    // And the default mount's own category, which is the one §B5/§E1 assert against by name.
    expect(NAME.toLowerCase().includes(CATEGORY)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §A — 27-F69: EVERY SELLABLE THING SHOWS ITS PRICE
//
// > 27-F69 **Every sellable thing shows its price, wherever it is selectable.** *(August 2026,
// > founder ruling. Filed because the shipped counter did not — 36 tiles, no price on any of
// > them, for the whole of Wave 1.)* A tile … renders that price, in `27-F23`'s format, at a size
// > no smaller than the item's own name. … **A price that is unknown is stated as unknown**
// > (`00 §5.7`) and the tile is not sellable; it is never rendered as blank or as zero.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§A 27-F69 — the tile carries its price, in 27-F23's format", () => {
  it("renders the price beside the name, grouped Western 3-digit, symbol-first, no decimals", () => {
    // KILLS: the shipped Wave-1 tile, which rendered a name and nothing else — this FR's own
    // filing note. And it kills the naive formatter in the same assertion: `Rs ${p / 100}` yields
    // `Rs 2500` (no grouping), `₨`/`PKR` fails the symbol, and `toFixed(2)` yields `Rs 2500.00`.
    // `27-F23` is explicit on all four: `Rs`, symbol-first, Western 3-digit grouping (Pakistan
    // does NOT inherit lakh grouping — `Rs 25,00` would be the lakh mutant), no decimals.
    const { container } = mount();
    expect(tileText(container)).toContain(NAME);
    expect(tileText(container), "27-F69's filed defect: a sellable tile with no price").toContain(
      PRICE_TEXT,
    );
    // ⚠ THE LINE ABOVE CANNOT SEE A SUFFIX, AND `Rs 2,500.00` CONTAINS `Rs 2,500`. KILLS M27:
    // `toFixed(2)` passed this test 22/22 and died three sections away in A2, D3 and G — tests
    // whose messages talk about type size, strike and colour — so the suite reported a money-format
    // defect as three unrelated ones and told the implementer the wrong thing every time.
    // Two independent assertions, because they fail for different reasons and should say so:
    // the price is EXACTLY `27-F23`'s string, and no decimal reaches an operational screen.
    expect(
      exactText(container, PRICE_TEXT),
      `27-F23 — no element renders exactly "${PRICE_TEXT}": a decimal (Rs 2,500.00), lakh ` +
        "grouping (Rs 25,00), ₨/PKR, or a price split across two elements",
    ).toBeDefined();
    expect(
      tileText(container),
      "27-F23 — a decimal on an operational screen: no sub-rupee unit circulates and the " +
        "decimal point is the highest-consequence keystroke there is",
    ).not.toMatch(/\.\d/);
  });

  it("renders the price no smaller than the name", () => {
    // KILLS: the price relegated to caption type under the dish. That is the implementation an
    // author reaches for — the name "is" the tile and the price "is" a detail — and it is the one
    // the FR names: a grid whose price cannot be read across the counter forces the cashier to add
    // the line and read the cart, "which is the error path, not the happy one".
    // `>=` and not `>`: the FR says "no smaller than", so equal sizes are compliant.
    const { container } = mount();
    const nameSize = fontPx(exactText(container, NAME), "the item name");
    const priceSize = fontPx(exactText(container, PRICE_TEXT), "the price");
    expect(
      priceSize,
      `27-F69: the price (${priceSize}px) is smaller than the name (${nameSize}px)`,
    ).toBeGreaterThanOrEqual(nameSize);
  });

  it("states an unknown price as unknown — never blank, never Rs 0", () => {
    // KILLS: `paisa ?? 0`, `paisa || 0` and `formatPaisa(paisa as Paisa)` — the three ways a null
    // price becomes `Rs 0` on glass. A cashier reading `Rs 0` charges nothing for a dish; a
    // cashier reading a blank cell assumes the tile is still loading. `00 §5.7` puts the honesty
    // requirement on the surface, and `01-F60` puts the reason with it ("rendered disabled in
    // place with its reason, 27-F4").
    //
    // The exact wording is the implementer's, inside `27-F71` (c)'s ban on internal vocabulary —
    // this asserts only that the tile SAYS something about the price, so `No price set` and
    // `Price unknown` both pass and `` (blank) and `Rs 0` both fail.
    const { container } = mount({ paisa: null });
    expect(tileText(container), "an unknown price rendered as money").not.toMatch(/Rs\s/);
    expect(tileText(container), "an unknown price rendered as blank or zero").toMatch(/price/i);
    expect(tileText(container), "27-F4 — the tile is disabled in place, not emptied").toContain(
      NAME,
    );
  });

  it("prices a FREE item as Rs 0 and keeps it sellable — a zero price is not an unknown one", () => {
    // ⚠ THE CONTROL FOR THE ASSERTION ABOVE, and the sharpest one in §A. `01-F60` (founder ruling,
    // July 2026) makes `modifier` sellable and states the consequence in terms: **"a free modifier
    // carries an explicit `0` on every enabled pair … it distinguishes 'this costs nothing' from
    // 'somebody forgot foodpanda', and those are indistinguishable under any rule that lets an
    // unpriced modifier through."**
    //
    // KILLS: `if (!paisa)`, `paisa ? … : unknown`, and every other falsy test — all of which pass
    // the null test above for the WRONG reason and then refuse to sell a free add-on. Without this
    // cell, "refused because the price is unknown" is indistinguishable from "refused because the
    // number was zero", which is the recorded round-3 defect (a test that cannot tell a refusal
    // for the right reason from any refusal).
    const { container, onPress } = mount({ paisa: paisa(0) });
    expect(tileText(container)).toContain("Rs 0");
    // KILLS M27 on the zero case too — `Rs 0.00` contains `Rs 0`, and a free modifier is where a
    // stray `toFixed(2)` is least likely to be noticed by eye.
    expect(exactText(container, "Rs 0"), "27-F23 — a free item priced as `Rs 0.00`").toBeDefined();
    expect(tileText(container), "a free item described as having no price").not.toMatch(/price/i);
    press(container);
    expect(onPress, "01-F60 — a free modifier is SELLABLE, not unpriced").toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §B — 27-F70: PHOTOGRAPHY IS OPTIONAL, AND ALL THREE COVERAGE STATES ARE FIRST-CLASS
//
// > (a) An item **with** a photo renders it in the tile's plate. (b) An item **without** one
// > renders a plate tinted by its category carrying the item's initial — a designed surface, never
// > an empty box or a placeholder graphic … (c) A menu with **no** photography at all drops plates
// > entirely and the tile collapses to a compact row with a category rule … **Nothing in the sale
// > path may depend on a photo existing**, which is what makes (a) and (b) interchangeable at any
// > moment.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§B 27-F70 — three coverage states, all deliberate", () => {
  it("(a) renders the photograph when the item has one", () => {
    const { container } = mount({ photo: "/menu/mutton-biryani.jpg" });
    expect(photoPlate(container)?.getAttribute("src")).toBe("/menu/mutton-biryani.jpg");
  });

  it("(a) renders it on a FULLY photographed menu too — all three coverage words are mounted", () => {
    // KILLS M25: `coverage === "partial" ? plate : nothing` — a tile that drops plates on every
    // menu except the default one, so a restaurant that paid to shoot its whole menu sees none of
    // it. `"full"` was mounted NOWHERE in this file before the adversarial round, which is how a
    // three-valued prop came to be exercised at two values with every test green: the default
    // covers one, the interesting case covers another, and the third is nobody's fixture.
    // The three values now appear as: `full` here, `partial` by default everywhere else, `none` in
    // §B5 and §B6.
    const { container } = mount({ coverage: "full", photo: "/menu/mutton-biryani.jpg" });
    expect(
      photoPlate(container)?.getAttribute("src"),
      "27-F70 (a) — a photograph the restaurant paid for, not rendered on a `full` menu",
    ).toBe("/menu/mutton-biryani.jpg");
  });

  it("(b) renders a category-tinted plate carrying the initial when it has none", () => {
    // KILLS: the empty box, and the grey box. The FR forbids both by name — "a designed surface,
    // never an empty box or a placeholder graphic, and never a generic stock photograph of a
    // different kitchen's food" — so this asserts the two things that make it designed: it carries
    // the ITEM's initial (not a generic glyph) and it carries the CATEGORY's tint (not a neutral).
    // An implementation rendering `<div class="plate" />` passes any "the plate exists" check and
    // fails both of these.
    const { container } = mount();
    expect(photoPlate(container), "a placeholder graphic where the FR asks for a plate").toBeNull();
    const plate = letteredPlate(container, NAME);
    expect(plate, "27-F70 (b) — no plate carrying the item's initial").toBeDefined();
    expect(fillOf(plate), "an empty box: the plate carries no category tint").toBe(IDENTITY_TINT);
    // ⚠ ANCHORED, AND THE LINE ABOVE IS WHY. `fillOf` walks UP — deliberately, so that an
    // implementation may bound the plate however it likes — which means painting the identity tint
    // on the WHOLE TILE and leaving the plate genuinely empty satisfies it. KILLS M28, which
    // passed 22/22 while rendering the *"empty box"* that this assertion's own message names and
    // that `27-F70` (b) forbids by name. The property, and it pins no structure: the box that
    // DECLARES the tint is a plate, and a plate is not the thing carrying the item's name.
    const tinted = filledBox(plate);
    expect(
      norm(tinted?.textContent),
      "27-F70 (b) — the identity tint is on the tile, not on a plate: the box declaring it also " +
        "carries the item's name, so the plate itself is the empty box the FR refuses",
    ).not.toContain(NAME);
  });

  it("(b) takes the plate's letter and its words from THIS item — four names, four initials", () => {
    // ⚠ THE ASSERTION THAT VARIES THE NAME. §C1 varies the CATEGORY twelve ways and every other
    // test in this file mounts one `NAME`, so nothing established the plate's letter as the ITEM's:
    // KILLS M24, a plate hard-coding `"C"` (the initial of the old fixture) that passed 22/22.
    // This is `K-4`'s recorded round-3 failure one axis over — ~90 renders varying `spec` and
    // `profile`, never `data`, so an implementation ignoring `data` passed.
    // The four initials are M/S/F/Z, so a plate keyed to the CATEGORY (`rice` → `R`) or to any
    // other constant fails on at least three of the four. It also kills a tile rendering a
    // hard-coded name, which no other assertion in this file could see.
    for (const name of NAMES) {
      const { container } = mount({ name });
      expect(tileText(container), `the tile does not render the item's name "${name}"`).toContain(
        name,
      );
      expect(
        letteredPlate(container, name),
        `27-F70 (b) — no plate carrying "${name}"'s own initial "${name[0]}"`,
      ).toBeDefined();
      cleanup();
    }
  });

  it("(c) drops the plate entirely on a menu with no photography, and keeps the sale payload", () => {
    // KILLS: ignoring `coverage` — the tile that renders 40 lettered plates on a text-only menu,
    // which is the exact surface the FR's "a menu with nothing to show shows more menu" refuses.
    // The second half of the assertion is what stops the fix going too far: dropping the plate must
    // not drop the name, the price or the category rule with it.
    const { container } = mount({ coverage: "none" });
    expect(photoPlate(container)).toBeNull();
    expect(
      letteredPlate(container, NAME),
      "27-F70 (c) — a lettered plate on a menu with no photography",
    ).toBeUndefined();
    expect(tileText(container)).toContain(NAME);
    expect(tileText(container)).toContain(PRICE_TEXT);
    // ⚠ RE-AIMED. This assertion existed from the first draft and could not fail: it read
    // `toContain("karahi")` against an item named `Chicken Karahi`, so the ITEM'S NAME satisfied
    // it and the category label — the whole subject of the message beside it — was never checked
    // in the one state this test owns. KILLS M22, the category label dropped when the menu has no
    // photography, which is the most likely place to lose it: (c) collapses the tile, and the
    // "category rule" is the thing a hurried implementation collapses with it.
    expect(tileText(container).toLowerCase(), "the category rule went with the plate").toContain(
      CATEGORY,
    );
  });

  it("(c) drops the plate even when the ITEM has a photo, because the MENU says none", () => {
    // KILLS M26: `photo ? <img/> : coverage === "none" ? null : <plate/>` — a tile that reads
    // `coverage` only when it has nothing to show anyway. It passed 22/22 because §B5, which owns
    // the FR's word *entirely*, mounted `photo: undefined` — so the case the word is ABOUT was
    // never rendered, and the assertion that would have failed was the one nobody wrote.
    //
    // This is the second pinned interpretation in this file's header, asserted: `coverage` is a
    // MENU-level fact and it outranks the item's own `photo`. The simpler reading — a photo always
    // wins — is named there with its reasons, so an implementer who thinks this is wrong has an
    // argument to make against a stated position rather than a red test to guess at.
    const { container } = mount({ coverage: "none", photo: "/menu/mutton-biryani.jpg" });
    expect(
      photoPlate(container),
      "27-F70 (c) — plates dropped `entirely` still rendered this one, so the row this menu " +
        "collapses to has two heights, which is the 27-F4 defect the same FR protects against",
    ).toBeNull();
    expect(letteredPlate(container, NAME)).toBeUndefined();
    expect(tileText(container), "27-F4 — the payload went with the plate").toContain(NAME);
    expect(tileText(container)).toContain(PRICE_TEXT);
    expect(tileText(container).toLowerCase()).toContain(CATEGORY);
  });

  it("sells with no photo and on a plateless menu — nothing in the sale path depends on one", () => {
    // KILLS: a press handler wired to the plate rather than to the tile, or guarded on an image
    // having loaded. The FR's closing clause is the whole point of the prop being optional: (a) and
    // (b) are "interchangeable at any moment", so an owner uploading a photo mid-shift must not be
    // the thing that makes an item sellable.
    const withoutPhoto = mount();
    press(withoutPhoto.container);
    expect(withoutPhoto.onPress).toHaveBeenCalledTimes(1);
    cleanup();

    const plateless = mount({ coverage: "none" });
    press(plateless.container);
    expect(plateless.onPress).toHaveBeenCalledTimes(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §C — 27-F74: IDENTITY COLOUR IS WAYFINDING, NEVER A CONDITION
//
// > (a) An identity colour **never encodes a condition** — not availability, not urgency, not
// > error; a category tint means only *which category* … (b) It is **always accompanied by the
// > category's name**, so it is never the only signal and `27-F12` is preserved. (c) It **never
// > appears on a status surface** — no identity hue may tint a badge, band, alarm or any control
// > whose meaning is a state …
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§C 27-F74 — the tint says WHICH CATEGORY and nothing else", () => {
  it("gives each of the twelve categories its own allocated token", () => {
    // ⚠ THE ASSERTION THAT VARIES THE DATA. The recorded round-3 failure (`K-4`) varied `spec` and
    // `profile` across ~90 renders and never varied `data`, so an implementation ignoring the data
    // entirely passed. Here the DATA is the category, so all twelve are rendered.
    //
    // KILLS, each by at least one cell: a constant tint; `identityFor(name)` hashing the item name
    // instead of the category; an off-by-one in a slug→token map; and `bgColor-identity-${index}`
    // built off array position. A single-category fixture passes every one of those.
    for (const category of CATEGORIES) {
      const { container } = mount({ category });
      expect(fillOf(letteredPlate(container, NAME)), `identity tint for ${category}`).toBe(
        light[`bgColor-identity-${category}` as const],
      );
      cleanup();
    }
  });

  it("always renders the category's name beside its tint", () => {
    // KILLS: the tile that carries the tint alone. `27-F74` (b) is what keeps the twelve-hue spend
    // inside `27-F12` — a tint with no word is colour carrying meaning by itself, and it is
    // illegible to the 1-in-20 male staff `27-F17` counts. Swept over all twelve because a single
    // fixture cannot distinguish "renders the category" from "renders one literal word".
    // ⚠ Eleven of these twelve cells bit from the first draft; the TWELFTH (`karahi`) did not,
    // because the fixture was named `Chicken Karahi` — §0 is what stops that returning here.
    for (const category of CATEGORIES) {
      const { container } = mount({ category });
      expect(tileText(container).toLowerCase(), `no category name for ${category}`).toContain(
        category,
      );
      cleanup();
    }
  });

  it("does not change the tint when the item sells out", () => {
    // KILLS: tinting the plate grey, amber or `bgColor-status-abnormal` when `soldOut` is true —
    // the single most natural thing to reach for, and a direct breach of (a): "an identity colour
    // never encodes a condition — not availability". Once the tint moves with availability, a
    // cashier scanning for the Karahi block finds it in a different colour than the one she
    // learned, which is the wayfinding this palette was spent to buy.
    const available = mount({ soldOut: false });
    const availableTint = fillOf(letteredPlate(available.container, NAME));
    cleanup();
    const sold = mount({ soldOut: true });
    const soldTint = fillOf(letteredPlate(sold.container, NAME));
    expect(soldTint, "27-F74 (a) — the identity tint moved with availability").toBe(availableTint);
    expect(soldTint).toBe(IDENTITY_TINT);
  });

  it("never tints the sold-out flag with the category's hue", () => {
    // KILLS: painting the status flag in the identity colour so the tile "matches". (c) forbids
    // exactly that, and the reason is measurable rather than aesthetic: the `27-F15` ΔE00 ≥ 20
    // floor is computed over the `27-F14` set ALONE, with identity colours "excluded from it by
    // construction" — so a status surface wearing an identity hue is a status colour that was
    // never gated for separation against the other three.
    // Two DIFFERENT categories on purpose: an implementation tinting the flag by category gives
    // two different fills here, and one that hardcodes a single identity token still fails §D1.
    const rice = mount({ category: CATEGORY, soldOut: true });
    const riceFlag = fillOf(exactText(rice.container, "Sold out"));
    cleanup();
    const drinks = mount({ category: "drinks", soldOut: true });
    const drinksFlag = fillOf(exactText(drinks.container, "Sold out"));
    expect(riceFlag, "27-F74 (c) — an identity hue on a status surface").toBe(drinksFlag);
    expect(riceFlag).toBe(light["bgColor-status-abnormal"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §D — 27-F75 + 27-F12: SOLD OUT IS THE `abnormal` SLOT, SOLID, WITH A STRUCK PRICE AND A FLAG
//
// > For sold-out specifically: the slot is **`abnormal`** (a chosen operating state needing
// > attention, not a fault — red stays for things that are broken), and its urgency comes from
// > (i) a **solid fill rather than a soft tint** … (iii) **placement on the working surface** —
// > the struck price and `86` flag on the Order grid, where a cashier is actually looking …
//
// > 27-F12 **Colour never carries state alone.** Every status is **colour + shape + position + a
// > number**.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§D 27-F75 — sold-out takes the abnormal slot and states itself four ways", () => {
  it("takes `abnormal`, not `fault`", () => {
    // KILLS: red. The FR pre-empts it in the same sentence — "a chosen operating state needing
    // attention, not a fault — red stays for things that are broken" — and the cost of getting it
    // wrong is a cashier who cannot tell a finished dish from a broken printer at a glance, which
    // is the whole priority map `27-F15`'s lightness ladder exists to build.
    const { container } = mount({ soldOut: true });
    const flag = exactText(container, "Sold out");
    expect(fillOf(flag)).toBe(light["bgColor-status-abnormal"]);
    expect(fillOf(flag), "27-F75 — sold out painted as a fault").not.toBe(
      light["bgColor-status-fault"],
    );
  });

  it("fills solid, never as a soft tint", () => {
    // KILLS the implementation the FR was filed against: "a soft-tinted badge on a tab nobody
    // opens is what made amber feel weak; the hue was never the problem." Two ways to soften a
    // fill and both are covered — an alpha derivative (`rgba(…, 0.15)`, a lightened hex) fails the
    // exact-token check, and `opacity: 0.2` over the real token fails the chain check.
    const { container } = mount({ soldOut: true });
    const flag = exactText(container, "Sold out");
    expect(fillOf(flag), "a derived tint where 27-F75 (i) requires the solid fill").toBe(
      light["bgColor-status-abnormal"],
    );
    // (Unchanged in substance — the hand-rolled walk that used to sit here is now `opacitiesUp`,
    // because §D3 needs the same question asked about a DIFFERENT element. Note what this covers
    // and what it does not: the FLAG's chain. An `opacity` on the price is invisible to it, which
    // is M30 and is §D3's to kill.)
    expect(
      opacitiesUp(flag).filter((o) => o < 1),
      "27-F75 (i) — the abnormal fill softened by opacity",
    ).toEqual([]);
  });

  it("strikes the price and keeps the number on screen", () => {
    // KILLS two implementations at once, and they fail in opposite directions:
    //   · hiding the price when sold out — `27-F12` requires a NUMBER as one of the four channels,
    //     and `27-F69` requires the price wherever the item is selectable, which an 86'd item
    //     still is (`01-F59`);
    //   · showing it unchanged — then the tile says "sold out" in a word and "for sale at Rs 2,500"
    //     in the number, and the FR asks for the struck price by name.
    const { container } = mount({ soldOut: true });
    const price = exactText(container, PRICE_TEXT);
    expect(
      price,
      "27-F12 — the number channel dropped when the item sold out (or the price is not rendered " +
        "as exactly 27-F23's string, in which case §A1 is red too and owns the diagnosis)",
    ).toBeDefined();
    expect(isStruck(price), "27-F75 (iii) — the price is not struck").toBe(true);
    // ⚠ ANCHORED (1). `isStruck` walks UP, so `line-through` on the whole tile satisfies the line
    // above — and strikes the DISH'S NAME with it. KILLS M29, which passed 22/22 and renders a
    // tile that reads as a deleted menu ITEM rather than an unavailable price: `27-F75` (iii)
    // strikes the price, and nothing in it or in `02-F52` strikes the name of a dish the kitchen
    // will cook again tomorrow. The control is the assertion above: an implementation that strikes
    // neither still fails it, so this pair distinguishes "struck the right thing" from "struck".
    expect(
      isStruck(exactText(container, NAME)),
      "27-F75 — the item's NAME is struck through as well as its price",
    ).toBe(false);
    // ⚠ ANCHORED (2). §D2 asks about opacity on the FLAG's chain only, so fading the price to
    // `opacity: 0.4` while keeping the flag's fill solid passed both tests. KILLS M30. `27-F12`
    // requires the NUMBER as one of its four channels and a channel at 0.4 is not a channel — this
    // is the same defect this package's `discipline.test.ts` was written against, where state
    // carried by opacity put disabled-reason text at 1.88:1 and defeated `27-F4`. Struck is a
    // shape; faded is a legibility loss, and the FR asked for the first.
    expect(
      opacitiesUp(price).filter((o) => o < 1),
      "27-F12/27-F4 — the struck price is faded by opacity, so the number channel is unreadable",
    ).toEqual([]);
  });

  it("flags it with the words `Sold out`, and never with the digits 86", () => {
    // ⚠ THE PINNED INTERPRETATION IN THIS FILE'S HEADER, ASSERTED. `02-F52`: the rendered strings
    // are `Sold out` … "the jargon stays in the FRs and the code comments … but it never reaches
    // glass or paper", under `00 §5.6`'s English-only law.
    // KILLS: (1) a tile that carries the state in colour alone — `27-F12`'s first sentence, and
    // invisible to a deuteranope; (2) an implementer who read `27-F75`'s "86 flag" literally, which
    // is what the task brief for this component itself paraphrased.
    // Case-insensitive on purpose: `text-transform: uppercase` is a rendering choice happy-dom
    // cannot distinguish from an authored string, and blocking it would be a test that stays red
    // against a correct implementation.
    const { container } = mount({ soldOut: true });
    expect(tileText(container), "27-F12 — sold-out carried by colour alone").toMatch(/sold out/i);
    expect(tileText(container), "02-F52 — `86` reached glass").not.toMatch(/\b86\b/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §E — 27-F4 + 01-F17/01-F59: DISABLED IN PLACE, AND AN 86'd ITEM IS STILL SELLABLE
//
// > 01-F59 **Availability is not an `01-F17` block.** … the counter may still sell it
// > deliberately — `02-F31` owns the oversell path.
//
// > 01-F60 … **An unpriced item is not an 86'd item.** If the order's channel has no price, the
// > item cannot be added … It is rendered disabled in place with its reason (`27-F4`), never
// > removed from the grid … **This is the opposite disposition to `01-F59` above, and
// > deliberately.**
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§E 27-F4/01-F59 — the two dispositions, and the difference between them", () => {
  it("keeps a sold-out tile in place with its whole payload", () => {
    // KILLS: `if (soldOut) return null`, and the grid-level filter that reaches for the same thing.
    // `27-F4` makes removing an item from an operational grid a BREAKING CHANGE — "23 of 34 field
    // subjects could not perform a task they knew well on a differently-arranged device" — so a
    // tile that vanishes when the kitchen runs out silently reorders every tile after it, mid-shift.
    const { container } = mount({ soldOut: true });
    const text = tileText(container);
    expect(text, "27-F4 — the tile vanished when it sold out").toContain(NAME);
    expect(text).toContain(PRICE_TEXT);
    // ⚠ RE-AIMED, and this test's own title calls the three lines here "its whole payload" — of
    // which the category was the one that was not actually being checked. With the old
    // `Chicken Karahi` fixture this read `toContain("karahi")` and passed on the NAME, so KILLS
    // M23: the category label dropped when the item sells out. That is a plausible implementation
    // rather than a contrived one — a sold-out tile grows a flag, and the label is what an author
    // drops to make room for it, on the one surface `27-F74` (b) says must never be tint-only.
    expect(
      text.toLowerCase(),
      "27-F74 (b) — the category label dropped when it sold out",
    ).toContain(CATEGORY);
    expect(letteredPlate(container, NAME), "the plate went with the availability").toBeDefined();
  });

  it("still sells a sold-out item, and never carries the `disabled` attribute", () => {
    // KILLS the exact regression `discipline.test.ts` records for `Tile` — `disabled={unavailable}`
    // — reappearing on the component that actually renders the menu. `01-F59` is explicit that
    // greying is "an explicit operational decision by staff, not the system withholding a sale",
    // and `02-F40`'s founder ruling names `02-F31`'s oversell handling as what absorbs a
    // printer-only kitchen's walk to the counter — which REQUIRES the counter to be able to sell.
    // Behavioural rather than a source grep, so any refusal mechanism (`disabled`, `aria-disabled`
    // plus a guard, a swallowed handler) fails it.
    const { container, onPress } = mount({ soldOut: true });
    const tile = tileOf(container);
    expect(tile.hasAttribute("disabled"), "01-F17 — a sale withheld on availability state").toBe(
      false,
    );
    expect(tile.getAttribute("aria-disabled") ?? "false").toBe("false");
    press(container);
    expect(
      onPress,
      "01-F59 — the counter may still sell an 86'd item deliberately",
    ).toHaveBeenCalledTimes(1);
  });

  it("refuses an unpriced item — the opposite disposition, and the control that proves aim", () => {
    // ⚠ THE CONTROL FOR THE TEST ABOVE. `01-F60` states the two dispositions side by side: an 86'd
    // item has a known price and stays deliberately sellable; an unpriced one "has nothing to sell
    // at". So the pair is a one-branch discriminator and neither half means anything alone:
    //   · an implementation that refuses BOTH (the obvious "grey it out" reading) fails §E2;
    //   · one that sells BOTH (no guard at all) fails here;
    //   · one that refuses on a truthiness test fails §A4 with a free modifier.
    // This is the recorded round-3 defect answered directly — without the pair, "refused for the
    // right reason" and "refused" are the same observation.
    const { container, onPress } = mount({ paisa: null });
    press(container);
    expect(
      onPress,
      "27-F69/01-F60 — an item with no price added a line anyway",
    ).not.toHaveBeenCalled();
    expect(tileText(container), "27-F4 — refused by removal instead of in place").toContain(NAME);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §F — 27-F8 / 27-F68: THE TILE TAKES A POSTURE, NEVER A SIZE
//
// > 27-F8 … counter POS grid tile | standing at a fixed terminal | **76 dp** … cash / numeric
// > keypad | **126 dp** … handheld waiter/rider | **64 dp** … kitchen bump / KDS action | **96 dp**
//
// > 27-F68 (a) **No pinned pixel constant.** … (b) **The minimum is the millimetre.** `27-F8`'s
// > 126 dp is a measured ergonomic floor; this FR changes how it is *rendered*, never what it *is*.
// > Reducing the millimetres to make a layout fit is forbidden.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§F 27-F8/27-F68 — the floor is derived from the posture", () => {
  const FLOORS = FLOOR_POSTURES;

  it("declares each posture's own 27-F8 floor", () => {
    // KILLS: a `minHeight` pinned at the literal 76. (Written that way round because writing the
    // property and the number together trips `discipline.test.ts`'s own `27-F8` literal sweep,
    // which reads every file in this directory including this one — the rail cannot tell a comment
    // quoting a mutant from a component committing one, and a red on a comment costs the
    // implementer the same hour as a real one.)
    // A pinned constant is `27-F68` (a)'s named error and it is invisible
    // to any single-posture fixture — a tile pinned at the counter's 76 dp renders a handheld
    // target 12 dp too large (harmless) and a KITCHEN one 20 dp too small, on the surface where
    // `27-F9` measured 21.34% wet-hand gesture error. `>=` because `27-F72` lets a sparse category
    // buy larger tiles; the floor is a minimum, never the size.
    for (const posture of FLOORS) {
      const { container } = mount({ posture });
      const tile = tileOf(container);
      expect(px(tile.style.minHeight, `minHeight for ${posture}`)).toBeGreaterThanOrEqual(
        targetFor(posture),
      );
      expect(px(tile.style.minWidth, `minWidth for ${posture}`)).toBeGreaterThanOrEqual(
        targetFor(posture),
      );
      cleanup();
    }
  });

  it("moves BOTH axes with the posture — four postures, four different floors, twice", () => {
    // KILLS the mutant the assertion above cannot: a tile pinned at the LARGEST floor (126) clears
    // every `>=` and is still a component that ignores its posture — and it would put a keypad-sized
    // tile on a waiter's phone, where `27-F2`'s ~12-tile page becomes ~4. `27-F8`'s table is
    // strictly ordered handheld < counter < kitchen < keypad, so the rendered floors must be too.
    //
    // ⚠ BOTH AXES, AND THIS TEST WALKED ONLY ONE UNTIL THE ROUND-4 ADVERSARY. KILLS N3: a tile
    // whose height derives from the posture while its WIDTH is pinned at the keypad's floor. §F1
    // cannot see it — every posture's floor is `<=` the largest, so a pinned largest passes every
    // `>=` on both axes — and this walk could not see it either while it read `minHeight` alone.
    // The consequence is not cosmetic: a handheld grid of keypad-WIDE tiles is `27-F2`'s ~12-tile
    // page reduced to a column, on the posture with the least glass in the product. Asserted per
    // axis so the failure names which one is pinned rather than saying "the floor is wrong".
    // Both axes are read from ONE mount per posture and named explicitly rather than through a
    // computed `style[axis]`. That is not a style preference: §P9 keys a non-text fact on the
    // probe AND ITS SUBJECT, and `tileOf(container).style[axis]` names the loop variable rather
    // than the property, so the two floors would read as one unnamed fact and neither would be
    // matched against the registry's own.
    const floors = FLOORS.map((posture) => {
      const { container } = mount({ posture });
      const tile = tileOf(container);
      const seen = {
        minHeight: px(tile.style.minHeight, `minHeight for ${posture}`),
        minWidth: px(tile.style.minWidth, `minWidth for ${posture}`),
      };
      cleanup();
      return seen;
    });
    for (const axis of ["minHeight", "minWidth"] as const) {
      const seq = floors.map((f) => f[axis]);
      expect(
        seq.every((value, i) => i === 0 || value > (seq[i - 1] ?? 0)),
        `27-F68 (a) — a pinned constant on ${axis}: ${FLOORS.join("/")} rendered ${seq.join("/")}`,
      ).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §G — 27-F16: MONEY IS NEVER COLOURED BY DEFAULT
//
// > 27-F16 **Money is never coloured by default.** Colour on a number means *this number is
// > abnormal*. Colouring the commonest number on screen spends the whole preattentive channel on
// > the base case.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("§G 27-F16 — the price on a resting tile is achromatic", () => {
  it("renders the price in the default foreground, not in the accent or a status hue", () => {
    // KILLS: a price rendered in `bgColor-interactive`'s accent to "make it pop", or in green
    // because it is money. `27-F14`'s August 2026 amendment names both by name — the SaaS design
    // round's first draft "rendered a resting Pay button in green and a resting change-due figure
    // in green, both of which spend the transient-confirmation slot on a base case".
    // Scoped to the RESTING tile deliberately: a sold-out tile's price sits on a solid `abnormal`
    // fill and must take that fill's paired foreground, so asserting achromatic money there would
    // be a test that stays red against a correct implementation.
    const { container } = mount();
    expect(styleUp(exactText(container, PRICE_TEXT), "color")).toBe(light["fgColor-default"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §P — THE CROSS PRODUCT, NOT AN AXIS: EVERY CLAIM RUNS IN A CELL SET THAT COVERS EVERY VALUE OF
//      EVERY SMALL-DOMAIN PROP AND EVERY **PAIR** OF THEM
//
// > (a) and (b) are **interchangeable at any moment** … **Nothing in the sale path may depend on
// > a photo existing.**
//
// Five rounds each closed ONE axis and were beaten on the next. The axis is not the lesson; the
// *chosen* axis is. §P swept `photo` (round 4) and then the non-text facts (round 5), and a sixth
// adversary found eight one-branch survivors at 41/41 by walking one prop over each time:
// `posture` was exercised at four values and asserted at one, `category` at twelve and asserted at
// one, `coverage × photo` at five cells of six.
//
// So the mechanism changes rather than the axis list. A CELL is one point in the product of the
// small-domain props — `posture` (4) × plate state (6) × `category` (12) × `name` (4) × `soldOut`
// (2) × price-kind (3) — and every claim runs over a generated set of cells with **all-pairs
// coverage**: every value of every axis appears at least once, and every combination of two axis
// values appears at least once. That is 72 cells out of 6,912 (48 under a scope that narrows the
// plate axis), and it is generated rather than written, so a claim cannot be aimed at a fixture's
// favourite corner.
//
// ⚠ **`name` JOINED IN ROUND 7 AND IT WAS THE LAST PROP EXEMPTED BY A SENTENCE.** `SWEPT_BY.name`
// read *"not a small domain — §B4 sweeps four names and four initials instead"*, and §B4 sweeps
// four names at one posture, one category, one plate and one price kind — so a plate hard-coding
// the fixture's initial off the counter posture (X9) survived 45/45, which is M24 one axis over.
// Nothing checked that a stated reason was TRUE, and that is the door §P8b now closes at the type
// level.
//
// **Read §P8 as the deliverable and the sweeps as its consequence.** The sweeps close the eight
// mutants this round's adversary found; §P8 asserts the COVERAGE PROPERTY over the cells that
// actually ran, and §P8b asserts that every prop in the contract is an axis or is named with the
// reason it is not. Those two are what make a seventh round unnecessary: the next unasserted
// prop-value cannot be reached by adding one more test, because the cells are not chosen by hand.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// CONTENT-CLAIM-REGISTRY-START
//
// ⚠ THE THREE PARTS BELOW ARE THE WHOLE MECHANISM AND NONE WORKS ALONE. `AXES` is the space;
// `pairwiseCells` is what picks the points in it; `CLAIMS` is what gets asserted at every one of
// them. A claim declares the SCOPE it is about (a free item's zero is not a claim about an
// unpriced tile) and the generator covers the pairs that are feasible inside that scope — so
// "refused for the right reason" stays distinguishable from "refused", one axis at a time.

/** Every rendered plate state `27-F70` can produce, named. `27 §1a`'s menus all appear here. */
const PHOTO = "/menu/mutton-biryani.jpg";

/**
 * The plate axis, with the plate each state must RENDER declared beside it.
 *
 * The fourth row is the round-6 addition and it is the `coverage × photo` cell that was missing:
 * an unphotographed item on a **fully** shot menu. `27-F70` (b) is unconditional — *"an item
 * without one renders a plate tinted by its category carrying the item's initial"* — and (c) is
 * the only clause that drops plates, scoped by its own words to a menu with **no** photography.
 * So the answer is a lettered plate, and X5 (the plate dropped in exactly this cell) is a breach
 * of (b), not a permitted reading of (c). Stated here so an implementer can dispute a position
 * rather than guess at a red test.
 *
 * The two unphotographed states OMIT `photo` rather than passing it as `undefined`: the rendered
 * state is identical (`mount()`'s default is no photo) and `exactOptionalPropertyTypes` is on, so
 * the explicit `undefined` is a type error that says nothing. That was not a style note until
 * August 2026, when it was **20 `TS2379` errors, every one this file's own** — a suite that
 * cannot pass `pnpm verify` is not a gate, whatever it asserts.
 */
type PlateKind = "photo" | "lettered" | "none";
type PlateState = { key: string; props: Props; plate: PlateKind };
const PLATE_STATES: readonly PlateState[] = [
  { key: "plateless — a partial menu, this item unphotographed", props: {}, plate: "lettered" },
  { key: "photographed — a partial menu, this item shot", props: { photo: PHOTO }, plate: "photo" },
  {
    key: "photographed — a fully shot menu",
    props: { coverage: "full", photo: PHOTO },
    plate: "photo",
  },
  {
    key: "unphotographed — a fully shot menu, this item not shot",
    props: { coverage: "full" },
    plate: "lettered",
  },
  { key: "collapsed — a menu with no photography", props: { coverage: "none" }, plate: "none" },
  {
    key: "collapsed — the item is shot, the menu says none",
    props: { coverage: "none", photo: PHOTO },
    plate: "none",
  },
];

/**
 * The price axis. `01-F60` makes these three genuinely different facts and not three numbers:
 * a free modifier carries an explicit `0` on every enabled pair, and an unpriced entry "has
 * nothing to sell at". The money each one puts on the glass is declared here so a claim asserts
 * against the fixture's own string rather than against a formatter it has re-implemented.
 */
type PriceKind = "priced" | "free" | "unpriced";
const PRICE_KINDS: Record<PriceKind, { props: Props }> = {
  priced: { props: { paisa: PRICE } },
  free: { props: { paisa: paisa(0) } },
  unpriced: { props: { paisa: null } },
};

/**
 * ⚠ THE AXES. Every small-domain prop of the contract is here, and §P8b is what keeps that true
 * when the contract grows — a prop added to `Props` with no axis fails there BY NAME rather than
 * being swept silently at whatever value the default mount happens to hold.
 *
 * ⚠ **EACH ENTRY IS ASSERTED AGAINST THE CONSTANT IT CLAIMS TO BE (round 7), AND THE REASON IS
 * THAT §P8 STRUCTURALLY CANNOT DO IT.** §P8 measures the cells that ran against `feasible()`,
 * which is built from THIS literal — both sides move together — so `posture:
 * FLOOR_POSTURES.slice(0, 2)`, `category: CATEGORIES.slice(0, 6)` and `plate:
 * PLATE_STATES.slice(0, 3).map(…)` were each **45/45 green** against a correct implementation
 * while resurrecting five of this file's own headline mutants. Six `toEqual` lines in §P8b are
 * what stand between that keystroke and a suite that reports it as coverage.
 */
const AXES = {
  posture: FLOOR_POSTURES,
  plate: PLATE_STATES.map((s) => s.key),
  category: CATEGORIES,
  name: NAMES,
  soldOut: ["available", "sold out"],
  price: Object.keys(PRICE_KINDS),
} satisfies Record<string, readonly string[]>;

type AxisName = keyof typeof AXES;
type Cell = Record<AxisName, string>;
const AXIS_NAMES = Object.keys(AXES) as AxisName[];

const plateOf = (cell: Cell): PlateState =>
  PLATE_STATES.find((s) => s.key === cell.plate) ?? (PLATE_STATES[0] as PlateState);

/** One cell → one mount. The plate's props and the price's props are spread last, by design. */
const propsOf = (cell: Cell): Props => ({
  posture: cell.posture as Posture,
  category: cell.category as CategoryName,
  name: cell.name,
  soldOut: cell.soldOut === "sold out",
  ...plateOf(cell).props,
  ...PRICE_KINDS[cell.price as PriceKind].props,
});

const cellName = (cell: Cell): string => AXIS_NAMES.map((a) => `${a}=${cell[a]}`).join(", ");

/** Every point in the product. 4 × 6 × 12 × 4 × 2 × 3 = 6,912 — enumerated, never all mounted. */
const FULL_CROSS: readonly Cell[] = AXIS_NAMES.reduce<Cell[]>(
  (cells, axis) => cells.flatMap((c) => AXES[axis].map((v) => ({ ...c, [axis]: v }) as Cell)),
  [{} as Cell],
);

const AXIS_PAIRS = AXIS_NAMES.flatMap((a, i) =>
  AXIS_NAMES.slice(i + 1).map((b) => [a, b] as const),
);
const valuesOf = (cell: Cell): string[] => AXIS_NAMES.map((a) => `${a}=${cell[a]}`);
const pairsOf = (cell: Cell): string[] =>
  AXIS_PAIRS.map(([a, b]) => `${a}=${cell[a]} × ${b}=${cell[b]}`);

/**
 * The scopes a claim can be about. A scope is a CONSTRAINT on the cell space, not a filter on the
 * assertions: the generator covers every pair that is feasible **inside** the scope, so a claim
 * about a sold-out tile still meets all four postures, all twelve categories and all six plates.
 */
const SCOPES = {
  "any tile at all": () => true,
  "priced — a real (branch, channel) price": (c: Cell) => c.price === "priced",
  "free — 01-F60's explicit zero": (c: Cell) => c.price === "free",
  "unpriced — nothing to sell at": (c: Cell) => c.price === "unpriced",
  "quoted — a number is on the tile": (c: Cell) => c.price !== "unpriced",
  "sold out": (c: Cell) => c.soldOut === "sold out",
  "sold out, and priced": (c: Cell) => c.soldOut === "sold out" && c.price === "priced",
  "sold out, and sellable": (c: Cell) => c.soldOut === "sold out" && c.price !== "unpriced",
  "resting — available and priced": (c: Cell) => c.soldOut === "available" && c.price === "priced",
  "resting — available and free": (c: Cell) => c.soldOut === "available" && c.price === "free",
  "the plate is the category's letter": (c: Cell) => plateOf(c).plate === "lettered",
} satisfies Record<string, (c: Cell) => boolean>;

type ScopeName = keyof typeof SCOPES;

const feasible = (scope: ScopeName): readonly Cell[] => FULL_CROSS.filter(SCOPES[scope]);

const CELLS_BY_SCOPE = new Map<ScopeName, readonly Cell[]>();

/**
 * ALL-PAIRS (pairwise) coverage by greedy set cover over the feasible cells, deterministic and
 * memoised per scope.
 *
 * The exhaustive product is 6,912 cells and mounting it fifteen times over is not a suite, it is
 * a nightly job. All-pairs is the standard answer and it is small — the floor is the largest pair
 * product (12 categories × 6 plates = 72, unmoved by round 7's sixth axis, which multiplied the
 * space by four and cost nothing) — because the empirical claim behind it is that a
 * defect that needs THREE specific prop values to appear is rare, while every one of the eight
 * survivors this round was reachable from ONE (`posture: "handheld"`, `category: "extra"`,
 * `coverage: "full"` with no photo) and a couple from a PAIR.
 *
 * Greedy, not random: a suite whose cell set moves between runs cannot be bisected, and a mutant
 * that dies on Tuesday and lives on Wednesday is worse than one that lives.
 */
const pairwiseCells = (scope: ScopeName): readonly Cell[] => {
  const cached = CELLS_BY_SCOPE.get(scope);
  if (cached) return cached;
  const cells = feasible(scope);
  const need = new Set(cells.flatMap(pairsOf));
  let pool = cells.map((cell) => ({ cell, pairs: pairsOf(cell) }));
  const chosen: Cell[] = [];
  while (need.size > 0 && pool.length > 0) {
    let best = pool[0] as (typeof pool)[number];
    let score = -1;
    for (const candidate of pool) {
      let covers = 0;
      for (const pair of candidate.pairs) if (need.has(pair)) covers += 1;
      if (covers > score) {
        score = covers;
        best = candidate;
      }
    }
    if (score <= 0) break;
    for (const pair of best.pairs) need.delete(pair);
    chosen.push(best.cell);
    pool = pool.filter((c) => c !== best && c.pairs.some((pair) => need.has(pair)));
  }
  CELLS_BY_SCOPE.set(scope, chosen);
  return chosen;
};

/** What one mount hands a claim. `onPress` is here because a press is a FACT the plate may not move. */
type Mounted = ReturnType<typeof mount>;

/**
 * A claim declares the scope it is about and receives the whole mount plus the CELL it was
 * mounted at.
 *
 * ⚠ THE CELL ARGUMENT IS THE ROUND-6 WIDENING AND IT IS NOT DECORATION. Round 5 handed a claim
 * the *plate props* it was mounted under, which was exactly enough to sweep the one axis that
 * round was about. A claim that cannot see its own category cannot assert the right tint, and a
 * claim that cannot see its own posture cannot assert the right floor — so the sweep would have
 * had to hold both fixed, which is the disease.
 */
type Claim = { scope: ScopeName; assert: (mounted: Mounted, cell: Cell) => void };

/**
 * Every claim this file makes about the tile, in one place, so that no prop can change the answer
 * to any of them. The assertions are the same ones §A, §B, §C, §D, §E, §F and §G make on the
 * default mount — deliberately the same, because the property being asserted is that the rest of
 * the props do not move them, and a re-worded paraphrase would be a second contract.
 */
const CLAIMS = {
  name: {
    scope: "any tile at all",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      // ⚠ `cell.name`, NOT `NAME`, AND THE WHOLE OF ROUND 7 IS IN THAT ONE ACCESSOR. Until then
      // `name` was the one prop of the contract that was exempted from the cross product BY A
      // SENTENCE — `SWEPT_BY.name` said *"not a small domain — §B4 sweeps four names"* — and §B4
      // sweeps four names at ONE posture, ONE category, ONE plate and ONE price kind. So the
      // registry mounted `NAME` in all ~72 cells and X9 (the plate's letter hard-coded to the
      // fixture's initial whenever the posture is not `counter`) survived 45/45: M24 alive again,
      // one axis over, in the file that records M24 as its own round-3 kill.
      expect(tileText(c), "27-F70 — the dish's name went with the plate").toContain(cell.name);
    },
  },
  price: {
    scope: "priced — a real (branch, channel) price",
    assert: ({ container: c }: Mounted) => {
      expect(tileText(c), "27-F69's filed defect: a sellable tile with no price").toContain(
        PRICE_TEXT,
      );
      expect(
        exactText(c, PRICE_TEXT),
        `27-F23 — no element renders exactly "${PRICE_TEXT}"`,
      ).toBeDefined();
      expect(tileText(c), "27-F23 — a decimal on an operational screen").not.toMatch(/\.\d/);
    },
  },
  category: {
    scope: "any tile at all",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      expect(tileText(c).toLowerCase(), "27-F74 (b) — the tint is the only signal").toContain(
        cell.category,
      );
    },
  },
  "price no smaller than the name": {
    scope: "priced — a real (branch, channel) price",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      const nameSize = fontPx(exactText(c, cell.name), "the item name");
      const priceSize = fontPx(exactText(c, PRICE_TEXT), "the price");
      expect(
        priceSize,
        `27-F69: the price (${priceSize}px) is smaller than the name`,
      ).toBeGreaterThanOrEqual(nameSize);
    },
  },
  "an unknown price stated as unknown": {
    scope: "unpriced — nothing to sell at",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      expect(tileText(c), "an unknown price rendered as money").not.toMatch(/Rs\s/);
      expect(tileText(c), "an unknown price rendered as blank or zero").toMatch(/price/i);
      expect(tileText(c), "27-F4 — the tile is disabled in place, not emptied").toContain(
        cell.name,
      );
    },
  },
  "a free item priced at zero": {
    scope: "free — 01-F60's explicit zero",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      expect(tileText(c), "01-F60 — a free modifier's explicit zero").toContain("Rs 0");
      expect(exactText(c, "Rs 0"), "27-F23 — a free item priced as `Rs 0.00`").toBeDefined();
      expect(tileText(c), "a free item described as having no price").not.toMatch(/price/i);
      const nameSize = fontPx(exactText(c, cell.name), "the item name");
      expect(
        fontPx(exactText(c, "Rs 0"), "the free item's zero"),
        "27-F69 — a free modifier's price relegated below its own name",
      ).toBeGreaterThanOrEqual(nameSize);
    },
  },
  "sold out, flagged and struck": {
    scope: "sold out, and priced",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      expect(tileText(c), "27-F12 — sold-out carried by colour alone").toMatch(/sold out/i);
      expect(tileText(c), "02-F52 — `86` reached glass").not.toMatch(/\b86\b/);
      // The flag as its OWN element, which is what §C4, §D1 and §D2 each reach for by name when
      // they ask what colour it is — so those three fill assertions have a swept twin too, and a
      // tile that merges the words into another run fails here rather than three sections away
      // with a message about identity hues.
      expect(exactText(c, "Sold out"), "27-F75 — no element carries the flag alone").toBeDefined();
      const price = exactText(c, PRICE_TEXT);
      expect(price, "27-F12 — the number channel dropped when the item sold out").toBeDefined();
      expect(isStruck(price), "27-F75 (iii) — the price is not struck").toBe(true);
      expect(
        isStruck(exactText(c, cell.name)),
        "27-F75 — the item's NAME is struck through as well as its price",
      ).toBe(false);
      expect(
        opacitiesUp(price).filter((o) => o < 1),
        "27-F12/27-F4 — the struck price is faded by opacity, so the number channel is unreadable",
      ).toEqual([]);
    },
  },

  // ── THE PLATE ITSELF, which is the one thing the plate axis is ALLOWED to move ───────────────
  //
  // `27-F70` (a)/(b)/(c) makes the plate a FUNCTION of the menu's coverage and the item's photo,
  // so it is not plate-invariant and it is not exempt either: it is asserted against the state
  // the axis DECLARES. That is what makes the fourth plate row bite — an unphotographed item on
  // a fully shot menu is (b)'s lettered plate, and a tile that drops it is not reading (c), it is
  // extending (c) to a menu (c) does not mention.

  "the plate is the one this item and this menu ask for": {
    scope: "any tile at all",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      const expected = plateOf(cell).plate;
      if (expected === "photo") {
        expect(
          photoPlate(c)?.getAttribute("src"),
          "27-F70 (a) — a photograph the restaurant paid for, not rendered in the plate",
        ).toBe(PHOTO);
      } else {
        expect(
          photoPlate(c),
          "27-F70 (b)/(c) — a photograph in a plate this menu does not photograph",
        ).toBeNull();
      }
      if (expected === "lettered") {
        // ⚠ `cell.name`'s INITIAL, and this is where X9 dies. A plate hard-coding the fixture's
        // `M` renders no plate carrying `Falooda`'s `F`, so this reddens on ~3 of every 4 names —
        // and while the registry mounted one name it was the same assertion, satisfied by the
        // same constant, in every cell it ran.
        expect(
          letteredPlate(c, cell.name),
          "27-F70 (b) — no plate carrying the item's initial. (b) is unconditional; (c) is scoped " +
            "by its own words to a menu with NO photography, so an unphotographed item on a fully " +
            "shot menu still gets the designed surface rather than an empty row",
        ).toBeDefined();
      }
      if (expected === "none") {
        expect(
          letteredPlate(c, cell.name),
          "27-F70 (c) — a lettered plate on a menu with no photography",
        ).toBeUndefined();
      }
    },
  },

  "the lettered plate carries the CATEGORY's identity tint": {
    scope: "the plate is the category's letter",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      const slug = cell.category as CategoryName;
      const plate = letteredPlate(c, cell.name);
      expect(plate, "27-F70 (b) — no lettered plate to tint").toBeDefined();
      expect(
        fillOf(plate),
        `27-F74 — the identity tint for "${slug}": a constant tint is a twelve-hue spend ` +
          "buying one hue of wayfinding, and the cashier scanning for a category block finds it " +
          "in the colour she learned or she does not",
      ).toBe(light[`bgColor-identity-${slug}` as const]);
      const tinted = filledBox(plate);
      expect(
        norm(tinted?.textContent),
        "27-F70 (b) — the identity tint is on the tile, not on a plate: the box declaring it also " +
          "carries the item's name, so the plate itself is the empty box the FR refuses",
      ).not.toContain(cell.name);
    },
  },

  // ── THE NON-TEXT CLAIMS (round 5). ───────────────────────────────────────────────────────────
  //
  // Read them as one answer to one question: **`27-F70`'s closing clause is not about text.**
  // *"Nothing in the sale path may depend on a photo existing"* is a sentence about the PRESS
  // HANDLER, and the suite quoting it as its own epigraph swept the tile's words and stopped.

  "sells — the sale path does not depend on the rest of the props": {
    scope: "quoted — a number is on the tile",
    assert: ({ container, onPress }: Mounted) => {
      press(container);
      expect(
        onPress,
        "27-F70 — this tile does not sell. `(a)` and `(b)` are interchangeable at any moment, so " +
          "an owner uploading a photo mid-shift must change the plate and nothing else — least " +
          "of all whether the item can be rung, and neither may a posture, a category or a menu",
      ).toHaveBeenCalledTimes(1);
    },
  },

  "sold out — still sells, and refuses nothing": {
    scope: "sold out, and sellable",
    assert: ({ container, onPress }: Mounted) => {
      const tile = tileOf(container);
      expect(tile.hasAttribute("disabled"), "01-F17 — a sale withheld on availability state").toBe(
        false,
      );
      expect(tile.getAttribute("aria-disabled") ?? "false").toBe("false");
      press(container);
      expect(
        onPress,
        "01-F59 — the counter may still sell an 86'd item deliberately",
      ).toHaveBeenCalledTimes(1);
    },
  },

  "unpriced — refused in place, whatever the rest of the props": {
    scope: "unpriced — nothing to sell at",
    assert: ({ container, onPress }: Mounted, cell: Cell) => {
      // ⚠ THE ONE-BRANCH CONTROL FOR THE TWO CLAIMS ABOVE, crossed with every other axis. Without
      // it, a tile that sells EVERYTHING — including the unpriced item `01-F60` refuses —
      // satisfies both press claims in every cell. `24 §3`'s recorded round-3 defect is exactly
      // this: a suite that cannot tell "refused for the right reason" from "refused". The
      // crossing is what makes it bite: `soldOut` is an axis here, so the sold-out unpriced tile
      // — the cell where "it is sold out, so of course it does not ring" hides a missing price
      // guard — is a cell this claim is guaranteed to reach.
      press(container);
      expect(
        onPress,
        "27-F69/01-F60 — an item with no price added a line anyway",
      ).not.toHaveBeenCalled();
      expect(tileText(container), "27-F4 — refused by removal instead of in place").toContain(
        cell.name,
      );
    },
  },

  "sold out — the flag takes the abnormal fill, solid": {
    scope: "sold out",
    assert: ({ container: c }: Mounted, cell: Cell) => {
      const flag = exactText(c, "Sold out");
      expect(flag, "27-F75 — no element carries the flag alone").toBeDefined();
      const fill = fillOf(flag);
      // ⚠ THE ORDER OF THESE THREE IS DELIBERATE AND WAS MEASURED. The exact-token assertion
      // subsumes both of the others — a fill that IS `abnormal` is neither `fault` nor an identity
      // hue — so putting it first makes the two beside it assertions that can never be the one
      // that fails, which is `K-3`'s dead-oracle shape in miniature. Specific diagnosis first,
      // catch-all last: `27-F75` pre-empts red BY NAME and `27-F74` (c) pre-empts the identity hue
      // BY NAME, and a mutant deserves to be told which sentence it broke.
      expect(
        fill,
        "27-F75 — sold out painted as a fault: red stays for things that are broken, and a " +
          "cashier who cannot tell a finished dish from a broken printer has lost the priority map",
      ).not.toBe(light["bgColor-status-fault"]);
      for (const category of CATEGORIES) {
        expect(
          fill,
          `27-F74 (c) — the identity hue for "${category}" on a status surface: identity colours ` +
            "are excluded from 27-F15's ΔE00 ≥ 20 floor by construction, so this is a status " +
            "colour that was never gated for separation against the other three",
        ).not.toBe(light[`bgColor-identity-${category}` as const]);
      }
      expect(
        fill,
        `27-F75 — the flag's fill moved with a prop that is not availability (${cellName(cell)})`,
      ).toBe(light["bgColor-status-abnormal"]);
      expect(
        opacitiesUp(flag).filter((o) => o < 1),
        "27-F75 (i) — the abnormal fill softened by opacity: `a soft-tinted badge on a tab " +
          "nobody opens is what made amber feel weak; the hue was never the problem`",
      ).toEqual([]);
    },
  },

  "money is achromatic on a resting tile": {
    scope: "resting — available and priced",
    assert: ({ container: c }: Mounted) => {
      // Scoped to the RESTING tile for the same reason §G is: a sold-out price sits on a solid
      // `abnormal` fill and must take that fill's paired foreground, so asserting achromatic money
      // there would be a test that stays red against a correct implementation.
      expect(
        styleUp(exactText(c, PRICE_TEXT), "color"),
        "27-F16 — the price is coloured. Colour on a number means `this number is abnormal`, and " +
          "the commonest number on the screen is the base case",
      ).toBe(light["fgColor-default"]);
    },
  },

  "a free item's zero is achromatic too": {
    scope: "resting — available and free",
    assert: ({ container: c }: Mounted) => {
      // ⚠ A SEPARATE CLAIM RATHER THAN A TERNARY INSIDE THE ONE ABOVE, and the reason is §P9's
      // rather than `27-F16`'s: a fact is keyed by its SUBJECT, and `exactText(c, shown)` where
      // `shown` is a ternary names neither string. The registry would then carry one fact called
      // `styleUp("Rs 0", "color")` while §G asserts `styleUp(PRICE_TEXT, "color")`, and the scan
      // would report §G as an orphan — a false positive that a future author closes by weakening
      // the scan. Two scopes, two literals, two facts, and both money strings are now asserted
      // achromatic in every cell rather than whichever one the ternary happened to name.
      expect(
        styleUp(exactText(c, "Rs 0"), "color"),
        "27-F16 — a free modifier's zero is money like any other, and colouring it says `this " +
          "number is abnormal` about the commonest number on the screen",
      ).toBe(light["fgColor-default"]);
    },
  },

  "the 27-F8 floor derives from the posture": {
    scope: "any tile at all",
    assert: (_mounted: Mounted, cell: Cell) => {
      // ⚠ THE CLAIM THAT RE-MOUNTS. `27-F8`'s floor is a statement about four postures AT ONCE —
      // a tile pinned at the largest floor clears every `>=` — so this walks the whole table
      // inside whatever cell it was handed, rather than reading the cell's own posture. It
      // ignores the mount it was given deliberately: the fixture here is four postures, not one.
      const floors = FLOOR_POSTURES.map((posture) => {
        const { container } = mount({ ...propsOf(cell), posture });
        const tile = tileOf(container);
        const seen = {
          minHeight: px(tile.style.minHeight, `minHeight for ${posture}`),
          minWidth: px(tile.style.minWidth, `minWidth for ${posture}`),
        };
        for (const axis of ["minHeight", "minWidth"] as const) {
          expect(
            seen[axis],
            `27-F68 (b) — ${axis} for ${posture} is below 27-F8's measured ergonomic floor`,
          ).toBeGreaterThanOrEqual(targetFor(posture));
        }
        cleanup();
        return seen;
      });
      for (const axis of ["minHeight", "minWidth"] as const) {
        const seq = floors.map((f) => f[axis]);
        expect(
          seq.every((value, i) => i === 0 || value > (seq[i - 1] ?? 0)),
          `27-F68 (a) — a pinned constant on ${axis} at [${cellName(cell)}]: ` +
            `${FLOOR_POSTURES.join("/")} rendered ${seq.join("/")}`,
        ).toBe(true);
      }
    },
  },
} satisfies Record<string, Claim>;
// CONTENT-CLAIM-REGISTRY-END

type ClaimName = keyof typeof CLAIMS;
const CLAIM_NAMES = Object.keys(CLAIMS) as ClaimName[];

/** Every cell each claim actually RAN in. §P8 reads it — never the cells the generator offered. */
const RAN = new Map<ClaimName, Cell[]>();

/**
 * Run one claim over its scope's all-pairs cell set, recording each cell BEFORE asserting.
 *
 * Recording first, and collecting failures instead of throwing on the first one, is deliberate and
 * it is what keeps §P8 a tripwire rather than an echo: a mutant that breaks one corner of the
 * space must fail exactly one test, and a sweep that aborted at the first bad cell would take §P8
 * down with it and destroy the attribution the round-3 law asks for.
 */
const sweep = (claim: ClaimName): void => {
  const cells = pairwiseCells(CLAIMS[claim].scope);
  const ran: Cell[] = [];
  const failures: string[] = [];
  for (const cell of cells) {
    ran.push(cell);
    const mounted = mount(propsOf(cell));
    try {
      CLAIMS[claim].assert(mounted, cell);
    } catch (error) {
      failures.push(`  · [${cellName(cell)}] ${(error as Error).message}`);
    }
    cleanup();
  }
  RAN.set(claim, ran);
  expect(
    failures.slice(0, 4),
    `27-F70/27-F4 — "${claim}" does not hold in every cell: ${failures.length} of ${cells.length} ` +
      "failed. A photo is a picture, a posture is a size, a category is a colour and none of them " +
      `may change what the tile SAYS or DOES:\n${failures.slice(0, 4).join("\n")}\n`,
  ).toEqual([]);
};

describe("§P 27-F70/27-F4 — a prop changes what it names, and nothing else", () => {
  it("renders the item's name in every cell", () => {
    // KILLS N5: the dish's name dropped when the tile shows a photograph — `RiceRs 2,500` on the
    // glass, a tile a cashier can only identify by recognising the photograph, which is exactly
    // the dependency `27-F70`'s closing clause forbids. It passed 26/26.
    sweep("name");
  });

  it("carries its price in every cell", () => {
    // KILLS N1, X1, X2 and X6 — one assertion, four rounds of the same defect. `27-F69` exists
    // because the shipped counter rendered "36 tiles, no price on any of them", and that FILED
    // DEFECT has now survived this suite three times over: on the photographed branch (N1, at
    // 26/26), on a handheld (X1), on a fully-shot menu's unphotographed item (X2) and in one
    // category out of twelve (X6) — all at 41/41. Every price assertion in §A runs at one
    // posture, one category and one plate, because `mount()` has to pick some.
    sweep("price");
  });

  it("names its category in every cell", () => {
    // KILLS N2: the category label dropped when photographed. `27-F74` (b) is what keeps the
    // twelve-hue spend inside `27-F12`, and the photographed tile is the MOST likely place to lose
    // the word — a photograph is the thing an author drops the label to make room for, and the
    // tint left behind is colour carrying meaning alone.
    sweep("category");
  });

  it("keeps the price no smaller than the name in every cell", () => {
    // KILLS N7 (mine, not the adversary's, and that is the point of a registry over four tests):
    // the price relegated to caption type ONLY on the photographed branch — the branch where a
    // designer is fighting the photograph for room, so it is the branch where this regression is
    // most likely and the one §A2 could not see.
    sweep("price no smaller than the name");
  });

  it("states an unknown price as unknown in every cell", () => {
    // KILLS N8 (also mine): the `no price set` line dropped when the tile has a photograph, so a
    // photographed tile with no `(branch, channel)` row renders as a blank money slot — `00 §5.7`
    // says the unknown is STATED, and `01-F60` says the item is refused in place with its reason.
    sweep("an unknown price stated as unknown");
  });

  it("prices a free item at zero in every cell", () => {
    // The control's control. `01-F60`'s free modifier is the case that distinguishes "unknown"
    // from "zero", and it is crossed with every other axis for the same reason everything else
    // here is: nothing about a photograph, a posture or a category may reach the money.
    sweep("a free item priced at zero");
  });

  it("flags a sold-out item in every cell", () => {
    // KILLS N6: the `Sold out` flag dropped when the tile is photographed, so the ONE state
    // `27-F12` requires to be carried four ways is carried by nothing at all — a photographed
    // sold-out tile that reads exactly like an available one. §D's four tests all mount the
    // default, plateless, counter-posture tile.
    sweep("sold out, flagged and struck");
  });

  it("renders the plate this item and this menu ask for, in every cell", () => {
    // KILLS X5: the plate dropped for an unphotographed item on a FULLY shot menu — a cell that
    // did not exist in this file until round 6, because `coverage` and `photo` were crossed at
    // five of their six combinations. The missing one is not exotic: it is every item a
    // restaurant has not got round to shooting yet, on the menu of a restaurant that is shooting
    // them, which is the state a `full` menu passes THROUGH on its way to being full.
    sweep("the plate is the one this item and this menu ask for");
  });

  it("tints the lettered plate with its own category, in every cell", () => {
    // KILLS X8: twelve identity tints collapsing to one on the handheld posture. §C1 varies all
    // twelve categories — it is this file's own model of a swept axis — and mounts every one of
    // them at `posture: "counter"`, so a tint keyed to the posture as well as the category passed
    // twelve cells out of forty-eight. That is the round-5 disease exactly: the axis this test
    // owns is swept, and the axis beside it is a fixture.
    sweep("the lettered plate carries the CATEGORY's identity tint");
  });

  it("sells in every cell — the FR's own closing clause", () => {
    // KILLS N12, and it is the one to feel the weight of. `27-F70`'s last sentence is *"nothing in
    // the sale path may depend on a photo existing"*, this section quotes it as its epigraph, and
    // a tile that refuses to ring when it has a photograph passed the whole suite at 35/35 — so a
    // restaurant that paid to shoot its menu could sell nothing and every test was green.
    sweep("sells — the sale path does not depend on the rest of the props");
  });

  it("still sells a sold-out item in every cell", () => {
    // `01-F59` + `27-F4`, crossed with everything: the photographed sold-out tile is the state
    // with the most reasons for an implementation to reach for `disabled` (it has a flag, a
    // strike and a picture to dim), and §E2 mounts none of them.
    sweep("sold out — still sells, and refuses nothing");
  });

  it("refuses an unpriced item in every cell", () => {
    // KILLS X3, and it is the CONTROL for the two sweeps above — an implementation that sells
    // everything passes both and fails here. X3 sold an unpriced item **when it was also sold
    // out**: `soldOut` and the price kind are two axes and the pair was never crossed, so a
    // second condition smuggled into the sale guard was invisible. `01-F60` puts the two
    // dispositions side by side precisely because they are confusable; this asserts they stay
    // separable in every combination of the two.
    sweep("unpriced — refused in place, whatever the rest of the props");
  });

  it("fills the sold-out flag with `abnormal`, solid, in every cell", () => {
    // KILLS N9, N13 and X7 — `fault` when photographed, the identity hue when photographed, and
    // now `fault` on a handheld. Three rounds, one assertion, three axes: the flag's fill was
    // asserted at one posture, one plate and one category every time, and each adversary picked
    // whichever of those the last one had not.
    sweep("sold out — the flag takes the abnormal fill, solid");
  });

  it("leaves the money achromatic in every cell", () => {
    // KILLS N10: the price coloured when photographed. `27-F16` — colour on a number means *this
    // number is abnormal*, and a photographed grid is exactly where a designer reaches for an
    // accent to lift the price off the picture. §G mounts `mount()`.
    sweep("money is achromatic on a resting tile");
  });

  it("leaves a free item's zero achromatic in every cell", () => {
    // The same `27-F16` claim on the other money string. It is here because §P8 required it: the
    // claim was added to the registry and the matrix reddened with *"a free item's zero is
    // achromatic too — never swept at all"* before this test existed, which is the tripwire doing
    // the job it was written for on its own author, an hour after being written.
    sweep("a free item's zero is achromatic too");
  });

  it("derives the 27-F8 floor from the posture in every cell", () => {
    // KILLS N11: the floor pinned at the keypad's 126 when the tile is photographed — `27-F68`
    // (a)'s named error, on the branch where a plate gives an implementation a reason to reach for
    // a fixed box. §F1's `>=` cannot see a pinned largest and §F2's walk mounts no plate.
    sweep("the 27-F8 floor derives from the posture");
  });

  // ── THE THREE TRIPWIRES ───────────────────────────────────────────────────────────────────────

  it("§P8 — every claim RAN in a set covering each prop value and each PAIR of prop values", () => {
    // ⚠ THIS ASSERTION IS THE DELIVERABLE OF ROUND 6, and the sweeps above are its consequence.
    // Five rounds each closed one axis by hand and were beaten on the next, so what is asserted
    // here is not a list of cells but the COVERAGE PROPERTY of whatever list the generator
    // produced: for every claim, every value of every axis that is feasible in its scope appears
    // in a cell it actually ran, and so does every feasible PAIR of values.
    //
    // Read over the cells that RAN rather than over the cells the generator offered. That is the
    // anti-vacuity half: a sweep that skips cells, a claim wired to a stale scope, or a `slice()`
    // added to make a red go away all fail here by the name of the value or pair that was lost.
    const gaps: string[] = [];
    for (const claim of CLAIM_NAMES) {
      const ran = RAN.get(claim) ?? [];
      if (ran.length === 0) {
        gaps.push(`${claim} — never swept at all`);
        continue;
      }
      const cells = feasible(CLAIMS[claim].scope);
      const ranValues = new Set(ran.flatMap(valuesOf));
      for (const value of new Set(cells.flatMap(valuesOf))) {
        if (!ranValues.has(value)) gaps.push(`${claim}: no cell had ${value}`);
      }
      const ranPairs = new Set(ran.flatMap(pairsOf));
      for (const pair of new Set(cells.flatMap(pairsOf))) {
        if (!ranPairs.has(pair)) gaps.push(`${claim}: no cell had ${pair}`);
      }
    }
    expect(
      gaps.slice(0, 12),
      `a claim ran in a set that leaves a prop value or a pair of prop values unasserted — which ` +
        `is how eight one-branch mutants survived 41/41 (${gaps.length} gaps):\n` +
        `${gaps.slice(0, 12).join("\n")}\n`,
    ).toEqual([]);

    // `24-F14` empty-match protection, and every one of these is a way the section above can go
    // quietly inert: an empty registry, a collapsed axis, a scope nobody uses, a generator that
    // returns one cell. They are floors, not counts, so adding a claim or an axis needs no edit.
    expect(CLAIM_NAMES.length, "the claim registry is empty").toBeGreaterThanOrEqual(12);
    expect(AXIS_NAMES.length, "the cell space collapsed to fewer than four axes").toBeGreaterThan(
      3,
    );
    for (const axis of AXIS_NAMES) {
      expect(AXES[axis].length, `the ${axis} axis has fewer than two values`).toBeGreaterThan(1);
    }
    expect(FULL_CROSS.length, "the cross product is not the product of the axes").toBe(
      AXIS_NAMES.reduce((n, axis) => n * AXES[axis].length, 1),
    );
    for (const claim of CLAIM_NAMES) {
      const ran = RAN.get(claim) ?? [];
      expect(
        ran.length,
        `"${claim}" ran in fewer cells than its widest pair needs — the generator returned a set ` +
          "that cannot cover all pairs and the loop above should have said so",
      ).toBeGreaterThan(1);
    }
  });

  it("§P8b — every prop is an axis, every axis is its source constant, and none is prose", () => {
    // THE TRIPWIRE FOR THE NEXT PROP. §P8 asserts the generated cells cover the axes; this asserts
    // that the AXES cover the props. A `size`, a `badge`, a `01-F58` disputed flag or a `27-F72`
    // density added to the contract with no axis is swept at whatever value the default mount
    // happens to hold — which is precisely how `posture`, `category` and `coverage × photo` came
    // to be exercised at four, twelve and six values and asserted at one, one and five.
    //
    // ⚠ AND SINCE ROUND 7 IT ALSO ASSERTS THE TWO THINGS §P8 CANNOT, both because §P8's oracle is
    // derived from the thing it audits: that each AXIS IS the constant it claims to be (a
    // `.slice()` inside `AXES` moves the cells and the coverage property together, so §P8 reports
    // a narrowed suite as fully covered), and that each ROW OF `SWEPT_BY` is true of the props
    // actually mounted (the table used to accept a sentence, `name` carried a false one, and X9
    // lived in it at 45/45).
    //
    // Read off this file's own declared `Props`, in §0's tradition: a claim about the FILE, not
    // about the component, because the failure being prevented is a future author's omission.
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const declared = /type Props = \{([^}]*)\}/.exec(source)?.[1] ?? "";
    const props = [...declared.matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1] ?? "");
    expect(props.length, "24-F14 — the Props scan matched nothing").toBeGreaterThan(6);
    expect(props, "the Props scan lost the prop this whole suite is about").toContain("paisa");

    /**
     * Every prop, mapped to the AXIS that sweeps it — and the type is `AxisName`, which is the
     * round-7 closure and the reason this is the last table in the file that could hold a
     * sentence.
     *
     * ⚠ IT USED TO BE `Record<string, string>`, SO AN ENTRY COULD BE PROSE — and one was:
     * `name: "not a small domain — §B4 sweeps four names and four initials instead"`. **§B4 sweeps
     * four names at one posture, one category, one plate and one price kind**, and nothing checked
     * that a stated reason was TRUE, so the cross product could be escaped by writing a sentence —
     * the disease this whole section exists to stop, re-entering through the door built to stop
     * it. X9 (the plate's letter hard-coded to the fixture's initial whenever the posture is not
     * `counter`) then survived 45/45: M24, this file's own round-3 kill, alive again one axis over.
     *
     * `name` is an axis now. What is left is not an exemption but a different KIND of prop, and it
     * discharges a machine-checked obligation below rather than a reason.
     */
    const SWEPT_BY: Record<string, AxisName> = {
      posture: "posture",
      paisa: "price",
      category: "category",
      soldOut: "soldOut",
      coverage: "plate",
      photo: "plate",
      name: "name",
    };
    /**
     * The props the HARNESS supplies rather than the cells — `onPress` is `mount()`'s own spy and
     * has no value domain to cross. That is a real distinction and it is also the obvious next
     * escape hatch, so it is not taken on trust: the assertions below require the prop to be read
     * by more than one claim, and require those claims' RECORDED cells to cover every value of
     * every axis. A sentence cannot satisfy them.
     */
    const HARNESS_SUPPLIED: readonly string[] = ["onPress"];
    const unswept = props.filter((p) => SWEPT_BY[p] === undefined && !HARNESS_SUPPLIED.includes(p));
    expect(
      unswept,
      "a prop of this component is swept by no axis. Add it to `AXES` with its full domain (the " +
        "generator crosses it with everything for free). There is no longer a `SWEPT_BY` entry " +
        "that takes a REASON: `name` carried one for six rounds, it was false, and X9 lived in " +
        "it. Leaving a prop out means every claim in this file runs at the one value `mount()` " +
        "happens to default it to",
    ).toEqual([]);

    // Every cell any claim actually ran in — the same `RAN` §P8 reads, so a prop's variation is
    // measured over what was MOUNTED and not over what the generator could have offered.
    const ranCells = CLAIM_NAMES.flatMap((claim) => RAN.get(claim) ?? []);
    expect(
      ranCells.length,
      "24-F14 — no claim has run, so nothing below measures anything",
    ).toBeGreaterThan(20);
    for (const [prop, axis] of Object.entries(SWEPT_BY)) {
      expect(AXIS_NAMES, `${prop} claims to be swept by "${axis}", which is not an axis`).toContain(
        axis,
      );
      expect(
        AXES[axis].length,
        `${prop} claims to be swept by the ${axis} axis, which has no values`,
      ).toBeGreaterThan(1);
      // ⚠ AND THE MAPPING ITSELF IS CHECKED, not just the axis it names. An axis can exist, be
      // full, and reach the component at one value anyway — which is precisely what `name` did
      // through `propsOf` before round 7, and what any future axis does if it is added to `AXES`
      // and forgotten in `propsOf`. This asserts the PROPERTY the table claims: the cells that ran
      // mounted this prop at more than one value.
      const mounted = new Set(
        ranCells.map((cell) => JSON.stringify(propsOf(cell)[prop as keyof Props] ?? null)),
      );
      expect(
        [...mounted].length,
        `${prop} claims to be swept by the ${axis} axis, and every cell that RAN mounted it at ` +
          `the same value (${[...mounted][0]}). A row in this table is a claim about what reaches ` +
          "the component; until round 7 nothing checked one, and a claim nobody checks is prose",
      ).toBeGreaterThan(1);
    }
    for (const prop of HARNESS_SUPPLIED) {
      const readers = CLAIM_NAMES.filter((claim) => CLAIMS[claim].assert.toString().includes(prop));
      expect(
        readers.length,
        `${prop} is exempt from the axes because the harness supplies it and the claims read it ` +
          "in every cell — and fewer than two claims read it at all, so the exemption is unearned",
      ).toBeGreaterThan(1);
      const seen = new Set(readers.flatMap((claim) => RAN.get(claim) ?? []).flatMap(valuesOf));
      expect(
        [...new Set(FULL_CROSS.flatMap(valuesOf))].filter((value) => !seen.has(value)),
        `${prop} is read by ${readers.length} claims and their cells miss a prop value entirely, ` +
          "so it is asserted at some values of the cross product and not others — which is the " +
          "same hole as an unswept prop wearing a different costume",
      ).toEqual([]);
    }

    // ── THE AXES AGAINST THE CONSTANTS THEY CLAIM TO BE (round 7) ────────────────────────────
    //
    // ⚠ §P8 CANNOT SEE A NARROWED AXIS, BY CONSTRUCTION, AND THAT IS WHAT THESE SIX LINES CLOSE.
    // It measures the cells that RAN against `feasible()` — and `feasible()` is built from the
    // same `AXES` literal, so **both sides move together**. Measured against the round-6 file:
    // `posture: FLOOR_POSTURES.slice(0, 2)`, `category: CATEGORIES.slice(0, 6)` and
    // `plate: PLATE_STATES.slice(0, 3).map(…)` are each **45/45 GREEN**, one keystroke apiece, and
    // between them they resurrect five of this file's own headline mutants (X2 and X5 on the plate
    // axis, X1/X7/X8 with `handheld` dropped, X6 on the categories). The assertions below were the
    // gap: §P8b asserted the SOURCE constants — twelve slugs, `27-F8`'s order, `27-F70`'s words —
    // and never that the axes are those constants, which is exactly where a `.slice()` sits.
    //
    // It is not a vandalism-only case, which is why it is a rail and not a review note: this
    // file's own header names the pressure (*"a suite that takes a minute is a suite people stop
    // running"*), and a `.slice()` on the slowest axis is the first thing a blocked implementer
    // reaches for at 02:00. `toEqual` and not a length check — a substituted list of the right
    // size is the same defect wearing the same size.
    expect(AXES.posture, "27-F8 — the posture axis is not `27-F8`'s four postures").toEqual(
      FLOOR_POSTURES,
    );
    expect(
      AXES.category,
      "27-F74 (e) — the category axis is not the twelve allocated slugs",
    ).toEqual(CATEGORIES);
    expect(AXES.name, "the name axis is not this file's four names").toEqual(NAMES);
    expect(AXES.plate, "27-F70 — the plate axis is not every declared plate state").toEqual(
      PLATE_STATES.map((s) => s.key),
    );
    expect(AXES.price, "01-F60 — the price axis is not every declared price kind").toEqual(
      Object.keys(PRICE_KINDS),
    );
    expect(AXES.soldOut, "01-F59 — availability is not both of its values").toEqual([
      "available",
      "sold out",
    ]);

    // The DOMAINS, asserted rather than assumed — an axis is only as complete as its list.
    // `POSTURES` and `CATEGORY_SLUGS` are exhaustive by CONSTRUCTION (a `Record` over the
    // imported union, so a thirteenth slug or a fifth posture fails to compile rather than being
    // swept at eleven of twelve). What a compiler cannot check is the ORDER `27-F8` is read in,
    // and the plate axis's own completeness.
    expect(CATEGORIES.length, "27-F74 (e) — the identity set is capped at 12 and allocated").toBe(
      12,
    );
    // `name` is the one axis whose domain is a CHOICE rather than a closed set, so what makes it
    // an axis is stated here: four names, four DIFFERENT initials. A plate keyed to anything but
    // this item — the fixture's letter, the category's, a constant — is then wrong in at least
    // three cells of every four, which is M24's property and X9's.
    expect(NAMES.length, "the name axis is narrower than §B4's four names").toBeGreaterThanOrEqual(
      4,
    );
    expect(
      new Set(NAMES.map((n) => (n[0] ?? "").toLowerCase())).size,
      "two names on the name axis share an initial, so a cell of it cannot tell a plate keyed to " +
        "THIS item from a plate keyed to the other one",
    ).toBe(NAMES.length);
    const targets = FLOOR_POSTURES.map(targetFor);
    expect(
      targets.every((t, i) => i === 0 || t > (targets[i - 1] ?? 0)),
      `27-F8's table is strictly ordered handheld < counter < kitchen < keypad; this file walks ` +
        `${FLOOR_POSTURES.join("/")} = ${targets.join("/")}. §F2 and the floor claim both read ` +
        "this order as their oracle, so a posture added out of order makes both of them lie",
    ).toBe(true);
    // Every `27-F70` coverage word and every plate it can produce is a cell of the plate axis.
    const words = new Set(PLATE_STATES.map((s) => s.props.coverage ?? "partial"));
    expect(
      [...words].sort(),
      "27-F70 — a coverage word this component accepts is mounted nowhere",
    ).toEqual(["full", "none", "partial"]);
    expect(
      [...new Set(PLATE_STATES.map((s) => s.plate))].sort(),
      "27-F70 — a plate this component can render is declared by no plate state",
    ).toEqual(["lettered", "none", "photo"]);
    // And the declared plate kind is DERIVED, not decorative: it must agree with §P9's semantic
    // predicate, or a state labelled `photo` that renders none would exempt whole blocks from the
    // scan below while proving nothing. §B6 is this file's own proof that the two can disagree.
    for (const state of PLATE_STATES) {
      const rendersPhoto = state.props.photo !== undefined && state.props.coverage !== "none";
      expect(
        state.plate === "photo",
        `the plate axis calls "${state.key}" a ${state.plate}, and its props say otherwise`,
      ).toBe(rendersPhoto);
    }
  });

  it("§P9 — every assertion in this file has a swept counterpart in the registry", () => {
    // ⚠ THIS IS THE PART THAT SURVIVES ME. The sweeps above close the mutants three adversaries
    // thought of; they do nothing about the NEXT one, which is an assertion a future author adds
    // to §A, §C, §D, §E, §F or §G on the default mount — a `27-F72` size badge, an allergen mark,
    // a second money field, a `01-F58` disputed flag. That assertion would be true of the default
    // tile and unasserted everywhere else, which is precisely how N1, N12 and X1 came to exist,
    // one round apart, on three different axes.
    //
    // So this reads the file's own source, finds every `it` that mounts a tile the registry's
    // sweep does not stand in for, and requires every fact it asserts — TEXT and NON-TEXT alike —
    // to appear in the registry region above. It pins no DOM structure and no implementation; it
    // is a claim about the SHAPE OF THIS TEST FILE, and its failure message tells the author the
    // one thing to do: add the fact to `CLAIMS`, where it is swept across the cross product free.
    //
    // ⚠ FOUR EVASIONS HAVE BEEN MEASURED AGAINST EARLIER DRAFTS AND ARE CLOSED HERE. Each one is a
    // way of writing a TRUE default-mount-only assertion that this scan counted as nothing, so the
    // guard was green while the hole it exists to name was open:
    //   · **it swept TEXT only** (round 5). Closed by the fact scan below.
    //   · **this file's own find-then-assert idiom escaped it** (round 5). Closed by the extra
    //     token forms.
    //   · **the skip was TEXTUAL and WHOLE-BLOCK, and §G was already exempt** (round 5). Closed by
    //     bounding blocks at the registry marker and by the semantic per-`mount(` predicate.
    //   · **the non-text half could not FIRE** (round 6, TW8). It asked whether the PROBE NAME
    //     appeared in the registry, and all thirteen names did — so the orphan list was
    //     structurally empty and only a brand-new probe could ever have produced one. A real
    //     `27-F64`/`27-F66` assertion on the flag's FOREGROUND, added to §D1 and asserted
    //     nowhere else, stayed green, and the mutant it exists to catch (the flag's foreground
    //     flipped only when photographed) survived. It keys on the FACT now — `styleUp` of WHAT,
    //     for WHICH property — so `styleUp("Sold out", "color")` and `styleUp(PRICE_TEXT,
    //     "color")` are two facts and the registry has to carry both.
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const from = source.search(/^\/\/ CONTENT-CLAIM-REGISTRY-START$/m);
    const to = source.search(/^\/\/ CONTENT-CLAIM-REGISTRY-END$/m);
    expect(from >= 0 && to > from, "the registry markers moved or were deleted").toBe(true);

    // Whole-line comments are stripped from everything this test reads, on both sides. A comment
    // is not an assertion (a `KILLS:` note naming `minHeight` is not a probe) and it is not
    // coverage either (a claim's prose mentioning `onPress` is not a claim that presses). This is
    // `AGENTS.md`'s own recorded measurement error — *"the count came from grepping for files that
    // MENTION a symbol and calling them importers"* — in a file that greps itself.
    const code = (text: string): string => text.replace(/^[ \t]*\/\/.*$/gm, "");
    const registry = code(source.slice(from, to));
    expect(registry.length, "the registry region is empty").toBeGreaterThan(500);

    // Blocks are bounded by the next `it(`, the next `describe(`, OR THE REGISTRY MARKER — so the
    // last `it` before §P cannot swallow the registry's own fixtures and be classified by them.
    const bounds = [
      ...[...source.matchAll(/\n\s*(?:it|describe)\(/g)].map((m) => m.index ?? 0),
      from,
    ].sort((a, b) => a - b);
    const blocks = [...source.matchAll(/\n\s*it\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => {
      const at = m.index ?? 0;
      const end = bounds.find((b) => b > at) ?? source.length;
      return { at, end, title: m[1] ?? "", text: code(source.slice(at, end)) };
    });
    expect(blocks.length, "24-F14 — the block scan matched nothing").toBeGreaterThan(20);

    /**
     * The arguments of one call, paren-balanced and QUOTE-AWARE, so `expect(x, "a (b)")` and
     * `mount({ paisa: paisa(0) })` both read whole. Without the quote half a message containing a
     * bracket — and this file is full of `27-F70 (b)` — closes the call early and truncates the
     * fact that was being read out of it.
     */
    const callArgs = (text: string, open: number): string => {
      let depth = 0;
      let quote = "";
      for (let i = open; i < text.length; i += 1) {
        const ch = text[i];
        if (quote !== "") {
          if (ch === "\\") i += 1;
          else if (ch === quote) quote = "";
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if (ch === "(") depth += 1;
        else if (ch === ")") {
          depth -= 1;
          if (depth === 0) return text.slice(open + 1, i);
        }
      }
      return text.slice(open);
    };
    /** Top-level commas only, quote- and bracket-aware. */
    const splitArgs = (args: string): string[] => {
      const out: string[] = [];
      let depth = 0;
      let quote = "";
      let start = 0;
      for (let i = 0; i < args.length; i += 1) {
        const ch = args[i] as string;
        if (quote !== "") {
          if (ch === "\\") i += 1;
          else if (ch === quote) quote = "";
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") quote = ch;
        else if ("([{".includes(ch)) depth += 1;
        else if (")]}".includes(ch)) depth -= 1;
        else if (ch === "," && depth === 0) {
          out.push(args.slice(start, i));
          start = i + 1;
        }
      }
      out.push(args.slice(start));
      return out.map((a) => a.trim()).filter((a) => a.length > 0);
    };
    // The lookbehind is not fussiness: without it this test scans ITSELF, because its own failure
    // message says `mount()` inside a string. A block that renders nothing has nothing to hold,
    // and a quoted mention is not a render — the same distinction, one tool over, that `AGENTS.md`
    // records as the measurement error behind an inflated importer count.
    const mountsIn = (text: string): string[] =>
      [...text.matchAll(/(?<!["'`])\bmount\(/g)].map((m) => callArgs(text, (m.index ?? 0) + 5));
    /** §P8b's predicate, not a textual one. §B6 is the case that separates the two. */
    const rendersPhotograph = (args: string): boolean =>
      /\bphoto:\s*(?!undefined\b)\S/.test(args) && !/\bcoverage:\s*"none"/.test(args);

    // A token is what an assertion looks for in the tile's text. Identifiers reduce to their last
    // segment so `props.category` and a loop's `category` are one token; literals stay whole.
    const TOKEN_FORMS: readonly RegExp[] = [
      /(?:\.toContain\(|\.toMatch\()\s*([^)]*?)\s*[,)]/g,
      /\bexactText\([\w.]+,\s*([^)]*?)\s*[,)]/g,
      /\.toBe\(\s*("(?:[^"\\]|\\.)*")\s*[,)]/g,
      // Find-then-assert, both directions, and `.includes`/`.startsWith`/`.endsWith` on extracted
      // text — the forms the second evasion above was written in.
      /(?:textContent|tileText\([^()]*\)|norm\([^()]*\))\s*\)?\s*[!=]==?\s*([^;)\n]+?)\s*[);,]/g,
      /("(?:[^"\\]|\\.)*"|\b[A-Z][\w$]*)\s*[!=]==?\s*(?:norm\(|tileText\(|[\w.]*textContent)/g,
      /(?:textContent|tileText\([^()]*\)|norm\([^()]*\))\s*\)?\s*\.(?:includes|startsWith|endsWith)\(\s*([^)]*?)\s*[,)]/g,
    ];
    const tokenOf = (raw: string): string => {
      const t = raw.trim();
      if (t.startsWith('"') || t.startsWith("/")) return t;
      return (t.split(".").pop() ?? t).replace(/[^\w$]/g, "");
    };
    // String and regex literals are compared EXACTLY; identifiers are compared case-insensitively,
    // because `CATEGORY` (the default mount's fixture) and `cell.category` (the axis that sweeps
    // it) are one fact under two names, and the fact scan below is what carries precision now.
    const covered = (token: string): boolean =>
      token.startsWith('"') || token.startsWith("/")
        ? registry.includes(token)
        : new RegExp(`\\b${token}\\b`, "i").test(registry);

    // ── THE FACT SCAN (round 6) ──────────────────────────────────────────────────────────────
    //
    // A fact is `probe(subject, …)`, not `probe`. Subjects resolve through the block's own
    // `const` aliases — `const flag = exactText(c, "Sold out")` makes `fillOf(flag)` the fact
    // `fillOf("Sold out")` — and short literal arguments are kept, so `styleUp(_, "color")` is a
    // different fact from `styleUp(_, "fontSize")`. Message strings are dropped: they contain
    // spaces, they are the one argument that carries no fact, and keying on them would make every
    // reworded message an orphan.
    // Which probes are read as CALLS and which as members or values, decided from this file rather
    // than declared: `styleUp(` is a call, `.style.minHeight` and the `onPress` spy are not. It is
    // computed over the whole source so a block and the registry classify identically — a probe
    // that is a call in one and a bare name in the other would never match itself.
    const CALLED_PROBES = new Set(
      FACT_PROBES.filter((probe) => new RegExp(`\\b${probe}\\(`).test(code(source))),
    );
    const factsIn = (text: string): Set<string> => {
      const aliases = new Map<string, string>();
      for (const m of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) {
        aliases.set(m[1] ?? "", m[2] ?? "");
      }
      const resolve = (raw: string, depth = 0): string => {
        const t = raw.trim();
        const alias = /^[A-Za-z_$][\w$]*$/.test(t) ? aliases.get(t) : undefined;
        return alias !== undefined && depth < 4 ? resolve(alias, depth + 1) : t;
      };
      /**
       * The fixture an expression is ABOUT: its rightmost string literal, else its last name.
       *
       * ⚠ IDENTIFIER SUBJECTS ARE CASE-FOLDED AND STRING LITERALS ARE NOT, which is the same
       * split — and the same reason — the token scan below already states: `NAME` (the default
       * mount's fixture) and `cell.name` (the axis that sweeps it) are ONE fact under two names,
       * exactly as `CATEGORY` and `cell.category` are. Round 7 is what forced it: crossing `name`
       * re-pointed the registry's claims at `cell.name` and this scan then reported `fontPx(NAME)`,
       * `fillOf(NAME)` and `isStruck(NAME)` as orphans of §A2, §B3, §C1, §C3 and §D3 — five
       * assertions that are swept, by claims that had just been widened to sweep them.
       *
       * The file's own rule is that the answer to a false positive is a clearer claim and never a
       * blunter scan, so the narrowness is the point: the two spellings differ by CASE ALONE, the
       * literal half (which is what tells `styleUp("Sold out", "color")` from
       * `styleUp(PRICE_TEXT, "color")`, and is the whole of the round-6 TW8 fix) is untouched, and
       * the tripwire below still requires some probe to be keyed by more than one subject.
       */
      const subjectOf = (raw: string): string => {
        const expression = resolve(raw);
        const strings = [...expression.matchAll(/"(?:[^"\\]|\\.)*"/g)].map((m) => m[0]);
        if (strings.length > 0) return strings[strings.length - 1] as string;
        const names = [...expression.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]);
        return (names[names.length - 1] ?? expression).toLowerCase();
      };
      const facts = new Set<string>();
      for (const probe of FACT_PROBES) {
        if (CALLED_PROBES.has(probe)) {
          for (const m of text.matchAll(new RegExp(`\\b${probe}\\(`, "g"))) {
            const args = splitArgs(callArgs(text, (m.index ?? 0) + probe.length));
            const extras = args.slice(1).filter((a) => /^"[^"\s\\]+"$/.test(a));
            facts.add(`${probe}(${[subjectOf(args[0] ?? ""), ...extras].join(", ")})`);
          }
        } else if (new RegExp(`\\b${probe}\\b`).test(text)) {
          // A probe that is never CALLED anywhere in this file is read as a member or a value
          // (`.style.minHeight`, the `onPress` spy), so its name is all the fact there is.
          facts.add(probe);
        }
      }
      return facts;
    };
    const registryFacts = factsIn(registry);

    // ⚠ THE THREE FIXES BELOW COULD NOT REDDEN ON THEIR OWN, WHICH IS THE ROUND-3 LAW'S OWN
    // WARNING — *a guard nobody has broken is a guard nobody has tested*. Reverting the bounds,
    // the predicate or the fact keying leaves this file green, because §G's and §B6's assertions
    // all happen to be covered today; the hole only opens when the NEXT author adds one. So each
    // fix gets an assertion that fails on the revert itself, rather than on a defect it lets
    // through.
    // ⚠ ON `end` RATHER THAN ON `text`, AND THE FIRST DRAFT OF THIS ASSERTION HAD IT WRONG:
    // written as `b.text.includes("CONTENT-CLAIM-REGISTRY")` it SURVIVED the reverted-bounds
    // mutant at 41/41, because the markers are whole-line comments and `code()` had just stripped
    // them out. A tripwire that reads a filtered view of what it is guarding is the vacuous-guard
    // pattern §C of `oracle-round-2-findings.md` names, reproduced inside the fix for it — again.
    expect(
      blocks.filter((b) => b.at < from && b.end > from).map((b) => b.title),
      "a test block before the registry swallowed the registry itself, so its own mounts are read " +
        "together with the fixtures below — which is exactly how §G came to be classified " +
        "photographed and exempted while asserting the price's colour on a plateless tile only",
    ).toEqual([]);
    // The fact keying's own tripwire: at least one probe must be read with two different subjects,
    // or the keys have collapsed back to probe names and the round-6 evasion is open again.
    const bySubject = new Map<string, Set<string>>();
    for (const fact of registryFacts) {
      const [probe, subject] = fact.split("(");
      if (subject === undefined) continue;
      bySubject.set(probe as string, (bySubject.get(probe as string) ?? new Set()).add(subject));
    }
    expect(
      [...bySubject.values()].some((subjects) => subjects.size > 1),
      "no probe in the registry is keyed by more than one subject, so every fact is really just " +
        "its probe's name — which is TW8: the non-text half of this scan cannot fire, because " +
        "all thirteen probe names are in the registry and only a brand-new probe could orphan",
    ).toBe(true);

    const orphans: string[] = [];
    const scanned: string[] = [];
    let checked = 0;
    let probed = 0;
    let plateless = 0;
    for (const block of blocks) {
      if (block.at > from && block.at < to) continue; // inside the registry region itself
      const mounts = mountsIn(block.text);
      if (mounts.length === 0) continue; // renders nothing — nothing to hold
      // Skipped only if EVERY tile this block renders is photographed. A block that mounts one of
      // each asserts on the plateless one too, and the whole-block skip is what hid §G.
      if (mounts.every(rendersPhotograph)) continue;
      scanned.push(block.text);
      plateless += 1;
      for (const form of TOKEN_FORMS) {
        for (const match of block.text.matchAll(form)) {
          const token = tokenOf(match[1] ?? "");
          if (token === "") continue;
          checked += 1;
          if (!covered(token)) orphans.push(`${token}   (asserted by "${block.title}")`);
        }
      }
      // The non-text half, and it is the same question asked of a different vocabulary: this
      // block probes a fact the props are not allowed to move, so the registry must probe it too.
      // The three PLATE_PROBES are absent from `FACT_PROBES` by name and with a reason — the
      // plate is the one thing `27-F70` lets vary, and the registry asserts it as a function of
      // the cell rather than as an invariant.
      for (const fact of factsIn(block.text)) {
        probed += 1;
        if (!registryFacts.has(fact)) {
          orphans.push(`${fact}   (a NON-TEXT fact probed by "${block.title}")`);
        }
      }
    }
    // `24-F14` empty-match protection, one floor per half — and it is not decoration. The scan has
    // three independent ways to go inert (no block matched, no token form matched, no fact
    // matched), and the round-5 hole was the third of those reading zero for the whole file.
    expect(plateless, "24-F14 — no default-mount test was found to check").toBeGreaterThan(5);
    expect(checked, "24-F14 — no content assertion was found to check").toBeGreaterThan(15);
    expect(probed, "24-F14 — no non-text fact was found to check").toBeGreaterThan(10);
    expect(registryFacts.size, "24-F14 — the registry probes no non-text fact").toBeGreaterThan(10);
    // The predicate's own tripwire, and it is a floor rather than a count: §B6 mounts a `photo`
    // under a `coverage: "none"` menu, so it MENTIONS a photograph and renders none. A textual
    // whole-block skip reads it as photographed and exempts it; §P8b gets this right semantically
    // and §P9 used to get it wrong textually, one screen apart, on the same fact.
    expect(
      scanned.filter((text) => /\bphoto:\s*(?!undefined\b)\S/.test(text)).length,
      "every block mentioning a photo was treated as photographed — `photo:` present is not a " +
        "photograph rendered, and §B6 is this file's own proof of the difference",
    ).toBeGreaterThanOrEqual(1);
    expect(
      orphans,
      "a fact is asserted only on the DEFAULT mount — which fixes one posture, one category, one " +
        "plate and one price kind, so these are never checked anywhere else. That is how N1 " +
        "(`27-F69`'s own filed defect: a tile with no price), N12 (`27-F70`'s closing clause: a " +
        "photographed tile that does not sell) and X1/X6/X8 (the same, one posture and one " +
        "category over) each survived this suite. Add the fact to `CLAIMS` in the registry above " +
        "and it is swept across the whole cross product:\n" +
        `${orphans.join("\n")}\n`,
    ).toEqual([]);

    // ── AND THE CLASSIFICATION ITSELF, because a vocabulary is only as good as its last entry ──
    // Every helper in this file is either a text/harness helper, a fact probe, or one of the three
    // plate probes. A future author who adds a fourth kind of probe — a `borderOf`, an `ariaOf`, a
    // `rectOf` — fails here by name, instead of inheriting round 5's hole silently, which is
    // exactly what happened when `Claim.assert` took a bare `HTMLElement`.
    //
    // ⚠ IT MATCHED ARROW CONSTS ONLY UNTIL ROUND 6 (TW9b). `/^const (\w+) = \(/` does not see
    // `function borderOf(el) {…}`, so the one form a JS author is likeliest to reach for when
    // adding a helper mid-file walked straight past the exhaustiveness check — and a
    // `function`-declared probe used on the default mount alone passed 41/41.
    const classified = new Set([...PLATE_PROBES, ...FACT_PROBES, ...TEXT_AND_HARNESS]);
    expect(PLATE_PROBES.length, "24-F14 — the plate-probe exemption list is empty").toBe(3);
    expect(FACT_PROBES.length, "24-F14 — the fact-probe list is empty").toBeGreaterThanOrEqual(8);
    expect(
      PLATE_PROBES.filter((p) => FACT_PROBES.includes(p)),
      "a probe is exempted as plate-dependent AND required to be prop-invariant",
    ).toEqual([]);
    const helpers = [
      ...[...code(source).matchAll(/^(?:export\s+)?function\s+(\w+)\s*[<(]/gm)],
      ...[
        ...code(source).matchAll(
          /^(?:export\s+)?const\s+(\w+)\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:function\b|<[^=\n]*>\s*\(|\()/gm,
        ),
      ],
    ].map((m) => m[1] ?? "");
    expect(helpers.length, "24-F14 — the helper scan matched nothing").toBeGreaterThan(10);
    expect(
      helpers.filter((h) => !classified.has(h)),
      "a helper in this file is classified nowhere. Decide what it reads: a fact the props may " +
        "not move (`FACT_PROBES`, and give it a claim), a question about the plate itself " +
        "(`PLATE_PROBES`, exempt by name), or text/harness (`TEXT_AND_HARNESS`, whose SUBJECTS " +
        "the token scan reads)",
    ).toEqual([]);
  });
});
