// Acceptance oracle — `01-F71` (e), THE REFERENCE-DATA SERVE PATH'S TWO REFUSALS.
//
// PROVENANCE: authored from spec text ONLY — `specs/01-kernel-sync.md` `01-F71` (its enforcement
// register and its "each point carries a test that FAILS when that point alone is removed"
// clause), `01-F75` (the closed resource set) and `01-F76` ("THE SERVER REFUSES FIRST, AND THE
// DEVICE'S REFUSAL IS THE BELT TO THAT BRACE"). The session that wrote this file wrote no
// implementation and read no line of `handleReference` before authoring it. ⚠ **Do NOT resolve a
// red here by editing an assertion** — every one of them quotes an FR id, and the FR is the
// contract (commandment 9).
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────
// `01-F71` requires a test BY NAME: "**Each point carries a test that FAILS when that point alone
// is removed.** Reading is not evidence and neither is a green suite: a suite exercising one
// tenant passes with all four deleted. **The test must run two tenants and mutate the point under
// test**, per the corpus's own mutation discipline (`20 §4.3`)."
//
// Point (e) — added to that register when the reference-data frames landed — shipped WITHOUT one.
// Measured by its implementer and confirmed in review: deleting the org check reds **0 of 471**
// gateway tests. Both refusals work; this was a coverage gap, not a defect.
//
// **The reason it was invisible is a FIXTURE property, and it is the thing to design against.**
// Every `reference_request` in this repo passes the session's OWN key: `catalog-transport.test.ts`
// declares `catalogRequest(org_id, have_version)` and calls it with `id.org_id` at every site;
// `catalog-pricing.test.ts` does the same; the step-5 contract suites exercise the CODEC, which
// `01-F76` says in terms is not where this lives ("a frame can carry a key, only a session can
// judge it"). **A fixture that cannot express a foreign key cannot test a refusal of one** — so
// the two builders below take the artifact key as an argument that is genuinely varied, and §A
// varies it across two REAL, POPULATED tenants.
//
// ── WHAT IS ASSERTED, AND WHY EACH ASSERTION IS THE ONE THE FR ASKS FOR ──────────────────────
// §A  The ORG half of (e). `01-F71` (e): "the only keys a session may ask for are its own org with
//     its own branch, or its own org with `branch_id: null` … anything else is **REFUSED as an
//     auth failure, never clamped** to the session's own — silently serving a different artifact
//     than the one asked for is exactly the mis-routing `01-F76` says makes scope decoration."
//     So three separate claims, and each needs its own assertion:
//       (1) it is REFUSED  — the request rejects rather than resolving;
//       (2) as an AUTH FAILURE — `AuthRejectedError`, which `01-F71` (e) names in terms, and
//           demonstrably NOT the resource refusal's class (two refusals share this site and a
//           mutant that collapses them into one must die);
//       (3) NEVER CLAMPED and NOTHING SERVED — not "the answer was empty". A clamp answers with
//           the session's OWN artifact, so an assertion that only checked for the FOREIGN rows
//           would bless it. §A therefore asserts the sink gained NOTHING AT ALL, and states the
//           leak and the clamp as two separate string properties over the whole recorded sink.
// §B  The BRANCH half of (e), at the same site. ⚠ **THIS SECTION WAS THE RESOURCE REFUSAL UNTIL
//     STEP 6 SERVED THE ROSTER, AND THE REPLACEMENT IS THE HANDOFF THIS FILE ALWAYS PROMISED**
//     (note (v) below, and the note that stood at (i)). While the gateway served `catalog` only,
//     the frame's key and the session's key could not differ on the branch axis at all: a
//     `catalog` request is pinned by the codec to `branch_id: null`, so there was no branch to
//     mismatch, and a `staff` frame died on the resource refusal first. A test aimed at the branch
//     half then would have stayed RED under a correct implementation, which this corpus records as
//     exactly as damaging as a vacuous one. **A `staff` request is the first frame that can state
//     the session's OWN org and ANOTHER BRANCH of it** — `01-F71` (e): "the only keys a session may
//     ask for are its own org with its own branch, or its own org with `branch_id: null` …
//     anything else is REFUSED as an auth failure, never clamped". Under R25 the roster's scope IS
//     its credential blast radius (`11-F21` hashes for everyone active at that branch), so a
//     device free to name a branch defeats that ruling in one field — which is why §B asserts the
//     same three claims §A does (refused · as an AUTH failure · nothing served, neither the asked
//     -for artifact nor the session's own) and does it on TWO tenants.
// §C  The anti-vacuity controls, without which §A and §B are worth nothing. See §C's header: a
//     refusal test passes for free whenever the thing under test cannot parse, cannot serve, or
//     has nothing to serve.
// §D  The SECOND clause of (e), which is a different claim from §A's and was uncovered. `01-F71`
//     (e)'s shipped sentence has two halves — the gateway "derives the artifact key from the
//     SESSION and refuses a request that states another" (§A) **and** "the response echoes the
//     SESSION's key". `01-F76` says why the second is load-bearing: "AN ARTIFACT IS
//     `(resource, scope)`, AND A VERSION NUMBER IS MEANINGLESS WITHOUT IT" — a device that is
//     handed a version under the wrong key stores it under the wrong key, every later comparison
//     agrees with itself, and `01-F77` makes that comparison "THE correctness mechanism of the
//     whole reference-data transport". So §D asserts the key on the answer, on two tenants, and
//     against the key the SAME session advertised at hello.
// §E  `01-F79`'s DIRECTION, asserted at the refusal that states it. `01-F79` fixes the pair as
//     `credential_change_request` (device →) and `credential_change_result` (→ device) — opposite
//     directions, one FR clause — and a gateway that refuses the first as a server→device kind
//     arriving inbound is telling a device something the FR that defines the frame says is false.
//     See §E's header for why the assertion is built by SUBSTITUTING the interpolated kind rather
//     than by matching prose.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT (and why each absence is correct) ────────────
// (i)  **WHAT A SERVED ARTIFACT CONTAINS.** This file is about the KEY and never about the rows:
//      who is in a branch roster and what each row carries is `01-F78`'s, and asserting it here
//      would put a second copy of `staff-over-the-wire.test.ts` §A behind an isolation header,
//      where a later edit would have to keep two suites in step. §A/§B assert only that the
//      artifact a session was refused is REAL — populated, and servable to the session it belongs
//      to — because a refusal over an empty artifact measures nothing.
//      *(This note used to record the branch half as OWED and UNREACHABLE, on `01-F71` (e)'s own
//      words. Step 6 made it reachable and §B is now it; the note is replaced rather than deleted
//      so the handoff is legible to the next reader.)*
// (ii) **WHICH of the two halves refuses a request that violates BOTH** (a `staff` frame naming
//      another tenant's org AND a branch of it). No FR rules the order, and both halves are the
//      same class by (e)'s own words — "refused as an auth failure" — so the distinction is not
//      observable from outside and asserting it would pin an implementation detail (commandment
//      2). §B keeps its two cases separate for this reason: each varies exactly one axis.
// (iii) **The device-side `foreign_artifact` belt** (`01-F76`) — a different plane and step 7.
//      `01-F76` calls it "the belt to this brace and never a substitute for it"; this file is the
//      brace.
// (iv) **That the echoed key came from the session rather than from a request that happens to
//      state the same thing.** §D's header carries the measurement: on today's served path the
//      two are the same value, so the distinction is not observable and asserting it would be
//      asserting nothing. §D asserts the value instead. This is the one absence here that is a
//      property of the SHIPPED SURFACE rather than of this file. ⚠ *It used to end "and it ends at
//      step 6" — a prediction, and a false one: step 6 serves a BRANCH-scoped resource and the
//      substitution still survives, because §B refuses a differing branch before anything is
//      echoed. Measured, 0 killed of 499; the row, and what would separate the two clauses, are in
//      §D's header. It ends when a session may legally ask for a key that is not its own, which no
//      FR presently permits.*
// (v)  **That `credential_change_request` is refused AT ALL, as a permanent property.** §E pins
//      what TODAY's refusal may not say; `01-F79`'s whole point is that this frame will one day
//      be served, and when the cloud half lands §E is retired by the same session that builds it
//      — exactly as §B's `staff` refusal WAS retired by step 6, and replaced by the branch-half
//      assertion the same behaviour made reachable. Neither section may be repaired by weakening
//      an assertion: both die honestly, when the behaviour they describe is replaced, and a
//      retirement that leaves nothing behind is a coverage loss wearing a green suite.
//
// ⚠ RUNS ON REAL POSTGRES (Testcontainers, `T-01-07`): fails LOUDLY with Docker down rather than
// skipping. Per-test isolation is BY FRESH ORG, never truncation (`helpers.ts`).

