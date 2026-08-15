/**
 * The tRPC host's context and its authorization middleware — Commandment 8 on the cloud plane.
 *
 * `18 §5` names exactly one authorization consumer: "Authorization is a single
 * `can(user, action, scope)` helper generated from the `domain` permission matrix — inline role
 * checks are banned." Everything in this file exists to make that single call reachable and to
 * make routing around it impossible. There is no role name anywhere below `SUBJECT`; the only
 * verdict is `can`'s.
 *
 * Three decisions that are not obvious, each with the alternative that was rejected:
 *
 * 1. **The subject is looked up per request, from the store.** `01-F27` puts server-side
 *    authorization on "every API/sync operation" — not at login. The rejected alternative is the
 *    ordinary one: put the roles in the session token and read them from the claims. That is
 *    faster, needs no store on the hot path, and is a Commandment 8 violation with a valid
 *    signature on it — a role stripped from a manager would keep working until her token expired.
 *
 * 2. **`escalate` is a REFUSAL here.** `can()` is three-valued (`02-F20`), and on this plane the
 *    third value has no reachable resolution: `02-F20`'s escalation is "local manager PIN on the
 *    POS; remote approval via manager console; first response wins", and a back-office tRPC
 *    procedure is neither. Treating it as `allow` would grant, with no second credential,
 *    precisely the acts the matrix says need one. It is refused with its own outcome and with the
 *    decision's `satisfied_by`, so a client can route to the console instead of showing "denied" —
 *    collapsing it into a bare `deny` would delete `02-F20`'s entry point, which is the other half
 *    of the defect `AuthOutcome` is three-valued to avoid.
 *
 * 3. **`org_id` comes from the subject, `branch_id` from the request.** `01-F26` is per-location,
 *    so the scope has to be carried or a manager authorized at branch A passes at branch B. But
 *    `org_id` is not a scope the caller may state: it is who they are. A missing or unusable
 *    `branch_id` resolves to `null`, which is the NARROW direction — `rolesAt` matches only
 *    org-wide assignments against a `null` branch, so a branch-scoped subject is refused rather
 *    than widened. That is the opposite of `01-F60`'s optional-completeness trap, where the
 *    default skipped a check.
 */

import { type AuthDecision, type AuthSubject, can, type PermissionAction } from "@restos/domain";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";
import type { DeviceDirectory } from "./devices.js";
import { IntegrationError } from "./errors.js";
import type { DayLedger } from "./ledger.js";
import type { CatalogRuntime } from "./publish.js";
import { verifySessionToken } from "./session.js";
import type { TenancyDirectory } from "./tenancy.js";
import type { UserStore } from "./users.js";

/**
 * What a request arrives with. `bearer` is the raw credential and nothing else from the wire is
 * trusted — no role header, no org header, no actor id.
 */
export type ApiContext = {
  readonly store: UserStore;
  readonly sessionSecret: string;
  /** `18 §4` — the clock is injected at the composition root; nothing here reads one. */
  readonly now: () => number;
  readonly bearer: string | null;
  /**
   * B-3/B-4. Required, not optional: `createApiServer` always resolves one, so no procedure has
   * to ask whether the catalog path exists — the shape this wave's "unsupplied seam" defect takes
   * is exactly an optional dependency that every call site forgets.
   */
  readonly catalog: CatalogRuntime;
  /**
   * `14-F12`/`14-F13`. Required for `catalog`'s reason, and one sharper: the fallback
   * `createApiServer` resolves when a host declares none REFUSES every call rather than answering
   * emptily, so an unconfigured host cannot render a device list that says "no devices" or a revoke
   * that reports success. See `unconfiguredDeviceDirectory`.
   */
  readonly devices: DeviceDirectory;
  /**
   * `12-F10`. Required for `catalog`'s reason and one sharper: the fallback `createApiServer`
   * resolves REFUSES every read rather than answering emptily, so an unconfigured host cannot
   * render `Rs 0 · 0 orders` over a day that took any amount at all. See `ledger.ts`.
   */
  readonly ledger: DayLedger;
  /**
   * `01-F68`/`01-F69`. Required for `catalog`'s reason and one sharper: the fallback
   * `createApiServer` resolves REFUSES every read rather than answering emptily, because
   * "unnamed org, no branches" is **the true answer for every tenant today** — so a stub here would
   * be indistinguishable from a correct implementation and would stay indistinguishable after
   * provisioning landed. See `unconfiguredTenancyDirectory`.
   */
  readonly tenancy: TenancyDirectory;
};

