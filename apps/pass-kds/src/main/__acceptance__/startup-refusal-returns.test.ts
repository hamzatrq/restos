// ACCEPTANCE TESTS — **authored from spec text only** (`24 §3` step 2), by a session that
// implemented NONE of what they require. `main/index.ts` was not touched; every assertion here
// that carries a verdict is currently RED against the shipped binary, on purpose.
//
// PROVENANCE: written from `01-F65`, `01-F67`, `01-F17` and `00 §5.7`, plus the shipped launcher
// `ops/startup/restos-kitchen.bat`.
//
// ── THE DEFECT, AS OBSERVED ────────────────────────────────────────────────────────────────
//
// `main/index.ts`'s `void boot().catch(...)` is correct as far as it goes — it runs, and it
// writes `01-F65`'s refusal to stderr. Then it calls `dialog.showErrorBox`, which is **modal and
// synchronous**, and waits for a click. On a pass screen mounted above a hot line, at 05:00, with
// the branch's power just back, there is nobody to click it. Measured on this binary: the message
// was printed and the process was **still alive when the harness killed it 40 s later.**
//
// That is `01-F67(ii)`: *"terminates the process with a non-zero status"*, and `(iii)`: *"does
// neither of those by waiting for a human"*. `apps/pos-electron` breaks the same FR in the other
// half — its handler is unreachable and never runs at all — which is why the two apps are asserted
// separately rather than one standing in for the other. **A fix to either one is not a fix to
// this**, and the two failures look nothing alike from inside the code.
//
// ── WHY IT LAUNCHES THE BINARY ─────────────────────────────────────────────────────────────
//
// `boot()` runs at module scope, so no suite in this package can import this file — the
// constraint `pass-seam.test.ts` states in its own header, where the answer was a source read.
// A source read cannot see this at all: the `catch` is present, correct, and reads as complete.
// Only a process can answer *"did it come back?"*, and this app has already shipped one silent
// non-start that every gate was green through (`pass-seam.test.ts` §A2 records it).
//
// ── MUTATION MATRIX ────────────────────────────────────────────────────────────────────────
//
// Run OUT OF TREE (a scratchpad copy with `node_modules` symlinked), because this session
// authored the tests and edits no implementation. The CONTROL is one branch: the catch keeps its
// stderr line and drops the modal that was waiting for a click.
//
//   CONTROL (plausible fix)                        5/5 PASS   killed: none
//   IN-TREE, the defect verbatim                   3/5        killed: both `01-F67(ii)` rows
//   P2  it returns promptly and says NOTHING       4/5        killed: the `01-F65` naming row
//   P3  the CONTROL launch cannot boot at all      4/5        killed: the CONTROL row
//   P4  NEGATIVE CONTROL — a real refactor         5/5 PASS   killed: none
//
// **CONTROL 5/5 says a correct implementation is not blocked by anything here**, which matters
// as much as the kills. **P3 is the row that makes the CONTROL worth having**: it fires when the
// binary genuinely cannot start, so the refusal run's silence is attributable to the refusal
// rather than to a broken harness. P4 is what makes every red row mean anything.

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require_ = createRequire(import.meta.url);
const PKG_DIR = resolve(import.meta.dirname, "..", "..", "..");
const MAIN_BUNDLE = join(PKG_DIR, "out", "main", "index.js");
/** `require("electron")` outside an Electron runtime is the path to the binary. */
const ELECTRON = require_("electron") as unknown as string;

/** A prerequisite, not an optional extra — `T-01-07`: fail loudly, never skip. */
const HEADLESS = process.platform === "linux" && !process.env.DISPLAY;

/** `01-F65`'s three keys, for the CONTROL launch. A kitchen device, not the counter's seed. */
const PASS_IDENTITY = {
  RESTOS_ORG_ID: "00000000-0000-7000-8000-000000000001",
  RESTOS_BRANCH_ID: "00000000-0000-7000-8000-000000000002",
  RESTOS_DEVICE_ID: "00000000-0000-7000-8000-00000000000c",
} as const;

/** The pass screen's first boot line (`main/index.ts`'s `process.stdout.write`). */
const PASS_IS_UP = /RestOS pass screen \(03-F13/;

const BOOT_MS = 90_000;
/**
 * The bound that carries the verdict. Not a performance claim: the refusal path opens no store,
 * no window and no socket, so any exit at all is instant. 30 s is chosen to be unarguable —
 * today's binary was alive at 40 s and would have been alive at 40 minutes.
 */
const RETURN_MS = 30_000;

const envFor = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => {
  // STRIPPED, not inherited: an agent shell or a developer running the stack may hold `RESTOS_*`,
  // and a stray `RESTOS_ORG_ID` would turn the refusal launch into an ordinary one — the test
  // would then pass by measuring nothing, which is the failure mode this file exists to avoid.
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("RESTOS_")) delete env[key];
  env.ELECTRON_DISABLE_SANDBOX = "1";
  for (const [key, value] of Object.entries(extra)) env[key] = value;
  return env;
};

interface Launch {
  readonly output: () => string;
  readonly cameUp: () => boolean;
  readonly waitFor: (pattern: RegExp, ms: number) => Promise<boolean>;
  readonly waitForExit: (ms: number) => Promise<number | null>;
  readonly stop: () => Promise<void>;
}

const running: ChildProcess[] = [];