import { hashPin, newId } from "@restos/domain";
import { type ProtocolMessage, parseMessage } from "@restos/sync-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogEntry, publishCatalog } from "../catalog.js";
import {
  AuthRejectedError,
  createGateway,
  type Gateway,
  ProtocolViolationError,
} from "../index.js";
import { publishStaffRoster } from "../staff.js";
import { insertBranch, insertOrg, insertUser, type UserRow } from "../tenancy.js";
import {
  BASE_T,
  closeDb,
  type Db,
  freshIdentity,
  type Identity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pingMsg,
  type Session,
  TEST_TOKEN_SECRET,
} from "./helpers.js";

let db: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
});

// ── the two tenants ──────────────────────────────────────────────────────────────────────────
//
// `01-F71`: "The test must run two tenants". Both are REAL (registered, admitted, session-opening)
// and both are POPULATED with a catalog carrying a marker name unique to that tenant, because the
// whole point of §A is a comparison a one-tenant fixture cannot make: A is refused B's artifact
// while B's artifact provably EXISTS and is provably SERVABLE to B.

const MARKER_A = "A-ONLY Chapli Kebab";
const MARKER_B = "B-ONLY Nihari";

// The ROSTER markers §B compares. Every one is a distinct word rather than a numbered variant of
// its neighbour, because these are asserted with `not.toContain` over the whole recorded sink and
// a marker that is a substring of another marker would fail on a leak that never happened.
const ROSTER_A1 = "Roster person Farida";
const ROSTER_A2 = "Roster person Gulnaz";
const ROSTER_B = "Roster person Kulsoom";
const ROSTER_B1 = "Roster person Mehreen";
const ROSTER_B2 = "Roster person Parveen";
const ROSTER_A1_OTHER_TENANT = "Roster person Shazia";

/**
 * One priced item for a tenant. `01-F60`'s enabled set is a REQUIRED input to a publish and the
 * completeness check must actually RUN, so the grid is the smallest real one — this tenant's own
 * branch × one of `02-F42`'s channels — and the entry prices that exact cell.
 */
const pricedItem = (identity: Identity, id: string, name: string): CatalogEntry =>
  ({
    kind: "item",
    id,
    name,
    prices: [{ branch_id: identity.branch_id, channel: "counter", price_paisa: 145_000 }],
  }) as CatalogEntry;

const enabledFor = (identity: Identity) => ({
  branches: [identity.branch_id],
  channels: ["counter"],
});

/** Publishes this tenant's own one-entry catalog and returns the minted version. */
const publishFor = async (identity: Identity, entryId: string, name: string): Promise<number> =>
  await publishCatalog(db, identity.org_id, [pricedItem(identity, entryId, name)], {
    enabled: enabledFor(identity),
    now: BASE_T,
  });

// ── the BRANCH-scoped artifact §B is about (01-F76, R25) ─────────────────────────────────────
//
// A roster is `(staff, {org, branch})`, so a populated one is the only fixture in which "the
// session's own branch" and "another branch" are different VALUES rather than the same `null`.
// Each carries a marker name unique to its branch, for the same reason the catalog fixtures do:
// §B's leak and clamp properties are string properties over the whole recorded sink, and they can
// only distinguish two artifacts that are distinguishable.

