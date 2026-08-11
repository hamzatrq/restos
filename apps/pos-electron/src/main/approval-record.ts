import { type ApprovalType, newId } from "@restos/domain";
import type { DeviceStore } from "@restos/sync-client";
import {
  type AppendRequest,
  AppendRequestSchema,
  type AppendResult,
  type EscalationOffer,
  type EscalationResult,
  type Session,
} from "../shared/ipc";
import type { AuthorizedEscalation } from "./authorize";
import type { VerifiedAppend } from "./gateway";

/**
 * **`05-F6`: *"every decision is fully logged"* — the half the local path never had.**
 *
 * Until this file existed, `main/authorize.ts` appended the escalated write with
 * `approver_user_id` in its payload and **no `approval.*` event at all**. Two consequences, and
 * they are different kinds of loss:
 *
 * 1. A **DENIAL left no trace whatsoever.** `05 §4`'s paid-out flow reads its reason back at the
 *    counter (*"the paid-out stays pending at the POS with the denial reason"*), and under `01-F1`
 *    a decision that left no row cannot later be distinguished from a request nobody ever saw.
 * 2. **Nothing anywhere emitted `approval.requested`** (`05-F28`, `05-F29`), so the queue doc 05
 *    renders had no producer under ANY of `05-F28`'s three resolutions — the till resolved an
 *    escalation entirely in-process and never announced it.
 *
 * ── Why a DECORATOR and not a change to `authorizeEscalation` ────────────────────────────────
 *
 * `escalation.test.ts` is the oracle for `02-F20`'s local path and it pins `approve`'s single
 * `writes.append` per approval. Emitting the approval family from inside `authorizeEscalation`
 * would need a new dep there: REQUIRED breaks that oracle's rig at compile, and OPTIONAL is
 * `seams:check` Rule B's blind spot (instances 2 and 5 of the wave's named defect — an options-bag
 * member no call site ever passes). So the escalation keeps its exact shape and this wraps it.
 *
 * ── The property this file exists for: ONE act, TWO differently-attributed envelopes ──────────
 *
 * The escalated write (`cash.paid_out`) is the CASHIER's act and stays hers — `02-F41`, and
 * `gateway.append` reads the live session for exactly that reason. The `approval.granted` is the
 * MANAGER's act and its envelope actor is hers, because `registry.ts` says so in as many words:
 * *"a grant whose envelope named the cashier would be the local path's defect committed on the
 * remote one: the session moved, one identity where there must be two."* The till could not
 * express that at all until `createVerifiedAppend` existed, because every append site it had read
 * the session — see that seam's own note for the three alternatives refused.
 *
 * So this module reads the session for ONE thing (who the requester is) and takes the approver as
 * an argument the escalation has just verified. It never moves a session and cannot: `unlock()`
 * MOVES one, and approving through the cashier's own would sign her out and re-attribute her next
 * twenty orders to whoever authorised one paid-out, permanently (`02-F41` + `01-F1`).
 */

/** `05-F7`'s five approval types, keyed by the `01 §4` event each one is an instance of. */
const APPROVAL_TYPE_OF: Readonly<Record<string, ApprovalType>> = {
  "cash.paid_out": "paid_out",
  "void.recorded": "void",
  "comp.recorded": "comp",
  "discount.recorded": "discount",
  "order.line_price_overridden": "price_override",
};

/**
 * `05-F7`'s *"amounts"*, read from the act's OWN money field.
 *
 * A price override carries `unit_price_paisa` and the other four carry `amount_paisa`, so a
 * recorder that read one key everywhere would put **Rs 0** on the card `05-F5` requires to hold
 * *"enough to decide without walking over"* — a manager approving a number that is not the number.
 */
const AMOUNT_KEY_OF: Readonly<Record<string, string>> = {
  "cash.paid_out": "amount_paisa",
  "void.recorded": "amount_paisa",
  "comp.recorded": "amount_paisa",
  "discount.recorded": "amount_paisa",
  "order.line_price_overridden": "unit_price_paisa",
};

/**
 * `discount.recorded` is in both tables above and is **UNREACHABLE today**, which is recorded
 * rather than left to look like coverage. `main/authorize.ts`'s `WRITE_ACTIONS` carries no row for
 * it — its own comment calls that *"a FINDING, not an oversight"*, because `02-F20` splits
 * discounts at an org threshold, there is no `canDiscount` predicate on `canPayOut`'s pattern, and
 * `00 §7` layer 2 holds no threshold to feed one. So a discount fails closed to `deny`, never
 * escalates, and never reaches this module. The row costs one line and buys the thing its absence
 * would cost: a fifth escalatable act arriving here with no description to announce.
 */

