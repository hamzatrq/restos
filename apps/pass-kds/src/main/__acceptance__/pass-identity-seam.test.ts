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
    expect(IPC).not.toContain("pin_hash");
    expect(APP).not.toContain("pin_hash");
    const rosterHandler = handler("roster");
    expect(rosterHandler).not.toContain("pin_hash");
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