const launch = (userDataDir: string, extraEnv: Record<string, string> = {}): Launch => {
  const appArgs = [MAIN_BUNDLE, `--user-data-dir=${userDataDir}`];
  const cmd = HEADLESS ? "xvfb-run" : ELECTRON;
  const argv: string[] = HEADLESS
    ? ["-a", "--server-args=-screen 0 1366x768x24", ELECTRON, ...appArgs]
    : appArgs;

  // `detached` so the group dies together: SIGKILL to `xvfb-run` alone would orphan the Electron
  // process holding this scenario's store.
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
    cameUp: () => PASS_IS_UP.test(out),
    /**
     * ⚠ **THIS RETURNED `poll(...)` DIRECTLY AND IT WAS A DEFECT IN THE HARNESS**, found by
     * mutating the counter's twin of this file rather than by reading it. The poll gives up
     * early when the process dies — right, or every dead launch costs the full `BOOT_MS` — but
     * its result then answered *"did anything happen"* instead of *"did the pattern appear"*, so
     * a binary that exited instantly was reported as HAVING COME UP. The CONTROL below rests
     * entirely on this call, and a control that cannot fail attributes nothing.
     */
    waitFor: async (pattern, ms) => {
      await poll(() => pattern.test(out) || settled(), ms);
      return pattern.test(out);
    },
    waitForExit: async (ms) => ((await poll(settled, ms)) ? exited : null),
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
          "only instrument that can see a start-up refusal that never returns (01-F67). Install " +
          "xvfb (`apt-get install xvfb`) or run with a display. Not skipped on purpose (T-01-07).",
      );
    }
  }
  // What `pnpm start` does first — otherwise a green run says only that last week's bundle works.
  execFileSync(join(PKG_DIR, "node_modules", ".bin", "electron-vite"), ["build"], {
    cwd: PKG_DIR,
    stdio: "ignore",
  });
  expect(existsSync(MAIN_BUNDLE), `${MAIN_BUNDLE} — the build produced no main bundle`).toBe(true);
}, 300_000);

afterAll(() => {
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

describe("01-F67 — the pass screen's start-time refusal", () => {
  let dir = "";
  let controlCameUp = false;
  let refusalExit: number | null = null;
  let refusalOutput = "";
  let refusalCameUp = false;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "restos-pass-"));
    mkdirSync(join(dir, "configured"));
    mkdirSync(join(dir, "unconfigured"));

    // CONTROL first, and in its own directory: it must be possible for this binary to start at
    // all, or every verdict below is about a broken harness.
    const control = launch(join(dir, "configured"), PASS_IDENTITY);
    controlCameUp = await control.waitFor(PASS_IS_UP, BOOT_MS);
    await control.stop();

    // …then the case `01-F65` refuses: a host that was not told which device it is.
    const refused = launch(join(dir, "unconfigured"));
    refusalExit = await refused.waitForExit(RETURN_MS);
    refusalOutput = refused.output();
    refusalCameUp = refused.cameUp();
    await refused.stop();
  }, 300_000);

  it("CONTROL — with 01-F65's three keys set, the pass screen comes up", () => {
    expect(
      controlCameUp,
      "the configured launch never printed its boot line — nothing below is attributable",
    ).toBe(true);
  });

  it("01-F67(ii) — an unconfigured launch RETURNS to its launcher", () => {
    // THE assertion. `restos-kitchen.bat` loops around this process exactly as the counter's
    // launcher does; a refusal that blocks on a modal box turns "this screen is misconfigured"
    // into "this screen is dead until somebody walks over with a mouse", and the pass screen is
    // the one surface in a `27-F11g` kitchen that nobody is standing in front of.
    expect(
      refusalExit,
      `01-F67(ii): the refused launch was still running after ${RETURN_MS} ms — it printed its ` +
        `refusal and then blocked. Output:\n${refusalOutput.slice(-1500)}`,
    ).not.toBeNull();
  });

  it("01-F67(ii) — and it returns NON-ZERO", () => {
    // A zero exit is indistinguishable from a screen somebody closed at the end of service.
    //
    // The null check is not redundant with the test above it: `expect(null).not.toBe(0)` PASSES,
    // so without this line a process that never returns would satisfy the code assertion
    // vacuously — a guard pointed at nothing, which is the failure this repo's round-3 law names.
    expect(
      refusalExit,
      "01-F67(ii): the refusal never returned, so it has no status",
    ).not.toBeNull();
    expect(refusalExit, "01-F67(ii): a refusal must not report success").not.toBe(0);
  });

  it("01-F67(i)/01-F65 — the refusal names the key an operator must set", () => {
    // `01-F65` requires the refusal to name *"the key an operator must set"*, and `01-F67(i)`
    // decides where: after the process exits, the stream its launcher captured is the only place
    // the sentence still exists. A dialog may accompany it; `01-F67(iii)` forbids it replacing
    // this one or gating the exit.
    //
    // ⚠ Corroboration, not the verdict — this passes today, on the very binary that never
    // returns. It is here so that a fix which exits promptly and silently is still caught.
    expect(refusalOutput, "01-F65: the refusal did not name the key to set").toMatch(
      /RESTOS_ORG_ID/,
    );
  });

  it("01-F65 — a refused launch never becomes a pass screen", () => {
    // The other direction: `01-F65`'s one exemption belongs to the counter, and a pass screen
    // that quietly adopted the counter's dev seed would be two devices under one origin
    // interleaving one lamport sequence (`01-F3`/`01-F8`) — refused, never defaulted.
    expect(
      refusalCameUp,
      "01-F65: an unconfigured pass screen came up anyway — it guessed which device it is",
    ).toBe(false);
  });

  afterAll(() => {
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
  });
});
