import type { AgingPolicy } from "@restos/device-config";
import { ORDER_LINE_STATES, type OrderLineState, TERMINAL_LINE_STATES } from "@restos/domain";
import type { DeviceStore, OpenOrderRow } from "@restos/sync-client";

/**
 * # `03-F13` — THE BRANCH ORDER QUEUE, AND THE ONE PROPERTY THAT IS A LAW
 *
 * > 03-F13 One tablet at the pass shows the branch order queue — all channels, channel-tagged —
 * > **strictly chronological by confirm time**. Card contents: order number, channel badge,
 * > table, age, line summary.
 *
 * ## ⚠ "STRICTLY CHRONOLOGICAL BY CONFIRM TIME" IS STANDING LAW 1, NOT A SORT PREFERENCE
 *
 * `01-F34`: a projection reads **no ordering metadata** — no `global_seq`, no `lamport_seq`, no
 * device clock, and no envelope-id comparison that reaches a projected value. `AGENTS.md` calls
 * it *"the law most often broken by accident … twice in the post-review round"*, and a queue sort
 * is the single most natural place in this product to break it: the rows arrive in an array, the
 * array has an order, and taking it is one line of code that looks like nothing.
 *
 * **What this module sorts by is `KitchenQueueRow.confirm_at`**, which `merge.ts` sets from the
 * confirm anchor's `branch_created_at` — the **branch-consensus stamp** of standing law 2
 * (`01-F43`..`01-F46`), stamped once at append by the confirming device and travelling INSIDE the
 * event. It is not this device's clock, it is not arrival order, and it is not a sequence number.
 * `queue-ordering.test.ts` pins that with a bijective id-relabel and an arrival-order shuffle,
 * because *"we did not intend to"* is not evidence.
 *
 * **The tiebreak is `order_id` and it is a PRESENTATION sequence only.** Two orders confirmed in
 * the same millisecond are equally old, so either order is equally the work order (`27-F7`); a
 * total order is needed only so the list does not flicker between renders. This is the same
 * device `merge.ts` uses for its own confirm anchor (*"the id term only breaks ties between EQUAL
 * stamps so it never moves a projected value"*) and the same one `AvailabilityRow.head_ids_json`
 * uses for its head sort. It reaches no value: remove it and every ticket keeps its contents, its
 * age and its colour.
 *
 * ## `27-F7` — the visual order IS the work order, and `03-F23` is why nothing may improve it
 *
 * > 03-F23 Sequencing is **visibility only**. The system never dictates cook order: no
 * > auto-prioritization, no reordering of the queue, no "cook this next" prompts — at any tier,
 * > ever. Chronological order + aging color is the entire sequencing UI; the chef decides.
 *
 * So a red ticket does not move, a nearly-complete order does not move, and a channel with a
 * delivery promise does not move. **The only ordering input in this file is the confirm stamp**,
 * and a reviewer should read any future `sort` here as a defect until proven otherwise.
 *
 * ## `03-F17` — when an order LEAVES
 *
 * > An order leaves the queue when all its lines reach a terminal service state — `served`, or
 * > `picked_up` for delivery (canonical vocabulary, 01 §4)
 *
 * `KITCHEN_DONE` below is that set plus `voided` and `cancelled`, and the addition is stated
 * rather than slipped in: a voided line is not food anyone is cooking, and leaving it on the
 * pass would put work on the screen that does not exist. `TERMINAL_LINE_STATES` from `domain` is
 * `["served", "delivered", "voided", "cancelled"]` and `picked_up` is deliberately NOT terminal
 * there (delivery walks `picked_up → delivered`), so the FR's own word has to be added back.
 *
 * ## ⚠ NOTHING AT T2 EMITS `served`, SO A FULLY-READY ORDER DOES NOT LEAVE. NAMED, NOT HIDDEN.
 *
 * Measured 2026-08-10. `02-F31`'s settlement half is the only producer of `served` in the whole
 * product (`apps/pos-electron/src/main/line-advance.ts`) and it is **tier-gated to T1** — a
 * branch with a pass screen is T2 by `02-F31`'s own detection rule, so `LineAdvance.settled`
 * refuses. `02-F33`'s counter ready-marking and doc 04's waiter-on-pickup are both unbuilt. So on
 * the branch this app is FOR, a ticket every line of which this screen has marked `ready` stays
 * in the queue until the order is voided.
 *
 * **That is not fixed here and must not be**: marking a line `served` from the pass is a claim
 * that food was handed to a customer, it is TERMINAL under `01-F35`, and `01-F1` will not let
 * anyone take it back. The screen therefore says what is true (`00 §5.7`) — a fully-ready ticket
 * renders with its bump control retired and an assembly count of `n of n` — and the gap is
 * carried as an owed item rather than papered over with an invented act.
 */

