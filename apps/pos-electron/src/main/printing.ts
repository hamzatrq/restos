import {
  businessDate,
  ORDER_CHANNELS,
  type OrderChannel,
  PAYMENT_METHODS,
  type PaymentMethod,
  type PrinterStatus,
  totalPaisaOrNull,
} from "@restos/domain";
import {
  classifyTransmit,
  type DaySummaryData,
  DOCUMENT_SPECS,
  type KotData,
  MAX_TRANSMIT_ATTEMPTS,
  type PrinterCapability,
  RETRY_WINDOW_MS,
  type ReceiptData,
  render,
  type ShiftCloseData,
  type Spooler,
  type SpoolerTransport,
} from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { orderChargeSnapshot } from "@restos/sync-client";
import type { Alarm, KitchenState } from "../shared/ipc";
import type { CatalogResolver } from "./gateway";
import { deviceChargeRoundingPaisa, deviceTaxCell } from "./tax-posture";

/**
 * K-7 — the wire between `order.confirmed` and the paper, and `03-F5`'s band on the counter.
 *
 * `packages/escpos` had the whole module and no caller: the encoder, the layout, the pure
 * `render()` and a 244-test durable spooler, none of which any shipped code path reached. That
 * is this wave's named defect (AGENTS.md), and it is why this file's own acceptance suite spends
 * as much of itself on `main/index.ts`'s source as on the logic below.
 *
 * The FRs this file exists to satisfy, and the shape each one forces:
 *
 *   * `03-F2` — "one `order.confirmed` fans out to N KOTs". So `confirmed()` groups by station
 *     and enqueues one job per group: `KotData.station` is ONE field, and a chit carrying two
 *     stations' lines would have to lie in it.
 *   * `03-F4` — the job is persisted before the first transmit, and `01-F17` makes `enqueue`
 *     synchronous. `confirmed()` therefore returns before any I/O has been attempted.
 *   * `03-F5` — a silent failure is forbidden. When the retry budget exhausts, an S1 naming the
 *     printer and the order is raised HERE, on the host device, and `kot.print_failed` is
 *     appended for doc 05 (`05-F3`).
 *   * `03-F34` — a document that cannot be rendered is REFUSED, loudly. A refusal enqueues
 *     nothing at all and raises the same band; there is no degraded ticket.
 *   * `03-F41` — a stall is not a failure. Nothing here inspects `stalled`, which is how it
 *     stays that way: the printer is holding the bytes, and a band would send a cashier to
 *     reprint a ticket that is about to appear.
 *   * `03-F55` — a line added AFTER the confirm reaches the kitchen on its own chit, and the
 *     lines already on paper are never cooked twice. `confirmed()` sends, per station, exactly
 *     the lines this device has not yet committed to paper for this order; where a station is
 *     owed nothing, NOTHING is created. See `chitPrefix` and `confirmed` below.
 *
 * **NO PRINTER HAS EVER BEEN ATTACHED (K-8).** `unattachedPrinter` below is this device's real
 * transport today and it reports a failed transmit every time, because that is the truth: no
 * USB, Bluetooth or 9100 transport exists (`18 §10`). Nothing in this file is evidence about
 * paper or about a kitchen.
 */

/**
 * `03-F50` — the station that cooks a line, resolved up the `01-F21` chain. A function seam for
 * the same reason `CatalogResolver` and `PriceResolver` are: this file must test without a
 * database, and the resolution itself belongs to `sync-client`'s catalog (`DEFAULT_STATION` is
 * ITS constant, not a second copy here).
 */
export type StationResolver = (item_id: string) => string;

/**
 * `03-F22`/`03-F51` — does this station take paper?
 *
 * A function seam for `StationResolver`'s reason (this file must test without a config source), and
 * a BOOLEAN rather than `FulfilmentRoute` on purpose: the printer's only legitimate question is
 * whether to make a job. A printer that could read `"screen"` is a printer that could grow a second
 * opinion about what a screen-only station means, and `station-routing.ts` would stop being the one
 * place that decides.
 */
export type PaperRouteResolver = (station: string) => boolean;

export type KotPrinterDeps = {
  /** `03-F4`'s durable queue. CONSTRUCTED BY THE HOST, so `main/index.ts` is its caller. */
  spooler: Spooler;
  /** Two fold projections: the confirm anchor (`kitchenQueue`) and the lines (`openOrders`). */
  store: Pick<DeviceStore, "openOrders" | "kitchenQueue">;
  /** `01-F54` — an unknown item degrades to its identifier rather than vanishing off the chit. */
  catalog: CatalogResolver;
  station: StationResolver;
  /**
   * `03-F51` — the per-station fulfilment route, as the one boolean this file may ask.
   *
   * **OPTIONAL, defaulting to `paper` everywhere, and the reason is `24 §3` step 2 rather than
   * design taste.** `__acceptance__/kot-printing.test.ts` and `__acceptance__/print-ack-audit.
   * test.ts` both construct this printer and both predate this dep; they are oracles this session
   * may not edit, so a REQUIRED member would redden two suites for a surface neither exercises.
   * The default is `() => true`, which is the behaviour of every branch before `03-F51` existed —
   * so an omission cannot change what any existing caller does.
   *
   * That makes it exactly the shape AGENTS.md warns about (an optional seam nobody supplies).
   * **`pnpm seams:check` NOW HOLDS IT — since 2026-08-10, and it did not before.** Rule B's loop
   * opened `if (groupOf(mod.file) !== "packages") continue;`, so a factory declared in an APP was
   * never a candidate: both mutants (deleting the supply in `main/index.ts`, and stubbing it
   * `() => true`) left the rail **exit 0 and CLEAN**, reporting the same `5 optional seams` either
   * way. Rule B now walks `apps/` and `services/` too, and deleting the supply reddens it by name.
   *
   * Two things that fix does NOT buy, both still load-bearing here:
   *   · The STUB case. `routesToPaper: () => true` is a *supply*, so Rule B is satisfied while the
   *     product has no `03-F51` in it at all. That is the rail's own documented blind spot.
   *   · Therefore `__acceptance__/station-routing-seam.test.ts` §E, which drives the host's real
   *     construction, is still the only guard on the difference between the resolver and a literal.
   */
  routesToPaper?: PaperRouteResolver;
  /**
   * **`03-F59` — TODAY, as `01-F46`'s business day (Asia/Karachi, 05:00 cutover).**
   *
   * The ONE input `restoreBands` needs and the only thing that bounds it. A relaunch re-raises
   * `03-F5`'s band for a chit that is still genuinely unrecovered, and `03-F59` bounds that to the
   * CURRENT business day — because staff who arrive to yesterday's alarms learn to dismiss the band
   * without reading it, which defeats `03-F5` rather than serving it.
   *
   * **The host's own resolution, not a second one.** `main/index.ts` already computes this for
   * `GatewayDeps.businessDay` (`businessDate(wallClock.now() + store.branchTimeStatus().offset_ms)`
   * — branch time per `01-F43`, never the raw device clock, which `01-F45` bans from a timing read)
   * and passes the SAME function here. A second derivation in this file would be `03-F40`'s two
   * sensor bit layouts: one fact, two readings, and the disagreement invisible from both sides.
   *
   * **OPTIONAL, and absent means NO BAND IS RESTORED**, for `24 §3` step 2's reason exactly as
   * `routesToPaper` above: `__acceptance__/kot-printing.test.ts`, `print-ack-audit.test.ts` and
   * `resend-durability.test.ts` all construct this printer and all predate this dep; they are
   * oracles this session may not edit, so a REQUIRED member would redden three suites.
   *
   * **The default is the QUIET one and that is the opposite choice from `routesToPaper`'s** — say
   * so rather than let it read as a copy. There the loud fallback is a chit a branch may not be
   * able to print, which `03-F5` reports in 45 s; here the loud fallback is *"re-raise everything
   * the spool ever failed"*, which is the behaviour a previous fix deliberately removed (see the
   * cash printer's `seen` below) and which `03-F57` (a) names as the way `03-F5`'s loudest signal
   * is taught to be ignored. An omission therefore leaves the pre-`03-F59` product exactly as it
   * was, and `pnpm seams:check` Rule B is what stops the omission being permanent: it walks
   * `apps/` since 2026-08-10, so deleting this argument from `main/index.ts` reddens the rail by
   * name. What no rail can see is a STUB (`() => "1970-01-01"` is a supply) — that is this repo's
   * documented blind spot, and here the manual launch in `03-F59`'s evidence is what covers it.
   */
  businessDay?: () => string;
  /** `03 §7` layer 3. `03-F49`'s column floor is checked against this, inside `render()`. */
  capability: PrinterCapability;
  /**
   * `03-F5`'s ledger consequence and `02-F31`'s precondition. A plain `(type, payload)` rather
   * than the store, because this file must not own envelope stamping — `gateway.append` already
   * does, including `02-F41`'s read-at-append attribution.
   */
  append: (type: string, payload: Record<string, unknown>) => void;
};

export type KotPrinter = {
  /**
   * An `order.confirmed` has landed. Renders, enqueues, and kicks the first attempt.
   *
   * **Synchronous and `void`, and that is `01-F17` at the type level.** A sale is never blocked
   * by a printer; a `Promise` here would invite the append path to await one, and the cashier
   * would be watching a spinner over a socket timeout with a customer in front of her.
   */
  confirmed: (order_id: string) => void;
  /**
   * **`02-F55` — does the kitchen have this order, and does it owe anything?**
   *
   * The projection behind the counter's *Send to kitchen* control, answered from **durable state
   * only**: this device's own converged fold plus `03-F4`'s spool. No process memory, no clock, no
   * peer, no network — so the answer is the same in the next process, which is the whole point.
   * The measured defect it closes is 11 `order.confirmed` rows for 6 orders, because the only
   * guard was one React variable and a relaunch, an order switch or a shift handover each defeated
   * it (`01-F1` keeps every one of those rows for ever).
   *
   * **It is the SAME `owedChits` walk `confirmed()` sends from**, and that identity is the design
   * rather than a convenience: the state must read `owed` exactly when a press would create a job,
   * and two readings of one fact is `03-F40`'s two sensor bit layouts — the corpus's own worked
   * example of a document that looks right in one place and wrong in the other.
   *
   * The three answers, and what decides each:
   *
   *   * **`none`** — no such order, or no confirm anchor yet. The kitchen has never been told, so
   *     the control is live. This is `02-F55`'s state (ii), and its resting state (i) as well;
   *     the surface tells them apart by whether there is a cart at all, not by this field.
   *   * **`owed`** — told once, and at least one station is still owed a chit (`03-F55`'s
   *     addendum, or a chit `03-F34` refused for want of columns — no job was created, so those
   *     lines are still owed and the next press renders them again).
   *   * **`sent`** — told, and no station owes anything. State (iii), the one that did not exist.
   *
   * **The confirm anchor gates "has been told" and decides NOTHING else**, which is not the
   * `confirmed_at` alias `03-F55` warns about: a confirmed order with an owed station reads
   * `owed`, so an implementation keyed on the anchor alone fails. It is read rather than "does a
   * chit exist" so that `03-F51`'s screen-only branch works — a station routed to a screen creates
   * no paper ever, and keying on paper would leave such an order pressable for ever, which is the
   * duplicate-confirm defect surviving in exactly the configuration `03-F22` ships for.
   */
  kitchenFor: (order_id: string) => KitchenState;
  /** Advance every live job by at most one transport interaction. Never rejects. */
  pump: () => Promise<void>;
  /** `03-F5`'s unacknowledged S1s, oldest first (`27-F11d` renders the head plus a count). */
  alarms: () => readonly Alarm[];
  acknowledge: (alarm_id: string) => void;
  /**
   * **`03-F6`/`03-F48`/`03-F57` — send a failed kitchen ticket again.**
   *
   * **⚠ THE HANDLE IS THE DURABLE JOB ID AND THE ELIGIBILITY TEST IS THE DURABLE ROW.** It used to
   * be *"a band this process is holding"*, which is `03-F57`'s measured defect: `raised` is a
   * process-lifetime `Map`, so a relaunch left a `failed` chit on `03-F4`'s spool — bytes,
   * coverage and all — with nothing able to reach it, and a power cut therefore stranded a billed
   * order the kitchen had never heard about, permanently. `alarm_id` IS the job id, which is why
   * the parameter did not have to change: the band carried the spool's own key throughout.
   *
   * Until August 2026 this did not exist and the consequence was measured on a running till, not
   * predicted: once a chit exhausted `03-F4`'s three attempts the spooler's job was TERMINAL
   * (`isTerminal` — `pump()` never touches it again) and `confirmed()` skips every line a prior
   * chit already covers (`03-F55`), so pressing *Send to kitchen* again appended a second
   * `order.confirmed` and enqueued **nothing**. The food was billed, the customer waited, the
   * kitchen was never told, and the only control on the band was `I SAW THIS`.
   *
   * ── The three properties it has to have, and where each comes from ───────────────────────────
   *
   *   * **No second `order.confirmed`.** This is not a confirm path at all: it re-renders the
   *     chit that already exists and re-enqueues it under its OWN job id, so no ledger event of
   *     any kind is appended by the act itself (see the gap named below).
   *   * **On the alert.** `03-F6` puts the resend *"from the failure alert"*, which `03-F5` puts
   *     on the host device — the counter. `03-F48` agrees for a printer-only kitchen (*"the
   *     counter is the only path"*) and asks for it on the counter's ORDER LIST as well; that
   *     half is NOT built here and the reason is a test rather than a judgement — see below.
   *   * **It cannot double-print a chit that printed.** Only a `failed` job is resent. `printed`
   *     is refused, and so is `stalled`, which is `03-F41` in terms: the printer TOOK those bytes
   *     and is holding them for a roll, and re-transmitting *"double-prints the instant the roll
   *     is loaded"*. A band raised by `03-F34`'s refusal has no job at all and is refused too —
   *     nothing was committed, so those lines are still owed to the kitchen and the NEXT press of
   *     *Send to kitchen* renders them again (`03-F55`).
   *
   * **A refusal is not silent and is not a code**: the band stays up, its subject is rewritten in
   * this process with the reason, and it loses its resend control so the operator is not invited
   * to press a button that has already said no (`27-F5`, `00 §5.7`).
   *
   * **⚠ THE REACH HALF IS NOW CLOSED FOR TODAY'S TICKETS AND OPEN FOR EVERY OLDER ONE — `03-F59`
   * (August 2026). This paragraph said the reach half was NOT closed, and it was true until
   * `restoreBands` landed.** `refuseResend` rewrites a band and a fresh process held none, so a
   * resend after a relaunch was unreachable *and* its refusal was silent — one missing surface
   * hiding both halves. `restoreBands` below re-raises `03-F5`'s band at launch for a chit that is
   * still genuinely unrecovered **on the current business day**, so the control and its refusal
   * wording are both back on the one surface `03-F6` puts them on. What is still OWED, and it is
   * `03-F57` (c) unchanged: a chit that failed on an EARLIER business day is eligible with no
   * button, because `03-F59` deliberately declines to shout about yesterday — `03-F48`'s one-tap
   * reprint on the counter's order list is the corpus's answer for it and does not exist. The same
   * gap covers a band the operator dismissed and then relaunched past on a later day.
   *
   * **The chit is re-rendered with `reprint: true` (`03-F3`/`03-F37`), so the paper says REPRINT.**
   * A resent chit is one the kitchen may or may not already hold: three transmits reported no
   * answer, and *no answer* is not *no paper*. `03-F41` spends a paragraph on the cook who bins
   * one of two identical chits being the failure this system exists to prevent, and the band is
   * what lets him tell them apart. It is also the only honest reading of `03-F37` — *"reprints are
   * a named fraud vector — the paper must say so"* — for a document a human asked for twice.
   *
   * **⚠ THE ACT IS NOT LOGGED, AND THAT IS A KERNEL GAP RATHER THAN AN OMISSION.** `03-F7` requires
   * *"reprint … always logged with actor + reason (`kot.reprint_requested`)"*. The type IS in the
   * `01 §4` catalog and `packages/domain/src/registry.ts` carries **no payload schema for it**, so
   * `01-F4` makes emitting it a runtime error — the identical shape `03-F53` records for
   * `printer.status_changed` and `02-F16` for `receipt.printed`. Commandment 2 forbids inventing
   * the payload here, and `packages/domain` is a protected path (commandment 10). What IS recorded
   * is the outcome: a resend that fails again appends its own `kot.print_failed` through
   * `reconcile`, so the ledger still carries every failure — only the human's act is missing.
   */
  resend: (alarm_id: string) => void;
};

