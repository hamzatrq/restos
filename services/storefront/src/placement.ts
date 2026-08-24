import type { EntitlementSource } from "./entitlement.js";
import { entitled, STOREFRONT_CAPABILITY } from "./entitlement.js";
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

export const createPlacement = (deps: PlacementDeps) => ({
  place: async (org_id: string, input: PlaceOrderInput): Promise<{ order_id: string }> => {
    // (ii) of `06-F32`'s two mechanisms — the RUNTIME resolution. The boot assertion in
    // `router.ts` proves this procedure DECLARES a capability; only this line checks it.
    if (!(await entitled(deps.entitlement, org_id, STOREFRONT_CAPABILITY))) {
      throw new NotEntitledError(org_id);
    }

    const batch = await deps.origin.placeOrder(input);

    // ⚠ AWAITED, AND THE `await` IS THE COMMANDMENT-4 SEAM. Dropping it (or moving it after the
    // return) leaves every assertion about envelope CONTENT green while the durability promise is
    // gone. `origin-seam.test.ts` §D holds the outbox open on a deferred promise and asserts this
    // call has not RESOLVED — measured, because the first version of that test asserted the call
    // ORDER instead and the `void deps.outbox.put(...)` mutant survived it 29/29 green.
    await deps.outbox.put(batch.events);

    return { order_id: batch.order_id };
  },

  /** `06-F19`/`06-F27`. Same ordering law, same reason. */
  cancel: async (
    org_id: string,
    input: { order_id: string; reason: string },
  ): Promise<{ order_id: string }> => {
    if (!(await entitled(deps.entitlement, org_id, STOREFRONT_CAPABILITY))) {
      throw new NotEntitledError(org_id);
    }
    const batch = await deps.origin.cancelOrder(input);
    await deps.outbox.put(batch.events);
    return { order_id: batch.order_id };
  },
});
