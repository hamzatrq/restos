import type { EntitlementSource } from "./entitlement.js";
import { entitlementFor, STOREFRONT_CAPABILITY } from "./entitlement.js";
import type { PlaceOrderInput, StorefrontOrigin } from "./origin.js";
import type { Outbox } from "./outbox.js";

/**
 * `06-F17`/`06-F30` — **the use case, and the ORDER of its three steps is the whole file.**
 *
 * entitlement → append → durable persist → only then acknowledge.
 *
 * `00 §5.2` and commandment 4 make the last arrow the load-bearing one: *confirmed = locally
 * persisted before the UI ack*. This service is not a branch, but the customer-facing promise is
 * the same shape and fails the same way — a "your order is placed" screen rendered from an
 * in-flight variable, followed by a process restart, is a customer waiting for food that no
 * ledger anywhere has heard of. There is no row to be missing from, so nothing can reconcile it.
 */
export type PlacementDeps = {
  readonly origin: StorefrontOrigin;
  readonly outbox: Outbox;
  readonly entitlement: EntitlementSource;
  /*
   * ⚠ There was a `wake?: () => void` here, to nudge a push loop. `pnpm seams:check` Rule B
   * caught it on its first run — *"an optional seam NEVER SUPPLIED by a shipping caller"* — and
   * it was right: the push client is OWED, so nothing could have supplied it. Removed rather
   * than marked, on `24 §3b`'s craft rule (no speculative flexibility). It comes back WITH the
   * caller that needs it, which is the only order in which the rail stays honest.
   */
};

export class NotEntitledError extends Error {
  constructor(readonly org_id: string) {
    super(
      `06-F32/28-F4: org ${org_id} is not entitled to ${STOREFRONT_CAPABILITY}. This is a ` +
        `commercial refusal, not an authorization one — 28-F4 keeps the two distinct precisely ` +
        `so a lapsed subscription and an unauthorised caller do not read as one failure.`,
    );
    this.name = "NotEntitledError";
  }
}

/**
 * `28-F3`'s corollary and `28-F8`: the capability is refused because the state could not be READ,
 * which is not the same answer as *"this org is not entitled"* and must not be reported as one.
 * It is also the answer that clears by itself when the store comes back.
 */
export class EntitlementUnreadableError extends Error {
  constructor(readonly org_id: string) {
    super(
      `28-F3/28-F8: org ${org_id}'s entitlement state could not be READ, so ` +
        `${STOREFRONT_CAPABILITY} is refused as unreadable — an unreadable state is not proof of ` +
        `entitlement, and it is not a finding that this org lacks the capability either.`,
    );
    this.name = "EntitlementUnreadableError";
  }
}

/**
 * `06-F34` (b) / `00 §5.4` — the org the gate resolved is not the org this origin stamps.
 *
 * Reproduced before this check existed: entitlement resolved and PASSED against `org-B`, and the
 * events landed in `org-A`'s ledger, because `org_id` reached only the gate while the envelope
 * took `deps.identity.org_id`. It is a **named** error rather than a generic one so it cannot be
 * read as a commercial refusal (`28-F4`) or as a malformed request: this is isolation, `00 §5.4`
 * makes org scoping absolute, and `01-F1` makes a wrong-tenant write permanent.
 */
export class CrossTenantError extends Error {
  constructor(
    readonly asked_org_id: string,
    readonly origin_org_id: string,
  ) {
    super(
      `06-F34/00 §5.4: this storefront origin stamps ${origin_org_id} and was asked to place an ` +
        `order for ${asked_org_id}. Refused before any append: the gate and the envelope must ` +
        `resolve ONE tenant, and 01-F1 makes a cross-tenant write permanent.`,
    );
    this.name = "CrossTenantError";
  }
}

const admit = async (deps: PlacementDeps, org_id: string): Promise<void> => {
  // `06-F34` (b) FIRST. Isolation is not a commercial question, and resolving entitlement for a
  // tenant this process cannot write is answering the wrong question convincingly.
  if (org_id !== deps.origin.identity.org_id) {
    throw new CrossTenantError(org_id, deps.origin.identity.org_id);
  }
  // (ii) of `06-F32`'s two mechanisms — the RUNTIME resolution. The boot assertion in `router.ts`
  // proves this procedure DECLARES a capability; only this line checks it.
  const verdict = await entitlementFor(deps.entitlement, org_id, STOREFRONT_CAPABILITY);
  if (verdict === "unreadable") throw new EntitlementUnreadableError(org_id);
  if (verdict === "not_entitled") throw new NotEntitledError(org_id);
};

