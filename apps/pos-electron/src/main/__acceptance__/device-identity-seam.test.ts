// THE SEAM for `01-F2`/`01-F13`'s device identity — can the SHIPPED app be told it is a second
// till?
//
// **This file exists because of the wave's named defect in a shape no rail in this repo can see.**
// `pnpm seams:check` walks for an unreached EXPORT (Rule A) and an unsupplied OPTIONAL (Rule B).
// The defect this guards was neither: the whole replication path was reached and supplied — `push`
// / `push_ack` / `event_batch` / `catchup_request` in `packages/sync-protocol`, per-origin ingest
// and a per-org `global_seq` merge in `services/sync-gateway`, a real `createCloudSession` built
// by `main/sync.ts` — and the product still could not run two tills, because the three ids that
// make a device *this* device were a source constant with no environment override, while
// `RESTOS_DEVICE_TOKEN`, the credential minted FOR one of those ids, was configurable. A correct,
// tested subsystem with **no configuration by which the product can enter the state that uses
// it**. Every gate was green and `02-F11` was unreachable from the shipped binary.
//
// So the assertions are about `resolveDeviceIdentity` and about `index.ts` reaching it, and
// nothing else. §C reads source, which is a weak instrument and is used only where nothing better
// exists: `main/index.ts` builds an Electron app at module scope and cannot be imported in a unit
// test — the same constraint `line-advance-seam.test.ts` §A and `print-ack-audit.test.ts` §A work
// under, and the same answer they reached.
//
// PROVENANCE: written alongside the implementation, and owed the same independent oracle pass as
// `orders-seam.test.ts` and `line-advance-seam.test.ts` beside it.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEV_IDENTITY,
  describeDeviceIdentity,
  IDENTITY_ENV,
  resolveDeviceIdentity,
} from "../device-identity";

const SRC = new URL("../", import.meta.url).pathname;
const mainSrc = readFileSync(`${SRC}index.ts`, "utf8");

