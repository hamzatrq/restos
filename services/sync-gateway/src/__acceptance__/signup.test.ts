/**
 * **SELF-SERVE SIGNUP — THE ACT (`28-F12`/`28-F13`/`28-F14`, founder rulings R17 and R40).**
 *
 * AUTHORSHIP: authored from spec text ONLY, by a session that wrote no implementation and read no
 * implementation plan for this step (`24 §3`). Every policy below cites an FR that resolves
 * (`grep -arn "28-F13" specs/`). The session that implements against this file may not edit it
 * (`24-F5`); a test believed wrong is a finding for this file's owner, cited by FR id.
 *
 * ── PROVENANCE — read verbatim from the corpus, never from memory ───────────────────────────────
 *
 *   · `28-F13` (`specs/28-tenancy.md:123`) — "ONE SIGNUP ACT CREATES AN ORG AND ITS FIRST OWNER,
 *     AND IT REFUSES TO INVENT A BRANCH. The act creates exactly two records: the org (`01-F68`,
 *     `display_name` as typed, status `active` per `15-F25`) and one user carrying the org-wide
 *     assignment `{ role: owner, branch_id: null }`"; "The form collects exactly what those two
 *     records require and nothing more … **No branch, no tier, no plan, no channel**"; "The email
 *     uniqueness check runs BEFORE the `org_id` is minted"; "The two records are one act. If the
 *     owner cannot be created the org must not stand … Atomicity is enforced at the writer, not by
 *     a foreign key"; "The credential is `15-F26`'s … The step mints the secret itself and stores
 *     only an Argon2id hash at `01-F61`'s cost floor."
 *     ⚠ **THAT LAST CLAUSE AND THE FORM'S FIELD LIST HAVE BOTH BEEN AMENDED SINCE — see the
 *     "TWO RULINGS" block below. Read the quotations above as the Draft-1 text this suite was
 *     authored from, not as the current FR.**
 *   · `28-F14` — "THE SIGNUP ACT EMITS NO EVENT … At the instant the org is created the signer-up
 *     is not yet a user of any org … so `OrgEvent.actor_user_id` could only be `null`, permanently."
 *   · `28-F2` — "THE TENANT LIFECYCLE IS `15-F25`'s TWO STATES"; a pilot is **`active`**, and
 *     `trial`/`pending`/`onboarding` were each considered and refused.
 *   · `28-F5` (b) + `28 §7` — "Deliberately not configurable, ever: … a tenant-supplied org
 *     identifier on any request."
 *   · `28-F6` — "Nothing keys on a name. `01-F70` makes a device name a label and never an
 *     identifier; the same holds for org and branch names."
 *   · `28-F1`/`01-F71` — the tenancy key is `org_id`; isolation is absolute and fail-closed, and
 *     "each point carries a test that FAILS when that point alone is removed … the test must run
 *     two tenants and mutate the point under test."
 *   · `15-F26` (`specs/15-platform-admin.md:109`) — "The vendor never holds a restaurant's
 *     password"; "No org exists that nobody can administer"; "it mints an `org_id` that can never
 *     be reused (`01-F68`), so a mistaken provision is **abandoned, never recycled**."
 *   · `15-F27` — "A password is never an input. Not in an environment variable, not in `argv` …
 *     The step mints the initial secret itself, stores only an Argon2id hash at `01-F61`'s cost
 *     floor — the product's single hashing story (`01-F26`) — and emits the secret **once**";
 *     "Ordering is enforced at the WRITER, because the schema deliberately carries no foreign key."
 *   · `11-F20` — the person record's required minimum, inherited WHOLE: `user_id`, `org_id`,
 *     `display_name`, `01-F61`'s `grid_ordinal`, the assignment. `11-F22` — participation rides
 *     the ASSIGNMENT and is stated, never defaulted.
 *   · `01-F68` — the org record: `org_id` minted at provisioning and never reused; a required
 *     `display_name`; no foreign key to it from any table, ever.
 *   · `01-F69` — a branch requires a non-empty `display_name`, a `type` and a `class`.
 *   · `01-F61` — the Argon2id cost floor is a PARAMETER, never an elapsed time.
 *   · Founder ruling **R40** (`plans/saas-pivot/plan-of-record.md:59`) — "A restaurant signs itself
 *     up and reaches an org, a branch, an owner login and a device pairing code with nobody
 *     touching a terminal. … Retires `create-org.ts` as the onboarding path (it survives as an
 *     operator tool)." **R17**, **R35** (ISOLATION ⇒ FULL adversarial rounds), **R44**.
 *
 * ── ⚠ WHICH STEPS OF R40 HAVE NO SPECIFIED MECHANISM — THE REQUIRED STATEMENT ───────────────────
 *
 * R40 names four destinations. **The corpus specifies one of them and blocks the other three**, and
 * this suite asserts the one and asserts the REFUSALS that the blocks imply, rather than inventing
 * mechanisms for them (commandment 2). Each is a founder decision the plan must surface:
 *
 *   1. **the org + the owner — SPECIFIED.** `28-F13` decides the records, the fields, the
 *      ordering, the atomicity and the credential. That is what §A–§G assert.
 *   2. **the branch — REFUSED, not owed.** `28-F13`: "It does not create a branch, and that is a
 *      refusal rather than an omission" — `01-F69` needs a `display_name`, a `type` and a `class`,
 *      "three facts a signup form has not asked for". The first branch is `14-F26`'s wizard, which
 *      "does not exist in any form". §C asserts the refusal; nothing here builds the wizard.
 *   3. **the device pairing code — UNBUILDABLE.** `01-F25` (`specs/01-kernel-sync.md:58`) is one
 *      clause — "Registration is a one-time pairing via back office code" — with no format, TTL,
 *      rate limit or claim/refusal protocol anywhere in the corpus;
 *      `plans/saas-pivot/plan-of-record.md` A3 lists "`01-F25` pairing code specified for the
 *      first time" as an OWED amendment to doc 01. Writing one here would be inventing the policy
 *      that amendment exists to decide. **Nothing in this file asserts a pairing code, and no test
 *      may imply one exists.**
 *   4. **"with nobody touching a terminal" — BLOCKED AT THE PUBLIC SURFACE, TWICE.**
 *      (a) `28-F15`: "A PUBLIC SIGNUP SURFACE DOES NOT SHIP WITHOUT A NAMED ADMISSION CONTROL, AND
 *      THIS DOCUMENT DOES NOT PICK ONE" — the four candidates are listed in that FR and the choice
 *      is `28 §9.6`, a founder call. (b) `28 §9.21`: the minted credential has **no delivery
 *      channel** — `15-F26`'s set-credential link "still has no redemption surface", a password may
 *      not be an input (`15-F27`), and "**no document in this corpus owns an outbound-mail
 *      capability**". So the act as specified mints a credential that cannot be handed to the
 *      stranger who asked for it, and the same absence removes account recovery.
 *      The tripwire for (a) is `services/api/src/__acceptance__/signup-admission.test.ts`, which is
 *      the plane a public procedure would land on. This file asserts (b)'s **assertable half**
 *      only: the secret is minted by the writer, verifies against what was stored, and exists in no
 *      durable column (§E). How it reaches a human is not decided here and must not be invented.
 *      ⚠ **BOTH HALVES OF 4 ARE NOW RULED — the block immediately below supersedes this paragraph
 *      and is dated. It is retained verbatim rather than rewritten, on `28-F15`'s own precedent for
 *      its struck clauses: it is the text these assertions were authored from.**
 *
 * ── ⚠ TWO RULINGS LANDED BEFORE THIS SUITE AND ARE RECORDED HERE AS OPEN (amended August 2026) ───
 *
 * `f90be00` (this file) has `deea54d` — "R46–R49" — as its parent, so both rulings were in the tree
 * when this was authored, and the header cites R40/R17/R35/R44 off that same table while §4 above
 * records both of these questions as open. That is this repo's signature failure — **a green suite
 * defending an overruled rule** — caught in the window rather than a fortnight later, and it is
 * corrected here by the file's owner rather than by its implementer (`24 §3`, `24-F5`). **What is
 * corrected is the PROSE and two test titles; not one assertion is weakened, deleted or re-scoped**,
 * and each block below says why.
 *
 *   · **R46 / `28-F23` — THE ADMISSION CONTROL IS PICKED: a vendor invite code.** §4 (a)'s "THIS
 *     DOCUMENT DOES NOT PICK ONE" is struck in `28-F15` itself and §9.6 is closed there. Two
 *     consequences for this file, and **neither is an assertion today**: (i) `28-F13`'s form now
 *     collects a FOURTH input — "the org's `display_name`, the owner's `display_name`, the owner's
 *     email — and `28-F23`'s **invite code**, which is consumed by the writer as an admission input
 *     and stored on neither record" — so `freshRequest` sends three fields where the amended FR
 *     names four, and the day a writer requires a code **every `mustSignup` here goes red**. It is
 *     not added pre-emptively because `28-F23` says in terms that the code's format, length and TTL
 *     are "NOT decided here and must not be invented at a keyboard" and that its issuing surface is
 *     **owed to doc 15** (§9.27): a fixture inventing one would be commandment 2, and a suite
 *     asserting a shape nobody has specified is a suite that blocks its own implementer. **The
 *     fixture gains the code in the change that lands it**, exactly as `28-F24` sequences §E below.
 *     (ii) §C's "refuses every field the form does not collect" deliberately does **not** list an
 *     `invite_code`, so nothing here forbids that field arriving — that was luck rather than
 *     foresight, and it is said out loud so a later reader does not read a ban into the omission.
 *   · **R47 / `28-F24` — THE OWNER'S FIRST CREDENTIAL IS A SINGLE-USE REDEMPTION TOKEN, not a
 *     minted password.** §4 (b)'s DELIVERY half is closed: the token is handed over in the session
 *     she is already in, so the outbound-mail capability no document owns is no longer in front of
 *     the surface. **`28 §9.21` survives, narrowed to RECOVERY** — one owner, one password, no
 *     reset flow anywhere in the corpus, `15-F15`'s vendor route unbuildable (`28-F19`), and a
 *     locked-out pilot is an unadministrable org whose `org_id` can never be reused. Nothing here
 *     asserts recovery and nothing may invent one.
 *     - **`28-F24` names this suite by path on the day it landed, and sequences the repair**: its
 *       §E "asserts that the returned secret **verifies against the stored password hash** — that
 *       what signup hands over *is* a password. That was a correct reading of `28-F13` before R47
 *       and **it is not a defect** … The suite is amended in the change that lands the token, by a
 *       session that has read `24 §3`'s authorship split — **not before**, and not by the
 *       implementer." So a minted `initial_secret` is a **legal intermediate** that R47's token
 *       supersedes: strictly smaller than R47 (it does not expire, it is not single-use, nothing
 *       forces rotation — `15-F27`'s own admission for `create-owner`) and strictly larger than
 *       nothing. §E's title and its three shape-specific tests now say so in place.
 *     - **Why the assertions are NOT rewritten today, stated so the restraint is checkable rather
 *       than lazy.** `28-F24` leaves two implementations open on purpose — "either the column
 *       becomes nullable and the login lookup refuses a row with no credential, or the row carries
 *       a hash of a minted secret **nobody is ever told** and redemption replaces it" — and
 *       `schema.ts` still declares `password_hash` `NOT NULL`. Rewriting §E to one of those shapes
 *       would pin a choice doc 28 declines to make, and would leave this file RED against every
 *       implementation that can exist before `14-F42`'s redemption surface does. That is precisely
 *       the defect §A's control was repaired for in this same change; committing it here would be
 *       reproducing that defect inside the fix for it.
 *     - **What lands with the token:** §E1, §E2 and §E3 are amended in that change — they read the
 *       returned artifact against `kernel.users.password_hash`, which is the one thing R47 moves.
 *       `28-F24` blesses the rest of §E unchanged: "the writer mints it, a `password` /
 *       `password_hash` / `pin` field is refused **by name**, the plaintext is durable nowhere, and
 *       two signups mint two different secrets, neither derived from what was typed". The
 *       assertion `28-F24` asks for that this file does NOT hold — *no credential set must never
 *       read as no credential required* — lives on the login path in `services/api`, not here.
 *
 * ── ⚠ THE TRANSPORT IS PINNED BY THIS ORACLE AND ITS SECURITY RESIDUAL IS NAMED, NOT RESOLVED ───
 *
 * The corpus decides the ACT and does not name a route; `28 §9.26` records that where the public
 * surface lives is undecided. The route below follows the shipped `/internal/users` +
 * `/internal/devices/revoke` precedent (`services/sync-gateway/src/publish-http.ts`) so that the
 * act has a real seam rather than becoming AGENTS.md's recurring defect — a correct subsystem with
 * no way to reach it. It is **contestable**: change it here and in any adapter together, never in
 * one place.
 *
 *   POST /internal/signup   { org_display_name, owner_display_name, owner_email, now }
 *                           → 200 { org_id, user_id, initial_secret }
 *
 * ⚠ **BOTH LINES ARE THE PRE-R46/R47 SHAPE AND ARE KEPT AS THE INTERIM CONTRACT, NOT AS THE
 * DESTINATION.** The request gains `28-F23`'s invite code and the response's `initial_secret`
 * becomes `28-F24`'s single-use redemption token, each in the change that lands it — see the
 * rulings block above. `28-F24` quotes this very line as the thing that "pins the retired shape",
 * and says the amendment belongs to the change that lands the token rather than to today.
 *
 * ⚠ **`create-org.ts`'s own recorded objection to this shape is UNANSWERED and is reported here
 * rather than argued away.** That file rejected "An `/internal` route behind `PUBLISH_TOKEN`" for
 * creating orgs: "`PUBLISH_TOKEN` is the *menu* credential held by `services/api`, and creating
 * tenants is not a menu act. Unlike revocation there is no person-level `can()` check above it
 * either, because no user exists yet — the credential would be the entire security story." The
 * second half is **permanently true of self-serve signup by construction**, which is precisely why
 * `28-F15` requires an admission control instead; and `28-F17`'s boot-asserted internal gate — the
 * thing that would constrain this hop — is "UNBUILDABLE TODAY" for want of an action vocabulary
 * doc 15 has never written. So: this route is gated by the credential and by nothing else, it is
 * **not** the public surface, and splitting `PUBLISH_TOKEN` is unscoped work with a founder call in
 * front of it. Recorded, not resolved.
 *
 * `now` rides the body on `/internal/catalog/publish`'s and `/internal/users`'s recorded precedent
 * ("one act must not be split into two instants"). It is a service-plane parameter, not a value a
 * stranger supplies.
 *
 * ── ⚠ WHAT THIS SUITE DELIBERATELY DOES NOT ASSERT ─────────────────────────────────────────────
 *
 *   · **An event.** `28-F14` forbids one and §D asserts the absence. It also does not assert that
 *     `config.changed` is emitted later by a surface that has an actor — that is `15-F27`'s owed
 *     ledger half, and `28-F14` measures that the type has **no payload schema in
 *     `packages/domain`**, so it is unbuildable rather than unbuilt.
 *   · **Idempotency.** `15-F27` makes a re-run "a safe no-op that says so" — a rule about a NAMED
 *     record. Signup mints its own key, so it has no name to re-run against: a double-submitted
 *     form with two different emails is two tenants and `01-F68` makes both permanent. That is a
 *     real consequence of `28-F15`'s missing admission control and it is reported (§9.6), not
 *     asserted, because the corpus states no de-duplication rule and inventing one would pick a
 *     window nobody has specified.
 *   · **What a refusal may SAY to a stranger.** `28-F13`: "What the refusal may *say* is a surface
 *     decision and is not made here." §F asserts only what a refusal may not DISCLOSE about another
 *     tenant, which is `01-F71` and not a surface question.
 *   · **Entitlement, plan or subscription state.** `28-F4`'s gate "HAS NO CONSUMER AND NO WRITER
 *     TODAY, AND BUILDING IT AHEAD OF ONE WOULD BE THIS CORPUS'S OWN NAMED DEFECT"; `28-F3` makes
 *     an absent record serve identically. A signup that wrote one would be building W6 inside W4.
 *   · **`14-F27`'s go-live checklist** (`28 §9.14`) and **`14-F26`'s wizard** — both terminate the
 *     walk and both are unbuilt; `28-F13` names them as owed to doc 14.
 */

