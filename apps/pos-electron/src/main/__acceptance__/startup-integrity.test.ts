// ACCEPTANCE TESTS — **authored from spec text only** (`24 §3` step 2), by a session that
// implemented NONE of what they require. Nothing in `main/index.ts` was changed to make any of
// this pass; every assertion below is currently RED against the shipped binary and is meant to be.
//
// PROVENANCE: written from `01-F2`, `01-F8`, `01-F17`, `01-F64`, `01-F66`, `01-F67`, `00 §5.1`
// and `00 §5.7`, plus `ops/startup/restos-counter.bat` — which is not a spec but IS the shipped
// launcher, and clause (iii) of `01-F67` is about it.
//
// ── WHY THIS FILE LAUNCHES THE APP INSTEAD OF IMPORTING IT ──────────────────────────────────
//
// Both defects it covers were found by a dress rehearsal against the running product and were
// invisible to 4375 passing tests. Neither could have been otherwise:
//
//   * `main/index.ts` builds an Electron app at module scope and no suite in this package can
//     import it — the constraint `pass-seam.test.ts` §A2, `line-advance-seam.test.ts` §A and
//     `device-identity-seam.test.ts` §C all work under, where the answer was a SOURCE READ.
//     A source read cannot express either claim here: *"a second process does not become a
//     second till"* and *"a refusal returns to its launcher"* are facts about PROCESSES.
//   * The failure in §B is a promise-wiring defect (`app.whenReady().then(cb, fatal)` — a
//     rejection handler cannot catch a rejection thrown inside its own fulfilment handler), and
//     a test that re-built that chain in-process would be asserting against its own copy. That
//     is `K-3`'s dead-oracle defect: the suite would stay green while the shipped wiring rotted.
//
// So this runs what `pnpm start` runs — `electron-vite build`, then `electron out/main/index.js`
// — decomposed only so far as it must be to hand two launches a different environment and a
// shared `--user-data-dir`. It follows `services/sync-gateway`'s `startable.test.ts`, which is
// this repo's precedent for asking a question only a running process can answer.
//
// ── THE TWO DEFECTS, AS OBSERVED ───────────────────────────────────────────────────────────
//
// §A (`01-F66`) Two instances of this app were started against one store. **Neither said
// anything.** The second signed in, rang four items, and its cart read `Nothing added yet` under
// `TOTAL Rs 0`; its main log carried `SqliteError: database is locked … SQLITE_BUSY` and the
// renderer swallowed it. A cashier cannot tell that till from a working one until she counts the
// drawer. `grep -a -rn requestSingleInstanceLock apps/` returns nothing, and `01-F64`'s binding
// refuses only a DIFFERENT org/branch/device — never a second process holding the same one.
//
// §B (`01-F67`) `main/index.ts:476` is `app.whenReady().then(async () => { … }, fatal)`. The
// `fatal` handler is therefore UNREACHABLE from the callback beside it, and the `01-F64` refusal
// it exists to deliver produced, measured on this binary: an `UnhandledPromiseRejectionWarning`,
// no window, no dialog, and **a process that never exited**. `restos-counter.bat` is a `:loop`
// around `call pnpm -C apps\pos-electron start`; a launcher that never returns never restarts.
//
// ── WHAT IS PINNED AND WHAT DELIBERATELY IS NOT ────────────────────────────────────────────
//
// `01-F66` names two plausible mechanisms (a single-instance lock; a store-level refusal on
// `01-F64`'s pattern) and requires neither. Nothing below mentions either. §A asserts only what
// an operator could see: the second process does not become a till, it returns, the FIRST one is
// untouched, and the next launch after both are gone still works. In particular §A asserts
// **nothing about what the second process says** — with a lock, the honest answer is the running
// till itself, and a test demanding a message would forbid the better design.
//
// The one string this file leans on is the till's own last boot line (`catalogBootSummary`,
// `main/catalog.ts`). It is the only externally visible marker for *"this process got all the way
// up"*, and it is used as a CONTROL as much as an assertion: a launch that must succeed and one
// that must not are measured by the same marker, so if the marker rots, §A1/§A5/§B1 fail loudly
// rather than §A2/§B5 passing vacuously.
//
// ── MUTATION MATRIX (the round-3 law: report the numbers, do not claim the tests bite) ─────
//
// Run OUT OF TREE — a scratchpad copy of this app with `node_modules` symlinked — because this
// session authored the tests and edits no implementation. The CONTROL is a plausible fix in
// three branches: `.then(cb, fatal)` → `.then(cb).catch(fatal)`; `fatal` writes the detail to
// stderr and exits instead of blocking on a modal; and `requestSingleInstanceLock()` refuses a
// second process. Each mutant is exactly one branch off that control, full suite every time.
//
//   CONTROL (plausible fix)                          12/12 PASS   killed: none
//   S1  `}, fatal)` — the shipped wiring verbatim     9/12        killed: B2, B3, B4
//   S2  the single-instance guard deleted            10/12        killed: A2, A3
//   S3  the refusal exits promptly and says NOTHING  11/12        killed: B6
//   S4  the RUNNING till is the one that dies         9/12        killed: A2, A3, A4
//   S6  a lock FILE that is never cleaned up         10/12        killed: A5, B6
//   S5  NEGATIVE CONTROL — a real refactor          12/12 PASS   killed: none
//
// **CONTROL 12/12 is the number that matters most**: a correct implementation is not blocked by
// anything here, which is the other half of `24 §3`'s law. **S5 is what makes every red row mean
// anything** — a genuine one-branch restructuring of both paths under test reddens nothing. S1
// and S2 kill disjoint sets, so neither defect's fix is the other's. S4 and S6 are the anti-fix
// rows: §A4 fires only when the running till is stopped, and §A5 only when something is left
// behind that refuses the next launch — the two ways a plausible repair does more harm than the
// defect.
//
// ⚠ **S6 FOUND A DEFECT IN THIS FILE'S OWN HARNESS, AND READING WOULD NOT HAVE.** `waitFor`
// returned its poll's result, and the poll gives up early when the process dies — so a launch
// that CRASHED was reported as having come up, and §A5 stayed green while no launch after the
// first ever reached the till. Every control here rests on that call. It returns the pattern
// match now; see the comment at the call site. **S4's first draft was the same class of error in
// the other direction**: it registered `second-instance` without taking the lock, and Electron
// only emits that event to the lock HOLDER, so the mutant was S2 wearing a different name and
// killed exactly what S2 killed. A mutant that does not reproduce the defect it names proves
// nothing about the guard.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
const PKG_DIR = resolve(import.meta.dirname, "..", "..", "..");
const MAIN_BUNDLE = join(PKG_DIR, "out", "main", "index.js");