/**
 * How often the host must pump for `03-F4`'s budget to be spent over `03-F4`'s window.
 *
 * `03-F4` says "3 attempts over 30 s" and `03-F5` says the alert shows "within 45 s of confirm".
 * The spooler advances a job by at most one attempt per `pump()` and deliberately owns no clock
 * (`RETRY_WINDOW_MS`'s own comment: "the BUDGET is enforced here; the SPACING is not"), so the
 * spacing is exactly this constant. Derived rather than typed as `10_000` so that changing
 * either FR constant cannot silently leave the schedule describing the old one.
 */
export const PUMP_INTERVAL_MS = RETRY_WINDOW_MS / MAX_TRANSMIT_ATTEMPTS;

/** One cell of the order projection's `json_lines`, as `gateway.ts` reads it too. */
type LineCell = {
  item_id: string;
  qty: number;
  /** `02-F6`'s notes as the merge fold projects them; absent on a line with none (`26 §7` M2). */
  notes?: string[];
};

/**
 * `03-F56` — `02-F6`'s notes as the ONE row `KotLine.note` is.
 *
 * The same join and the same separator as `gateway.ts`'s `noteFrom`, and it is deliberately not
 * shared with it: that one crosses the IPC seam to a screen, this one goes to paper, and `03-F32`
 * makes the chit's data contract a DIFFERENT contract from the order projection's on purpose. What
 * must not diverge is the reading order and the ink, and `03-F55` puts both in `document.ts` where
 * a single renderer owns them. Reported rather than abstracted: `24 §3b` forbids the drive-by, and
 * the day a note needs different handling on paper this is the line that moves.
 */
const kotNoteOf = (notes: readonly string[] | undefined): string | undefined =>
  notes === undefined || notes.length === 0 ? undefined : notes.join(" / ");

/**
 * The same cell with `01-F53`'s captured price, which the KOT deliberately never reads (`03-F32`:
 * "prices are simply not in the chit data model") and the receipt must.
 */
type BilledCell = LineCell & { unit_price_paisa: number };

/** `03-F3`: "order number + table/channel in large type" — ONE field, filled in that order. */
const tableOf = (table_ids_json: string, channel: string): string => {
  const ids = JSON.parse(table_ids_json) as string[];
  return ids[0] ?? channel;
};

/**
 * S-7 — the namespace that tells a CASH job, and now a RECEIPT job, from a KOT job. It is
 * load-bearing rather than tidy.
 *
 * All four document types share this device's ONE spooler (`03-F42` makes a document the unit, not
 * the queue), so `reconcile` sees every state — and `01 §4` has **no emittable print event for any
 * of them but the KOT**. There is no `slip.printed`; `receipt.printed` is in the catalog but
 * carries no payload schema in `packages/domain`, so `01-F4` makes emitting it a runtime error.
 * Emitting `kot.printed` for one of them would write a KOT fact about an id that is a shift id, a
 * day id or a settled order's receipt, permanently, into a ledger `01-F1` forbids correcting in
 * place. Commandment 2 forbids inventing the event, so those jobs' outcomes reach the COUNTER
 * (`03-F5`'s band) and nothing else — an owed gap, named here rather than papered over.
 *
 * **The pair below is a DENY-LIST and every new document type must extend it.** A KOT job id is
 * `<order_id>::<station>` and carries no marker of its own, so "is this a KOT" can only be asked
 * as "is it none of the others" — which means a namespaced document added without touching the
 * KOT's `reconcile` is misread as a KOT and appends `kot.printed` about a document that is not
 * one. `C16` is the first time that trap was live: with only `isCashJob` in place, every printed
 * receipt would have written a `kot.printed` for its order.
 *
 * A PREFIX rather than an in-memory set, because the spool is durable (`03-F4`): a relaunch
 * re-reads jobs it did not enqueue, and a set built at construction would classify every surviving
 * job as a KOT.
 */
const CASH_JOB_PREFIX = "cash::";
const RECEIPT_JOB_PREFIX = "receipt::";
const isCashJob = (job_id: string): boolean => job_id.startsWith(CASH_JOB_PREFIX);
const isReceiptJob = (job_id: string): boolean => job_id.startsWith(RECEIPT_JOB_PREFIX);

/**
 * `03-F55` — every chit this device has made for one order at one station.
 *
 * **The OPENING chit's id is unchanged, `<order_id>::<station>`, and that is the FR's own clause**:
 * "a spool written before this FR is honoured rather than reprinted on the upgrade". An addendum
 * appends its ordinal, so the ids at one station read `…::GRILL`, `…::GRILL::1`, `…::GRILL::2`.
 *
 * The ordinal suffix is matched as DIGITS rather than by splitting on `::`, so a station whose name
 * contains the separator cannot be read as another station's addendum. (A station name is `03-F50`'s
 * catalog value and doc 14's editor for it does not exist yet; this costs a regex and removes the
 * question.)
 */
const chitPrefix = (order_id: string, station: string): string => `${order_id}::${station}`;
const CHIT_ORDINAL = /^\d+$/;
const isChitOf = (job_id: string, prefix: string): boolean =>
  job_id === prefix ||
  (job_id.startsWith(`${prefix}::`) && CHIT_ORDINAL.test(job_id.slice(prefix.length + 2)));

/**
 * The inverse of `chitPrefix` + the ordinal — which station a spooled chit was for, and which
 * addendum it is (`03-F55`). `null` when the id is not a chit of this order at all.
 *
 * It is READ BACK rather than remembered, because `03-F6`'s resend has to work after the relaunch
 * that `03-F4` is written about: the durable row is all that survives, and a station kept only in
 * this process is exactly the record a power cut takes. The ordinal is matched with `isChitOf`'s
 * own digit rule so a station name containing `::` cannot be read as another station's addendum.
 */
const chitOf = (job_id: string, order_id: string): { station: string; addendum: number } | null => {
  const head = `${order_id}::`;
  if (!job_id.startsWith(head)) return null;
  const rest = job_id.slice(head.length);
  const cut = rest.lastIndexOf("::");
  if (cut === -1) return rest.length === 0 ? null : { station: rest, addendum: 0 };
  const tail = rest.slice(cut + 2);
  if (!CHIT_ORDINAL.test(tail)) return { station: rest, addendum: 0 };
  const station = rest.slice(0, cut);
  return station.length === 0 ? null : { station, addendum: Number(tail) };
};

/**
 * **`03-F5`'s third consequence, and until August 2026 it was the one nothing produced.**
 *
 * The FR's own words: *"acknowledgment is logged (`audit.*`)"*. `01-F5` gained the subtype for it
 * — `audit.print_acknowledged`, its sixth — and `packages/domain` carries the schema, and NOTHING
 * EMITTED IT: the ack was a `raised.delete(id)` and a comment saying so. Dismissing the band left
 * no record anywhere, which is the wave's named defect (a correct subsystem with no seam) sitting
 * on top of the exact harm `01-F5` puts this event in the hash-chained family for — *"silently
 * dismissing the band loses a kitchen ticket with nobody accountable, and the hash chain is what
 * makes a quiet dismissal detectable"*.
 *
 * ── The payload, and what of it the FR actually requires ────────────────────────────────────
 *
 * **`03-F5` NAMES NO FIELDS.** `01-F5`'s v1 payload contract for the whole `audit.*` family is
 * `prev_audit_hash` alone, the schema is a `looseObject` so additive extras are legal, and WHO
 * comes from the envelope's `actor_user_id` (`02-F41`, stamped at append). So as specified, this
 * event records *that* a band was dismissed and *by whom*, and is **not linkable to the failed
 * job at all**.
 *
 * The three fields below are therefore an INTERPRETATION and are named as one: making the ack
 * answer "which ticket" is a `03`/`01-F5` amendment, not something this file may decide. They are
 * carried because the spooler already holds both nouns across a restart (`03-F4`), so the choice
 * is between recording them and discarding facts already in hand:
 *
 *   * `alarm_id` — the spooler JOB id, which is the finest handle that exists. `03-F2` fans one
 *     confirm out to N station tickets, so `order_id` alone cannot say which station's chit was
 *     the one nobody cooked.
 *   * `order_id` — `03-F5`'s own subject noun, and only on the KOT path. The cash printer omits
 *     it deliberately: its subject is a shift or a day id, and writing one into a field called
 *     `order_id` is the same permanent lie `CASH_JOB_PREFIX` refuses to tell with `kot.printed`.
 *   * `printer_name` — the same field name `kot.print_failed` already carries, so the ack and the
 *     failure it acknowledges can be joined on it without a second vocabulary.
 *
 * **`prev_audit_hash` is absent on purpose** — `01-F5` makes the chain store-owned and a
 * caller-supplied value a loud refusal with nothing persisted. And nothing here goes near a
 * credential: `01-F1` has no redaction path, so a PIN that reached a payload would be published
 * to every device that syncs and never retractable.
 */
const PRINT_ACK = "audit.print_acknowledged";

/**
 * **`03-F11`/`03-F54` — the printer transition, and until August 2026 nothing produced it.**
 *
 * `03-F11` declared the type in July and `01 §4` absorbed it; no payload schema was ever written,
 * so `01-F4` made emitting it a runtime error and **`05-F3`'s second alarm trigger has never
 * existed**. A symbol-precise `grep -a` across `apps/`, `services/` and `packages/` found the type
 * in comments and specs only. `03-F54` gives it a payload; this constant is its first producer.
 *
 * ── What this device can OBSERVE, which is what decides the design ───────────────────────────
 *
 * A till has no link monitor: the transport is exercised only by jobs. So the evidence of
 * *offline* is a job reaching `03-F4`'s terminal `failed` — the whole retry budget spent — and the
 * evidence of *online* is a job reaching `printed`. **The simpler alternative, emitting per failed
 * transmit ATTEMPT, is refused**: it would append up to three events per job, permanently
 * (`01-F1`), for one printer going down, and `03-F4` spends a budget precisely because a single
 * failed attempt is not yet evidence of anything.
 *
 * `stalled` is DELIBERATELY not a transition (`03-F54`, `03-F41`): the printer ANSWERED the
 * `DLE EOT 4` query, which is how the stall was diagnosed at all — it is reachable, it is holding
 * the bytes, and the remedy is a roll rather than a cable. Emitting `offline` for paper-out would
 * fire on the most ordinary event in a kitchen and send a manager to check the wrong thing. It
 * costs nothing here because this file already inspects only `printed` and `failed`.
 */