const TILL_B = "00000000-0000-7000-8000-00000000000b";

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE PRODUCT CAN BE TOLD IT IS A SECOND TILL. This is the whole point of the module.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F2 — a second device_id is reachable from the environment", () => {
  it("takes the device_id from RESTOS_DEVICE_ID and leaves org and branch on the seed", () => {
    // The ordinary two-till case: same org, same branch, a different terminal. If this fails, two
    // Electron instances share one `device_id`, fork one outbox (`01-F8`) and `02-F11` cannot be
    // exercised at all — which is the state this module was written to end.
    const id = resolveDeviceIdentity({ RESTOS_DEVICE_ID: TILL_B });
    expect(id.device_id).toBe(TILL_B);
    expect(id.device_id).not.toBe(DEV_IDENTITY.device_id);
    expect(id.org_id).toBe(DEV_IDENTITY.org_id);
    expect(id.branch_id).toBe(DEV_IDENTITY.branch_id);
  });

  it("takes each of the three ids independently", () => {
    // Each key stands alone: requiring all three would make the ordinary case retype two values
    // it cannot change, and would be a silent trap the first time someone set only one.
    expect(resolveDeviceIdentity({ RESTOS_ORG_ID: "org-x" }).org_id).toBe("org-x");
    expect(resolveDeviceIdentity({ RESTOS_BRANCH_ID: "branch-x" }).branch_id).toBe("branch-x");
    const all = resolveDeviceIdentity({
      RESTOS_ORG_ID: "org-x",
      RESTOS_BRANCH_ID: "branch-x",
      RESTOS_DEVICE_ID: "device-x",
    });
    expect(all).toEqual({ org_id: "org-x", branch_id: "branch-x", device_id: "device-x" });
  });

  it("falls back to the marked DEV SEED when nothing is set", () => {
    // The pre-existing behaviour, unchanged: `pnpm start` with no identity env is the same till it
    // has always been, so a relaunch resumes its own store rather than orphaning it (`01-F13`).
    expect(resolveDeviceIdentity({})).toEqual({ ...DEV_IDENTITY });
  });

  it("does not accept an unrelated RESTOS_* key as an identity", () => {
    // `RESTOS_DEVICE_TOKEN` is the credential, not the identity, and the two were confusable
    // precisely because only one of them was configurable.
    expect(resolveDeviceIdentity({ RESTOS_DEVICE_TOKEN: "eyJ..." })).toEqual({ ...DEV_IDENTITY });
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — A BAD VALUE REFUSES LOUDLY. `01-F1` forbids unwinding a forked ledger, so a typo that
// silently resolved to the seed would be a second `BOOTSTRAP_ORG_ID` — a join key with no error
// message, which is `running-the-stack.md` §0's whole warning.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F8 — a present-but-unusable value refuses rather than falling back", () => {
  for (const [label, raw] of [
    ["empty", ""],
    ["whitespace only", "   "],
    ["a trailing newline (the shape a shell heredoc produces)", `${TILL_B}\n`],
    ["a leading space (the shape a copy-paste produces)", ` ${TILL_B}`],
  ] as const) {
    it(`refuses ${label}, naming the key and never returning the seed`, () => {
      expect(() => resolveDeviceIdentity({ RESTOS_DEVICE_ID: raw })).toThrowError(
        /RESTOS_DEVICE_ID/,
      );
      // The direction matters more than the message: falling back here is the silent failure.
      let fellBack = false;
      try {
        fellBack =
          resolveDeviceIdentity({ RESTOS_DEVICE_ID: raw }).device_id === DEV_IDENTITY.device_id;
      } catch {
        fellBack = false;
      }
      expect(fellBack).toBe(false);
    });
  }

  it("refuses on the org and branch keys too, each naming its own key", () => {
    expect(() => resolveDeviceIdentity({ RESTOS_ORG_ID: " " })).toThrowError(/RESTOS_ORG_ID/);
    expect(() => resolveDeviceIdentity({ RESTOS_BRANCH_ID: "" })).toThrowError(/RESTOS_BRANCH_ID/);
  });

  it("does NOT impose a shape the gateway that admits the device would refuse", () => {
    // `provision-device` takes any non-empty string and `kernel.device_registry` stores `text`, so
    // a UUID check here would refuse credentials that work. Validation is presence, not format.
    expect(resolveDeviceIdentity({ RESTOS_DEVICE_ID: "till-b" }).device_id).toBe("till-b");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE SHIPPED HOST REACHES IT. A resolver nothing calls is the defect it was written to end,
// one argument along.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§C the seam — main/index.ts resolves the identity and opens the store with it", () => {
  it("is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. Anchored on lines that have nothing to do with this work.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc).toContain("createKotPrinter({");
    expect(mainSrc.length).toBeGreaterThan(20_000);
  });

  it("calls resolveDeviceIdentity and passes the RESULT to openStore", () => {
    expect(mainSrc).toContain("resolveDeviceIdentity(process.env)");
    const call = mainSrc.slice(mainSrc.indexOf("openStore({"));
    const args = call.slice(0, call.indexOf("\n  });"));
    expect(args).not.toBe("");
    expect(args).toContain("identity,");
    // The defect verbatim: a host that resolves and then opens the store with the constant anyway.
    expect(args).not.toContain("identity: DEV_IDENTITY");
  });

  it("reads the branch and device from the STORE, so one identity governs the whole process", () => {
    // Two sources for one fact is how a till stamps envelopes as one device and reports itself as
    // another — `strip-attribution.test.ts` is this package's worked example of that shape.
    expect(mainSrc).not.toContain("DEV_IDENTITY.device_id");
    expect(mainSrc).not.toContain("DEV_IDENTITY.branch_id");
    expect(mainSrc).toContain("store.identity.device_id");
    expect(mainSrc).toContain("store.identity.branch_id");
  });

  it("prints the identity at boot, from the store's copy", () => {
    // `00 §5.7`. The three ids must agree with `BOOTSTRAP_ORG_ID` and `ENABLED_BRANCHES` three
    // services away and nothing anywhere checks it, so being wrong looks exactly like being right.
    expect(mainSrc).toContain("describeDeviceIdentity(store.identity, process.env)");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE BOOT LINE SAYS WHICH SOURCE WAS USED.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 00 §5.7 — the boot line distinguishes told from assumed", () => {
  it("names the shared-outbox hazard when nothing is configured", () => {
    const line = describeDeviceIdentity(resolveDeviceIdentity({}), {});
    expect(line).toContain("DEV SEED");
    expect(line).toContain(DEV_IDENTITY.device_id);
    // The consequence, not just the label: two tills launched this way are one origin.
    expect(line).toMatch(/fork/i);
  });

  it("names the keys that were set, and stops calling itself a seed", () => {
    const env = { RESTOS_DEVICE_ID: TILL_B };
    const line = describeDeviceIdentity(resolveDeviceIdentity(env), env);
    expect(line).toContain("RESTOS_DEVICE_ID");
    expect(line).toContain(TILL_B);
    expect(line).not.toContain("DEV SEED");
  });

  it("names the two joins that fail silently three services away", () => {
    const line = describeDeviceIdentity(resolveDeviceIdentity({}), {});
    expect(line).toContain("BOOTSTRAP_ORG_ID");
    expect(line).toContain("ENABLED_BRANCHES");
  });

  it("keeps the env key names and the identity keys in step", () => {
    // `24-F14` empty-match protection: rename a field on `DEV_IDENTITY` and this fails rather than
    // quietly resolving two of three ids.
    expect(Object.keys(IDENTITY_ENV).sort()).toEqual(Object.keys(DEV_IDENTITY).sort());
  });
});