/** What a legal `approval.requested` needs from the act, or `null` if the act cannot supply it. */
type ActFacts = {
  readonly approval_type: ApprovalType;
  readonly amount_paisa: number;
  readonly reason: string;
  readonly approval_refs: readonly string[];
};

const factsOf = (req: AppendRequest): ActFacts | null => {
  const approval_type = APPROVAL_TYPE_OF[req.type];
  const amount = req.payload[AMOUNT_KEY_OF[req.type] ?? ""];
  const reason = req.payload.reason;
  // Fail closed, and it is unreachable by construction rather than defensive: every act that can
  // escalate now carries a schema in `packages/domain` requiring these fields, so an act missing
  // one is an act `01-F4` refuses at append anyway. Announcing a request we cannot describe would
  // put an interrupt on a manager's device naming no amount and no reason (`05-F5`), and inventing
  // either is commandment 2.
  if (approval_type === undefined) return null;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) return null;
  if (typeof reason !== "string" || reason.length === 0) return null;
  return { approval_type, amount_paisa: amount, reason, approval_refs: req.refs };
};

/**
 * The identity of an ACT, for `05-F7`'s *"grants reference the request id, are idempotent"*.
 *
 * `Counter.tsx` calls `escalationFor` from a `.catch()` on every attempt, so a cashier who presses
 * *Paid out* twice raises the pad twice — with a fresh request id per press, ONE act would put two
 * pending requests into an append-only ledger (`01-F1`), and a grant against the first would leave
 * the second pending for ever on the manager device `05-F29` (a) ships.
 *
 * The renderer sends no request id, so the act's own content is the only handle available. Each
 * press rebuilds an equal `AppendRequest` at the same call site, which is why the key is content
 * and not object identity. The entry is dropped the moment the act RESOLVES, so two genuinely
 * separate paid-outs of the same amount are two requests rather than one.
 */
const keyOf = (req: AppendRequest): string =>
  JSON.stringify([
    req.type,
    req.refs,
    Object.keys(req.payload)
      .sort()
      .map((k) => [k, req.payload[k]]),
  ]);

export type ApprovalRecorder = {
  /**
   * `02-F20`'s offer, with `05-F28`'s missing producer on the front of it: the request is
   * ANNOUNCED before a decision exists, because `05 §4` has the manager's queue show a pending
   * item and a decision that referenced no request is not expressible (`05-F7`).
   */
  raise: (req: unknown) => EscalationOffer | null;
  approve: (req: unknown, approver_user_id: string, pin: string) => Promise<EscalationResult>;
  /** `05-F6`'s other half. A denial is a RECORD, never the absence of one. */
  deny: (
    req: unknown,
    approver_user_id: string,
    pin: string,
    reason: string,
  ) => Promise<EscalationResult>;
};

export type ApprovalRecorderDeps = {
  /** `02-F20`'s local path, unchanged. Every verdict below is still ITS verdict. */
  escalation: AuthorizedEscalation;
  /** `05-F29` — an append whose actor is STATED. Never `gateway.append`, which reads the session. */
  appendAs: VerifiedAppend;
  /** `02-F41` — the REQUESTER, read at each act like every other session read on this device. */
  session: () => Session | null;
  /** `05-F7`'s *"requesting device_id"*, from this device's own identity (`01-F2`). */
  store: Pick<DeviceStore, "identity">;
};

