/**
 * `02-F48` — **A TENDER OF NOTHING IS NOT A SALE, AND DECLINING TO RECORD ONE IS NOT BLOCKING ONE.**
 *
 * ── The defect ────────────────────────────────────────────────────────────────────────────────
 *
 * `TenderPanel` reads its keypad as RUPEES and converts to paisa, so an **empty pad is zero**, and
 * pressing the primary action on an empty pad recorded a permanent `payment.recorded` worth
 * `amount_paisa: 0` against a real bill. `01-F1` forbids removing it, so one accidental tap per
 * shift is one phantom settlement in `02-F23`'s reconciliation and on `02-F15`'s receipt for ever.
 * The arithmetic is unharmed — zero adds nothing to any total — which is precisely why it survived
 * for as long as it did: this is **ledger honesty and cashier trust**, not a money error, and
 * nothing in the system was ever going to flag it.
 *
 * (When the bill is already covered the panel's `coversBill` is `0 >= 0` and it tenders the
 * REMAINDER, which is also `0` — the same permanent row down the opposite arm. Both are refused
 * here, because the rule is about the AMOUNT and not about which branch produced it.)
 *
 * ── Why this is not an `01-F17` break, in the corpus's own words ──────────────────────────────
 *
 * `01-F60`'s unpriced-item clause already reads the FR this way: *"`01-F17` forbids blocking a
 * **sale**, not an item"*. A `payment.recorded` of zero moves no money, discharges no part of the
 * bill, changes no total and leaves the order in exactly the state it was in. There is no sale to
 * block, because nothing was tendered.
 *
 * **It is NOT `02-F13`'s partial tender, and the difference is not a matter of degree.** A partial
 * is a POSITIVE amount that does not cover, recorded as itself with the remainder still owed —
 * that path is untouched and must stay untouched, since a split is what happens whenever the first
 * tender falls short. `__acceptance__/zero-tender.test.ts` §B lands **one paisa** for exactly this
 * reason: a guard reading `amount < 100`, or `!coversBill`, turns the ruling into the `01-F17`
 * break it was written to avoid.
 *
 * ── The shape, and every part of it is load-bearing ───────────────────────────────────────────
 *
 * **REFUSED AT ORIGINATION, never at ingest, and never in the schema.** The decision is made on
 * the **payload alone**, synchronously, consulting no shift, no day, no session scope, no peer, no
 * clock and no network — so it cannot break `00 §5.1` or `01-F17` by construction, and there is
 * nothing about it a WAN outage can change. That narrowness is asserted rather than trusted:
 * `zero-tender.test.ts` §D drives this factory through a dependency Proxy and pins the set of
 * members ever touched to `writes` alone, so a future consult of a store, an uplink or a clock
 * reddens by NAME. It is the one structural difference from `settlement-guard.ts` next door, which
 * legitimately reads the fold — the two guards must not be conflated by a later reader.
 *
 * **`payment.recorded`'s `amount_paisa` is deliberately NOT tightened to `positive()` in
 * `packages/domain`.** That is one character of diff, it would satisfy the refusal, and it is the
 * most tempting wrong fix in this task: `payment.recorded` parses at ingest and on every `01-F6`
 * replay, **this defect has SHIPPED**, and a device whose own ledger already holds a Rs 0 payment
 * must go on reopening its store and merging its peers' history. Tightening a schema on an
 * append-only log is retroactive, and it would quarantine real history (`01-F37` excludes a
 * quarantined event from folds) to prevent a future typo. A rule about what a till may ORIGINATE
 * must not become a rule about what the fleet may MERGE.
 *
 * **`27-F5` is honoured by construction: the control is never disabled, greyed, moved or hidden.**
 * An inert primary control is that FR's own failure mode, and `DEC-MONEY-009` already refused the
 * greyed-button shape on this exact surface in favour of a sentence. `TAKE <METHOD>` stays present,
 * labelled, full-size and pressable in every state; what changes is only that an empty entry
 * produces no event, and the Pay surface says so where the cashier is already looking
 * (`TenderPanel`'s `27-F12` readout — a word and a number, never a modal, `02-F37`).
 *
 * ── What this deliberately does NOT extend to ─────────────────────────────────────────────────
 *
 * `payment.refunded` carries the same non-negative field and the same argument would apply, but
 * refunds are manager-approved (`01-F29`) and have no keypad path in this product, so a rule
 * written for them now would be a rule with no reachable case. And it decides nothing about
 * `01-F30`'s EXCESS tender (`EXCESS_TENDER_IS_EXCEPTION`), which is the opposite sign and open on
 * purpose. Nor about the other zeroes the ledger holds on purpose: `day.opened`'s zero opening
 * float (*an empty drawer is a real, stated fact*) and `order.line_price_overridden`'s zero
 * (*"this costs nothing" distinguished from "somebody forgot"*) both still land — a guard aimed at
 * the NUMBER 0 rather than at a TENDER would take them with it.
 */