/** One back-office credential, hashed once — `hashPin` is deliberately ~0.4 s (`01-F61`'s floor). */
let backOfficeHash: string | undefined;
const password = async (): Promise<string> => {
  backOfficeHash ??= await hashPin("tenant-isolation-back-office-secret");
  return backOfficeHash;
};

/**
 * A published roster for THIS identity's branch, holding one person named `marker`.
 *
 * `01-F68` forbids a foreign key, so the directory rows are written first or `publishStaffRoster`
 * refuses the branch by name (`15-F27`) — the refusal is the writer's, here or nowhere.
 */
const rosterAt = async (identity: Identity, marker: string): Promise<number> => {
  await insertOrg(db, {
    org_id: identity.org_id,
    display_name: `Org ${identity.org_id.slice(0, 12)}`,
    status: "active",
    created_at: BASE_T,
  });
  await insertBranch(db, {
    branch_id: identity.branch_id,
    org_id: identity.org_id,
    display_name: `Branch ${identity.branch_id.slice(0, 12)}`,
    branch_type: "branch",
    branch_class: "production",
    created_at: BASE_T,
  });
  const user_id = newId();
  await insertUser(db, {
    user_id,
    org_id: identity.org_id,
    display_name: marker,
    // R30: a till-only cashier needs no email, and `users_email_lower_uq` is GLOBAL — inventing
    // one per fixture would make these tests collide with each other rather than isolate.
    email: null,
    password_hash: await password(),
    assignments: [{ role: "cashier", branch_id: identity.branch_id, status: "active" }],
    grid_ordinal: 0,
    created_at: BASE_T,
  } as unknown as UserRow);
  return await publishStaffRoster(
    db,
    { org_id: identity.org_id, branch_id: identity.branch_id },
    [user_id],
    { now: BASE_T },
  );
};

/** A SIBLING branch of the same tenant — the key `01-F71` (e)'s branch half is about. */
const siblingBranchOf = (identity: Identity): Identity => ({
  ...identity,
  branch_id: newId(),
  device_id: newId(),
});

// ── the frame builders — the ones that can express a key that is not the session's ───────────
//
// **Both go through `parseMessage`.** That is not ceremony: the step-5 oracle recorded that
// NINETEEN of its refusal assertions passed for free because the codec could not parse the frame
// at all, and "a refusal test passes for free whenever the thing under test cannot parse". If a
// foreign-keyed frame were not wire-legal, every assertion below would be a statement about the
// codec and none of them about the enforcement point. `01-F76` puts the division plainly: "a frame
// can carry a key, only a session can judge it." §C1 asserts the anchor rather than assuming it.

/** A `catalog` fetch naming an ARBITRARY org — the catalog is ORG-scoped, so `branch_id` is null. */
const catalogRequestFor = (orgId: string, haveVersion = 0): ProtocolMessage =>
  parseMessage({
    v: 2,
    kind: "reference_request",
    resource: "catalog",
    scope: { org_id: orgId, branch_id: null },
    have_version: haveVersion,
  });

/** A `staff` fetch naming an ARBITRARY key — the roster is BRANCH-scoped (`01-F76`, R25). */
const staffRequestFor = (orgId: string, branchId: string, haveVersion = 0): ProtocolMessage =>
  parseMessage({
    v: 2,
    kind: "reference_request",
    resource: "staff",
    scope: { org_id: orgId, branch_id: branchId },
    have_version: haveVersion,
  });

// ── §E's two frames, and the ONE property that distinguishes them ────────────────────────────
//
// `01-F79` mints the pair and fixes its directions in the same clause: "**The pair is
// `credential_change_request` (device →) and `credential_change_result` (→ device)**". They are
// the sharpest possible pair for a direction assertion because they differ in nothing else — same
// FR, same act, same session, adjacent names — so a refusal that treats them alike has confused
// exactly the thing the FR decided.

const KIND_REQUEST = "credential_change_request";
const KIND_RESULT = "credential_change_result";

/**
 * The DEVICE-ORIGINATED half. `01-F79`: "what travels is the NEW HASH, never either PIN", so the
 * fixture carries an Argon2id hash — a typed PIN is unrepresentable in this field by schema, and
 * a fixture that had to be a PIN to be wire-legal would make §E a test of the codec.
 */
const credentialChangeRequestFrame = (userId: string): ProtocolMessage =>
  parseMessage({
    v: 2,
    kind: KIND_REQUEST,
    user_id: userId,
    new_pin_hash: "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzYWx0$aGFzaGhhc2hoYXNoaGFzaA",
  });

/** The SERVER-ORIGINATED half — `01-F79`'s outcome frame, one of its closed set of four. */
const credentialChangeResultFrame = (): ProtocolMessage =>
  parseMessage({ v: 2, kind: KIND_RESULT, result: "unavailable" });

/**
 * The refusal itself, as a VALUE — so a test can assert the class it IS and the class it is NOT.
 *
 * A resolving request is failed here by name rather than by a later assertion, because a CLAMP is
 * exactly the implementation that resolves: `01-F71` (e) forbids "silently serving a different
 * artifact than the one asked for", and a clamp's tell is that nothing was thrown at all.
 */
const refusalOf = async (act: Promise<unknown>, what: string): Promise<unknown> => {
  try {
    await act;
  } catch (error) {
    return error;
  }
  throw new Error(
    `01-F71 (e): ${what} RESOLVED instead of being refused — a serve path that answers a key ` +
      "that is not the session's is the clamp this FR forbids, never a refusal",
  );
};

/** Everything the device has been sent, as text — for the leak and clamp properties. */
const sinkText = (session: Session): string => JSON.stringify(session.rec.all);

/**
 * The served rows, narrowed to the CATALOG artifact — and the narrowing is an ASSERTION rather
 * than a cast, on `01-F75`'s own ground: `entries[]` is typed PER RESOURCE, so a
 * `reference_response` is a union and a reader that wants catalog rows must say so. A cast here
 * would let a `staff`-shaped payload satisfy a catalog expectation, which is the cross-resource
 * payload the frame exists to make unrepresentable.
 */
