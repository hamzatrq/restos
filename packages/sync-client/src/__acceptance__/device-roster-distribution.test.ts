// ACCEPTANCE TESTS — **`01-F81`: `device_roster` REACHES A TILL, AND THE MESH BECOMES REACHABLE.**
//
// **AUTHORED FROM SPEC TEXT ONLY** (`20 §4.3`, `24 §3` step 2). The session that wrote this file
// wrote none of the production code it exercises and is disqualified from implementing against
// it. Every assertion is derived from a quoted FR clause.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client` and the WIRE.** R35 puts
// the wire and credentials on FULL adversarial rounds — this file touches both.
//
// ── WHY THIS FILE IS THE ONE THAT MATTERS ─────────────────────────────────────────────────────
//
// `branch-lan-coherence.test.ts` proves that two tills holding a credential and a roster cohere
// over mutual TLS. **No shipping code puts either there.** Measured on this tree, comment-blind:
//
//   `setLanCredential`  — declared at `device-store.ts:271`, implemented at `:1391`,
//                         **zero shipping callers**.
//   `lanRoster.apply`   — **zero shipping callers**. `apps/*/src/main/mesh.ts` reads
//                         `lanRoster.list()` and `lanRoster.ageMs()`; nothing writes.
//
// So `createLanMesh` on a default launch returns `unmeshed(...)` at the first gate it reaches,
// and the second and third gates — *"not paired — no LAN credential (01-F73)"* and *"no branch
// roster received yet … (01-F74)"* — are unreachable states in the sense that matters: writing a
// credential only moves the refusal from the second gate to the third. Every mesh suite in this
// repo, this author's included, papers over that with a fixture. That is `AGENTS.md`'s recurring
// defect — *a correct subsystem with no seam to the product* — and `seams:check` is blind to it
// by construction, because nothing is an unreached EXPORT and nothing is an unsupplied OPTIONAL
// member: the credential and the roster are required inputs that no producer produces.
//
// `01-F74` (b) named this block itself and blocked on an amendment; `01-F81` is that amendment,
// landed August 2026. This file is its device-side oracle.
//
// ── THE AUTHORITIES, QUOTED ───────────────────────────────────────────────────────────────────
//
//   01-F81     "THE SIGNED REFERENCE ARTIFACT, AND `device_roster` AS `01-F75`'s THIRD RESOURCE
//              … `01-F72`'s mutual TLS, `01-F73`'s certificate and `01-F74`'s cached roster are
//              each specified and the roster has no way to reach a device, so the LAN mesh cannot
//              be built at all."
//   01-F81 (a) "`device_roster` joins `01-F75`'s closed set as its third member, **branch**-scoped
//              (`01-F76`: one scope shape, `branch_id` non-null), and its row is exactly
//              `01-F74` (a)'s four facts — `device_id`, `device_class` (open text …), the
//              certificate fingerprint as lowercase hex SHA-256 of the DER, and revocation state.
//              … `01-F75`'s no-removals-list rule binds here and it is load-bearing … an id that
//              simply vanished from the artifact is a change a delta has no way to state."
//   01-F81 (b) "THE SIGNATURE ENVELOPE. The signature covers the canonical-JSON serialization
//              `01-F5` already defines … of the artifact key (`resource`, `org_id`, `branch_id`),
//              `form`, `version`, `base_version` when the form is a delta, `signed_at`, and
//              `entries[]` … ECDSA P-256 with SHA-256 … Verification happens at APPLY, over the
//              assembled artifact, never per frame … `signed_at` exists for `00 §5.7`'s age
//              display and nothing else … the signed bytes are the ASCII string
//              `restos.reference_artifact.v1\n` followed by that canonical JSON."
//   01-F81 (c) "THE SIGNING KEY IS NOT THE ISSUING KEY, AND THAT IS FORCED BY `01-F74` (c) RATHER
//              THAN CHOSEN … an org carries a roster-signing keypair distinct from its issuer,
//              and its public half is **pinned on the device at pairing**."
//   01-F81 (d) "`staff` IS STILL UNSIGNED, THIS FR DOES NOT SIGN IT, AND THE ENVELOPE IS PER-ARM
//              SO NOBODY CAN FORGET TO. The envelope is a **required** member of the
//              `device_roster` arm and absent from the others, not an optional field on the
//              shared response body: an optional protection is one an implementation can simply
//              not supply … while a required per-arm member makes an unsigned device roster
//              **unrepresentable**."
//   01-F81 (e) "a device MUST NOT request an artifact key the session's `hello_ack` did not
//              advertise, for any resource."
//   01-F75     the triple is `reference_request` / `reference_response` / `reference_notice`;
//              "the resource set is CLOSED, and adding a member is a spec act"; "A DEPARTURE IS A
//              MARKED ENTRY AND NEVER AN ABSENCE — the frame carries no removals list, for any
//              resource."
//   01-F77     `hello_ack.reference_versions` omits a key for an artifact a gateway does not
//              serve; the version is `min(1)`, never `0`.
//   01-F74 (d) "A roster that is absent, corrupt, or whose signature does not verify is
//              **unreadable**: refuse … A roster that verifies and is merely **old**: **admit**."
//   01-F80 (f) "One response carries everything a device needs to become a till: its identity …
//              `01-F73`'s certificate with its org issuer PEM, `01-F81`'s pinned roster-signing
//              key, and `01-F47`'s device token."
//
// ── ⚠ THE ONE THING THIS FILE PINS, AND IT IS PINNED BECAUSE A FRAME CANNOT BE BUILT WITHOUT IT
//
// `01-F81` (b) says WHAT the envelope covers and WITH WHAT ALGORITHM. It does not say what the
// field is CALLED on the wire, how the signature is ENCODED, or whether the artifact key is
// serialized flat or nested under `scope`. A suite cannot construct a frame without answering
// all four, so this file answers them **in one place** (`DEVICE_ROSTER_ENVELOPE` below) and
// states them as PINNED INTERPRETATIONS, contestable in review rather than in an implementation —
// `01-F76`'s own precedent for pinning a wire shape where it can be argued with.
//
//   (i)   the field is `signature`, a required member of the `device_roster` arm only;
//   (ii)  it carries `{ alg: "ES256", signed_at: <epoch ms>, value: <base64> }`;
//   (iii) `value` is the raw IEEE-P1363 (`r‖s`, 64 bytes) signature, base64 — the encoding
//         WebCrypto produces, and `packages/lan-pki` already drives WebCrypto;
//   (iv)  the artifact key is serialized FLAT (`resource`, `org_id`, `branch_id` as siblings of
//         `form`/`version`/`signed_at`/`entries`), because `01-F81` (b) enumerates the three by
//         name at that level and `01-F76` bans concatenating a two-field key. **The nested
//         (`scope: {...}`) reading is equally defensible and costs one line here** — if a reviewer
//         prefers it, change this file, not the verifier.
//
// ⚠ **AND THIS FILE DELIBERATELY DOES NOT ASSERT THE CRYPTOGRAPHY.** It asserts the WIRE
// (`01-F81` (a)/(d)), the NEGOTIATION (`01-F81` (e)) and the SEAM. The verification matrix that
// `01-F81` (b)/(c) earn — a tampered entry, a relabelled version, a mismatched base, a foreign
// branch key, a missing domain-separation prefix, and above all an artifact signed by the ORG
// ISSUER rather than the roster-signing key (the "obvious design" (c) refuses BY NAME) — is
// **OWED to a `01-F81` verifier oracle** and is not written here. Two reasons, both stated so the
// omission is not read as coverage: this suite's brief is the LAN mesh, and a crypto matrix that
// pinned four encodings would give an implementer four ways to be blocked by a correct build.
// **That oracle must make the four pins above and the signer's `01-F5` canonical-JSON reading;
// if it disagrees with this file, this file is the one that moves.**

