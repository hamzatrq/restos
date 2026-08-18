// Acceptance tests — the golden fixtures ARE the wire contract at `v: 2` (20 §2.7, 01-F77).
// FRs: 01-F77, 01-F75, 01-F76, 01-F79 (+ 11-F21, 11-F22).
//
// AUTHORED FROM SPEC TEXT ONLY, by a session that wrote no implementation.
//
// 01-F77: "`20 §2.7` is the review gate, and the fixtures are the deliverable … The deliverable is
// three NEW `reference_*` fixtures, the `v: 2` fixtures the bump requires for every other kind that
// carries `v`, and a transcript per direction of `20 §2.7`'s nightly matrix."
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT, so a correct implementation is not blocked ─────
//
//   · **The `20 §2.7` N−1 TRANSCRIPT PAIR.** It exists to test client N−1 against server N and the
//     reverse, and the N−1 reader is DEFERRED by founder ruling — R4 puts nothing in the field. A
//     transcript of a version nothing speaks is the compatibility target that does not exist. Owed
//     with the reader, before the first pilot device is paired.
//   · **The three `v: 1` catalog fixtures being RETAINED.** 01-F77 freezes them "for as long as the
//     N−1 reader lives", and it does not live yet; the same ruling lands them with it. §J6 asserts
//     they are gone from the ACTIVE set, which is a claim about what this build's codec parses.
//
// ⚠ ONE STATED READING, flagged because it costs the implementer a file: §J1 requires a golden
// fixture for EVERY kind, which makes `purge_command.json` newly owed (it has never had one). The
// reading is 01-F77's "the `v: 2` fixtures the bump requires for every other kind that carries `v`"
// — every kind carries `v` — plus `20 §2.7`'s own rule that the message SET is what fixtures pin.
// If that reading is wrong it is a finding against this file, not a licence to skip the fixture.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeMessage, encodeMessage, MESSAGE_KINDS, PROTOCOL_VERSION } from "../index.js";