const catalogEntriesOf = (
  response: Extract<ProtocolMessage, { kind: "reference_response" }>,
): readonly { id: string; name: string }[] => {
  if (response.resource !== "catalog")
    throw new Error(`expected a catalog artifact, got ${response.resource}`);
  return response.entries;
};

/**
 * The response's ARTIFACT KEY, narrowed the same way and for the same reason: `01-F76` makes the
 * key the PAIR `(resource, scope)`, so a reader that took `scope` off the union alone would be
 * asserting half a key. Returned as one object so a test compares the pair and never one axis.
 */
const artifactKeyOf = (
  response: Extract<ProtocolMessage, { kind: "reference_response" }>,
): { resource: "catalog"; scope: { org_id: string; branch_id: null } } => {
  if (response.resource !== "catalog")
    throw new Error(`expected a catalog artifact, got ${response.resource}`);
  return { resource: response.resource, scope: response.scope };
};

/**
 * The one `staff` answer this session received, narrowed the same way and for the same reason —
 * and a NAMED failure when there is none, because every §B anti-vacuity leg passes for free
 * against a session that was served nothing at all.
 */
const staffServedTo = (
  session: Session,
  label: string,
): Extract<ProtocolMessage, { kind: "reference_response"; resource: "staff" }> => {
  const frame = ofKind(session.rec.all, "reference_response").find(
    (
      response,
    ): response is Extract<ProtocolMessage, { kind: "reference_response"; resource: "staff" }> =>
      response.resource === "staff",
  );
  if (frame === undefined) {
    throw new Error(
      `${label}: no staff reference_response reached this session — the anti-vacuity leg of a ` +
        "refusal test is what makes the refusal a measurement (01-F75 closes the resource set at " +
        "`catalog` and `staff`, and step 6 serves both)",
    );
  }
  return frame;
};

describe("§A — 01-F71 (e): the artifact key comes from the SESSION, and a request stating another org is refused", () => {
  it("01-F71 (e): org A's session asking for org B's catalog is refused as an AUTH failure, and nothing is served", async () => {
    const tenantA = freshIdentity();
    const tenantB = freshIdentity();

    // Two tenants, both populated. B's artifact must EXIST for "A was served nothing of B's" to
    // be a measurement rather than a tautology about an empty org.
    const versionA = await publishFor(tenantA, "IA1", MARKER_A);
    const versionB = await publishFor(tenantB, "IB1", MARKER_B);
    expect(versionA).toBe(1);
    expect(versionB).toBe(1);

    const sessionA = await openSession(gateway, tenantA);
    const beforeCount = sessionA.rec.all.length;

    // The act: a WIRE-LEGAL request from A's session naming B's artifact key.
    const error = await refusalOf(
      sessionA.conn.handle(catalogRequestFor(tenantB.org_id)),
      "a catalog request from org A naming org B's key",
    );

    // (1)+(2) — refused, and refused as an AUTH failure. `01-F71` (e) names the class: "an
    // `AuthRejectedError`, never a clamp". Asserting the class it is NOT matters because a second,
    // different refusal lives at this same site (§B): a mutant that answered both with one class
    // would make the auth boundary indistinguishable from a resource typo.
    expect(error).toBeInstanceOf(AuthRejectedError);
    expect(error).not.toBeInstanceOf(ProtocolViolationError);

    // (3) — NOTHING SERVED. Not "an empty answer": `01-F71` (e) forbids a refusal that is really a
    // narrowing, so the strong form is that the sink gained no frame at all.
    expect(ofKind(sessionA.rec.all, "reference_response")).toHaveLength(0);
    expect(sessionA.rec.all).toHaveLength(beforeCount);

    // The LEAK property, stated over the whole sink rather than over one frame kind — an
    // implementation that served B's rows under any other kind fails here too.
    expect(sinkText(sessionA)).not.toContain(MARKER_B);
    expect(sinkText(sessionA)).not.toContain(tenantB.org_id);

    // The CLAMP property, and it is a SEPARATE claim: a clamp serves A its own artifact, which
    // contains none of B's bytes and would satisfy every assertion above but this one.
    expect(sinkText(sessionA)).not.toContain(MARKER_A);

    // ANTI-VACUITY: B's artifact is real and reachable BY B. Without this the whole test passes
    // against a gateway that serves no catalog to anyone, which is the shape of the defect this
    // corpus keeps recording.
    const sessionB = await openSession(gateway, tenantB);
    await sessionB.conn.handle(catalogRequestFor(tenantB.org_id));
    const servedToB = must(
      ofKind(sessionB.rec.all, "reference_response")[0],
      "B's own reference_response — the artifact A was refused",
    );
    expect(servedToB.resource).toBe("catalog");
    expect(catalogEntriesOf(servedToB).map((entry) => entry.name)).toEqual([MARKER_B]);
  });

  it("01-F71 (e): the SAME session and the SAME fixture is served its OWN key — the refusal is about the key, not a dead path", async () => {
    // The attribution control for the test above, differing in exactly one value: the org named in
    // the frame. Without it, "A was refused" is equally consistent with a serve path that refuses
    // everything, and the mutation numbers would attribute nothing.
    const tenantA = freshIdentity();
    const tenantB = freshIdentity();
    await publishFor(tenantA, "IA1", MARKER_A);
    await publishFor(tenantB, "IB1", MARKER_B);

    const sessionA = await openSession(gateway, tenantA);
    await sessionA.conn.handle(catalogRequestFor(tenantA.org_id));

    const served = must(
      ofKind(sessionA.rec.all, "reference_response")[0],
      "A's reference_response for its OWN key",
    );
    expect(served.resource).toBe("catalog");
    expect(served.form).toBe("snapshot");
    expect(catalogEntriesOf(served).map((entry) => entry.name)).toEqual([MARKER_A]);
    // And the isolation property from the other side: A's own artifact carries nothing of B's.
    expect(sinkText(sessionA)).not.toContain(MARKER_B);
  });
});

