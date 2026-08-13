// ⚠ **IMPLEMENTER-AUTHORED, and it is here because a MUTATION SURVIVED — not because a plan asked
// for it.** `24 §3` puts the acceptance suites in another session's hands, and
// `storage-adapter.test.ts` is that suite; this file is one assertion it does not make, written
// after measuring that its absence is exploitable.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`. SENIOR REVIEW.**
//
// ── THE MEASUREMENT ────────────────────────────────────────────────────────────────────────────
//
// `storage-adapter.test.ts` §C proves `createNodeStorageAdapter` HONOURS `nativeBinding`: it calls
// the driver directly with a path that does not exist and requires a throw. What no assertion
// covered is that `openStore`'s `{ path }` arm — the door both Electron hosts and 129 call sites
// actually use — FORWARDS it. Measured 2026-08-13: deleting the `nativeBinding:` line from
// `store.ts` leaves **694 of 694 `sync-client` tests green**, `pnpm verify` exit 0 and
// `seams:check` clean, while every Electron till loads the Node-ABI addon and stops booting.
//
// That is this repo's named recurring defect at one layer's remove: the LOGIC is tested and the
// SEAM is not, so mutating the seam changes nothing anywhere. `openStore`'s own comment says the
// two V8 ABIs "genuinely fight over one file; there is no ordering that satisfies both" — the
// option is the whole resolution, and a silently dropped resolution is invisible in Node, which is
// where every suite runs.
//
// It is deliberately the SAME shape as §C's assertion (a path that cannot exist must be LOUD),
// aimed one seam further out. The control below is what stops a door that throws unconditionally
// from passing.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openStore } from "../store.js";

const IDENTITY = {
  org_id: "00000000-0000-7000-8000-000000000001",
  branch_id: "00000000-0000-7000-8000-000000000002",
  device_id: "00000000-0000-7000-8000-000000000003",
};

const tempDir = (): string => mkdtempSync(join(tmpdir(), "restos-open-store-door-"));

describe("18 §4 — openStore's { path } arm forwards nativeBinding to the Node driver", () => {
  it("a nativeBinding that does not exist FAILS through the DOOR, not only through the driver", () => {
    const dir = tempDir();
    try {
      expect(() =>
        openStore({
          path: join(dir, "device.db"),
          identity: IDENTITY,
          nativeBinding: join(dir, "no-such-better_sqlite3.node"),
        }),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("CONTROL: the same door with no nativeBinding opens a real store", () => {
    // Without this, a `path` arm that threw unconditionally would satisfy the assertion above —
    // round-2 pattern 2, "the guard passed by not looking".
    const dir = tempDir();
    try {
      const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
      expect(store.identity.device_id).toBe(IDENTITY.device_id);
      expect(store.readAllEvents()).toEqual([]);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
