/**
 * **`28-F15` — A PUBLIC SIGNUP SURFACE MAY NOT SHIP WITHOUT A NAMED ADMISSION CONTROL.**
 *
 * AUTHORSHIP: authored from spec text ONLY, by a session that wrote no implementation (`24 §3`).
 * Read together with `services/sync-gateway/src/__acceptance__/signup.test.ts`, which owns the
 * signup ACT; this file owns the one thing that act must NOT acquire on the tenant plane.
 *
 * ── PROVENANCE ─────────────────────────────────────────────────────────────────────────────────
 *
 *   · `28-F15` (`specs/28-tenancy.md:143`) — "A PUBLIC SIGNUP SURFACE DOES NOT SHIP WITHOUT A NAMED
 *     ADMISSION CONTROL, AND THIS DOCUMENT DOES NOT PICK ONE. The requirement is that one exists
 *     and is named in the spec before the surface exists; the choice is a founder decision
 *     (§9.6)." And the reason, measured rather than argued: "Today the corpus has exactly one
 *     unauthenticated procedure (login) and no verification, invite or reset flow. Signup would be
 *     the second, and it mints an `org_id` that `01-F68` says can never be reused, in a pooled
 *     deployment that has no quota of any kind … **Every junk org is therefore permanent**, and it
 *     shares a database, a Redis and the serving processes with real tenants."
 *   · `28 §9.6` — the four candidates, undecided: "an invite code issued by the vendor; email
 *     verification before the org is created; a vendor approval step between form and creation; a
 *     rate limit on creation per source. Each has a different failure mode and one of them must be
 *     chosen before the surface is built, not after."
 *   · `28-F4` — "The login procedure — the corpus's one public one — is unauthenticated: there is
 *     no subject, therefore no org, therefore an entitlement gate on it is structurally
 *     impossible"; the shipped `PUBLIC_PROCEDURES` and `SESSION_ONLY_PROCEDURES` sets are the
 *     exemption list's "starting point".
 *   · `router.ts`'s own words: "The two exemption lists below are load-bearing … Adding a name to
 *     either list is therefore a visible, reviewable diff."
 *   · Founder ruling **R40** — signup "BLOCKS LAUNCH … with nobody touching a terminal"; **R17**.
 *
 * ── ⚠ WHY THIS IS A TRIPWIRE AND WHAT CLEARS IT ────────────────────────────────────────────────
 *
 * R40 and `28-F15` pull in opposite directions and **both are binding**: the path must become
 * self-serve, and the public end of it may not ship until a founder answers `28 §9.6`. The single
 * most likely way that gets resolved by accident is one line — a session reads R40, adds
 * `signup.create` to `PUBLIC_PROCEDURES`, and nothing in this repo notices; `pnpm verify` is exit 0
 * and `seams:check` is clean, because a public procedure is neither an unreached export nor an
 * unsupplied seam.
 *
 * So this file is deliberately a tripwire, and it is written to bite **when its blocker clears**
 * rather than to go quiet then — AGENTS.md records the opposite failure ("a tripwire that stayed
 * vacuous after its blocker cleared") and this is its mirror. **What clears it:** a founder ruling
 * recorded where it can be cited (a `plans/saas-pivot/plan-of-record.md` §0 row or a
 * `specs/DECISIONS.md` row — `28 §9.20` already owes one for the ruling doc 28 itself is written
 * against), and an FR naming the control. The change that lands the public procedure amends §A here
 * **in the same commit**, citing that ruling. Amending it without one is the act this file exists
 * to make visible.
 *
 * ── ⚠ TWO OF THAT CONDITION'S THREE PARTS ARE NOW MET (amended August 2026, prose only) ──────────
 *
 * This file was authored at `f90be00`, whose parent is `deea54d` — "R46–R49" — so the rulings were
 * already in the tree and the paragraphs above and below record their questions as open anyway.
 * Corrected here by the file's owner rather than by an implementer (`24 §3`, `24-F5`), and **no
 * assertion moves**: §A is still true of the tree, which is the whole point of a tripwire.
 *
 *   · **The ruling exists and is citable: R46**, `plans/saas-pivot/plan-of-record.md` §0 — the
 *     admission control is **a vendor invite code**, chosen because it is "the only option that
 *     needs no outbound-mail capability".
 *   · **The FR naming the control exists: `28-F23`.** `28-F15`'s "THIS DOCUMENT DOES NOT PICK ONE"
 *     is struck in that FR and §9.6 is closed there. `28-F23` closes with a paragraph naming **this
 *     file, by path**, quoting its release condition back at it and stating that "R46's §0 row is
 *     the first half, this FR is the second, and the third is that commit".
 *   · **The third part has NOT happened and is what this file still guards**: the commit that lands
 *     the public procedure and amends §A citing both. Until then the tenant plane still has exactly
 *     one public door and §A still measures it. ⚠ **What the cleared blocker changes is the SHAPE of
 *     the amendment, not whether one is owed** — `28-F24` and `14-F42` both require the boot
 *     assertion to learn a **list** rather than take a widened default, because R47 adds a *second*
 *     unauthenticated route (the redemption surface) beside the signup act's own. So the change
 *     that lands them moves §A's expectation to a named set of three, and a diff that instead
 *     loosens the assertion to "contains `auth.login`" is the act this tripwire exists to catch.
 *
 * ── ⚠ WHAT THIS FILE DOES NOT ASSERT ───────────────────────────────────────────────────────────
 *
 *   · **Which admission control is right.** `28-F15` refuses to pick and so does this file. It also
 *     does not assert a rate limit, an invite-code shape or a verification token — each would be
 *     the invention `28 §9.6` exists to prevent (commandment 2). ⚠ **The KIND is picked now (R46 /
 *     `28-F23`: a vendor invite code) and this clause still binds unchanged**, because `28-F23`
 *     says in terms that the code's format, length and TTL are "NOT decided here and must not be
 *     invented at a keyboard" and that its issuing surface is **owed to doc 15** (§9.27). A
 *     tripwire that asserted a code's shape would be inventing the half the ruling left open.
 *   · **Where the public surface is HOSTED** (`28 §9.26`): "The back office is a tenant-plane app
 *     whose every screen sits behind `14-F1`'s auth gate, so a public unauthenticated route inside
 *     it is a new posture rather than a new page; a separate app is a workspace nobody has scoped."
 *     This file constrains only the tRPC plane, which is where a procedure would land.
 *   · **The credential's delivery** (`28 §9.21`) — no document in the corpus owns an outbound-mail
 *     capability, so the screen this surface would serve cannot hand the owner her secret. That is
 *     a second, independent founder decision and it is stated in the gateway suite's header.
 *     ⚠ **RULED — R47 / `28-F24`, August 2026, and this clause was already stale when written.**
 *     The act mints a **single-use, expiring redemption token** and the owner sets her own password
 *     on `14-F42`'s surface, handed over in the session she is already in, so no outbound mail is
 *     needed. **`28 §9.21` survives narrowed to RECOVERY**, which nothing in this corpus answers.
 *     Two consequences land on THIS plane and neither is asserted here yet: the redemption surface
 *     is **unauthenticated by construction** (she has no session — that is the point), so it is a
 *     second public route beside `auth.login`; and `28-F24` requires the fail-open direction to be
 *     refused by hand — *no credential set must never read as no credential required* — which is an
 *     assertion on the login path this file does not own. The gateway suite's header carries the
 *     same correction against its own §E.
 */

