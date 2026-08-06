import {
  type AuthScope,
  type AuthSubject,
  can,
  canPayOut,
  type PermissionAction,
  ROLES,
  type Role,
} from "@restos/domain";
import type { DeviceStore } from "@restos/sync-client";
import { AppendRequestSchema, type AppendResult, type Session } from "../shared/ipc";
import type { Gateway } from "./gateway";

/**
 * **Commandment 8, on the counter.** *"Server-side authorization always via the `domain`
 * permission matrix; client role claims are never trusted."*
 *
 * `18 §9` gives the renderer no Node access and one typed IPC bridge, so on this app the MAIN
 * process is what "server-side" means: it is the only side that holds the store, the session and
 * the staff registry, and the only side a compromised renderer cannot rewrite. A guard drawn in
 * the renderer — a hidden tile, a disabled button — is a client role claim, and the commandment
 * says never trust one. `CashSurfaces.tsx` may hide "Open the day"; **this file is what refuses
 * it**, and it refuses it whether or not the tile was ever drawn.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────────────────────
 *
 * It holds **no policy of its own**. Every verdict comes from `domain/permissions.ts` — the
 * matrix, `can`, `canPayOut` — which `18 §` names as the platform's only authorization consumer
 * and which has had 89 tests and 28/28 killed mutants and **zero production callers** since it
 * was written. This is that caller. What lives here is one thing the matrix cannot know: which
 * `01 §4` EVENT TYPE is an instance of which Appendix A ACTION.
 *
 * ── Fail-closed, and where the closure applies ──────────────────────────────────────────────
 *
 * `01-F27` puts authorization on every operation, so an event type absent from `WRITE_ACTIONS`
 * below is REFUSED rather than waved through. That direction is deliberate: a future event type
 * added to `domain`'s registry without a row here stops at this seam loudly, which is the
 * opposite of the wave's recurring defect (a subsystem the product never reaches).
 *
 * The closure applies to the **renderer's** two write channels and to those only. `main` also
 * appends `kot.printed` / `kot.print_failed` through `gateway.append` directly, and those are
 * device FACTS, not acts a person performs: nobody "does" a print failure, `02-F19`'s list of
 * attributed actions does not contain one, and Appendix A has no row for it — inventing one
 * would be exactly the speculative widening `24-F23` forbids. So the split is not an exemption
 * list to keep in sync; it is which object main hands to which caller (see `main/index.ts`).
 */

/**
 * `01 §4` event type → the Appendix A action it is an instance of.
 *
 * Every row is an event some surface performs or that `02-F20` names, and no row invents a
 * matrix entry — `permissions.ts` already carries all of them.
 *
 * - `order.created` / `order.confirmed` / `order.line_added` → Appendix A's ONE row
 *   *"Create order / print KOT"*. The confirm is the KOT, and a line is part of creating.
 * - `day.opened` / `day.closed` / `cash.deposit_recorded` → `02-F22`'s **role guard** and
 *   `02-F24`'s day close. The deposit record is the second half of one act ("manager cash count
 *   **and** deposit record → `day.closed`, `cash.deposit_recorded`"), so it cannot be a lesser
 *   permission than the close it belongs to.
 * - `shift.opened` / `shift.closed` → `shift.open_close`, which `02-F22`/`02-F23` deliberately
 *   put in the cashier's OWN hands ("shift open **per cashier**"). This is the half of `02-F22`
 *   its role guard does not cover, and folding it in would leave a cashier unable to start her
 *   own shift on the device she is standing at.
 * - `cash.drawer_opened` → `cash.drawer_no_sale`, which every till-reachable role may perform:
 *   `02-F43` says in terms that a refusal produces "an unbound no-sale that is stored and
 *   uncounted", which is strictly worse than the act.
 * - `void.recorded` / `comp.recorded` / `order.line_price_overridden` → `02-F20`'s escalation
 *   family. **These three are mapped ahead of their events**, and that is stated rather than
 *   left to look like scope creep: `domain/registry.ts` carries no payload schema for them yet,
 *   so nothing can append one today. The row costs one line and buys the thing `02-F20` cannot
 *   survive losing — an `escalate` cell with a reachable entry point. Omitting them would make
 *   the fail-closed default answer `deny`, which is precisely the collapse that makes the
 *   feature unable to exist.
 * - `approval.granted` / `approval.denied` → `approval.grant`, so `02-F38`'s self-approval
 *   refusal is decided by the matrix and not by a screen.
 *
 * **`cash.paid_out` is deliberately ABSENT.** Its verdict depends on the amount against the org
 * threshold, and `can()` refuses that route on purpose; `canPayOut` is the only one that
 * resolves it. See `guard` below.
 *
 * **`discount.recorded` is deliberately ABSENT, and it is a FINDING, not an oversight.**
 * `02-F20` splits discounts at the org threshold and the matrix carries both cells
 * (`order.discount_within_threshold`, `order.discount_above_threshold`) — but nothing here can
 * tell them apart: there is no `canDiscount` predicate on `canPayOut`'s pattern, and no
 * threshold in `00 §7` layer 2 to feed one. Answering anyway would be answering without the
 * input that decides the question, which is the reasoning `permissions.ts` already applies to
 * `cash.paid_out`. So it fails closed and the predicate is owed to `domain` before any discount
 * surface can land.
 */