import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type {
  CloudTransport,
  CloudTransportHandlers,
  ProtocolMessage,
} from "@restos/sync-protocol";
import { PROTOCOL_VERSION, parseMessage } from "@restos/sync-protocol";
import { describe, expect, it } from "vitest";
import { createCloudSession, openStore, wallClock } from "../index.js";
import { BRANCH, meshIdentity, ORG } from "./mesh-builders.js";

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Fixtures
// ───────────────────────────────────────────────────────────────────────────────────────────────

const DEVICE_ID = "till-counter-under-test";
const SCOPE = { org_id: ORG, branch_id: BRANCH } as const;

/** A plausible fingerprint: lowercase hex SHA-256, the shape `01-F81` (a) names. */
const fingerprint = (seed: string): string => createHash("sha256").update(seed).digest("hex");

/**
 * ⚠ THE PINNED ENVELOPE — the only invented shape in this file. See the header.
 *
 * The `value` here is a well-FORMED signature and not a valid one: `parseMessage` judges shape,
 * and nothing in §1 or §2 verifies. A suite that put a real signature here would be asserting the
 * cryptography by accident and would go red for a reason its own test name did not name.
 */
const DEVICE_ROSTER_ENVELOPE = {
  alg: "ES256" as const,
  signed_at: 1_756_000_000_000,
  value: Buffer.alloc(64, 7).toString("base64"),
};

