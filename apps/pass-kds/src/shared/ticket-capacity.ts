/**
 * # `27-F28` — WHAT CAPACITY THIS PANEL YIELDS, STATED RATHER THAN MANDATED
 *
 * > 27-F28 **A panel's KDS capacity is STATED, not mandated.** A 10" tablet holds ~9.5 item lines
 * > at 1.5 m — about 1.5 tickets — and more pixels change nothing, because only physical height
 * > buys capacity. **22" is what a 3-ticket view costs.**
 * > *(Amended August 2026 — `DEC-HW-001`'s bring-your-own-hardware ruling … a restaurant brings
 * > the glass it owns, so the product **reports the capacity that panel yields at its viewing
 * > distance** and the restaurant decides whether 1.5 tickets is enough (`00 §5.7`). A 1.5-ticket
 * > panel is a **supported and honestly-labelled** KDS, not a refused one. **What is NOT relaxed:**
 * > the angular cap-height is physics and is never traded for capacity — a panel too small for its
 * > distance shows **fewer tickets**, never smaller type.)*
 *
 * So this module answers one question — *how many tickets does this glass hold?* — and it must
 * never be used to answer the other one. **Nothing here scales type or a touch target.** That is
 * the clause the amendment refuses to relax, and it is also `27-F68` (b) (*"never shrink a target
 * to fit"*) and `27-F8`'s kitchen row (96 dp of finger, at any panel size).
 *
 * ## Where 91.3 mm comes from — the FR's own two data points, not a design choice
 *
 * `27-F28` gives two measurements and this derives the constant from the exact one:
 *
 *  - **22" at 16:9 is 273.9 mm of height** (`22 × 25.4 × 9 / √(16² + 9²)`), and the FR says that
 *    is a **3-ticket** view. So one ticket costs `273.9 / 3 = 91.3 mm`.
 *  - **Cross-check against the FR's other row**, which is stated approximately: a 10.1" 16:10
 *    tablet is 125.7 mm tall (`27 §1a`'s own panel, and the one `layout:check` measures), and
 *    `125.7 / 91.3 = 1.38` — the FR's *"about 1.5 tickets"*. Two independent rows of one FR
 *    agreeing to within 8% is what makes this a transcription rather than an invention.
 *
 * The ~9.5 item lines the FR also names fall out at `91.3 / 9.5 ≈ 9.6 mm` per line **inside** a
 * ticket, which is a plausible line pitch at `27-F27`'s 30-arcmin cap at 1.5 m and is recorded
 * only as a sanity check — nothing here lays out a line.
 *
 * ## ⚠ THE VIEWING DISTANCE IS FIXED AT 1.5 m AND THAT IS AN OWED REFINEMENT, NOT A FINISHED ANSWER
 *
 * `27-F27` makes legibility **angular**: *"cap-height must scale with viewing distance, and no
 * fixed physical size does that."* So a tablet propped at 0.7 m could legitimately hold twice this
 * many tickets, and a TV across a 3 m kitchen half as many. This module pins `27-F11f`'s stated
 * 1.5 m and does **not** scale, and the reason is a collision between two laws rather than a
 * shortcut:
 *
 *  - scaling the whole surface (one more `zoom` inside `PanelRoot`) would scale **touch targets
 *    with the type**, and at any distance under 1.5 m that drives `27-F8`'s 96 dp kitchen target
 *    below its floor — which `27-F68` (b) forbids **by name**;
 *  - scaling type alone means a type-scale input threading through `packages/ui`'s `TicketCard`
 *    and `QuantityItemLine`, which is a component-API change in the closed vocabulary and wants
 *    its own review.
 *
 * Two laws, two channels, and they do not scale together. **OWED**, named here rather than left to
 * look intentional, and the key it needs is `00 §7` layer 3 beside `panel_ppi`.
 */

/** `27-F28`'s 3-ticket panel: 22" at 16:9, in millimetres of height. */
const REFERENCE_PANEL_HEIGHT_MM = (22 * 25.4 * 9) / Math.hypot(16, 9);

/** `27-F28`: *"22" is what a 3-ticket view costs."* */
const REFERENCE_TICKETS = 3;

/**
 * One ticket's vertical cost in millimetres of glass at `27-F11f`'s 1.5 m — **91.3 mm**.
 *
 * Exported so the boot line, the renderer and the acceptance suite all read one number. A second
 * derivation of this constant is how a screen ends up promising a capacity it does not draw.
 */
