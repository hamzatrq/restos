/**
 * # `05-F1`..`05-F4` — the manager console's ACTIVE ALARM LIST, as a pure derivation
 *
 * > 05-F1 Late-order alarm: when an order (or line) crosses the red aging threshold (03-F14), the
 * > console raises an alarm naming order, channel, table, and age.
 * > 05-F2 Alarms persist in an active list until the order goes ready/served or the manager
 * > acknowledges … Alarms are never auto-dismissed silently.
 * > 05-F3 Print-failure alarms: `kot.print_failed` and `printer.status_changed(offline)` raise on
 * > the console with the same persistence rules.
 * > 05-F4 … one alarm per order per threshold crossing; repeated crossings collapse into the
 * > existing alarm with an updated age.
 *
 * `05 §5` puts the active alarm list under **Materialized (device)** with *"no console-only
 * source-of-truth entities — everything folds from the ledger"*, and `18 §6` allows an app to
 * *"register app-specific derived VIEWS but not new folds without a `sync-client` PR"*. This is
 * that view: a pure function of two already-projected row sets plus the `kot.print_failed`
 * envelopes `merge.ts` deliberately leaves projection-inert (*"Its reader is doc 05's alarm
 * console (05-F3)"*). It declares no fold, keys no entity and writes nothing.
 *
 * ## ⚠ WHAT DOES NOT EXIST, so that a clean suite is not read as a working console
 *
 * **Nothing on this device can hand this function a real `AlarmInput` today.** Measured
 * 2026-08-12: `packages/sync-client`'s `openStore` constructs `better-sqlite3` directly
 * (`device-store.ts:33`), `createCloudSession` requires a whole `DeviceStore`
 * (`cloud-session.ts:125`), and `services/api`'s router exposes auth / session / catalog /
 * devices / summary / ops — **no live order or queue read model on either plane**. `home.ts`
 * is where that fact is stated to the screen rather than papered over; see its header.
 *
 * **`05-F2`'s acknowledgment is UNEMITTABLE and therefore unbuilt here.** `01-F5` closes the
 * `audit.*` family at six subtypes (`registry.ts:797`) and none of them is an alarm ack, so
 * `01-F4` refuses the emit. There is no `acknowledged` input below **on purpose**: a seam whose
 * producer cannot exist is this wave's named defect, and inventing a seventh subtype is a
 * `packages/domain` change (protected path) plus a spec PR to docs 01 and 05.
 *
 * **`05-F3`'s other trigger is unemittable too.** `printer.status_changed` has no payload schema
 * in `packages/domain` and occurs in no production file anywhere in `apps/`, `services/` or
 * `packages/` (symbol-precise `grep -a`, 2026-08-12). Only the `kot.print_failed` half is built.
 *
 * ## Three readings this file PINS. Each is a choice, not a transcription.
 *
 * 1. **The red threshold is inclusive — `minutes >= redAt`.** `03-F14` says *"red at Y min"* and
 *    does not say which side of Y. `packages/ui`'s `ageLevel` already ships `minutes >= redAt`,
 *    and `03-F40`'s two-sensor-layouts lesson is that two readings of one number diverge and then
 *    one surface is right and another wrong. One reading.
 * 2. **A print-failure alarm collapses per (order_id, printer_name)**, not per event and not per
 *    order. `printing.ts:312` records that two "Send to kitchen" taps append two
 *    `kot.print_failed`, which under a per-event rule is the siren wall `05-F4` exists to prevent;
 *    and `03-F5` names the printer precisely because the fix is per-printer, so two printers down
 *    on one order stay two alarms.
 * 3. **`05-F3`'s "the same persistence rules" means the whole of `05-F2`**, including its
 *    ready/served exit — a print alarm clears when its order goes ready. The alternative reading
 *    (a printer fact has no ready analogue, so only an ack clears it) is defensible and would make
 *    every print alarm PERMANENT today, because the ack is unemittable. One `continue` implements
 *    the pinned reading; overruling it is a one-line change.
 *
 * ## The order an order LEAVES on, and the one case the corpus does not decide
 *
 * `lines_ready >= lines_total` is the projection's own statement that the kitchen is finished:
 * `merge.ts:1149` excludes exited (voided / cancelled) lines from `lines_total` and counts
 * `cookingDone` into `lines_ready`.
 *
 * ⚠ **A fully-voided order projects `0 of 0`, and that clears here.** `05-F2` enumerates exactly
 * two exits and adds *"never auto-dismissed silently"*, so a void is genuinely undecided by the
 * corpus — **a founder call, reported rather than hidden.** This file takes `apps/pass-kds`'
 * shipped reading of the same projection for the same kind of surface (`pass-queue.ts:246`: *"An
 * order with NO lines is dropped too: there is nothing to cook"*), because the product having one
 * reading of *"there is nothing to cook"* matters more than which reading, and because the
 * alternative is an alarm about food nobody is cooking **that no manager can clear** while the ack
 * is unemittable. If it is overruled, the change is `>= && lines_total > 0` on one line.
 *
 * ## `01-F34` — what this view is NOT allowed to read
 *
 * No `global_seq`, no `lamport_seq`, no `device_created_at`, no `server_received_at`, and no
 * envelope-id comparison that reaches a projected value. The two places that law is easiest to
 * break here are both taken deliberately: **every projected value comes from the ORDER**, never
 * from whichever print fact survives a collapse, and **nothing sorts** — the returned sequence
 * follows the input arrays, so an arrival order cannot decide a number. `alarm-derivation.test.ts`
 * pins both with an arrival-order reversal and a bijective id relabel.
 */