/**
 * The refusal's carrier. A subclass rather than a bare `cause` object because tRPC normalises an
 * unknown cause, and the decision has to survive intact to reach `errorFormatter`.
 */
export class AuthzRefusal extends Error {
  public readonly authz: AuthDecision;

  constructor(authz: AuthDecision) {
    super(`authorization ${authz.outcome}: ${authz.action}`);
    this.name = "AuthzRefusal";
    this.authz = authz;
  }
}

/**
 * What `authorized()` stamps on a procedure, and the ONLY reason meta exists here: it is what
 * makes "this procedure passes through `can()`" a fact the host can CHECK at boot rather than a
 * property a reviewer has to notice. See `assertEveryProcedureIsGated`.
 */
export type ApiMeta = { readonly authz?: PermissionAction };

const t = initTRPC
  .context<ApiContext>()
  .meta<ApiMeta>()
  .create({
    transformer: superjson,
    /**
     * Lift the decision onto the error shape. Without it every refusal looks the same from the
     * client, and `satisfied_by` — the field that exists so a screen does NOT hardcode "ask a
     * manager", which would be `18 §`'s banned inline check relocated into the UI — never arrives.
     */
    errorFormatter: ({ shape, error }) => {
      const cause = error.cause;
      if (cause instanceof AuthzRefusal) {
        return { ...shape, data: { ...shape.data, authz: cause.authz } };
      }
      /**
       * The same lift for `18 §5`'s other typed refusal. A client that has to read `retriable` out
       * of the MESSAGE is a client that breaks the day the message improves, and "which dependency"
       * is the question the back office could not answer at all while `"fetch failed"` was the whole
       * story. Both travel as data; the sentence stays for the human.
       */
      if (cause instanceof IntegrationError) {
        return {
          ...shape,
          data: {
            ...shape.data,
            integration: { dependency: cause.dependency, retriable: cause.retriable },
          },
        };
      }
      return shape;
    },
  });

export const router = t.router;

/**
 * **The API boundary, and where a transport failure stops being a 500.**
 *
 * `catalog.published` and `catalog.history` proxy to `services/sync-gateway`. With that peer down,
 * `gateway-client.ts` raises an `IntegrationError`; without this middleware tRPC would normalise it
 * to `INTERNAL_SERVER_ERROR` and hand the operator its message under a code that says *this service
 * is broken*. It is not: an unreachable peer is `18 §5`'s `IntegrationError`, and
 * `SERVICE_UNAVAILABLE` (HTTP 503) is what a caller — human or retry policy — can act on. `00 §5.7`:
 * report what is TRUE, which includes whose fault it is.
 *
 * **The cause is not swallowed** (`24-F15` catch-without-diagnose). Three things survive: the whole
 * chain goes to the log here, the `IntegrationError` stays as the `TRPCError`'s `cause` so
 * `errorFormatter` can lift `dependency`/`retriable`, and the sentence reaches the operator intact.
 *
 * Attached to `publicProcedure` so it is the OUTERMOST middleware on every procedure in the router,
 * including the unauthenticated ones — an error taxonomy that only applies to procedures someone
 * remembered to route through it is the "unsupplied seam" shape (AGENTS.md) wearing a new hat.
 */
const integrationBoundary = t.middleware(async ({ next, path, type }) => {
  /**
   * ⚠ **`next()` does NOT throw when the resolver does** — it resolves to `{ ok: false, error }`,
   * with the thrown value already normalised into a `TRPCError` whose `cause` is the original. A
   * `try/catch` around it therefore never fires, and the first draft of this middleware was exactly
   * that: it compiled, it read correctly, and it mapped nothing. The suite caught it only because
   * an assertion checked the resulting HTTP STATUS rather than the message, which arrived looking
   * perfect either way.
   */
  const result = await next();
  if (result.ok) return result;
  const integration = result.error.cause;
  if (!(integration instanceof IntegrationError)) return result;

  // Fastify's own logger is off in this host (`createApiServer`), so this is the log. The whole
  // error, not the sentence: the sentence omits the stack the operator cannot use and the engineer
  // on call needs.
  console.error(`[IntegrationError] ${type} ${path} → ${integration.dependency}`, integration);
  throw new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: integration.message,
    cause: integration,
  });
});

