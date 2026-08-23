// Acceptance tests — the reference-data wire: ONE resource-discriminated triple, the artifact key,
// and the `v: 1` → `v: 2` bump. FRs: 01-F75, 01-F76, 01-F77 (+ 11-F20, 11-F21, 11-F22, 01-F26,
// 01-F55, 01-F61).
//
// AUTHORED FROM SPEC TEXT ONLY, by a session that wrote no implementation and read none of the
// step's build sequence. Every assertion below names the clause it transcribes. Read the FRs, not
// this file, if the two ever disagree — and report the disagreement rather than editing an
// assertion (24 §3 step 2, .claude/rules/tests-and-conformance.md).
//
// ── ⚠ THREE PRE-EXISTING ORACLE ASSERTIONS ENCODE THE OVERRULED `v: 1` RULE AND MUST MOVE ───────
//
// They are NOT this file's and were deliberately left untouched, because a test author does not
// silently rewrite another session's oracle. They will red under a CORRECT implementation of this
// step, and the implementing change is licensed to move them BY FR ID (01-F75 supersedes the
// catalog triple; 01-F77 bumps the version). Listed with what each claims, so the move is a
// transcription rather than a judgement:
//
//   1. `messages.test.ts` — `KINDS_PER_PROTOCOL_MD` lists the three `catalog_*` kinds and the
//      suite asserts `MESSAGE_KINDS` has length 14; and `"PROTOCOL.md: v must be exactly 1"`
//      asserts that `v: 2` THROWS. Both are the rule 01-F77 overrules. §A and §B below are their
//      replacements and make the same claims at 16 kinds and `v: 2`.
//   2. `fixtures.test.ts` — `FIXTURE_KINDS` names `catalog_request` / `catalog_response` /
//      `catalog_notice` (whose golden files this step supersedes, so it will fail to READ, not
//      merely to assert) and pins `expect(decoded.v).toBe(1)`. `reference-fixtures.test.ts` is its
//      replacement and covers every fixture in the directory rather than a hand-listed seven.
//   3. `builders.ts` — every builder emits `v: 1`, so the whole package suite and the gateway /
//      sync-client suites that import it follow the constant. 01-F77: "`v` is one shared literal
//      on every frame in the shipped codec … an implementer who ships only a reader has shipped
//      nothing."
//
// ⚠ AND THE N−1 READER IS **DEFERRED, NOT WITHDRAWN** (01-F77, founder ruling): R4 puts nothing in
// the field, so nothing here asserts that a `v: 1` reader exists — §B asserts the opposite
// property, which is what actually ships: the whole system moves in ONE step, so a `v: 1` frame is
// REFUSED rather than half-understood, and the refusal says which version this build speaks. The
// reader, the three retained `v: 1` fixtures and the per-session negotiation land before the first
// pilot device is paired; a test written for them now would be the speculative work 24 §3b forbids.
//
// ── ⚠ WHAT A CLEAN RUN OF THIS FILE DOES **NOT** COVER — READ THIS BEFORE CITING IT ─────────────
//
// This is a WIRE oracle. It judges what a frame can REPRESENT and nothing about who is served
// what. **There is no serve path in this step**, so the three refusals below have no code to bind
// and are deliberately unasserted — a clean run here is not evidence for any of them:
//
//   · **A credential change honoured for a user other than the session's.** 01-F79 puts the
//     comparison on the cloud ("comparing the named user to the SESSION's user, never to a field
//     the device chose"); §H5 asserts only that there IS something to compare.
//   · **01-F71 (e)'s key-from-session refusal.** The org comes from the authenticated session and
//     the branch from the device's own identity, and a `reference_request` naming any other key is
//     an auth failure rather than a clamp. A frame can carry a key; only a session can judge it.
//   · **01-F76's DEVICE-side `foreign_artifact` refusal.** The belt to that brace, and it lives in
//     `sync-client` with a named reason string this package does not own.
//
// And three things the wire could express and this file deliberately does not, each stated so the
// absence is a decision rather than an oversight:
//
//   · **Uniqueness ACROSS PAGES.** §D15/§D16 bind `user_id` and `grid_ordinal` within ONE frame,
//     which is all a frame can see; a paged snapshot (`complete: false`) spans several, and
//     01-F75's "unique within the ARTIFACT" is therefore the writer's and the device's as well.
//   · **`version: 0` on a RESPONSE or a NOTICE.** 01-F77's omitted-never-zero clause is written
//     for `hello_ack`'s key set and §F6 asserts it exactly there. A response at version 0 is a
//     real shipped shape (a key with nothing published answers an empty snapshot at 0), so
//     extending the ban would red a correct implementation.
//   · **Two catalog rows for one `id` in one response.** The catalog's one-entry-per-changed-id
//     rule is 01-F75's DELTA clause, which is about what a server constructs; it is asserted on
//     the serve path in `services/sync-gateway`'s §K4/§K5. §D15 is scoped to `staff` on purpose.
//
// ── MUTATION MATRIX for the twelve assertions added 2026-08-19 (the round-3 law) ──────────────
//
// Run OUT OF TREE against a plausible codec built from the FR text and taken green at **142/142,
// `REAL_EXIT=0`** read from a marker written INSIDE the log; every row is the FULL package suite
// and differs from that control in exactly one branch unless labelled. All twelve were measured
// ACCEPTED by a codec that already killed 36 earlier rows, so each one closes a real hole.
//
// ⚠ **THE COUNTS BELOW WERE RE-TAKEN AT 142 RATHER THAN CARRIED FORWARD.** They were first
// measured at a 143-test control that included a `C9` — retired before the final run because it
// was a verbatim copy of `C6`'s claim — and a matrix quoting a control the suite no longer has is
// the staleness this repo keeps paying for. Nothing in the table moved; the re-take is the point.
//
//   S1     the per-resource scope pairing removed everywhere        3 — C7, C8, F7
//   S1req  …removed from `reference_request` only                   2 — C7, C8
//   S1not  …from `reference_notice` only                            2 — C7, C8
//   S1res  …from `reference_response` only                          1 — C8
//   S1ack  …from `hello_ack.reference_versions` only                1 — F7
//   S1half the guard aimed at ONE resource (catalog yes, staff no)  2 — C7, F7   ← C8 SURVIVES it
//   S2     01-F78 half one: the non-empty assignment floor          1 — D13
//   S3     01-F78 half two: the reach predicate                     1 — D14
//   S3b    …the same guard aimed at `assignments[0]` only           1 — D14
//   S4     one row per `user_id`                                    1 — D15
//   S5     `grid_ordinal` unique within the artifact                1 — D16
//   S6     `base_version` iff `form: "delta"`                       1 — D17
//   S6c    only the DELTA half kept (a snapshot may carry a base)   1 — D17
//   S6d    only the SNAPSHOT half kept (a delta may arrive bare)    1 — D17
//   S7     01-F77's omitted-never-zero, per key                     1 — F6
//   S8     one entry per artifact key                               1 — F5
//   S8b    …uniqueness written over `resource` ALONE                1 — F5 (its CONTROL leg)
//   SCTRL1 CONTROL: all seven new refusal messages reworded         **0**
//   SCTRL2 CONTROL: all four new refusal `path`s changed            **0**
//
// **S1half and S8b are the two rows worth re-running after any change here.** S1half is this
// chain's own recurring defect built on purpose — a pairing check written for one resource — and
// C8 survives it, which is why the claim is asserted in BOTH directions rather than once. S8b is
// the repair a session reaching only for "no duplicates" would write: keying uniqueness on
// `resource` alone passes every refusal in §F5 and forbids the two-branch case 01-F76 exists for,
// and only F5's control leg separates them.
//
// ⚠ **ONE ROW WAS MIS-DESIGNED AND IS KEPT FOR WHAT IT TEACHES.** The first §D15 mutant swapped
// `user_id` for `display_name` in the distinctness check and **survived** — because the duplicate
// row the test builds copies BOTH fields, so the mutated check refuses it anyway. It did not
// produce the dangerous behaviour, so its survival said nothing about the assertion. A second row
// (`base_version` required on EVERY response) killed 28 tests: true, useless, and not attributable
// — S6c/S6d are its two one-branch halves. **Check what a mutant DOES before recording what its
// result means** — `migratable`'s N5 and `revocable`'s R2b record the same lesson.
//
// The 36 rows the earlier prover ran were re-run against the same control and none regressed;
// **W17** (the staff fixture reduced to its active row) now kills **6** where it killed 4, because
// §D15/§D16 read the second row for their controls.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as protocol from "../index.js";
import {
  MESSAGE_KINDS,
  PROTOCOL_VERSION,
  parseMessage,
  UnknownMessageKindError,
} from "../index.js";