/**
 * `06-F36` (b) — **the append is serialized per origin, and it is a correctness mechanism rather
 * than a throttle.**
 *
 * The gateway's ingest is stop-at-gap per origin (`01-F8`): `handlePush` breaks on
 * `lamport_seq !== through + 1` and its out-of-order fill set lives for one push only, so ONE slot
 * that is reserved and never persisted stops this origin's watermark **permanently** — the outbox
 * re-pushes the same page for ever and no later order reaches the branch. The durable outbox
 * therefore advances the lamport counter only in the transaction that persists the events
 * (`outbox-postgres.ts`), and that is safe only while no two reservations are outstanding at once.
 * This chain is what guarantees it.
 *
 * **What it costs, stated rather than discovered:** one placement at a time per process, including
 * the catalog round trip inside `placeOrder`. Order placement is not the hot path — `06-N1` puts
 * the budget on the menu render, and `catalog.ts` already declines to cache for the same reason.
 * `06-F30` fixes exactly one writer process per (org, branch) anyway, so this makes the origin a
 * single writer end to end rather than only at the database.
 *
 * ⚠ **A REFUSAL MUST RELEASE THE CHAIN — and the two lines below are REDUNDANT WITH EACH OTHER,
 * which is not what the comment here first claimed.** It said the two-arm `tail.then(work, work)`
 * was the mechanism. Mutation says otherwise (full suite, 2026-08-25):
 *
 *     `tail.then(work, work)` -> `tail.then(work)`          **0 killed of 120**
 *     `tail = mine.catch(…)`  -> `tail = mine`              **0 killed of 120**
 *     BOTH at once                                          **3 killed** — §B and §C of
 *                                                           `append-serialization.test.ts`
 *
 * Either one alone releases the chain: the second `then` arm runs the next order after a rejection,
 * and the `catch` keeps the rejection off the tail in the first place. Only removing both wedges
 * the origin, and then one unpriced cart — an ordinary event — stops the storefront for ever.
 *
 * **Both are kept, and the reason is stated rather than assumed.** The `catch` additionally stops
 * an unhandled rejection dangling on a promise nobody awaits, and the two-arm form additionally
 * survives a later edit that drops the `catch`. What is NOT true is that either is individually
 * load-bearing, and a comment saying so would retire the assertion the next reader would write
 * (`L11` — recorded here because this file earned it by being wrong on its first draft).
 */
const serialized = () => {
  let tail: Promise<unknown> = Promise.resolve();
  return async <T>(work: () => Promise<T>): Promise<T> => {
    const mine = tail.then(work, work);
    tail = mine.catch(() => undefined);
    return mine;
  };
};

export const createPlacement = (deps: PlacementDeps) => {
  const inOrder = serialized();
  return {
    place: async (org_id: string, input: PlaceOrderInput): Promise<{ order_id: string }> =>
      inOrder(async () => {
        await admit(deps, org_id);

        const batch = await deps.origin.placeOrder(input);

        // ⚠ AWAITED, AND THE `await` IS THE COMMANDMENT-4 SEAM. Dropping it (or moving it after the
        // return) leaves every assertion about envelope CONTENT green while the durability promise is
        // gone. `origin-seam.test.ts` §D holds the outbox open on a deferred promise and asserts this
        // call has not RESOLVED — measured, because the first version of that test asserted the call
        // ORDER instead and the `void deps.outbox.put(...)` mutant survived it 29/29 green.
        await deps.outbox.put(batch.events);

        return { order_id: batch.order_id };
      }),

    /** `06-F19`/`06-F27`. Same ordering law, same reason — and the same lamport chain. */
    cancel: async (
      org_id: string,
      input: { order_id: string; reason: string },
    ): Promise<{ order_id: string }> =>
      inOrder(async () => {
        await admit(deps, org_id);
        const batch = await deps.origin.cancelOrder(input);
        await deps.outbox.put(batch.events);
        return { order_id: batch.order_id };
      }),
  };
};