export const WRITE_ACTIONS: Readonly<Record<string, PermissionAction>> = {
  "order.created": "order.create",
  "order.confirmed": "order.create",
  "order.line_added": "order.create",
  "payment.recorded": "payment.settle",
  "shift.opened": "shift.open_close",
  "shift.closed": "shift.open_close",
  "day.opened": "day.open_close",
  "day.closed": "day.open_close",
  "cash.deposit_recorded": "day.open_close",
  "cash.drawer_opened": "cash.drawer_no_sale",
  "void.recorded": "order.void_after_kot",
  "comp.recorded": "order.comp_item",
  "order.line_price_overridden": "order.price_override",
  "approval.granted": "approval.grant",
  "approval.denied": "approval.grant",
};

/** The one event type whose verdict needs an amount, so it never reaches `WRITE_ACTIONS`. */
const PAID_OUT = "cash.paid_out";

/**
 * `05-F19`'s org threshold, in integer paisa (`00 §6`).
 *
 * **PINNED, not specified** — stated as a pin for the same reason `IDLE_LOCK_MS` and
 * `MAX_FAILED_ATTEMPTS` are in `main/index.ts`. `05-F19` fixes the RULE ("`cash.paid_out` above
 * the org threshold requires approval") and names no number, and `00 §7`'s layer-2 config plane
 * that would carry one does not exist yet. Rs 2,000 sits under `05 §5`'s own worked scenario
 * (a PKR 4,000 paid-out that must escalate), so the pin reproduces the spec's example rather
 * than a preference.
 *
 * Exported and passed EXPLICITLY at the one call site: `canPayOut` takes both figures as
 * required parameters on `01-F60`'s precedent, and a default living inside this module would be
 * the same optional-means-skip hole one layer up.
 */
export const PAID_OUT_APPROVAL_THRESHOLD_PAISA = 200_000;

/**
 * Why a write was refused, attached to the thrown error so a caller can tell the three outcomes
 * apart. `escalate` is NOT `deny`: `02-F20` gives it two equivalent paths (a local manager PIN
 * on the POS, a remote approval from the console), and a caller that could not distinguish them
 * would have no way to offer either.
 *
 * **Neither path is built** (`05` is not Wave 1), so today an escalation is refused at this
 * seam like a denial — but it is refused with a DIFFERENT outcome and with the roles that close
 * the gap already named, so the screen that eventually asks for a manager PIN reads them off the
 * matrix instead of hardcoding a role, which is `18 §`'s banned inline check relocated into UI.
 */
export type WriteRefusal = {
  readonly event_type: string;
  readonly outcome: "deny" | "escalate";
  /** `null` when the event type carries no matrix action at all (the fail-closed default). */
  readonly action: PermissionAction | null;
  /** `02-F20` — whose credential closes the gap. Empty on a plain deny. */
  readonly satisfied_by: readonly Role[];
};

export type WriteRefusedError = Error & { readonly refusal: WriteRefusal };

/** The renderer-facing write surface, authorized. Same shapes as the gateway's own two. */
export type AuthorizedWrites = {
  append: (req: unknown) => AppendResult;
  addLine: (req: unknown) => AppendResult;
};

export type AuthorizedWritesDeps = {
  /** The unguarded writes this wraps. Narrowed to two methods so nothing else can slip past. */
  writes: Pick<Gateway, "append" | "addLine">;
  /**
   * `01-F26`/`01-F28` — the assignments come from the SYNCED staff registry on this device, and
   * `store.identity` is where the org and branch come from. Neither is anything the renderer
   * sends: `02-F45` reads attribution off the envelope, and a role claim that arrived over the
   * bridge is the exact thing Commandment 8 forbids trusting.
   */
  store: Pick<DeviceStore, "identity" | "staff">;
  /** `02-F41` — a GETTER, for the same reason the gateway's is: the session moves 20–60×/shift. */
  session: () => Session | null;
  /** `05-F19` — REQUIRED, never defaulted. See `PAID_OUT_APPROVAL_THRESHOLD_PAISA`. */
  paidOutApprovalThresholdPaisa: number;
};

const refused = (refusal: WriteRefusal): WriteRefusedError => {
  const what = refusal.action ?? "no permission action";
  const message =
    refusal.outcome === "escalate"
      ? `${refusal.event_type} needs manager approval (02-F20, ${what}) — satisfied by ` +
        `${refusal.satisfied_by.join(" or ")}. This session cannot perform it unsupervised.`
      : `${refusal.event_type} is not permitted for this session (${what}) — ` +
        `refused by the domain permission matrix (Commandment 8).`;
  const error = new Error(message) as Error & { refusal: WriteRefusal };
  error.refusal = refusal;
  return error;
};

