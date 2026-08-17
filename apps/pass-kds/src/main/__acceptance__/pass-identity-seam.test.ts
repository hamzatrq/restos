// ACCEPTANCE TESTS — `03-F53`'s SEAMS. The hand-written half of `AGENTS.md`'s recurring defect.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The contract is written out in
// `./pass-identity.test.ts`; this file asserts that the APPLICATION reaches it. Committed RED.
//
// > ⚠ THE RECURRING DEFECT OF THIS WAVE: A CORRECT SUBSYSTEM WITH NO SEAM TO THE PRODUCT.
// > … Every one with all gates green — `pnpm verify` exit 0, suites passing, review clean —
// > because tests exercise a module DIRECTLY and nothing asserts the APPLICATION reaches it.
//
// `createPinSession` is instance 1 of that list by name: Argon2id, the lockout and its
// persistence were real, tested and unreachable while the shipped app compared `pin === "1234"`.
// This track lands the same subsystem on a second device, so the same hole is open again — and
// `seams:check` cannot close it: `createPassIdentity` will be reached (Rule A satisfied) and every
// option supplied (Rule B satisfied), while the two shapes the rail is blind to are exactly the
// two ways this app can go quiet — *a port supplied with a STUB* (`audit: () => {}`) and *an
// attribution that is computed and then not written*.
//
// ⚠ **THESE ARE SOURCE READS AND THAT IS STATED PLAINLY.** `main/index.ts` builds an Electron app
// at module scope and no suite in this package can import it, so the guard on *"does the host wire
// it"* is a string match — as `pass-seam.test.ts` and `handover-seam.test.ts` already are.
// `AGENTS.md`'s M10 row is the standing warning about what a source string is worth: it can be
// satisfied by a call that is present and wrong. What it CAN do is fail when the call is ABSENT,
// which is the failure this wave keeps shipping. Everything a suite can drive instead is driven —
// see `./pass-identity.test.ts`, which constructs the real modules over a real store.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const MAIN = read("../index.ts");
const IDENTITY = read("../pass-identity.ts");
const APP = read("../../renderer/App.tsx");
const PRELOAD = read("../../preload/index.ts");
const IPC = read("../../shared/ipc.ts");
const COUNTER_MAIN = read("../../../../pos-electron/src/main/index.ts");

/**
 * Source with its comments removed — what the machine runs, not what a reader is told.
 *
 * Every prose guard in this file is a grep, and `AGENTS.md`'s standing warning about greps is that
 * a proxy for the evidence is not the evidence: *"A mention is not an import."* A ban on a symbol
 * that a doc comment may legitimately NAME has to be a ban on the code.
 */
const code = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** The body of one `ipcMain.handle(CHANNELS.x` block, up to the next handler. */
const handler = (channel: string): string => {
  const from = MAIN.indexOf(`ipcMain.handle(CHANNELS.${channel}`);
  expect(from, `main registers no handler for CHANNELS.${channel}`).toBeGreaterThan(-1);
  const rest = MAIN.slice(from + 10);
  const next = rest.indexOf("ipcMain.handle(");
  return next === -1 ? rest : rest.slice(0, next);
};

