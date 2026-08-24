import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { type Capability, STOREFRONT_CAPABILITY } from "./entitlement.js";
import type { createPlacement } from "./placement.js";

/**
 * `06-F32` — **the storefront's own tRPC host, and why it is not `services/api`.**
 *
 * `18 §6` puts this module on the cloud plane, whose data layer is tRPC + TanStack Query, and
 * that part carries over unchanged. What does not carry over is the gate: the cloud plane's
 * assumes an authenticated subject with a role, and a customer has neither. `services/api`
 * additionally holds its public-procedure set at exactly one behind a boot assertion and a
 * tripwire test (`signup-admission.test.ts`), and widening that set to admit a public ordering
 * surface would retire the one mechanism defending it.
 *
 * So this service exists, with `18 §6`'s data layer and its own boot assertion. `services/api`'s
 * public set is untouched at one.
 *
 * ⚠ `18 §6` is owed a clause naming this arrangement — a third plane, or an explicit statement
 * that a public no-subject surface sits on the cloud plane with an entitlement gate. `06-F32`
 * records the debt; until it is paid a session reading `18 §6` alone finds two planes and no
 * home for this one.
 */

export type StorefrontContext = {
  /**
   * Resolved from the HOST (`06-F1`/`06-F34` (a)), never from the request body — `server.ts`'s
   * `orgForHost`, called by the `createContext` the tRPC mount is registered with.
   *
   * ⚠ This comment said *"See `server.ts`"* while `server.ts` contained no host resolution of any
   * kind and mounted no transport at all, so the sentence documented an intention. It is a claim
   * with a call site now, and `server-seam.test.ts` §B drives an unknown `Host` through real HTTP.
   */
  readonly org_id: string;
  readonly placement: ReturnType<typeof createPlacement>;
};

type StorefrontMeta = { readonly entitlement?: Capability };

const t = initTRPC.context<StorefrontContext>().meta<StorefrontMeta>().create();

/**
 * The declaration half of `06-F32`. Every procedure built through this helper stamps
 * `meta.entitlement`, so "does this procedure name a capability" is a FACT the boot assertion can
 * read rather than a reviewer's recollection — the same shape as `services/api`'s `authorized()`.
 *
 * ⚠ It does NOT check entitlement. It cannot: entitlement is a per-org runtime fact (`28-F5`) and
 * a procedure definition has no org. `placement.ts` performs the resolution. `28-F4`'s closing
 * bullet is the authority for keeping the two apart, and `entitlement-gate.test.ts` §C is the
 * assertion that both actually happen — a build with only this half looks complete and checks
 * nothing.
 */
const entitledProcedure = (capability: Capability) => t.procedure.meta({ entitlement: capability });

/**
 * ⚠ **The exemption list, and every member needs a reason in this comment.**
 *
 * `health` names no capability because it resolves no org: it answers whether the process is up,
 * which is the deployment's question and not a tenant's. It reads and writes nothing tenant-
 * scoped, which is the property that makes the exemption safe — and is exactly the property the
 * boot assertion cannot check for itself.
 */
export const ENTITLEMENT_EXEMPT = new Set<string>(["health"]);

/**
 * ⚠ **THERE IS NO PRICE FIELD HERE, AND ITS ABSENCE IS THE POINT (`06-F33`).**
 *
 * This schema declared `unit_price_paisa` and the origin wrote it into `order.line_added`
 * verbatim, so the customer set the price: reproduced as a Rs 450 burger reaching a cashier's
 * `02-F9` inbox at **1 paisa** (`0` was accepted too), where her only action is Accept and
 * `01-F1` makes it permanent. `06-F6` binds the price to the catalog; `01-F60` keys it per
 * `(branch, channel)` with no fallback; the origin resolves it (`catalog.ts`).
 *
 * The field is **unrepresentable**, not validated — a price that can be sent and is then compared
 * is a price a later session trusts, and the comparison is one refactor from being dropped.
 * `z.object` also STRIPS unknown keys, so a body that still carries the old field loses it here
 * rather than carrying it one layer deeper.
 *
 * ⚠ **THE CITATION HERE WAS WRONG AND IS CORRECTED (`06-F35` review).** It read *"`entitlement-
 * gate.test.ts` §D pins both halves"*; §D is three `CrossTenantError` tests and contains no price
 * assertion at all. Both halves are pinned in **`price-authority.test.ts` §A** — the parsed line's
 * keys are exactly `item_id, line_id, qty` (absence) and a 1-paisa body becomes the catalog's
 * Rs 450 line end to end (the strip). `entitlement-gate.test.ts` §C pins the same STRIP property
 * for a smuggled `org_id`. Both protections were real; the pointer sent the next reader to the
 * wrong file, which is how a live assertion gets written twice or not at all.
 */