import { readFileSync } from "node:fs";
import { newId, PIN_ARGON2ID_PARAMS, verifyPin } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrg } from "../create-org.js";
import { createOwner } from "../create-owner.js";
import { buildServer } from "../server.js";
import { insertBranch, listBranches, listUsers, readOrg } from "../tenancy.js";
import { BASE_T, closeDb, type Db, openDb, TEST_TOKEN_SECRET, testDatabaseUrl } from "./helpers.js";

/** ≥ 32 bytes — the floor `server.ts` enforces on the `/internal` credential (`18 §5`). */
const PUBLISH_SECRET = "internal-signup-credential-for-the-28-f13-acceptance-suite";

const SIGNUP = "/internal/signup";

type Http = { status: number; body: Record<string, unknown> };

let db: Db;
let base: string;
let unconfigured: string;
let servers: { close(): Promise<void> }[];

const call = async (
  origin: string,
  method: "GET" | "POST",
  path: string,
  init: { token?: string | undefined; body?: unknown } = {},
): Promise<Http> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`;
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
  };
};

/**
 * A request that carries NO `authorization` header at all — the arrangement §A's control needs and
 * could not previously express.
 *
 * ⚠ **THIS CONSTANT AND `signupPresenting` EXIST BECAUSE A DEFAULT PARAMETER MADE §A's CONTROL
 * UNSATISFIABLE BY ANY IMPLEMENTATION, AND THAT IS A DEFECT OF THE SAME CLASS AS A VACUOUS TEST.**
 * As authored, the wrapper was `(body, token: string | undefined = PUBLISH_SECRET)`, so
 * `signupOverHttp(request, undefined)` was **byte-identical to `signupOverHttp(request)`**: the
 * default swallowed the absence, the VALID credential went on the wire, and one call was required
 * to answer 401 in the loop and 200 four lines later. Measured against a correct implementation the
 * file failed exactly that one test — `credential undefined: expected 200 to be 401` — which is
 * the round-3 law's own second corollary (AGENTS.md; `plans/wave-1/oracle-round-2-findings.md` §C):
 * **a test that stays RED under a CORRECT implementation is as damaging as a vacuous one, because
 * it blocks its implementer indefinitely** — that round produced three of them. Both claims in this
 * control are real and each needs its OWN arrangement; the bug was that one call could not make
 * both.
 *
 * The repair is structural rather than a corrected argument: the credential is `signupPresenting`'s
 * **first and required** parameter, so the absent case cannot be re-defaulted by a later edit, and
 * `null` — not `undefined` — is what reaches `call` as "send no header". `undefined` is the value a
 * default parameter eats; `null` is not, and it is deliberately the only way to say this.
 */
const NO_CREDENTIAL = null;

/**
 * The contracted request with the `/internal` credential STATED — `null` means no header is sent.
 *
 * Typed `unknown` in the body on purpose: every `strict` refusal below (§C, §E, §F) hands this a
 * field the shape does not declare. If the wrapper took the three declared fields, TypeScript would
 * refuse to express the attack and the whole class would be untestable from here, which is how a
 * closed-set rule ends up enforced by a type checker at authoring time and by nothing at runtime.
 */
const signupPresenting = (token: string | null, body: unknown): Promise<Http> =>
  call(base, "POST", SIGNUP, { token: token ?? undefined, body });

/** The same request presenting the credential this deployment was configured with. */
const signupOverHttp = (body: unknown): Promise<Http> => signupPresenting(PUBLISH_SECRET, body);

type SignupBody = {
  readonly org_display_name: string;
  readonly owner_display_name: string;
  readonly owner_email: string;
  readonly now: number;
};

/** A request that must SUCCEED — every field distinct per call, so nothing collides by accident. */
const freshRequest = (label: string): SignupBody => {
  const tag = newId();
  return {
    org_display_name: `${label} ${tag.slice(0, 12)}`,
    owner_display_name: `Owner ${tag.slice(0, 8)}`,
    owner_email: `owner-${tag}@signup.test`,
    now: BASE_T,
  };
};

type Signed = { org_id: string; user_id: string; initial_secret: string; request: SignupBody };

/**
 * A signup that FAILS BY NAME rather than returning a status nobody reads.
 *
 * Every assertion in §A–§G is about a tenant this act was supposed to have created, and every one
 * of them passes vacuously against a tenant that never existed — the "guard never pointed at the
 * dangerous case" pattern the round-3 law exists to catch.
 */
const mustSignup = async (request: SignupBody = freshRequest("Signup Org")): Promise<Signed> => {
  const reply = await signupOverHttp(request);
  if (reply.status !== 200) {
    throw new Error(
      `fixture: POST ${SIGNUP} refused "${request.org_display_name}" with ${reply.status} — ` +
        `${JSON.stringify(reply.body)}. 28-F13's act is the first thing a self-serve tenant ever ` +
        "does; every assertion below is about the two records it was supposed to have written.",
    );
  }
  const { org_id, user_id, initial_secret } = reply.body as Record<string, unknown>;
  if (
    typeof org_id !== "string" ||
    typeof user_id !== "string" ||
    typeof initial_secret !== "string"
  ) {
    throw new Error(
      `POST ${SIGNUP} answered 200 without { org_id, user_id, initial_secret }. The writer MINTS ` +
        "all three (01-F68: the org id is minted at provisioning; 15-F27: the step mints the " +
        "secret itself and emits it once), so the caller has no other way to learn them. Got " +
        JSON.stringify(reply.body),
    );
  }
  return { org_id, user_id, initial_secret, request };
};

