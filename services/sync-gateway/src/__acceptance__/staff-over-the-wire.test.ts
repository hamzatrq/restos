// Acceptance oracle — STEP 6: THE GATEWAY SERVES THE BRANCH ROSTER (`01-F75`/`01-F77`/`01-F78`).
//
// PROVENANCE: authored from spec text ONLY — `specs/01-kernel-sync.md` `01-F75` (the one
// resource-discriminated frame, its two credential-door amendments and its PRODUCER clause),
// `01-F76` (an artifact is `(resource, scope)`; fan-out keyed by the artifact key), `01-F77`
// (`hello_ack.reference_versions`, omitted-never-zero per key), `01-F78` (who is in a branch roster
// and what each row carries), `01-F71` (e) (the key comes from the session), `01-F47`/`01-F48` (the
// two read gates) and `11-F21`/`11-F22`/R32 (the credential and the marked departure). The session
// that wrote this file wrote no implementation, and it did not read the sequenced build plan.
// ⚠ **Do NOT resolve a red here by editing an assertion** — every one quotes an FR id, and the FR
// is the contract (commandment 9).
//
// ── WHAT STEP 6 CLOSES, AND WHY IT NEEDS ITS OWN ORACLE ──────────────────────────────────────────
// The storage half shipped (`staff.ts`: `staffVersion` / `publishStaffRoster` / `staffPage`) and the
// wire half shipped (`packages/sync-protocol`'s `reference_*` triple). **NOTHING CONNECTED THEM** —
// `gateway.ts` refused a `staff` `reference_request` BY NAME and `hello_ack` advertised no `staff`
// key — which is AGENTS.md's recurring defect with the two halves already built and named. So every
// assertion below is about the SEAM: a device asks over the wire and is answered; a device connects
// and is told what version its own branch is at; an owner writes and a connected till hears about
// it. Nothing here re-tests `staffPage`'s SQL — `staff-roster-storage.test.ts` owns that — and every
// section that touches storage behaviour reaches it through a parsed frame on a session, because
// the failure this step can produce is precisely a serve path that reimplements what it should
// forward.
//
// ── WHAT IS ASSERTED, SECTION BY SECTION ────────────────────────────────────────────────────────
// §A  THE SERVE PATH EXISTS AND `01-F78` GOVERNS ITS ROWS. That a `staff` request is answered at
//     all (A1); half one — "every person holding an assignment that REACHES this branch", so an
//     own-branch assignee and `01-F26`'s org-wide owner are IN and a person assigned only elsewhere
//     is "absent from this artifact entirely" (A2); half two — "only the assignments that reach
//     this branch, never all of them", whose cost `01 §9.7` names as telling every till the org's
//     branch structure (A3, and A3b for the half A3 cannot reach — see the box below); that the
//     artifact is the DEVICE's branch, derived from the session — two branches of ONE org, two
//     different rosters at two different version numbers, which is the exact hazard `01-F76`/R25
//     bought and paid for (A4); and that a roster larger than one page is served as a PAGE RUN
//     whose continuation is pinned to the version page one named (A5) — `01-F56`'s atomic snapshot
//     over the wire, on the artifact where a silently truncated page is people who cannot sign in.
//
// ── ⚠ §A3 CANNOT MEASURE HALF TWO ALONE, AND §A3b IS WHY (MEASURED, NOT REASONED) ───────────────
// `01-F78` half two is enforced at the PUBLISHER (`staff.ts` filters each row by `reachesBranch`
// before the log is written, so every serve path inherits narrow bytes from one place) and the
// codec is the belt: `reference_response`'s `superRefine` refuses a `staff` row naming any branch
// but the frame's. Two measurements, out of tree, 2026-08-19, control 496/496:
//   · deleting the CODEC's refinement while the publisher still narrows — **0 killed of 496**,
//     across the whole gateway suite. Nothing in this repo saw it.
//   · deleting the PUBLISHER's filter while the codec still refuses — §A3 dies, but by a
//     `ZodError` thrown inside `parseMessage` **inside `handleReference`**, not by §A3's own
//     `not.toContain(branchB)`. The frame is never framed, so the assertion never runs.
// So a serve path that narrows at serve time and one that merely inherits narrow bytes are
// indistinguishable here, and if the refinement were ever relaxed §A3 would go quiet with nothing
// else changing. **§A3 is repaired for ATTRIBUTION** — it tolerates a refusal and reports it in its
// own named failure, so a wide stored row surfaces as §A3's sentence rather than as a foreign stack
// — and **§A3b is the assertion that can fire on the SERVE path**: its fixture plants a wide row
// STRAIGHT INTO STORAGE, past the writer whose belt is `staff-roster-storage.test.ts` §O4/O5's, so
// everything between the log and the device is the only thing left. **Stated plainly, because it is
// the kind of thing that reads as coverage and is not: §A3b's own assertion can only fire when the
// writer's belt is bypassed, and the fixture bypasses it deliberately.** Re-measured with it in
// place, control 499/499: the codec-refinement row goes **0 → 1 killed, §A3b by name, in this file
// alone**, and its failure prints the leaked frame; the publisher row is unchanged at 3 (§A3 here
// plus `staff-roster-storage.test.ts` §O4/O5) and §A3 now dies with **its own** sentence, quoting
// the belt's `ZodError` inside it instead of being replaced by it.
// §B  BOTH READ GATES. `01-F48`: "Revocation blocks **reads as well as writes**: a revoked device
//     receives no further events on any plane" (B1). `01-F47`: an expired-but-unrevoked device is
//     admitted for the SOLE PURPOSE of draining its backlog, so its reads are refused (B2). Each
//     has a one-difference CONTROL that is SERVED, because "refused" means nothing without it.
//     ⚠ **WHAT §B1 PROVES IS THE MID-SESSION GATE AND NOT THE DOOR.** The device is admitted, reads
//     its roster, is revoked, and is refused on the SAME live session — which is `01-F48`'s "drops
//     live sessions … rather than only at its next voluntary contact", and it is the half a roster
//     makes sharp. It says nothing about a revoked device's next HELLO: that refusal and its
//     `01-F42` `purge_command` are `revocable.test.ts` §B's, asserted there on the same token before
//     and after the command, and re-asserting them here would put a second copy of an admission
//     test behind a reference-data header.
// §C  `01-F77`'s ADVERTISEMENT. The `staff` key on `hello_ack.reference_versions` (C1); **omitted,
//     never sent as `0`** for a key nothing has published (C2); and the advertised key is this
//     DEVICE's branch at ITS OWN version, bound to what the same session is then served (C3) —
//     `01-F77` calls this field "THE correctness mechanism of the whole reference-data transport",
//     because a device that hears no notice for a week still reconciles here.
//     ⚠ **THE MUTANT THAT LOOKS LIKE §C2's IS NOT ATTRIBUTABLE, AND THE NEXT READER SHOULD NOT
//     RE-RUN IT.** Advertising the staff key UNCONDITIONALLY (so an unpublished key rides at
//     version 0) is **198 failed of 496 across 46 files** — because `ReferenceVersionKey` declares
//     `version: min(1)`, so a zero-valued key makes `hello_ack` itself unparseable and every suite
//     that opens a session dies. That number is a codec belt firing, not coverage. The row that
//     measures §C2's claim is the two-branch one — the same unconditional key **plus** `min(1)`
//     relaxed to `nonnegative()` — and it is **4 failed of 496: §C2 by name**, with three
//     pre-existing golden-fixture/transcript tests that pin the codec and are the second branch's
//     own kills. §C2's last assertion says the same thing from inside the test: an implementation
//     that emits a `0` "may fail here as a hello that never PARSES rather than as a zero on this
//     array, and either way it is this test that dies".
// §D  THE TWO CREDENTIAL DOORS, REACHED THROUGH THE WIRE. `01-F75` amended `at_version` to a
//     CONTINUATION ("a first page is served the CURRENT version whatever it asks for") and the
//     delta to "ONE entry per changed id, the greatest version ≤ the target", both after a departed
//     cashier's deleted Argon2id hash was served and her old PIN verified against it. `staffPage`
//     closed both; §D asserts they SURVIVE the seam — a serve arm that pages the roster itself, or
//     that "helpfully" resolves the version before calling, reopens them with the storage suite
//     green.
// §E  THE PRODUCER, ON THE REAL COMPOSITION ROOT. `01-F75`: "a write that changes an artifact mints
//     the next version for each affected `(resource, scope)` key … and publication **fans out a
//     `reference_notice` on that key**. The producer is the publish path — never a scheduler, never
//     a device", written into the FR because the catalog's own fan-out shipped with ZERO production
//     callers. `01-F76`: "a branch-scoped notice reaches that branch's devices and no others."
//     ⚠ §E is built on `buildServer` + a REAL WebSocket + the REAL `/internal/users*` routes, and
//     that is not ceremony: the first draft of the catalog's equivalent mounted its own wiring and
//     SURVIVED the mutant where `server.ts` wires a no-op, because a test that supplies the wiring
//     cannot observe whether the product supplies it. Nothing in §E calls a gateway method by hand.
//     **E4 is the ORDERING half — the notice FOLLOWS the commit** — and it needs its own fixture for
//     the reason `journey-catalog.test.ts`'s `SEAM (ORDER)` needed one: E1..E3 wait for a notice and
//     then compare its version against a database read, so a producer that announced the PREDICTED
//     number **before** its write committed passes all three. A device told early fetches, is served
//     the OLD roster, and believes it current until something else moves the key — on the artifact
//     where "old" is a person who was hired and cannot sign in, or one who departed and still can.
//     The window is a LOCK and not a sleep (`publishStaffRoster`'s own per-key advisory lock, taken
//     by the fixture on its own connection), the wait is a `pg_locks` join proving a backend is
//     WAITING on that exact lock, and the observation is a ping→pong round trip on the device's own
//     socket — no wall-clock constant is tuned anywhere in it. **Measured, control 499/499:
//     announcing the PREDICTED version before the write is 1 killed — §E4 by name, with E1/E2/E3
//     green under it, which is the attribution.** ⚠ The FIRST draft of that mutant also dropped
//     org-wide assignments from the announced key set and killed §E3 as well; a mutant that changes
//     two things measures neither, so it was rebuilt to announce the SAME keys at the SAME numbers
//     and differ only in WHEN. The control — the same announce, after the commit, with the version
//     re-read from the database instead of taken from the writer's returned key — kills 0.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT COVER (each absence argued) ────────────────────────────
// (i)   **`01-F71` (e)'s branch half.** It is an ENFORCEMENT POINT and that FR requires its test to
//       live where its register can find it: `tenant-isolation-reference-serve.test.ts` §B, whose
//       header says its `staff` refusal is retired by this step. It is replaced there, not here.
// (ii)  **PAGING — this note used to say paging was NOT covered, and that absence was a hole rather
//       than a boundary.** It read: the frame fields are asserted "on the single-page shape only",
//       a paged roster is `staff-roster-storage.test.ts`'s, and reaching one "would cost minutes".
//       All three were wrong in the way that matters. **Measured out of tree, 2026-08-19: pinning
//       `complete: true, next_from: 0` into the served frame is 0 killed of 496** — so a gateway
//       that truncated a branch's roster at one page and called it complete was green everywhere,
//       and that is not a menu, it is the people who can sign in. `staff-roster-storage.test.ts`
//       does not reach paging either (no test in it exceeds a page). §A5 is now that assertion, and
//       the cost claim was wrong by three orders of magnitude: **measured 888 ms**, a thousand
//       people written in parallel batches through the production writer. **What it deliberately
//       does NOT do is name the page
//       size**: no FR fixes one, `STAFF_PAGE_SIZE` is module-private, and a test that hardcoded 500
//       would red a correct implementation that chose another number. §A5 publishes a roster larger
//       than any page size a serve path is likely to choose, reads the size OFF the first frame, and
//       walks the run with the server's own `next_from` — so the only assumption left is that the
//       fixture exceeds the page size, and §A5 states that assumption in a named failure rather than
//       passing quietly if it ever stops holding. **After: that row is 1 killed of 499, §A5 by name,
//       in this file alone** — and a second row proves the CONTINUATION half separately, because
//       `complete` alone would be a thin claim: the staff arm forwarding no `at_version` (so a
//       continuation resolves at `current`) is **1 killed of 499, §A5 by name**, and it is a SEAM
//       mutant `staff-roster-storage.test.ts` is blind to by construction — that suite calls
//       `staffPage` directly, so nothing there can see a wire field the gateway drops.
// (iii) **Whether a DRAINING session is skipped by the notice fan-out.** The catalog's producer
//       skips one with a stated reason; no FR rules it for any resource, and asserting either way
//       would invent policy (commandment 2). §B2 asserts only what `01-F47` states: a drain
//       session's READ is refused.
// (iv)  **The device-side halves** — `01-F76`'s `foreign_artifact` refusal and applying a roster
//       into a device store. Different plane, different package, step 7. `01-F76` calls the device
//       refusal "the belt to this brace and never a substitute for it"; this file is the brace.
// (v)   **`01-F79`'s `credential_change_request`.** Its serve path is not this step's and its
//       refusal is pinned in `tenant-isolation-reference-serve.test.ts` §E.
// (vi)  **Which act SHOULD publish, and when.** `01-F75` leaves the timing to §9.5 and this file
//       reads the producer through whatever `/internal/users*` does; §E asserts that a write
//       reaching a key announces on THAT key, never that a particular route exists to be the one.
//
// ⚠ RUNS ON REAL POSTGRES (Testcontainers, `T-01-07`): fails LOUDLY with Docker down rather than
// skipping. Per-test isolation is BY FRESH ORG, never truncation (`helpers.ts`).