/**
 * `03-F17`'s exit condition, plus the two exits `01 §4` calls terminal for every state.
 *
 * `picked_up` is the FR's own word for delivery and is not in `domain`'s `TERMINAL_LINE_STATES`,
 * so it is added; `delivered` follows it down the same chain. `ready` is deliberately absent —
 * a ready ticket is the pass's whole remaining job.
 */
export const KITCHEN_DONE: ReadonlySet<string> = new Set<string>([
  ...TERMINAL_LINE_STATES,
  "picked_up",
]);

/** `03-F13`'s "line summary", one row per line. */
export type PassLine = {
  readonly line_id: string;
  /** `03-F38` — the short kitchen name where the catalog carries one, else the display name. */
  readonly name: string;
  readonly quantity: number;
  /**
   * The line's projected state, or `null` when the fold projects a CONTESTED set (`01-F31`: *"a
   * fold never picks a winner"*). A contested line is shown as contested and is never bumped.
   */
  readonly state: OrderLineState | null;
  /** `03-F15` — has this line already been marked done by some station? */
  readonly done: boolean;
};

/** `03-F13`'s card, and nothing else. No price (`03-F32`), no ETA (`03 §3`), no priority (`03-F23`). */
export type PassTicket = {
  readonly order_id: string;
  /** The identifier the kitchen shouts across the pass. See `referenceOf`. */
  readonly reference: string;
  /** `02-F42`'s closed channel set, tagged on every card (`03-F13`: *"all channels, channel-tagged"*). */
  readonly channel: string;
  /** `02-F1`'s order type — the key `03-F14`'s thresholds are per. */
  readonly order_type: string | null;
  /** `03-F13`'s table. Empty for every channel that has none; never invented. */
  readonly tables: readonly string[];
  /** `01-F31` — two devices assigned different tables and the fold refused to pick. */
  readonly table_conflict: boolean;
  /**
   * `order.confirmed`'s branch-consensus stamp, in epoch milliseconds — **the sort key**, carried
   * onto the card rather than left in the sort.
   *
   * It is here for `27-F7`'s sake and for `OrdersSurface.tsx`'s recorded lesson: that surface
   * drew *"oldest first"* over a list whose rule the rows did not follow, and *"a caption
   * asserting a rule the rows do not follow is worse than no caption"*. A renderer that holds the
   * key it is sorted by can assert the claim it makes, and `pass-surface.dom.test.tsx` does.
   */
  readonly confirm_at: number;
  /** Minutes since `order.confirmed`'s branch-consensus stamp (`03-F14`, `03-F25`). */
  readonly minutes: number;
  /** `03-F14`'s X and Y for THIS order's type, resolved from layer 2. */
  readonly amberAt: number;
  readonly redAt: number;
  readonly lines: readonly PassLine[];
  /** `03-F15` — "2 of 3 items ready". Counted here so the renderer cannot count differently. */
  readonly linesDone: number;
  readonly linesTotal: number;
  /**
   * `03-F16` — are there lines this surface could legally advance to `ready` right now?
   *
   * Computed on the trusted side from the same projection `ready-mark.ts` walks, so the control
   * the operator sees and the act main will perform cannot disagree. `false` here is what makes a
   * fully-ready ticket render without a dead button (`27-F5`: no inert primary controls).
   */
  readonly bumpable: boolean;
};