export const publicProcedure = t.procedure.use(integrationBoundary);

/**
 * What the session middleware adds: the server's own answer to "who is this".
 *
 * **`subject_display_name` sits BESIDE the `AuthSubject`, never inside it** (`11-F20`, `21-F15`).
 * `AuthSubject` is `packages/domain`'s authorization INPUT — `can()`, `reportScope` and `rolesAt`
 * read it — and a person's name is not an authorization fact. Putting it there would widen a
 * PROTECTED type for a rendering concern, and would invite the next reader to believe a name might
 * matter to a verdict; `11-F20` says the opposite in terms ("a name is NOT an identifier … two
 * people legitimately share one"). It is `null` when the store holds no name, which is
 * `21-F15`'s unnamed case and not an error — see `users.ts`.
 */
type SubjectContext = ApiContext & {
  readonly subject: AuthSubject;
  readonly subject_display_name: string | null;
};

/**
 * Authentication. Resolves the bearer to a user the STORE still has, and rebuilds the subject
 * from that record every time (`01-F27`).
 */
const withSession = t.middleware(async ({ ctx, next }) => {
  const unauthorized = new TRPCError({ code: "UNAUTHORIZED", message: "no valid session" });
  if (ctx.bearer === null) throw unauthorized;

  const claims = await verifySessionToken(ctx.bearer, ctx.sessionSecret, ctx.now());
  if (claims === null) throw unauthorized;

  // Every request, not just login. A user removed since the token was minted has no session,
  // and a user whose assignments changed is authorized against the NEW ones.
  const user = await ctx.store.findById(claims.user_id);
  if (user === null) throw unauthorized;

  const subject: AuthSubject = {
    user_id: user.user_id,
    org_id: user.org_id,
    assignments: user.assignments,
  };
  // Re-read every request alongside the assignments, for `01-F27`'s reason applied to a name: a
  // rename lands on the next request rather than at the next login, and nothing snapshots it.
  // `11-F20`: "names are resolved at RENDER TIME" — and a session token is not render time.
  return next({
    ctx: {
      ...ctx,
      subject,
      subject_display_name: user.display_name ?? null,
    } satisfies SubjectContext,
  });
});

/** Authenticated, not yet authorized. Every member of `SESSION_ONLY_PROCEDURES` builds on this. */
export const sessionProcedure = publicProcedure.use(withSession);

/**
 * The only `branch_id` reader. Unknown keys are STRIPPED, which is the point: a request carrying
 * `role`, `assignments` or `permissions` loses them here, before anything authorization-shaped
 * sees the input.
 */
const scopeShape = z.object({ branch_id: z.string().min(1).nullish() });

export const scopeInput = scopeShape;

/**
 * `null` for anything this cannot read — see decision 3 above. Fail-closed: `null` narrows the
 * matched assignments to org-wide ones, so a malformed scope refuses a branch-scoped subject
 * rather than admitting them somewhere unstated.
 */
const branchOf = (raw: unknown): string | null => {
  const parsed = scopeShape.safeParse(raw);
  return parsed.success ? (parsed.data.branch_id ?? null) : null;
};

/**
 * **The seam.** A procedure built with this passes through `can()`; a procedure built any other
 * way does not, which is why `PUBLIC_PROCEDURES` and `SESSION_ONLY_PROCEDURES` in `router.ts` are
 * enumerated and asserted rather than left to reviewer memory.
 */
export const authorized = (action: PermissionAction) =>
  sessionProcedure.meta({ authz: action }).use(async ({ ctx, next, getRawInput }) => {
    const decision = can(ctx.subject, action, {
      // Who they are — never an input (Commandment 8).
      org_id: ctx.subject.org_id,
      // Where — carried from the request, never assumed (`01-F26`).
      branch_id: branchOf(await getRawInput()),
    });

    if (decision.outcome === "allow") return next({ ctx: { ...ctx, decision } });

    // `deny` and `escalate` both refuse, and both say which they were.
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        decision.outcome === "escalate"
          ? `${action} needs an approval this plane cannot collect (02-F20)`
          : `${action} is not permitted`,
      cause: new AuthzRefusal(decision),
    });
  });