const PRINTER_STATUS = "printer.status_changed";

/**
 * `03-F5`'s alert has to name the DOCUMENT as well as the printer and the subject — "KOT #142 did
 * not print" is unactionable if what failed was the shift-close slip a cashier is waiting to sign.
 */
const DOCUMENT_NOUNS = {
  kot: "KOT",
  receipt: "Receipt",
  shift_close_slip: "Shift slip",
  day_summary: "Day summary",
} as const;

/**
 * `01-F46`'s business day, applied to a delivered timestamp.
 *
 * The arithmetic is `domain`'s and is declared once (`18 §2`) — the same helper the `shift_cash`
 * fold uses for `days.business_date`, so a shift and the day it is bucketed into cannot disagree
 * about which night they belong to. It reads a DELIVERED field (`01-F43` stamps branch time at
 * append), never this device's clock, so `03-F30`/`01-F34` are both intact.
 */
const onBusinessDate = (stamp: number, date: string): boolean => businessDate(stamp) === date;

/**
 * A signed integer-paisa total, BigInt-exact (`DEC-MONEY-005`, standing law 3).
 *
 * `totalPaisaOrNull` rather than a running `+`: float `+` is non-associative near 2^53, so a
 * plain accumulator would let row order decide a printed money figure. `null` (inexact) prints
 * zero rather than throwing — `01-F17`'s spirit on the print path, where a shift close must
 * complete whatever the arithmetic says, and the figure it would replace does not exist anyway.
 */
const totalOf = (values: readonly number[]): number => totalPaisaOrNull(values) ?? 0;