/**
 * There is **no order number in the ledger**, and this is where that fact is answered.
 *
 * `01 §4` carries `order_id` — a UUID — and no human-facing sequence anywhere; `02-F1` names the
 * type and the channel and no number. `apps/pos-electron`'s counter already prints
 * `order_id.slice(0, 8)` on both its order list and its own kitchen read, so this uses **the same
 * eight characters**. That is the whole justification: the number the pass shouts across the
 * kitchen has to be the number the cashier reads off her screen, and two different derivations of
 * one identifier is how a cook and a cashier end up arguing about which ticket is #142.
 *
 * **Owed, and it is a spec question rather than a code one:** `03-F13` says *"order number"* and
 * `03-F3` puts one in large type on the KOT, so the corpus expects a short human sequence that
 * the corpus does not model. A real one is per-branch, per-business-day and monotonic, which is
 * a kernel projection and a spec PR — not something a screen invents.
 */
export const referenceOf = (order_id: string): string => order_id.slice(0, 8);

type LineCell = { item_id?: unknown; qty?: unknown; states?: unknown };

/** A catalog lookup narrowed to what a kitchen card needs. `03-F38` prefers the kitchen name. */
export type KitchenNameResolver = (item_id: string) => string;

const isLineState = (value: unknown): value is OrderLineState =>
  typeof value === "string" && (ORDER_LINE_STATES as readonly string[]).includes(value);

/**
 * One order's lines, read out of the fold's own `json_lines` cells.
 *
 * `states` is either a single projected watermark or the full terminal MVR set when the line is
 * contested (`merge.ts`). A contested line resolves to `state: null` and is counted as NOT done,
 * which is the conservative half: showing a disputed line as outstanding keeps it in front of the
 * cook, where showing it as done would take real food off the pass on the strength of a
 * disagreement the fold explicitly refused to resolve.
 */
export const linesOf = (jsonLines: string, name: KitchenNameResolver): readonly PassLine[] =>
  Object.entries(JSON.parse(jsonLines) as Record<string, LineCell>).map(([line_id, cell]) => {
    const states = Array.isArray(cell.states) ? cell.states : [];
    const only = states.length === 1 ? states[0] : null;
    const state = isLineState(only) ? only : null;
    return {
      line_id,
      // `01-F54` — an unsynced or renamed item degrades to its identifier and NEVER blocks. The
      // cook loses a word; the ticket, the quantity and the age are all still on the glass.
      name: name(typeof cell.item_id === "string" ? cell.item_id : line_id),
      quantity: typeof cell.qty === "number" ? cell.qty : 0,
      state,
      // `ready` counts as done for `03-F15`'s assembly view; so does anything past it.
      done: state !== null && (state === "ready" || KITCHEN_DONE.has(state)),
    };
  });

/** `03-F13`'s table, out of the fold's canonical sorted-JSON head set. */
const tablesOf = (row: OpenOrderRow): readonly string[] => {
  const parsed: unknown = JSON.parse(row.table_ids_json);
  return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
};

/**
 * `03-F16` — can this surface legally move any of this order's lines to `ready` right now?
 *
 * The predicate is `domain`'s own legality table read through `LEGAL_NEXT`-backed
 * `applyLineState`, and it lives here rather than in the renderer for the reason `03-F24` gives
 * about read-only surfaces: the button and the act must be the same decision. `ready-mark.ts`
 * re-derives it from the same cells at append time, so a stale renderer cannot force an edge.
 */
const bumpableLines = (lines: readonly PassLine[]): boolean =>
  lines.some((l) => l.state !== null && !KITCHEN_DONE.has(l.state) && l.state !== "ready");