describe("§B — 01-F71 (e), the BRANCH half: the only branch a session may name is its own", () => {
  // The branch comes from the DEVICE's own identity (`01-F65`; `01-F72` (b) makes the certificate
  // name `(org_id, branch_id, device_id)`), so a `staff` frame stating a different branch is a
  // client role claim, and commandment 8 does not trust one. R25 is why it is the sharp case: the
  // roster's scope IS its credential blast radius, so honouring a stated branch hands a device the
  // Argon2id hashes of people at a branch its credential never covered — and CLAMPING to the
  // session's own is the mis-routing `01-F76` says makes scope decoration. Both are refused here,
  // by two separate assertions, because a refusal and an empty answer are different claims.
  it("01-F71 (e): a device asking for its OWN org's OTHER branch is refused as an AUTH failure, and NEITHER roster is served", async () => {
    // Two tenants, per `01-F71`'s own clause, and one of them has two branches — which is the
    // shape the branch half needs and the org half cannot produce.
    const branchA1 = freshIdentity();
    const branchA2 = siblingBranchOf(branchA1);
    const tenantB = freshIdentity();
    expect(await rosterAt(branchA1, ROSTER_A1)).toBe(1);
    expect(await rosterAt(branchA2, ROSTER_A2)).toBe(1);
    expect(await rosterAt(tenantB, ROSTER_B)).toBe(1);
    // Both branches are at version 1 on purpose: `01-F76`'s whole warning is that one number means
    // different bytes at different branches, so a mis-served artifact is UNDETECTABLE by version.
    expect(branchA1.org_id).toBe(branchA2.org_id);
    expect(branchA1.branch_id).not.toBe(branchA2.branch_id);

    const sessionA1 = await openSession(gateway, branchA1);
    const beforeCount = sessionA1.rec.all.length;

    const error = await refusalOf(
      sessionA1.conn.handle(staffRequestFor(branchA1.org_id, branchA2.branch_id)),
      "a `staff` request naming a SIBLING branch of the session's own org",
    );

    // (1)+(2) — refused, and as an AUTH failure: `01-F71` (e) puts both halves in one sentence —
    // "anything else is REFUSED as an auth failure, never clamped" — so a branch a session may not
    // name is the same class of wrong as an org it may not name, and demonstrably not the protocol
    // violation a malformed frame would be.
    expect(error).toBeInstanceOf(AuthRejectedError);
    expect(error).not.toBeInstanceOf(ProtocolViolationError);

    // (3) — NOTHING SERVED, in §A's strong form.
    expect(ofKind(sessionA1.rec.all, "reference_response")).toHaveLength(0);
    expect(sessionA1.rec.all).toHaveLength(beforeCount);

    // THE LEAK property: the artifact that was asked for must not arrive by any road.
    expect(sinkText(sessionA1)).not.toContain(ROSTER_A2);
    expect(sinkText(sessionA1)).not.toContain(branchA2.branch_id);

    // THE CLAMP property, and it is the separate claim this section exists for. A clamp answers
    // with the session's OWN roster — which contains none of A2's bytes and satisfies every
    // assertion above. It is also the mutant that becomes REACHABLE the moment a branch-scoped
    // resource is served: with this check deleted, an implementation that echoes the request's
    // key serves A2's people, and one that derives the key from the session serves A1's under a
    // number the device will store as A2's.
    expect(sinkText(sessionA1)).not.toContain(ROSTER_A1);

    // ANTI-VACUITY 1 — the same session, the same frame kind, its OWN branch: SERVED. Without it
    // "refused" is equally consistent with a gateway that serves no roster to anyone, which is
    // exactly what this file's previous §B was pinning.
    await sessionA1.conn.handle(staffRequestFor(branchA1.org_id, branchA1.branch_id));
    const own = staffServedTo(sessionA1, "§B anti-vacuity: A1's own roster");
    expect(own.scope).toEqual({ org_id: branchA1.org_id, branch_id: branchA1.branch_id });
    expect(JSON.stringify(own)).toContain(ROSTER_A1);

    // ANTI-VACUITY 2 — A2's roster is real and reachable, BY A DEVICE AT A2. "A1 was served
    // nothing of A2's" is otherwise a statement about an empty branch.
    const sessionA2 = await openSession(gateway, branchA2);
    await sessionA2.conn.handle(staffRequestFor(branchA2.org_id, branchA2.branch_id));
    expect(JSON.stringify(staffServedTo(sessionA2, "§B anti-vacuity: A2's own roster"))).toContain(
      ROSTER_A2,
    );
  });

  it("01-F71 (e): the branch refusal is a property of the SERVE PATH, not of one tenant — and another TENANT's roster key is refused at the same site", async () => {
    // Two tenants again, and here it buys attribution twice over: a guard that happened to fire on
    // one org's state passes the test above and fails this one, and the second case varies the ORG
    // axis while holding the frame's shape fixed — so the two enforcement halves are exercised on
    // one resource without either standing in for the other.
    const branchB1 = freshIdentity();
    const branchB2 = siblingBranchOf(branchB1);
    const tenantA = freshIdentity();
    await rosterAt(branchB1, ROSTER_B1);
    await rosterAt(branchB2, ROSTER_B2);
    await rosterAt(tenantA, ROSTER_A1_OTHER_TENANT);

    const sessionB1 = await openSession(gateway, branchB1);
    const beforeSibling = sessionB1.rec.all.length;

    const sibling = await refusalOf(
      sessionB1.conn.handle(staffRequestFor(branchB1.org_id, branchB2.branch_id)),
      "the second tenant's device naming its own org's other branch",
    );
    expect(sibling).toBeInstanceOf(AuthRejectedError);
    expect(ofKind(sessionB1.rec.all, "reference_response")).toHaveLength(0);
    expect(sessionB1.rec.all).toHaveLength(beforeSibling);
    expect(sinkText(sessionB1)).not.toContain(ROSTER_B2);
    expect(sinkText(sessionB1)).not.toContain(ROSTER_B1);

    // The ORG axis on the same resource: a key that is real, populated and belongs to somebody
    // else entirely. `00 §5.4` calls org isolation absolute, and a roster is the artifact where
    // crossing it costs credentials rather than a menu.
    const beforeForeign = sessionB1.rec.all.length;
    const foreign = await refusalOf(
      sessionB1.conn.handle(staffRequestFor(tenantA.org_id, tenantA.branch_id)),
      "the second tenant's device naming ANOTHER tenant's roster key",
    );
    expect(foreign).toBeInstanceOf(AuthRejectedError);
    expect(ofKind(sessionB1.rec.all, "reference_response")).toHaveLength(0);
    expect(sessionB1.rec.all).toHaveLength(beforeForeign);
    expect(sinkText(sessionB1)).not.toContain(ROSTER_A1_OTHER_TENANT);
    expect(sinkText(sessionB1)).not.toContain(tenantA.org_id);

    // ANTI-VACUITY — this session is alive and this serve path answers it on its own key.
    await sessionB1.conn.handle(staffRequestFor(branchB1.org_id, branchB1.branch_id));
    expect(JSON.stringify(staffServedTo(sessionB1, "§B anti-vacuity: B1's own roster"))).toContain(
      ROSTER_B1,
    );
  });
});

