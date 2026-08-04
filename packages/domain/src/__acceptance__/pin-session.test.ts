// Acceptance tests — S-0b, part 1 of 2: the PIN CREDENTIAL primitive (`hashPin`/`verifyPin`).
// Part 2 (`packages/sync-client/src/__acceptance__/pin-session.test.ts`) owns the registry,
// the offline verification, idle auto-lock, attempt lockout and `audit.login`.
//
// Authored from spec text ONLY, by a session that has read no implementation and no
// implementation plan (`24 §3` step 2; brief: `plans/wave-1/identity-test-brief.md`).
// Sources, and nothing else:
//   `specs/01-kernel-sync.md`   — `01-F26` ("PIN (Argon2id) unlock on shared devices"),
//                                 `01-F28` (PIN verification works on-device against SYNCED
//                                 credential hashes), `01-F1` (the ledger is permanent)
//   `specs/00-platform-overview.md` §5.4 — "PINs Argon2id-hashed, lockout on repeated failure"
//   `specs/18-engineering-handbook.md`   — Auth bullet: "`argon2` for PIN hashes"
//
// RED-AWAITING-IMPLEMENTATION. Nothing in `packages/domain` exports `hashPin` or `verifyPin`
// today, so every test below fails inside `hashPin()`/`verifyPin()` with a named message. The
// namespace cast is deliberate (the `permission-matrix.test.ts` / `merge-schema.test.ts`
// idiom): this file TYPECHECKS before the implementation exists, so a missing export is a loud
// per-test runtime failure rather than a module-load crash that reds `pnpm typecheck`
// repo-wide.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// WHY A SEPARATE FILE FROM THE SESSION TESTS. `01-F26` names ONE algorithm and `00 §5.4`
// repeats it, so "is this actually Argon2id" is a platform-law question with a single answer,
// testable without a device, a clock or a registry. Everything that needs one of those three
// lives in the sync-client half.
// ─────────────────────────────────────────────────────────────────────────────────────────
//
// PINNED INTERPRETATIONS — every place the FRs stop short. Recorded so the implementer can
// CONTEST the reading before building rather than discover it afterwards.
//
//  P1. LOCATION. `hashPin`/`verifyPin` are expected as exports of `@restos/domain`. `01-F26`
//      makes the algorithm platform law and `domain` is where platform law lives (`18 §2`);
//      `@noble/hashes@2.2.0` — already a `domain` dependency — ships `argon2id`, so this
//      placement costs no new dependency and, unlike the native `argon2` addon, does not put
//      a node-gyp build inside a package the browser-side workspaces import. THE NAMED
//      ALTERNATIVE is `packages/sync-client` (the device owns the credential path). If the
//      implementer prefers it, contest this pin BEFORE building — it is one import line here
//      and one in the sync-client half.
//  P2. ARGUMENT ORDER is `verifyPin(hash, pin)` — stored value first, candidate second. A pin,
//      not a spec fact. §2 would pass under either order for the CORRECT pin, so §2's
//      near-miss table is what actually fixes it: a flipped implementation that treated the
//      first argument as the candidate would hash a PIN-shaped string and compare it against
//      a raw PIN, and every row would still return false — which is why §3 (two salts, both
//      verify) and §5 (a JSON round-trip verifies) matter. Contest if you disagree.
//  P3. THE ENCODED FORM is a single self-contained PHC string (`$argon2id$v=..$m=..,t=..,p=..
//      $salt$hash`). This is NOT decoration: `01-F28` says the hashes are SYNCED to devices,
//      so the salt and the cost parameters have to travel WITH the hash or a device holding
//      only the digest cannot verify anything, and the day the cost parameters are raised
//      every already-synced hash becomes unverifiable. §1b asserts the parameters are present;
//      §5 asserts the string survives the JSON transport it will actually ride.
//  P4. PIN FORMAT is deliberately unconstrained. No FR states a length, an alphabet or a
//      complexity rule, and inventing one is how a test gets written to pass. The near-miss
//      table in §2 therefore includes an empty string and whitespace variants as WRONG PINS
//      (they are not the enrolled PIN) without asserting anything about whether `hashPin`
//      would accept them as an enrolment. Reported as a finding.
//  P5. NO TIMING ASSERTIONS ANYWHERE. Argon2id is deliberately slow (`01-F26`); the brief
//      forbids duration assertions and this file makes none. Cost-parameter STRENGTH is
//      therefore untested here — a conforming-but-weak `m=8,t=1,p=1` passes. Reported as a
//      finding: the cost floor is a spec gap, not something a test may invent.

import { describe, expect, it } from "vitest";
import * as domainNs from "../index.js";

// ── The contract (P1, P2) ──────────────────────────────────────────────────────────────────

const maybeExports = domainNs as unknown as {
  hashPin?: (pin: string) => Promise<string>;
  verifyPin?: (hash: string, pin: string) => Promise<boolean>;
};

const hashPin = (pin: string): Promise<string> => {
  const fn = maybeExports.hashPin;
  if (typeof fn !== "function") {
    throw new Error(
      "@restos/domain exports no `hashPin(pin): Promise<string>` — `01-F26` makes the PIN " +
        "hash Argon2id and `00 §5.4` repeats it as platform security law (S-0b, pin P1).",
    );
  }
  return fn(pin);
};