export const createKotPrinter = ({
  spooler,
  store,
  catalog,
  station,
  // `03-F51` — see `KotPrinterDeps.routesToPaper`. The default is the pre-`03-F51` product: every
  // station prints. It is `true` and not `false` because the fallback must be the LOUD one — a
  // branch whose configuration never arrived gets paper it may not be able to print, which
  // `03-F5` reports within 45 s, rather than silence nothing can report.
  routesToPaper = () => true,
  // `03-F59` — see `KotPrinterDeps.businessDay`. NO default: absent means no band is restored at
  // launch, which is the pre-`03-F59` product. A default here would be a made-up date.
  businessDay,
  capability,
  append,
}: KotPrinterDeps): KotPrinter => {
  const spec = DOCUMENT_SPECS.kot;
  if (spec === undefined) {
    // At construction, so it surfaces in `main/index.ts`'s startup dialog rather than as a
    // ticket that quietly never prints. `03-F30` ships the specs as code, so this cannot fire.
    throw new Error(
      "@restos/escpos ships no `kot` DocumentSpec (03-F30) — this device cannot print",
    );
  }
  const printer_name = capability.model_id;
  /**
   * Oldest first: `AlarmBand` renders the head and counts the tail (`27-F11d`).
   *
   * The value is the band PLUS the subject it is about, rather than the `Alarm` alone. `Alarm` is
   * the IPC shape and carries `03-F5`'s two nouns inside a SENTENCE ("KOT 5f3a9c21 did not print
   * — TH230"); the ack needs them as data, and re-parsing an operator-facing string to recover
   * them is how a wording change silently empties a ledger field.
   */
  const raised = new Map<string, { alarm: Alarm; order_id: string; printer_name: string }>();
  let pumping = false;
  /**
   * `03-F54`: **the prior state is assumed `online`.** A device that boots with no prior state has
   * two honest options — assume online (a dead printer announces itself on the first attempt; a
   * healthy one stays silent) or treat the first observation as a transition (which appends one
   * `online` per launch, reporting no change to anyone, into a ledger `01-F1` never thins out).
   * The FR takes the first, because the alarm this feeds is about the printer being DOWN.
   *
   * ONE boolean, not a map, because this device has exactly ONE transport: all three printers are
   * constructed with the same `kotCapability()` in `main/index.ts`, and `03-F2`'s per-station
   * routing table is doc-14 work that does not exist. `03-F11`'s *"per registered printer"* is one
   * printer here, and a `Map` keyed by a name that can only take one value would imply otherwise.
   *
   * In MEMORY and not in the spool, deliberately: the state is a claim about the link right now,
   * and a relaunch has observed nothing. `03-F54`'s assumed-online rule is exactly what a fresh
   * process should believe, so persisting this would only let a stale belief suppress the first
   * real report after a restart.
   */
  let printer_online = true;

  /**
   * `01-F17` — a failed ledger write must not cost the band. `03-F5`'s three consequences are
   * independent: the alert is what a human acts on, the event is what doc 05 reads, and losing
   * the second silently is survivable where losing the first is exactly the harm the FR names.
   * The same swallow, and the same reason, as `createPinAuditSink`'s in `main/index.ts`.
   */
  const emit = (type: string, payload: Record<string, unknown>): void => {
    try {
      append(type, payload);
    } catch {
      // No FR names a surface that owns "the ledger record could not be written".
    }
  };

  /**
   * Raise an S1 for a job, and answer whether this call is the one that raised it.
   *
   * The boolean is load-bearing rather than convenience: the refusal path uses it to decide
   * whether to append `kot.print_failed`. Tapping "Send to kitchen" twice appends two
   * `order.confirmed`s (the order stays open until it is settled), and on the refusal path there
   * is no spooler row to de-duplicate against — so without this the ledger collects one
   * `kot.print_failed` per tap, permanently, under `01-F1`. Found by mutation: the guard below
   * survived removal because the `Map` key already de-duplicates the BAND, which is exactly how
   * a dead-looking line hides a live defect one caller over.
   */
  const raise = (
    id: string,
    order_ref: string,
    // **THE PRINTER THE JOB WAS FOR, not this construction's.** The band used to name
    // `capability.model_id` unconditionally, so a chit that exhausted its budget under the
    // printer configured yesterday was reported against whatever `RESTOS_KOT_PRINTER` says
    // today — while `kot.print_failed` beside it correctly carried `job.printer_name`. One
    // device, one act, two names, and `05-F3` raises both onto ONE alarm list, which is the
    // exact "two spellings of one printer" defect `03-F53` refuses to create.
    printer: string,
    why: string,
    // `03-F6`'s recovery, offered only where it can actually do something — see `resend`.
    action?: { label: string },
  ): boolean => {
    if (raised.has(id)) return false;
    raised.set(id, {
      alarm: {
        // `03-F5`'s own sentence: "KOT #142 did not print — grill printer offline". Both nouns in
        // the line a cashier reads first, because either one alone is unactionable — the order
        // without the printer sends her hunting, the printer without the order does not say which
        // food is not being cooked.
        message: `${DOCUMENT_NOUNS.kot} ${order_ref.slice(0, 8)} did not print — ${printer}`,
        subject: why,
        id,
        ...(action === undefined ? {} : { action }),
      },
      order_id: order_ref,
      printer_name: printer,
    });
    return true;
  };

  /**
   * `03-F6`'s control, as the operator reads it. Written HERE and not in the renderer, for
   * `AlarmSchema`'s stated reason: the band's words are main's, one copy for the device.
   */
  const RESEND_LABEL = "SEND AGAIN";

  /**
   * Rewrite a band in place with the reason its resend was refused, and take the control away.
   *
   * `03-F5`'s band stays UP — the ticket still did not print and nothing about the refusal makes
   * that untrue — so this replaces the subject rather than raising a second band (`27-F11d`: one
   * band, or it has become the screen). Dropping the action is `27-F5` read honestly: a control
   * that has just answered "no, and here is why" is not a control any more.
   */
  const refuseResend = (alarm_id: string, why: string): void => {
    const band = raised.get(alarm_id);
    if (band === undefined) return;
    raised.set(alarm_id, {
      ...band,
      alarm: { id: band.alarm.id, message: band.alarm.message, subject: why },
    });
  };

  /** One projected line cell as `KotData` wants it — shared by the confirm and the resend. */
  const kotLineOf = (cell: LineCell): KotData["lines"][number] => {
    const note = kotNoteOf(cell.notes);
    return {
      quantity: cell.qty,
      // `01-F54` — the identifier is a poor word and a blank line is a dish nobody cooks.
      name: catalog(cell.item_id)?.name ?? cell.item_id,
      // The read models carry no modifier detail yet (`gateway.ts` says the same); empty is
      // honest, and inventing it here would be fold logic outside the engine (`26 §8`).
      modifiers: [],
      // `02-F6`/`03-F56` — the half of `C7` that actually matters: an item note that reaches
      // the cart and not the chit is a note the COOK never gets. Spread conditionally because
      // `KotLine.note` is optional and `03-F56` gives an absent note no row (`00 §5.7`).
      ...(note === undefined ? {} : { note }),
    };
  };

  /**
   * One station's unprinted work: which chit it would be, and the lines it would carry.
   *
   * `addendum` is the ordinal `03-F55` puts on the paper — `0` opens the station, `n ≥ 1` is its
   * nth addition.
   */
  type OwedChit = {
    readonly station: string;
    readonly addendum: number;
    readonly lines: readonly { line_id: string; line: KotData["lines"][number] }[];
  };

  /**
   * **`03-F55` — per station, exactly what this order still owes the paper.** Pure: it reads the
   * fold row and the spool and writes nothing.
   *
   * **Extracted in August 2026 so that `confirmed()` and `02-F55`'s `kitchenFor()` cannot
   * disagree.** The counter's control has to be greyed precisely when a press would enqueue
   * nothing, and the only way to guarantee that is for the two to be one function — a second
   * implementation of "what is owed" would drift the instant either changed, and the drift is
   * invisible from both sides (the glass says sent, the spool says owed, and the dish is lost).
   *
   * `spooler.jobs()` is read ONCE here rather than once per station, which it was until this
   * extraction. That is a behaviour-preserving change and not a shortcut: `confirmed()` enqueues
   * only AFTER this returns, and even interleaved the ids it writes carry this station's prefix,
   * which `isChitOf` excludes from every other station's `prior`. The cost matters because
   * `02-F55` puts this on the renderer's read path — `openOrders()` is re-read on every ledger
   * push and on `03-F25`'s 1 Hz age tick — and `03-F4` has no compaction clause, so `jobs()`
   * grows for the life of the device.
   */
  const owedChits = (order: { order_id: string; json_lines: string }): OwedChit[] => {
    // `03-F2`'s fan-out. `03-F50`: a line whose station resolves nowhere lands on the default
    // station's ticket rather than vanishing — the resolver owns that fallback, not this loop.
    //
    // The LINE ID rides beside the rendered line because `03-F55` decides what to print per line
    // and not per item: "a family that asks for one naan and then, five minutes later, one more
    // naan" is two lines carrying one item, and coverage keyed by item would send the second naan
    // to nobody. It is the projection's own key (`gateway.addLine` writes one cell per line).
    const byStation = new Map<string, { line_id: string; line: KotData["lines"][number] }[]>();
    for (const [line_id, cell] of Object.entries(
      JSON.parse(order.json_lines) as Record<string, LineCell>,
    )) {
      const at = station(cell.item_id);
      const lines = byStation.get(at) ?? [];
      lines.push({ line_id, line: kotLineOf(cell) });
      byStation.set(at, lines);
    }

    const all = spooler.jobs();
    const owed: OwedChit[] = [];
    for (const [at, group] of byStation) {
      // ── `03-F51`'s ROUTING SEAM, and its position in this walk is the whole design ────────────
      //
      // A station configured screen-only makes NO JOB: no bytes, no `spooler.enqueue`, no attempt,
      // no retry budget, no exhaustion, no `03-F5` band, no `kot.print_failed`. There is nothing to
      // suppress, because nothing was created — which is why this is not a weakening of `03-F5`.
      //
      // It sits BEFORE `render()` and before `spooler.job()` deliberately. `03-F51`: absence is
      // decided before a job exists, from configuration; failure is decided after a job exists,
      // from a transport outcome. Move this check any later — into `reconcile`, into the transport,
      // into a band filter — and the two collapse, and the first real printer that dies at 20:40 on
      // a Friday goes silent. `03-F5`'s "silent KOT failure is forbidden" is about a job that
      // FAILED; this is about a job nobody asked for.
      //
      // `03-F34`'s refusal is likewise unreachable here and that is correct: a document that was
      // never rendered cannot be refused for want of columns, and a 58 mm printer at a screen-only
      // station is not a fact about anything (`03-F49`).
      //
      // It also decides `02-F55`'s glass, now that this walk feeds it: a screen-only station is
      // owed nothing BY THE PAPER, so a fully screen-routed order reads `sent` and its control is
      // greyed. That is the honest answer — `03-F51` routes those lines to the branch queue
      // projection instead, so the kitchen HAS been told; the press would enqueue nothing.
      if (!routesToPaper(at)) continue;

      // ── `03-F55` — WHAT THIS STATION IS STILL OWED ────────────────────────────────────────────
      //
      // A duplicate KOT means the dish is cooked twice, and `03-F7`/`03-F37` make a reprint a
      // deliberate, logged, REPRINT-banded act — which a second `order.confirmed` for the same
      // order is not. The guard that fact buys is NOT deleted here; what changes is that it can now
      // tell "same order, same lines, second press" (silent) from "same order, NEW lines" (must
      // reach the kitchen). Before `03-F55` it could not, and a naan rung onto a confirmed order
      // was billed and never cooked, with no ticket, no band and no event.
      //
      // "Committed to paper" is A JOB EXISTS, not that the job PRINTED (`03-F55`): a chit whose
      // retry budget exhausted (`03-F5`) belongs to `03-F6`'s reroute and `03-F48`'s reprint, and
      // repeating its lines on the next addendum would put one dish on two chits in a kitchen that
      // has been told to expect exactly one. A document `03-F34` REFUSED is the opposite — no job
      // was created, so nothing was committed and the next press renders those lines again.
      const prefix = chitPrefix(order.order_id, at);
      // A FILTER over every job and not an ordinal probe (`spooler.job(`${prefix}::1`)`, `::2`, …
      // until one is missing), which would be O(1) per chit instead of O(all jobs on this device).
      // The probe is refused because it rests on the ordinals being CONTIGUOUS, and a single gap
      // would make it re-issue an id `enqueue` then overwrites — losing a chit's coverage row and
      // its bytes. **The cost is named rather than hidden: `03-F4` has no compaction clause and
      // this store has no `DELETE`, so `jobs()` grows for the life of the device**, and this walk
      // runs once per station per press on `01-F17`'s synchronous path. It is the same order as
      // what already ships — `reconcile` here and in both cash/receipt printers each walk `jobs()`
      // on every pump — so the thing that would actually need fixing is the unbounded spool
      // (`22`/`25`'s retention question), not this filter.
      const prior = all.filter((job) => isChitOf(job.job_id, prefix));
      // A row written before `03-F55` kept no coverage and there is nothing to reconstruct it
      // from. DECLARED INTERPRETATION (`24 §3b`): unknown coverage HONOURS THE PAPER — this
      // station behaves exactly as it did before this FR, which is `03-F55`'s own phrase for the
      // upgrade ("honoured rather than reprinted on the upgrade"). The named alternative, reading
      // absent as "covered nothing", re-sends the whole order onto an addendum and cooks it twice
      // — `03-F41` calls that a real kitchen error, and it would fire on every open order the
      // moment a till updates. The residual harm is stated rather than hidden: for orders that
      // were already confirmed when this version was installed, an addition still does not print.
      // Since August 2026 the glass agrees with that silence instead of inviting a press against
      // it — such a station is owed nothing here, so the order reads `sent` (`02-F55`).
      if (prior.some((job) => job.covers === undefined)) continue;
      const committed = new Set(prior.flatMap((job) => job.covers ?? []));
      const stillOwed = group.filter((entry) => !committed.has(entry.line_id));
      // `03-F55`: "where a station has nothing uncommitted, NOTHING is created — no bytes, no
      // spooled job, no attempt, no retry budget, no band, no `kot.print_failed`". That silence is
      // the correct answer and not a degraded one, and it is decided HERE — before a job exists,
      // from what the paper already carries — for `03-F51`'s reason one door along: absence is
      // decided before a job exists, failure after one does. Neither may turn a transport outcome
      // into silence (`03-F5`).
      if (stillOwed.length === 0) continue;
      // The nth chit at this station carries ordinal n: `0` opened it, `n ≥ 1` is the nth addition
      // (`03-F55`). It counts CHITS AT A STATION and not additions to an order — "a tandoor that
      // has never seen this ticket is not being handed an addition to anything", so a station
      // reached for the first time by an addition gets an ordinary KOT.
      owed.push({ station: at, addendum: prior.length, lines: stillOwed });
    }
    return owed;
  };

  /**
   * `02-F55`'s projection. See `KotPrinter.kitchenFor` for what each answer means and why the
   * confirm anchor gates "has been told" without deciding anything else.
   */
  const kitchenFor = (order_id: string): KitchenState => {
    const order = store.openOrders().find((row) => row.order_id === order_id);
    if (order === undefined) return "none";
    // `typeof … === "number"` and not a truthiness test, matching `gateway.ts`'s aging block one
    // projection over: an order with no confirm anchor has never been handed to the kitchen, and
    // a row from a fold predating the column carries the key as absent rather than null
    // (`01-F54` — degrade, never drop). Either way the control stays live, which is the direction
    // `02-F55` fixes: a duplicate row is a smaller harm than a naan nobody cooks.
    if (typeof order.confirmed_at !== "number") return "none";
    return owedChits(order).length === 0 ? "sent" : "owed";
  };

  const confirmed = (order_id: string): void => {
    // The queue projection's own rule is "row exists iff confirmed", and its `age_basis` IS the
    // confirm anchor — which is what `27-F62` wants stamped on the chit ("print what was true at
    // APPEND time, stamped with `branch_created_at`"). Reading branch time here instead would
    // stamp the moment the printer got round to it.
    const queued = store.kitchenQueue().find((row) => row.order_id === order_id);
    if (queued === undefined) return;
    const order = store.openOrders().find((row) => row.order_id === order_id);
    if (order === undefined) return;

    const table = tableOf(order.table_ids_json, order.channel);

    // `03-F2`'s fan-out and `03-F55`'s coverage, computed by the SAME walk `02-F55`'s `kitchenFor`
    // answers from — see `owedChits` above for why that identity is the design and not a tidy-up.
    // A station owed nothing yields no entry here at all, which is `03-F55`'s "where a station has
    // nothing uncommitted, NOTHING is created".
    for (const { station: at, addendum, lines: owed } of owedChits(order)) {
      const prefix = chitPrefix(order_id, at);
      const job_id = addendum === 0 ? prefix : `${prefix}::${addendum}`;
      const lines = owed.map((entry) => entry.line);

      const result = render(
        spec,
        // No owner profile: `03-F30`'s customisation surface is doc 14's and does not exist yet,
        // so every declared slot takes its shipped default (an empty note).
        {},
        {
          ticket_no: order_id.slice(0, 8),
          table,
          station: at,
          // `03-F55`: the stamp is the order's CONFIRM ANCHOR, unchanged. `03-F14` makes the timer
          // basis `order.confirmed` and the fold takes the EARLIEST confirm, so every chit of one
          // ticket carries one time and `03-F13`'s aging is not forked by a late addition. The
          // named alternative — stamping the addition's own append — is refused because the read
          // path carries no per-line stamp, so the only value available here is this device's
          // clock, which `27-F62` and `01-F34` both forbid.
          branch_created_at: queued.age_basis,
          reprint: false,
          addendum,
          lines,
        } satisfies KotData,
        capability,
      );
      if (!result.ok) {
        // `03-F34`: "a hard refusal to print plus an S1 band, never a silent degradation". So
        // NOTHING is enqueued — there are no bytes a caller could print anyway — and the band
        // carries the cause, because `render()` distinguishes its refusals precisely so it can.
        const measured =
          result.required_columns === undefined || result.available_columns === undefined
            ? ""
            : ` — needs ${result.required_columns} columns, this printer has ${result.available_columns}`;
        // The band FIRST, and the ledger record only if the band is new: `raise` is what makes a
        // repeated confirm idempotent here, the way `spooler.job(job_id)` does on the path below.
        //
        // NO resend control (`03-F6`): a refusal created no job, so there is nothing to send —
        // and re-rendering the same lines against the same capability would be refused again for
        // the same reason. Those lines are still OWED to the kitchen (`03-F55`), so the recovery
        // is the next press of *Send to kitchen* on a printer that can print them, not this.
        if (raise(job_id, order_id, printer_name, `refused: ${result.reason}${measured}`)) {
          emit("kot.print_failed", { order_id, printer_name });
        }
        continue;
      }
      spooler.enqueue({
        job_id,
        document: result.bytes,
        printer_name,
        // The FULL id, not the eight-character handle: K-6 carries this through a restart and a
        // truncated reference cannot key `kot.print_failed`'s `order_id`. The band shortens it.
        order_ref: order_id,
        // `03-F55` — what this chit committed, written down on `03-F4`'s durable row in the same
        // synchronous call that persists the bytes. Held in memory instead it is defeated by the
        // relaunch, and the relaunch is precisely when both failures appear.
        covers: owed.map((entry) => entry.line_id),
      });
    }

    // The first attempt immediately — `03-F5`'s 45 s bound is measured from the confirm, and a
    // job that waited for the next 10 s tick would spend a third of the budget doing nothing.
    //
    // `queueMicrotask`, not a bare `void pump()`, and the difference is `01-F17` rather than
    // style: `await transport.send(...)` INVOKES `send` synchronously before it suspends, so a
    // direct call would reach the socket inside this function — on the stack of the IPC handler
    // that has not yet answered the cashier's confirm. Deferring by one microtask means the
    // append is acknowledged first and the printer is never on the sale's critical path.
    queueMicrotask(() => void pump());
  };

  /**
   * `03-F11`'s transition, decided from the only two job outcomes this device can observe.
   *
   * The guards are what make it a TRANSITION rather than a report: a second dead job on an
   * already-offline printer says nothing new, and `05-F4`'s siren wall has a ledger form — an
   * unbounded permanent event stream under `01-F1`. `stalled` never reaches here.
   */
  const observePrinter = (state: string): void => {
    const status: PrinterStatus | null =
      state === "printed" && !printer_online
        ? "online"
        : state === "failed" && printer_online
          ? "offline"
          : null;
    if (status === null) return;
    printer_online = status === "online";
    emit(PRINTER_STATUS, { printer_name, status });
  };

  const reconcile = (before: ReadonlyMap<string, string>): void => {
    for (const job of spooler.jobs()) {
      if (before.get(job.job_id) === job.state) continue;
      // `03-F11`'s printer fact comes FIRST and is deliberately ABOVE the deny-list below.
      //
      // The deny-list exists because `kot.printed` / `kot.print_failed` are facts about a KOT, and
      // writing one about a shift slip's id would be a permanent lie. `printer.status_changed`
      // names NO document and NO order — its whole payload is the printer and its status — so that
      // reason does not reach it, while the fact it reports does: the transport is shared by all
      // four document types (`03-F42` makes a document the unit, not the queue), so a cash slip
      // that exhausts its retry budget is the same evidence about the same cable as a KOT that
      // does. Filtering it to KOTs would make whether the manager hears about a dead printer
      // depend on which document happened to be printing when it died.
      //
      // ⚠ **THIS PLACEMENT IS A REAL BEHAVIOURAL CHOICE AND NOTHING ASSERTS IT — measured
      // 2026-08-13 (adversarial mutation), with the discriminating case run rather than argued.**
      // Moving this one line below the two `continue`s passes **all 866 tests** in this package,
      // because `printer-status-producer.test.ts`'s rig enqueues KOTs only. Driven directly at the
      // shared spooler with a `cash::`-prefixed job on a dead link (`03-F42`: one queue, four
      // document types), the two arrangements differ completely: **as shipped, one
      // `printer.status_changed(offline)`; one line lower, ZERO events and no band** — a till whose
      // printer died while a shift-close slip was in flight never tells the manager, which is the
      // outcome the paragraph above rejects in terms. The missing fixture is a rig that enqueues
      // `cash::…` on the shared spooler, exhausts `MAX_TRANSMIT_ATTEMPTS`, and expects exactly one
      // status event: it fits in ~20 lines and needs no cash printer.
      observePrinter(job.state);
      // S-7 — THE ONE LINE THAT KEEPS THIS FILE'S PRINTERS APART, and it is not tidiness.
      //
      // `03-F42` makes a DOCUMENT the unit, not the queue, so all four types share this device's
      // one durable spooler and this loop sees all four. But `01 §4` has **no emittable print
      // event for any of them but the KOT**, and emitting `kot.printed` here would append a KOT
      // fact whose `order_id` is a shift id or a receipt's, permanently, into a ledger `01-F1`
      // forbids correcting in place. Commandment 2 forbids inventing the event. So the cash and
      // receipt printers below own their own reconciliation and their own band; this one owns the
      // KOT's. See `CASH_JOB_PREFIX` for why these two lines are a DENY-LIST that every new
      // document type must extend — `C16` is the first time that trap was live.
      if (isCashJob(job.job_id)) continue;
      if (isReceiptJob(job.job_id)) continue;
      if (job.state === "printed") {
        // `02-F31`'s precondition — T1 advances lines to `in_prep` off this event. The advance
        // itself needs a branch device registry that does not exist; this is the fact it needs.
        emit("kot.printed", { order_id: job.order_ref });
        continue;
      }
      if (job.state === "failed") {
        emit("kot.print_failed", { order_id: job.order_ref, printer_name: job.printer_name });
        // `03-F6` — the band carries the RECOVERY, because this is the one case where there is
        // something to recover: a job exists, it is terminal, and it never reached paper.
        raise(
          job.job_id,
          job.order_ref,
          job.printer_name,
          `printing failed after ${job.attempts} attempts`,
          { label: RESEND_LABEL },
        );
      }
      // `stalled` is deliberately absent (`03-F41`): the printer TOOK the bytes and is holding
      // them until the roll is replaced. A band here is the duplicate KOT arriving by a human.
      //
      // ⚠ **THAT IS RIGHT ABOUT THE BAND AND IT IS NOT THE WHOLE ANSWER — `03-F58` (August 2026).**
      // A stall reaching here raises nothing, appends nothing and shows nothing, so the ticket is
      // held and **no human is asked to replace the roll**. Measured on a real till against a
      // listener answering `03-F40`'s paper-out bits: job `stalled`, `attempts: 0`, `alarms()` `[]`
      // throughout, five ledger rows and none about the printer — while the counter's `02-F55`
      // control read *the kitchen has this order*, which is false; the PRINTER has it.
      // `03-F58` decides where it is said and it is deliberately **not here**: it belongs on the
      // honesty strip beside `CatalogHealth` (amber, no control, silent when healthy), because a
      // stall is a STATE and an attributed acknowledgement would take a live condition off the
      // screen (`00 §5.7`). It appends nothing for the reason `03-F54` gives one door over.
      // **Owed, and the FR names the five files.** `kot-printing.test.ts`'s *"a stalled printer
      // raises NO band, emits NOTHING"* stays correct and must stay green — reaching the glass
      // through `alarms()` is the cheap version `03-F58` forbids by name.
    }
  };

  const pump = async (): Promise<void> => {
    // One pump at a time. The interval and `confirmed()`'s immediate kick can overlap on a slow
    // link, and two concurrent passes would hand one job's document to the transport twice.
    if (pumping) return;
    pumping = true;
    const before = new Map(spooler.jobs().map((job) => [job.job_id, job.state] as const));
    try {
      await spooler.pump();
    } catch {
      // `01-F17`: a transport that throws instead of answering (a non-conforming one — `18 §10`
      // says `send` REPORTS its outcome) must not poison the interval, which is the only thing
      // driving these retries toward `03-F5`'s band.
    } finally {
      pumping = false;
    }
    reconcile(before);
  };

  /** `03-F6`/`03-F48`/`03-F57` — see `KotPrinter.resend` for the whole argument. */
  const resend = (alarm_id: string): void => {
    // ── `03-F57` — ELIGIBILITY IS THE DURABLE JOB, NEVER THIS PROCESS'S BAND MAP ────────────────
    //
    // This opened `if (!raised.has(alarm_id)) return;` until August 2026, and `raised` is a
    // process-lifetime `Map`. So after a relaunch the durable spool still held the `failed` chit,
    // its bytes and its `03-F55` coverage, and the only control that could reach them had
    // evaporated — a power cut PERMANENTLY stranded a billed order the kitchen was never told
    // about. `03-F4` persists the job "before the first transmit attempt" and never drops it, so
    // everything the resend needs is on the disk; the band was the one thing that was not.
    //
    // What replaces it is the SAME question asked of the durable row: is this one of MY jobs, and
    // is it in a state that may be sent again. The state ladder below is unchanged and is what
    // keeps `03-F41` intact across a restart exactly as it was inside one — `printed` refused,
    // `stalled` refused, an unfinished budget refused.
    //
    // The deny-list is `reconcile`'s, for `CASH_JOB_PREFIX`'s stated reason: all four document
    // types share this device's ONE spooler (`03-F42`), the IPC handler calls every printer for
    // one tap, and `raised.has` used to be what kept this printer's hands off a cash slip's band.
    // A KOT job id carries no marker of its own, so "is this mine" can only be asked as "is it
    // none of the others" — and every new namespaced document type must extend it.
    if (isCashJob(alarm_id) || isReceiptJob(alarm_id)) return;

    const job = spooler.job(alarm_id);
    if (job === undefined) {
      // `03-F34` refused this document before a job existed (`03-F55`: "no job was created,
      // nothing was committed, its lines are still owed to the kitchen").
      refuseResend(
        alarm_id,
        "nothing to send — this ticket was refused before it was made; it needs a printer that can print it",
      );
      return;
    }
    if (job.state === "printed") {
      // (c). `03-F41`: "a duplicate KOT is a real kitchen error, not a cosmetic one."
      refuseResend(alarm_id, "already printed — sending it again would cook this food twice");
      return;
    }
    if (job.state === "stalled") {
      // `03-F41` in terms: the printer TOOK the bytes and is holding them until the roll is
      // replaced, and re-transmitting "double-prints the instant the roll is loaded".
      refuseResend(
        alarm_id,
        "the printer is holding this ticket for a new roll — it prints when the paper is replaced",
      );
      return;
    }
    if (job.state !== "failed") {
      refuseResend(alarm_id, "still trying — this ticket has not used up its attempts yet");
      return;
    }
    if (job.covers === undefined) {
      // A row written before `03-F55` kept no coverage, so this process cannot know which lines
      // that chit carried, and re-rendering the station's whole line set would cook the rest of
      // the order twice. Same DECLARED interpretation as `confirmed()`: unknown coverage honours
      // the paper. `03-F48`'s reprint is "the last CHIT, not the whole order" (`03-F55`, owed 2).
      refuseResend(
        alarm_id,
        "this ticket kept no record of which lines it carried — nothing was sent",
      );
      return;
    }

    const chit = chitOf(alarm_id, job.order_ref);
    if (chit === null) {
      refuseResend(alarm_id, "this ticket's station cannot be read back — nothing was sent");
      return;
    }
    // The confirm ANCHOR and the lines, re-read from the fold — `27-F62`, print what was true at
    // APPEND time. `openOrders`/`kitchenQueue` are the same two projections `confirmed()` used and
    // neither drops a row on settlement, so a chit that failed on an order the cashier has since
    // taken money for is still resendable — which is the ordinary case, not the exotic one.
    const queued = store.kitchenQueue().find((row) => row.order_id === job.order_ref);
    const order = store.openOrders().find((row) => row.order_id === job.order_ref);
    if (queued === undefined || order === undefined) {
      refuseResend(alarm_id, "this till no longer holds that order — nothing was sent");
      return;
    }
    const cells = JSON.parse(order.json_lines) as Record<string, LineCell>;
    const lines = job.covers.flatMap((line_id) => {
      const cell = cells[line_id];
      return cell === undefined ? [] : [kotLineOf(cell)];
    });
    if (lines.length === 0) {
      refuseResend(
        alarm_id,
        "the lines on this ticket are no longer on the order — nothing was sent",
      );
      return;
    }

    const result = render(
      spec,
      {},
      {
        ticket_no: job.order_ref.slice(0, 8),
        table: tableOf(order.table_ids_json, order.channel),
        station: chit.station,
        branch_created_at: queued.age_basis,
        // `03-F3`/`03-F37` — the paper says REPRINT. Three transmits reported no answer, and no
        // answer is not no paper: if the kitchen does hold the first copy, this band is what lets
        // a cook tell the two apart instead of binning one (`03-F41`).
        reprint: true,
        // `03-F55`'s ordinal, unchanged — this is the SAME chit, not a new addendum.
        addendum: chit.addendum,
        lines,
      } satisfies KotData,
      capability,
    );
    if (!result.ok) {
      const measured =
        result.required_columns === undefined || result.available_columns === undefined
          ? ""
          : ` — needs ${result.required_columns} columns, this printer has ${result.available_columns}`;
      // `03-F34` again, on the resend path: nothing is enqueued, and the band says why.
      refuseResend(alarm_id, `refused: ${result.reason}${measured}`);
      return;
    }

    // **THE SAME `job_id`, and that is the whole of why this cannot corrupt `03-F55`.** A new id
    // would add a row to `spooler.jobs()`, which is what `confirmed()` counts to get the next
    // addendum ordinal — so a resend would silently renumber the station's next addition. Re-using
    // the id overwrites the terminal row in place: one chit, one coverage record, a fresh
    // `03-F4` budget, and `pump()` picks it up because it is no longer terminal.
    spooler.enqueue({
      job_id: alarm_id,
      document: result.bytes,
      // The printer this document was just rendered AGAINST, which is the one that will be
      // transmitted to. `capability` may have moved since the failed attempt.
      printer_name,
      order_ref: job.order_ref,
      covers: job.covers,
    });
    // The band goes: the condition it reported is over — this ticket is queued again, not failed.
    // If it fails again, `reconcile` raises a fresh band AND appends a fresh `kot.print_failed`,
    // so nothing about the second failure is silent (`03-F5`). What is NOT recorded is the human's
    // act — `03-F7`'s `kot.reprint_requested` has no payload schema (see `KotPrinter.resend`).
    raised.delete(alarm_id);
    // `01-F17`, exactly as `confirmed()`: the socket is never on the stack of the IPC handler
    // that has not yet answered the operator.
    queueMicrotask(() => void pump());
  };

  /**
   * **`03-F59` — the band a relaunch owes the counter, and NOTHING else.**
   *
   * `03-F57` closed the ELIGIBILITY half: `resend` asks `03-F4`'s durable spool instead of this
   * process's band map, so a chit that failed before a power cut is still sendable in the next
   * process. Its own clause (c) records what that leaves: **a resend that is eligible with no
   * button leaves the ticket just as stranded.** `03-F6` puts the recovery *"from the failure
   * alert"* and `03-F5` puts that alert on the counter, so the resend control has exactly one home
   * in this product — and `pump()`'s `reconcile(before)` takes its baseline from `spooler.jobs()`,
   * which means a restored `failed` row differs from nothing, transitions nowhere, and raises
   * nothing. Measured on the running till: the spool held the chit, its bytes and its `03-F55`
   * coverage, `resend(job_id)` would have sent it, and no surface on the glass could call it.
   *
   * ── THE FOUR NARROWINGS, and each one is why this is not the fix that was already removed ────
   *
   * A previous fix stopped historic failed jobs re-raising at launch on purpose (the cash
   * printer's `seen` below is that fix), because a band staff arrive to every morning is how
   * `03-F5`'s loudest signal is taught to be dismissed unread. `03-F59` re-raises a strictly
   * smaller set:
   *
   *   1. **`failed` only.** `printed`, `stalled` and a job still inside `03-F4`'s budget are all
   *      untouched — the same three refusals `resend` makes, so a band is raised only where the
   *      control behind it can act (`27-F5`: a control that cannot act is not a control).
   *   2. **The lines are still not on paper at that station.** *Unrecovered* is a claim about
   *      LINES, not about a row's state: this job's `03-F55` coverage minus everything a `printed`
   *      chit at the same station has since carried. **Measured, and stated because a guard whose
   *      dangerous case cannot arise is worth naming rather than hiding:** under `03-F55`'s own
   *      rule a later chit never re-covers a committed line, so today the only chit that can carry
   *      these lines is this row — and it is `failed`. It is written as the property anyway,
   *      because `03-F6`'s reroute to a second printer and `03-F48`'s owed per-chit reprint are
   *      both chits the corpus already names that WOULD carry them, and the sentence `03-F59`
   *      makes is about paper rather than about a state machine.
   *   3. **A row with no `covers` is skipped.** `resend` refuses it by name (*"kept no record of
   *      which lines it carried"*), so its band would be a `SEND AGAIN` that has already said no.
   *   4. **The CURRENT business day only** (`01-F46`, Asia/Karachi, 05:00). The date is the
   *      ORDER's confirm anchor — `03-F14`'s timer basis, branch time stamped at APPEND
   *      (`01-F43`) — read through `domain`'s own `businessDate` via `onBusinessDate`, the same
   *      helper `dayClosed` below uses. Never the spool row (`JobRecord` carries no time at all)
   *      and never this device's clock (`01-F45`). **This does not give a spooled job a lifetime**
   *      — `03-F57` (b) leaves that open and this FR does not close it. Friday's chit is still
   *      *eligible* on Monday; it just does not shout.
   *
   * The deny-list is `reconcile`'s and `resend`'s, for `CASH_JOB_PREFIX`'s stated reason: all four
   * document types share this device's ONE spooler (`03-F42`), a KOT job id carries no marker of
   * its own, and without it a restored cash slip would come back wearing a KOT band with a resend
   * control `01 §4` has no act for.
   *
   * **IT APPENDS NOTHING** (`03-F57`, `01-F1`, `15-F14`): `raise` is memory-only and no `emit` is
   * reachable from here. A second `kot.print_failed` per launch would forge a rising failure rate
   * out of one dead printer and one `ops/startup/*.bat` `:loop`, permanently.
   *
   * **DECLARED INTERPRETATION (`24 §3b`), and it is the one thing here the corpus does not
   * resolve: a band the operator ALREADY dismissed comes back.** Acknowledgement is persisted
   * nowhere — `01-F5`'s closed `audit.*` subtypes have no member for it — so no implementation can
   * tell an unacknowledged band from a dismissed one across a relaunch. Narrowing 4 is what bounds
   * the cost to one business day. Persisting the acknowledgement is the correct closure and is
   * OWED, exactly as the cash printer's `seen` note already records for the same missing fact.
   */
  const restoreBands = (): void => {
    // No day, no restore. See `KotPrinterDeps.businessDay` for why this is the quiet default.
    if (businessDay === undefined) return;
    const today = businessDay();
    const jobs = spooler.jobs();
    const orders = store.openOrders();
    for (const job of jobs) {
      // The deny-list FIRST, as `resend` opens with it: every new namespaced document type must
      // extend both, or a restored slip is misread as a KOT.
      if (isCashJob(job.job_id)) continue;
      if (isReceiptJob(job.job_id)) continue;
      if (job.state !== "failed") continue;
      // Narrowing 3. A pre-`03-F55` row cannot say which lines it carried, so `resend` refuses it.
      if (job.covers === undefined || job.covers.length === 0) continue;
      // Which station's chit series this row belongs to, read BACK off the durable id — the same
      // `chitOf` the resend uses, because a station kept in this process is what the power cut took.
      const chit = chitOf(job.job_id, job.order_ref);
      if (chit === null) continue;
      // Narrowing 4. The order is also what `resend` needs (it re-renders from the fold), so an
      // order this till no longer holds has no sendable chit either — no band for it.
      const order = orders.find((row) => row.order_id === job.order_ref);
      if (order === undefined) continue;
      // `typeof … === "number"` and not truthiness, matching `kitchenFor` above: a row from a fold
      // predating the column carries the key as absent rather than null (`01-F54`).
      if (typeof order.confirmed_at !== "number") continue;
      if (!onBusinessDate(order.confirmed_at, today)) continue;
      // Narrowing 2. `printed` siblings at this station, and what they put on paper.
      const prefix = chitPrefix(job.order_ref, chit.station);
      const onPaper = new Set(
        jobs
          .filter((other) => other.state === "printed" && isChitOf(other.job_id, prefix))
          .flatMap((other) => other.covers ?? []),
      );
      if (job.covers.every((line_id) => onPaper.has(line_id))) continue;
      // The SAME sentence `reconcile` raises, deliberately: this is the same band about the same
      // failure, restored — not a second, differently-worded notice about a restart. `attempts` is
      // on the durable row, so the number a cashier reads is the one the failure actually spent.
      raise(
        job.job_id,
        job.order_ref,
        job.printer_name,
        `printing failed after ${job.attempts} attempts`,
        { label: RESEND_LABEL },
      );
    }
  };

  // **THE SEAM, and it is inside the factory on purpose.** A `restore()` method the host had to
  // remember to call is the wave's named defect waiting to happen — a correct subsystem the
  // product forgets to reach — and no suite in this package can import `main/index.ts` to check
  // that it did. Here the only thing a host can omit is `businessDay`, which `seams:check` Rule B
  // reports by name (measured: deleting that argument from `main/index.ts` is exit 1, *"1 optional
  // seam NEVER SUPPLIED"*, naming `createKotPrinter({ businessDay })`).
  //
  // ⚠ **THIS LINE ITSELF IS GUARDED BY NOTHING, AND THE NUMBER IS MEASURED RATHER THAN FEARED
  // (2026-08-15).** Replacing this call with `void restoreBands;` leaves **all 1188 tests in this
  // package green and `pnpm seams:check` exit 0 and CLEAN** — the whole of `03-F59` dead, every
  // rail quiet. The only instrument that separates the two is a launch, or a harness that
  // constructs this printer over a durable spool and reads `alarms()` at construction; the
  // acceptance suite for `03-F57` deliberately asserts nothing about the band in either direction
  // (its own pin 2), so it cannot see this and is not at fault. **A `03-F59` rung is OWED to a
  // test session** — `alarms()` after a second construction over one spool directory, with the
  // printed job and the out-of-day job as the two controls. It is three assertions and the
  // existing `bench()` fixture already builds the state.
  restoreBands();

  return {
    confirmed,
    kitchenFor,
    pump,
    resend,
    alarms: () => [...raised.values()].map((band) => band.alarm),
    acknowledge: (alarm_id) => {
      const band = raised.get(alarm_id);
      // Acknowledging a band this device does not hold records nothing. The IPC handler calls
      // BOTH printers' `acknowledge` for one tap (the ids are namespaced, so exactly one owns
      // any given band), and without this every dismissal would write two acks — one of them
      // about a band that never existed, permanently (`01-F1`).
      if (band === undefined) return;
      // The band goes FIRST and unconditionally. `03-F5`'s alert "repeats until acknowledged",
      // and `01-F17`'s rule is that a ledger write may not cost the operator the act: an ack that
      // only cleared the screen if its append succeeded would leave a full-screen repeating
      // banner on the counter because the ledger was busy. `emit` swallows for the same reason.
      raised.delete(alarm_id);
      // The BAND's printer, not this construction's — it is the field `kot.print_failed` carries
      // for the same job, and the ack exists to be joined to that failure on it.
      emit(PRINT_ACK, { alarm_id, order_id: band.order_id, printer_name: band.printer_name });
    },
  };
};