import { hashPin, newId } from "@restos/domain";
import { createWsCloudTransport, wallClock } from "@restos/sync-client";
import { type ProtocolMessage, parseMessage } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type CatalogEntry, publishCatalog } from "../catalog.js";
import {
  AuthRejectedError,
  createGateway,
  type Gateway,
  issueDeviceToken,
  registerDevice,
  revokeDevice,
} from "../index.js";
import { buildServer } from "../server.js";
import { publishStaffRoster, setPinCredential, setUserStatus, staffVersion } from "../staff.js";
import { insertBranch, insertOrg, insertUser, type UserRow } from "../tenancy.js";
import {
  BASE_T,
  closeDb,
  type Db,
  freshIdentity,
  helloMsg,
  type Identity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pingMsg,
  type Session,
  TEST_TOKEN_SECRET,
  testDatabaseUrl,
} from "./helpers.js";

/** ≥ 32 bytes — the floor `server.ts` enforces on the `/internal` credential (`18 §5`). */
const PUBLISH_SECRET = "internal-credential-for-the-staff-over-the-wire-suite";

const T = BASE_T;

let db: Db;
let gateway: Gateway;
/** The REAL composition root, for §E only. Everything else drives `createGateway` in process. */
let origin: string;
let servers: { close(): Promise<void> }[] = [];

beforeAll(async () => {
  db = openDb();
  gateway = createGateway({ db, clock: makeClock(), auth: { token_secret: TEST_TOKEN_SECRET } });
  const app = buildServer(
    testDatabaseUrl(),
    TEST_TOKEN_SECRET,
    undefined,
    undefined,
    PUBLISH_SECRET,
  );
  origin = await app.listen({ port: 0, host: "127.0.0.1" });
  servers = [app];
}, 180_000);

afterAll(async () => {
  for (const server of servers) await server.close();
  await gateway.close();
  await closeDb(db);
});

/* ── tenancy fixtures ────────────────────────────────────────────────────────────────────────── */

type Org = { org_id: string; branchA: string; branchB: string };

const freshOrg = async (): Promise<Org> => {
  const org_id = `org-staff-wire-${newId()}`;
  const branchA = `branch-a-${newId()}`;
  const branchB = `branch-b-${newId()}`;
  await insertOrg(db, {
    org_id,
    display_name: `Org ${org_id.slice(0, 14)}`,
    status: "active",
    created_at: T,
  });
  for (const branch_id of [branchA, branchB]) {
    await insertBranch(db, {
      branch_id,
      org_id,
      display_name: `Branch ${branch_id.slice(0, 14)}`,
      branch_type: "branch",
      branch_class: "production",
      created_at: T,
    });
  }
  return { org_id, branchA, branchB };
};

/**
 * `hashPin` is deliberately ~0.4 s (`01-F61`'s cost floor), so each distinct credential in this
 * suite is computed ONCE. They are `11-F21` hashes and never PINs: what a fixture holds is what
 * travels, and §D's whole question is whether a hash that was DELETED can still be read back.
 */
const hashes = new Map<string, Promise<string>>();
const hashOnce = (label: string): Promise<string> => {
  const existing = hashes.get(label);
  if (existing !== undefined) return existing;
  const minted = hashPin(`pin-${label}`);
  hashes.set(label, minted);
  return minted;
};

type AssignmentInput = { role: string; branch_id: string | null; status?: string };

/**
 * One person through the PRODUCTION writer (`18 §4`: `kernel.users` has one writer service).
 *
 * The cast follows `staff-roster-storage.test.ts`'s precedent — `UserRow.email` is `string` and the
 * assignment's `status` is `11-F22`'s, which the row type reaches through `PersonRecord`.
 */
const addPerson = async (person: {
  org_id: string;
  display_name: string;
  grid_ordinal: number;
  assignments: readonly AssignmentInput[];
}): Promise<string> => {
  const user_id = newId();
  const written = await insertUser(db, {
    user_id,
    org_id: person.org_id,
    display_name: person.display_name,
    email: null,
    password_hash: await hashOnce("back-office"),
    assignments: person.assignments.map((assignment) => ({
      role: assignment.role,
      branch_id: assignment.branch_id,
      status: assignment.status ?? "active",
    })),
    grid_ordinal: person.grid_ordinal,
    created_at: T,
  } as unknown as UserRow);
  if (!written) throw new Error(`fixture: insertUser refused ${person.display_name}`);
  return user_id;
};

/**
 * A published roster version written STRAIGHT INTO STORAGE — **deliberately past
 * `publishStaffRoster`**, which is the only fixture in this file that does not use the production
 * writer, and the only one that needs to.
 *
 * §A3b's whole question is what stands between the LOG and the DEVICE. `01-F78` half two is
 * enforced at the publisher (`staff.ts` filters each row by `reachesBranch` at publish time, "so the
 * log holds the narrow bytes") and `staff-roster-storage.test.ts` §O4/O5 own that check — so a
 * fixture that can only produce rows the publisher approved cannot state a claim about anything
 * downstream of it. This one can: it writes the row the publisher would refuse, and then asks over
 * the wire.
 *
 * ⚠ **SAID PLAINLY BECAUSE IT READS LIKE COVERAGE AND IS NARROWER THAN IT LOOKS:** an assertion
 * reached this way can only fire when the writer's belt is bypassed, and this bypasses it on
 * purpose. It is not evidence that a wide row can be published — it cannot — it is evidence about
 * what the serve path and the codec do with one if it ever exists (a hand-repaired row, a restore
 * from `22`, a future writer, or the publisher's filter regressing).
 *
 * The columns are `0012`'s, written in the same order `publishStaffRoster` writes them, and the
 * version row goes in LAST for the same reason it does there: `staffVersion` is what makes the
 * entries readable at all.
 */
const plantRosterVersion = async (
  scope: { org_id: string; branch_id: string },
  version: number,
  rows: readonly {
    user_id: string;
    display_name: string;
    grid_ordinal: number;
    status: string;
    assignments: readonly { role: string; branch_id: string | null }[];
  }[],
): Promise<void> => {
  for (const row of rows) {
    await db.execute(
      sql`insert into kernel.staff_entries
            (org_id, branch_id, version, user_id, display_name, grid_ordinal, status,
             assignments, pin_hash)
          values (${scope.org_id}, ${scope.branch_id}, ${version}, ${row.user_id},
                  ${row.display_name}, ${row.grid_ordinal}, ${row.status},
                  ${JSON.stringify(row.assignments)}::jsonb, ${null})`,
    );
  }
  await db.execute(
    sql`insert into kernel.staff_versions (org_id, branch_id, version, published_at, actor_user_id)
        values (${scope.org_id}, ${scope.branch_id}, ${version}, ${T}, ${null})`,
  );
};

