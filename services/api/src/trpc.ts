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
import { verifySessionToken } from "./session.js";
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
      if (!(cause instanceof AuthzRefusal)) return shape;
      return { ...shape, data: { ...shape.data, authz: cause.authz } };
    },
  });

export const router = t.router;
export const publicProcedure = t.procedure;

/** What the session middleware adds: the server's own answer to "who is this". */
type SubjectContext = ApiContext & { readonly subject: AuthSubject };

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
  return next({ ctx: { ...ctx, subject } satisfies SubjectContext });
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