/** `require("electron")` outside an Electron runtime is the path to the binary. */
const ELECTRON = require_("electron") as unknown as string;

/**
 * Linux CI and this repo's agent shells have no display. `xvfb-run` is a **prerequisite, not an
 * optional extra**: `T-01-07`'s rule is that a missing environment fails loudly rather than
 * skipping, because a suite that quietly skips the only test of a start-up refusal is worse than
 * no suite. `ELECTRON_DISABLE_SANDBOX` is required for the same environments.
 */
const HEADLESS = process.platform === "linux" && !process.env.DISPLAY;

/**
 * The child environment is BUILT, never inherited wholesale: an agent shell (or a developer who
 * has been running the stack) may hold `RESTOS_DEVICE_ID` or `RESTOS_DEV_MENU`, and either would
 * silently change which device these launches are and what §B is measuring.
 */
const envFor = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("RESTOS_")) delete env[key];
  env.ELECTRON_DISABLE_SANDBOX = "1";
  for (const [key, value] of Object.entries(extra)) env[key] = value;
  return env;
};

/** The till's LAST boot line — `main/catalog.ts`'s `catalogBootSummary`. See the header. */
const TILL_IS_UP = /@restos\/pos catalog v\d+/;
/** Its FIRST boot line, so "never started" and "started and stopped early" are distinguishable. */
const PROCESS_SPOKE = /^identity: org /m;