// ── The fixtures are the contract (20 §2.7), so the frames below are READ from the committed
// golden files and pushed through the PRODUCTION codec. Nothing here hand-copies a frame: that is
// K-3's dead-oracle defect, and `messages.ts` records the shipped version of the same lesson
// (`CatalogEntryWire` is exported so the WRITER validates against it).
type Frame = Record<string, unknown>;
const fixture = (name: string): Frame =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), "utf8"),
  ) as Frame;

const REQ_STAFF = "reference_request";
const REQ_CATALOG = "reference_request_catalog";
const RES_STAFF = "reference_response";
const RES_CATALOG = "reference_response_catalog";
const NOTICE_CATALOG = "reference_notice";
const NOTICE_STAFF = "reference_notice_staff";

/** Every reference fixture, BOTH resources on ALL THREE kinds — see §C4's note. */
const REFERENCE_FIXTURES = [
  REQ_STAFF,
  REQ_CATALOG,
  RES_STAFF,
  RES_CATALOG,
  NOTICE_CATALOG,
  NOTICE_STAFF,
] as const;

/** The three staff-keyed fixtures and the three catalog-keyed ones — §C7/§C8's two halves. */
const STAFF_FIXTURES = [REQ_STAFF, RES_STAFF, NOTICE_STAFF] as const;
const CATALOG_FIXTURES = [REQ_CATALOG, RES_CATALOG, NOTICE_CATALOG] as const;

/**
 * The tenant the committed fixtures are keyed to, READ from a golden file rather than hand-copied:
 * a constant transcribed into a test is K-3's dead oracle, and these two values decide whether a
 * scope is this artifact's or another's, so a stale copy would assert the opposite of the claim.
 */
const scopeIn = (name: string): Frame => fixture(name).scope as Frame;
const ORG_ID = String(scopeIn(RES_STAFF).org_id);
const BRANCH_ID = String(scopeIn(RES_STAFF).branch_id);
/** A branch of the same org that this artifact is NOT keyed to. */
const OTHER_BRANCH = "01980000-0000-7000-8000-00000000b999";

const refuses = (frame: unknown): void => {
  expect(() => parseMessage(frame)).toThrow();
};

/**
 * ⚠ ANTI-VACUITY, and it is not decoration — MEASURED on the tree this file was authored against.
 *
 * A refusal proves nothing unless the frame it mutates is ACCEPTED. Run against the `v: 1` codec,
 * where `reference_*` is not a kind at all, `parseMessage` throws for EVERY input — so 19 of this
 * file's 53 assertions (the count as authored; it has grown since) went green for a build that
 * cannot carry a roster at all. Every base frame
 * below is therefore parsed FIRST, in the same test, and a section cannot report a closed set, a
 * structured scope or a typed row while the frame carrying them does not exist.
 *
 * This is `24-F14`'s empty-match rule applied to a negative assertion: a `refuses` with no anchor
 * is an assertion whose subject may not be there.
 */
const anchored = (name: string): Frame => {
  const frame = fixture(name);
  expect(
    parseMessage(frame),
    `ANCHOR: ${name} must PARSE before any mutation of it can prove anything`,
  ).toEqual(frame);
  return frame;
};

/**
 * A value a frame MUST NOT be able to carry. Two answers are both correct — refuse the frame, or
 * strip the undeclared key (01-F40's reject-or-drop) — and exactly one is wrong: parse it and hand
 * the value on. So this asserts the VALUE does not survive, never which of the two happened.
 *
 * Takes the base fixture's NAME rather than a frame, so the anchor above cannot be forgotten at a
 * call site: `cannotCarry` swallows a throw by design, which is exactly the shape that goes vacuous.
 */
const cannotCarry = (name: string, over: Frame, sentinel: string): void => {
  const frame = { ...anchored(name), ...over };
  let parsed: unknown;
  try {
    parsed = parseMessage(frame);
  } catch {
    return; // refusing is the stronger of the two legal answers
  }
  expect(JSON.stringify(parsed)).not.toContain(sentinel);
};

const withEntries = (name: typeof RES_STAFF | typeof RES_CATALOG, entries: unknown[]): Frame => ({
  ...anchored(name),
  entries,
});

const staffEntry = (over: Frame = {}): Frame => {
  const entries = fixture(RES_STAFF).entries as Frame[];
  const active = entries[0];
  if (active === undefined) throw new Error("fixture reference_response has no entries");
  return { ...active, ...over };
};

const inactiveStaffEntry = (over: Frame = {}): Frame => {
  const entries = fixture(RES_STAFF).entries as Frame[];
  const inactive = entries[1];
  if (inactive === undefined) throw new Error("fixture reference_response has no second entry");
  return { ...inactive, ...over };
};