/**
 * ONE priced item for this org, so `hello_ack` carries a catalog key.
 *
 * §C2 needs it and nothing else does: `01-F77`'s omitted-never-zero rule is a claim about ONE key's
 * absence from a set, and a set that is absent entirely cannot express it. `01-F60`'s enabled grid
 * is a REQUIRED input to a publish and its completeness check must actually RUN, so the grid is the
 * smallest real one — this org's branch A × one of `02-F42`'s channels — and the entry prices that
 * exact cell. The catalog stays ORG-scoped (`01-F52`/`01-F76`), which is why a device at branch B
 * is told about it while its own roster key is not there.
 */
const publishMenuFor = async (org: Org): Promise<number> =>
  await publishCatalog(
    db,
    org.org_id,
    [
      {
        kind: "item",
        id: "I-STAFF-WIRE-1",
        name: "Chapli Kebab",
        prices: [{ branch_id: org.branchA, channel: "counter", price_paisa: 145_000 }],
      } as CatalogEntry,
    ],
    { enabled: { branches: [org.branchA], channels: ["counter"] }, now: T },
  );

/**
 * A device AT a branch. `01-F65`/`01-F72` (b) make the branch part of the device's own identity, so
 * this is the only way a session comes to have one — the hello frame's `branch_id` is checked
 * against the token's claims and against the registry before any session exists.
 */
const deviceAt = (org: Org, branch_id: string): Identity => ({
  ...freshIdentity(),
  org_id: org.org_id,
  branch_id,
});

/* ── frames and readers ──────────────────────────────────────────────────────────────────────── */

type ReferenceResponse = Extract<ProtocolMessage, { kind: "reference_response" }>;
type StaffResponse = Extract<ReferenceResponse, { resource: "staff" }>;
type StaffEntryOnTheWire = StaffResponse["entries"][number];
type HelloAck = Extract<ProtocolMessage, { kind: "hello_ack" }>;
type ArtifactKey = NonNullable<HelloAck["reference_versions"]>[number];

/**
 * A `staff` fetch. **Through `parseMessage`**, and that is not ceremony: the step-5 oracle measured
 * NINETEEN of its refusal assertions passing for free because the codec could not parse the frame
 * at all. If a `staff` request were not wire-legal, every section below would be a statement about
 * `packages/sync-protocol` and none about this gateway. §A0 asserts the anchor rather than assuming
 * it.
 */
const staffRequest = (
  scope: { org_id: string; branch_id: string },
  fields: { have_version?: number; from?: number; at_version?: number } = {},
): ProtocolMessage =>
  parseMessage({
    v: 2,
    kind: "reference_request",
    resource: "staff",
    scope,
    have_version: fields.have_version ?? 0,
    ...(fields.from === undefined ? {} : { from: fields.from }),
    ...(fields.at_version === undefined ? {} : { at_version: fields.at_version }),
  });

const staffResponsesOf = (session: Session): StaffResponse[] =>
  ofKind(session.rec.all, "reference_response").filter(
    (frame): frame is StaffResponse => frame.resource === "staff",
  );

/**
 * The one `staff` answer this session received, or a NAMED failure.
 *
 * Every assertion about a served roster passes vacuously against a session that was served nothing
 * — the "guard never pointed at the dangerous case" pattern the round-3 law exists to catch — so an
 * absent answer is a failure with a sentence on it and never `undefined` flowing into a `?.`.
 */
const servedStaff = (session: Session, label: string): StaffResponse => {
  const responses = staffResponsesOf(session);
  const frame = responses[0];
  if (frame === undefined) {
    throw new Error(
      `${label}: no staff reference_response reached the device. 01-F75 makes ONE frame carry ` +
        "every resource and closes the set at `catalog` and `staff`; a gateway that answers only " +
        "one of them leaves a branch nobody can sign in to (01-F28, 11-F21).",
    );
  }
  return frame;
};

/** Everything the device was sent, as text — for the leak and clamp properties. */
const sinkText = (session: Session): string => JSON.stringify(session.rec.all);

const entryOf = (frame: StaffResponse, user_id: string, label: string): StaffEntryOnTheWire => {
  const entry = frame.entries.find((row) => row.user_id === user_id);
  if (entry === undefined) {
    throw new Error(
      `${label}: ${user_id} is not in the served artifact — a departure is a MARKED ENTRY and ` +
        "never an absence (01-F75, 11-F22, R26), and half one of 01-F78 puts every person whose " +
        "assignment REACHES this branch in it",
    );
  }
  return entry;
};

const idsOf = (frame: StaffResponse): string[] =>
  frame.entries.map((entry) => entry.user_id).sort();

const staffKeysOf = (ack: HelloAck): ArtifactKey[] =>
  (ack.reference_versions ?? []).filter((key) => key.resource === "staff");

/**
 * A refusal as a VALUE, so a test can assert the class it IS and the class it is NOT.
 *
 * A resolving request fails HERE by name, because the dangerous implementation is the one that
 * resolves: `01-F48` blocks reads, and a gate that answers anyway leaves no throw to inspect.
 */
const refusalOf = async (act: Promise<unknown>, what: string): Promise<unknown> => {
  try {
    await act;
  } catch (error) {
    return error;
  }
  throw new Error(`${what} RESOLVED instead of being refused`);
};

/**
 * A request whose REFUSAL is a legal outcome, captured rather than thrown — for the two tests whose
 * claim is about what a device may LEARN and not about whether it is answered.
 *
 * `01-F78` half two is enforced at the publisher and the codec refuses a wide row as a belt, so a
 * serve path handed bytes it may not send is entitled to fail to frame them rather than to narrow
 * them, and no FR chooses between those. Letting the rejection propagate makes the test die with a
 * `ZodError` raised in another package, which says the belt spoke and says nothing about the claim
 * under test; capturing it keeps the failure THIS file's sentence, with the refusal quoted in it.
 */
