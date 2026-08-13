/**
 * The root router. B-2 ships the HOST, so what is here is login, the session echo the back-office
 * shell needs (B-5), and one placeholder per authorization shape — enough to prove the middleware
 * works and no more (`24-F23`). The catalog router is B-3 and the publish path is B-4.
 *
 * **The two exemption lists below are load-bearing.** They are exported so the suite can walk
 * every procedure the router exposes and assert that everything outside them refuses both an
 * unauthenticated request and an authenticated one holding no assignment. That walk finds a
 * procedure that forgot `authorized(...)` — this wave's recurring defect — on a procedure nobody
 * has written yet. Adding a name to either list is therefore a visible, reviewable diff.
 */

import { verifyPin } from "@restos/domain";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { catalogProcedures } from "./catalog-router.js";
import { deviceProcedures } from "./device-router.js";
import { issueSessionToken } from "./session.js";
import { summaryProcedures } from "./summary-router.js";
import {
  type ApiMeta,
  authorized,
  publicProcedure,
  router,
  scopeInput,
  sessionProcedure,
} from "./trpc.js";

/** Reachable with no credential at all. Exactly one, and it is how you get a credential. */
export const PUBLIC_PROCEDURES: ReadonlySet<string> = new Set(["auth.login"]);

/**
 * Authenticated but not matrix-gated: they read the caller's OWN identity, which is not an
 * `01 §4` action and has no Appendix A row. Inventing one to gate them would be inventing policy
 * (Commandment 2).
 */
export const SESSION_ONLY_PROCEDURES: ReadonlySet<string> = new Set(["session.whoami"]);

const loginInput = z.object({ email: z.string(), password: z.string() });

const authRouter = router({
  /**
   * Founder ruling (`dac8747`): email + password, Argon2id, ours. The hash is verified by
   * `domain`'s `verifyPin` — `01-F26` keeps the hashing story single, so this service adds no
   * second binding and no second parameter set.
   *
   * ⚠ **OWED, and named as owed in `backoffice-catalog.md` Q2:** lockout and rate limiting on
   * this endpoint, password reset, session rotation and revocation, and the `audit.login` record
   * `01-F5` already has a subtype for. Each is a way in and each is scoped as its own task. What
   * is here is the credential check and nothing else.
   */
  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const user = await ctx.store.findByEmail(input.email);
    // One refusal for both halves. Distinguishing "no such account" from "wrong password" turns
    // the login endpoint into an account enumerator, which matters more here than usual because
    // the rate limiting that would blunt it is the owed work above.
    const refused = new TRPCError({ code: "UNAUTHORIZED", message: "invalid email or password" });
    if (user === null) throw refused;
    if (!(await verifyPin(user.password_hash, input.password))) throw refused;

    return { token: await issueSessionToken(user.user_id, ctx.sessionSecret, ctx.now()) };
  }),
});

const sessionRouter = router({
  /**
   * Who the SERVER says you are. The shell (B-5) needs this to render at all, and it is the one
   * place assignments cross to a client — as a description of the caller, never as an input that
   * comes back. `org_id` is the subject's, so a request stating another org changes nothing.
   */
  whoami: sessionProcedure.query(({ ctx }) => ({
    user_id: ctx.subject.user_id,
    org_id: ctx.subject.org_id,
    assignments: ctx.subject.assignments,
  })),
});

/**
 * PLACEHOLDER (`24-F23`: B-2 is the host, not the routers). Two procedures, chosen because their
 * Appendix A rows differ in the way that matters: `catalog.edit_menu_prices` is owner-only, so it
 * exercises a plain `deny`; `order.void_after_kot` is `allow` for a branch manager at her own
 * branch and `escalate` for a cashier, so it exercises both the per-location scope and the third
 * outcome.
 *
 * **B-3 did NOT replace `editMenuPrices`, and the original note here saying it would was wrong**
 * about what it is for. It is not a stand-in for the catalog router; it is the B-2 suite's
 * authorization FIXTURE, used by fifteen assertions that prove a role claim in a body, a header
 * and a signed token all fail to move the verdict. Deleting it would delete that coverage. The
 * real catalog procedures are mounted BESIDE it below.
 */
const echo = (action: string) =>
  scopeInput.transform((input) => ({ branch_id: input.branch_id ?? null, action }));

const catalogRouter = router({
  editMenuPrices: authorized("catalog.edit_menu_prices")
    .input(echo("catalog.edit_menu_prices"))
    .mutation(({ ctx, input }) => ({ ...input, org_id: ctx.subject.org_id })),
  // B-3 + B-4 — the real catalog read/write surface and the publish path. Every one of them is
  // built with `authorized(...)`, so `assertEveryProcedureIsGated` below sees them all.
  ...catalogProcedures,
});

const opsRouter = router({
  voidAfterKot: authorized("order.void_after_kot")
    .input(echo("order.void_after_kot"))
    .mutation(({ ctx, input }) => ({ ...input, org_id: ctx.subject.org_id })),
});

/**
 * `14-F12` + `14-F13`, gated on `14-F30`'s `device.manage`. Both procedures are built with
 * `authorized(...)`, so `assertEveryProcedureIsGated` sees them and neither exemption list changed.
 */
const deviceRouter = router(deviceProcedures);

/**
 * `12-F9`/`12-F10` — the nightly owner summary, gated on Appendix A's `View sales reports` row.
 * Built with `authorized(...)` like everything else, so `assertEveryProcedureIsGated` sees it and
 * **neither exemption list changed**: a day's takings are not the caller's own identity, and
 * putting a sales report on `PUBLIC_PROCEDURES` needs no explanation.
 */
const summaryRouter = router(summaryProcedures);

export const appRouter = router({
  auth: authRouter,
  session: sessionRouter,
  catalog: catalogRouter,
  devices: deviceRouter,
  summary: summaryRouter,
  ops: opsRouter,
});

export type AppRouter = typeof appRouter;

/**
 * **The seam, enforced at BOOT rather than only in a test.**
 *
 * `authorized()` stamps `meta.authz` on every procedure it builds, so "does this procedure pass
 * through `can()`" is a fact rather than a reviewer's recollection. This walks the router and
 * refuses to start if any procedure outside the two lists above lacks that stamp.
 *
 * It exists because a test alone is the wrong shape for this wave's recurring defect: a test
 * catches a missing gate on the day someone runs the suite, and this catches it on the day the
 * service tries to serve. `createApiServer` calls it, so a host that would answer an unauthorized
 * request cannot come up at all.
 *
 * Takes the router as a parameter so the failing case is reachable — a check that can only ever
 * be pointed at the one correct router is a check nothing has verified.
 */
export const assertEveryProcedureIsGated = (target: {
  _def: { procedures: Record<string, unknown> };
}): void => {
  const ungated = Object.entries(target._def.procedures)
    .filter(([name]) => !PUBLIC_PROCEDURES.has(name) && !SESSION_ONLY_PROCEDURES.has(name))
    .filter(([, procedure]) => {
      const meta = (procedure as { _def?: { meta?: ApiMeta } })._def?.meta;
      return meta?.authz === undefined;
    })
    .map(([name]) => name);

  if (ungated.length === 0) return;
  throw new Error(
    `18 §5 / Commandment 8: these procedures pass through no can() check and are on no ` +
      `exemption list: ${ungated.join(", ")}. Build them with authorized(<action>), or add the ` +
      `name to PUBLIC_PROCEDURES / SESSION_ONLY_PROCEDURES with a reason.`,
  );
};
