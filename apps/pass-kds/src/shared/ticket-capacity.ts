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
export const ticketsPerPage = (heightMm: number): number =>
  Math.max(1, Math.floor(heightMm / TICKET_HEIGHT_MM));

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