// ── S-7 — 02-F23's shift-close slip and 02-F24's day summary ────────────────────────────────────

export type CashPrinterDeps = {
  /** The SAME durable spooler the KOT uses — `03-F42` makes a document the unit, not the queue. */
  spooler: Spooler;
  /**
   * The `shift_cash` fold's rows, plus `openOrders` for `02-F24`'s sales by channel.
   *
   * `authorizeReads`' scoped `cashState()` is deliberately NOT the source, even though it carries
   * the same rows. That read is narrowed to `reportScope`'s Appendix A reach so a cashier cannot
   * read a colleague's drawer off her own till (`02-F23`). A PRINTER is not a subject: the paper
   * is the shift's own slip and the manager's own day summary, and routing it through a
   * session-scoped read would make what prints depend on who was signed in when the close landed.
   */
  store: Pick<DeviceStore, "openOrders" | "shifts" | "days" | "unboundDrawer">;
  /** `03 §7` layer 3 — `03-F49`'s per-type floor is checked against this, inside `render()`. */
  capability: PrinterCapability;
  /**
   * The KOT printer's `pump`, injected rather than re-implemented.
   *
   * `03-F4`'s budget is "3 attempts over 30 s" and the spooler owns no clock, so the SPACING is
   * the host's `PUMP_INTERVAL_MS` interval. A second pump loop over the same spooler would spend
   * that budget twice as fast and turn `03-F5`'s 45 s bound into ~20 s — so there is exactly one
   * driver on this device and this is how a queued slip reaches it immediately.
   */
  pump: () => Promise<void>;
  /**
   * `03-F5`'s acknowledgement, for the bands THIS printer raises. Same signature as the KOT
   * printer's `append`, and the same reason: envelope stamping belongs to `gateway.append`.
   *
   * **It appends the ack and nothing else** — no `slip.printed`, no `slip.print_failed`, because
   * `01 §4` carries neither (see `CASH_JOB_PREFIX`). An `audit.*` subtype is a different question
   * from a print event: it records that a HUMAN dismissed a `03-F5` band, and one tap on one IPC
   * channel dismisses either printer's band. Recording only the KOT's would make whether the
   * dismissal is auditable depend on which printer happened to own the alarm — invisible to the
   * operator and to the Auditor both.
   *
   * **OPTIONAL and always supplied**, which is the shape `01-F60` warns about and is taken here
   * for a stated reason: `__acceptance__/cash-slip-printing.test.ts` predates this dep and is an
   * oracle this session may not edit (`24 §3` step 2), so a required member reds a suite for a
   * surface it does not exercise.
   *
   * ⚠ **This comment claimed `pnpm seams:check`'s Rule B kept that omission from becoming
   * permanent, and the claim was FALSE for as long as it stood.** Rule B only examined factories
   * declared under `packages/`; `createCashPrinter` is declared in an app, so this member was
   * never a candidate and deleting the supply left the rail exit 0 and clean. The claim is TRUE as
   * of 2026-08-10, when Rule B was widened to `apps/` and `services/` — kept in this form rather
   * than quietly corrected, because a shipped comment asserting a protection that does not exist
   * is worse than no comment: it retires the hand-written assertion someone would otherwise write.
   * `__acceptance__/print-ack-audit.test.ts` §A asserts on the construction in `main/index.ts`,
   * and that remains the guard against a supplied-but-inert `append` (Rule B checks that a member
   * is supplied, never that what was supplied is real).
   */
  append?: (type: string, payload: Record<string, unknown>) => void;
};

