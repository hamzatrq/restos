import { UnpricedItemsError } from "./origin.js";

/**
 * `06-F37` — **what a stranger on the public internet is allowed to learn from a refusal.**
 *
 * Reproduced on the shipping service (August 2026): every refusal on the unauthenticated
 * `POST /trpc/placeOrder` returned the full Node stack — absolute repository paths
 * (`…/services/storefront/src/origin.ts:206`) and the `node_modules` layout — **including
 * `06-F1`'s 404**, which was neutral in its status code and an oracle in its body. A stack is a
 * map of which refusal fired and where; `06-N4`'s probes are looking for exactly that, and
 * `06-F1`'s own words for the 404 are *"a 404 that explains itself is a tenant-existence oracle"*.
 *
 * ⚠ **AN ALLOWLIST, NOT A REDACTION, AND THE DIFFERENCE IS WHICH WAY IT FAILS.** A redaction has
 * to anticipate every string worth hiding — a DSN in a Postgres error, an internal hostname, a
 * table name — and the first error class nobody thought about ships verbatim. An allowlist starts
 * closed: a message reaches a customer only because this module wrote it FOR a customer, and
 * everything else, including every error this service did not author, becomes one neutral sentence
 * with the real one on the operator's log.
 *
 * ⚠ **AND IT IS NOT CONDITIONED ON `NODE_ENV`.** tRPC omits the stack when `NODE_ENV` is
 * `production`, which is a protection that is absent on the day the variable is absent — and it
 * was absent on the day this was measured.
 */

/**
 * The one sentence every unauthored refusal collapses to. It names nothing — not the org, not the
 * procedure, not the reason — and it is deliberately the SAME sentence on `06-F1`'s 404 as on a
 * 500, because a body that differs by outcome is the oracle the status code was already careful
 * not to be.
 */
export const NEUTRAL_REFUSAL = "this request was refused";

/**
 * `06-F37` (b) — the allowlist itself.
 *
 * `UnpricedItemsError` is the single member today because `06-F33` **requires** it: *"the refusal
 * names the items"*, so a customer can take the unavailable thing out of her cart. Nothing else in
 * this service authored its message for a customer:
 *
 * - `CrossTenantError` names two org ids (`06-F34` — an isolation failure is for the log).
 * - `NotEntitledError` / `EntitlementUnreadableError` describe a COMMERCIAL state of the
 *   restaurant's account (`28-F4`); what a diner should be told when a shop's subscription has
 *   lapsed is a product decision for the surface that renders it, and inventing one here is the
 *   policy `06-F37` (c) deliberately leaves owed.
 * - `CatalogUnreadableError` names the gateway's address and its HTTP status.
 *
 * ⚠ **A NEW MEMBER IS A DECISION, NOT A CONVENIENCE.** Adding one publishes that class's message
 * to the public internet for ever. `refusal.test.ts` §A pins this list by size and by member, so
 * growing it fails a test that has to be read.
 */
const CUSTOMER_AUTHORED: readonly (abstract new (...args: never[]) => Error)[] = [
  UnpricedItemsError,
];

/**
 * The message a public caller receives, given whatever was thrown.
 *
 * ⚠ **IT WALKS `cause`, AND THE FIRST DRAFT DID NOT — measured, 2026-08-25.** tRPC never hands the
 * formatter the thrown error: it hands a `TRPCError` whose `cause` is the original. So a version
 * that only tested the top-level object neutralised `UnpricedItemsError` too, which is a
 * fail-CLOSED bug and therefore the kind that looks like the feature working — `06-F33` requires
 * the refusal to NAME the items so a customer can take the unavailable one out of her cart, and
 * she was getting *"this request was refused"* instead. §C of `refusal.test.ts` caught it because
 * it asserts on the response BYTES; §A alone, over the shipped formatter, passed throughout.
 *
 * Bounded depth: a cause chain is caller-supplied data at the far end, and an unbounded walk over
 * a cycle is a hang on the refusal path (`01-F17`).
 *
 * Total by construction — there is no input for which this returns something the allowlist did not
 * hand it: a thrown string, `null`, a plain object with a `message` field, all reach the neutral
 * sentence.
 */
export const publicMessage = (error: unknown): string => {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current !== null && current !== undefined; depth += 1) {
    for (const authored of CUSTOMER_AUTHORED) {
      if (current instanceof authored) return current.message;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return NEUTRAL_REFUSAL;
};

/**
 * `06-F37` (a) — the shape a public error is serialized as.
 *
 * `stack` is absent, and `path` — the procedure name — goes with it: it is the last field that
 * tells a prober which door it reached. The `code`/`httpStatus` in `data` stay exactly as tRPC
 * computed them, because `06-F37` (c) leaves the STATUS taxonomy owed to `apps/storefront` and
 * changing it here would be inventing the policy this FR declines to invent.
 */
export const publicErrorShape = (input: {
  readonly shape: { readonly code: number; readonly data: Record<string, unknown> };
  readonly error: unknown;
}): { code: number; message: string; data: Record<string, unknown> } => {
  const { stack: _stack, path: _path, ...data } = input.shape.data;
  return {
    code: input.shape.code,
    message: publicMessage(input.error),
    data,
  };
};
