// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`. SENIOR REVIEW REQUIRED.**
//
// ⚠ **MUTATION-TESTER-AUTHORED, AND IT EXISTS BECAUSE A STUB SURVIVED 766 TESTS.**
//
// `24 §3` puts the acceptance suite in another session's hands (`storage-adapter.test.ts`,
// `storage-op-sqlite.test.ts`, `storage-contract.ts`); the implementing session added two more
// after its own mutation round. This file makes one assertion none of them makes.
//
// ── THE MEASUREMENT (mutant M6b, 2026-08-13, shipped code otherwise untouched) ──────────────────
//
// `openRnStore` — the ONE door a phone opens a branch slice through — supplies a driver that does
// nothing. It type-checks perfectly:
//
//     createDeviceStore({
//       adapter: {
//         prepare: () => ({ run: () => {}, get: () => undefined, all: () => [] }) as never,
//         exec: () => {}, pragma: () => [], transaction: (fn) => fn, close: () => {},
//       },
//       identity: options.identity,
//     })
//
// Measured: **0 of 766 tests** across `packages/sync-client` (702) and `apps/manager` (64).
//
// This is AGENTS.md's own named blind spot, in the shipped door: *"A PORT SUPPLIED WITH A STUB …
// Rule B asks whether an optional member is SUPPLIED, never whether what was supplied is REAL, and
// a stub is a supply."* `pnpm seams:check` is clean and correct to be clean.
//
// ── WHY THE EXISTING SUITES CANNOT SEE IT ──────────────────────────────────────────────────────
//
// `storage-adapter.test.ts` §D and `storage-op-sqlite.test.ts` §A between them prove the CONTRACT
// has teeth — a stub driver fails ten named checks, and mutating the real op-sqlite driver to be
// inert kills 12. Both run the contract against an adapter the TEST constructs. Neither runs it
// against the adapter the DOOR constructs, and nothing can: `rn.ts` imports
// `@op-engineering/op-sqlite` at module scope, so no test in this repository can load it.
//
// `storage-op-sqlite.test.ts` §C therefore reads `rn.ts` as source — and asserts
// `code.toContain("openRnStore")` and `code.toContain("@op-engineering/op-sqlite")`. Both are
// MENTIONS. M6b leaves both strings in the file (the re-export and the import are untouched) and
// changes only what is handed to `createDeviceStore`. AGENTS.md: *"a MENTION IS NOT A USE — this
// repo has paid for that three times in one week."*
//
// ── WHAT THIS CAN AND CANNOT SEE, STATED PLAINLY ───────────────────────────────────────────────
//
// CAN: that the RN door CALLS the op-sqlite driver factory and CALLS op-sqlite's `open`, rather
// than merely naming them. That is the difference between a supply and a real supply, and it is
// the whole of what source can carry here.
//
// CANNOT: that the driver it calls is correct (that is `storage-op-sqlite.test.ts` §A's contract
// run, and it is thorough), or that any of it works on a phone. **Nothing in this repository loads
// op-sqlite**, and the reason is more specific than "it is a TurboModule": `@op-engineering/
// op-sqlite@17.2.0` DOES publish a `"node"` export condition (`./node/dist/index.js`), and it is
// backed by `better-sqlite3` — but its ESM build imports `./database` without an extension and it
// declares no `better-sqlite3` dependency, so under pnpm it cannot resolve either way. ⚠ **That is
// a hazard as much as a limitation: if a future install ever hoists `better-sqlite3` where
// op-sqlite can see it, a Node test could start passing against op-sqlite's better-sqlite3 shim
// and be quoted as evidence about a phone.** It would be the same SQLite the Electron till already
// uses, wearing the other engine's name. K-8-shaped, hardware not code.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RN_DOOR = new URL("../rn.ts", import.meta.url);

/** Comments stripped before anything is concluded — this file's own subject is what MENTIONS cost. */
const stripComments = (code: string): string => {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const ch = code[i] as string;
    const next = code[i + 1];
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += code[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
};

const door = (): string => {
  const code = stripComments(readFileSync(RN_DOOR, "utf8"));
  // 24-F14: an empty or wrongly-rooted read satisfies every assertion below by not looking.
  expect(code.length).toBeGreaterThan(500);
  expect(code).toContain("openRnStore");
  return code;
};

describe("18 §4 — the RN door SUPPLIES THE REAL DRIVER, not merely a driver", () => {
  it("calls createOpSqliteStorageAdapter — a call, not the re-export that names it", () => {
    // The re-export line (`export { createOpSqliteStorageAdapter, ... }`) and the import both name
    // the symbol, and M6b left both in place. The open parenthesis is the whole assertion.
    const code = door();
    expect(/\bcreateOpSqliteStorageAdapter\s*\(/.test(code)).toBe(true);
  });

  it("calls op-sqlite's own open() — `18 §4`'s 'RN: @op-engineering/op-sqlite'", () => {
    // A driver constructed over anything other than a real op-sqlite handle is not the engine the
    // handbook names, and `05-N5`'s survival across app kill is a claim about a file on the phone.
    const code = door();
    expect(code).toContain('from "@op-engineering/op-sqlite"');
    expect(/\bopen\s*\(/.test(code)).toBe(true);
  });

  it("hands back a DeviceStore and never a database handle (18 §4, 18 §8)", () => {
    // `18 §4`: "Apps NEVER run SQL directly"; `18 §8`: "op-sqlite via `sync-client` only". The door
    // returns the store, so an app cannot hold the engine even if it wanted to.
    const code = door();
    expect(/\bcreateDeviceStore\s*\(/.test(code)).toBe(true);
    expect(code).toContain("): DeviceStore =>");
  });

  it("CONTROL: the Node door is NOT re-exported here — a phone must not reach better-sqlite3", () => {
    // Without this control the three assertions above are equally satisfied by a door that also
    // hands out `openStore`, and `apps/manager` importing that would pull the native addon into a
    // Hermes bundle. Failure would be a bundling error three layers from its cause.
    const code = door();
    expect(code).not.toContain("better-sqlite3");
    expect(/\bopenStore\b/.test(code)).toBe(false);
    expect(/\bcreateNodeStorageAdapter\b/.test(code)).toBe(false);
  });
});