export type CashPrinter = {
  /**
   * `02-F23` — a `shift.closed` has landed, so the paper form of *"I'm clean"* is queued.
   *
   * Synchronous and `void` for `01-F17`'s reason exactly as `confirmed` is: the close is already
   * in the ledger when this runs, and a cashier finishing her shift may not be held at the till
   * by a socket timeout. A device with no printer still closes shifts.
   */
  shiftClosed: (shift_id: string) => void;
  /** `02-F24` — a `day.closed` has landed; the day-summary ticket. Same contract as above. */
  dayClosed: (day_id: string) => void;
  /**
   * Raise `03-F5`'s band for any cash job that has reached `failed` since the last look.
   *
   * Separate from `pump` because this printer must not drive the spooler (see `pump` above): the
   * host calls it after each pump, and it only READS job state.
   */
  reconcile: () => void;
  alarms: () => readonly Alarm[];
  acknowledge: (alarm_id: string) => void;
};

export const createCashPrinter = ({
  spooler,
  store,
  capability,
  pump,
  append,
}: CashPrinterDeps): CashPrinter => {
  const printer_name = capability.model_id;
  const raised = new Map<string, { alarm: Alarm; printer_name: string }>();
  /**
   * **SEEDED FROM THE SPOOL, and that is a behaviour fix rather than an initialisation detail.**
   *
   * `seen` records the state each job was already in the last time this printer looked. Empty, the
   * first `reconcile()` after a launch treats every row the durable store handed back as a fresh
   * transition — so a slip that failed on Friday raised its band again on Saturday morning, on
   * every relaunch, for ever. `03-F5`'s band is the loudest thing on the glass precisely so a
   * cashier acts on it; a band that is up before the first order of the day is how staff learn to
   * dismiss it without reading, which defeats the FR rather than serving it.
   *
   * This makes the cash and receipt printers agree with the KOT printer, which never had the
   * defect: its `reconcile(before)` takes its baseline from `spooler.jobs()` at the top of every
   * `pump()`, so a restored terminal row differs from nothing and raises nothing. One file, two
   * behaviours, and one of them had to be wrong.
   *
   * **⚠ THAT LAST SENTENCE IS NO LONGER THE WHOLE TRUTH AND IS KEPT RATHER THAN QUIETLY EDITED,
   * because the reasoning above is exactly why the KOT's exception had to be argued.** `03-F59`
   * (August 2026) makes the KOT printer re-raise at launch after all — but for a strictly smaller
   * set than the state this note replaced: `failed`, with `03-F55` coverage no later chit has put
   * on paper, on the CURRENT business day only. See `restoreBands` above for the four narrowings
   * and for the acknowledgement gap this note already names, which `03-F59` does not close either.
   *
   * **The cash and receipt printers are deliberately NOT given the same treatment** (`03-F59`, and
   * `24 §3b` forbids the drive-by regardless). Neither band carries a control: `01 §4` has no
   * reprint act for a slip or a receipt, `02-F16` makes a second receipt a named fraud vector, and
   * a cash slip's reprint is owed with the surface that offers it. A restored band there would be
   * a full-width red interrupt whose only control is `I SAW THIS`, with nothing to recover —
   * `27-F5`'s failure mode, bought at the cost this whole note exists to avoid.
   *
   * **DECLARED INTERPRETATION (`24 §3b`).** `03-F5` says the alert repeats "until acknowledged"
   * and acknowledgement is not persisted anywhere, so a band the operator never dismissed is lost
   * at a relaunch either way. The named alternative — persist the acknowledgement and re-raise
   * only the unacknowledged ones — is the correct one, needs a durable ack store the device does
   * not have, and is OWED. What is not defensible is the state this replaces, where a band the
   * operator HAD dismissed came back too.
   */
  const seen = new Map<string, string>(
    spooler.jobs().map((job) => [job.job_id, job.state] as const),
  );

  /** `01-F17`, exactly as the KOT printer's: a failed ledger write must not cost the act. */
  const emit = (type: string, payload: Record<string, unknown>): void => {
    try {
      append?.(type, payload);
    } catch {
      // No FR names a surface that owns "the ledger record could not be written".
    }
  };

  /**
   * Render, enqueue and kick — the same three steps `confirmed()` takes, and the same refusal
   * path. Shared between the two cash types so `03-F34`'s "hard refusal to print plus an S1 band,
   * never a silent degradation" cannot hold for one and quietly not hold for the other.
   */
  const queue = (
    kind: "shift_close_slip" | "day_summary",
    ref: string,
    data: ShiftCloseData | DaySummaryData,
  ): void => {
    const spec = DOCUMENT_SPECS[kind];
    // `03-F30` ships the specs as code, so this cannot fire. Unlike the KOT's construction-time
    // throw it is a quiet return: a missing cash spec must not stop the app from starting, and a
    // shift still closes in the ledger with or without paper (`01-F17`).
    if (spec === undefined) return;
    // A shift closes ONCE (`shift.closed` is monotone in the fold — "nothing un-closes"), but the
    // renderer can re-invoke the handler and the spool is DURABLE across a relaunch. A
    // deterministic id is what makes a second copy impossible without `03-F7`'s deliberate,
    // REPRINT-banded reprint act — a duplicate cash slip is a second signature surface.
    const job_id = `${CASH_JOB_PREFIX}${kind}::${ref}`;
    if (spooler.job(job_id) !== undefined) return;
    // No owner profile: doc 14's editing surface does not exist, so every declared slot takes its
    // shipped default (an empty note) — exactly as the KOT above.
    const result = render(spec, {}, data, capability);
    if (!result.ok) {
      const measured =
        result.required_columns === undefined || result.available_columns === undefined
          ? ""
          : ` — needs ${result.required_columns} columns, this printer has ${result.available_columns}`;
      // `03-F34`: NOTHING is enqueued. No ledger record either — see `CASH_JOB_PREFIX`.
      raise(
        job_id,
        DOCUMENT_NOUNS[kind],
        ref,
        printer_name,
        `refused: ${result.reason}${measured}`,
      );
      return;
    }
    spooler.enqueue({ job_id, document: result.bytes, printer_name, order_ref: ref });
    // `queueMicrotask` for `01-F17`'s reason, not style: `await transport.send(...)` invokes
    // `send` synchronously before it suspends, so a direct call would reach the socket on the
    // stack of the IPC handler that has not yet answered the cashier.
    queueMicrotask(() => void pump());
  };

  const raise = (
    id: string,
    noun: string,
    ref: string,
    // The printer THIS JOB was for — see the KOT printer's `raise` for why naming the
    // construction's was wrong. The spool is durable, so a job outlives a configuration change.
    printer: string,
    why: string,
  ): void => {
    if (raised.has(id)) return;
    raised.set(id, {
      alarm: {
        // `03-F5` requires the alert to name the printer and the subject — and the DOCUMENT,
        // because "KOT 5f3a9c21 did not print" sends a cashier to the kitchen printer for a slip
        // that is not a KOT and does not tell her the reconciliation she is waiting to sign never
        // appeared.
        message: `${noun} ${ref.slice(0, 8)} did not print — ${printer}`,
        subject: why,
        id,
      },
      printer_name: printer,
    });
    // No `03-F6` resend control on this band: `01 §4` carries no reprint act for a cash slip and a
    // second signature surface is `02-F16`'s fraud shape one document over. Named, not forgotten.
  };

  /**
   * `02-F23` — the slip, assembled from the `shift_cash` fold.
   *
   * **Every money figure here is CARRIED (`26 §7`) and nothing is recomputed.** `variance_paisa`
   * is the fold's snapshot off `shift.closed` and `expected_at_close_json` is the expectation the
   * cashier signed against, not the live one — a late payment must not move a number on a slip
   * that has already been printed, which is what `01-F1` forbids and what a read-time recompute
   * performs in effect.
   *
   * An UNCLOSED shift prints nothing: the three carried facts are null until the close lands, and
   * a slip with an empty variance says nothing about the drawer.
   */
  const shiftClosed = (shift_id: string): void => {
    const shift = store.shifts().find((row) => row.shift_id === shift_id);
    if (shift === undefined) return;
    if (
      shift.expected_at_close_json === null ||
      shift.counted_cash_paisa === null ||
      shift.variance_paisa === null
    ) {
      return;
    }
    const carried = JSON.parse(shift.expected_at_close_json) as Partial<
      Record<PaymentMethod, number>
    >;
    // `01-F32`'s closed tender set, EXHAUSTIVE. `domain`'s `expectedPaisaByMethod` is a strict
    // object over all five, so a missing key cannot come off a conforming `shift.closed` — the
    // `?? 0` is the honest render if a non-conforming writer ever produced one, never a bucket
    // this device decided to drop (`02-F43`'s silent path).
    const expected_by_method = Object.fromEntries(
      PAYMENT_METHODS.map((method) => [method, carried[method] ?? 0]),
    ) as ShiftCloseData["expected_by_method"];
    // `02-F43` — the branch's unbound drawer activity, COUNTED onto the slip. Dropping it would
    // satisfy `02-F21`'s word "logged" while defeating the theft detection the FR exists for.
    const unbound = store.unboundDrawer();
    queue("shift_close_slip", shift_id, {
      // The eight-character handle, as `03-F5`'s band and the KOT's ticket number use: a UUID is
      // 36 columns and `03-F49`'s floor for this document is 35.
      shift_id: shift_id.slice(0, 8),
      cashier: shift.cashier,
      expected_by_method,
      counted_cash_paisa: shift.counted_cash_paisa,
      variance_paisa: shift.variance_paisa,
      paid_out_paisa: shift.paid_out_paisa,
      no_sale_count: shift.no_sale_count,
      unbound_no_sale_count: unbound.no_sale_count,
      unbound_paid_out_paisa: unbound.paid_out_paisa,
      // `03-F7`/`03-F37`: a reprint is a deliberate, logged act, and the close that triggers this
      // is not one. The reprint path is owed with the surface that offers it.
      reprint: false,
    });
  };

  /**
   * `02-F24` — "a day-summary ticket (sales by channel, voids/comps/discounts, over/short)".
   *
   * Two of the three groups are assembled below and the third does not exist: `01 §4` has no
   * void/comp/discount event (`26 §7` states it outright), so the document names the gap instead
   * of printing a zero. See `DaySummaryData`.
   *
   * **The day's over/short is a SUM of CARRIED shift variances, never a day-level recompute.**
   * `day.closed` carries a count and no expectation, so "expected minus counted" for a whole day
   * is not a carried fact at all — deriving one here is the exact defect `26 §7` removes, and the
   * sum of the figures the cashiers already signed is what is actually true.
   */
  const dayClosed = (day_id: string): void => {
    const day = store.days().find((row) => row.day_id === day_id);
    if (day === undefined || day.counted_cash_paisa === null) return;
    // `01-F46` binds a shift and an order to a business day through the SAME `domain` helper the
    // fold used for `days.business_date`, off a delivered branch-time stamp (`01-F43`). There is
    // no `day_id` on a shift row or an order row to join by, and `26 §7` is explicit that this
    // class of question "needs a TIME SOURCE" — not an ordering one, and not this device's clock.
    const shifts = store.shifts().filter((row) => onBusinessDate(row.open_at, day.business_date));
    const sales = new Map<OrderChannel, number[]>();
    for (const channel of ORDER_CHANNELS) sales.set(channel, []);
    for (const order of store.openOrders()) {
      if (order.confirmed_at === null) continue;
      if (!onBusinessDate(order.confirmed_at, day.business_date)) continue;
      // `02-F42` closed the channel set. A row outside it cannot be bucketed and is NOT folded
      // into another channel: a mis-bucketed sale is worse than a missing one on a document a
      // manager reconciles against a deposit.
      const bucket = sales.get(order.channel as OrderChannel);
      if (bucket === undefined) continue;
      bucket.push(order.pay_total);
    }
    queue("day_summary", day_id, {
      business_date: day.business_date,
      sales_by_channel: Object.fromEntries(
        ORDER_CHANNELS.map((channel) => [channel, totalOf(sales.get(channel) ?? [])]),
      ) as DaySummaryData["sales_by_channel"],
      opening_float_paisa: day.opening_float_paisa,
      deposit_paisa: day.deposit_paisa,
      counted_cash_paisa: day.counted_cash_paisa,
      over_short_paisa: totalOf(
        shifts
          .filter((row) => row.variance_paisa !== null)
          .map((row) => row.variance_paisa as number),
      ),
      shifts_closed: shifts.filter((row) => row.closed === 1).length,
      shifts_open: shifts.filter((row) => row.closed === 0).length,
      reprint: false,
    });
  };

  return {
    shiftClosed,
    dayClosed,
    reconcile: () => {
      for (const job of spooler.jobs()) {
        if (!isCashJob(job.job_id)) continue;
        if (seen.get(job.job_id) === job.state) continue;
        seen.set(job.job_id, job.state);
        // `03-F41`: `stalled` is deliberately absent. The printer TOOK the bytes and is holding
        // them until the roll is replaced, and a band here sends someone to reprint a document
        // that is about to appear — on a cash slip, a duplicate signature surface.
        if (job.state !== "failed") continue;
        const kind = job.job_id.startsWith(`${CASH_JOB_PREFIX}day_summary::`)
          ? DOCUMENT_NOUNS.day_summary
          : DOCUMENT_NOUNS.shift_close_slip;
        raise(
          job.job_id,
          kind,
          job.order_ref,
          job.printer_name,
          `printing failed after ${job.attempts} attempts`,
        );
      }
    },
    alarms: () => [...raised.values()].map((band) => band.alarm),
    acknowledge: (alarm_id) => {
      // Only for a band this printer actually holds — the handler calls both, and an ack for a
      // KOT band written twice would be two permanent records of one tap (`01-F1`).
      const band = raised.get(alarm_id);
      if (band === undefined) return;
      raised.delete(alarm_id);
      // NO `order_id`. This band's subject is a shift id or a day id (`CASH_JOB_PREFIX`), and
      // putting one in a field called `order_id` writes a permanent lie into a ledger that has no
      // edit path. `alarm_id` IS the spool job id, so which document was dismissed is still said.
      // The printer is the BAND's, so the ack names the printer the document actually failed on.
      emit(PRINT_ACK, { alarm_id, printer_name: band.printer_name });
    },
  };
};