const rosterEntry = (device_id: string, over: Record<string, unknown> = {}) => ({
  device_id,
  // `01-F81` (a): OPEN TEXT, on `01-F56`'s forward-skew reasoning — "an older build must not
  // refuse a whole roster because the cloud learned a class it has not".
  device_class: "counter_electron",
  cert_sha256: fingerprint(device_id),
  revoked: false,
  ...over,
});

const rosterSnapshot = (over: Record<string, unknown> = {}) => ({
  v: PROTOCOL_VERSION,
  kind: "reference_response",
  resource: "device_roster",
  scope: SCOPE,
  form: "snapshot",
  version: 3,
  complete: true,
  next_from: 0,
  entries: [rosterEntry(DEVICE_ID), rosterEntry("aaa-pass-kitchen")],
  signature: DEVICE_ROSTER_ENVELOPE,
  ...over,
});

// ===============================================================================================
// §1 — `01-F81` (a): `device_roster` is on the wire, branch-scoped, with `01-F74` (a)'s four facts
// ===============================================================================================

describe("§1 01-F81 (a)/01-F75 — the third resource exists on all three frames of the triple", () => {
  it("01-F81 (a): a `reference_response` for `device_roster` PARSES, carrying the four facts and a branch scope", () => {
    const parsed = parseMessage(rosterSnapshot()) as Extract<
      ProtocolMessage,
      { kind: "reference_response" }
    > & {
      resource: string;
      entries: { device_id: string; cert_sha256: string; revoked: boolean }[];
    };

    expect(
      parsed.resource,
      "01-F81 (a): `device_roster` joins 01-F75's closed set as its THIRD member — until it does, 01-F74's roster has no distribution path and the LAN mesh cannot be built at all",
    ).toBe("device_roster");
    expect(parsed.scope, "01-F81 (a)/01-F76: branch-scoped, `branch_id` non-null").toEqual(SCOPE);
    expect(
      parsed.entries.map((e) => e.device_id).sort(),
      "01-F74 (a): the roster names the branch's devices",
    ).toEqual(["aaa-pass-kitchen", DEVICE_ID]);
    // The fingerprint must survive the parse INTACT. `lan-roster.ts` refuses anything that is not
    // 64 lowercase hex — deliberately, so a mixed-case or truncated fingerprint is a LOUD
    // `malformed` on arrival rather than a silent never-admits at every handshake afterwards. A
    // wire schema that let one through would move that failure to the place the FR avoided.
    expect(parsed.entries[0]?.cert_sha256, "01-F81 (a): lowercase hex SHA-256 of the DER").toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(parsed.entries[0]?.revoked, "01-F74 (a): revocation state is a FIELD of the row").toBe(
      false,
    );
  });

  it("01-F81 (a)/01-F56: `device_class` is OPEN TEXT on this wire — a class this build has never heard of must not refuse the whole roster", () => {
    // ⚠ The FR states the reason and it is not a nicety: "an older build must not refuse a whole
    // roster because the cloud learned a class it has not" (`01-F56`'s forward-skew problem,
    // `DEC-SYNC-011`). A `z.enum(DEVICE_CLASSES)` here — the obvious and wrong choice, and the
    // one `lan-roster.ts` already refuses on the device side for the same stated reason — makes
    // the day a new class ships the day every older till loses its branch LAN. `01-F17`: a
    // stopped branch. Admitting it is safe because `01-F39`'s hub-eligible set is a closed
    // membership test, so an unrecognised class simply never wins an election.
    expect(() =>
      parseMessage(
        rosterSnapshot({
          entries: [rosterEntry(DEVICE_ID, { device_class: "counter_kiosk_2029" })],
        }),
      ),
    ).not.toThrow();
  });

  it("01-F81 (a)/01-F75: A DEPARTURE IS A MARKED ENTRY — a revoked device is IN the artifact, and no frame carries a removals list", () => {
    const withRevoked = rosterSnapshot({
      entries: [rosterEntry(DEVICE_ID), rosterEntry("aaa-pass-kitchen", { revoked: true })],
    });
    const parsed = parseMessage(withRevoked) as unknown as {
      entries: { device_id: string; revoked: boolean }[];
    };
    expect(
      parsed.entries.find((e) => e.device_id === "aaa-pass-kitchen")?.revoked,
      "01-F81 (a): the mark IS the revocation field — collapsing *revoked* with *no longer this branch's* is sound HERE because the artifact answers one question, and both answers are no",
    ).toBe(true);

    // `01-F75`: "the frame carries no removals list, for any resource". A delta carries one entry
    // per changed id, so an id that simply VANISHED is a change a delta has no way to state — and
    // an absence would silently leave every non-snapshotting device admitting a departed peer.
    const smuggled = parseMessage(
      rosterSnapshot({ removals: ["aaa-pass-kitchen"] }),
    ) as unknown as Record<string, unknown>;
    expect(
      Object.hasOwn(smuggled, "removals"),
      "01-F75: no removals list, for any resource — a removals list collapses *may it act* and *does it render* into one bit",
    ).toBe(false);
  });

  it("01-F81 (a)/01-F75: `reference_request`, `reference_notice` and `hello_ack.reference_versions` all name the resource — one triple, not a fourth bespoke chain", () => {
    expect(() =>
      parseMessage({
        v: PROTOCOL_VERSION,
        kind: "reference_request",
        resource: "device_roster",
        scope: SCOPE,
        have_version: 0,
      }),
    ).not.toThrow();

    expect(() =>
      parseMessage({
        v: PROTOCOL_VERSION,
        kind: "reference_notice",
        resource: "device_roster",
        scope: SCOPE,
        version: 3,
      }),
    ).not.toThrow();

    // `01-F77` — a version means nothing without the `(resource, scope)` it counts. If the key
    // cannot appear here, `01-F81` (e)'s whole negotiation is unexpressible and a device can only
    // learn of a roster by being pushed a notice, which is the design `01-F77` calls out as
    // giving "a till nobody can sign in to" after a dropped frame.
    expect(() =>
      parseMessage({
        v: PROTOCOL_VERSION,
        kind: "hello_ack",
        session_id: "s-1",
        hub: false,
        resume_from: 0,
        reference_versions: [{ resource: "device_roster", scope: SCOPE, version: 3 }],
      }),
    ).not.toThrow();
  });
});