import type { AgingPolicy } from "@restos/device-config/aging";
// TYPE-only, and it must stay type-only: the pure `fold-engine` subpath is the one door that does
// not pull `device-store.ts` and with it `better-sqlite3` (see `apps/manager/CLAUDE.md`).
import type { KitchenQueueRow, OpenOrderRow } from "@restos/sync-client/fold-engine";

/** `05-F1`'s aging alarm and `05-F3`'s printer alarm — two remedies, two walks, two kinds. */
export type AlarmKind = "late_order" | "print_failed";

/** One row of `05 §5`'s active alarm list. */
export type Alarm = {
  /**
   * Stable across re-derivations of the same underlying fact, which is what `05-F4`'s *"collapse
   * into the EXISTING alarm with an updated age"* means for a surface that re-renders. The format
   * is deliberately not a contract; the stability is.
   */
  readonly id: string;
  readonly kind: AlarmKind;
  readonly order_id: string;
  /**
   * `05-F1`'s *"naming order"*. There is no order NUMBER in the ledger (`01 §4` carries a UUID),
   * and the counter and the pass both already shout the first eight characters — see
   * `apps/pass-kds/src/main/pass-queue.ts:156`, whose reasoning governs here too: *"the number the
   * pass shouts across the kitchen has to be the number the cashier reads off her screen"*. A
   * manager reading a third derivation of one identifier is the same defect one surface further on.
   */
  readonly reference: string;
  /** `05-F1`'s *"channel"* — `02-F42`'s closed set, as the confirm projected it. */
  readonly channel: string;
  /** `05-F1`'s *"table"*. Empty for every channel that has none; never invented. */
  readonly tables: readonly string[];
  /** `05-F1`'s *"age"* — minutes since `order.confirmed`'s branch-consensus stamp (`03-F14`). */
  readonly minutes: number;
  /** `03-F5`/`05-F3`'s printer, or `null` on an aging alarm. The manager has to know where to walk. */
  readonly printer_name: string | null;
};

/**
 * A branch envelope as this view reads it: **the narrow read**.
 *
 * `payload` is deliberately `unknown`-valued rather than pre-narrowed. The adapter that will one
 * day supply these reads a MIXED stream and has already validated each envelope through
 * `parseEvent` (`01-F4`); narrowing there as well would put a second reading of
 * `kot.print_failed`'s payload in the product, which is `03-F40`'s defect. This view narrows once,
 * here.
 *
 * `id` and `branch_created_at` are carried because a fact has them, and are read by nothing below
 * — see the `01-F34` note in the header. The forbidden ordering fields are absent BY DESIGN.
 */
export type BranchFact = {
  readonly id: string;
  readonly type: string;
  readonly branch_created_at: number;
  readonly payload: Readonly<Record<string, unknown>>;
};

/** Everything the alarm list is a function of. No clock is read; `now` is supplied. */
export type AlarmInput = {
  /** `merge.ts`' kitchen queue — the row exists iff the order is confirmed (`03-F14`'s basis). */
  readonly queue: readonly KitchenQueueRow[];
  /** `merge.ts`' open orders — the channel, the type and the table. */
  readonly orders: readonly OpenOrderRow[];
  /** The projection-inert branch facts this view is the declared reader of (`05-F3`). */
  readonly facts: readonly BranchFact[];
  /**
   * Branch time NOW in epoch milliseconds — `wallClock.now() + branchTimeStatus().offset_ms`, per
   * `pass-queue.ts`' precedent, **not** the device clock. It reaches the AGE only, never a
   * decision about order, which is standing law 2's whole argument: *"durations need a consistent
   * clock, not a correct one"*.
   */
  readonly now: number;
  /** `03-F14`'s X/Y per order type, resolved from `00 §7` layer 2. Asked, never second-guessed. */
  readonly aging: AgingPolicy;
};

/** See `Alarm.reference`. The same eight characters the counter and the pass already print. */
const referenceOf = (order_id: string): string => order_id.slice(0, 8);