describe("§C — the anti-vacuity controls: what would make every assertion above pass for free", () => {
  it("01-F76: BOTH refused frames are WIRE-LEGAL — the codec is not what refuses them", async () => {
    // `01-F76`: "a frame can carry a key, only a session can judge it." If a foreign-keyed frame
    // or a `staff` frame did not parse, §A and §B would be assertions about `parseMessage` and the
    // enforcement point would be untested — which is precisely how nineteen of the step-5 oracle's
    // refusal assertions passed against a codec that could not parse `reference_*` at all.
    const tenantA = freshIdentity();
    const tenantB = freshIdentity();

    const foreign = catalogRequestFor(tenantB.org_id);
    expect(foreign.kind).toBe("reference_request");
    if (foreign.kind !== "reference_request") throw new Error("unreachable");
    expect(foreign.resource).toBe("catalog");
    // The key survives the codec verbatim — a frame that arrived carrying the SESSION's org would
    // make §A a test of nothing.
    expect(foreign.scope).toEqual({ org_id: tenantB.org_id, branch_id: null });
    expect(foreign.scope.org_id).not.toBe(tenantA.org_id);

    const staff = staffRequestFor(tenantA.org_id, tenantA.branch_id);
    if (staff.kind !== "reference_request") throw new Error("unreachable");
    expect(staff.resource).toBe("staff");
    expect(staff.scope).toEqual({ org_id: tenantA.org_id, branch_id: tenantA.branch_id });
  });

  it("01-F52/01-F71 (e): a fresh session's own EMPTY org is served an answer, not a refusal — 'nothing served' is a refusal's signature and not an empty org's", async () => {
    // The last way §A could pass for free: if a session that asked for a key it IS entitled to got
    // nothing back either, then "no frame arrived" would say nothing about the key. An org that has
    // published nothing still gets an ANSWER (`01-F56`'s snapshot at version 0), and the contrast
    // between that and §A's silence is what makes §A's assertion mean "refused".
    const tenant = freshIdentity();
    const session = await openSession(gateway, tenant);
    await session.conn.handle(catalogRequestFor(tenant.org_id));

    const served = must(
      ofKind(session.rec.all, "reference_response")[0],
      "a reference_response for an entitled key over an org that has published nothing",
    );
    expect(served.resource).toBe("catalog");
    expect(served.entries).toHaveLength(0);
  });
});