/**
 * A REFUSAL BY THE WRITER, and never a 404.
 *
 * ⚠ Every refusal assertion in this file passes against a service that has no such route at all:
 * 404 is `>= 400` and nothing was written because nothing exists. That is this repo's measured
 * failure pattern 3 — "a refusal test that passes for free" — and it would leave the sharpest tests
 * here contributing nothing to red or green. So the shape is asserted: the route answered, and it
 * said no.
 *
 * `< 500` is deliberately NOT asserted. `refusalStatus` maps `RangeError` to 400 and everything
 * else to 500, so which class a refusal lands in depends on where the implementer puts the check —
 * a route-level `safeParse`, a writer's `RangeError`, or a `ZodError` escaping `OrgRecord.parse`.
 * All three refused and wrote nothing, which is the property.
 */
const refusedByTheWriter = (reply: Http, what: string): void => {
  expect(
    reply.status,
    `${what}: expected a refusal, got ${reply.status} ${JSON.stringify(reply.body)}`,
  ).toBeGreaterThanOrEqual(400);
  expect(
    reply.status,
    `${what}: 404 means the ROUTE does not exist, so nothing refused anything — this assertion ` +
      `is about the writer's refusal and is vacuous against a missing surface (${SIGNUP})`,
  ).not.toBe(404);
};

/* ── raw readers: the tables ARE the contract, exactly as `helpers.ts` treats the kernel's ────── */

const orgsNamed = async (display_name: string): Promise<string[]> => {
  const rows = await db.execute(
    sql`select org_id from kernel.orgs where display_name = ${display_name}`,
  );
  return [...rows].map((row) => String(row.org_id));
};

const usersWithEmail = async (email: string): Promise<string[]> => {
  const rows = await db.execute(
    sql`select user_id from kernel.users where lower(email) = lower(${email})`,
  );
  return [...rows].map((row) => String(row.user_id));
};

const storedPasswordHash = async (org_id: string, user_id: string): Promise<string | null> => {
  const rows = await db.execute(
    sql`select password_hash from kernel.users where org_id = ${org_id} and user_id = ${user_id}`,
  );
  const row = [...rows][0];
  return row === undefined ? null : String(row.password_hash);
};

/** The whole user row as text, for "the plaintext is nowhere" — a column-blind sweep on purpose. */
const userRowAsText = async (org_id: string, user_id: string): Promise<string> => {
  const rows = await db.execute(
    sql`select to_jsonb(u.*)::text as blob from kernel.users u
        where u.org_id = ${org_id} and u.user_id = ${user_id}`,
  );
  const row = [...rows][0];
  return row === undefined ? "" : String(row.blob);
};

const orgEventRows = async (org_id: string): Promise<Record<string, unknown>[]> => {
  const rows = await db.execute(
    sql`select seq, type, actor_user_id, server_received_at, payload::text as payload
        from kernel.org_events where org_id = ${org_id} order by seq asc`,
  );
  return [...rows].map((row) => ({ ...row }));
};

const kernelEventIds = async (org_id: string): Promise<string[]> => {
  const rows = await db.execute(sql`select id from kernel.events where org_id = ${org_id}`);
  return [...rows].map((row) => String(row.id));
};

const deviceIds = async (org_id: string): Promise<string[]> => {
  const rows = await db.execute(
    sql`select device_id from kernel.device_registry where org_id = ${org_id} order by device_id`,
  );
  return [...rows].map((row) => String(row.device_id));
};

const credentialUserIds = async (org_id: string): Promise<string[]> => {
  const rows = await db.execute(
    sql`select user_id from kernel.user_credentials where org_id = ${org_id} order by user_id`,
  );
  return [...rows].map((row) => String(row.user_id));
};

/**
 * `01-F61`'s cost floor read as a PARAMETER, never as an elapsed time — that FR's own words, and
 * `pin.ts` exports `PIN_ARGON2ID_PARAMS` "so the floor can be asserted as a parameter rather than
 * measured as a duration". A duration assertion makes a fast machine read as a weak one.
 */