export const recordApprovals = (deps: ApprovalRecorderDeps): ApprovalRecorder => {
  /** act key → the id of the request already announced for it, until it resolves. */
  const pending = new Map<string, string>();

  /**
   * Announce the request if the matrix escalates this act, and return the offer.
   *
   * Both routes out of an escalation go through it, so a manager who approves without the pad
   * having been raised still has a request for the decision to reference — `escalate` is a
   * separate IPC channel and a renderer is never obliged to have called `escalationFor` first.
   */
  const raiseFor = (req: unknown): { offer: EscalationOffer; request_id: string } | null => {
    const offer = deps.escalation.offer(req);
    if (offer === null) return null;
    const parsed = AppendRequestSchema.safeParse(req);
    if (!parsed.success) return null;
    const requester = deps.session();
    // `01-F27` — a locked device is a subject with no authority, so there is no requester to ask
    // on behalf of. `escalation.offer` already refuses it; this is the type-level half.
    if (requester === null) return null;
    const facts = factsOf(parsed.data);
    if (facts === null) return null;

    const key = keyOf(parsed.data);
    const already = pending.get(key);
    if (already !== undefined) return { offer, request_id: already };

    const request_id = newId();
    deps.appendAs(requester.user_id, {
      type: "approval.requested",
      payload: {
        request_id,
        approval_type: facts.approval_type,
        approval_refs: facts.approval_refs,
        amount_paisa: facts.amount_paisa,
        reason: facts.reason,
        // `05-F7`: *"requester_id, requesting device_id"*. Both read on the TRUSTED side — the
        // requester from the live session (`02-F41`) and the device from the store's own identity
        // — never from anything the renderer sent (`18 §9`, commandment 8).
        requester_id: requester.user_id,
        requesting_device_id: deps.store.identity.device_id,
      },
      // `00 §6`'s soft references, carried onto the announcement so the ledger's own links point
      // at the order this is about. The payload's `approval_refs` is `05-F7`'s business list.
      refs: parsed.data.refs,
    });
    pending.set(key, request_id);
    return { offer, request_id };
  };

  /** Both decisions land the same way: the APPROVER's envelope, and the request it answers. */
  const record = (
    type: "approval.granted" | "approval.denied",
    req: AppendRequest,
    request_id: string,
    approver_user_id: string,
    requester_user_id: string,
    reason: string | null,
  ): AppendResult => {
    const appended = deps.appendAs(approver_user_id, {
      type,
      payload: {
        request_id,
        // `05-F7` requires BOTH, separately, so a decision that collapsed the two identities into
        // one does not parse. `02-F41`'s two-identity property, protected by the shape.
        approver_user_id,
        requester_user_id,
        ...(reason === null ? {} : { reason }),
      },
      refs: req.refs,
    });
    pending.delete(keyOf(req));
    return appended;
  };

  return {
    raise: (req: unknown): EscalationOffer | null => raiseFor(req)?.offer ?? null,

    approve: async (
      req: unknown,
      approver_user_id: string,
      pin: string,
    ): Promise<EscalationResult> => {
      // Announced BEFORE the credential is judged, and that ordering is `01-F1`: a request that
      // was raised is a fact, and a mis-keyed PIN does not unmake it. It is also what lets a
      // manager device see the pending item while the cashier is still finding her.
      const raised = raiseFor(req);
      const result = await deps.escalation.approve(req, approver_user_id, pin);
      if (!result.ok) return result;

      const parsed = AppendRequestSchema.safeParse(req);
      // Unreachable: `escalation.approve` parsed the same request and refuses what it cannot read.
      if (raised === null || !parsed.success) return result;
      const requester = deps.session();
      if (requester === null) return result;

      // ORDER against the escalated write is deliberately unpinned — `01-F34` forbids any fold
      // reading ordering metadata, and `05-F6`'s "→" is a causal narrative rather than a sequence
      // contract. The grant follows the write because the write is what `escalation.approve`
      // returns, not because anything depends on it.
      record(
        "approval.granted",
        parsed.data,
        raised.request_id,
        approver_user_id,
        requester.user_id,
        null,
      );
      return result;
    },

    deny: async (
      req: unknown,
      approver_user_id: string,
      pin: string,
      reason: string,
    ): Promise<EscalationResult> => {
      // `approval.denied.reason` is `z.string().min(1)` and `05 §4` reads it back at the counter.
      // Refused BEFORE the credential so a caller error costs no `01-F61` lockout attempt, and
      // refused rather than defaulted: a sentence supplied here would be words no FR gives
      // (commandment 2 — this repo already had to find an FR before `CATALOG_REFUSAL_WORDS` could
      // exist).
      if (reason.length === 0) return { ok: false, refused: "no_reason" };

      // THE SAME four refusals a grant passes (`02-F20`), decided by `authorize.ts` and not
      // re-read here — appending nothing. A denial that skipped `01-F28`'s credential, or
      // `02-F38`, or the approver's own matrix verdict, would be a way to write a permanent
      // refusal into somebody else's name with no credential at all.
      const decision = await deps.escalation.authorizeApprover(req, approver_user_id, pin);
      if (!decision.ok) return { ok: false, refused: decision.refused };

      const raised = raiseFor(req);
      const parsed = AppendRequestSchema.safeParse(req);
      if (raised === null || !parsed.success) return { ok: false, refused: "not_escalatable" };

      // `05 §4` — *"Denial leaves the line intact … cash does not leave the drawer against the
      // ledger."* NOTHING is appended to the act's own path, which is the one thing a denial must
      // never do. The id carried back is the DENIAL's own event, so a caller can tell a recorded
      // refusal from a refusal to record one.
      const recorded = record(
        "approval.denied",
        parsed.data,
        raised.request_id,
        decision.approver_user_id,
        decision.requester_user_id,
        reason,
      );
      return { ok: true, id: recorded.id };
    },
  };
};