const verifyPin = (hash: string, pin: string): Promise<boolean> => {
  const fn = maybeExports.verifyPin;
  if (typeof fn !== "function") {
    throw new Error(
      "@restos/domain exports no `verifyPin(hash, pin): Promise<boolean>` — `01-F28` requires " +
        "on-device verification against synced credential hashes (S-0b, pins P1/P2).",
    );
  }
  return fn(hash, pin);
};

/**
 * The enrolled PIN used throughout. Eight digits rather than the four a cashier would really
 * type, for one mechanical reason that matters in the sync-client half's on-disk scan: every
 * decimal digit is also a hex digit, so a short numeric PIN can appear by chance inside a
 * UUIDv7 (`00 §6`) and turn a "the PIN is nowhere on disk" assertion flaky. Eight digits puts
 * that below one in ten million. Nothing in this file depends on the length — see P4.
 */
const ENROLLED_PIN = "62840173";

describe("01-F26 / 00 §5.4 — the PIN hash is Argon2id, and says so", () => {
  it("encodes the algorithm in the stored hash", async () => {
    const hash = await hashPin(ENROLLED_PIN);
    // The identifier is the whole assertion: `01-F26` names ONE algorithm. A SHA-256 or a
    // bcrypt hash of the same PIN round-trips through verify perfectly well, so every other
    // test in this file passes under the wrong primitive. This is the one that does not.
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("carries its own cost parameters, so a synced hash stays verifiable (P3)", async () => {
    const hash = await hashPin(ENROLLED_PIN);
    // `01-F28`: the hashes are SYNCED. A digest whose memory/time/parallelism are implied by
    // whatever the verifying build happens to be compiled with stops verifying the day those
    // are raised — on every device, for every user, offline, at once.
    expect(hash).toMatch(/\$m=\d+,t=\d+,p=\d+\$/);
  });
});

describe("01-F28 — verification round-trips, and near misses are refused", () => {
  it("accepts the enrolled PIN", async () => {
    const hash = await hashPin(ENROLLED_PIN);
    expect(await verifyPin(hash, ENROLLED_PIN)).toBe(true);
  });

  // The brief's bar: "the hash is not the PIN" is trivially true of any string transformation,
  // so the security claim has to be carried by REFUSALS. Each row is a PIN a real fat-finger
  // or a real guess produces.
  const NEAR_MISSES: readonly [label: string, pin: string][] = [
    ["one digit off", "62840174"],
    ["one digit short", "6284017"],
    ["one digit long", "628401730"],
    ["transposed", "62841073"],
    ["a prefix", "6284"],
    ["empty", ""],
    ["leading space", " 62840173"],
    ["trailing space", "62840173 "],
    ["another user's PIN", "13908425"],
  ];

  for (const [label, wrong] of NEAR_MISSES) {
    it(`refuses a wrong PIN — ${label}`, async () => {
      const hash = await hashPin(ENROLLED_PIN);
      expect(await verifyPin(hash, wrong)).toBe(false);
    });
  }
});

describe("01-F26 — the hash is salted per enrolment", () => {
  it("produces two different hashes for the same PIN, and verifies both", async () => {
    const a = await hashPin(ENROLLED_PIN);
    const b = await hashPin(ENROLLED_PIN);

    // Two staff who pick the same PIN — on a 4-digit keypad that is ordinary, not exotic —
    // must not share a stored value. Equal hashes mean the whole branch's credential table is
    // one rainbow table lookup, and `01-F28` puts that table on every device.
    expect(a).not.toEqual(b);
    expect(await verifyPin(a, ENROLLED_PIN)).toBe(true);
    expect(await verifyPin(b, ENROLLED_PIN)).toBe(true);
  });

  it("does not verify one enrolment's hash against a different PIN", async () => {
    const mine = await hashPin(ENROLLED_PIN);
    const theirs = await hashPin("13908425");
    expect(await verifyPin(mine, "13908425")).toBe(false);
    expect(await verifyPin(theirs, ENROLLED_PIN)).toBe(false);
  });
});

describe("01-F1 — the raw PIN is not recoverable from what gets stored", () => {
  it("does not embed the PIN in the hash", async () => {
    const hash = await hashPin(ENROLLED_PIN);
    // Weak on its own — paired with the round-trip above and the refusal table, it rules out
    // the degenerate "hash" that is the PIN with a prefix glued on. `01-F1` is why it matters
    // at all: a credential that leaks into a permanent record cannot be redacted later.
    expect(hash).not.toContain(ENROLLED_PIN);
    expect(hash).not.toEqual(ENROLLED_PIN);
  });
});

describe("01-F28 — a synced hash survives the transport it rides (P3)", () => {
  it("verifies after a JSON round-trip", async () => {
    const hash = await hashPin(ENROLLED_PIN);
    // `01-F28` distributes credential hashes as reference data. The hash reaches the device as
    // a JSON string and nothing else — no ambient salt table, no server call. If verification
    // needs anything the string does not carry, offline unlock is impossible by construction.
    const travelled = (JSON.parse(JSON.stringify({ pin_hash: hash })) as { pin_hash: string })
      .pin_hash;

    expect(travelled).toEqual(hash);
    expect(await verifyPin(travelled, ENROLLED_PIN)).toBe(true);
    expect(await verifyPin(travelled, "62840174")).toBe(false);
  });
});