describe("§D — 01-F71 (e), the second clause: the ANSWER carries the SESSION's artifact key", () => {
  // `01-F71` (e) is one sentence with two verbs and §A only covers the first. The second —
  // "**and the response echoes the SESSION's key**" — is what makes a served version usable:
  // `01-F76` opens with "AN ARTIFACT IS `(resource, scope)`, AND A VERSION NUMBER IS MEANINGLESS
  // WITHOUT IT", and its own consequence clause spells out what an unlabelled or mislabelled
  // answer costs — "a mis-routed roster applies silently as version N, every later comparison
  // agrees with itself, and the divergence `01-F56` exists to detect is undetectable by
  // construction". The device-side `foreign_artifact` belt cannot see it either: a key it was
  // handed is a key it will accept as "one of its own" whenever the server chose it.
  //
  // ⚠ **WHAT §D CAN AND CANNOT SEPARATE — THE OBVIOUS MUTANT IS A NO-OP, AND THAT IS MEASURED
  // RATHER THAN ARGUED (2026-08-19, out of tree).** Substituting `scope: message.scope` for the
  // session's key on the CATALOG arm — the mutant that reads like the whole point of this section
  // — is **481/481 GREEN with §D present** (the suite was 481 that day and is 499 now; the same
  // substitution was re-measured on the `staff` arm below and survives there too). It is not
  // surviving because the echo is unasserted; it survives
  // because it is the SAME VALUE. On the path that is served today the frame's key and the
  // session's key are equal *by construction*: §A's refusal makes `org_id` equal before the serve
  // is reached, and `01-F76`'s ONE SHAPE plus `01-F52`'s org-scoped catalog makes `branch_id`
  // `null` on both sides — a branch-scoped `catalog` request is not wire-legal at all (§C1). No
  // black-box test can kill it, and one that appeared to would be measuring something else.
  // **The attribution that proves §D still bites**, from the same run: a key that is genuinely
  // not the session's — a constant in place of the derivation — is **2 failed of 481 with this
  // file present and 471 passed, exit 0, with it hidden**, while re-spelling the SAME key — the
  // members reordered and the org read through a template literal — kills 0. So the section is
  // sensitive to the key's VALUE and blind only to a rewrite that cannot change it.
  // ⚠ **AND THAT SURVIVAL IS UNCHANGED NOW THAT A BRANCH-SCOPED RESOURCE IS SERVED. THE EARLIER
  // VERSION OF THIS PARAGRAPH PREDICTED OTHERWISE, THE PREDICTION WAS WRONG, AND IT IS REPLACED
  // HERE BY THE MEASUREMENT RATHER THAN BY A BETTER ARGUMENT (2026-08-19, out of tree, control
  // 499/499 with step 6's serve path in place).** It said the two clauses "become separable the
  // moment a BRANCH-scoped resource is served", on the reasoning that `{own org, another branch of
  // the same org}` would then reach the serve with the two keys differing.
  //   · **The row: the `staff` arm's served key taken from the REQUEST (`message.scope`) with
  //     `01-F71` (e)'s branch check LEFT STANDING — `0 killed of 499`.** Not 0 in this file: 0 in
  //     the whole gateway suite. The branch half refuses a differing key before anything is
  //     served, so by the time a key is echoed the frame's and the session's are equal on the
  //     branch axis for exactly the reason they are already equal on the org axis.
  //   · **What WOULD separate them: nothing, while the check stands.** The observable mutant is a
  //     TWO-branch one — delete the branch check AND echo the request — and its first half is what
  //     dies: that row is `2 failed of 499`, both of them §B's, and deleting the check ALONE is the
  //     same 2. So §B is the whole kill and the echo contributes nothing measurable on this
  //     resource either. The second clause of (e) has **no black-box witness** on any resource the
  //     gateway serves today; §D asserts the key's VALUE, which is what remains assertable.
  //   · The prediction was also written into the commit message that landed §B, where it cannot be
  //     corrected. **This file is the correction**, and it is stated as a measurement so the next
  //     reader can re-run it rather than re-reason it.
  // The transferable point is the one this file keeps recording, now with the ending it actually
  // had: a prediction about what a future change makes observable is a claim with a shelf life,
  // this one expired in the same step that was supposed to fulfil it, and it survived one round of
  // being "corrected" by reasoning before anybody measured it.
  it("01-F71 (e)/01-F76: two tenants, two answers, and each carries ITS OWN key — (catalog, {own org, null})", async () => {
    const tenantA = freshIdentity();
    const tenantB = freshIdentity();
    await publishFor(tenantA, "IA1", MARKER_A);
    await publishFor(tenantB, "IB1", MARKER_B);

    const sessionA = await openSession(gateway, tenantA);
    await sessionA.conn.handle(catalogRequestFor(tenantA.org_id));
    const servedA = must(
      ofKind(sessionA.rec.all, "reference_response")[0],
      "A's reference_response for its own key",
    );

    const sessionB = await openSession(gateway, tenantB);
    await sessionB.conn.handle(catalogRequestFor(tenantB.org_id));
    const servedB = must(
      ofKind(sessionB.rec.all, "reference_response")[0],
      "B's reference_response for its own key",
    );

    // The key is the PAIR (`01-F76`), so it is compared as a pair. `branch_id: null` is not
    // decoration here: `01-F52`/`01-F76` keep the catalog ORG-scoped precisely so one version
    // number does not mean different bytes on different devices, and a branch on this key is that
    // ruling reversed in one field.
    expect(artifactKeyOf(servedA)).toEqual({
      resource: "catalog",
      scope: { org_id: tenantA.org_id, branch_id: null },
    });
    expect(artifactKeyOf(servedB)).toEqual({
      resource: "catalog",
      scope: { org_id: tenantB.org_id, branch_id: null },
    });

    // ATTRIBUTION — two tenants is what makes this a derivation rather than a constant. A key
    // hard-coded, cached from the first session, or taken from a module-level value satisfies one
    // of the two expectations above and dies here.
    expect(artifactKeyOf(servedA)).not.toEqual(artifactKeyOf(servedB));

    // The session has three ids and only one of them is the artifact's org. A key built from the
    // wrong one is still a wire-legal `min(1)` string, which is why each is named rather than
    // left to the equality above to catch by luck.
    expect(servedA.scope.org_id).not.toBe(tenantA.branch_id);
    expect(servedA.scope.org_id).not.toBe(tenantA.device_id);
    // …and the answer A was given names nothing of B's, which is §A's leak property restated
    // about the KEY rather than about the rows.
    expect(servedA.scope.org_id).not.toBe(tenantB.org_id);
  });

  it("01-F76/01-F77: the answer's key is the key that session ADVERTISED at hello — one artifact, two frames, or nothing reconciles", async () => {
    // `01-F77` makes `hello_ack.reference_versions` "an ARRAY of `{ resource, scope, version }`"
    // and calls it "THE correctness mechanism of the whole reference-data transport … the device
    // compares each key against its own stored version and fetches the ones it is behind on". The
    // comparison is BY KEY. So the key the session advertises and the key the session answers
    // with are one value stated twice, and a device holding two spellings of it re-fetches for
    // ever while believing it is current — `01-F76`'s "a version number is meaningless without
    // its key" reached from the other end. Asserting the two frames AGAINST EACH OTHER is what
    // makes this more than a second copy of the test above: it binds both sites at once.
    const tenants = [freshIdentity(), freshIdentity()];
    await publishFor(must(tenants[0], "tenant A"), "IA1", MARKER_A);
    await publishFor(must(tenants[1], "tenant B"), "IB1", MARKER_B);

    for (const tenant of tenants) {
      const session = await openSession(gateway, tenant);
      const advertised = must(
        (session.helloAck.reference_versions ?? []).find((entry) => entry.resource === "catalog"),
        `hello_ack's catalog key for org ${tenant.org_id} — 01-F77 omits an artifact the org has ` +
          "published nothing for, and this tenant has published one",
      );
      await session.conn.handle(catalogRequestFor(tenant.org_id));
      const served = must(
        ofKind(session.rec.all, "reference_response")[0],
        "the reference_response for this session's own key",
      );

      expect(artifactKeyOf(served).scope).toEqual(advertised.scope);
      // …and both are the session's own key rather than merely equal to each other, which two
      // sites reading one wrong value would also satisfy.
      expect(advertised.scope).toEqual({ org_id: tenant.org_id, branch_id: null });
      // ANTI-VACUITY: the pair is (key, version) and the version half must travel with it —
      // nothing published between hello and the fetch, so an answer at a different version would
      // mean the two frames are counting different things under one key.
      expect(served.version).toBe(advertised.version);
    }
  });
});