/** `05-F1`'s table, out of the fold's canonical sorted-JSON head set (`pass-queue.ts:193`). */
const tablesOf = (order: OpenOrderRow): readonly string[] => {
  const parsed: unknown = JSON.parse(order.table_ids_json);
  return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
};

/**
 * The per-order facts BOTH alarm kinds are built from.
 *
 * One context per order is what makes `01-F34` hold for the print alarms: a collapse picks a
 * surviving FACT, and if any rendered value came off that fact the answer would depend on arrival
 * order. Nothing here comes off a fact.
 */
type OrderContext = {
  readonly channel: string;
  readonly tables: readonly string[];
  readonly minutes: number;
  readonly redAt: number;
};

/**
 * **`05 §5`'s active alarm list.** Pure, total, and stable: same input, same answer.
 *
 * The join is the kitchen queue (which exists iff confirmed) against the open orders (for the
 * type, the table and the aging thresholds). A queue row with no open-order row is **dropped**
 * rather than rendered blank, following `pass-queue.ts:242`: the two projections are written in
 * one transaction by one fold, so a queue row without its order is a kernel invariant break rather
 * than a state to design a card for.
 */
export const alarmsFrom = (input: AlarmInput): readonly Alarm[] => {
  const orders = new Map(input.orders.map((o) => [o.order_id, o]));
  /** Orders still owed by the kitchen. Insertion order = queue order; nothing is sorted. */
  const active = new Map<string, OrderContext>();
  for (const row of input.queue) {
    const order = orders.get(row.order_id);
    if (order === undefined) continue;
    // `05-F2`'s ready/served exit, and `05-F3`'s by pinned interpretation 3. See the header for
    // the `0 of 0` case, which is a founder call rather than a measurement.
    if (row.lines_ready >= row.lines_total) continue;
    active.set(row.order_id, {
      channel: row.channel,
      tables: tablesOf(order),
      // `03-F14`'s timer basis: `age_basis` IS the confirm anchor and nothing else, *"so a failed
      // print never hides a late order"*. Floored at 0 for `pass-queue.ts:261`'s stated reason —
      // a provisional branch clock can sit behind the stamp it is comparing against, and a
      // negative age is a number that teaches an operator to distrust the row.
      minutes: Math.max(0, Math.floor((input.now - row.age_basis) / 60_000)),
      redAt: input.aging.thresholdsFor(order.order_type).redAt,
    });
  }

  const alarms: Alarm[] = [];
  for (const [order_id, context] of active) {
    // `05-F1` fires on RED and only on red. `27-F14` allocates amber to *"ticket approaching due"*
    // and red to *"ticket overdue"*; an alarm at amber would spend red's slot on amber's claimant.
    if (context.minutes < context.redAt) continue;
    alarms.push(alarmOf("late_order", order_id, context, null));
  }

  /** `05-F4` volume discipline, per pinned interpretation 2: one alarm per (order, printer). */
  const raised = new Set<string>();
  for (const fact of input.facts) {
    if (fact.type !== "kot.print_failed") continue;
    const { order_id, printer_name } = fact.payload;
    if (typeof order_id !== "string" || typeof printer_name !== "string") continue;
    const context = active.get(order_id);
    // No context means the order is ready (cleared above) or its confirm has not arrived on this
    // device yet — the transient shape `01-F10` parks. A card with no channel, no table and no age
    // is not something `03-F5` asks anyone to act on, and the alarm appears when the confirm does.
    if (context === undefined) continue;
    // The separator is written as an ESCAPE and not as a raw byte. A literal NUL in a source
    // file makes it BINARY to `grep`, and a symbol-precise grep is this repo's closing evidence
    // for its own recurring defect (AGENTS.md: *"use `grep -a` … treat a `Binary file …` line as
    // a hit you have not yet read"*). Found by a mutant that reported PATTERN ABSENT against a
    // line that was plainly present. NUL is the separator because it cannot occur in either
    // component, so no (order, printer) pair can collide with another.
    const key = `${order_id}\u0000${printer_name}`;
    if (raised.has(key)) continue;
    raised.add(key);
    alarms.push(alarmOf("print_failed", order_id, context, printer_name));
  }
  return alarms;
};

const alarmOf = (
  kind: AlarmKind,
  order_id: string,
  context: OrderContext,
  printer_name: string | null,
): Alarm => ({
  // Derived from the fact the alarm is ABOUT, so the same underlying trouble re-derives to the
  // same row (`05-F4`). An id minted per call passes every other assertion in the suite and turns
  // the console into a siren wall the moment anything re-renders.
  id: printer_name === null ? `${kind}:${order_id}` : `${kind}:${order_id}:${printer_name}`,
  kind,
  order_id,
  reference: referenceOf(order_id),
  channel: context.channel,
  tables: context.tables,
  minutes: context.minutes,
  printer_name,
});