// ── C16 — 02-F15's receipt, printed when the settlement completes ───────────────────────────────

export type ReceiptPrinterDeps = {
  /** The SAME durable spooler — `03-F42` makes a document the unit, not the queue. */
  spooler: Spooler;
  /** `01-F30`'s billed lines and `01-F31`'s keyed tender sums, both off the order projection. */
  store: Pick<DeviceStore, "openOrders">;
  /** `01-F54` — an unknown item degrades to its identifier rather than vanishing off the bill. */
  catalog: CatalogResolver;
  /** `03 §7` layer 3. `03-F49`'s floor for `receipt` is 32 and is checked inside `render()`. */
  capability: PrinterCapability;
  /** The KOT printer's `pump`, injected for `CashPrinterDeps.pump`'s reason: ONE driver, one budget. */
  pump: () => Promise<void>;
  /**
   * `02-F15`'s "cashier", as a display name.
   *
   * A FUNCTION and not a value, because `01-F26`'s session moves: a till hands over mid-shift and
   * a name captured at construction would attribute every receipt for the rest of the day to
   * whoever unlocked it first. `02-F41` rules that attribution is whoever's PIN is in, and the
   * settle this fires on is the act that read it.
   *
   * **DECLARED INTERPRETATION (`24 §3b`).** The named alternative is the envelope's
   * `actor_user_id` on the `payment.recorded` that triggered the print, which is the ledger's own
   * answer and is strictly better. It is not taken because the order projection carries no
   * attribution — `OpenOrderRow` has fifteen keys and none of them is an actor — so reading it
   * would need a fold change in a protected package. The two answers coincide for every print this
   * seam can make: the session that authorised the append is the session this reads, one
   * synchronous call later.
   */
  cashier: () => string | null;
};

export type ReceiptPrinter = {
  /**
   * A `payment.recorded` has landed. If the order is now settled, the customer's copy is queued.
   *
   * Synchronous and `void` for `01-F17`'s reason, exactly as `confirmed` and `shiftClosed` are:
   * the settlement is already in the ledger when this runs, and a customer may not be held at the
   * counter by a socket timeout. A device with no printer still takes money.
   */
  settled: (order_id: string) => void;
  /** Raise `03-F5`'s band for any receipt job that has reached `failed` since the last look. */
  reconcile: () => void;
  alarms: () => readonly Alarm[];
  acknowledge: (alarm_id: string) => void;
};

/** One tender member as the fold renders it into `pay_attempts_json` (payload minus its key). */
type PayMember = { amount_paisa: number; method: string; purpose: string };

/**
 * `C16` — "**Print the receipt** · Settlement completes · **0 taps — automatic on settle**"
 * (`plans/wave-1/role-task-inventories.md`), which is why this file gains a printer and the
 * counter gains no control. `27-F4` makes the chrome immutable and a receipt nobody has to ask for
 * is the only design that costs a cashier nothing at the moment she is handing over change.
 *
 * **What "settlement completes" MEANS here, stated because `01-F33` does not settle it for us.**
 * `order.settlement_closed` is the cashier-emitted closing act, and when this was written **nothing
 * in this product emitted it** — the type had a schema in `packages/domain`, a fold arm in
 * `merge.ts` and zero production emitters, so `OpenOrderRow.settled` was `0` for every order any
 * device had ever held and waiting for it would have meant no receipt ever printed. So the trigger
 * is the observable fact `02-F15` describes: the order has been TENDERED FOR IN FULL —
 * `pay_total >= billed_effective`, both off the fold's own keyed sums, with at least one agreed
 * tender.
 *
 * ⚠ **THE ACT NOW HAS AN EMITTER AND THIS DID NOT MOVE TO IT** (`01-F63`, August 2026 —
 * `main/settlement-closer.ts`, driven from the third arm of this same call site in `index.ts`).
 * The sentence above ended *"when `01-F33`'s act gains an emitter this should move to it"*, and
 * that is now the wrong instruction rather than an owed one: `01-F63` emits the act **from this
 * very reading**, so a receipt gated on `settled` would be gated on a consequence of the fact it
 * already has, and it would make one order-of-execution detail inside one IPC handler decide
 * whether a customer gets paper. Corrected in place rather than deleted, because the reader who
 * finds `settled` populated is exactly the reader who would otherwise make that change.
 */