const argonOf = (phc: string): { alg: string; m: number; t: number; p: number } => {
  const parts = phc.split("$");
  const params = Object.fromEntries(
    (parts[3] ?? "").split(",").map((pair) => {
      const [key, value] = pair.split("=");
      return [key ?? "", Number(value)];
    }),
  ) as Record<string, number>;
  return {
    alg: parts[1] ?? "",
    m: params.m ?? Number.NaN,
    t: params.t ?? Number.NaN,
    p: params.p ?? Number.NaN,
  };
};

/* ── the two-tenant fixture (`01-F71`, `28-N3`) ──────────────────────────────────────────────── */

type Tenant = {
  readonly org_id: string;
  readonly org_name: string;
  readonly branch_id: string;
  readonly user_id: string;
  readonly email: string;
  readonly owner_name: string;
  readonly secret: string;
};

/**
 * A tenant provisioned by the STAFFED path (`15-F27`'s declared steps), on purpose.
 *
 * §F's question is whether a self-serve signup can reach a tenant that already exists, and the
 * tenants that already exist on a pooled deployment were made by the commands. Building §F's
 * neighbours out of the act under test would make the sweep partly self-referential — a defect in
 * the act would move both sides of the comparison.
 */
const staffedTenant = async (label: string): Promise<Tenant> => {
  const tag = newId();
  const org_name = `${label} ${tag.slice(0, 12)}`;
  const { org } = await createOrg(db, { org: undefined, name: org_name }, BASE_T);
  const branch_id = `branch-${tag}`;
  await insertBranch(db, {
    branch_id,
    org_id: org.org_id,
    display_name: `Branch ${tag.slice(0, 8)}`,
    branch_type: "branch",
    branch_class: "production",
    created_at: BASE_T,
  });
  const email = `staffed-${tag}@signup.test`;
  const owner_name = `Staffed Owner ${tag.slice(0, 8)}`;
  const owner = await createOwner(db, { org: org.org_id, email, name: owner_name }, BASE_T);
  return {
    org_id: org.org_id,
    org_name,
    branch_id,
    user_id: owner.user_id,
    email,
    owner_name,
    secret: owner.initial_password,
  };
};

/** Everything about one tenant that a signup could possibly perturb. §F compares two of these. */
const photograph = async (org_id: string): Promise<Record<string, unknown>> => {
  const users = await listUsers(db, org_id);
  const hashes: Record<string, string | null> = {};
  for (const user of users) hashes[user.user_id] = await storedPasswordHash(org_id, user.user_id);
  return {
    org: await readOrg(db, org_id),
    branches: await listBranches(db, org_id),
    users,
    hashes,
    credentials: await credentialUserIds(org_id),
    org_events: await orgEventRows(org_id),
    kernel_events: await kernelEventIds(org_id),
    devices: await deviceIds(org_id),
  };
};

let tenantA: Tenant;
let tenantB: Tenant;

beforeAll(async () => {
  db = openDb();
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  // A deployment that declared NO `/internal` credential — its own instance, because the question
  // is what `buildServer` does with `undefined` and not what a flag on one instance does.
  const bare = buildServer(testDatabaseUrl(), TEST_TOKEN_SECRET);
  base = await app.listen({ port: 0, host: "127.0.0.1" });
  unconfigured = await bare.listen({ port: 0, host: "127.0.0.1" });
  servers = [app, bare];

  tenantA = await staffedTenant("Kababjees");
  tenantB = await staffedTenant("Student Biryani");
}, 180_000);