/**
 * A registry role string, narrowed to a matrix column.
 *
 * `StaffAssignment.role` is a plain `string` — it arrives over the sync chain as reference data
 * — so a row naming a role this matrix does not carry grants NOTHING rather than being coerced
 * into the nearest column. `01-F48`'s fail-closed direction, applied at the one place a wire
 * value becomes an authority.
 */
const roleOf = (name: string): Role | null => ROLES.find((role) => role === name) ?? null;

/**
 * Who is asking (`01-F27`). `null` is a LOCKED device, and a locked device is a subject with no
 * authority at all — `01-F27` is explicit that a device identity is never promoted into a user
 * identity, so the answer is not "the device may do it".
 */
const subjectOf = (deps: AuthorizedWritesDeps): AuthSubject | null => {
  const session = deps.session();
  if (session === null) return null;
  const member = deps.store.staff.lookup(session.user_id);
  const assignments = (member?.assignments ?? []).flatMap((assignment) => {
    const role = roleOf(assignment.role);
    return role === null ? [] : [{ role, branch_id: assignment.branch_id }];
  });
  return { user_id: session.user_id, org_id: deps.store.identity.org_id, assignments };
};

export const authorizeWrites = (deps: AuthorizedWritesDeps): AuthorizedWrites => {
  /** Throws a `WriteRefusedError` unless the matrix allows this event outright. */
  const guard = (event_type: string, payload: Record<string, unknown>): void => {
    const action = WRITE_ACTIONS[event_type] ?? null;
    const denied = (): WriteRefusedError =>
      refused({ event_type, outcome: "deny", action, satisfied_by: [] });

    const subject = subjectOf(deps);
    if (subject === null) throw denied();

    const scope: AuthScope = {
      org_id: deps.store.identity.org_id,
      branch_id: deps.store.identity.branch_id,
    };

    if (event_type === PAID_OUT) {
      const amount = payload.amount_paisa;
      // `02-F44` — the amount is REQUIRED, and here it is the input the verdict turns on. A
      // paid-out that states none cannot be measured against `05-F19`'s threshold, and the
      // answer that cannot be right is "under it": that is how a Rs 4,000 paid-out walks past
      // the approval the FR exists to require. `01-F60`'s precedent, one layer down.
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) throw denied();
      const decision = canPayOut(subject, scope, {
        amount_paisa: amount,
        threshold_paisa: deps.paidOutApprovalThresholdPaisa,
      });
      if (decision.outcome === "allow") return;
      throw refused({
        event_type,
        outcome: decision.outcome,
        action: decision.action,
        satisfied_by: decision.satisfied_by ?? [],
      });
    }

    if (action === null) throw denied();

    /**
     * `02-F38` — "a requester never sees an approve control for their own request … *and*
     * refused server-side by the `domain` permission matrix (a client that renders it anyway
     * must still fail)". `can` performs the refusal; this supplies the fact it needs.
     *
     * A grant that names NO requester is refused, for `canPayOut`'s reason exactly: without the
     * requester the self-approval rule cannot be evaluated, and the outcome that cannot be right
     * is the permissive one — an omitted field would re-open the hole by silence.
     *
     * **Owed, and named rather than left to look intentional:** `05-F7` puts `requester_id` on
     * the REQUEST and has the grant reference the request by id, so the trustworthy resolution
     * is request-id → requester through an approvals projection. That projection is doc-05 work
     * and does not exist, so this reads the field off the grant.
     */
    if (action === "approval.grant") {
      const requester = payload.requester_id;
      if (typeof requester !== "string") throw denied();
      const decision = can(subject, action, { ...scope, requested_by_user_id: requester });
      if (decision.outcome === "allow") return;
      throw refused({
        event_type,
        outcome: decision.outcome,
        action,
        satisfied_by: decision.satisfied_by ?? [],
      });
    }

    const decision = can(subject, action, scope);
    if (decision.outcome === "allow") return;
    throw refused({
      event_type,
      outcome: decision.outcome,
      action,
      satisfied_by: decision.satisfied_by ?? [],
    });
  };

  return {
    append: (req: unknown): AppendResult => {
      // Parsed with the SAME schema the gateway parses with, so there is no shape that slips
      // past this guard and is still accepted below: a request this cannot read is a request
      // `gateway.append` throws on, and authorizing what we cannot read would be answering a
      // question nobody asked.
      const parsed = AppendRequestSchema.safeParse(req);
      if (parsed.success) guard(parsed.data.type, parsed.data.payload);
      return deps.writes.append(req);
    },
    /**
     * `C5` — the counter's highest-frequency act, and the event type is fixed by the channel
     * rather than supplied by the caller (`gateway.addLine` always appends `order.line_added`),
     * so the action is known before the request is even read.
     */
    addLine: (req: unknown): AppendResult => {
      guard("order.line_added", {});
      return deps.writes.addLine(req);
    },
  };
};