const catalogEntry = (): Frame => {
  const entries = fixture(RES_CATALOG).entries as Frame[];
  const first = entries[0];
  if (first === undefined) throw new Error("fixture reference_response_catalog has no entries");
  return first;
};

/** The parsed frame's `branch_id`, through `unknown` because the codec's union is not a Frame. */
const scopeOf = (parsed: unknown): unknown =>
  ((parsed as { scope?: { branch_id?: unknown } }).scope ?? {}).branch_id;

const without = (frame: Frame, key: string): Frame => {
  const copy = { ...frame };
  delete copy[key];
  return copy;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§A — ONE resource-discriminated triple, and the catalog trio is superseded (01-F75)", () => {
  // "The triple, and the names are the SPEC's: `reference_request` (device →),
  // `reference_response` (→ device), `reference_notice` (→ device). `20 §2.7` makes the message set
  // a contract pinned by golden fixtures, so a kind's name is not an implementation choice."
  //
  // 14 kinds − the 3 superseded catalog kinds + the 3 reference kinds + 01-F79's request/result
  // pair = 16. The list is written out rather than derived from MESSAGE_KINDS, because a set
  // compared against itself is the vacuous assertion 24-F14 exists to catch.
  const KINDS_AT_V2 = [
    "hello",
    "hello_ack",
    "push",
    "push_ack",
    "event_batch",
    "catchup_request",
    "catchup_response",
    "reference_request",
    "reference_response",
    "reference_notice",
    "credential_change_request",
    "credential_change_result",
    "quarantine_notice",
    "purge_command",
    "ping",
    "pong",
  ];

  it("A1 01-F75/01-F79: MESSAGE_KINDS is exactly the 16 kinds — the triple in, the catalog trio out", () => {
    expect([...MESSAGE_KINDS].sort()).toEqual([...KINDS_AT_V2].sort());
    expect(MESSAGE_KINDS).toHaveLength(16);
  });

  it("A2 01-F75: `catalog_request` / `catalog_response` / `catalog_notice` are no longer kinds", () => {
    for (const gone of ["catalog_request", "catalog_response", "catalog_notice"]) {
      expect(MESSAGE_KINDS).not.toContain(gone);
    }
  });

  it("A3 01-F75/01-F77: a well-formed catalog frame is REFUSED BY NAME, not silently accepted", () => {
    // The superseded kinds are removed, and 01-F77 is what makes removing them legal: "removing
    // kinds is not additive, so 00 §6's rule binds without interpretation". A frame that was valid
    // yesterday must fail as an UNKNOWN KIND rather than parse into something else — the closed
    // message set is what PROTOCOL.md's `UnknownMessageKindError` already means.
    for (const kind of ["catalog_request", "catalog_response", "catalog_notice"]) {
      expect(() =>
        parseMessage({ v: PROTOCOL_VERSION, kind, have_version: 7, version: 9 }),
      ).toThrow(UnknownMessageKindError);
    }
  });

  it("A4 01-F75: each of the three reference kinds parses, on BOTH resources", () => {
    // The anchor for every refusal below. Six frames, not three: "a fixture that only ever
    // exercises the resource the frame is named for" is the guard-aimed-one-case-away shape this
    // chain has produced in every round.
    for (const name of REFERENCE_FIXTURES) {
      const frame = fixture(name);
      expect(parseMessage(frame)).toEqual(frame);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§B — the wire version bumps, and the system moves in ONE step (01-F77)", () => {
  it("B1 01-F77: PROTOCOL_VERSION is 2", () => {
    // "01-F75 supersedes catalog_request / catalog_response / catalog_notice; removing kinds is not
    // additive, so 00 §6's rule binds without interpretation: the wire version bumps (v: 1 → v: 2)."
    expect(PROTOCOL_VERSION).toBe(2);
  });

  it("B2 01-F77: a `v: 1` frame of a NEW kind is refused, and the refusal names the version", () => {
    // Not a reader and not a half-parse. R4 puts nothing in the field, so the N−1 reader is
    // deferred and a `v: 1` frame has no meaning on this build; 00 §5.7 makes "it did not work" the
    // failure, so the refusal has to say WHICH version this build speaks.
    let thrown: unknown;
    try {
      parseMessage({ ...anchored(REQ_STAFF), v: 1 });
      throw new Error("unreachable: a v: 1 frame must be refused");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    // The KIND is known; it is the VERSION that is not. Reporting this as an unknown kind would
    // tell an operator the wrong thing about a fleet that is mid-rollout.
    expect(thrown).not.toBeInstanceOf(UnknownMessageKindError);
    expect(String((thrown as Error).message)).toContain(String(PROTOCOL_VERSION));
  });

  it("B3 01-F77: a `v: 1` frame of an UNCHANGED kind is refused too — `v` is one shared literal", () => {
    // "`v` is one shared literal on every frame in the shipped codec, so a gateway that parses a
    // `v: 1` hello and answers `v: 2` is rejected by the old device's own literal." The whole
    // system moves in one step; `ping` and `hello` are not exempt because their bodies did not
    // change.
    for (const name of ["ping", "hello", "push_ack", "quarantine_notice"]) {
      const frame = fixture(name);
      refuses({ ...frame, v: 1 });
      // The control that keeps this from being "any ping is refused": the same body at v: 2 parses.
      expect(parseMessage({ ...frame, v: PROTOCOL_VERSION })).toEqual({
        ...frame,
        v: PROTOCOL_VERSION,
      });
    }
  });

  it("B4 01-F77: `v: 0`, a missing `v` and a string `v` are refused on a reference frame", () => {
    const frame = anchored(NOTICE_STAFF);
    refuses({ ...frame, v: 0 });
    refuses({ ...frame, v: 3 });
    refuses({ ...frame, v: "2" });
    refuses(without(frame, "v"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§C — an artifact is (resource, scope), and the resource set is CLOSED (01-F75, 01-F76)", () => {
  // "The resource set is CLOSED, and adding a member is a spec act exactly as adding a kind is."
  //
  // ⚠ **`device_roster` LEFT the refused list by the spec act 01-F75's own clause demands**
  // (`01-F81`, August 2026). `01-F74`'s roster was excluded because it is a *signed* artifact and
  // 01-F75 specified no signature envelope; `01-F81` (b) is that envelope, so the member arrived
  // WITH its security half. Retiring the assertion here is the same act as retiring the FR's own
  // strikethrough — a green test that goes on defending an overruled rule would fail the correct
  // implementation, which this repo has already paid for once (`catalog-pricing.test.ts:394`).
  //
  // ⚠ **THE SIZE OF THE SET IS NOT STATED HERE, AND IT USED TO BE — TWICE, THE SECOND TIME AS A
  // QUOTATION.** This comment read "IT HOLDS THREE AS OF 01-F81" and then quoted the clause as
  // saying so. Measured 2026-08-23, that clause reads FOUR: `01-F87` added `config`. A quoted spec
  // sentence inside shipping code acquires the code's shelf life — the finding of the commit
  // immediately before the one that wrote this line (`e74cffb`), reproduced by the change that had
  // just read it. So the RULE is stated and the FR id is cited, and the count is looked up in
  // `01-F75`'s clause where it lives.
  //
  // ⚠ **`config` is deliberately ABSENT from `NOT_RESOURCES` below, and that is not an omission.**
  // It is a declared member of `01-F75`'s set (`01-F87`) with no wire arm in this build, so it is
  // neither a legal resource on these frames nor one of the corpus's NAMED exclusions. Listing it
  // as refused would encode "config is not a reference resource", which the corpus overruled the
  // day it was written — this file's own `device_roster` lesson, one member later. Its arm and its
  // golden fixture are a separate spec-directed act.
  //
  // What is NOT retired is the property: the set is CLOSED, and every name outside it is refused.
  // The remaining refusals are still the corpus's OWN named exclusions rather than arbitrary
  // strings — 11 §2 / 11-F18's four sets, excluded for a DIFFERENT reason 01-F75 states separately
  // (none of them needs a signature; each has no writer, no publication surface and no device
  // consumer). "A resource string an implementation invents is a 01-F4-shaped error one layer down."
  const NOT_RESOURCES = [
    "checklist_templates",
    "shift_presets",
    "schedules",
    "sop_documents",
    "users",
    "staff_roster",
    "CATALOG",
    "Staff",
    "",
  ];

  it("C1 01-F75/01-F81: `catalog`, `staff` and `device_roster` are the whole set — every other resource string is refused", () => {
    for (const name of REFERENCE_FIXTURES) {
      const frame = anchored(name);
      for (const resource of NOT_RESOURCES) refuses({ ...frame, resource });
    }
  });

  it("C2 01-F75: both legal resources are legal on ALL THREE kinds (the set is not one-per-kind)", () => {
    // The other half of C1, and the reason it is separate: a frame that refused `staff` on
    // `reference_notice` would pass C1 while making the roster undeliverable, which is 01-F17
    // arriving through the identity path.
    for (const [name, resource] of [
      [REQ_STAFF, "staff"],
      [REQ_CATALOG, "catalog"],
      [RES_STAFF, "staff"],
      [RES_CATALOG, "catalog"],
      [NOTICE_CATALOG, "catalog"],
      [NOTICE_STAFF, "staff"],
    ] as const) {
      expect((parseMessage(fixture(name)) as Frame).resource).toBe(resource);
    }
  });

  it("C3 01-F75/01-F76: a frame with no `resource` is refused — the discriminator is not optional", () => {
    for (const name of REFERENCE_FIXTURES) refuses(without(anchored(name), "resource"));
  });

  it("C4 01-F76: the scope is STRUCTURED — a concatenated key is refused on all three kinds", () => {
    // "Every frame in the triple states the scope of the artifact it is about, as a STRUCTURED
    // value and never as a concatenation — 01-F71 (d)'s rule for fan-out keys, for the same reason:
    // ('ab','c') and ('a','bc') are different tenants, and a separator-less key maps both to one
    // set with no error in it."
    const CONCATENATIONS = [
      "01980000-0000-7000-8000-0000000000a1:01980000-0000-7000-8000-00000000b001",
      "01980000-0000-7000-8000-0000000000a101980000-0000-7000-8000-00000000b001",
      "01980000-0000-7000-8000-0000000000a1/01980000-0000-7000-8000-00000000b001",
    ];
    for (const name of REFERENCE_FIXTURES) {
      const frame = anchored(name);
      for (const scope of CONCATENATIONS) refuses({ ...frame, scope });
    }
  });

  it("C5 01-F76: the scope is `{ org_id, branch_id }` — a frame with no scope, or no org_id, is refused", () => {
    for (const name of REFERENCE_FIXTURES) {
      const frame = anchored(name);
      refuses(without(frame, "scope"));
      refuses({ ...frame, scope: without(frame.scope as Frame, "org_id") });
      refuses({ ...frame, scope: { org_id: "", branch_id: null } });
      refuses({ ...frame, scope: [] });
    }
  });

  it("C6 01-F76: `branch_id: null` is ORG scope and a real branch id is BRANCH scope — both legal", () => {
    // "with `branch_id: null` meaning ORG scope — ONE shape for every resource and not one per
    // resource." The catalog stays org-scoped (01-F52) and the roster is branch-scoped (R25), so
    // the fixtures vary the scope as well as the resource — the second half of the
    // guard-aimed-one-case-away trap.
    const orgScoped = [REQ_CATALOG, RES_CATALOG, NOTICE_CATALOG] as const;
    const branchScoped = [REQ_STAFF, RES_STAFF, NOTICE_STAFF] as const;
    for (const name of orgScoped) {
      expect(scopeOf(parseMessage(fixture(name)))).toBeNull();
    }
    for (const name of branchScoped) {
      expect(typeof scopeOf(parseMessage(fixture(name)))).toBe("string");
    }
  });

  // ── §C7/§C8 — THE CROSS PAIRING, and it is one claim in two directions ────────────────────────
  //
  // C6 asserts that BOTH scope levels are legal on the wire. Nothing asserted which one goes with
  // which RESOURCE, so a `staff` artifact at org scope and a `catalog` artifact at branch scope
  // both parsed — while 01-F76 states the scoping per resource, twice and in terms: "The catalog
  // stays ORG-scoped and byte-identical everywhere … nothing here re-opens it", and "The staff
  // roster is BRANCH-scoped, and the reason is the credential." 01-F52 says the same of the
  // catalog from the other side ("catalog is **org-scoped**, not branch-scoped").
  //
  // The frame is where that is made UNREPRESENTABLE rather than merely wrong, on 01-F75's own
  // argument for §D1/§D2: "It is the FRAME that has to make a cross-resource payload
  // unrepresentable." A `staff` roster at org scope is every branch's credentials in one artifact
  // — R25's purchase (branch scope as the credential blast radius, 11-F21) spent in one field —
  // and a branch-scoped `catalog` is the "one version number meaning different bytes on different
  // devices" that 01-F76 says the catalog is org-scoped to avoid.
  //
  // ⚠ **A PINNED READING, and here is the clause it is in tension with, so a reviewer can find
  // it.** 01-F76: "ONE shape for every resource and not one per resource. Two shapes would make a
  // reader switch on `resource` before it can parse `scope`." The property that clause protects
  // survives: `{ org_id, branch_id }` is still ONE shape, still parseable without reading the
  // discriminator, and 01-F71 (e)'s serve path can still lift the key out of any frame before it
  // looks at `resource`. What narrows per resource is the legal VALUE of `branch_id`, not the
  // shape. If that reading is wrong, it is a finding against this file — cite 01-F76 and amend the
  // FR; do not silently widen the codec (24 §3 step 2).
  //
  // **C6 IS THE CONTROL FOR BOTH, and no third test is written** — its `orgScoped` /
  // `branchScoped` lists already assert exactly the correct pairing on all three kinds, so a codec
  // refusing one resource outright dies there. A fourth copy of that claim would be two
  // representations of one fact, which is what this file refuses in `§D10` and `§I1`.
  //
  // ⚠ AND IT IS NOT 01-F71 (e)'s. That refusal compares the frame's key to the SESSION's, and it
  // would catch a `staff` request at org scope on the REQUEST leg only. `reference_response` and
  // `reference_notice` travel server→device, where the device-side belt (01-F76's
  // `foreign_artifact`) asks whether the key is "one of its own" — and a catalog response scoped
  // to this device's OWN branch answers yes. Neither refusal reaches the pairing; this one does.

  it("C7 01-F76/11-F21/R25: a `staff` artifact at ORG scope is refused — the roster is BRANCH-scoped", () => {
    for (const name of STAFF_FIXTURES) {
      const frame = anchored(name);
      refuses({ ...frame, scope: { org_id: ORG_ID, branch_id: null } });
    }
  });

  it("C8 01-F52/01-F76: a `catalog` artifact at BRANCH scope is refused — the catalog is ORG-scoped", () => {
    for (const name of CATALOG_FIXTURES) {
      const frame = anchored(name);
      // Its own org's branch and another branch alike: the defect is the SCOPE LEVEL, not which
      // branch was named, and a guard that only refused a foreign branch would leave the catalog
      // fragmentable by any device naming its own.
      refuses({ ...frame, scope: { org_id: ORG_ID, branch_id: BRANCH_ID } });
      refuses({ ...frame, scope: { org_id: ORG_ID, branch_id: OTHER_BRANCH } });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§D — `entries[]` is typed PER RESOURCE: no smuggling one resource down another's frames (01-F75)", () => {
  it("D1 01-F75: a STAFF row on a `catalog` response is refused", () => {
    // The measured trap this step exists to close: `CatalogEntryWire.kind` is open at the wire by
    // design (`SELLABLE_KINDS`' own doc comment in `packages/domain` says so), so the frame — not
    // the row — is what has to make a cross-resource payload UNREPRESENTABLE.
    refuses(withEntries(RES_CATALOG, [staffEntry()]));
    refuses(withEntries(RES_CATALOG, [catalogEntry(), staffEntry()]));
  });

  it("D2 01-F75: a CATALOG row on a `staff` response is refused", () => {
    refuses(withEntries(RES_STAFF, [catalogEntry()]));
    refuses(withEntries(RES_STAFF, [staffEntry(), catalogEntry()]));
    // …including the row whose `kind` says "staff". An open `kind` on a catalog row must not become
    // a way to publish a roster: one unparseable member refuses the ENTIRE update (01-F56
    // `malformed`), and for `staff` that is a branch nobody can sign in to.
    refuses(
      withEntries(RES_STAFF, [
        { kind: "staff", id: "019fa8c4-0000-7000-8000-000000000009", name: "Hina Raza" },
      ]),
    );
  });

  it("D3 01-F75/11-F20/01-F61/11-F22/01-F26: every declared field of the `staff` row is required", () => {
    // "The `staff` row, declared here because a golden fixture cannot be written without it:
    // `user_id`; `display_name`, **required on the wire** (11-F20 …); `grid_ordinal` (01-F61);
    // `status` (11-F22); `assignments` (01-F26); and `pin_hash` **only on an `active` member**."
    for (const field of ["user_id", "display_name", "grid_ordinal", "status", "assignments"]) {
      refuses(withEntries(RES_STAFF, [without(staffEntry(), field)]));
    }
  });

  it("D4 01-F75: a blank `display_name` is refused AT THE WIRE, which is where the writer validates", () => {
    // "…validated at the WRITER, never only at the device. The catalog's row schema is exported for
    // exactly this reason, after one blank name from a bulk import put a whole org into a reconnect
    // loop." A blank name on the roster is the same defect with a worse landing: 11-F20 makes the
    // name the ONE record both planes read.
    refuses(withEntries(RES_STAFF, [staffEntry({ display_name: "" })]));
    refuses(withEntries(RES_STAFF, [staffEntry({ user_id: "" })]));
    refuses(withEntries(RES_STAFF, [staffEntry({ grid_ordinal: "1" })]));
    refuses(withEntries(RES_STAFF, [staffEntry({ grid_ordinal: 1.5 })]));
  });

  it("D5 11-F22: `status` is closed at `active | inactive`", () => {
    // ⚠ THE SWEEP RUNS ON A ROW WITH NO `pin_hash`, AND THAT IS THE WHOLE ASSERTION — measured.
    // On the ACTIVE fixture row (which carries a hash) every unknown status word is refused by
    // D7's active-only credential rule instead, so opening `status` to a free string killed
    // NOTHING: this test passed against a build with no closed status set at all, for a reason
    // that has nothing to do with 11-F22. That is the guard-aimed-one-case-away shape, reproduced
    // inside the oracle written to catch it — the third time this chain has produced it.
    const bare = (status: string): Frame => without(staffEntry({ status }), "pin_hash");
    for (const status of ["departed", "suspended", "ACTIVE", "Active", "", "revoked"]) {
      refuses(withEntries(RES_STAFF, [bare(status)]));
    }
    // Both legal words parse — the control that stops D5 being satisfied by refusing everything.
    expect(() =>
      parseMessage(withEntries(RES_STAFF, [staffEntry({ status: "active" })])),
    ).not.toThrow();
    expect(() =>
      parseMessage(withEntries(RES_STAFF, [inactiveStaffEntry({ status: "inactive" })])),
    ).not.toThrow();
  });

  it("D6 11-F21/01-F75: a MISSING `pin_hash` on a non-`active` member is the SPECIFIED SHAPE, never malformed", () => {
    // 01-F75, verbatim: "A missing `pin_hash` on a non-`active` member is NOT `malformed`: it is
    // the specified shape, and a validator that refuses it is the stopped-till-through-a-validator
    // above." This assertion exists to stop the fix for D7 being written one case too wide.
    const parsed = parseMessage(withEntries(RES_STAFF, [inactiveStaffEntry()])) as {
      entries: Frame[];
    };
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.status).toBe("inactive");
    expect(parsed.entries[0]?.pin_hash).toBeUndefined();
  });

  it("D7 11-F21: a `pin_hash` ON a non-`active` member is refused — the hash rides an `active` entry only", () => {
    // "THE HASH IS CARRIED ONLY ON AN `active` ENTRY, AND THAT IS WHAT KEEPS THE BOUND A BOUND …
    // a hash on a non-`active` entry is a credential **no verifier can ever reach**: pure blast
    // radius with no function."
    const hash = staffEntry().pin_hash;
    refuses(withEntries(RES_STAFF, [inactiveStaffEntry({ pin_hash: hash })]));
  });

  it("D8 11-F23/R29: an `active` member with NO `pin_hash` is ACCEPTED — the owner sets the first PIN", () => {
    // The neighbouring case D7 must not close by accident. R29 has the owner set a person's first
    // PIN, so "active, no credential yet" is a real published state; refusing it here is 01-F17's
    // stopped till arriving through a validator, one keystroke from D7 in the English.
    const parsed = parseMessage(
      withEntries(RES_STAFF, [without(staffEntry(), "pin_hash")]),
    ) as Frame;
    expect((parsed.entries as Frame[])[0]?.status).toBe("active");
  });

  it("D9 01-F55/11-F22/01-F75: NO REMOVALS LIST, for any resource — a departure is a MARKED ENTRY", () => {
    // "A DEPARTURE IS A MARKED ENTRY AND NEVER AN ABSENCE — the frame carries no removals list, for
    // any resource … A removals list collapses two different questions — may she act and does she
    // render — into one bit, and answers the second by accident while answering the first."
    for (const name of [RES_STAFF, RES_CATALOG] as const) {
      cannotCarry(name, { removals: ["removed-sentinel-9f2c"] }, "removed-sentinel-9f2c");
      cannotCarry(name, { removed: ["removed-sentinel-9f2c"] }, "removed-sentinel-9f2c");
    }
  });

  it("D10 01-F26/11-F22: an assignment is `{ role, branch_id }` — org-wide is `null`, and it carries NO status", () => {
    // 01-F26's per-LOCATION assignment with a null location = org-wide, which is how every owner is
    // stored. The status stays on the ROW: 01-F76 already makes this artifact branch-scoped, so an
    // entry's single `status` IS this branch's participation, and a second carrier would be two
    // representations of one fact with nothing ruling which wins.
    expect(() =>
      parseMessage(
        withEntries(RES_STAFF, [staffEntry({ assignments: [{ role: "owner", branch_id: null }] })]),
      ),
    ).not.toThrow();
    refuses(withEntries(RES_STAFF, [staffEntry({ assignments: ["cashier"] })]));
    refuses(withEntries(RES_STAFF, [staffEntry({ assignments: [{ role: "cashier" }] })]));
    refuses(withEntries(RES_STAFF, [staffEntry({ assignments: "cashier" })]));
    cannotCarry(
      RES_STAFF,
      {
        entries: [
          staffEntry({
            assignments: [{ role: "cashier", branch_id: null, status: "sentinel-status-4b71" }],
          }),
        ],
      },
      "sentinel-status-4b71",
    );
  });

  it("D11 11-F21/14 §2: no PIN can ride a reference frame, at the row or at the frame", () => {
    // 11-F21: a PIN exists in exactly two places for exactly as long as each takes — "the keypad it
    // is typed on and the argument to a verify call". 14 §2: PINs are never present in payloads.
    for (const key of ["pin", "old_pin", "new_pin", "current_pin", "pin_digits", "plain_pin"]) {
      cannotCarry(RES_STAFF, { entries: [staffEntry({ [key]: "4821" })] }, "4821");
      cannotCarry(RES_STAFF, { [key]: "4821" }, "4821");
      cannotCarry(REQ_STAFF, { [key]: "4821" }, "4821");
      cannotCarry(NOTICE_STAFF, { [key]: "4821" }, "4821");
    }
  });

  it("D12 01-F75: the response body is `catalog_response`'s vocabulary, unchanged and now generic", () => {
    // "…`form: snapshot | delta` / `version` / `base_version?` / `entries[]` / `complete` /
    // `next_from` on the response, and a bare `version` on the notice."
    for (const name of [RES_STAFF, RES_CATALOG] as const) {
      const frame = anchored(name);
      for (const field of ["form", "version", "entries", "complete", "next_from"]) {
        refuses(without(frame, field));
      }
      refuses({ ...frame, form: "patch" });
      refuses({ ...frame, version: -1 });
      refuses({ ...frame, complete: "true" });
    }
    // The request's three, and `have_version` is the one that is not optional.
    for (const name of [REQ_STAFF, REQ_CATALOG] as const) {
      refuses(without(anchored(name), "have_version"));
      refuses({ ...anchored(name), have_version: -1 });
    }
    // The notice carries a bare version and nothing else about the payload.
    refuses(without(anchored(NOTICE_STAFF), "version"));
  });

  it("D13 01-F78: a staff row with NO assignments is refused — she would reach no branch at all", () => {
    // 01-F78 half one: a branch roster holds "every person holding an assignment that REACHES this
    // branch", and half two narrows her row to "only the assignments that reach this branch". A
    // row with zero assignments is therefore a person whom half one excludes — the FR's own
    // sentence: "a person whose ONLY assignments are at other branches is **absent from this
    // artifact entirely**". An empty array is that person published anyway, and what she costs is
    // a tile on 01-F61's grid that `can()` then refuses every act to.
    refuses(withEntries(RES_STAFF, [staffEntry({ assignments: [] })]));
    // The two shapes half one admits, BOTH of which must parse — this is the control, and it is
    // the half that stops the fix landing one case too wide. 01-F26's null location is org-wide
    // and is how every owner unlocks a till at a branch she does not staff.
    for (const assignments of [
      [{ role: "cashier", branch_id: BRANCH_ID }],
      [{ role: "owner", branch_id: null }],
    ]) {
      expect(() =>
        parseMessage(withEntries(RES_STAFF, [staffEntry({ assignments })])),
      ).not.toThrow();
    }
  });

  it("D14 01-F78/01-F71: a staff row naming ANOTHER branch's assignment is refused", () => {
    // 01-F78 half two, and the frame can express it because 01-F76 puts the artifact's own branch
    // ON the frame. The cost of the other answer is the FR's own: "a row carrying every branch's
    // assignment also tells every till the org's branch structure" — 01-F71's isolation boundary
    // crossed by reference data rather than by a query, and R25's purchase spent a second way.
    refuses(
      withEntries(RES_STAFF, [
        staffEntry({ assignments: [{ role: "cashier", branch_id: OTHER_BRANCH }] }),
      ]),
    );
    // …and BESIDE a legal one, which is the case a guard inspecting `assignments[0]` passes while
    // shipping the whole graph. The leak is the extra element, never the first.
    refuses(
      withEntries(RES_STAFF, [
        staffEntry({
          assignments: [
            { role: "cashier", branch_id: BRANCH_ID },
            { role: "cashier", branch_id: OTHER_BRANCH },
          ],
        }),
      ]),
    );
    // The control: the reach predicate is `branch_id === null || branch_id === this branch`
    // (01-F78 names it as `rolesAt`'s, verbatim), so an org-wide assignment is NOT another
    // branch's and must parse. Refusing it would empty every owner's row and D13 would then
    // refuse her outright — the two FRs' halves, broken together by one over-wide guard.
    expect(() =>
      parseMessage(
        withEntries(RES_STAFF, [
          staffEntry({
            assignments: [
              { role: "owner", branch_id: null },
              { role: "cashier", branch_id: BRANCH_ID },
            ],
          }),
        ]),
      ),
    ).not.toThrow();
  });

  it("D15 01-F75/11-F22/11-F21: two rows for ONE `user_id` in one response are refused", () => {
    // An artifact is a set of people, and 11-F22 gives a person exactly one status per branch
    // while 11-F21 rides her hash on the `active` one. Two rows for one `user_id` make both
    // ambiguous at once and let ARRAY POSITION decide which — so a departed cashier published
    // beside her own `active` row is a live credential or a dead one depending on which end the
    // device's apply loop wins from. Whichever it picks, no error is raised anywhere.
    const first = staffEntry();
    // The ordinal differs, so this refusal is attributable to the `user_id` and not to D16.
    refuses(withEntries(RES_STAFF, [first, { ...first, grid_ordinal: 7 }]));
    refuses(withEntries(RES_STAFF, [first, { ...first, grid_ordinal: 7, status: "inactive" }]));
    // The control: two DIFFERENT people is the fixture's own shape and must parse.
    expect(() =>
      parseMessage(withEntries(RES_STAFF, [staffEntry(), inactiveStaffEntry()])),
    ).not.toThrow();
  });

  it("D16 01-F75/01-F61: two rows sharing one `grid_ordinal` are refused — unique WITHIN the artifact", () => {
    // 01-F75, verbatim: "`grid_ordinal` is unique **within the artifact** — 01-F61 bans a derived
    // tiebreak and a collision is precisely how one is reintroduced, which is the defect its first
    // build shipped." A grid that resolves a tie by array order puts two people's tiles in an
    // order the publisher never chose, and 02-F41 attributes an order to whoever was tapped.
    const ordinal = staffEntry().grid_ordinal;
    // The `user_id`s differ, so this refusal is attributable to the ordinal and not to D15.
    refuses(withEntries(RES_STAFF, [staffEntry(), inactiveStaffEntry({ grid_ordinal: ordinal })]));
    // The control: the same two people at two ordinals — the fixture's own shape — parse.
    expect(() =>
      parseMessage(withEntries(RES_STAFF, [staffEntry(), inactiveStaffEntry()])),
    ).not.toThrow();
  });

  it("D17 01-F56/01-F75: `base_version` rides a DELTA and only a delta — both directions, both resources", () => {
    // 01-F75: "the server sends a delta only if it can construct one from that exact base"; 01-F56:
    // "a delta whose base does not match is REFUSED — the device asks for a snapshot instead". A
    // delta with no `base_version` leaves the device nothing to match, so it can neither apply the
    // frame nor refuse it for the right reason, and 01-F56's whole detection mechanism is a field
    // that was not sent. A `base_version` on a SNAPSHOT is the mirror: a snapshot "applies
    // ATOMICALLY" and replaces, so a base on it is a value no reader can act on and one an
    // implementer will eventually act on anyway — 11-F21's dead `pin_hash` (§D7) one field over.
    for (const name of [RES_STAFF, RES_CATALOG] as const) {
      const frame = anchored(name);
      const delta = { ...frame, form: "delta", base_version: 7 };
      const snapshot = without({ ...frame, form: "snapshot" }, "base_version");
      // Both legal shapes parse FIRST — the control, and it is what stops D17 being satisfied by
      // refusing `base_version` outright or by requiring it on every response.
      expect(() => parseMessage(delta), `${name} delta+base`).not.toThrow();
      expect(() => parseMessage(snapshot), `${name} snapshot`).not.toThrow();
      refuses(without(delta, "base_version"));
      refuses({ ...snapshot, base_version: 7 });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§E — the row schema is EXPORTED so the WRITER can validate against it (01-F75)", () => {
  it("E1 01-F75: some exported schema accepts a `staff` row and refuses a blank display_name", () => {
    // "`entries[]` is typed PER RESOURCE and validated at the WRITER, never only at the device. The
    // catalog's row schema is exported for exactly this reason." The assertion is name-agnostic on
    // purpose — the FR fixes the property, not the symbol — but it is not vacuous: it demands a
    // schema that says YES to the specified shape and NO to the blank name that put a whole org
    // into a reconnect loop.
    const row = staffEntry();
    const candidates = (Object.values(protocol) as unknown[]).filter(
      (value): value is { safeParse: (v: unknown) => { success: boolean } } =>
        typeof value === "object" &&
        value !== null &&
        typeof (value as { safeParse?: unknown }).safeParse === "function",
    );
    const accepting = candidates.filter((schema) => schema.safeParse(row).success);
    expect(accepting.length).toBeGreaterThan(0);
    expect(
      accepting.some((schema) => !schema.safeParse({ ...row, display_name: "" }).success),
    ).toBe(true);
    // The catalog's own row schema is still exported, for the reason it always was.
    expect(protocol.CatalogEntryWire.safeParse(catalogEntry()).success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("§F — `hello_ack` carries a version PER ARTIFACT KEY (01-F76, 01-F77)", () => {
  const KEYED_VERSIONS = [
    {
      resource: "catalog",
      scope: { org_id: "01980000-0000-7000-8000-0000000000a1", branch_id: null },
      version: 9,
    },
    {
      resource: "staff",
      scope: {
        org_id: "01980000-0000-7000-8000-0000000000a1",
        branch_id: "01980000-0000-7000-8000-00000000b001",
      },
      version: 3,
    },
  ];
  const ack = (over: Frame = {}): Frame => ({
    ...fixture("hello_ack"),
    v: PROTOCOL_VERSION,
    ...over,
  });

  it("F1 01-F77: `reference_versions` is an ARRAY of { resource, scope, version }", () => {
    // "The field is `reference_versions`: an ARRAY of `{ resource, scope, version }` — an array and
    // not a map, because a map key over two fields is the concatenation 01-F76 bans, and this is
    // the one place the ban would be easiest to break by convenience."
    const parsed = parseMessage(ack({ reference_versions: KEYED_VERSIONS })) as Frame;
    expect(parsed.reference_versions).toEqual(KEYED_VERSIONS);
  });

  it("F2 01-F76/01-F77: a MAP keyed by resource, or by a concatenation, is refused", () => {
    // Anchor: the ARRAY form must parse, or every refusal below is about a rejected `hello_ack`.
    expect(() => parseMessage(ack({ reference_versions: KEYED_VERSIONS }))).not.toThrow();
    refuses(ack({ reference_versions: { catalog: 9, staff: 3 } }));
    refuses(ack({ reference_versions: { "org-a1|catalog": 9 } }));
    refuses(ack({ reference_versions: 9 }));
    refuses(
      ack({
        reference_versions: [
          { resource: "catalog", scope: "01980000-0000-7000-8000-0000000000a1", version: 9 },
        ],
      }),
    );
    refuses(ack({ reference_versions: [{ resource: "device_roster", scope: {}, version: 1 }] }));
    refuses(ack({ reference_versions: [{ scope: KEYED_VERSIONS[0]?.scope, version: 9 }] }));
    refuses(ack({ reference_versions: [{ resource: "catalog", version: 9 }] }));
  });

  it("F3 01-F77: `catalog_version` is SUPERSEDED — a v: 2 session reads the artifact set and nothing else", () => {
    // "…the two are never both authoritative on one session: a `v: 1` session reads
    // `catalog_version` and nothing else, a `v: 2` session reads the artifact set and nothing else.
    // The superseded field is retained only for as long as the N−1 reader is" — and that reader is
    // deferred, so on this build it is not retained.
    // Anchored on the ack the session actually gets: without this, F3 passes against a build that
    // refuses `hello_ack` outright.
    expect(() => parseMessage(ack({ reference_versions: KEYED_VERSIONS }))).not.toThrow();
    const withSuperseded = ack({ catalog_version: 987654 });
    let parsed: unknown;
    try {
      parsed = parseMessage(withSuperseded);
    } catch {
      return;
    }
    expect(JSON.stringify(parsed)).not.toContain("987654");
  });

  it("F4 01-F77: `reference_versions` may be ABSENT — an artifact with nothing published is OMITTED", () => {
    // "`catalog_version`'s omitted-never-zero rule survives PER KEY: an artifact for which the org
    // has published nothing is omitted, never sent as `0` … in both the device simply never asks."
    // Absence is therefore a legal, meaningful `hello_ack` and must not be refused.
    expect(() => parseMessage(ack())).not.toThrow();
    expect(() => parseMessage(ack({ reference_versions: [] }))).not.toThrow();
  });

  it("F5 01-F76/01-F77: ONE artifact key appears at most once — a key at two versions is refused", () => {
    // 01-F76: "A device holds one version *per key*, not one version." 01-F77 makes the field an
    // array "and not a map, because a map key over two fields is the concatenation 01-F76 bans" —
    // so the array IS a map, and a map cannot hold one key twice. The cost is 01-F56's named
    // failure reached without any bad data: the device compares against whichever entry its reader
    // happens to reach, and picking the lower one re-fetches forever while picking the higher one
    // never fetches again. No error is raised on either path.
    const [catalogKey, staffKey] = KEYED_VERSIONS;
    if (catalogKey === undefined || staffKey === undefined) throw new Error("unreachable");
    expect(() => parseMessage(ack({ reference_versions: KEYED_VERSIONS }))).not.toThrow();
    refuses(ack({ reference_versions: [catalogKey, { ...catalogKey, version: 11 }] }));
    refuses(ack({ reference_versions: [staffKey, { ...staffKey, version: 11 }] }));
    // The identical entry twice — the shape a naive merge of two sources produces, and the one
    // that looks harmless because both copies agree.
    refuses(ack({ reference_versions: [staffKey, staffKey] }));
    // ⚠ THE CONTROL, AND IT IS THE ONE THAT MATTERS: two entries for one RESOURCE at two BRANCHES
    // are two DIFFERENT keys and must parse. A uniqueness rule written over `resource` alone
    // passes every refusal above and forbids exactly the case 01-F76 exists for — "one version
    // number meaning different bytes on different devices", which is the whole FR.
    expect(() =>
      parseMessage(
        ack({
          reference_versions: [
            staffKey,
            { ...staffKey, scope: { org_id: ORG_ID, branch_id: OTHER_BRANCH }, version: 5 },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it("F6 01-F77: a key is never carried at `version: 0` — nothing published is OMITTED, not zero", () => {
    // "an artifact for which the org has published nothing is **omitted, never sent as `0`**, so
    // that case is indistinguishable from a gateway that does not serve that resource — in both
    // the device simply never asks." F4 pins that ABSENCE is legal; that is a different claim from
    // this one, and only one of them was asserted. A `0` sent over a key makes the two cases
    // distinguishable again, which is the property the clause exists to hold, and 01-F75 puts that
    // validation "at the WRITER, never only at the device".
    const [, staffKey] = KEYED_VERSIONS;
    if (staffKey === undefined) throw new Error("unreachable");
    refuses(ack({ reference_versions: [{ ...staffKey, version: 0 }] }));
    // …and beside a populated key, which is where a `0` hides: the ack looks well-formed and the
    // one artifact nobody can sign in against is the one that says nothing.
    refuses(ack({ reference_versions: [...KEYED_VERSIONS, { ...staffKey, version: 0 }] }));
    // The controls. `1` is the first version a publish can mint and must parse; absence is F4's.
    expect(() =>
      parseMessage(ack({ reference_versions: [{ ...staffKey, version: 1 }] })),
    ).not.toThrow();
    expect(() => parseMessage(ack())).not.toThrow();
  });

  it("F7 01-F52/01-F76: the ack's key is the SAME key — the cross-scope pairing is refused here too", () => {
    // §C7/§C8 on the frame that actually carries the version set. An implementation can narrow the
    // three `reference_*` kinds and forget this one — and this is the field a device reconciles
    // against on EVERY reconnection (01-F77 calls `hello_ack` "the correctness mechanism of the
    // whole reference-data transport"), so a key admitted here is a key the device then asks for.
    refuses(
      ack({
        reference_versions: [
          { resource: "staff", scope: { org_id: ORG_ID, branch_id: null }, version: 3 },
        ],
      }),
    );
    refuses(
      ack({
        reference_versions: [
          { resource: "catalog", scope: { org_id: ORG_ID, branch_id: BRANCH_ID }, version: 9 },
        ],
      }),
    );
    // The control: the two correct pairings — which are what KEYED_VERSIONS already are — parse.
    expect(() => parseMessage(ack({ reference_versions: KEYED_VERSIONS }))).not.toThrow();
  });
});