afterAll(async () => {
  for (const server of servers ?? []) await server.close();
  if (db !== undefined) await closeDb(db);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §A — THE ACT: TWO RECORDS, AND EXACTLY TWO
//
// `28-F13`. Nothing below §A means anything unless §A is green: every later section asserts a
// property of a tenant this act was supposed to have created.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§A — one act creates the org and its first owner (28-F13)", () => {
  it("writes an `active` org whose `display_name` is the one that was typed (28-F2, 01-F68)", async () => {
    const signed = await mustSignup();
    const org = await readOrg(db, signed.org_id);
    expect(org, "the act returned an org_id that names no row").toBeDefined();
    expect(org?.display_name).toBe(signed.request.org_display_name);
    // `28-F2`: "A free pilot org is **`active`** — it is not a third state, not a flag on the
    // lifecycle field, and not a variant of `suspended`." Seven candidate values were considered
    // and refused by name in that FR; a signup that invented one is the refusal arriving anyway.
    expect(org?.status).toBe("active");
    expect(org?.created_at).toBe(BASE_T);
  });

  it("writes ONE owner carrying `11-F20`'s minimum WHOLE — including `01-F61`'s grid ordinal", async () => {
    const signed = await mustSignup();
    const users = await listUsers(db, signed.org_id);
    expect(users.map((user) => user.user_id)).toEqual([signed.user_id]);
    const owner = users[0];
    expect(owner?.org_id).toBe(signed.org_id);
    expect(owner?.display_name).toBe(signed.request.owner_display_name);
    expect(owner?.email).toBe(signed.request.owner_email);
    // `28-F13` restates no field list of its own precisely because Draft 1's partial list "is a
    // list an implementer will follow into a row the database refuses". `grid_ordinal` is the
    // member that partial list dropped: `01-F61` makes it explicit and never derived, and the
    // first person provisioned is the first tile.
    expect(owner?.grid_ordinal).toBe(0);
  });

  it("the assignment is `01-F26`'s org-wide pair with `11-F22`'s status STATED, not defaulted", async () => {
    const signed = await mustSignup();
    const owner = (await listUsers(db, signed.org_id))[0];
    // `28-F13`: "one user carrying the org-wide assignment `{ role: owner, branch_id: null }` —
    // `01-F26`'s per-location assignment with a null location". `11-F22`/`01-F75` add the status,
    // and `11-F22` refuses a default by name.
    expect(owner?.assignments).toEqual([{ role: "owner", branch_id: null, status: "active" }]);
  });

  it("stores a restaurant's name EXACTLY as typed, Unicode included (commandment 7, 21-F15)", async () => {
    // "English-only UI; user content is Unicode and renders/prints faithfully" (`00 §5.6`). An org
    // name is the most user-content thing this act touches, and `01-F68` calls it "the only value
    // `21-F15` permits in an org's name slot" — so a signup that title-cases, transliterates,
    // strips or prefixes it has replaced the restaurant's own name with the vendor's opinion.
    const typed = `کباب جیز · Kababjees ${newId().slice(0, 8)}`;
    const signed = await mustSignup({ ...freshRequest("ignored"), org_display_name: typed });
    expect((await readOrg(db, signed.org_id))?.display_name).toBe(typed);
  });

  it("R44 — the only name in the answer is the RESTAURANT's; no vendor branding is baked in", async () => {
    // R44: "'RestOS' … Every surface draws it from one declaration so the rename before paid
    // launch is a token change." A backend that bakes the product name into an operator-facing
    // payload forks that declaration where no rail can see it.
    //
    // ⚠ MEASURED AND REPORTED RATHER THAN ASSERTED FURTHER: **no such single declaration exists
    // today.** `apps/backoffice/src/lib/strings.ts:11` holds `appName: "RestOS Back Office"` as a
    // per-app `00 §5.6` catalogue entry, and a search across `packages/`, `apps/` and `services/`
    // finds no shared export. Requiring one here would put its home — a founder/`27`/`21` question
    // under R19 — inside a backend oracle. So this asserts only the half that is decidable from
    // here: the act ships no branding of its own.
    const signed = await mustSignup();
    const serialised = JSON.stringify(signed);
    expect(serialised).not.toContain("RestOS");
    expect((await readOrg(db, signed.org_id))?.display_name).not.toContain("RestOS");
  });

  it("CONTROL — the act is genuinely reachable, and the credential is the only thing gating it", async () => {
    // ⚠ THIS PAIRING IS LOAD-BEARING AND THE TWO HALVES MUST STAY IN ONE TEST. `publish-http.ts`
    // guards **every** `/internal/` path with one `onRequest` hook, so "no credential ⇒ 401" is
    // true of a route that does not exist. Asserted alone it is this repo's failure pattern 3
    // exactly. The 200 is what proves the 401 is about the credential and not about the absence.
    //
    // ⚠ AND THE TWO HALVES NEED TWO ARRANGEMENTS — see `NO_CREDENTIAL` above. The loop below once
    // passed `undefined` into a wrapper that defaulted it back to `PUBLISH_SECRET`, so the refusal
    // arm sent the SAME bytes as the success arm and no implementation could satisfy both. The
    // credential is stated on every call here, and the `orgsNamed` line under the loop is what
    // catches a re-defaulting: a swallowed credential does not merely answer 200, it writes a row.
    const request = freshRequest("Gate Control");
    for (const [what, token] of [
      ["no `authorization` header at all", NO_CREDENTIAL],
      ["an `authorization` header carrying the wrong secret", "not-the-publish-token"],
    ] as const) {
      const refused = await signupPresenting(token, request);
      expect(refused.status, `${what}: ${JSON.stringify(refused.body)}`).toBe(401);
    }
    expect(await orgsNamed(request.org_display_name)).toEqual([]);
    const allowed = await signupOverHttp(request);
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect(await orgsNamed(request.org_display_name)).toHaveLength(1);
  });

  it("a gateway with NO `/internal` credential refuses the act fail-closed, and writes nothing", async () => {
    // `18 §5` / `publish-http.ts`: "`PUBLISH_TOKEN` absent is fail-CLOSED — every `/internal` route
    // answers 503 … never 'skip the check for local dev'". Creating tenants must not be the one
    // route that reads an unconfigured deployment as permission.
    const request = freshRequest("Unconfigured");
    const reply = await call(unconfigured, "POST", SIGNUP, {
      token: PUBLISH_SECRET,
      body: request,
    });
    expect(reply.status).toBe(503);
    expect(await orgsNamed(request.org_display_name)).toEqual([]);
    // ⚠ THE ANCHOR, AND IT IS NOT DECORATION — MEASURED. The `onRequest` hook answers 503 for
    // **every** `/internal/` path on an unconfigured deployment, including paths that do not
    // exist, so the two assertions above were GREEN on the tree as authored, against a service
    // with no signup route at all. That is this repo's failure pattern 3 ("a refusal test that
    // passes for free") and it was caught by running the suite, not by reading it. The same
    // request against the CONFIGURED host is what makes the 503 a statement about the credential
    // rather than about the absence.
    const configured = await signupOverHttp(request);
    expect(configured.status, JSON.stringify(configured.body)).toBe(200);
    expect(await orgsNamed(request.org_display_name)).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §B — THE KEY IS MINTED HERE, AND A FAILED SIGNUP LEAVES NOTHING BEHIND
//
// `01-F68` (minted at provisioning, never reused), `15-F26` ("abandoned, never recycled"),
// `28-F5` (b) + `28 §7` (no tenant-supplied org identifier on any request), `28-F13` (the email
// check runs BEFORE the mint; the two records are one act).
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§B — the org_id is minted by the writer, and a refusal writes nothing", () => {
  it("refuses a caller-supplied `org_id` BY NAME (28-F5 b, 28 §7) and mints its own", async () => {
    // `28 §7`: "Deliberately not configurable, ever: … a tenant-supplied org identifier on any
    // request (`28-F5` (b))." The concrete harm is not hypothetical: `create-org` answers a
    // colliding `--org` with *"already exists and is called \"<stored name>\""*, so an act that
    // accepted an id would answer "does this tenant exist, and what is it called" to anyone who
    // can reach it. §F2 asserts the disclosure half; this asserts the field.
    const request = freshRequest("Supplied Id");
    const reply = await signupOverHttp({ ...request, org_id: tenantA.org_id });
    refusedByTheWriter(reply, "a signup naming an org_id");
    expect(await orgsNamed(request.org_display_name)).toEqual([]);
    // …and the id it named is untouched: still tenant A's, still called what A called it.
    expect((await readOrg(db, tenantA.org_id))?.display_name).toBe(tenantA.org_name);
  });

  it("two signups mint two different org ids, and neither reuses the other's (01-F68)", async () => {
    const first = await mustSignup();
    const second = await mustSignup();
    expect(first.org_id).not.toBe(second.org_id);
    expect(first.user_id).not.toBe(second.user_id);
    expect((await readOrg(db, first.org_id))?.display_name).toBe(first.request.org_display_name);
    expect((await readOrg(db, second.org_id))?.display_name).toBe(second.request.org_display_name);
  });

  it("an email already in use ANYWHERE on the host is refused, and NO org row is left behind", async () => {
    // `28-F13`: "The email uniqueness check runs BEFORE the `org_id` is minted. Email is unique
    // case-folded and **globally** … minting first would abandon an `org_id` permanently and
    // manufacture one of `28-F15`'s permanent junk orgs on a keystroke a stranger cannot be blamed
    // for."
    //
    // ⚠ The FR states an ORDERING; the observable is the ABSENCE OF THE ROW, and that is what is
    // asserted. A writer that mints in memory and rolls back inside one transaction abandons no id
    // and manufactures no junk org, so it satisfies the FR by a different mechanism. Asserting the
    // order of two statements would pin the mechanism and redden a correct implementation.
    const request = { ...freshRequest("Colliding"), owner_email: tenantA.email };
    const reply = await signupOverHttp(request);
    refusedByTheWriter(reply, "a signup reusing another tenant's login email");
    expect(await orgsNamed(request.org_display_name)).toEqual([]);
    // The uniqueness is case-folded, per `users_email_lower_uq` and `28 §9.18`.
    const upper = { ...freshRequest("Colliding Upper"), owner_email: tenantA.email.toUpperCase() };
    refusedByTheWriter(await signupOverHttp(upper), "a signup reusing the email in another case");
    expect(await orgsNamed(upper.org_display_name)).toEqual([]);
  });

  it("a refused ORG name leaves no user, and a refused OWNER leaves no org — atomicity both ways", async () => {
    // `28-F13`: "The two records are one act. If the owner cannot be created the org must not
    // stand … Atomicity is enforced at the writer, not by a foreign key — `01-F68` forbids one,
    // permanently." Both directions, because a writer that inserts the org first fails one way and
    // a writer that inserts the user first fails the other.
    const badOrg = { ...freshRequest("ignored"), org_display_name: "   " };
    refusedByTheWriter(await signupOverHttp(badOrg), "a signup with a blank org name");
    expect(await usersWithEmail(badOrg.owner_email)).toEqual([]);

    const badOwner = { ...freshRequest("Blank Owner"), owner_display_name: "" };
    refusedByTheWriter(await signupOverHttp(badOwner), "a signup with a blank owner name");
    expect(await orgsNamed(badOwner.org_display_name)).toEqual([]);

    // `28-F13` collects "the owner's email" and `15-F26` makes it the login handle. R30 removes the
    // requirement for a TILL-ONLY cashier and says in terms that "email is required only for
    // BACK-OFFICE access" — which is exactly what this owner is created for. ⚠ Stated as a READING
    // rather than a quotation: no FR says the word "required" of a signup form's email field.
    const noEmail = { ...freshRequest("No Email"), owner_email: "" };
    refusedByTheWriter(await signupOverHttp(noEmail), "a signup with no owner email");
    expect(await orgsNamed(noEmail.org_display_name)).toEqual([]);
  });

  it("CONTROL — the same three shapes with VALID values all succeed, so the refusals are about the value", async () => {
    // Without this, §B's four refusals are satisfied by an act that refuses everything — which is
    // also what a missing route does, one status code away.
    for (const label of ["Valid Org", "Valid Owner", "Valid Email"]) {
      const signed = await mustSignup(freshRequest(label));
      expect(await orgsNamed(signed.request.org_display_name)).toEqual([signed.org_id]);
      expect(await usersWithEmail(signed.request.owner_email)).toEqual([signed.user_id]);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §C — IT REFUSES TO INVENT ANYTHING THE FORM DID NOT ASK FOR
//
// `28-F13`: "The form collects exactly what those two records require and nothing more … **No
// branch, no tier, no plan, no channel** — a tier or plan collected at signup is `28-F2`'s refused
// lifecycle value and `28-F6`'s absent record arriving through a form instead."
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§C — no branch, no tier, no plan, no channel, no device (28-F13)", () => {
  it("creates NO branch — the refusal `28-F13` states, not an omission (01-F69, 14-F26)", async () => {
    const signed = await mustSignup();
    // `01-F69` requires a non-empty `display_name`, a `type` and a `class` — "three facts a signup
    // form has not asked for. Minting a 'Main Branch' is precisely the guess that `01-F65` and
    // `01-F67` refuse elsewhere". The first branch is `14-F26`'s wizard, made by an authenticated
    // owner who knows the answers.
    expect(await listBranches(db, signed.org_id)).toEqual([]);
  });

  it("registers NO device, and asserts nothing about `01-F25`'s pairing code (which is unspecified)", async () => {
    // `28-F13`: "THE PATH TERMINATES AT THE ORG AND ITS OWNER." `01-F25`'s back-office pairing code
    // is one clause with no format, TTL, rate limit or claim protocol anywhere in the corpus, and
    // `plans/saas-pivot/plan-of-record.md` A3 lists specifying it as OWED to doc 01. So the only
    // honest assertion here is the absence: a device that appeared without a pairing protocol would
    // be an admission credential minted by a form.
    const signed = await mustSignup();
    expect(await deviceIds(signed.org_id)).toEqual([]);
  });

  it("refuses every field the form does not collect, BY NAME rather than ignoring it", async () => {
    // ⚠ IGNORING IS THE DANGEROUS OUTCOME, NOT REFUSING. `create-owner.ts` records the reason for
    // `parseArgs strict` in exactly this shape: "An ignored `--password` is the worst outcome
    // available here: the operator believes they set one, the command prints a different one."
    // Here the twin is `status`: `create-org.ts` refuses `--status` because "a `--status suspended`
    // flag here would let a tenant be born suspended, which is a state `15-F7`'s reversal path has
    // nothing to reverse" — and a silently-ignored `status` field reads to its sender as accepted.
    const extras: readonly [string, unknown][] = [
      // `28-F13`: no branch. `01-F69`'s three facts are not on this form.
      ["branch_id", `branch-${newId()}`],
      ["branch_display_name", "Main Branch"],
      ["branch_type", "branch"],
      ["branch_class", "production"],
      // `28-F2`/`28-F6`: no lifecycle value, no plan, no tier, no entitlement through a form.
      ["status", "suspended"],
      ["plan", "pilot"],
      ["tier", "T2"],
      ["channel", "counter"],
      ["entitlement", { storefront: true }],
      // `01-F68`/`01-F61`/`11-F20`: keys and ordinals are the writer's, never the caller's.
      ["org_id", `org-${newId()}`],
      ["user_id", `user-${newId()}`],
      ["grid_ordinal", 7],
      // `01-F26`: an assignment supplied by the caller is a client role claim (commandment 8).
      ["assignments", [{ role: "owner", branch_id: null, status: "active" }]],
      ["role", "owner"],
    ];
    for (const [field, value] of extras) {
      const request = freshRequest(`Extra ${field}`);
      const reply = await signupOverHttp({ ...request, [field]: value });
      refusedByTheWriter(reply, `a signup carrying \`${field}\``);
      expect(
        await orgsNamed(request.org_display_name),
        `\`${field}\` was refused but a row was still written`,
      ).toEqual([]);
    }
  });

  it("CONTROL — the same request without the extra field succeeds, so §C is about the field", async () => {
    const signed = await mustSignup(freshRequest("Extra none"));
    expect(await orgsNamed(signed.request.org_display_name)).toEqual([signed.org_id]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §D — IT EMITS NO EVENT (28-F14)
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§D — the signup act emits nothing (28-F14)", () => {
  it("writes no row to `01-F62`'s org-scoped store and none to the kernel ledger", async () => {
    // `28-F14`: "At the instant the org is created the signer-up is not yet a user of any org — the
    // user record is an *output* of the act, not an input — so `OrgEvent.actor_user_id` could only
    // be `null`, permanently, in an append-only store (`01-F1`)." `15-F27` refused exactly that for
    // the shell commands, "on the ground that an unattributed provisioning record is worse than
    // none because it reads like one".
    //
    // It is also unbuildable rather than merely unwanted: `28-F14` measures that `config.changed`
    // has "**no payload schema in `packages/domain`**", so `01-F4` makes the emit throw.
    const signed = await mustSignup();
    expect(await orgEventRows(signed.org_id)).toEqual([]);
    expect(await kernelEventIds(signed.org_id)).toEqual([]);
  });

  it("CONTROL — the reader CAN see a row, so the emptiness above is the act's and not the query's", async () => {
    // Without this, both assertions are satisfied by a `where` clause that matches nothing — the
    // shape `01-F71`'s own warning describes one level down.
    const signed = await mustSignup();
    await db.execute(
      sql`insert into kernel.org_events (org_id, type, actor_user_id, server_received_at, payload)
          values (${signed.org_id}, 'catalog.changed', ${signed.user_id}, ${BASE_T}, '{}'::jsonb)`,
    );
    const rows = await orgEventRows(signed.org_id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type).toBe("catalog.changed");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §E — THE CREDENTIAL (15-F26, 15-F27, 01-F61, 11-F21)
//
// This is the half of `28 §9.21` that IS decidable from here. How the secret reaches the stranger
// who asked for it is not, and nothing below invents a channel.
//
// ⚠ **AMENDED IN PLACE, August 2026 — R47 / `28-F24` RULED THE OTHER HALF AND MOVED WHAT THE ACT
// HANDS OVER.** §9.21's delivery question is closed (a single-use, expiring redemption token,
// redeemed on `14-F42`) and survives narrowed to RECOVERY. Three tests below therefore assert a
// **superseded intermediate** rather than the specified shape, and each is marked; the other three
// are blessed unchanged by `28-F24` and bind the token exactly as they bind a password. Nothing is
// rewritten here, because `28-F24` sequences that with the token and leaves two implementations
// open — the full reasoning is in this file's header block "TWO RULINGS LANDED BEFORE THIS SUITE".
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§E — the writer mints the secret; a password is never an input (15-F27)", () => {
  it("⚠ SUPERSEDED BY R47 (28-F24) — INTERIM: the returned secret is the secret it hashed", async () => {
    // **WHAT THIS ASSERTS:** that what the act hands over IS the owner's password — it verifies
    // against `kernel.users.password_hash`. **WHAT OVERRULED IT:** founder ruling R47, transcribed
    // as `28-F24` (August 2026): the act mints "a **single-use, expiring redemption token** — not a
    // password", and she chooses her own on `14-F42`'s redemption surface. **WHEN:** `deea54d`,
    // which is this file's own parent — the ruling predates the suite and the suite was authored
    // against Draft 1's text anyway, which `28-F24` says "is not a defect" and expressly declines
    // to have amended before the token lands.
    //
    // It is left BITING rather than skipped or deleted, because until the token lands it is the
    // only thing aimed at the mutant named below, and the interim shape is what every reachable
    // implementation ships. When the token lands, this test's claim becomes *the artifact handed
    // over is not a password and does not verify against that row*, and the assertion is rewritten
    // in that change — by this file's owner, not by its implementer (`24-F5`).
    //
    // The `create-owner` mutation matrix's T5 in this shape: "`create-owner` hashes something OTHER
    // than the secret it prints". A signup that mints one value, hashes another and returns the
    // first produces an org nobody can administer — which `15-F26` forbids by name — and no gate in
    // this repo can see it.
    const signed = await mustSignup();
    const hash = await storedPasswordHash(signed.org_id, signed.user_id);
    expect(hash, "the owner row carries no password hash").toBeTruthy();
    expect(await verifyPin(hash as string, signed.initial_secret)).toBe(true);
  });

  it("⚠ SUPERSEDED BY R47 (28-F24) — INTERIM CONTROL: a WRONG secret does not verify", async () => {
    // Without this, the assertion above passes against a verifier that always says yes. It carries
    // the same supersession as the test above and for the same reason — it reads the returned
    // artifact against `kernel.users.password_hash`, which is the one thing R47 moves — and it is
    // rewritten in the same change. Its own claim (a verifier that can say no) is untouched by R47.
    const signed = await mustSignup();
    const hash = (await storedPasswordHash(signed.org_id, signed.user_id)) as string;
    expect(await verifyPin(hash, `${signed.initial_secret}x`)).toBe(false);
    expect(await verifyPin(hash, signed.request.owner_email)).toBe(false);
  });

  it("⚠ SUPERSEDED BY R47 (28-F24) — INTERIM: the stored hash is Argon2id at `01-F61`'s cost floor", async () => {
    // The COST FLOOR claim survives R47 verbatim — `28-F24`: "the password she then chooses is
    // hashed by the same code at `01-F61`'s cost floor (`01-F26`'s single hashing story, no second
    // parameter set)". What R47 moves is WHICH ROW carries the hash and WHEN: under the token
    // shape either `kernel.users.password_hash` is nullable until redemption, in which case this
    // read returns null and `argonOf` throws, or it holds a hash of a secret nobody is ever told.
    // Doc 28 does not pick between them, so the row this reads is what the amendment must change —
    // not the floor, which is why this is marked rather than rewritten. `01-F61`'s parameter form
    // is untouched either way (a duration assertion makes a fast machine read as a weak one).
    //
    // `15-F27`: "stores only an Argon2id hash at `01-F61`'s cost floor — the product's single
    // hashing story (`01-F26`)". AGENTS.md records the instance this is aimed at: the floor "was
    // exported precisely so a test could assert it, and nothing did — `m=8,t=1,p=1` passed in
    // 34 ms". A second Argon2id call site is a second set of parameters.
    const signed = await mustSignup();
    const hash = (await storedPasswordHash(signed.org_id, signed.user_id)) as string;
    const params = argonOf(hash);
    expect(params.alg).toBe("argon2id");
    expect(params.m).toBeGreaterThanOrEqual(PIN_ARGON2ID_PARAMS.m);
    expect(params.t).toBeGreaterThanOrEqual(PIN_ARGON2ID_PARAMS.t);
    expect(params.p).toBeGreaterThanOrEqual(PIN_ARGON2ID_PARAMS.p);
  });

  it("refuses a `password`, a `password_hash` or a `pin` BY NAME (15-F27: never an input)", async () => {
    // `15-F27`: "Not in an environment variable, not in `argv` … not typed by vendor staff." A
    // request field is the same class and worse — it crosses a network. `28-F12` carries the clause
    // forward unchanged and `28-F13` repeats it, so a signup form collecting a password is refused
    // by three FRs at once. An IGNORED password field is the dangerous outcome: the sender believes
    // they set one.
    for (const field of ["password", "password_hash", "pin", "pin_hash", "initial_secret"]) {
      const request = freshRequest(`Credential ${field}`);
      const reply = await signupOverHttp({ ...request, [field]: "hunter2" });
      refusedByTheWriter(reply, `a signup supplying \`${field}\``);
      expect(await orgsNamed(request.org_display_name)).toEqual([]);
    }
  });

  it("the plaintext is durable NOWHERE — not in the user row, not in the org-scoped store", async () => {
    // `01-F1` is why: the ledger is permanent, so a credential written into it can never be
    // redacted (`pin.ts`'s own recorded reason). The sweep is column-BLIND on purpose — a new
    // column added later is covered without anyone remembering to extend this.
    const signed = await mustSignup();
    expect(await userRowAsText(signed.org_id, signed.user_id)).not.toContain(signed.initial_secret);
    expect(JSON.stringify(await orgEventRows(signed.org_id))).not.toContain(signed.initial_secret);
  });

  it("two signups mint two different secrets, and neither is derived from what was typed", async () => {
    // A derived secret — from the email, the org name or the id — is a credential an attacker
    // computes rather than steals, and it verifies perfectly against its own hash, so §E's first
    // assertion cannot see it.
    const first = await mustSignup();
    const second = await mustSignup();
    expect(first.initial_secret).not.toBe(second.initial_secret);
    for (const signed of [first, second]) {
      const local = signed.request.owner_email.split("@")[0] as string;
      expect(signed.initial_secret).not.toContain(local);
      expect(signed.initial_secret).not.toContain(signed.org_id);
      expect(signed.initial_secret).not.toContain(signed.user_id);
      expect(signed.initial_secret).not.toContain(signed.request.org_display_name);
      // Long enough to be a credential rather than a token someone can be talked into reading out.
      // `create-owner` mints 24 random bytes as base64url (192 bits); this is the floor, not the
      // shape — the encoding is the implementer's.
      expect(signed.initial_secret.length).toBeGreaterThanOrEqual(24);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §F — TWO TENANTS: SIGNUP MINTS TENANTS, SO EVERY BOUNDARY IT CREATES IS AN ENFORCEMENT POINT
//
// `01-F71`: "a subject authenticated in one org must never read, write, cause a write in, or be
// fanned out data belonging to another … each point carries a test that FAILS when that point alone
// is removed. Reading is not evidence and neither is a green suite: **a suite exercising one tenant
// passes with all four deleted.**" `28-N3` repeats it for this document's area. R35 puts this
// section in the FULL adversarial tier.
//
// THE RULE THIS SECTION IS BUILT ON: the two neighbours are provisioned by the STAFFED commands,
// so a defect in the act under test cannot move both sides of the comparison.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§F — a signup cannot reach, alter or disclose an existing tenant (01-F71, 28-N3)", () => {
  it("CONTROL — both neighbouring tenants really exist, with data that cannot be confused", async () => {
    // `01-F71`'s warning one level down: a suite whose second tenant is EMPTY passes with every
    // guard deleted and looks identical from the outside.
    for (const tenant of [tenantA, tenantB]) {
      expect((await readOrg(db, tenant.org_id))?.display_name).toBe(tenant.org_name);
      expect((await listBranches(db, tenant.org_id)).map((b) => b.branch_id)).toEqual([
        tenant.branch_id,
      ]);
      expect((await listUsers(db, tenant.org_id)).map((u) => u.user_id)).toEqual([tenant.user_id]);
      const hash = (await storedPasswordHash(tenant.org_id, tenant.user_id)) as string;
      expect(await verifyPin(hash, tenant.secret)).toBe(true);
    }
    expect(tenantA.org_id).not.toBe(tenantB.org_id);
    expect(tenantA.email).not.toBe(tenantB.email);
    expect(tenantA.org_name).not.toBe(tenantB.org_name);
  });

  it("the full attack sweep leaves BOTH neighbours byte-identical", async () => {
    // ASSERT THE PROPERTY, NOT THE MECHANISM. Nothing here names a guard, a function or an
    // argument: it photographs everything two existing tenants have, runs every signup a stranger
    // could compose out of their values, and re-photographs. An attack that reaches them by a route
    // nobody has thought of still changes the photograph.
    const before = { a: await photograph(tenantA.org_id), b: await photograph(tenantB.org_id) };

    const attacks: readonly [string, unknown][] = [
      ["A's org_id", { ...freshRequest("Attack 1"), org_id: tenantA.org_id }],
      ["A's user_id", { ...freshRequest("Attack 2"), user_id: tenantA.user_id }],
      ["A's branch_id", { ...freshRequest("Attack 3"), branch_id: tenantA.branch_id }],
      ["A's login email", { ...freshRequest("Attack 4"), owner_email: tenantA.email }],
      [
        "A's email in another case",
        { ...freshRequest("Attack 5"), owner_email: tenantA.email.toUpperCase() },
      ],
      [
        "A's org name AND A's email",
        {
          ...freshRequest("Attack 6"),
          org_display_name: tenantA.org_name,
          owner_email: tenantA.email,
        },
      ],
      [
        "every one of A's identifiers at once, plus a lifecycle value",
        {
          ...freshRequest("Attack 7"),
          org_id: tenantA.org_id,
          user_id: tenantA.user_id,
          branch_id: tenantA.branch_id,
          owner_email: tenantA.email,
          status: "suspended",
          grid_ordinal: 0,
        },
      ],
      // Mirrored onto B. Isolation is symmetric or it is not isolation — a one-directional sweep
      // passes against a service that special-cased one tenant, which is what a "primary tenant"
      // refactor produces.
      ["B's org_id", { ...freshRequest("Attack 8"), org_id: tenantB.org_id }],
      ["B's login email", { ...freshRequest("Attack 9"), owner_email: tenantB.email }],
    ];

    for (const [what, body] of attacks) {
      const reply = await signupOverHttp(body);
      // The OUTCOME is not asserted here — a refusal and a success that minted a THIRD tenant are
      // both legitimate answers to "a stranger typed something". What is asserted is the effect on
      // the neighbours, below. (The refusals themselves are §B's and §C's.)
      expect(
        [200, 400, 401, 403, 409, 422, 500],
        `${what}: ${reply.status} ${JSON.stringify(reply.body)}`,
      ).toContain(reply.status);
      expect(
        reply.status,
        `${what}: 404 — the route does not exist, so this sweep proves nothing`,
      ).not.toBe(404);
    }

    expect(await photograph(tenantA.org_id)).toEqual(before.a);
    expect(await photograph(tenantB.org_id)).toEqual(before.b);
  });

  it("CONTROL — a legitimate signup DOES create a third tenant, so the sweep is not passing on a dead act", async () => {
    const signed = await mustSignup(freshRequest("Third Tenant"));
    expect(signed.org_id).not.toBe(tenantA.org_id);
    expect(signed.org_id).not.toBe(tenantB.org_id);
    expect((await listUsers(db, signed.org_id)).map((u) => u.user_id)).toEqual([signed.user_id]);
    // …and the new owner is in HER org and in no other. `01-F71` (b) takes the org from the
    // subject, and the subject's org is decided here, once, at the moment she is written.
    expect((await listUsers(db, tenantA.org_id)).map((u) => u.user_id)).toEqual([tenantA.user_id]);
    expect((await listUsers(db, tenantB.org_id)).map((u) => u.user_id)).toEqual([tenantB.user_id]);
  });

  it("CONTROL — both neighbours' owners can still verify their own credentials after the sweep", async () => {
    // The half a row-count comparison cannot see: an act that re-credentialed a neighbour while
    // leaving every other column alone would move `password_hash` only, and `photograph` carries
    // it for exactly that reason. This states the same claim as a fact about the human.
    for (const tenant of [tenantA, tenantB]) {
      const hash = (await storedPasswordHash(tenant.org_id, tenant.user_id)) as string;
      expect(await verifyPin(hash, tenant.secret)).toBe(true);
    }
  });

  it("a refusal to a signup NAMING an existing org_id discloses nothing about it (01-F71, 28-F5 b)", async () => {
    // ⚠ **THE SHARPEST ASSERTION IN THIS FILE WAS POINTED ONE CASE AWAY FROM THE LEAK ITS OWN
    // COMMENT DESCRIBED, AND THE SESSION THAT TRIED TO IMPLEMENT AGAINST IT FOUND THAT THE SAME
    // DAY.** The comment below the next test named `create-org.ts`'s colliding-**id** refusal —
    // *"org <id> already exists and is called \"<stored display_name>\""* — as the cross-tenant
    // oracle, and then inspected the body of the **email** collision only. The two refusals come
    // from two different functions and say two different things, so the one that was measured was
    // never the one that leaks.
    //
    // **The gap was measured rather than argued, out of tree against the implementation.** Under
    // the mutant where the wire accepts an `org_id` and the act forwards it to `createOrg` — the
    // good-faith shape a session reaches for, because passing on a value the caller supplied looks
    // like plumbing — the file as authored lost **exactly one test to the mutant** (§C's `org_id`
    // row, which dies for the FIELD being accepted and never reads what the answer SAID) while the
    // refusal body returned another tenant's stored `display_name` to a caller who has
    // authenticated as nobody. §B1 sends the same field and SURVIVES, because a colliding id is
    // still a refusal that writes nothing. So a mutant that accepted the field and sanitised its
    // message would have taken §C with it and left this class uncovered entirely.
    //
    // That is a cross-tenant disclosure (`01-F71`, `28-N3`) on the one act in this product that
    // answers before anybody has authenticated: `28-F23`'s invite code admits an ACT and
    // "authenticates nobody", so there is no subject to scope a refusal to, and the only defence
    // available is that the sentence carries nothing the caller could not already have known.
    const request = { ...freshRequest("Id Disclosure"), org_id: tenantA.org_id };
    const reply = await signupOverHttp(request);
    refusedByTheWriter(reply, "a signup naming an existing tenant's org_id");
    const said = JSON.stringify(reply.body);
    for (const secretOfA of [
      tenantA.org_name,
      tenantA.user_id,
      tenantA.owner_name,
      tenantA.branch_id,
      tenantA.email,
    ]) {
      expect(said, `the refusal disclosed \`${secretOfA}\``).not.toContain(secretOfA);
    }
    // ⚠ `tenantA.org_id` is deliberately NOT in that list, on the same reasoning the email refusal
    // states one test down: the caller typed it, so echoing it discloses nothing they did not
    // already know — and a correct implementation refusing the FIELD by name may legitimately quote
    // the value it refused. What may never travel is anything the caller could not have known, and
    // a stored `display_name` is the first of those. The two halves close the class between them:
    // §C proves the field is refused for a FRESH id (so accept-and-forward cannot survive), and
    // this proves the refusal for an EXISTING one says nothing (so accept-and-disclose cannot).
    expect(await orgsNamed(request.org_display_name)).toEqual([]);
    expect((await readOrg(db, tenantA.org_id))?.display_name).toBe(tenantA.org_name);
  });

  it("a refusal discloses NOTHING about the tenant it collided with (01-F71, on either plane)", async () => {
    // The EMAIL collision, which is a second refusal by a second function and needs its own
    // measurement — see the test above for the one this comment used to claim and did not make.
    // `create-owner.ts` already gets this case right ("is already a login on this host"), naming no
    // org. A signup assembled by copying `create-org`'s id refusal leaks; assembled by copying this
    // one it does not. Both are asserted now, and neither test covers the other's function.
    const request = { ...freshRequest("Disclosure"), owner_email: tenantA.email };
    const reply = await signupOverHttp(request);
    refusedByTheWriter(reply, "a colliding signup");
    const said = JSON.stringify(reply.body);
    for (const secretOfA of [
      tenantA.org_id,
      tenantA.org_name,
      tenantA.user_id,
      tenantA.owner_name,
      tenantA.branch_id,
    ]) {
      expect(said, `the refusal disclosed \`${secretOfA}\``).not.toContain(secretOfA);
    }
    // The email itself is what the stranger typed, so echoing it discloses nothing they did not
    // already know — deliberately NOT asserted, and said so here rather than left as a gap.
  });

  it("two tenants may be called the same thing — a name is a label, never an identifier (28-F6)", async () => {
    // `28-F6`: "Nothing keys on a name. `01-F70` makes a device name a label and never an
    // identifier; the same holds for org and branch names." Pakistan has more than one restaurant
    // called Student Biryani, and a writer that treated the typed name as a key would either
    // refuse the second one or merge two restaurants' ledgers — which `01-F68` makes permanent.
    const shared = `Shared Name ${newId().slice(0, 10)}`;
    const first = await mustSignup({ ...freshRequest("ignored"), org_display_name: shared });
    const second = await mustSignup({ ...freshRequest("ignored"), org_display_name: shared });
    expect(first.org_id).not.toBe(second.org_id);
    expect(new Set(await orgsNamed(shared)).size).toBe(2);
    expect((await listUsers(db, first.org_id)).map((u) => u.user_id)).toEqual([first.user_id]);
    expect((await listUsers(db, second.org_id)).map((u) => u.user_id)).toEqual([second.user_id]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// §G — THE THIRD WRITER MUST AGREE WITH THE FIRST TWO
//
// `28-F13`: "The self-serve act is a **third** writer of these same two records beside `15-F27`'s
// declared steps and `15-F1`'s console; two writers of one fact disagreeing silently is this
// corpus's most-repeated defect."
//
// R40: signup "Retires `create-org.ts` as the onboarding path (**it survives as an operator
// tool**)" — so the commands are not deleted by this work, and the two paths must produce the same
// tenant. This is the section a reviewer should look hardest at: everything in §A–§E can be green
// while the act quietly disagrees with the staffed path about a default nobody re-reads.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("§G — signup and the staffed commands produce the same tenant (28-F13)", () => {
  it("the two paths' rows differ only in the values that were typed", async () => {
    const selfServe = await mustSignup(freshRequest("Self Serve"));
    const staffed = await staffedTenant("Staffed");

    const shapeOf = async (org_id: string, user_id: string) => {
      const org = await readOrg(db, org_id);
      const user = (await listUsers(db, org_id)).find((row) => row.user_id === user_id);
      const hash = (await storedPasswordHash(org_id, user_id)) as string;
      return {
        org_status: org?.status,
        org_named: typeof org?.display_name === "string" && org.display_name.length > 0,
        assignments: user?.assignments,
        grid_ordinal: user?.grid_ordinal,
        email_present: typeof user?.email === "string",
        argon: argonOf(hash),
        branches: (await listBranches(db, org_id)).length,
        credential_rows: (await credentialUserIds(org_id)).length,
      };
    };

    const fromSignup = await shapeOf(selfServe.org_id, selfServe.user_id);
    const fromCommands = await shapeOf(staffed.org_id, staffed.user_id);
    // ⚠ `branches` is the ONE member expected to differ and it is compared explicitly rather than
    // excluded: `create-branch` gave the staffed tenant one and `28-F13` REFUSES to give the
    // self-serve one any. Excluding it would have hidden a signup that quietly minted a branch.
    expect(fromSignup.branches).toBe(0);
    expect(fromCommands.branches).toBe(1);
    const { branches: _selfServeBranches, ...signupShape } = fromSignup;
    const { branches: _staffedBranches, ...commandShape } = fromCommands;
    expect(signupShape).toEqual(commandShape);
  });

  it("`15-F26`'s FIRST-owner rule is one rule: the staffed command still refuses a second owner", async () => {
    // Two writers of one fact is the hazard `28-F13` names; two READINGS of one refusal is the same
    // hazard wearing a different coat. `create-owner` refuses when `orgHasOwner` is true — so if
    // signup writes its owner by some other route, or with an assignment shape `orgHasOwner`'s
    // `@> '[{"role":"owner"}]'` predicate does not match, the command stops seeing it and a
    // self-onboarded org acquires a second "first" owner with a second minted password.
    const signed = await mustSignup(freshRequest("Second Owner"));
    await expect(
      createOwner(
        db,
        { org: signed.org_id, email: `second-${newId()}@signup.test`, name: "Second Owner" },
        BASE_T,
      ),
    ).rejects.toThrow(/already has an owner/);
  });

  it("R40 — the operator commands SURVIVE as declared scripts and are not deleted by this work", async () => {
    // R40: signup "Retires `create-org.ts` as the onboarding path (it survives as an operator
    // tool)". Read from the manifest rather than hardcoded, on the recorded reason every command
    // suite in this package already gives: a test that spawns a hardcoded `tsx src/create-org.ts`
    // stays green after the declared script is deleted.
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { scripts?: Record<string, string> };
    for (const script of ["create-org", "create-branch", "create-owner", "list-tenancy"]) {
      expect(manifest.scripts?.[script], `\`${script}\` is no longer a declared script`).toBeTypeOf(
        "string",
      );
    }
  });
});