import { hashPin } from "@restos/domain";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
/**
 * `appRouter` is imported so §A3 points at the SHIPPED router. `assertEveryProcedureIsGated` takes
 * its target as a parameter precisely so "the failing case is reachable" (`router.ts`) — which also
 * makes it possible to point the assertion at a router nobody serves. A test that rebuilt the
 * router here would assert that its own construction is gated, which is true of any construction
 * and evidence about none.
 */
import {
  appRouter,
  assertEveryProcedureIsGated,
  PUBLIC_PROCEDURES,
  SESSION_ONLY_PROCEDURES,
} from "../router.js";
import { createApiServer } from "../server.js";
import { publicProcedure, router, sessionProcedure } from "../trpc.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";

const SECRET = "28-f15-admission-control-tripwire-session-secret";
const PASSWORD = "correct horse battery staple";
const ORG = "org-admission-tripwire";
const OWNER = "user-admission-owner";
const OWNER_EMAIL = "owner@admission.test";

const T0 = 1_786_039_200_000;

type Rpc = { status: number; body: Record<string, unknown> };

let app: Awaited<ReturnType<typeof createApiServer>>;

const post = async (path: string, input: unknown): Promise<Rpc> => {
  const res = await app.inject({
    method: "POST",
    url: `/trpc/${path}`,
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(superjson.serialize(input)),
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
};

const get = async (path: string, input: unknown): Promise<Rpc> => {
  const serialised = encodeURIComponent(JSON.stringify(superjson.serialize(input)));
  const res = await app.inject({ method: "GET", url: `/trpc/${path}?input=${serialised}` });
  return { status: res.statusCode, body: JSON.parse(res.body) as Record<string, unknown> };
};

beforeAll(async () => {
  const users: UserRecord[] = [
    {
      user_id: OWNER,
      org_id: ORG,
      email: OWNER_EMAIL,
      display_name: "Ayesha Khan",
      password_hash: await hashPin(PASSWORD),
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
  ];
  app = await createApiServer({
    store: createMemoryUserStore(users),
    sessionSecret: SECRET,
    now: () => T0,
  });
}, 120_000);

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §A — THE TRIPWIRE
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§A — the tenant plane has exactly one unauthenticated door (28-F15, 28-F4)", () => {
  it("`PUBLIC_PROCEDURES` still names only `auth.login` — no signup surface has shipped", () => {
    // ⚠ READ THE HEADER BEFORE CHANGING THIS LINE. `28-F15` makes a public signup procedure
    // conditional on a founder answering `28 §9.6`, and R40 makes the answer urgent. This assertion
    // is the only thing in the repo that would notice the condition being skipped: adding a name
    // here is a one-line diff that `pnpm verify` and `pnpm seams:check` are both blind to.
    //
    // The change that lands the public procedure edits this expectation **in the same commit**, and
    // cites the recorded ruling and the FR that names the control. If you are here because this
    // test is in your way and you cannot find such a ruling, that is the finding, not the test.
    expect([...PUBLIC_PROCEDURES].sort()).toEqual(["auth.login"]);
  });

  it("`SESSION_ONLY_PROCEDURES` is unchanged too — a signup behind a session is not a signup", () => {
    // The obvious way round §A1: gate the procedure on a session and call it "onboarding". It would
    // be neither — `28-F13` creates the org's FIRST user, so there is by construction no subject to
    // hold a session, and the list's own charter is "procedures reading the CALLER'S OWN identity".
    expect([...SESSION_ONLY_PROCEDURES].sort()).toEqual(["session.whoami"]);
  });

  it("every procedure the router exposes is gated or exempt — so nothing lands unnamed", () => {
    // The third route in: build the procedure with neither `authorized(...)` nor a list entry. The
    // boot gate already refuses that, and this pins the gate to THIS router so §A1 and §A2 together
    // close the set: a signup procedure can reach this plane only by being gated (impossible — no
    // subject exists at signup, `28-F4`) or by moving one of the two lists above.
    expect(() => {
      assertEveryProcedureIsGated(appRouter);
    }).not.toThrow();
  });

  it("CONTROL — the boot gate really does throw for an ungated procedure", () => {
    // Without this, §A3 passes against a gate that returns unconditionally, and the closure
    // argument above evaporates.
    const smuggled = router({
      create: publicProcedure.mutation(() => ({ org_id: "minted-by-a-stranger" })),
      alsoUngated: sessionProcedure.query(() => ({ ok: true })),
    });
    expect(() => {
      assertEveryProcedureIsGated(smuggled);
    }).toThrow(/Commandment 8/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §B — THE CONTROL THE TRIPWIRE RESTS ON
//
// `01-F71`'s warning generalised: an assertion about a set proves nothing if the set is dead. §A is
// about which procedures answer without a credential, so §B proves that "public" and "not public"
// are observably different on this host.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§B — public and non-public are observably different, so §A is about a live set", () => {
  it("`auth.login` answers an unauthenticated request — the one door that is meant to be open", async () => {
    const res = await post("auth.login", { email: OWNER_EMAIL, password: PASSWORD });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const data = superjson.deserialize(
      (res.body as { result: { data: unknown } }).result.data as never,
    ) as { token: string };
    expect(typeof data.token).toBe("string");
  });

  it("a wrong credential on that same door is refused, and refused identically to an unknown one", async () => {
    // `router.ts`'s recorded reason: "Distinguishing 'no such account' from 'wrong password' turns
    // the login endpoint into an account enumerator." On a pooled deployment with self-serve signup
    // that enumerator answers "does this restaurant have an account here" to anyone — which is the
    // `01-F71` disclosure the gateway suite's §F asserts for the signup refusal, one door over.
    const wrongPassword = await post("auth.login", { email: OWNER_EMAIL, password: "nope" });
    const unknownAccount = await post("auth.login", {
      email: "nobody@admission.test",
      password: PASSWORD,
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(unknownAccount.body).toEqual(wrongPassword.body);
  });

  it("every other procedure refuses an unauthenticated request", async () => {
    // If this passed for a procedure NOT on `PUBLIC_PROCEDURES`, §A's list would be describing
    // something other than what the host actually serves.
    for (const [path, input] of [
      ["session.whoami", {}],
      ["catalog.published", {}],
      ["tenancy.directory", {}],
    ] as const) {
      const res = await get(path, input);
      expect(res.status, `${path} answered an unauthenticated request`).not.toBe(200);
    }
  });
});