import { AppendRequestSchema, type AppendResult } from "../shared/ipc";
import type { RendererWrites } from "./settlement-guard";

/** `01 §4`'s tender. Named once so a typo cannot make this guard refuse nothing. */
const PAYMENT_RECORDED = "payment.recorded";

/**
 * `00 §5.7` — the message names what is true and nothing more, and it names the FR.
 *
 * **It must not read like `DEC-MONEY-009`'s refusal**, which throws on this same channel for a
 * completely different reason. An assertion that something merely threw cannot tell "refused for
 * being nothing" from "refused for being a duplicate" — that is `F60`'s amendment-test defect, and
 * `zero-tender.test.ts` §A pins the distinction from the other side by asserting this message does
 * NOT claim the bill is already settled.
 */
const zeroTenderRefused = (): Error =>
  new Error(
    "payment.recorded refused (02-F48): amount_paisa is 0, so this tender is worth nothing. " +
      "Nothing has been taken and nothing is recorded — the bill is unchanged. A tender of " +
      "nothing is not a sale (01-F17), and 01-F1 would make a Rs 0 settlement permanent.",
  );

export type ZeroTenderGuardDeps = {
  /**
   * The unguarded writes this wraps, and **the only dependency there is**. Narrowed by name so
   * nothing else can slip past, and singular so `02-F48`'s "consulting nothing" is a property of
   * the type rather than a claim in a comment.
   */
  readonly writes: RendererWrites;
};

/**
 * `02-F48`'s refusal, as a wrapper around the writes the renderer reaches.
 *
 * **A wrapper and not a branch inside `createGateway`**, on `authorizeWrites`' and
 * `refuseDoubleSettlement`'s precedent directly next door: the trust boundary is drawn once, in
 * `index.ts`, where a reader can see it — and deleting the wrapper is one argument, which is what
 * makes the seam mutable and therefore testable.
 *
 * **Its position in the chain is the decision, and `index.ts` carries the reasoning:** matrix →
 * amount → duplicate → ledger. Commandment 8 first; then the check that consults nothing; then the
 * one that consults the fold. A request carrying no money is not a tender at all, so asking "is
 * this a duplicate tender?" of it would answer the wrong question and tell the cashier about the
 * BILL when the fact she needs is about what she just did.
 *
 * **A refusal appends nothing and unwinds nothing** (commandment 1 / `01-F1`).
 */
export const refuseZeroTender = (deps: ZeroTenderGuardDeps): RendererWrites => ({
  append: (req: unknown): AppendResult => {
    // Re-parsed rather than read raw: `req` is `unknown` from an untrusted renderer. On anything
    // malformed this narrowing simply MISSES and the request goes on to the real validator, which
    // throws — fail-open HERE and fail-closed THERE, so a broken payload can never be refused for
    // the wrong reason. `settlement-guard.ts` takes the identical posture on the identical input.
    const parsed = AppendRequestSchema.safeParse(req);
    if (parsed.success && refusable(parsed.data.type, parsed.data.payload))
      throw zeroTenderRefused();
    return deps.writes.append(req);
  },
  // Untouched, and written out rather than spread: a member added to `Gateway` later must be a
  // decision here, not something a spread carries through unexamined. None of the three carries a
  // tender — a decorator that wrapped them would be a guard with a blast radius nobody asked for.
  addLine: (req: unknown): AppendResult => deps.writes.addLine(req),
  toggleAvailability: (req: unknown): AppendResult => deps.writes.toggleAvailability(req),
  recordCustomer: (req: unknown): AppendResult => deps.writes.recordCustomer(req),
  // `02-F64` — passed straight through: this guard has no opinion about a customer link.
  linkCustomer: (req: unknown): AppendResult => deps.writes.linkCustomer(req),
});

/**
 * The whole rule, as a pure function of a parsed request.
 *
 * **`purpose` is NOT consulted, and that is deliberate.** `DEC-MONEY-007` gives `payment.recorded`
 * two purposes, and a zero REPAYMENT states nothing a positive one could not either — narrowing
 * this to `settles_order` reads as careful scoping and leaves the identical hole one discriminator
 * over. `02-F48` rules the EVENT.
 *
 * **`=== 0`, not `<= 0`.** A negative amount is not "nothing", it is malformed: `registry.ts` makes
 * `amount_paisa` a non-negative integer, so `parseEvent` refuses it downstream with its own reason.
 * Widening this comparison would take a second, different refusal under this FR's name — and
 * `24 §3b` asks for the minimum code that closes the FR, not for error handling for a case the
 * schema already owns.
 */
const refusable = (type: string, payload: Record<string, unknown>): boolean =>
  type === PAYMENT_RECORDED &&
  typeof payload.amount_paisa === "number" &&
  payload.amount_paisa === 0;