export const TICKET_HEIGHT_MM = REFERENCE_PANEL_HEIGHT_MM / REFERENCE_TICKETS;

/**
 * How many `03-F13` tickets this much glass holds at `27-F11f`'s 1.5 m.
 *
 * **Floored at 1, and that is `03-F46` rather than politeness.** *"The queue pages; it never
 * scrolls — and the oldest ticket is always on page 1."* A capacity of 0 would page forever over a
 * queue with work in it, which is the failure `ItemGrid` names (*"items on the page, invisible,
 * with no pager to reach them"*) and is strictly worse than one ticket that overflows its box —
 * an overflow is visible to the operator and to `layout:check`; an unreachable page is not.
 *
 * A panel below one ticket's height is **supported and labelled**, per the FR's own amendment: it
 * costs situational awareness and never reachability, because page 1 always holds the oldest work.
 */
/**
 * # ⚠ THE FIRST SCREENSHOT REJECTED THE FIRST DESIGN, AND THE GATE HAD PASSED IT
 *
 * `27-F28` costs a ticket in **height** — *"only physical height buys capacity"* — so the first
 * implementation stacked full-width tickets in one column. It passed every check in
 * `layout:check`: nothing clipped, nothing overflowed, every target measured 15.24 mm. **And the
 * screenshot is a screen a founder rejects on sight**: on the 22" panel `27-F11f` names, three
 * tickets stretched to 487 mm each — a DONE bar nearly two feet wide — over a page that was
 * **55% empty**. `AGENTS.md` warns about exactly this pair of facts: *"passing the gate is not
 * evidence a screen is good; two screens the founder rejected on sight passed every gate this
 * repo had."* `surface-mode.tsx` names the same defect one app over: *"`layout:check` asked
 * whether things FIT and fitting is not using the room."*
 *
 * ## The corpus's own model for this surface is a GRID, and it is `27-F2` rather than a preference
 *
 * > 27-F2 **Flat paged grids, not scrolling lists, for anything actionable.** … **page capacity is
 * > derived from the surface's usable area** and 27-F8's target size, never fixed by this document.
 *
 * *Usable area* is two-dimensional, and `27-F11a` derives the counter's ~88 tiles as **11 × 8**
 * from exactly that. So a single column was not the FR's model — it was one axis of it.
 *
 * **`27-F28` is not weakened and that is the load-bearing check.** Its measurement is about
 * legibility: ~9.5 *item lines* at 1.5 m is a statement about **type at distance** (`27-F27`), and
 * columns change no type size at all. Its one non-negotiable clause — *"a panel too small for its
 * distance shows FEWER tickets, never smaller type"* — is untouched: `TICKET_HEIGHT_MM` is
 * unchanged, every card renders at the same size on every panel, and a narrow panel gets **one**
 * column rather than a squeezed three.
 *
 * ## Where the column width comes from — a multiple the component itself declares
 *
 * `TicketCard` declares `minWidth: 320` dp = **50.8 mm**, which is the width below which its own
 * content clips. A column AT that minimum is a column at the clip boundary, which is the mistake
 * `window-options.ts` names about floors: *"one set at the bottom of a measured range admits the
 * panel that clips."* **Three times the declared minimum** is the comfortable width, and it is a
 * stated multiple of a number that already exists rather than a new constant.
 *
 * It also lands on the founder's own figure by a different route: 152.4 mm gives `27-F11f`'s 22"
 * panel (487 mm) **three columns**, which is the *"three tickets"* that ruling names — now three
 * ACROSS at full height instead of three stacked over an empty page.
 *
 * **The tension is recorded rather than won**, exactly as `27-F28` records its own with `27-F11f`:
 * a 22" panel now yields **9** tickets (3 × 3) where the FR's single-column arithmetic said 3.
 * Nine is what that glass genuinely holds at unchanged type, and `27-F28`'s amendment says the
 * product REPORTS what a panel yields. Whether 9 is *desirable* — against `27-F2`'s glance budget
 * and `03-F23`'s refusal to help the chef prioritise — is a founder call and a pilot question
 * (`21-F13`'s rush shadowing), not this module's.
 */