/**
 * Bounds. Neither is a performance claim — both exist because "eventually" and "for ever" are the
 * same test result without a clock (`startable.test.ts`'s own note). `BOOT_MS` is generous: a cold
 * Electron start measured ~10 s on this machine. `RETURN_MS` is the one that carries a verdict,
 * and 30 s is far past any exit path that does no work: today's binary sat past 45 s and was
 * killed by the harness, which is what "never returns" looks like from outside.
 */
const BOOT_MS = 90_000;
const RETURN_MS = 30_000;

interface Launch {
  readonly output: () => string;
  readonly reachedTill: () => boolean;
  /** Resolves true if the pattern appears before the deadline (or the process dies first). */
  readonly waitFor: (pattern: RegExp, ms: number) => Promise<boolean>;
  /** The exit code, or `null` if it was still running at the deadline. */
  readonly waitForExit: (ms: number) => Promise<number | null>;
  readonly alive: () => boolean;
  readonly stop: () => Promise<void>;
}

const running: ChildProcess[] = [];

const launch = (userDataDir: string, extraEnv: Record<string, string> = {}): Launch => {
  const appArgs = [MAIN_BUNDLE, `--user-data-dir=${userDataDir}`];
  const cmd = HEADLESS ? "xvfb-run" : ELECTRON;
  const argv: string[] = HEADLESS
    ? ["-a", "--server-args=-screen 0 1366x768x24", ELECTRON, ...appArgs]
    : appArgs;

  // `detached` so the whole group can be killed together. Without it, SIGKILL to `xvfb-run`
  // leaves the Electron process it launched holding the store — which would make the NEXT
  // launch in the same scenario fail for a reason this file did not create.
  const child = spawn(cmd, argv, {
    cwd: PKG_DIR,
    env: envFor(extraEnv),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  running.push(child);

  let out = "";
  let exited: number | null = null;
  child.stdout?.on("data", (d: Buffer) => {
    out += d.toString();
  });
  child.stderr?.on("data", (d: Buffer) => {
    out += d.toString();
  });
  child.on("exit", (code, signal) => {
    exited = code ?? (signal === null ? 0 : 128);
  });

  const settled = () => exited !== null;
  const poll = async (done: () => boolean, ms: number): Promise<boolean> => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (done()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return done();
  };

  const stop = async (): Promise<void> => {
    if (settled() || child.pid === undefined) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    if (await poll(settled, 8_000)) return;
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    await poll(settled, 5_000);
  };

  return {
    output: () => out,
    reachedTill: () => TILL_IS_UP.test(out),
    /**
     * ⚠ **THIS RETURNED `poll(...)` DIRECTLY AND IT WAS A DEFECT IN THE HARNESS, FOUND BY
     * MUTATING RATHER THAN BY READING.** The poll gives up early when the process dies — which
     * is right, because otherwise every dead launch costs the full `BOOT_MS` — but its result
     * then answered *"did anything happen"* rather than *"did the pattern appear"*, so a binary
     * that exited instantly was reported as HAVING COME UP. Every control in this file rests on
     * this call, so a launch that crashed on start would have blessed §A2 and §B5 while proving
     * nothing at all. Measured under a mutant that put a stale lock file in the store directory:
     * §A5 stayed green while no launch after the first ever reached the till.
     */
    waitFor: async (pattern, ms) => {
      await poll(() => pattern.test(out) || settled(), ms);
      return pattern.test(out);
    },
    waitForExit: async (ms) => ((await poll(settled, ms)) ? exited : null),
    alive: () => !settled(),
    stop,
  };
};

beforeAll(() => {
  if (HEADLESS) {
    try {
      execFileSync("xvfb-run", ["--help"], { stdio: "ignore" });
    } catch {
      throw new Error(
        "xvfb-run is not installed. This suite launches the real Electron binary, which is the " +
          "only instrument that can see either defect it covers (01-F66, 01-F67). Install xvfb " +
          "(`apt-get install xvfb`) or run with a display. It is not skipped on purpose (T-01-07).",
      );
    }
  }
  // What `pnpm start` does first. The binary under test must be the CURRENT source, or a green
  // run here says only that a bundle somebody built last week starts.
  execFileSync(join(PKG_DIR, "node_modules", ".bin", "electron-vite"), ["build"], {
    cwd: PKG_DIR,
    stdio: "ignore",
  });
  expect(existsSync(MAIN_BUNDLE), `${MAIN_BUNDLE} — the build produced no main bundle`).toBe(true);
}, 300_000);

afterAll(async () => {
  for (const child of running) {
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — `01-F66`: A SECOND INSTANCE ON ONE STORE MUST NOT SILENTLY PROCEED.
//
// One scenario, five verdicts. It is a `beforeAll` rather than five tests because the facts are
// SEQUENTIAL — the second launch is only meaningful while the first is up, and the third only
// after both are gone — and because three Electron cold starts is the whole cost of the file.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F66 — a second instance of the counter against one device store", () => {
  let dir = "";
  let firstBooted = false;
  let secondOutput = "";
  let secondBecameTill = false;
  let secondExit: number | null = null;
  let firstSurvived = false;
  let relaunchBooted = false;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "restos-till-a-"));

    const first = launch(dir);
    firstBooted = await first.waitFor(TILL_IS_UP, BOOT_MS);

    const second = launch(dir);
    secondExit = await second.waitForExit(RETURN_MS);
    secondOutput = second.output();
    secondBecameTill = second.reachedTill();
    // Read AFTER the second has had its full window: the question is whether the running till
    // survived the arrival of a rival, not whether it was alive a moment before one appeared.
    firstSurvived = first.alive();

    await second.stop();
    await first.stop();

    // Both gone. A fresh launch must now be an ordinary launch — see §A5.
    const third = launch(dir);
    relaunchBooted = await third.waitFor(TILL_IS_UP, BOOT_MS);
    await third.stop();
  }, 300_000);

  it("§A1 CONTROL — the first instance comes all the way up", () => {
    // Not a claim about the defect: it is what makes every verdict below attributable. If this
    // fails, the harness cannot start this app at all and §A2's silence proves nothing.
    expect(
      firstBooted,
      "the first launch never reached its last boot line — nothing else in §A is attributable",
    ).toBe(true);
  });

  it("§A2 01-F2 — the second instance never becomes a second till", () => {
    // The observed failure exactly: it DID become one. It printed the whole boot summary, opened
    // a window, took a sign-in and four items, and acknowledged appends that never reached the
    // `events` table — `01-F2` is *"persists events locally BEFORE acknowledging the action to
    // the UI"*, and a till whose writes are lost while it says nothing is that clause inverted.
    //
    // Mechanism-free on purpose (`01-F66`): a lock that quits before the store is opened and a
    // store that refuses the second handle both satisfy this. What neither may do is arrive here.
    expect(
      secondBecameTill,
      "01-F66/01-F2: a second instance reached the counter's last boot line, so this store now " +
        "has two live tills on it — the state whose writes were silently discarded as SQLITE_BUSY",
    ).toBe(false);
  });

  it("§A3 01-F66(a)/01-F67 — the second instance RETURNS instead of sitting there", () => {
    // "Did not become a till" is not enough by itself: a process that refuses and then hangs is
    // still a dark window on a counter and still a `restos-counter.bat` loop that never fires
    // again. Today this is the observable that fails — the second instance ran until the harness
    // killed it.
    expect(
      secondExit,
      `01-F66(a): the second instance was still running after ${RETURN_MS} ms. It must return to ` +
        `its launcher. Its output was:\n${secondOutput.slice(-2000)}`,
    ).not.toBeNull();
  });

  it("§A4 01-F17/00 §5.1 — the FIRST instance is untouched and still running", () => {
    // The anti-fix assertion, and the one most likely to be broken by a plausible repair.
    // Last-one-wins is a real design and `01-F66(b)` refuses it explicitly: the till that is
    // already open is the one with a cashier's hands on it and an order half-rung. A guard that
    // takes it down mid-service has converted a silent defect into a stopped till.
    expect(
      firstSurvived,
      "01-F66(b): the running till exited when a second instance was launched at it",
    ).toBe(true);
  });

  it("§A5 01-F66(c) — after both are gone, the next launch is an ordinary launch", () => {
    // The other anti-fix assertion. A lock file, a stale PID entry or a store flag left behind by
    // the refusal would brick every subsequent start — and the launch that matters is the one
    // after a power cut, unattended, at 05:00, where the first instance did not exit cleanly and
    // nobody is there to delete anything. If a fix ever needs this to be true, it is not a fix.
    expect(
      relaunchBooted,
      "01-F66(c): a fresh launch after both instances ended did not reach the till's last boot " +
        "line — something was left behind that refuses the next start",
    ).toBe(true);
  });

  afterAll(() => {
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — `01-F67`: A REFUSAL TO START REACHES SOMEBODY AND RETURNS.
//
// Driven through the ONE start-time refusal that already ships and is already specified:
// `01-F64`'s store-identity binding. The refusal itself is correct, tested, and has been
// unreachable — it is raised inside the callback whose sibling handler is `fatal`.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** A different till, same org and branch — `01-F64`'s mismatch on exactly one of the three. */
const TILL_B = "00000000-0000-7000-8000-00000000000b";

describe("§B 01-F67 — a refusal raised inside the ready callback", () => {
  let dir = "";
  let seedBooted = false;
  let refusalExit: number | null = null;
  let refusalOutput = "";
  let refusalBecameTill = false;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "restos-till-b-"));

    // Bind the store to this app's documented no-environment identity (`01-F65`'s one exemption).
    const seed = launch(dir);
    seedBooted = await seed.waitFor(TILL_IS_UP, BOOT_MS);
    await seed.stop();

    // …then ask the same store to be a different device. `01-F64` refuses; `01-F67` governs what
    // that refusal must DO.
    const refused = launch(dir, { RESTOS_DEVICE_ID: TILL_B });
    refusalExit = await refused.waitForExit(RETURN_MS);
    refusalOutput = refused.output();
    refusalBecameTill = refused.reachedTill();
    await refused.stop();
  }, 300_000);

  it("§B1 CONTROL — the same binary, same directory, no override, comes up", () => {
    // Attribution. Without it, §B2 passing on a binary that cannot start at all would read as a
    // refusal working perfectly.
    expect(seedBooted, "the seed launch never came up — §B measures nothing").toBe(true);
  });

  it("§B2 01-F67(ii) — the refused launch TERMINATES", () => {
    // THE defect. `app.whenReady().then(cb, fatal)`: `fatal` is the onRejected of the same
    // `.then` whose onFulfilled throws, and a promise never routes a handler's own rejection to
    // its sibling. So the refusal became an unhandled rejection and the process stayed up for
    // ever with no window — measured past 45 s on this binary.
    expect(
      refusalExit,
      `01-F67(ii): the refused launch was still running after ${RETURN_MS} ms. ` +
        `restos-counter.bat loops around this process; a launcher that never returns never ` +
        `restarts. Output:\n${refusalOutput.slice(-2000)}`,
    ).not.toBeNull();
  });

  it("§B3 01-F67(ii) — and it terminates NON-ZERO", () => {
    // A refusal that exits 0 tells the launcher the till ran and stopped normally, which is what
    // a shift ending looks like. The `:loop` would restart it either way; a supervisor, a log
    // scraper or a human reading `%errorlevel%` would not.
    //
    // The null check is not redundant with §B2: `expect(null).not.toBe(0)` PASSES, so without it
    // a process that never returns satisfies the code assertion vacuously — a guard pointed at
    // nothing, which is this repo's round-3 law in miniature.
    expect(
      refusalExit,
      "01-F67(ii): the refusal never returned, so it has no status",
    ).not.toBeNull();
    expect(refusalExit, "01-F67(ii): a refusal must not report success").not.toBe(0);
  });

  it("§B4 01-F67 — the refusal REACHED the fatal path rather than escaping it", () => {
    // The mechanism defect, named directly. This is the string Node prints when a rejection was
    // routed nowhere, and it is what the shipped binary prints today. It is deliberately not
    // "does the output contain the words `could not start`": that would pin a message. What it
    // pins is that nothing was left unhandled — the only externally visible difference between
    // "the handler ran" and "the handler was not reachable".
    expect(
      /UnhandledPromiseRejection|Unhandled promise rejection/i.test(refusalOutput),
      "01-F67: the store refusal escaped the boot chain as an unhandled rejection instead of " +
        `reaching the fatal handler. Output:\n${refusalOutput.slice(-2000)}`,
    ).toBe(false);
  });

  it("§B5 01-F64 — the refused launch never becomes a till", () => {
    // The refusal must precede everything a till does. Cheap here, and it is the assertion that
    // stops a "fix" that logs the mismatch and carries on.
    expect(refusalBecameTill, "01-F64: a store bound to another device served a counter").toBe(
      false,
    );
  });

  it("§B6 01-F64/01-F67(i) — the refusal names BOTH identities where a launcher can see it", () => {
    // `01-F64` requires the refusal to name *"both the identity on disk and the identity that
    // asked"*, and `00 §5.7` is why. `01-F67(i)` is about WHERE: an unattended till at 05:00 has
    // nobody to read a dialog, and after `app.exit` the only place the sentence survives is the
    // stream the launcher captured. A dialog is permitted BESIDE this; it cannot replace it, and
    // `01-F67(iii)` forbids it gating the exit.
    //
    // ⚠ This assertion passes today too — the unhandled-rejection warning happens to print the
    // message. It is corroboration, not the verdict; §B2 and §B4 carry that.
    expect(
      refusalOutput,
      "01-F64: the refusal did not name the device the store belongs to",
    ).toContain("00000000-0000-7000-8000-000000000003");
    expect(refusalOutput, "01-F64: the refusal did not name the device that asked").toContain(
      TILL_B,
    );
  });

  it("§B7 01-F67 — the refused launch RAN, rather than failing to start at all", () => {
    // Guards the harness rather than the app: a launch that died on a bad bundle, a missing
    // binary or a refused display would satisfy §B2 and §B3 by never running. Something reaching
    // the launcher's streams is what separates *refused* from *never started*.
    //
    // ⚠ The first draft was `PROCESS_SPOKE.test(out) || out.trim().length > 0`, and the left
    // term was DEAD — the boot line is printed after the store opens, so a correct refusal never
    // reaches it, and the disjunction meant only the right term could ever decide. An assertion
    // with a limb that cannot matter reads far stronger than it is. `PROCESS_SPOKE` is kept as
    // the marker `reachedTill`'s sibling states, and it is asserted where it can bite: §B5 is
    // the "no further" half, and this is the "at all" half.
    expect(
      refusalOutput.trim().length,
      "the refused launch produced no output at all — it did not fail for the reason §B measures",
    ).toBeGreaterThan(0);
    expect(
      PROCESS_SPOKE.test(refusalOutput),
      "01-F64: the refusal came AFTER the boot line, so " +
        "this device opened a store bound to another identity before deciding",
    ).toBe(false);
  });

  afterAll(() => {
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
  });
});
