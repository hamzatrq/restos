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
 * **`05-F2`'s acknowledgment IS NOW EXPRESSIBLE, and this file honours it — but nothing on this
 * device can WRITE one.** The paragraph here used to read *"UNEMITTABLE and therefore unbuilt"*:
 * `01-F5` closed the `audit.*` family at six subtypes and none was an alarm ack, so `01-F4`
 * refused the emit and **every alarm this view raises was permanent**. `05-F30` landed the seventh
 * (`audit.alarm_acknowledged`) and `packages/domain` carries its schema, so the act is possible and
 * the CONSUMER is built below.
 *
 * The PRODUCER is owed and is named rather than stubbed. `05-F29` requires the ack to be appended
 * by the manager DEVICE — `01-F62` makes `audit.*` its own worked example of a branch-scoped type,
 * so no server may mint one — and this platform still cannot open a store (see the paragraph
 * above, and `apps/manager/CLAUDE.md`'s measured port surface). That asymmetry is deliberate: an
 * ack this view honours is worth having the moment any device can write one, and the schema is
 * what makes writing one possible at all. It is the opposite of a subsystem with no seam — the
 * seam exists and the till already writes through one exactly like it.
 *
 * **`05-F3`'s other trigger is now HALF built.** `printer.status_changed` has a payload schema
 * (`03-F53`) and a real producer on the till (`apps/pos-electron/src/main/printing.ts`), so the
 * fact reaches the branch stream. What this view does with it is a **founder call** and is
 * deliberately nothing — see the note on `05-F3` below the pinned interpretations.
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
 *    (a printer fact has no ready analogue, so only an ack clears it) is defensible and would have
 *    made every print alarm PERMANENT while the ack was unemittable. That argument has now been
 *    paid off by `05-F30` rather than by this line, so the reading rests on `05-F3`'s own words
 *    alone; one `continue` implements it and overruling it is a one-line change.
 * 4. **An ack is PERMANENT for the alarm it names** (`01-F1`), so a repeat of the same failure
 *    does not re-raise it. `05-F4` collapses repeated crossings *"into the existing alarm"* and
 *    interpretation 2 already collapses repeated `kot.print_failed` on one (order, printer) into
 *    ONE alarm — so a second failure IS that alarm, and that alarm has been acknowledged. The
 *    alternative (a fresh failure after an ack re-raises) is defensible — the kitchen still has no
 *    ticket — and is refused because the ack is permanent while the failure repeats on every retry
 *    exhaustion, which is `05-F4`'s siren wall reached one indirection later.
 *
 * ## `05-F3`'s printer-offline alarm: the guess this file does NOT make
 *
 * `printer.status_changed(offline)` now reaches this device as a real fact, and **nothing below
 * raises an alarm from it.** `05-F30` records why it is a founder call: that alarm has no order,
 * so `05-F1`'s shape (order, channel, table, age) cannot carry it, and `05-F2` enumerates exits of
 * which ready/served cannot apply to a printer — leaving it exactly one. Attaching the fact to
 * whichever order happens to be open is the shape an implementer reaches for when the type turns
 * up in the same `facts` array as `kot.print_failed`, and it would name the wrong order for ever.
 * So `05-F3` stays HALF BUILT, deliberately, and the absence is asserted rather than assumed.
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
 * reading of *"there is nothing to cook"* matters more than which reading. ⚠ **Its second reason
 * has EXPIRED and is struck rather than deleted**: it read *"the alternative is an alarm about food
 * nobody is cooking that no manager can clear while the ack is unemittable"*, and `05-F30` has
 * since made the ack expressible, so a manager could now clear it. The reading stands on the first
 * reason alone and is weaker than it was. If it is overruled, the change is
 * `>= && lines_total > 0` on one line.
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
// A VALUE import, and safe on this platform: `probe.ts` already value-imports `@restos/domain`
// (`verifyPin`, `PIN_ARGON2ID_PARAMS`) and the Hermes bundle carries it. Contrast the type-only
// import below, which must STAY type-only.
import { ALARM_ACK_KINDS, type AlarmAckKind } from "@restos/domain";
// TYPE-only, and it must stay type-only: the pure `fold-engine` subpath is the one door that does
// not pull `device-store.ts` and with it `better-sqlite3` (see `apps/manager/CLAUDE.md`).
import type { KitchenQueueRow, OpenOrderRow } from "@restos/sync-client/fold-engine";

/**
 * `05-F1`'s aging alarm and `05-F3`'s printer alarm — two remedies, two walks, two kinds.
 *
 * **The kernel's set, not a local copy.** `05-F30` makes `alarm_kind` a CLOSED payload field on
 * `audit.alarm_acknowledged`, so an ack this view suppresses against is matched on the ledger's own
 * vocabulary; two readings of one closed set is `03-F40`'s named defect, and here it would produce
 * an ack that parses at the kernel and clears nothing on the screen. Widening the set is a founder
 * call recorded at `ALARM_ACK_KINDS`, and this alias means it cannot be widened in only one place.
 */
export type AlarmKind = AlarmAckKind;

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

/** `05-F30`'s subtype — `01-F5`'s seventh, and the only thing that clears a row of this list. */
const ALARM_ACK = "audit.alarm_acknowledged";

/**
 * The suppression key: `05-F30`'s three FACTS, never a composed alarm id.
 *
 * `05-F30` rules this and gives the reason — the view's `Alarm.id` is a FORMAT, and matching on it
 * would mean that changing the format silently resurrects every acknowledged alarm in history,
 * which `01-F1` offers no way to correct. These three fields are the ledger's own vocabulary.
 *
 * The separator is a NUL written as an ESCAPE, for the reason stated on the collapse key below: a
 * literal NUL makes this file BINARY to `grep`, and a symbol-precise grep is this repo's closing
 * evidence for its own recurring defect. It cannot occur in a kind, an order id or a printer name,
 * so no triple can collide with another — and `late_order`'s empty printer component cannot
 * collide with a `print_failed` one because the kind leads.
 */
const ackKey = (kind: AlarmKind, order_id: string, printer_name: string | null): string =>
  `${kind}\u0000${order_id}\u0000${printer_name ?? ""}`;

/**
 * ⚠ **A TYPE NARROW, never a coercion, and the difference is a live alarm.**
 *
 * The adapter that will one day supply these has already validated each envelope through
 * `parseEvent` (`01-F4`), so a malformed ack cannot reach here — but this view narrows `unknown`
 * payloads itself by design (see `BranchFact`), and the failure mode of a loose narrow is an alarm
 * dismissed by an envelope that never acknowledged anything, which `05-F2` forbids in terms
 * (*"never auto-dismissed silently"*). A `String(...)` in place of these guards is indistinguishable
 * on an ABSENT field — it produces a key nothing matches either way — and silently dismisses a real
 * alarm the moment a field merely STRINGIFIES to a valid one.
 */
const isAlarmKind = (value: unknown): value is AlarmKind =>
  typeof value === "string" && (ALARM_ACK_KINDS as readonly string[]).includes(value);

/** One ack, reduced to the key it clears — or `null` if it identifies no alarm at all. */
const ackKeyOf = (payload: Readonly<Record<string, unknown>>): string | null => {
  const { alarm_kind, order_id, printer_name } = payload;
  if (!isAlarmKind(alarm_kind)) return null;
  if (typeof order_id !== "string" || order_id === "") return null;
  // `05-F4` puts two failed printers on one order in TWO alarms, because `03-F5` says the manager
  // has to know which one to walk to. An ack naming neither would clear both or neither, so a
  // `print_failed` ack without its printer identifies nothing and clears nothing.
  if (alarm_kind === "print_failed") {
    return typeof printer_name === "string" && printer_name !== ""
      ? ackKey(alarm_kind, order_id, printer_name)
      : null;
  }
  return ackKey(alarm_kind, order_id, null);
};

/**
 * **Every ack in the stream, collected BEFORE any alarm is judged — and the pass is the law.**
 *
 * A single forward walk that tested each `kot.print_failed` against the acks seen so far would be
 * an ordering dependence: the same two envelopes delivered the other way round on the other device
 * give two different consoles, which is exactly the `01-F34` break standing law 1 calls *"the law
 * most often broken by accident"*. A set has no order, so an ack before its failure and an ack
 * after it are the same answer, and no envelope id reaches a decision.
 */
const acknowledgedKeys = (facts: readonly BranchFact[]): ReadonlySet<string> => {
  const acked = new Set<string>();
  for (const fact of facts) {
    // EXACTLY this subtype. `type.startsWith("audit.")` would let the TILL's
    // `audit.print_acknowledged` clear a manager's alarm — a cashier at the counter dismissing an
    // S1 band would answer the FR (`05-F3`) that exists so the trouble reaches the manager *even
    // off the floor*. `05-F30` says the two acks do not join, and this is where that holds.
    if (fact.type !== ALARM_ACK) continue;
    const key = ackKeyOf(fact.payload);
    if (key !== null) acked.add(key);
  }
  return acked;
};

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

  // `05-F2`'s SECOND EXIT, collected before anything is judged (see `acknowledgedKeys`). It is a
  // FOLD and not a consumption: the set is rebuilt on every derivation, so an acknowledged alarm
  // stays cleared as its order ages on (`05-F4` re-derives the row with an updated age at every
  // render, and an ack that expired would rebuild the siren wall out of the fix for one).
  const acked = acknowledgedKeys(input.facts);

  const alarms: Alarm[] = [];
  for (const [order_id, context] of active) {
    // `05-F1` fires on RED and only on red. `27-F14` allocates amber to *"ticket approaching due"*
    // and red to *"ticket overdue"*; an alarm at amber would spend red's slot on amber's claimant.
    if (context.minutes < context.redAt) continue;
    // `05-F2`: "until the order goes ready/served OR the manager acknowledges". Keyed per kind, so
    // acknowledging "this order is late" cannot silently dismiss "the kitchen never got the
    // ticket" on the same order — two alarms with two different remedies, and `05-F2` forbids the
    // silent one in terms.
    if (acked.has(ackKey("late_order", order_id, null))) continue;
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
    // `05-F2`'s second exit, per printer. `05-F4` puts two failed printers on one order in TWO
    // alarms because `03-F5` says the manager has to know which one to walk to — so an ack naming
    // one leaves the other standing, and the second printer is still down with nobody told.
    if (acked.has(ackKey("print_failed", order_id, printer_name))) continue;
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
