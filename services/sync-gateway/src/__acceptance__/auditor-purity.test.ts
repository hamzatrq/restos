// T-01-11 FIX ROUND oracle — ruling F7: the PURITY PIN
// (plans/wave-0/t-01-11-fix-round.md @ 0a31d57; t-01-11 ruling 2). The
// Auditor's independent refold must use the REAL merge engine WITHOUT dragging
// the better-sqlite3 native addon into the gateway runtime — the pure subpath
// `@restos/sync-client/fold-engine` is the sanctioned door. This suite pins
// that property as a spawned-node IMPORT-GRAPH test, not a source grep:
//
//   pin      — a spawned node (tsx for TS, x10 precedent) with better-sqlite3
//              made UNRESOLVABLE (module-customization hook, purity-hooks.mjs)
//              imports the auditor module and reaches the success marker.
//   control+ — the ROOT specifier `@restos/sync-client` under the SAME block
//              fails on the blocker's own error (the pin is not vacuous: the
//              hook really intercepts the addon).
//   control− — the root specifier WITHOUT the block loads fine (the control's
//              failure is the block, not general breakage).
//
// GREEN at authoring (the shipped auditor already imports the pure subpath) —
// this is the regression pin the round was missing: F4 moves billed_effective
// into the engine, and THIS pin is what keeps that move (and any future
// auditor edit) from reaching for the root entry. The root-specifier lint ban
// is a recorded future arm (fix-round F7), not pinned here.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GATEWAY_CWD = fileURLToPath(new URL("../..", import.meta.url));
const BLOCKER = fileURLToPath(new URL("./purity-block-sqlite.mjs", import.meta.url));
const AUDITOR_ENTRY = fileURLToPath(new URL("./purity-auditor-entry.ts", import.meta.url));
const CONTROL_ENTRY = fileURLToPath(new URL("./purity-control-entry.ts", import.meta.url));

type SpawnResult = { code: number | null; stdout: string; stderr: string };

const runNode = (entry: string, opts: { blocked: boolean }): Promise<SpawnResult> =>
  new Promise((resolve, reject) => {
    const args = opts.blocked
      ? ["--import", "tsx", "--import", BLOCKER, entry]
      : ["--import", "tsx", entry];
    const child = spawn(process.execPath, args, {
      cwd: GATEWAY_CWD,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });

describe("F7 — the auditor module's import graph is better-sqlite3-free (t-01-11 ruling 2 / fix round F7)", () => {
  it("t-01-11 F7 pin: a spawned node with better-sqlite3 UNRESOLVABLE imports the auditor module to the success marker — the pure fold-engine subpath carries the whole refold", async () => {
    const result = await runNode(AUDITOR_ENTRY, { blocked: true });
    expect(result.stderr).not.toContain("better-sqlite3 blocked");
    expect(result.stdout).toContain("AUDITOR_MODULE_LOADED_WITHOUT_SQLITE");
    expect(result.code).toBe(0);
  });

  it("t-01-11 F7 control (+): the ROOT specifier @restos/sync-client under the SAME block dies on the blocker's own error — the hook really intercepts the addon, the pin is not vacuous", async () => {
    const result = await runNode(CONTROL_ENTRY, { blocked: true });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("[t-01-11 F7] better-sqlite3 blocked");
    expect(result.stdout).not.toContain("SYNC_CLIENT_ROOT_LOADED");
  });

  it("t-01-11 F7 control (−): the root specifier WITHOUT the block loads fine — the control's failure above is the block itself, not general breakage", async () => {
    const result = await runNode(CONTROL_ENTRY, { blocked: false });
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("SYNC_CLIENT_ROOT_LOADED");
    expect(result.code).toBe(0);
  });
});