const attempt = async (act: Promise<unknown>): Promise<string | undefined> => {
  try {
    await act;
    return undefined;
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
};

/* ── §E's real-socket harness ────────────────────────────────────────────────────────────────── */

const until = async (
  predicate: () => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(label);
};

/** `until`'s async twin — §E4 polls `pg_locks`, which is a query and not a predicate. */
const untilAsync = async (
  predicate: () => Promise<boolean>,
  label: string,
  timeoutMs = 15_000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(label);
};

type Wire = {
  heard: ProtocolMessage[];
  send(message: ProtocolMessage): void;
  stop(): void;
};

/**
 * A REAL device on a REAL socket against `buildServer`.
 *
 * ⚠ **The token is minted against `Date.now()` and never `BASE_T`.** `buildServer` is the
 * production root and constructs `createGateway` with the REAL clock, so a `BASE_T` token is 90
 * days expired against it and the session opens straight into `01-F47` drain mode — where reads are
 * refused for a reason the test did not intend, and the assertions can still go green off a
 * reconnect. `journey-catalog.test.ts` records observing exactly that.
 */
const dial = async (identity: Identity): Promise<Wire> => {
  await registerDevice(db, { ...identity, device_class: "counter_electron" });
  const heard: ProtocolMessage[] = [];
  let up = false;
  const transport = createWsCloudTransport({
    url: `${origin.replace("http", "ws")}/sync`,
    clock: wallClock,
  });
  transport.start({
    onUp: () => {
      up = true;
    },
    onDown: () => {
      up = false;
    },
    onMessage: (message) => {
      heard.push(message);
    },
  });
  await until(() => up, `the socket for ${identity.device_id} never came up`);
  transport.send(
    helloMsg(identity, {
      token: await issueDeviceToken(identity, TEST_TOKEN_SECRET, { now: Date.now() }),
    }),
  );
  await until(
    () => heard.some((message) => message.kind === "hello_ack"),
    `no hello_ack for ${identity.device_id} — the session never opened, so anything asserted ` +
      "about frames it did or did not receive would be a statement about a dead connection",
  );
  return {
    heard,
    send: (message) => {
      transport.send(message);
    },
    stop: () => {
      transport.stop();
    },
  };
};

const staffNoticesOf = (wire: Wire) =>
  wire.heard.filter(
    (message): message is Extract<ProtocolMessage, { kind: "reference_notice" }> =>
      message.kind === "reference_notice" && message.resource === "staff",
  );

/**
 * FLUSH this socket, so "nothing arrived" is a measurement rather than a hope.
 *
 * The gateway answers a `ping` synchronously from the SAME sink a notice is written to, on the same
 * connection — so every frame written to this device before the ping was sent is in `heard` by the
 * time the pong is. There is no `sleep` here and no wall-clock constant to tune. The negative
 * assertions in §E are ordered after (a) the publish's HTTP response and (b) the positive notice
 * arriving on the OTHER device, so a notice this device should not have had would already be
 * recorded when the pong lands.
 */
const flush = async (wire: Wire, label: string): Promise<void> => {
  const probe = Date.now();
  wire.send(pingMsg(probe));
  await until(
    () => wire.heard.some((message) => message.kind === "pong" && message.t === probe),
    `${label}: the device's ping was never answered, so the socket was not flushed and a ` +
      "'nothing arrived' assertion below would prove nothing",
  );
};

type Http = { status: number; body: Record<string, unknown> };

const post = async (path: string, body: unknown): Promise<Http> => {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${PUBLISH_SECRET}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

/**
 * `14-F14`'s create, over the surface `services/api` uses — the act `01-F75`'s producer clause is
 * about. It FAILS by name: every §E assertion is about what a write announced, and each one passes
 * vacuously against a write that never happened.
 */
const createOverHttp = async (args: {
  org_id: string;
  display_name: string;
  assignments: readonly { role: string; branch_id: string | null }[];
}): Promise<string> => {
  const reply = await post("/internal/users", {
    ...args,
    email: null,
    now: T,
    actor_user_id: "actor-owner-staff-wire",
  });
  if (reply.status !== 200) {
    throw new Error(
      `fixture: POST /internal/users refused ${args.display_name} with ${reply.status} — ` +
        JSON.stringify(reply.body),
    );
  }
  return String((reply.body as { user_id?: unknown }).user_id);
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   §A — the serve path, and 01-F78's two halves as a DEVICE receives them
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§A — 01-F75/01-F78: a device fetches its own branch's roster", () => {
  it("§A0 01-F75/01-F76: a `staff` reference_request is WIRE-LEGAL — the codec is not what answers or refuses it", () => {
    // The anchor for every assertion in this file. `01-F76`: "a frame can carry a key, only a
    // session can judge it" — if this frame did not parse, §A..§D would be tests of `parseMessage`.
    const frame = staffRequest({ org_id: "org-x", branch_id: "branch-y" }, { have_version: 3 });
    if (frame.kind !== "reference_request") throw new Error("unreachable");
    expect(frame.resource).toBe("staff");
    // `01-F76`: ONE shape for every resource, `{ org_id, branch_id }` as a STRUCTURED value and
    // never a concatenation (`01-F71` (d)) — the key survives the codec verbatim.
    expect(frame.scope).toEqual({ org_id: "org-x", branch_id: "branch-y" });
    expect(frame.have_version).toBe(3);
  });

  it("§A1 01-F9/01-F75: the roster published for this branch is SERVED to a device at it, keyed and versioned", async () => {
    const org = await freshOrg();
    const cashier = await addPerson({
      org_id: org.org_id,
      display_name: "Hina at A",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const version = await publishStaffRoster(
      db,
      { org_id: org.org_id, branch_id: org.branchA },
      [cashier],
      { now: T },
    );

    const session = await openSession(gateway, deviceAt(org, org.branchA));
    await session.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA }));

    const served = servedStaff(session, "§A1");
    // `01-F76`: "AN ARTIFACT IS `(resource, scope)`, AND A VERSION NUMBER IS MEANINGLESS WITHOUT
    // IT" — so the key is compared as a PAIR and the version travels with it. A device that stores
    // a version under the wrong key agrees with itself for ever afterwards.
    expect(served.scope).toEqual({ org_id: org.org_id, branch_id: org.branchA });
    expect(served.version).toBe(version);
    // `have_version: 0` means "nothing", and `01-F75` keeps the catalog's rule verbatim: a snapshot
    // otherwise. A snapshot REPLACES and therefore applies to no base (the codec refuses one).
    expect(served.form).toBe("snapshot");
    expect(served.base_version).toBeUndefined();
    expect(served.complete).toBe(true);
    expect(served.next_from).toBe(0);
    // `01-F75`'s `staff` row, as declared: the fields a till needs to render `01-F61`'s grid and
    // verify a PIN offline (`01-F28`).
    const entry = entryOf(served, cashier, "§A1");
    expect(entry.display_name).toBe("Hina at A");
    expect(entry.grid_ordinal).toBe(0);
    expect(entry.status).toBe("active");
    expect(entry.assignments).toEqual([{ role: "cashier", branch_id: org.branchA }]);
  });

  it("§A2 01-F78 half one: the artifact holds every person whose assignment REACHES this branch — and nobody else", async () => {
    // "That is her own-branch assignments plus `01-F26`'s org-wide ones (`branch_id: null`), which
    // is how an owner holds Appendix A's 'everything' and therefore how she unlocks a till at a
    // branch she does not staff." And the cost clause: "a person whose ONLY assignments are at
    // other branches is **absent from this artifact entirely**".
    const org = await freshOrg();
    const own = await addPerson({
      org_id: org.org_id,
      display_name: "Own-branch cashier",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const orgWide = await addPerson({
      org_id: org.org_id,
      display_name: "Org-wide owner",
      grid_ordinal: 1,
      assignments: [{ role: "owner", branch_id: null }],
    });
    const elsewhere = await addPerson({
      org_id: org.org_id,
      display_name: "Cashier at B only",
      grid_ordinal: 2,
      assignments: [{ role: "cashier", branch_id: org.branchB }],
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [own, orgWide], {
      now: T,
    });
    // B's own artifact exists too, so "elsewhere is absent from A" is a statement about the
    // MEMBERSHIP RULE and not about a person nobody ever published.
    await publishStaffRoster(
      db,
      { org_id: org.org_id, branch_id: org.branchB },
      [elsewhere, orgWide],
      { now: T + 1 },
    );

    const session = await openSession(gateway, deviceAt(org, org.branchA));
    await session.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA }));
    const served = servedStaff(session, "§A2");

    expect(idsOf(served)).toEqual([own, orgWide].sort());
    // Stated over the whole sink as well: `01-F78`'s absence is about what a device may LEARN, and
    // an implementation that carried her under any other frame fails here too.
    expect(sinkText(session)).not.toContain(elsewhere);
    expect(sinkText(session)).not.toContain("Cashier at B only");
    // ANTI-VACUITY: she is genuinely published — at B — so the absence above is the rule, not an
    // empty org. Asserted from a device AT B, which is the only place she may be seen.
    const atB = await openSession(gateway, deviceAt(org, org.branchB));
    await atB.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchB }));
    expect(idsOf(servedStaff(atB, "§A2 anti-vacuity"))).toEqual([elsewhere, orgWide].sort());
  });

  it("§A3 01-F78 half two: a row carries ONLY the assignments that reach this branch — the org's branch structure never travels", async () => {
    // "`01 §9.7` names the cost of the other answer precisely — *'a row carrying every branch's
    // assignment also tells every till the org's branch structure'* — and that is `01-F71`'s
    // isolation boundary crossed by a reference-data artifact rather than by a query. It is also
    // the half R25 was bought for."
    const org = await freshOrg();
    const both = await addPerson({
      org_id: org.org_id,
      display_name: "Cashier at both",
      grid_ordinal: 0,
      assignments: [
        { role: "cashier", branch_id: org.branchA },
        { role: "cashier", branch_id: org.branchB },
        { role: "owner", branch_id: null },
      ],
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [both], {
      now: T,
    });

    const session = await openSession(gateway, deviceAt(org, org.branchA));
    // ⚠ **CAPTURED, NOT AWAITED BARE, AND THE REASON IS ATTRIBUTION.** `01-F78` half two is enforced
    // at the PUBLISHER and the codec refuses a wide `staff` row as a belt, so under the mutant this
    // test exists for — the publisher's `reachesBranch` filter deleted — the response cannot be
    // FRAMED at all and `handle` rejects inside `parseMessage`. Measured out of tree 2026-08-19:
    // that mutant killed this test with a `ZodError` at `entries[0].assignments[1].branch_id` and
    // **not** with either assertion below, i.e. §A3's own claim never ran. Capturing the refusal
    // keeps the failure this file's sentence and quotes the belt in it.
    const refusal = await attempt(
      session.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA })),
    );
    // THE PROPERTY FIRST, because it is the one that holds under BOTH legal outcomes — a row
    // narrowed, or a frame refused — and it is what `01 §9.7` is about: whichever layer acts, the
    // device at A must not learn that branch B exists.
    expect(
      sinkText(session),
      `§A3: branch B's id reached a device at branch A${refusal === undefined ? "" : ` (${refusal})`}`,
    ).not.toContain(org.branchB);
    const served = servedStaff(
      session,
      `§A3${refusal === undefined ? "" : `: the serve path REFUSED to frame this artifact (${refusal}) — 01-F78 half two is enforced at the publisher (staff.ts) and the codec is the belt, so a WIDE stored row surfaces here as a response that cannot be framed`}`,
    );
    const entry = entryOf(served, both, "§A3");

    // Her own-branch assignment and the ORG-WIDE one both reach here; B's does not. Compared as a
    // SET, because no FR fixes the order and pinning one would red a correct implementation.
    expect([...entry.assignments].sort((a, b) => a.role.localeCompare(b.role))).toEqual([
      { role: "cashier", branch_id: org.branchA },
      { role: "owner", branch_id: null },
    ]);
    // The property, stated over the whole delivered frame rather than over one field: branch B's
    // id must not appear ANYWHERE a device at A can read it. An implementation that narrowed the
    // `assignments` array and left the id in some other member fails here.
    expect(JSON.stringify(served)).not.toContain(org.branchB);
    // ANTI-VACUITY: the id is a value that COULD appear — the same person is published at B and
    // her row there names B.
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchB }, [both], {
      now: T + 1,
    });
    const atB = await openSession(gateway, deviceAt(org, org.branchB));
    await atB.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchB }));
    expect(JSON.stringify(servedStaff(atB, "§A3 anti-vacuity"))).toContain(org.branchB);
  });

  it("§A3b 01-F78 half two: a WIDE row already in the log never reaches a device — the claim §A3 cannot make", async () => {
    // ── WHY THIS TEST EXISTS, AND WHAT IT IS NOT ────────────────────────────────────────────────
    // §A3 above cannot separate a serve path that NARROWS from one that merely inherits narrow
    // bytes, because the only fixture it has is the publisher, and the publisher narrows. Measured
    // out of tree, 2026-08-19, control 496/496: deleting the CODEC's `01-F78` refinement while the
    // publisher still filters is **0 killed of 496** — nothing in this repo saw it — and deleting
    // the publisher's filter kills §A3 through a `ZodError` rather than through §A3's own
    // assertion. Two correct layers, and no assertion between them.
    //
    // So this fixture plants the row STRAIGHT INTO STORAGE, past the writer whose belt is
    // `staff-roster-storage.test.ts` §O4/O5's. **That is a deliberate bypass and it bounds the
    // claim: this assertion can only fire when the writer's belt is bypassed.** What is left under
    // test is everything between the log and the device — `staffPage`'s read, `handleReference`'s
    // frame, and the codec — which is exactly the span this file is the oracle for.
    //
    // It asserts the PROPERTY and not a mechanism: `01 §9.7` says what may not happen ("a row
    // carrying every branch's assignment also tells every till the org's branch structure"), and
    // narrowing at serve time and refusing to frame are both compliant answers. No FR chooses, so
    // choosing here would invent policy (commandment 2).
    const org = await freshOrg();
    const wide = newId();
    const narrow = newId();

    // THE CONTROL, planted by the SAME function at the sibling key and differing in exactly one
    // field — the assignment's branch. It is what makes the silence at A a measurement: a planted
    // row IS read and IS served, so "nothing of branch B reached A" cannot be a statement about a
    // fixture the serve path ignores.
    await plantRosterVersion({ org_id: org.org_id, branch_id: org.branchB }, 1, [
      {
        user_id: narrow,
        display_name: "Planted narrow at B",
        grid_ordinal: 0,
        status: "active",
        assignments: [{ role: "cashier", branch_id: org.branchB }],
      },
    ]);
    const atB = await openSession(gateway, deviceAt(org, org.branchB));
    await atB.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchB }));
    const servedB = servedStaff(atB, "§A3b control: a planted NARROW row at its own branch");
    expect(servedB.version).toBe(1);
    expect(idsOf(servedB)).toEqual([narrow]);
    expect(entryOf(servedB, narrow, "§A3b control").display_name).toBe("Planted narrow at B");

    // THE ACT: branch A's log holds a row naming branch B — the exact bytes `01-F78` half two says
    // may not travel, and which the publisher would have refused to write.
    await plantRosterVersion({ org_id: org.org_id, branch_id: org.branchA }, 1, [
      {
        user_id: wide,
        display_name: "Planted wide at A",
        grid_ordinal: 0,
        status: "active",
        assignments: [
          { role: "cashier", branch_id: org.branchA },
          { role: "cashier", branch_id: org.branchB },
        ],
      },
    ]);
    const atA = await openSession(gateway, deviceAt(org, org.branchA));
    const refusal = await attempt(
      atA.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA })),
    );

    // THE CLAIM, over the whole recorded sink and not over one field, because the id must not
    // arrive by ANY road: a device at A never learns that branch B exists. Served narrow, or not
    // served at all — both pass; a device holding another branch's id does not.
    expect(
      sinkText(atA),
      "a device at branch A was told branch B's id by a roster fetch — 01 §9.7's own named cost " +
        "('a row carrying every branch's assignment also tells every till the org's branch " +
        "structure'), which is 01-F71's isolation boundary crossed by reference data rather than " +
        "by a query, and R25's purchase spent" +
        (refusal === undefined ? "" : ` (the serve path also raised: ${refusal})`),
    ).not.toContain(org.branchB);
  });

  it("§A4 01-F71 (e)/01-F76: the artifact is the DEVICE's branch — one org, two branches, two rosters, two version numbers", async () => {
    // `01-F76`/R25's known price, paid here rather than discovered in the field: "Two devices both
    // at 'staff v7' hold different bytes when they are at different branches — safe **only**
    // because the key travels with the number and is compared." The two branches are deliberately
    // at DIFFERENT versions, so an implementation reading one number for the org fails.
    const org = await freshOrg();
    const atA = await addPerson({
      org_id: org.org_id,
      display_name: "Only at A",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const atB = await addPerson({
      org_id: org.org_id,
      display_name: "Only at B",
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: org.branchB }],
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [atA], { now: T });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [atA], {
      now: T + 1,
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchB }, [atB], {
      now: T + 2,
    });

    const deviceA = await openSession(gateway, deviceAt(org, org.branchA));
    await deviceA.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA }));
    const servedA = servedStaff(deviceA, "§A4 device at A");

    const deviceB = await openSession(gateway, deviceAt(org, org.branchB));
    await deviceB.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchB }));
    const servedB = servedStaff(deviceB, "§A4 device at B");

    expect(servedA.scope).toEqual({ org_id: org.org_id, branch_id: org.branchA });
    expect(servedB.scope).toEqual({ org_id: org.org_id, branch_id: org.branchB });
    expect(servedA.version).toBe(2);
    expect(servedB.version).toBe(1);
    // ATTRIBUTION: one org, two answers that differ in both halves of `(scope, version)`. A key or
    // a version derived from the ORG — the catalog's shape, which is what this serve path was
    // copied from — satisfies neither pair.
    expect(servedA.scope).not.toEqual(servedB.scope);
    expect(servedA.version).not.toBe(servedB.version);
    expect(idsOf(servedA)).toEqual([atA]);
    expect(idsOf(servedB)).toEqual([atB]);
    expect(sinkText(deviceA)).not.toContain("Only at B");
    expect(sinkText(deviceB)).not.toContain("Only at A");
  });

  it("§A5 01-F56/01-F75: a roster larger than one page is served as a PAGE RUN, and the continuation is pinned to the version page one named", async () => {
    // ── WHAT THIS CLOSES ────────────────────────────────────────────────────────────────────────
    // `01-F75` keeps the catalog's vocabulary verbatim — "`form` / `version` / `base_version?` /
    // `entries[]` / `complete` / `next_from` on the response … including that a snapshot applies
    // **atomically** and that a paged fetch states the version it is toward". §A1 pins `complete`
    // and `next_from` where they are TRIVIALLY true (one page, so `true` and `0`), and measured out
    // of tree 2026-08-19 that is worth nothing on its own: **pinning `complete: true, next_from: 0`
    // into the served frame is 0 killed of 496** — and **1 of 499 with this test present, §A5 by
    // name, in this file alone**; the continuation half is its own row (the staff arm forwarding no
    // `at_version`, so a continuation resolves at `current`), also 1 of 499 and also §A5 alone. A
    // gateway that truncated a branch's roster at one
    // page and called it complete was green in every suite in this repo — and on THIS artifact a
    // truncated page is not a short menu, it is the people at the bottom of the list who cannot
    // sign in (`01-F28`, `11-F21`), with a version number that says the device is current.
    //
    // ── AND WHY IT NAMES NO PAGE SIZE ───────────────────────────────────────────────────────────
    // No FR fixes one; `STAFF_PAGE_SIZE` is module-private and the catalog's is a different
    // constant. A test that hardcoded 500 would red a correct implementation that chose 250 or
    // 1000. So the fixture is larger than any page size a serve path is plausibly choosing, the
    // size is READ OFF the first frame, and the run is walked with the server's own `next_from`
    // echoed back verbatim — which is what a device does (`next_from` is opaque to it, so asserting
    // its VALUE would pin an offset encoding no FR requires). The one assumption left — that the
    // fixture exceeds the page size — is asserted with a named failure rather than left to make the
    // test quietly vacuous if the size ever grows past it.
    const PEOPLE = 1_000;
    const org = await freshOrg();
    const scope = { org_id: org.org_id, branch_id: org.branchA };

    // Inserted in parallel batches: `insertUser` takes no lock and each person is independent, so
    // this is ~2 s rather than the "minutes" this file's own note (ii) used to claim paging cost.
    const ids: string[] = [];
    for (let batch = 0; batch < PEOPLE; batch += 50) {
      ids.push(
        ...(await Promise.all(
          Array.from({ length: Math.min(50, PEOPLE - batch) }, (_, index) =>
            addPerson({
              org_id: org.org_id,
              display_name: `Paged cashier ${batch + index}`,
              grid_ordinal: batch + index,
              assignments: [{ role: "cashier", branch_id: org.branchA }],
            }),
          ),
        )),
      );
    }
    expect(await publishStaffRoster(db, scope, ids, { now: T })).toBe(1);

    const session = await openSession(gateway, deviceAt(org, org.branchA));
    await session.conn.handle(staffRequest(scope, { have_version: 0, from: 0 }));
    const first = servedStaff(session, "§A5 page one");

    expect(first.form).toBe("snapshot");
    expect(first.version).toBe(1);
    // THE ASSERTION THE SINGLE-PAGE SHAPE CANNOT MAKE. A `complete: true` here is a gateway telling
    // a device it holds the whole roster while `entries` carries a prefix of it.
    expect(
      first.complete,
      `§A5: a roster of ${PEOPLE} people came back as ONE COMPLETE page of ${first.entries.length}. ` +
        "If that is because the whole roster fits (entries === the fixture), this fixture no longer " +
        "exceeds the serve path's page size and must grow — the paging claim is untestable until it " +
        "does. If it is not, a device has just been told a truncated roster is the whole one, and " +
        "the people missing from it cannot sign in (01-F28, 11-F21, 01-F56's atomic apply).",
    ).toBe(false);
    expect(first.entries.length).toBeGreaterThan(0);
    expect(first.entries.length).toBeLessThan(PEOPLE);
    expect(first.next_from).toBeGreaterThan(0);

    // ⚠ A PUBLISH LANDS BETWEEN THE PAGES — which is the whole reason `at_version` exists. `01-F75`:
    // "a paged fetch states the version it is toward *so that its own remaining pages are
    // consistent*". Without this the run would page a moving target and `01-F56`'s "a snapshot
    // applies atomically" would be a claim about a fold that never existed at any one version.
    const moved = must(ids[0], "the first published person");
    expect(await publishStaffRoster(db, scope, [moved], { now: T + 1 })).toBe(2);

    const pages = [first];
    let cursor = first.next_from;
    while (must(pages[pages.length - 1], "the page just served").complete === false) {
      // The server's own cursor, echoed back verbatim, plus the version page one named — exactly
      // what `01-F75` says a continuation states, and the request `staffPage`'s `from > 0` clause
      // is written for.
      await session.conn.handle(
        staffRequest(scope, { have_version: 0, from: cursor, at_version: first.version }),
      );
      const page = must(
        staffResponsesOf(session)[pages.length],
        `§A5: the continuation from ${cursor} was never answered — a page run that stops mid-way ` +
          "leaves the device holding a partial roster it believes is whole",
      );
      // THE PIN. A publish committed between the pages and this page must still be the version page
      // one named; an implementation that resolved `current` per request serves version 2 here and
      // hands the device two halves of two different rosters under one number.
      expect(
        page.version,
        "§A5: a continuation was served a DIFFERENT version from the one page one named — the " +
          "device applies two halves of two different rosters as one snapshot (01-F56 atomicity, " +
          "01-F75's continuation clause)",
      ).toBe(first.version);
      expect(page.form).toBe("snapshot");
      expect(page.base_version).toBeUndefined();
      expect(page.scope).toEqual(scope);
      pages.push(page);
      cursor = page.next_from;
      // A run this fixture cannot legitimately produce — the bound is here so a `complete` that
      // never arrives fails as a page run rather than as a 5-minute timeout.
      expect(pages.length, "§A5: the page run never completed").toBeLessThan(20);
    }

    // ATTRIBUTION: more than one page was actually walked, so everything above is about paging.
    expect(pages.length).toBeGreaterThan(1);
    const walked = pages.flatMap((page) => page.entries.map((entry) => entry.user_id));
    // EVERY published person, EXACTLY ONCE. The union is the claim `complete`/`next_from` exist to
    // make: a run that dropped a page loses people, and one that repeated a row would let two
    // frames disagree about a person's status and credential with no error on either path.
    expect(new Set(walked).size, "§A5: the page run served a person twice").toBe(walked.length);
    expect([...walked].sort()).toEqual([...ids].sort());
    expect(must(pages[pages.length - 1], "the last page").complete).toBe(true);
    // The only test in this file with its own budget, and the budget is headroom rather than need:
    // **measured 888 ms** on an idle box, against the package's 30 s default. It is raised because
    // this is the one test that writes a thousand rows, and this repo's own record is that a
    // contended full run turns slow I/O into failures wearing assertion costumes — a red here
    // should mean the page run is broken, never that three agents were building at once.
  }, 60_000);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   §B — the two read gates (01-F48 revocation, 01-F47 drain), each with a served CONTROL
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§B — 01-F47/01-F48: the roster is a READ and takes both read gates", () => {
  it("§B1 01-F48: a REVOKED device is refused its branch's roster and served nothing — the control is the same fixture, unrevoked", async () => {
    // `01-F48`: "Revocation blocks **reads as well as writes**: a revoked device receives no
    // further events on any plane." The roster is the sharpest possible instance — it carries
    // `11-F21` Argon2id hashes for every active person at the branch (R25 makes its scope its
    // blast radius), so a serve path that skipped this gate would hand a stolen tablet the
    // credentials of everyone who works there, after the owner revoked it.
    const org = await freshOrg();
    const cashier = await addPerson({
      org_id: org.org_id,
      display_name: "Roster marker for the revoked probe",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [cashier], {
      now: T,
    });

    const identity = deviceAt(org, org.branchA);
    const session = await openSession(gateway, identity);
    // CONTROL FIRST, on the SAME session: this device could read this artifact a moment ago. That
    // is what makes the refusal below attributable to revocation rather than to a dead path.
    await session.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA }));
    expect(idsOf(servedStaff(session, "§B1 control"))).toEqual([cashier]);

    await revokeDevice(db, { org_id: identity.org_id, device_id: identity.device_id });
    const before = session.rec.all.length;

    const error = await refusalOf(
      session.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA })),
      "§B1: a staff request from a REVOKED device",
    );
    expect(error).toBeInstanceOf(AuthRejectedError);
    // NOTHING SERVED, in the strong form: not "an empty roster". `01-F48` says a revoked device
    // "receives no further events on any plane", and an empty artifact is still an artifact.
    expect(session.rec.all).toHaveLength(before);
    expect(staffResponsesOf(session)).toHaveLength(1);
  });

  it("§B2 01-F47: a DRAINING session's roster read is refused — the control is the same identity on a healthy credential", async () => {
    // `01-F47` ruling 1: an expired-but-unrevoked device is admitted for the SOLE PURPOSE of
    // draining its backlog (`01-F17` — a sale is never lost), and reads are refused until the
    // renewal lands. A roster is a read.
    const org = await freshOrg();
    const cashier = await addPerson({
      org_id: org.org_id,
      display_name: "Roster marker for the drain probe",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [cashier], {
      now: T,
    });

    const identity = deviceAt(org, org.branchA);
    const expired = await issueDeviceToken(
      { ...identity, expires_at: BASE_T - 24 * 60 * 60 * 1000 },
      TEST_TOKEN_SECRET,
      { now: BASE_T - 90 * 24 * 60 * 60 * 1000 },
    );
    const drain = await openSession(gateway, identity, { token: expired });
    const before = drain.rec.all.length;

    const error = await refusalOf(
      drain.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA })),
      "§B2: a staff request on a DRAINING session",
    );
    expect(error).toBeInstanceOf(AuthRejectedError);
    expect(staffResponsesOf(drain)).toHaveLength(0);
    expect(drain.rec.all).toHaveLength(before);
    drain.conn.close();

    // CONTROL — the same device, the same artifact, a healthy credential. Without it "refused" is
    // equally consistent with a serve path that refuses everyone.
    const healthy = await openSession(gateway, identity);
    await healthy.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchA }));
    expect(idsOf(servedStaff(healthy, "§B2 control"))).toEqual([cashier]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   §C — 01-F77: hello_ack advertises the staff key, per KEY, omitted rather than zero
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§C — 01-F77: `hello_ack.reference_versions` carries this device's staff key", () => {
  it("§C1 01-F77: a device at a branch with a published roster is told that key's version at hello", async () => {
    // "`hello_ack` therefore carries a version per key (`01-F77`), not a single catalog number" —
    // and `01-F77` calls this field "THE correctness mechanism of the whole reference-data
    // transport … a design that reconciles the roster only on a pushed notice gives a till nobody
    // can sign in to after a lossy week". A device that is never told never asks.
    const org = await freshOrg();
    const cashier = await addPerson({
      org_id: org.org_id,
      display_name: "Advertised at A",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const version = await publishStaffRoster(
      db,
      { org_id: org.org_id, branch_id: org.branchA },
      [cashier],
      { now: T },
    );
    expect(version).toBe(1);

    const session = await openSession(gateway, deviceAt(org, org.branchA));
    // `toContainEqual` and not an index: the array's ORDER is not specified anywhere, and pinning
    // one would red a correct implementation. The KEY is the pair (`01-F76`), so it is compared
    // whole — a `resource` without its `scope` is half a key.
    expect(session.helloAck.reference_versions ?? []).toContainEqual({
      resource: "staff",
      scope: { org_id: org.org_id, branch_id: org.branchA },
      version,
    });
  });

  it("§C2 01-F77: a key with nothing published is OMITTED, never advertised as 0", async () => {
    // "`catalog_version`'s omitted-never-zero rule survives PER KEY: an artifact for which the org
    // has published nothing is **omitted, never sent as `0`**, so that case is indistinguishable
    // from a gateway that does not serve that resource — in both the device simply never asks."
    // A `0` makes the two distinguishable again while looking perfectly well-formed.
    const org = await freshOrg();
    const cashier = await addPerson({
      org_id: org.org_id,
      display_name: "Published at A only",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [cashier], {
      now: T,
    });

    // ⚠ **THE ORG PUBLISHES A MENU, AND THAT IS LOAD-BEARING RATHER THAN SCENERY — MEASURED.** The
    // first draft of this test used an org with no catalog, so `reference_versions` was ABSENT
    // wholesale and there was no array for a zero-valued key to sit in: the mutant that advertises
    // the staff key unconditionally (version 0 over an unpublished branch) was **invisible to this
    // test** and was killed only, and incidentally, by another file whose fixtures happen to
    // publish menus. That is this corpus's named failure — a guard built correctly and never
    // pointed at the case that matters — found by mutating and not by reading. With a catalog
    // present the field EXISTS, is non-empty, and the staff key's absence from it is the claim.
    const menuVersion = await publishMenuFor(org);

    // A device at B: its OWN key has never been published, while its ORG's roster tables are
    // populated — the case an org-wide read answers wrongly and a per-key read answers correctly.
    const atB = await openSession(gateway, deviceAt(org, org.branchB));
    const advertisedToB = atB.helloAck.reference_versions ?? [];
    expect(advertisedToB).toContainEqual({
      resource: "catalog",
      scope: { org_id: org.org_id, branch_id: null },
      version: menuVersion,
    });
    expect(staffKeysOf(atB.helloAck)).toEqual([]);
    // Stated as a property of every key on the frame, not only the staff one: a `0` anywhere is
    // the shape `01-F77` forbids. The codec's `min(1)` is the belt this is the brace to — so an
    // implementation that emits one may fail here as a hello that never PARSES rather than as a
    // zero on this array, and either way it is this test that dies, which is what matters.
    for (const key of advertisedToB) expect(key.version).toBeGreaterThan(0);
    // …and the artifact it was not told about is genuinely empty rather than merely unadvertised:
    // a fetch answers `01-F52`'s honest empty snapshot at version 0.
    await atB.conn.handle(staffRequest({ org_id: org.org_id, branch_id: org.branchB }));
    const served = servedStaff(atB, "§C2");
    expect(served.version).toBe(0);
    expect(served.entries).toEqual([]);

    // ANTI-VACUITY: the same gateway DOES advertise a staff key when there is one, so "no staff
    // key" above is about this key and not about a field nothing ever fills.
    const atA = await openSession(gateway, deviceAt(org, org.branchA));
    expect(staffKeysOf(atA.helloAck)).toHaveLength(1);
  });

  it("§C3 01-F76/01-F77: the advertised key is this DEVICE's branch at ITS OWN version, and it is the version the same session is then served", async () => {
    // The two sites are one value stated twice: the device compares the advertised version against
    // its stored one and fetches what it is behind on. A device handed one spelling at hello and
    // another on the answer re-fetches for ever while believing it is current — `01-F76`'s "a
    // version number is meaningless without its key" reached from the other end. Asserting the two
    // frames AGAINST EACH OTHER is what binds both sites at once.
    const org = await freshOrg();
    const atA = await addPerson({
      org_id: org.org_id,
      display_name: "A person",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const atB = await addPerson({
      org_id: org.org_id,
      display_name: "B person",
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: org.branchB }],
    });
    // Different version counts per branch — the whole point of a per-key number.
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [atA], { now: T });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [atA], {
      now: T + 1,
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchA }, [atA], {
      now: T + 2,
    });
    await publishStaffRoster(db, { org_id: org.org_id, branch_id: org.branchB }, [atB], {
      now: T + 3,
    });

    for (const [branch_id, expected] of [
      [org.branchA, 3],
      [org.branchB, 1],
    ] as const) {
      const session = await openSession(gateway, deviceAt(org, branch_id));
      const key = must(
        staffKeysOf(session.helloAck)[0],
        `hello_ack's staff key for branch ${branch_id} — 01-F77 omits an artifact nothing has ` +
          "published for, and this branch has one",
      );
      expect(key.scope).toEqual({ org_id: org.org_id, branch_id });
      expect(key.version).toBe(expected);
      expect(staffKeysOf(session.helloAck)).toHaveLength(1);

      await session.conn.handle(staffRequest({ org_id: org.org_id, branch_id }));
      const served = servedStaff(session, `§C3 at ${branch_id}`);
      // The pair, both halves, across the two frames of one session.
      expect(served.scope).toEqual(key.scope);
      expect(served.version).toBe(key.version);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   §D — 01-F75's two credential doors, reached through the wire
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§D — 01-F75: the credential doors stay shut when the roster is reached over the wire", () => {
  /**
   * The publication log the FR's own measurements are written about.
   *
   *   v1  ayesha  active, hash A                        (the LIVE credential — anti-vacuity)
   *   v2  bilal   active, hash B                        (the INTERMEDIATE row a delta must not replay)
   *   v3  bilal   inactive, NO hash — R32 deleted it    (the departure)
   *
   * `kernel.user_credentials` holds ZERO rows for bilal at the end, which is what makes a served
   * hash a LEAK and not an empty page: R32's deletion was correct and a READ defeated it.
   */
  const departureLog = async (): Promise<{
    org: Org;
    ayesha: string;
    bilal: string;
    liveHash: string;
    deletedHash: string;
  }> => {
    const org = await freshOrg();
    const liveHash = await hashOnce("ayesha");
    const deletedHash = await hashOnce("bilal");
    const ayesha = await addPerson({
      org_id: org.org_id,
      display_name: "Ayesha stays",
      grid_ordinal: 0,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const bilal = await addPerson({
      org_id: org.org_id,
      display_name: "Bilal departs",
      grid_ordinal: 1,
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    const scope = { org_id: org.org_id, branch_id: org.branchA };
    await setPinCredential(db, { org_id: org.org_id, user_id: ayesha, pin_hash: liveHash, now: T });
    expect(await publishStaffRoster(db, scope, [ayesha], { now: T })).toBe(1);

    await setPinCredential(db, {
      org_id: org.org_id,
      user_id: bilal,
      pin_hash: deletedHash,
      now: T + 1,
    });
    expect(await publishStaffRoster(db, scope, [bilal], { now: T + 1 })).toBe(2);

    // R32: the credential row is DELETED when she stops being `active`, in ONE unit of work.
    await setUserStatus(db, {
      org_id: org.org_id,
      user_id: bilal,
      branch_id: org.branchA,
      status: "inactive",
    });
    expect(await publishStaffRoster(db, scope, [bilal], { now: T + 2 })).toBe(3);

    const rows = await db.execute(
      sql`select 1 from kernel.user_credentials
          where org_id = ${org.org_id} and user_id = ${bilal}`,
    );
    expect([...rows], "R32: his credential row is gone — the leak is a READ of the log").toEqual(
      [],
    );
    return { org, ayesha, bilal, liveHash, deletedHash };
  };

  it("§D1 01-F75: `at_version` on a FIRST page is IGNORED — the current version is served, and the deleted hash does not come back", async () => {
    // "`at_version` is honoured only on a CONTINUATION (`from > 0`), and a first page is served the
    // CURRENT version whatever it asks for." The FR's measurement: a brand-new till — a `01-N5`
    // replacement that has never held any roster — asked for `at_version: 1` and was served a
    // departed cashier's entry `active`, with the Argon2id hash R32 had deleted, and her old PIN
    // verified against it.
    const { org, ayesha, bilal, liveHash, deletedHash } = await departureLog();
    const session = await openSession(gateway, deviceAt(org, org.branchA));

    await session.conn.handle(
      staffRequest(
        { org_id: org.org_id, branch_id: org.branchA },
        { have_version: 0, from: 0, at_version: 2 },
      ),
    );
    const served = servedStaff(session, "§D1");

    expect(served.version).toBe(3);
    expect(served.form).toBe("snapshot");
    // The departed cashier is PRESENT as a marked entry (`11-F22`, R26 — "a departure is a MARKED
    // ENTRY and never an absence") and carries no credential (`11-F21`).
    const departed = entryOf(served, bilal, "§D1");
    expect(departed.status).toBe("inactive");
    expect(Object.hasOwn(departed, "pin_hash")).toBe(false);
    // The leak property over the WHOLE delivered frame, not over one field.
    expect(JSON.stringify(served)).not.toContain(deletedHash);
    // ANTI-VACUITY: this artifact really does carry credentials, so "the deleted one is absent" is
    // a measurement and not a page with no hashes in it.
    expect(entryOf(served, ayesha, "§D1 anti-vacuity").pin_hash).toBe(liveHash);
    expect(JSON.stringify(served)).toContain(liveHash);
  });

  it("§D2 01-F75: a DELTA carries one entry per changed id at the target — never the intermediate row it superseded", async () => {
    // "a delta carries ONE entry per changed id, the greatest version ≤ the target — the same fold
    // a snapshot at that version is, restricted to the ids that changed." The FR's measurement:
    // "a cashier published `active` with a hash at v2 and departed at v3 is served her v2 row, hash
    // and all, to any caller that says `have_version: 1`" — the same leak through a second door,
    // found after the first was declared closed.
    const { org, bilal, deletedHash } = await departureLog();
    const session = await openSession(gateway, deviceAt(org, org.branchA));

    await session.conn.handle(
      staffRequest({ org_id: org.org_id, branch_id: org.branchA }, { have_version: 1, from: 0 }),
    );
    const served = servedStaff(session, "§D2");

    // The request's fields reached the serve path: a delta from the EXACT base the device claimed.
    // An arm that ignored `have_version` and always answered a snapshot fails here, and so does one
    // that answered a delta from somewhere else.
    expect(served.form).toBe("delta");
    expect(served.base_version).toBe(1);
    expect(served.version).toBe(3);
    // ONE entry per changed id — the fold, not the log. Two rows for one person let ARRAY POSITION
    // decide her status and her credential, with no error raised on either path.
    expect(idsOf(served)).toEqual([bilal]);
    expect(served.entries).toHaveLength(1);
    const departed = entryOf(served, bilal, "§D2");
    expect(departed.status).toBe("inactive");
    expect(Object.hasOwn(departed, "pin_hash")).toBe(false);
    expect(JSON.stringify(served)).not.toContain(deletedHash);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   §E — 01-F75's PRODUCER, on the real composition root and a real socket
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§E — 01-F75/01-F76: a roster publish fans out a `reference_notice` on THAT artifact key", () => {
  it("§E1 01-F75: a write through /internal reaches a LIVE device at that branch, on its own key and at the version the write minted", async () => {
    // THE SEAM. `01-F75`: "publication **fans out a `reference_notice` on that key**. The producer
    // is the publish path — never a scheduler, never a device", and the FR says why it had to be
    // written down: "the catalog's own fan-out shipped with **zero production callers**, so *Apply
    // now* reached a connected till only at its next reconnect."
    //
    // ⚠ Built on `buildServer`, a real WebSocket and the real route — NOT on a gateway this test
    // wires. A test that supplies the wiring cannot observe whether the product supplies it, which
    // is exactly how the catalog's first seam test survived the mutant where `server.ts` wires a
    // no-op. Nothing below calls a gateway method by hand.
    const org = await freshOrg();
    const wire = await dial(deviceAt(org, org.branchA));
    try {
      // The device is connected and idle BEFORE the write — which is the whole case: a device that
      // reconnects afterwards learns the version from `hello_ack` and proves nothing about a
      // notice.
      expect(staffNoticesOf(wire)).toEqual([]);

      await createOverHttp({
        org_id: org.org_id,
        display_name: "Hired while the till was open",
        assignments: [{ role: "cashier", branch_id: org.branchA }],
      });
      const version = await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA });
      expect(version, "the write did not mint a version for this key (01-F75's producer)").toBe(1);

      await until(
        () => staffNoticesOf(wire).length > 0,
        "no staff reference_notice reached a connected device after a roster write through the " +
          "surface services/api uses — the notice has no production caller (01-F75's producer " +
          "clause, the defect that FR was written for)",
      );
      const notice = must(staffNoticesOf(wire)[0], "the staff reference_notice");
      // Keyed by the ARTIFACT (`01-F76`), so a device can tell WHICH of its keys moved without
      // inferring it from the frame's kind, and carrying the version the publish actually minted —
      // a predicted or stale number sends the till after an artifact that does not exist.
      expect(notice.scope).toEqual({ org_id: org.org_id, branch_id: org.branchA });
      expect(notice.version).toBe(version);
    } finally {
      wire.stop();
    }
  });

  it("§E2 01-F76: a branch-scoped notice reaches THAT branch's devices and no others — including no other branch of the same org", async () => {
    // "Fan-out is keyed by the artifact key, on `01-F71` (d)'s structured-key rule: a branch-scoped
    // notice reaches that branch's devices and no others." Three devices, three verdicts, one
    // write: the branch it reaches, a sibling branch of the SAME org, and another tenant.
    const org = await freshOrg();
    const other = await freshOrg();
    const atA = await dial(deviceAt(org, org.branchA));
    const atB = await dial(deviceAt(org, org.branchB));
    const elsewhere = await dial(deviceAt(other, other.branchA));
    try {
      await createOverHttp({
        org_id: org.org_id,
        display_name: "Cashier for A only",
        assignments: [{ role: "cashier", branch_id: org.branchA }],
      });

      await until(
        () => staffNoticesOf(atA).length > 0,
        "§E2: the device at the written branch heard nothing",
      );

      // ORDERING, so the two silences below are measurements. The publish's HTTP response has
      // already returned and A's notice has already arrived, so any frame these two were ever going
      // to be sent on this walk was written before the pings — and the gateway answers a ping from
      // the same sink, on the same connection, so it is in `heard` by the time the pong is.
      await flush(atB, "§E2 sibling branch");
      await flush(elsewhere, "§E2 other tenant");

      expect(
        staffNoticesOf(atB),
        "a device at ANOTHER BRANCH of the same org was told a roster it does not hold had " +
          "changed — its own key did not move, so it will fetch and apply nothing, and a fan-out " +
          "that ignores the branch half of the key is the org-scoped roster R25 refused",
      ).toEqual([]);
      expect(
        staffNoticesOf(elsewhere),
        "another TENANT's device was told about this org's roster (00 §5.4, 01-F71)",
      ).toEqual([]);
      // ANTI-VACUITY for the sibling: the same socket, the same session, DOES receive a notice when
      // its OWN key moves. Without this, "atB heard nothing" is equally consistent with a device
      // that hears nothing ever.
      await createOverHttp({
        org_id: org.org_id,
        display_name: "Cashier for B only",
        assignments: [{ role: "cashier", branch_id: org.branchB }],
      });
      await until(
        () => staffNoticesOf(atB).length > 0,
        "§E2: the sibling device heard nothing even when its OWN branch's roster was written — " +
          "the silence above proves nothing about the key",
      );
      expect(must(staffNoticesOf(atB)[0], "B's own notice").scope).toEqual({
        org_id: org.org_id,
        branch_id: org.branchB,
      });
    } finally {
      atA.stop();
      atB.stop();
      elsewhere.stop();
    }
  });

  it("§E3 01-F75/01-F78: one write that reaches TWO branches announces on BOTH keys, each at its own version", async () => {
    // `01-F75`: "a write that changes an artifact mints the next version for **each affected
    // `(resource, scope)` key**", and `01-F78` half one is what makes one person affect two keys:
    // an org-wide assignment (`01-F26`'s null location) reaches EVERY branch. The two branches are
    // deliberately at different versions when the write lands, so an implementation that announces
    // one number to the whole org — the catalog's shape, one resource over — cannot pass.
    const org = await freshOrg();
    await createOverHttp({
      org_id: org.org_id,
      display_name: "A-only cashier, hired before the tills connected",
      assignments: [{ role: "cashier", branch_id: org.branchA }],
    });
    expect(await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA })).toBe(1);
    expect(await staffVersion(db, { org_id: org.org_id, branch_id: org.branchB })).toBe(0);

    const atA = await dial(deviceAt(org, org.branchA));
    const atB = await dial(deviceAt(org, org.branchB));
    try {
      await createOverHttp({
        org_id: org.org_id,
        display_name: "The owner, org-wide",
        assignments: [{ role: "owner", branch_id: null }],
      });

      await until(() => staffNoticesOf(atA).length > 0, "§E3: branch A heard nothing");
      await until(() => staffNoticesOf(atB).length > 0, "§E3: branch B heard nothing");

      const noticeA = must(staffNoticesOf(atA)[0], "A's notice");
      const noticeB = must(staffNoticesOf(atB)[0], "B's notice");
      expect(noticeA.scope).toEqual({ org_id: org.org_id, branch_id: org.branchA });
      expect(noticeB.scope).toEqual({ org_id: org.org_id, branch_id: org.branchB });
      expect(noticeA.version).toBe(
        await staffVersion(db, { org_id: org.org_id, branch_id: org.branchA }),
      );
      expect(noticeB.version).toBe(
        await staffVersion(db, { org_id: org.org_id, branch_id: org.branchB }),
      );
      // ATTRIBUTION: one write, two keys, two DIFFERENT numbers. One org-wide version, or either
      // branch's number sent to both, fails here — and that is `01-F76`'s stated price for a
      // branch-scoped artifact, paid in the design rather than discovered in the field.
      expect(noticeA.version).toBe(2);
      expect(noticeB.version).toBe(1);
      expect(noticeA.version).not.toBe(noticeB.version);
    } finally {
      atA.stop();
      atB.stop();
    }
  });

  it("§E4 01-F75: a roster write held mid-transaction announces NOTHING — the notice FOLLOWS the commit", async () => {
    // ── WHY E1..E3 CANNOT MAKE THIS CLAIM ───────────────────────────────────────────────────────
    // Each of them waits for a notice and THEN compares its version against a database read, so a
    // producer that announced a PREDICTED number before its write committed passes all three: by
    // the time the assertion reads the version, the write has landed. `journey-catalog.test.ts`'s
    // `SEAM (ORDER)` is the same claim one resource over, and its matrix is why this one exists —
    // the announce-first mutant survived the whole gateway suite until that fixture was built.
    //
    // What it costs on THIS artifact is worse than on a menu. A device told about version N+1 that
    // has not committed fetches, is served the roster at N, and stores it as current — so a person
    // hired seconds ago cannot sign in, or one just deactivated still can (`11-F21`/R32), and
    // nothing re-announces: `01-F77`'s `hello_ack` reconciliation is the next chance, which is the
    // reconnect the notice exists to save.
    //
    // ── THE WINDOW IS A LOCK, THE OBSERVATION IS A ROUND TRIP ───────────────────────────────────
    // `publishStaffRoster` serializes per ARTIFACT KEY on `pg_advisory_xact_lock(hashtext(
    // 'restos:staff:' || org), hashtext(branch))` — the two-integer form, because `01-F71` (d) bans
    // the concatenation. This fixture takes THAT lock on its own connection, which is not a
    // contrivance but a real production condition (a second write for the same key already in
    // flight), so the write under test blocks at the top of its transaction and cannot commit until
    // this test releases it. Then:
    //   1. `pg_locks` is polled until a backend is provably WAITING on this exact lock — matched by
    //      joining against the lock THIS backend holds, so no advisory-key bit arithmetic is
    //      reproduced and no other key's waiter can be mistaken for ours. **This is the anti-vacuity
    //      guard**: without it a request that 400'd before ever reaching the database would satisfy
    //      "no notice arrived" while proving nothing. (`pg_blocking_pids` is deliberately NOT used:
    //      Postgres queues a second waiter behind the first WAITER rather than behind the holder, so
    //      that call can report nothing while the barrier is holding perfectly well.)
    //   2. The device pings its OWN socket and waits for the pong. The gateway answers a ping
    //      synchronously from the same sink a notice is written to, on the same connection, so a
    //      notice written before the block is in `heard` by the time the pong is.
    // There is no sleep in this test and no wall-clock constant to tune.
    const org = await freshOrg();
    const scope = { org_id: org.org_id, branch_id: org.branchA };
    const wire = await dial(deviceAt(org, org.branchA));
    // Its own connection, `max: 1`, so `pg_backend_pid()` below is this lock's holder.
    const barrier = postgres(testDatabaseUrl(), { max: 1 });
    let writing: Promise<Http> | undefined;

    try {
      expect(staffNoticesOf(wire)).toEqual([]);
      // The same key `publishStaffRoster` computes. If it ever drifts, the write will not block and
      // step 1 fails loudly — which is what stops this test decaying into a vacuous one.
      await barrier`select pg_advisory_lock(hashtext('restos:staff:' || ${org.org_id}::text),
                                            hashtext(${org.branchA}::text))`;

      writing = post("/internal/users", {
        org_id: org.org_id,
        display_name: "Hired while a publish was already in flight",
        email: null,
        assignments: [{ role: "cashier", branch_id: org.branchA }],
        now: T,
        actor_user_id: "actor-owner-staff-wire",
      });

      await untilAsync(
        async () =>
          ((
            await barrier<{ waiting: number }[]>`
              select count(*)::int as waiting
                from pg_locks waiter
                join pg_locks mine
                  on mine.locktype = 'advisory'
                 and mine.granted
                 and mine.pid = pg_backend_pid()
                 and waiter.classid = mine.classid
                 and waiter.objid = mine.objid
                 and waiter.objsubid = mine.objsubid
               where waiter.locktype = 'advisory' and not waiter.granted`
          )[0]?.waiting ?? 0) > 0,
        "§E4: the roster write never blocked on this artifact key's advisory lock — the barrier " +
          "did not engage, so anything asserted below would have proved nothing about ordering",
      );

      await flush(wire, "§E4");

      // The barrier held, so there is no version to announce: `staff_versions` is written INSIDE
      // the transaction this fixture is holding open.
      expect(
        await staffVersion(db, scope),
        "§E4: the barrier did not hold the write — a version committed while the lock was held",
      ).toBe(0);

      // THE INVARIANT. With the commit provably held, the branch has been told nothing.
      expect(
        staffNoticesOf(wire),
        "a staff reference_notice reached a connected device while its write was still blocked " +
          "mid-transaction — the notice PRECEDED the commit. Every till at the branch has been " +
          "sent after a roster version the gateway does not have; each will fetch, be served the " +
          "OLD roster, store it as current (01-F56 applies monotonically) and hear nothing further " +
          "until its next hello_ack (01-F77) — which is the reconnect this notice exists to save",
      ).toEqual([]);

      const [released] = await barrier<{ released: boolean }[]>`
        select pg_advisory_unlock(hashtext('restos:staff:' || ${org.org_id}::text),
                                  hashtext(${org.branchA}::text)) as released`;
      expect(released?.released, "the barrier was not held under publishStaffRoster's key").toBe(
        true,
      );

      const reply = must(await writing, "the held write's reply");
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);

      // AND THE OTHER SIDE OF THE ORDERING, so this test is not one-sided: once the commit lands
      // the notice DOES follow it, at the version the write minted. Without this leg an
      // implementation that never announces at all would pass.
      await until(
        () => staffNoticesOf(wire).length > 0,
        "§E4: the notice did not follow the commit either — the device was never told",
      );
      const notice = must(staffNoticesOf(wire)[0], "the staff reference_notice after the release");
      expect(notice.scope).toEqual(scope);
      expect(notice.version).toBe(await staffVersion(db, scope));
      expect(notice.version).toBe(1);
    } finally {
      // Released first: ending the connection drops the advisory lock even if an assertion above
      // threw while holding it, so the blocked write can finish rather than sitting in a torn-down
      // server for the rest of the file.
      await barrier.end({ timeout: 5 });
      await writing?.catch(() => undefined);
      wire.stop();
    }
  });
});