const TICKET_MIN_WIDTH_MM = 50.8;
export const TICKET_WIDTH_MM = TICKET_MIN_WIDTH_MM * 3;

/** How many ticket COLUMNS this much width holds. Floored at 1: a narrow panel is one column. */
export const ticketColumns = (widthMm: number): number =>
  Math.max(1, Math.floor(widthMm / TICKET_WIDTH_MM + KNIFE_EDGE));

/** How many ticket ROWS this much height holds — `27-F28`'s own axis, unchanged. */
export const ticketRows = (heightMm: number): number =>
  Math.max(1, Math.floor(heightMm / TICKET_HEIGHT_MM + KNIFE_EDGE));

/**
 * `27-F2`'s page capacity, derived from the surface's usable AREA.
 *
 * The width argument is optional and defaults to one column so that every caller which only has a
 * height — the boot line, the gate's per-panel report — keeps `27-F28`'s own single-column
 * arithmetic and stays comparable with the FR's stated figures.
 */
export const ticketsPerPage = (heightMm: number, widthMm?: number): number =>
  ticketRows(heightMm) * (widthMm === undefined ? 1 : ticketColumns(widthMm));

/**
 * # ⚠ THE REFERENCE PANEL WAS KNIFE-EDGE ON ITS OWN DEFINITION — FOUND BY RUNNING THE GATE
 *
 * Measured 2026-08-10 on the first `layout:check` run, and it is a `27-F11c` violation of exactly
 * the kind that FR exists to forbid:
 *
 * ```
 *   [pass-22]    274 mm of glass → 3 ticket(s) per page
 *   [pass-22-hd] 274 mm of glass → 2 ticket(s) per page
 * ```
 *
 * **The same 22" panel, at two resolutions, held different amounts of ticket** — *"a 1366×768 and
 * a 1920×1080 15.6" panel hold the SAME number of 12 mm tiles. Extra pixels buy sharpness; only
 * inches buy room."*
 *
 * The cause is arithmetic and not a wrong constant. `1920×1080` is exactly 16:9 and `1366×768` is
 * **not** (1.77865 against 1.77778), so the second panel's derived height is **273.89 mm** against
 * the first's **273.95** — a 0.06 mm difference, 0.02%. `TICKET_HEIGHT_MM` is defined as exactly a
 * third of the reference panel, so the reference panel divides to **exactly 3.0**, and `floor`
 * over a knife edge sends anything a hair under it to 2.
 *
 * **The fix is a tolerance and not a smaller ticket** (`27-F68` (b) — never trim the millimetres).
 * 0.5% of a ticket is 0.46 mm: far larger than any aspect-ratio residue, far smaller than any real
 * difference in glass. A panel genuinely 0.4 mm short of `n` tickets is `n` tickets, and the
 * alternative — rounding — would claim a ticket the panel is up to half a ticket short of, which
 * `03-F46` turns into a clipped card rather than a page.
 *
 * **Kept as a worked example rather than fixed quietly**, because the shape recurs: a constant
 * derived from a reference case makes that reference case the exact boundary of a `floor`, and the
 * first panel to disagree by a rounding error is the one the FR calls identical.
 */
const KNIFE_EDGE = 0.005;

/**
 * `00 §5.7` — what the operator is told about the glass they are standing in front of.
 *
 * This is the sentence `27-F28`'s amendment asks for: *"the product reports the capacity that
 * panel yields at its viewing distance and the restaurant decides whether 1.5 tickets is enough."*
 * It is a **statement, never a refusal** — there is no floor here and no `ships` flag, because a
 * 1.5-ticket panel is a supported KDS.
 */
export const describeCapacity = (heightMm: number): string => {
  const held = ticketsPerPage(heightMm);
  const exact = heightMm / TICKET_HEIGHT_MM;
  return (
    `pass capacity: ${held} ticket${held === 1 ? "" : "s"} per page` +
    ` (${heightMm.toFixed(0)} mm of glass / ${TICKET_HEIGHT_MM.toFixed(1)} mm per ticket` +
    ` = ${exact.toFixed(1)}, at 27-F11f's 1.5 m viewing distance).` +
    ` 27-F28: this is STATED, not mandated — a smaller panel shows FEWER tickets and never` +
    ` smaller type, and 03-F46 keeps the oldest work on page 1 either way.`
  );
};