export const createReceiptPrinter = ({
  spooler,
  store,
  catalog,
  capability,
  pump,
  cashier,
}: ReceiptPrinterDeps): ReceiptPrinter => {
  const printer_name = capability.model_id;
  const raised = new Map<string, Alarm>();
  /** Seeded from the spool for the reason `createCashPrinter`'s own `seen` records at length. */
  const seen = new Map<string, string>(
    spooler.jobs().map((job) => [job.job_id, job.state] as const),
  );

  const raise = (id: string, ref: string, printer: string, why: string): void => {
    if (raised.has(id)) return;
    raised.set(id, {
      // `03-F5`'s sentence shape, with the DOCUMENT named: "Receipt 5f3a9c21 did not print — TH230"
      // sends a cashier to the right piece of paper, where "KOT … did not print" would send her to
      // the kitchen for a document the kitchen never sees. The printer is the JOB's — see the KOT
      // printer's `raise` for why naming this construction's was wrong.
      message: `${DOCUMENT_NOUNS.receipt} ${ref.slice(0, 8)} did not print — ${printer}`,
      subject: why,
      id,
    });
    // No `03-F6` resend control: `02-F16` makes a second copy a named fraud vector and `C17`'s
    // deliberate, banded reprint act is the path the corpus gives it. Named, not forgotten.
  };

  const settled = (order_id: string): void => {
    const spec = DOCUMENT_SPECS.receipt;
    // `03-F30` ships the specs as code, so this cannot fire. A quiet return rather than the KOT's
    // construction-time throw, for `createCashPrinter`'s reason: a missing document spec must not
    // stop the app from starting, and a sale completes in the ledger with or without paper.
    if (spec === undefined) return;
    const order = store.openOrders().find((row) => row.order_id === order_id);
    if (order === undefined) return;

    // `01-F82`/`16-F31` (R54) — **the receipt's *Total* row IS `billed_total`, tax included.**
    // `16-F5`'s snapshot is computed ONCE here and every figure the document prints comes out of
    // it, so *Subtotal*, *Tax* and *Total* cannot disagree; `packages/escpos` already rendered the
    // three rows and pinned `subtotal + tax = total`, and this producer was the mismatch.
    //
    // `16-F32` (R58): before the settling act tax is a PREVIEW and carries no snapshot. This runs
    // on the settling act, so what is rendered here is the snapshot — and `01-F18` makes it never
    // re-derived. ⚠ **It is not PERSISTED anywhere**: no payload field on any `01 §4` type carries
    // a tax snapshot, `01-F82`'s own note says none lands before `billed_total`'s definition moved
    // (it now has), and adding one is a protected-path spec act this change does not take. So the
    // document is reproducible from the order and the cell, and a later rate edit would reprint a
    // different receipt — which is exactly what `16-F29`'s effective-dating exists to stop and
    // exactly what the v0 seed cannot express (`tax-posture.ts`).
    //
    // `02-F63` (R70): the amount TAKEN is that snapshot total ROUNDED to the org's charge
    // granularity, and the receipt's *Total* row is the rounded number. The adjustment travels as
    // its own field so the document can print a row that closes; it is DERIVED here — one call,
    // one place — and never re-derived on the paper, which would be money arithmetic in a renderer.
    const tax_cell = deviceTaxCell();
    const charge = orderChargeSnapshot(order.json_lines, tax_cell, deviceChargeRoundingPaisa());
    const tax = charge.tax;
    const total_paisa = charge.charge_total_paisa;
    // `01-F31`'s keyed sum, computed by the fold: a disputed attempt contributes ZERO to it and is
    // rendered, never picked. The receipt must agree with that or it would claim money the ledger
    // does not count. `pay_total` also excludes `repays_receivable` (`DEC-MONEY-007`), so a khata
    // tab repaid later can never read as settling the original order twice.
    if (order.pay_total < total_paisa) return;

    // `02-F15`'s "payment method(s)", aggregated over `PAYMENT_METHODS`' DECLARED order (`27-F4`).
    // Never over the attempt-id key order: `pay_attempts_json` is keyed by `settlement_attempt_id`
    // and iterating it would let an id sort decide what a customer reads, which is the shape of
    // the `01-F34` break law 1 exists to prevent even where the values themselves are unchanged.
    const byMethod = new Map<PaymentMethod, number[]>();
    const attempts = JSON.parse(order.pay_attempts_json) as Record<string, PayMember[]>;
    for (const members of Object.values(attempts)) {
      // A DIVERGENT attempt (two devices, one key, different payloads) is `01-F31`'s contested
      // head: it contributes zero to `pay_total`, so printing one of its members would put a
      // figure on the customer's copy that the order's own total does not contain.
      if (members.length !== 1) continue;
      const member = members[0] as PayMember;
      if (member.purpose !== "settles_order") continue;
      const method = member.method as PaymentMethod;
      if (!PAYMENT_METHODS.includes(method)) continue;
      const amounts = byMethod.get(method) ?? [];
      amounts.push(member.amount_paisa);
      byMethod.set(method, amounts);
    }
    const tenders = PAYMENT_METHODS.filter((method) => byMethod.has(method)).map((method) => ({
      method,
      // BigInt-exact (`DEC-MONEY-005`, standing law 3): a running double `+` is non-associative
      // near 2^53, so a plain accumulator would let delivery order decide a printed money figure.
      amount_paisa: totalOf(byMethod.get(method) ?? []),
    }));
    // A settled order always has one. Guarding rather than asserting keeps `01-F17` intact: a
    // projection this device cannot read must not stop the next sale.
    if (tenders.length === 0) return;

    // ONE receipt per order, for ever — the id is deterministic and the spool is durable
    // (`03-F4`), so a relaunch, a second `payment.recorded` on a split settlement, or a
    // double-tapped TAKE CASH all resolve to the same job. `02-F16` makes a second copy a named
    // fraud vector, which is why the only way to a second one is `03-F37`'s banded reprint act.
    const job_id = `${RECEIPT_JOB_PREFIX}${order_id}`;
    if (spooler.job(job_id) !== undefined) return;

    const lines = Object.values(JSON.parse(order.json_lines) as Record<string, BilledCell>).map(
      (cell) => ({
        quantity: cell.qty,
        // `01-F54` — an unsynced or renamed item degrades to its identifier. The money came from the
        // EVENT (`01-F53`), so a stale catalog costs a word on the paper and never a rupee.
        name: catalog(cell.item_id)?.name ?? cell.item_id,
        unit_price_paisa: cell.unit_price_paisa,
      }),
    );

    const result = render(
      spec,
      // No owner profile: `02-F15`'s configurable header/footer is doc 14's editing surface and
      // does not exist yet, so every declared slot takes its shipped default (an empty note).
      {},
      {
        receipt_no: order_id.slice(0, 8),
        channel: order.channel as ReceiptData["channel"],
        // `27-F62` — the DELIVERED branch stamp (`01-F43`), never this device's clock. The confirm
        // anchor is the only one an order carries here; an order settled without ever being sent
        // to the kitchen has none, and the document says so rather than inventing one.
        branch_created_at: order.confirmed_at,
        cashier: cashier(),
        lines,
        total_paisa,
        // `02-F63` (b) — the derived adjustment, handed over UNCONDITIONALLY like the tax
        // snapshot beside it and for the same reason: `receipt-document.ts` owns the rule that a
        // zero prints nothing, and re-deciding it here would be two declarations of one rule
        // (`16-F33` (a)). Under the seeded default (Rs 1) on whole-rupee, untaxed bills this is
        // always 0 and the document is byte-identical to the one printed before this field
        // existed — which is the property that makes the change checkable.
        rounding_paisa: charge.rounding_paisa,
        tenders,
        // `16-F5`'s snapshot, handed over WHOLE and unconditionally — including under `16-F1`'s
        // `none`, and that is a decision rather than an oversight. `receipt-document.ts` spends a
        // paragraph ruling that *"`none` prints nothing, exactly as an absent snapshot does"*,
        // because a `Tax Rs 0` line is a claim about a tax regime the org is not in. Re-deciding
        // it here would be **two declarations of one rule**, which is the drift `16-F33` (a)
        // refuses by name and which this repo has already paid for once. Measured: a `none` cell
        // renders byte-identically to an absent one. `16-F33` (c): a settled receipt shows exactly
        // ONE total, and `01-F82` makes it `total_paisa` above.
        tax: {
          posture: tax.posture,
          rate_bps: tax.rate_bps,
          subtotal_paisa: tax.subtotal_paisa,
          tax_total_paisa: tax.tax_total_paisa,
        },
        // `03-F7`/`03-F37`: a reprint is a deliberate, logged act and a settlement is not one.
        // `C17` is owed with the surface that offers it.
        reprint: false,
      } satisfies ReceiptData,
      capability,
    );
    if (!result.ok) {
      const measured =
        result.required_columns === undefined || result.available_columns === undefined
          ? ""
          : ` — needs ${result.required_columns} columns, this printer has ${result.available_columns}`;
      // `03-F34`: NOTHING is enqueued, and no ledger record either — `01 §4` carries no
      // `receipt.print_failed` (see `RECEIPT_JOB_PREFIX`).
      raise(job_id, order_id, printer_name, `refused: ${result.reason}${measured}`);
      return;
    }
    spooler.enqueue({ job_id, document: result.bytes, printer_name, order_ref: order_id });
    // `queueMicrotask` for `01-F17`'s reason, not style: `await transport.send(...)` invokes `send`
    // synchronously before it suspends, so a direct call would reach the socket on the stack of the
    // IPC handler that has not yet answered the cashier's settlement.
    queueMicrotask(() => void pump());
  };

  return {
    settled,
    reconcile: () => {
      for (const job of spooler.jobs()) {
        if (!isReceiptJob(job.job_id)) continue;
        if (seen.get(job.job_id) === job.state) continue;
        seen.set(job.job_id, job.state);
        // `03-F41`: `stalled` is deliberately absent. The printer TOOK the bytes and is holding
        // them until the roll is replaced; a band here sends a cashier to reprint a document that
        // is about to appear, and on a receipt that is `02-F16`'s fraud vector by accident.
        if (job.state !== "failed") continue;
        // `03-F12` puts receipts under "the same spooler and durability rules" as the KOT, and
        // `03-F5`'s argument — a silent failure is forbidden — is what the band delivers. Reading
        // `03-F5` as KOT-only would leave a cashier believing a customer has a receipt they do not
        // have, which is the same harm one document over. Same declared reading as S-7's slips.
        raise(
          job.job_id,
          job.order_ref,
          job.printer_name,
          `printing failed after ${job.attempts} attempts`,
        );
      }
    },
    alarms: () => [...raised.values()],
    acknowledge: (alarm_id) => {
      // Only for a band this printer holds — the IPC handler calls every printer's `acknowledge`
      // for one tap, and an ack written twice would be two permanent records of one act (`01-F1`).
      //
      // It appends NOTHING. `audit.print_acknowledged` is the KOT's and the cash printer's because
      // each was handed an `append`; this printer is deliberately handed none, since the only
      // ledger fact it could write about a receipt is `02-F16`'s `receipt.printed` and that has no
      // payload schema. The ack for a receipt band is therefore UNRECORDED — a named gap with the
      // same owner as the event itself, not an omission.
      raised.delete(alarm_id);
    },
  };
};

/**
 * The transport this device actually has: none.
 *
 * `18 §10`'s USB, Bluetooth and TCP-9100 transports are unbuilt and K-8 — the physical pass — is
 * owed in full, so every transmit reports that the printer did not answer. That is not a stub
 * standing in for hardware; it is the honest reading of a device with no printer link (`00 §5.7`
 * — the device reports what it knows), and it routes through `03-F4`'s ordinary retry budget to
 * `03-F5`'s band, which is exactly what the operator should see: nothing is printing, and the
 * counter is told so within 45 s.
 *
 * `classifyTransmit` decides the outcome rather than a literal, so this cannot drift from K-3's
 * classifier. Note which one it produces: **`failed`, never `stalled`.** A stall would make the
 * spooler hold the job forever and never exhaust the budget — a silent KOT failure manufactured
 * by the one seam that stands in for hardware.
 */
export const unattachedPrinter = (capability: PrinterCapability): SpoolerTransport => ({
  send: async () =>
    classifyTransmit({ status: null, timed_out: false, link_error: null }, capability),
  status: async () => ({
    paper_out: false,
    near_end: capability.has_near_end_sensor ? false : "unsupported",
  }),
});