export type PassQueueDeps = {
  readonly store: Pick<DeviceStore, "openOrders" | "kitchenQueue" | "branchTimeStatus">;
  readonly name: KitchenNameResolver;
  readonly aging: AgingPolicy;
  /**
   * Branch time NOW, in epoch milliseconds — `wallClock.now() + branchTimeStatus().offset_ms`.
   *
   * Injected rather than read here so a suite can drive the clock, and note what it is used for:
   * **the age only**. It never reaches the sort. A device whose clock is an hour out shows every
   * ticket an hour old and still shows them in exactly the right order, which is standing law 2's
   * whole argument — *"durations need a consistent clock, not a correct one"* — and is why a
   * failed hub handover cannot scramble the kitchen.
   */
  readonly now: () => number;
};

/**
 * **The queue, `03-F13` to the letter.**
 *
 * The join is `kitchenQueue()` (which exists iff the order is confirmed — so an unconfirmed cloud
 * order in the counter's inbox is correctly absent from the kitchen) against `openOrders()` (for
 * the channel, the type, the table and the lines).
 *
 * An order in the queue projection with no open-order row is **dropped**, not rendered blank:
 * the two projections are written in one transaction by one fold, so a queue row without its
 * order is a kernel invariant break rather than a state to design a card for.
 */
export const passQueue = (deps: PassQueueDeps): readonly PassTicket[] => {
  const orders = new Map(deps.store.openOrders().map((o) => [o.order_id, o]));
  const now = deps.now();
  const tickets: PassTicket[] = [];
  for (const row of deps.store.kitchenQueue()) {
    const order = orders.get(row.order_id);
    if (order === undefined) continue;
    const lines = linesOf(order.json_lines, deps.name);
    // `03-F17` — every line at a terminal service state (or voided) and the order is off the pass.
    // An order with NO lines is dropped too: there is nothing to cook.
    if (lines.length === 0 || lines.every((l) => l.state !== null && KITCHEN_DONE.has(l.state))) {
      continue;
    }
    const { amberAt, redAt } = deps.aging.thresholdsFor(order.order_type);
    tickets.push({
      order_id: row.order_id,
      reference: referenceOf(row.order_id),
      channel: row.channel,
      order_type: order.order_type,
      tables: tablesOf(order),
      table_conflict: order.table_conflict === 1,
      confirm_at: row.confirm_at,
      // `03-F14`'s timer basis: `age_basis` IS the confirm anchor and nothing else. Floored at 0
      // because a provisional branch clock can be behind the stamp it is comparing against, and a
      // negative age on a kitchen ticket is a number that teaches an operator to distrust the row.
      minutes: Math.max(0, Math.floor((now - row.age_basis) / 60_000)),
      amberAt,
      redAt,
      lines,
      linesDone: lines.filter((l) => l.done).length,
      linesTotal: lines.length,
      bumpable: bumpableLines(lines),
    });
  }
  return tickets.sort(byConfirmTime);
};

/**
 * **`03-F13`'s comparator, exported so it is one expression a reviewer can check and a mutant can
 * break.**
 *
 * The key is the raw millisecond stamp and **not the rendered `minutes`**, and that is a
 * correctness point rather than a style one: `minutes` is floored to whole minutes, so two tickets
 * confirmed 30 seconds apart share a value and the id tiebreak would silently decide the cook
 * order between them. The first draft of this file did exactly that. `27-F7` makes the visual
 * order the *work* order, and half a minute of kitchen work is not a rounding error.
 *
 * Nothing else may ever enter this comparator — see this module's header for `01-F34`, and for why
 * the id term is legal (it separates only EQUAL stamps, so it reaches no value).
 */
export const byConfirmTime = (a: PassTicket, b: PassTicket): number =>
  a.confirm_at !== b.confirm_at
    ? a.confirm_at - b.confirm_at
    : a.order_id < b.order_id
      ? -1
      : a.order_id > b.order_id
        ? 1
        : 0;