// ===============================================================================================
// §2 — `01-F81` (d): the envelope is REQUIRED and it is PER ARM
// ===============================================================================================

describe("§2 01-F81 (d) — an unsigned device roster is UNREPRESENTABLE, and `staff` stays unsigned", () => {
  it("01-F81 (d): the same frame WITH the envelope parses and WITHOUT it is REFUSED — the pair, so neither half can pass alone", () => {
    // ⚠ THE PAIR IS THE TEST. Asserting only the refusal passes TODAY, vacuously, because the
    // whole `device_roster` arm is unknown and every frame naming it throws. A future in which
    // the arm lands with an OPTIONAL `signature` would then be blessed by a green test — which is
    // exactly the shape `01-F81` (d) exists to forbid ("an optional protection is one an
    // implementation can simply not supply"). The positive half is what makes this bite.
    expect(
      () => parseMessage(rosterSnapshot()),
      "01-F81 (a): the signed `device_roster` frame must parse — if THIS is the failing half, the arm does not exist yet and every other assertion in this file is about the same absence",
    ).not.toThrow();

    const { signature: _omitted, ...unsigned } = rosterSnapshot();
    expect(
      () => parseMessage(unsigned),
      "01-F81 (d): the envelope is a REQUIRED member of the `device_roster` arm — an optional field is one an implementation can simply not supply, and this corpus's most-repeated defect is exactly that shape",
    ).toThrow();
  });

  it("01-F81 (d): `staff` is still UNSIGNED — the envelope is per-arm, so signing one resource did not silently require it of another", () => {
    // If this ever fails, the envelope was added to the shared response BODY rather than to the
    // `device_roster` arm, and `01-F81` (d)'s whole argument is undone: a shared optional field
    // is forgettable, and a shared REQUIRED field breaks every staff publisher at once.
    expect(() =>
      parseMessage({
        v: PROTOCOL_VERSION,
        kind: "reference_response",
        resource: "staff",
        scope: SCOPE,
        form: "snapshot",
        version: 2,
        complete: true,
        next_from: 0,
        entries: [
          {
            user_id: randomUUID(),
            display_name: "Hina",
            grid_ordinal: 0,
            status: "active",
            assignments: [{ role: "cashier", branch_id: BRANCH }],
            pin_hash: "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$aaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("01-F81 (b): a DELTA states its base and a SNAPSHOT does not — the rule that already binds the other resources binds this one", () => {
    // `01-F81` (b) covers `base_version` "when the form is a delta" and gives the reason: without
    // it "a delta is applied onto a state it was not computed from and the branch diverges with
    // every version number still agreeing". `01-F56`'s existing superRefine is what enforces it,
    // and this asserts the new arm did not escape that check by being declared beside it.
    expect(() => parseMessage(rosterSnapshot({ form: "delta", base_version: 2 }))).not.toThrow();
    expect(
      () => parseMessage(rosterSnapshot({ form: "delta" })),
      "01-F56: a delta states the exact base it applies to, or it cannot be refused",
    ).toThrow();
    expect(
      () => parseMessage(rosterSnapshot({ base_version: 2 })),
      "01-F75: a snapshot REPLACES, so it applies to no base",
    ).toThrow();
  });
});

// ===============================================================================================
// §3 — `01-F81` (e): a device asks for what the session advertised, and for nothing else
// ===============================================================================================

/** A scripted cloud uplink: records what the session SENT, and lets a test inject `hello_ack`. */
const scriptedCloud = () => {
  const sent: ProtocolMessage[] = [];
  let handlers: CloudTransportHandlers | null = null;
  const transport: CloudTransport = {
    start(h) {
      handlers = h;
      h.onUp();
    },
    stop() {
      handlers = null;
    },
    send(message) {
      sent.push(message);
    },
  };
  return {
    transport,
    sent,
    deliver(message: unknown) {
      let parsed: ProtocolMessage;
      try {
        parsed = parseMessage(message);
      } catch (cause) {
        // A gateway frame this build cannot parse is not a test-harness problem — it is the wire
        // gap under test, and it must say so rather than surface as a raw `ZodError` three frames
        // up. `01-F77`: an advertisement the device cannot read is an advertisement it can never
        // act on.
        throw new Error(
          `01-F81 (a)/01-F77: this build cannot parse the frame the gateway would send — ${(cause as Error).message}`,
        );
      }
      handlers?.onMessage(parsed);
    },
  };
};

const requestsFor = (sent: readonly ProtocolMessage[], resource: string): ProtocolMessage[] =>
  sent.filter(
    (m) =>
      m.kind === "reference_request" &&
      (m as unknown as { resource: string }).resource === resource,
  );

describe("§3 01-F81 (e)/01-F77 — the negotiation is the answer: ask for the advertised keys, never for an unadvertised one", () => {
  it("01-F81 (e): a session whose `hello_ack` advertises `device_roster` FETCHES it; one that does not is never asked", () => {
    const cloud = scriptedCloud();
    const store = openStore({ path: ":memory:", identity: meshIdentity(DEVICE_ID) });
    try {
      const session = createCloudSession({
        store,
        transport: cloud.transport,
        clock: wallClock,
        device_class: "counter_electron",
        token: "cloud-token-not-under-test",
      });
      session.start();

      // (a) A gateway that does NOT serve the roster omits the key entirely (`01-F77`: omitted,
      // never `0`). "A `device_roster`-capable device meeting a gateway without it NEVER ASKS,
      // which is the whole of the staged-rollout case."
      cloud.deliver({
        v: PROTOCOL_VERSION,
        kind: "hello_ack",
        session_id: "s-old-gateway",
        hub: false,
        resume_from: 0,
        reference_versions: [{ resource: "staff", scope: SCOPE, version: 2 }],
      });
      expect(
        requestsFor(cloud.sent, "device_roster"),
        "01-F81 (e): a device MUST NOT request an artifact key the session's `hello_ack` did not advertise — a request for an unserved resource is a client that ignored the advertisement, and `01-F81` (e) gives it a session-killing refusal by default",
      ).toEqual([]);

      // ⚠ ANTI-VACUITY for (a). A session that asked for NOTHING would satisfy the assertion
      // above while proving the device is deaf rather than disciplined. `staff` WAS advertised at
      // version 2 over an empty store, so it must have been asked for.
      expect(
        requestsFor(cloud.sent, "staff").length,
        "the session must fetch the key it WAS advertised, or the assertion above proves only that this device asks for nothing",
      ).toBeGreaterThan(0);

      // (b) A gateway that DOES serve it advertises the key, and the device asks — this is the
      // half that is RED today and it is the seam `01-F74` (b) blocked on.
      cloud.deliver({
        v: PROTOCOL_VERSION,
        kind: "hello_ack",
        session_id: "s-new-gateway",
        hub: false,
        resume_from: 0,
        reference_versions: [{ resource: "device_roster", scope: SCOPE, version: 3 }],
      });
      const asked = requestsFor(cloud.sent, "device_roster");
      expect(
        asked.length,
        "01-F81/01-F74 (b): an advertised `device_roster` must be FETCHED — until it is, `lanRoster.apply` has no producer and no branch can enter the meshing state",
      ).toBeGreaterThan(0);
      expect(
        (asked[0] as unknown as { scope: unknown }).scope,
        "01-F76/01-F71 (e): the device asks with its OWN branch key, assembled from its bound identity and never echoed from the frame",
      ).toEqual(SCOPE);

      session.stop();
    } finally {
      store.close();
    }
  });
});

// ===============================================================================================
// §4 — THE SEAM: a shipping caller, or the mesh is decorative
// ===============================================================================================

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const SKIP_DIR = new Set(["node_modules", "dist", "out", ".next", ".turbo", ".oracle-typecheck"]);

const exists = (path: string): boolean => {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
};

const tsFilesUnder = (dir: string): string[] => {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      out.push(...tsFilesUnder(join(dir, entry.name)));
      continue;
    }
    if (/\.tsx?$/.test(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
};

const isTestFile = (file: string): boolean =>
  /\.test\.tsx?$/.test(file) ||
  file.split(sep).includes("__acceptance__") ||
  file.split(sep).includes("__tests__");

/**
 * ⚠ **COMMENTS STRIPPED BEFORE ANY COUNT, and `AGENTS.md` records why in its own words: "a
 * mention is not an import".** A count inflated by comment hits is how a reader is sent to a file
 * to find a call that was never there — and this repo is full of files that discuss the unhosted
 * mesh at length. Every file below names `lanRoster` or `setLanCredential` in prose.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every shipping (non-test) TypeScript file that could hold a producer for these two facts. */
const shippingSources = (): { path: string; code: string }[] => {
  const roots = [
    resolve(REPO_ROOT, "packages", "sync-client", "src"),
    resolve(REPO_ROOT, "apps", "pos-electron", "src"),
    resolve(REPO_ROOT, "apps", "pass-kds", "src"),
  ];
  return roots
    .flatMap(tsFilesUnder)
    .filter((file) => !isTestFile(file))
    .map((path) => ({
      path: relative(REPO_ROOT, path).split(sep).join("/"),
      code: stripComments(readFileSync(path, "utf8")),
    }));
};

describe("§4 01-F74/01-F80/01-F81 — the mesh is REACHABLE: something in the product writes the credential and the roster", () => {
  it("is actually reading shipping source, and excluding this suite's own fixtures", () => {
    const sources = shippingSources();
    expect(sources.length, "the walk must find shipping files at all").toBeGreaterThan(20);
    expect(
      sources.some((s) => s.path === "packages/sync-client/src/lan-roster.ts"),
      "the walk must reach the roster module it is asking about",
    ).toBe(true);
    expect(
      sources.some((s) => s.path.includes("__acceptance__")),
      "a walk that counted acceptance fixtures would find `pairByHand` and call the seam closed — which is the exact self-deception this section exists to prevent",
    ).toBe(false);
  });

  it("01-F81/01-F74 (b): shipping code APPLIES a branch roster — otherwise `createLanMesh` refuses at `no branch roster received yet` on every launch, for ever", () => {
    // Dot-anchored, so this counts a CALL and never the declaration or the implementation. The
    // roster's own `apply:` member inside `createLanRoster` is not preceded by a dot; a producer
    // writes `store.lanRoster.apply(...)`.
    const writers = shippingSources().filter((s) => /lanRoster\s*\.\s*apply\s*\(/.test(s.code));
    expect(
      writers.map((w) => w.path),
      "01-F74 (b) says the roster is 'distributed as snapshot-plus-delta over the same sync channel' and `01-F81` supplies the member and the envelope it was blocked on. Until a shipping module calls `lanRoster.apply`, `01-F72`'s admission has a trust anchor nothing can install: every till fails closed, every branch is a branch of solo tills, and `02-F11` is unreachable from the shipped binary. `seams:check` cannot see this — the roster is not an unreached export and not an unsupplied optional member; it is a required input with no producer.",
    ).not.toEqual([]);
  });

  it("01-F80/01-F73: shipping code WRITES the LAN credential — otherwise pairing is a shell command and `01-F25`'s back-office code is still unbuilt", () => {
    // Dot-anchored for the same reason: `device-store.ts` DECLARES `setLanCredential(credential:
    // LanCredential): void` and IMPLEMENTS `setLanCredential(credential) {`, and neither is a
    // call. A producer writes `store.setLanCredential(...)`. Matching the bare name would count
    // the sink as its own source, which is the "a mention is not an import" mistake with the
    // arrow reversed.
    const callers = shippingSources().filter((s) => /\.\s*setLanCredential\s*\(/.test(s.code));
    expect(
      callers.map((w) => w.path),
      "01-F80 (a)/(f): 'The owner MINTS and the device CLAIMS' and 'one response carries everything a device needs to become a till', including `01-F73`'s certificate. Until a shipping module stores it, `store.lanCredential()` is `null` on every launch and `createLanMesh` returns `unmeshed('not paired — no LAN credential (01-F73)')`. ⚠ The CLOUD half of `01-F80` — the claim endpoint, its 8-digit code, its 15-minute TTL, its one-time claim and its five named refusals — is `services/sync-gateway`'s and is owed its OWN oracle; this assertion is only that the device side has a producer.",
    ).not.toEqual([]);
  });
});