type Frame = Record<string, unknown>;

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** Every committed golden file, discovered rather than listed — a list can go stale silently. */
const fixtureFiles = (): string[] =>
  readdirSync(FIXTURE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

const raw = (file: string): string => readFileSync(`${FIXTURE_DIR}${file}`, "utf8");
const asJson = (file: string): Frame => JSON.parse(raw(file)) as Frame;

/** 14 kinds − the 3 superseded catalog kinds + 01-F75's triple + 01-F79's pair. */
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

describe("§J — the golden fixtures at v: 2 (20 §2.7, 01-F77)", () => {
  it("J0 24-F14: the fixture directory is not empty and the harness reads real files", () => {
    // The anti-vacuity guard. Every assertion below loops over `fixtureFiles()`, so an empty
    // directory — or a `readdirSync` pointed one level wrong — would pass all of them.
    expect(fixtureFiles().length).toBeGreaterThanOrEqual(KINDS_AT_V2.length);
  });

  it("J1 20 §2.7/01-F77: every kind in the message set has at least one golden fixture", () => {
    const covered = new Set(fixtureFiles().map((file) => String(asJson(file).kind)));
    for (const kind of KINDS_AT_V2) expect([...covered], kind).toContain(kind);
    // …and the set is the one the FRs declare, so this cannot go vacuous by a kind disappearing.
    expect([...MESSAGE_KINDS].sort()).toEqual([...KINDS_AT_V2].sort());
  });

  it("J2 20 §2.7: every committed fixture DECODES through the production codec", () => {
    // "A golden file nothing parses is a golden file that has stopped being a contract." This is
    // also what makes a superseded fixture impossible to leave lying around: §J6's claim is
    // enforced here first, by the codec rather than by a filename.
    for (const file of fixtureFiles()) {
      const decoded = decodeMessage(raw(file)) as Frame;
      expect(MESSAGE_KINDS, file).toContain(decoded.kind);
      // The filename names the kind it pins. A second fixture for one kind (a second RESOURCE, a
      // second FORM) extends the name rather than replacing it, so a reader can still find it.
      expect(file, file).toMatch(new RegExp(`^${String(decoded.kind)}(_[a-z0-9_]+)?\\.json$`));
    }
  });

  it("J3 01-F77: every committed fixture carries v: 2", () => {
    expect(PROTOCOL_VERSION).toBe(2);
    for (const file of fixtureFiles()) expect(asJson(file).v, file).toBe(2);
  });

  it("J4 20 §2.7: a fixture cannot be SILENTLY RESHAPED — every key in the file is a declared key", () => {
    // Unknown keys are stripped (01-F40), which is right on the wire and wrong in a contract file:
    // a fixture carrying a field the schema does not declare would round-trip green while pinning
    // nothing at all — a golden file that has quietly stopped being the contract it is cited as.
    // Deep-equality against the RAW json is what makes the two agree key for key.
    for (const file of fixtureFiles()) {
      expect(decodeMessage(raw(file)), file).toEqual(asJson(file));
    }
  });

  it("J5 20 §2.7: re-encoding a decoded fixture and re-decoding THAT is deep-equal (semantic stability)", () => {
    for (const file of fixtureFiles()) {
      const decoded = decodeMessage(raw(file));
      expect(decodeMessage(encodeMessage(decoded)), file).toEqual(decoded);
    }
  });

  it("J6 01-F75/01-F77: the three superseded catalog fixtures are gone from the active set", () => {
    for (const gone of ["catalog_request.json", "catalog_response.json", "catalog_notice.json"]) {
      expect(fixtureFiles(), gone).not.toContain(gone);
    }
  });

  it("J7 01-F75/01-F76: the reference fixtures vary the RESOURCE and the SCOPE, on all three kinds", () => {
    // The guard-aimed-one-case-away trap, stated as a fixture property: "a fixture that only ever
    // exercises the resource the frame is named for, or a scope that is never varied". A frame
    // family pinned by one resource is a family whose discriminator is never exercised.
    const reference = fixtureFiles()
      .map(asJson)
      .filter((frame) => String(frame.kind).startsWith("reference_"));
    for (const kind of ["reference_request", "reference_response", "reference_notice"]) {
      const forKind = reference.filter((frame) => frame.kind === kind);
      expect(new Set(forKind.map((frame) => frame.resource)), kind).toEqual(
        new Set(["catalog", "staff"]),
      );
    }
    const scopes = reference.map((frame) => (frame.scope as Frame).branch_id);
    // ORG scope is `branch_id: null` (01-F76); BRANCH scope names one. Both must be pinned, because
    // an implementation that only ever saw one of them has never had its key shape exercised.
    expect(scopes).toContain(null);
    expect(scopes.some((branch) => typeof branch === "string" && branch !== "")).toBe(true);
  });

  it("J8 11-F21/11-F22/01-F75: the staff fixture pins BOTH credential shapes", () => {
    // 01-F75 declares `pin_hash` "only on an `active` member" AND that a missing hash on a
    // non-`active` member "is the specified shape and never `malformed`". Those are two different
    // rows, and a fixture holding only one of them pins half a rule — which is how the same clause
    // gets implemented one case too wide (a validator that refuses the departed row is a branch
    // nobody can sign in to).
    const staffResponses = fixtureFiles()
      .map(asJson)
      .filter((frame) => frame.kind === "reference_response" && frame.resource === "staff");
    expect(staffResponses.length).toBeGreaterThan(0);
    const entries = staffResponses.flatMap((frame) => frame.entries as Frame[]);
    const active = entries.filter((entry) => entry.status === "active");
    const notActive = entries.filter((entry) => entry.status !== "active");
    expect(active.some((entry) => typeof entry.pin_hash === "string")).toBe(true);
    expect(notActive.length).toBeGreaterThan(0);
    for (const entry of notActive) expect(entry.pin_hash, String(entry.user_id)).toBeUndefined();
  });

  it("J9 11-F21/14 §2: no committed fixture carries a PIN under any name", () => {
    // 14 §2: PINs are never present in payloads. A fixture is a payload that gets pasted into bug
    // reports, transcripts and review threads, so the ban is asserted over the raw TEXT — a key
    // named for a PIN is refused whether or not any schema declares it.
    for (const file of fixtureFiles()) {
      expect(raw(file), file).not.toMatch(
        /"(pin|old_pin|new_pin|current_pin|pin_digits|plain_pin|pin_plaintext)"\s*:/,
      );
    }
  });

  it("J10 01-F56/01-F75: the reference fixtures pin BOTH forms, and `base_version` rides the delta", () => {
    // §J7 pins that the RESOURCE and the SCOPE are both varied; the FORM was not, and a fixture
    // set regenerated as two snapshots would leave `base_version` — 01-F56's entire base-matching
    // mechanism — absent from every golden file in the repo and pinned by nothing. This is the
    // guard-aimed-one-case-away shape stated as a fixture property, which is where §J7's own note
    // says a frame family loses its discriminator.
    const responses = fixtureFiles()
      .map(asJson)
      .filter((frame) => frame.kind === "reference_response");
    expect(responses.length).toBeGreaterThan(0);
    expect(new Set(responses.map((frame) => frame.form))).toEqual(new Set(["snapshot", "delta"]));
    for (const frame of responses) {
      const label = `${String(frame.resource)}/${String(frame.form)}`;
      if (frame.form === "delta") expect(typeof frame.base_version, label).toBe("number");
      else expect(frame.base_version, label).toBeUndefined();
    }
  });

  it("J11 01-F52/01-F76: every reference fixture pairs `catalog` with ORG scope and `staff` with BRANCH", () => {
    // §J7 asserts that both scope LEVELS appear across the set; nothing asserted which level goes
    // with which resource, so a set in which every `staff` frame was org-scoped satisfied it. The
    // pairing is 01-F76's, stated per resource ("The catalog stays ORG-scoped… The staff roster is
    // BRANCH-scoped, and the reason is the credential") and 01-F52's from the other side.
    const reference = fixtureFiles()
      .map(asJson)
      .filter((frame) => String(frame.kind).startsWith("reference_"));
    expect(reference.length).toBeGreaterThan(0);
    const seen = { catalog: 0, staff: 0 };
    for (const frame of reference) {
      const branch = (frame.scope as Frame).branch_id;
      const label = `${String(frame.kind)}/${String(frame.resource)}`;
      if (frame.resource === "catalog") {
        seen.catalog += 1;
        expect(branch, label).toBeNull();
      } else {
        seen.staff += 1;
        expect(typeof branch, label).toBe("string");
      }
    }
    // Anti-vacuity: a set holding only one resource satisfies every branch of the loop above.
    expect(seen.catalog).toBeGreaterThan(0);
    expect(seen.staff).toBeGreaterThan(0);
  });
});