describe("§A 03-F53 — the host CONSTRUCTS the session, against the REAL store", () => {
  it("main builds `createPassIdentity` and hands it the device store", () => {
    // Instance 1's shape: a verifier that exists, is tested, and is not the thing the app runs.
    expect(MAIN).toContain("createPassIdentity({");
    expect(MAIN).toMatch(/createPassIdentity\(\{\s*store,/);
  });

  it("01-F61 — the DURABLE counter and the SYNCED registry are what it verifies against", () => {
    // Instance 2 by name: "the durable lockout counter engaged only if a host passed
    // `store.pinAttempts`, and none did". `pin-session.ts` falls back to a process-lifetime
    // counter in silence, which keeps the scope and the cooldown and loses the persistence.
    //
    // Asserted on the MODULE rather than on the host, because that is where the contract puts it:
    // `createPassIdentity` takes the store and is the one place these two can be forgotten.
    expect(IDENTITY).toContain("store.pinAttempts");
    expect(IDENTITY).toContain("store.staff");
    // `01-F28` — the on-device verifier, not a comparison. A disjunction, so splitting the wiring
    // into another module is not penalised.
    expect(/\b(createPinSession|verifyPin)\b/.test(IDENTITY)).toBe(true);
  });

  it("01-F5 — the audit sink is REAL, not a no-op (instance 4, by name)", () => {
    // "`audit.login`'s sink was wired and tested in `sync-client` while `main/index.ts` passed
    // `audit: () => {}`." `seams:check` cannot see a port supplied with a stub — that is one of
    // the rail's three measured blind spots — so this is the hand-written assertion.
    expect(MAIN).toContain("createPinAuditSink");
    expect(MAIN, "the pass wires an empty audit sink — every unlock leaves no trail").not.toMatch(
      /audit:\s*\(\)\s*=>\s*\{\s*\}/,
    );
  });

  it("03-F53 OWED (3) / DEC-ARCH-001 — the DEV SEED is the shared one, and there is only one", () => {
    // `18 §2` forbids `apps → apps` outright, and `DEC-ARCH-001` rules EXTRACT at the second
    // consumer rather than copy: "a second local helper is a second interpretation … and the two
    // diverge silently". Two rosters is a pass and a till that disagree about who is on shift.
    expect(MAIN).toContain("seedDevStaff");
    expect(MAIN).toContain("@restos/device-config");
    // Declared in the package, not here and not there. The counter declared it first; landing a
    // second copy in this app is the failure, and so is leaving the counter's behind.
    expect(
      /const\s+DEV_STAFF\s*=/.test(MAIN),
      "apps/pass-kds declares a roster of its own — DEC-ARCH-001 says extract, not copy",
    ).toBe(false);
    expect(
      /const\s+DEV_STAFF\s*=/.test(COUNTER_MAIN),
      "apps/pos-electron still declares the roster it shared — two declarations of one roster " +
        "is how a pass screen and a till come to disagree about who is on shift, silently",
    ).toBe(false);
  });

  it("the seed runs BEFORE the window, so the first paint of the door has a roster", () => {
    // `apps/pos-electron`'s own reason, carried across: "a grid that fills in a moment later
    // would move tiles under a finger (`27-F4`)".
    const seededAt = MAIN.indexOf("seedDevStaff");
    const windowAt = MAIN.indexOf("new BrowserWindow(");
    expect(seededAt).toBeGreaterThan(-1);
    expect(windowAt).toBeGreaterThan(-1);
    expect(seededAt, "the roster is seeded after the window is built").toBeLessThan(windowAt);
  });
});

describe("§B 03-F16 / 02-F41 — the attribution reaches the ENVELOPE", () => {
  it("`actor_user_id: null` is GONE from every edge this app writes", () => {
    // ⚠ RETIRED AND REPLACED. `pass-seam.test.ts` §A and `handover-seam.test.ts` §B each PINNED
    // `actor_user_id: null` here — deliberately, so that "a future session cannot quietly fill it
    // with something plausible". `03-F53` is that ruling arriving, so both pins are superseded and
    // are retired in the same change that lands this file. `AGENTS.md`'s `01-F60` worked example
    // is why that is done the same day: a green test defending an overruled rule "would have
    // failed the correct implementation", and it took ~3 weeks to surface last time.
    //
    // What replaces them is stricter, not looser: the append writes the actor it was HANDED.
    expect(
      MAIN.includes("actor_user_id: null"),
      "the pass still writes an unattributable edge — 03-F53 forbids it and 01-F1 makes it " +
        "permanent",
    ).toBe(false);
    expect(MAIN).toContain("actor_user_id");
  });

  it("both emitters are handed the SESSION as a getter, and the append writes what they hand back", () => {
    // The contract's decision 3: ONE read of the session decides both whether the act happens and
    // whose name is on the envelope. A host that read `currentUser()` a second time inside its own
    // `append` would re-open exactly the window this closes (`02-F45`).
    for (const factory of ["createReadyMark({", "createServeMark({"]) {
      const call = MAIN.slice(MAIN.indexOf(factory));
      expect(MAIN, `${factory} is not constructed`).toContain(factory);
      expect(call.slice(0, 900), `${factory} is not given the session`).toMatch(
        /actor:\s*\(\)\s*=>/,
      );
      // The third parameter is the one that reaches the ledger. A two-parameter append here means
      // the host is inventing the actor a second time, or writing none.
      expect(
        call.slice(0, 900),
        `${factory}'s append does not take the actor the emitter resolved`,
      ).toMatch(/append:\s*\(type,\s*payload,\s*\w+\)/);
    }
  });

  it("the refusal vocabulary crosses the plane, so the screen can raise the door", () => {
    expect(IPC).toContain("no_session");
  });
});

describe("§C 01-F27 — the two identity axes reach the renderer, and the credential does not", () => {
  it("the roster and the unlock take channels of their own, and the preload exposes both", () => {
    expect(MAIN).toContain("ipcMain.handle(CHANNELS.roster");
    expect(MAIN).toContain("ipcMain.handle(CHANNELS.unlock");
    const members = [...PRELOAD.matchAll(/ipcRenderer\.invoke\(CHANNELS\.(\w+)/g)].map((m) => m[1]);
    // ⚠ WIDENED, and the previous set is named so the widening is visible: `pass-seam.test.ts` §D
    // holds `{passState, queue, markReady, handOver}` from the other side, deliberately — "a rule
    // two files assert is a rule neither can quietly drop". `03-F53` adds exactly two.
    expect(new Set(members)).toEqual(
      new Set(["passState", "queue", "markReady", "handOver", "roster", "unlock"]),
    );
    // `18 §9` — still no generic invoke and no channel parameter, or the audit above is worthless.
    expect(PRELOAD).not.toMatch(/invoke:\s*\(channel/);
  });

  it("01-F28 — no credential is projected across the seam", () => {
    // The renderer verifies nothing, so a hash on that side is a secret shipped to the untrusted
    // end for no purpose. `pass-identity.test.ts` §B drives the same property behaviourally; this
    // is the structural half, on the projection the host actually serves.
    //
    // ⚠ COMMENTS ARE STRIPPED FIRST, and the reason is a finding against the FIRST DRAFT of this
    // very row: it read `expect(IPC).not.toContain("pin_hash")` and went RED against a correct
    // implementation whose schema comment said *"Never a `pin_hash`"*. That is `AGENTS.md`'s own
    // "a mention is not an import" mistake, committed inside the file that quotes it — and the
    // round-3 law puts a test that stays red under a correct implementation on exactly the same
    // footing as a vacuous one. A guard whose evidence is a grep has to match the CODE.
    for (const [name, source] of [
      ["shared/ipc.ts", IPC],
      ["renderer/App.tsx", APP],
      ["the roster handler", handler("roster")],
    ] as const) {
      expect(code(source), `${name} projects a credential to the untrusted end`).not.toContain(
        "pin_hash",
      );
    }
  });

  it("the unlock handler validates BOTH arguments before they reach a verifier", () => {
    // `shared/ipc.ts` calls the renderer "the untrusted end of this bridge even though we ship
    // it". A non-string reaching `verifyPin` throws inside the handler, which `invoke` turns into
    // a rejected promise on a surface whose whole job is to not be stuck (`01-F17`).
    const unlock = handler("unlock");
    expect(unlock).toMatch(/typeof\s+\w+\s*!==\s*"string"|\.parse\(/);
  });

  it("01-F1 — the unlock path appends nothing itself", () => {
    // A PIN written into an event is permanent and unredactable; `01-F5`'s `audit.login` is the
    // sink's to write, on a store-owned chain, and never this handler's.
    const unlock = handler("unlock");
    expect(unlock).not.toContain("store.append(");
  });
});

describe("§D 01-F26 / 03-F53 — acting feeds the idle clock and looking does not", () => {
  it("both write channels touch the session", () => {
    // Without this the clock runs from the moment of unlock and a cook is signed out ten minutes
    // into a service she has been working continuously — `pass-identity.test.ts` §D drives the
    // module's half; this is the host's.
    expect(handler("markReady"), "a ready-mark does not count as activity").toContain("touch(");
    expect(handler("handOver"), "a handover does not count as activity").toContain("touch(");
  });

  it("the polled reads do NOT — or idle auto-lock is unreachable on this app by construction", () => {
    // `main/uplink.ts` fires `changed` EVERY SECOND so `03-F14`'s colours move, and the renderer
    // re-reads `passState` and `queue` on each one. If either counted as activity the session
    // would never expire on a pass screen — which is a worse failure here than on the counter,
    // because this device sits unattended between rushes.
    expect(handler("passState"), "polling the device state holds the session open").not.toContain(
      "touch(",
    );
    expect(handler("queue"), "polling the queue holds the session open").not.toContain("touch(");
    expect(handler("roster"), "reading the roster holds the session open").not.toContain("touch(");
  });
});

describe("§E 00 §5.7 — the boot line stops claiming a gap that has closed", () => {
  it("the module header and the boot line no longer say there is no PIN session here", () => {
    // `AGENTS.md`'s most-repeated lesson, applied to this app's own prose: "a stale claim
    // propagates fastest through the person fixing a different stale claim in the same paragraph".
    // Three files say in terms that this device has no session and attributes nothing; all three
    // become false the moment `03-F53` lands, and the boot line is the one an operator reads.
    //
    // Matched on the CLAIM rather than on a sentence, so any rewrite passes and a survival fails.
    for (const [name, source] of [
      ["main/index.ts", MAIN],
      ["main/ready-mark.ts", read("../ready-mark.ts")],
      ["main/serve-mark.ts", read("../serve-mark.ts")],
      ["main/ready-signal.ts", read("../ready-signal.ts")],
    ] as const) {
      expect(
        /no\s+`?01-F26`?'?s?\s+PIN session|NO PIN SESSION|has no `01-F26` PIN session/i.test(
          source,
        ),
        `${name} still tells its reader this device has no PIN session`,
      ).toBe(false);
      expect(
        /actor_user_id`? is `?null`? on every edge/i.test(source),
        `${name} still claims every edge is written unattributed`,
      ).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F 00 §5.7 — AND IT REPORTS THE DEVICE RATHER THAN THE REQUEST.
//
// ⚠ ADDED 2026-08-17. §E above stops the boot line claiming a gap that has closed; this stops it
// claiming a ROSTER that is not here. `seedDevStaff` stands down on a device holding a roster it
// RECEIVED (R21) and `staff.ts` REFUSES rather than throwing (`01-F17`), so both are states in
// which the seed writes nothing — and a line drawn from `env` alone announces three fixture people
// over a door nobody can open. `describeDevStaff`'s own header carries the measurement: a pilot
// till "went on printing `staff: 3 seeded — Ayesha, Bilal, Hina` while none of the three was on it".
//
// The cost lands hardest on THIS app. The counter's operator meets `02-F22` at 09:00 when the day
// will not open; here the surface is a door with an empty grid, which looks exactly like a door
// waiting for a cook to press it — and with nobody able to sign in, `03-F53` makes every ready-mark
// and every handover unwritable, so the queue fills and nothing leaves it.
//
// **Two mutants an out-of-tree run reported as surviving every gate** are what this is pointed at:
// `seedDevStaff` returning a bare `true` instead of its `apply` result, and `describeDevStaff`
// ignoring its `device` argument. Neither is reachable from a host source read — both are edits to
// `packages/device-config` — so what is owned here is the SEAM beneath them: the registry this
// screen wrote into, the seed's own report, and the order the two happen in. The package half of
// the first is a behavioural assertion against a REFUSING registry and belongs to
// `packages/device-config/src/__acceptance__/dev-staff-seed.test.ts` (`24 §3` keeps that oracle
// byte-identical); it is reported as a finding rather than smuggled in here.
//
// ⚠ `apps/pos-electron`'s `__acceptance__/dev-staff-credentials.test.ts` §E asserts the same three
// properties across BOTH hosts, and the overlap is deliberate — §C above states the rule: "a rule
// two files assert is a rule neither can quietly drop". These are source reads for §A's stated
// reason, with §A's stated limit: a string cannot fail on a call that is present and wrong, and it
// can fail on one that is absent, mis-supplied or out of order.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The text of `name(…)`, bounded by its OWN closing parenthesis rather than by a character window.
 *
 * This host writes its whole boot line as one template literal, so the roster call closes `})}` and
 * a brace-bounded window would either stop short or run into the next line of the block. A balance
 * walk is indifferent to formatting, which is what stops this file going RED against a correct
 * implementation that reflowed the call.
 */
const callTo = (source: string, name: string): string | null => {
  const at = source.indexOf(`${name}(`);
  if (at === -1) return null;
  let depth = 0;
  for (let i = at + name.length; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  return null;
};

/** The expression a call passes for `member:`, or `undefined` if it passes none. */
const argumentFor = (call: string, member: string): string | undefined =>
  new RegExp(`\\b${member}:\\s*([^,\\n}]+)`).exec(call)?.[1]?.trim();

describe("§F 00 §5.7 — the roster line is drawn from this DEVICE, after the seed", () => {
  const SOURCE = code(MAIN);

  it("the line is handed the registry this screen SEEDED, not the environment alone", () => {
    const seed = callTo(SOURCE, "seedDevStaff");
    const line = callTo(SOURCE, "describeDevStaff");
    expect(seed, "main does not call seedDevStaff").not.toBeNull();
    expect(line, "main does not call describeDevStaff").not.toBeNull();

    const seeded = argumentFor(seed ?? "", "registry");
    const reported = argumentFor(line ?? "", "registry");
    expect(seeded, "main does not hand seedDevStaff a registry").toBeDefined();
    // `seams:check` is blind to this by construction — the device bag is REQUIRED, so Rule B is
    // satisfied by any supply, and `DevStaffRegistry` is structurally typed, so `{ list: () => [] }`
    // typechecks. That is `AGENTS.md`'s "port supplied with a STUB", measured invisible to every
    // rail in the repo.
    expect(
      reported,
      "the roster boot line is drawn with no registry, so it can only report what an operator " +
        "ASKED for — a different fact from what is on this device (00 §5.7)",
    ).toBeDefined();
    expect(
      reported,
      "the line reports a DIFFERENT registry from the one this screen seeded — two readings of " +
        "one fact is how a surface and the code it describes come to disagree (03-F40)",
    ).toBe(seeded);
    // The SHAPE, not the literal `store.staff`: renaming the store must not redden a correct host,
    // while a literal or any other projection still fails.
    expect(
      /^[A-Za-z_$][\w$]*\.staff$/.test(reported ?? ""),
      `main passes \`${reported}\` as the registry — not the device's own staff registry`,
    ).toBe(true);
  });

  it("it is drawn AFTER the seed, so it reports the roster as it IS", () => {
    // Order is what makes the line true, so the order is what is asserted. §A already pins the
    // seed BEFORE the window for `27-F4`'s reason; this pins the report after the seed, and the
    // two together fix the whole sequence: seed, report, paint.
    const seededAt = SOURCE.indexOf("seedDevStaff(");
    const reportedAt = SOURCE.indexOf("describeDevStaff(");
    expect(seededAt, "main does not call seedDevStaff").toBeGreaterThan(-1);
    expect(reportedAt, "main does not call describeDevStaff").toBeGreaterThan(-1);
    expect(
      reportedAt,
      "the roster line is drawn BEFORE the seed, so it reports the device as it was rather than " +
        "as it is",
    ).toBeGreaterThan(seededAt);
  });

  it("01-F17 — what seedDevStaff RETURNED is what the line reports as `seeded`", () => {
    // `staff.ts` refuses rather than throwing, so a discarded return is a screen that wrote
    // nothing and said nothing about it. The registry cannot recover the fact:
    // `describeDevStaff` says so in terms — an empty grid because nobody was configured and an
    // empty grid because the registry REFUSED look identical from `list()`.
    // ⚠ The declaration keyword is OPTIONAL: a host that declares `let staffSeeded` and assigns it
    // later still hands the boot line what the seed returned, and a test that reddens a correct
    // implementation is as damaging as a vacuous one. What has no binding at all — `await
    // seedDevStaff({…});` as a bare statement — is the discarded return this owns.
    const binding = /(?:(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=\s*await\s+seedDevStaff\(/.exec(
      SOURCE,
    )?.[1];
    expect(
      binding,
      "main discards seedDevStaff's return — a refused write is then indistinguishable from a " +
        "successful one on the one line the person setting this screen up reads (01-F17, 00 §5.7)",
    ).toBeDefined();

    const line = callTo(SOURCE, "describeDevStaff");
    expect(line, "main does not call describeDevStaff").not.toBeNull();
    const call = line ?? "";
    // THE DANGEROUS CASE: `seeded: true`. It typechecks, it reads like the happy path, and it makes
    // the boot line assert a write the registry rejected.
    expect(
      new RegExp(`\\bseeded:\\s*${binding}\\b`).test(call) ||
        (binding === "seeded" && /\bseeded\s*[,}]/.test(call)),
      `main reports \`${argumentFor(call, "seeded")}\` as the seeded fact rather than the ` +
        `\`${binding}\` seedDevStaff returned`,
    ).toBe(true);
  });
});