const CartLineInput = z.object({
  line_id: z.string().min(1),
  item_id: z.string().min(1),
  // `00 §6` — integer units. Stated at the edge so a float never reaches the origin, where
  // `parseEvent` would refuse it one layer deeper and with a worse message.
  qty: z.number().int().positive(),
});

export const storefrontRouter = t.router({
  health: t.procedure.query(() => ({ ok: true })),

  /**
   * ⚠ **AND THERE IS NO `order_id` HERE EITHER, WHICH IS `06-F35` AND THE SAME LESSON ONE FIELD
   * OVER.** This schema declared `order_id: z.string().min(1)` and the origin — which holds no
   * state and reads none — emitted `order.created` plus a line per request for whatever id the
   * body named. Reproduced over real HTTP into a real device fold: `web-1` placed, a cashier
   * accepted it, and a second anonymous request naming `web-1` put **20 × Rs 450 on the confirmed
   * bill**, with no anomaly, the kitchen told to cook it, and `01-F1` to keep it. `06-N4` names
   * *"id guessing"* as a probe that must return nothing.
   *
   * `06-F33` made *naming a price* unrepresentable and this makes *naming an order*
   * unrepresentable: the origin mints the id and the response returns it. What that does NOT buy
   * is the cancel door below — see `06-F35` (c), which decides that gap rather than leaving it
   * silent.
   */
  placeOrder: entitledProcedure(STOREFRONT_CAPABILITY)
    .input(z.object({ lines: z.array(CartLineInput).min(1) }))
    // `ctx.org_id`, never `input.org_id`: `06-F1` resolves the tenant from the host, and an
    // org taken from a public request body is a cross-tenant write with a form field for a key.
    .mutation(({ ctx, input }) => ctx.placement.place(ctx.org_id, input)),

  /**
   * ⚠ **THIS ONE STILL NAMES AN ORDER, AND `06-F35` (c) IS WHY — IT IS A DECIDED RESIDUAL, NOT AN
   * OVERSIGHT.** A cancel has to name the order it cancels, and this service can prove neither
   * that the order is the caller's (no customer session: `06-F12`) nor that the branch has not
   * already confirmed it (no branch slice: `06-F30`). `placeOrder`'s mint removes the
   * enumeration attack — an order id is unguessable now — and leaves a holder-of-the-id able to
   * cancel late, plus inert junk rows for ids never issued. **Do not "fix" this with a guess:**
   * the two owed pieces are named in `06-F35` (c) and both belong to the customer surface.
   */
  cancelOrder: entitledProcedure(STOREFRONT_CAPABILITY)
    .input(z.object({ order_id: z.string().min(1), reason: z.string().min(1) }))
    .mutation(({ ctx, input }) => ctx.placement.cancel(ctx.org_id, input)),
});

export type StorefrontRouter = typeof storefrontRouter;

/**
 * `06-F32` mechanism (i), enforced at BOOT rather than only in a test — `services/api`'s
 * `assertEveryProcedureIsGated` one service over, and for its stated reason: a test catches a
 * missing gate on the day someone runs the suite; this catches it on the day the service tries
 * to serve.
 *
 * Takes the router as a parameter so the FAILING case is reachable. A check that can only ever be
 * pointed at the one correct router is a check nothing has verified — `services/api` records that
 * lesson and it is copied deliberately.
 */
export const assertEveryProcedureDeclaresEntitlement = (target: {
  _def: { procedures: Record<string, unknown> };
}): void => {
  const undeclared = Object.entries(target._def.procedures)
    .filter(([name]) => !ENTITLEMENT_EXEMPT.has(name))
    .filter(([, procedure]) => {
      const meta = (procedure as { _def?: { meta?: StorefrontMeta } })._def?.meta;
      return meta?.entitlement === undefined;
    })
    .map(([name]) => name);

  if (undeclared.length === 0) return;
  throw new Error(
    `06-F32 / 28-F4: these storefront procedures declare no entitlement capability and are on ` +
      `no exemption list: ${undeclared.join(", ")}. Build them with an entitled procedure, or ` +
      `add the name to ENTITLEMENT_EXEMPT with a reason. Note that DECLARING is not CHECKING — ` +
      `the runtime resolution lives in placement.ts and this assertion cannot see it.`,
  );
};