describe("§E — 01-F79: `credential_change_request` is device→server, and the refusal must not say otherwise", () => {
  // `01-F79` decides the direction of this pair in the clause that mints it, and the direction IS
  // the resolution: `01-F62` makes `user.changed` org-scoped so "a till has no legal envelope for
  // it", and commandment 5 forbids an operational screen calling `services/api` — so "the till
  // REQUESTS and the cloud RECORDS". A refusal that calls `credential_change_request` a
  // server→device kind states the opposite of the only reason the frame exists, and a device's
  // log is where a human reads it.
  //
  // ── WHY THE ASSERTION IS A SUBSTITUTION AND NOT A STRING MATCH ────────────────────────────
  // §B's finding, recorded in `01-F71` (e)'s own register, is that "a control rewording both
  // refusals kills 0" — a refusal is free to be reworded, and an assertion that dies when it is
  // reworded is pinning prose rather than meaning. The meaning here lives in ONE value: the kind
  // the sentence is about. So the test takes the sentence the gateway uses for a genuine
  // server→device kind — `credential_change_result`, which `01-F79` fixes as → device in the same
  // breath — substitutes the interpolated kind, and requires that this is NOT what a
  // `credential_change_request` receives. Reword either sentence and both sides move together;
  // point the server→device sentence at this kind and it fails.
  //
  // Measured out of tree, 2026-08-19, one row per mutant, `REAL_EXIT` read from a marker inside
  // each log: **deleting this kind's arm so it falls into `default:` — the exact regression, and
  // the shape the correction reversed — is 1 failed of 481, by name, and 471 passed exit 0 with
  // this file hidden. Regressing the arm IN PLACE to the server→device sentence is the same 1.**
  // Rewording this kind's refusal kills 0; rewording the `default:` sentence while it still
  // interpolates the kind kills 0. Removing the interpolation from `default:` DOES kill this test
  // — that is the anchor below doing its job and not an accident: a session-law refusal that
  // names no kind tells a device only that "it did not work" (`00 §5.7`), and it would leave the
  // substitution comparing two sentences that were never about anything.
  it("01-F79: the refusal for `credential_change_request` is not the server→device sentence with the kind swapped, and nothing is served", async () => {
    const tenant = freshIdentity();
    const session = await openSession(gateway, tenant);
    const beforeCount = session.rec.all.length;

    // The CONTROL END of the differential, and it is an assertion in its own right: `01-F79`
    // makes `credential_change_result` → device, so a session law refusing it inbound is correct
    // and is the sentence the other half must not share.
    const resultRefusal = await refusalOf(
      session.conn.handle(credentialChangeResultFrame()),
      `a \`${KIND_RESULT}\` (→ device, 01-F79) arriving inbound`,
    );
    expect(resultRefusal).toBeInstanceOf(ProtocolViolationError);
    const resultText = (resultRefusal as Error).message;
    // The substitution below says nothing unless the sentence NAMES the kind it is about — this
    // is the anchor that keeps the whole test from passing for free against a refusal that
    // interpolates nothing.
    expect(resultText).toContain(KIND_RESULT);

    const requestRefusal = await refusalOf(
      session.conn.handle(credentialChangeRequestFrame(`${tenant.org_id}-operator`)),
      `a \`${KIND_REQUEST}\` (device →, 01-F79) arriving inbound`,
    );
    expect(requestRefusal).toBeInstanceOf(ProtocolViolationError);
    const requestText = (requestRefusal as Error).message;
    // Same anchor on this side: a refusal that does not name the kind cannot tell a device which
    // of its frames this deployment would not take (`00 §5.7`).
    expect(requestText).toContain(KIND_REQUEST);

    // ── THE CLAIM ────────────────────────────────────────────────────────────────────────────
    // The two members of `01-F79`'s pair travel in OPPOSITE directions, so they cannot be refused
    // by one rule. If the sentence a server→device kind gets, re-aimed at this kind, is the
    // sentence this kind gets, then the direction the FR fixed has been applied backwards.
    const serverToDeviceSentenceAboutThisKind = resultText.split(KIND_RESULT).join(KIND_REQUEST);
    expect(requestText).not.toBe(serverToDeviceSentenceAboutThisKind);

    // NOTHING SERVED, in §A's and §B's strong form. `01-F79` closes the outcome set at four and
    // every one of them is a claim about an act that was attempted — `unavailable` says the WAN
    // was the obstacle, which on a live session is a reason that is not the reason (`00 §5.7`
    // requires the till to say WHICH of the four happened). A gateway with no serve path for the
    // act therefore has no honest outcome to send.
    expect(ofKind(session.rec.all, KIND_RESULT)).toHaveLength(0);
    expect(session.rec.all).toHaveLength(beforeCount);
  });

  it("01-F79: both frames are WIRE-LEGAL and the session is LIVE — §E's refusals are about the KIND, not the codec and not a dead connection", async () => {
    // The two ways §E could pass for free, and they are the two §C already names for §A and §B.
    // (1) An unparseable frame: "a refusal test passes for free whenever the thing under test
    // cannot parse", which is how nineteen of the step-5 oracle's refusal assertions passed. (2)
    // A connection that refuses everything — then "it was refused" is a fact about the session
    // rather than about the kind, and the differential above would compare two sentences from a
    // path neither frame reached.
    const tenant = freshIdentity();
    const session = await openSession(gateway, tenant);

    const request = credentialChangeRequestFrame(`${tenant.org_id}-operator`);
    expect(request.kind).toBe(KIND_REQUEST);
    if (request.kind !== "credential_change_request") throw new Error("unreachable");
    // The credential survives the codec verbatim — `01-F79`: "what travels is the NEW HASH".
    expect(request.new_pin_hash.startsWith("$argon2id$")).toBe(true);

    const result = credentialChangeResultFrame();
    expect(result.kind).toBe(KIND_RESULT);

    // The same connection, in the same state, answers a legal device→server frame. `ping`/`pong`
    // is the smallest one that proves it without touching either enforcement point.
    await session.conn.handle(pingMsg(BASE_T));
    expect(ofKind(session.rec.all, "pong")).toHaveLength(1);
  });
});
