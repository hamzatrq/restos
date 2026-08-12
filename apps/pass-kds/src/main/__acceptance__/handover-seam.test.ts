// ACCEPTANCE TESTS — `03-F52`'s SEAMS. Does the SHIPPED app reach the handover emitter, and is
// the assignment declared ONCE?
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author wrote no production code for
// `03-F52`. The contract this file pins is written out at the top of its sibling,
// `handover.test.ts`; nothing is re-stated here that is stated there.
//
// **This file exists because of the wave's named defect**, and for `03-F52` it can take BOTH of the
// shapes `pnpm seams:check` says out loud it cannot see:
//
//   - **a missing PRODUCER for an event type** — `order.line_state_changed` to `served` is a key in
//     an object literal, neither a value export nor an optional seam, which is exactly how
//     `audit.print_acknowledged` sat in the registry with nothing emitting it. `handover.test.ts`
//     proves the emitter builds correct edges and the kernel accepts them; it constructs its own
//     wiring, so **every assertion in it stays green against a host that never calls it** and no
//     ticket ever leaves the pass.
//   - **a port supplied with a STUB** — an `append: () => {}` here is a handover that succeeds,
//     returns `ok`, and writes nothing.
//
// ⚠ **SOURCE READS, STATED PLAINLY.** `main/index.ts` builds an Electron app at module scope and no
// suite in this package can import it, so the guard on *"does the host call the emitter"* is a
// string match — the same constraint and the same answer as `pass-seam.test.ts` beside it.
// `AGENTS.md`'s M10 row is the standing warning about what a source string alone is worth: it can
// be satisfied by a call that is present and wrong. What it CAN do is fail when the call is absent,
// which is the failure mode this wave keeps shipping. The behavioural half lives in
// `handover.test.ts` (main) and `../../renderer/handover-confirm.dom.test.tsx` (the screen).
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ TWO PRE-EXISTING GREEN TESTS ENCODE RULES `03-F52` OVERTURNS. THEY WILL GO RED AND THAT IS
// CORRECT — they are not regressions and they must be RETIRED by the implementing session, in the
// same change, with the reason recorded in place (`AGENTS.md`: *"when a ruling lands, grep the
// suites that encode the old rule the same day"*, and the `catalog-pricing.test.ts:394` worked
// example of what happens when nobody does):
//
//   (1) `apps/pass-kds/src/main/__acceptance__/pass-seam.test.ts` §D — `expect(new Set(members))
//       .toEqual(new Set(["passState", "queue", "markReady"]))`. `03-F52` adds a FOURTH bridge
//       member. The assertion's PURPOSE (`18 §9`: the renderer's reachable surface is auditable by
//       reading one file) survives intact; only the expected set changes.
//
//   (2) `apps/pos-electron/src/main/__acceptance__/line-advance-seam.test.ts` §D — `expect(rig("T2",
//       "dine_in")).toHaveLength(0)`, which asserts the settlement half is TIER-gated. `03-F52`:
//       *"The tier stops being an input."* The replacement lives in
//       `apps/pos-electron/src/main/__acceptance__/serve-signal-settlement.test.ts`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const MAIN = read("../index.ts");
const APP = read("../../renderer/App.tsx");
const SURFACE = read("../../renderer/PassSurface.tsx");
const PRELOAD = read("../../preload/index.ts");
const IPC = read("../../shared/ipc.ts");
const COUNTER_MAIN = read("../../../../pos-electron/src/main/index.ts");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE PRODUCER EXISTS AND THE SHIPPED HOST REACHES IT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F52 — main/index.ts wires the handover", () => {
  it("is actually reading the files it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. Anchored on lines that have nothing to do with this work.
    expect(MAIN).toContain("app.whenReady()");
    expect(MAIN).toContain("createReadyMark({");
    expect(COUNTER_MAIN).toContain("createLineAdvance({");
    expect(MAIN.length).toBeGreaterThan(5_000);
    expect(COUNTER_MAIN.length).toBeGreaterThan(20_000);
  });

  it("constructs the emitter against the real store, the real policy and a REAL append", () => {
    // Sliced to the CONSTRUCTION's own closing line at file indentation, not to the first `});` —
    // the inner `store.append({ … });` closes before the factory call does, and a slice that
    // stopped there would silently measure a third of the argument list (the mistake
    // `line-advance-seam.test.ts` records having made).
    const call = MAIN.slice(MAIN.indexOf("createServeMark({"));
    expect(call).not.toBe("");
    const args = call.slice(0, call.indexOf("\n  });"));
    expect(args).not.toBe("");
    expect(args).toContain("store,");
    // The assignment as a GETTER — a value captured at construction would freeze this device on
    // whatever was set at boot, and `03-F52` calls it *"a single org value read by every surface"*.
    expect(args).toMatch(/policy:\s*\(\)\s*=>/);
    // ⚠ The STUB case, which no rail in this repo can express: `append: () => {}` type-checks,
    // satisfies Rule B, and writes nothing. The ledger call has to be named INSIDE the callback.
    expect(args).toContain("store.append(");
    // `03-F52`'s OWED item (1), pinned so it cannot be quietly filled with something plausible:
    // *"`01-F26`'s PIN session does not run on the pass, so `actor_user_id` is `null` on every edge
    // it writes — an unattributable terminal claim that food reached a customer."*
    expect(args).toContain("actor_user_id: null");
  });

  it("the handOver channel CALLS it — the producer is not merely constructed", () => {
    // The twelfth instance's shape: producer wired, consumer missing.
    expect(MAIN).toContain("ipcMain.handle(CHANNELS.handOver");
    expect(MAIN).toMatch(/serveMark\.handOver\(/);
    // …and the request is PARSED at the plane boundary rather than trusted (`18 §9`).
    expect(MAIN).toContain("HandOverRequestSchema.parse(");
  });

  it("00 §5.7 — the assignment is REPORTED on the boot line, on BOTH surfaces", () => {
    // > where the roster cannot be read the surface REPORTS the assumption on its boot line rather
    // > than presenting it as configured (`00 §5.7`)
    //
    // Both, because `03-F52` moves the till's trigger onto the same key: a counter that auto-serves
    // because it assumed it owns handover, and never says so, is the same invisible-wrong-value
    // this repo already pays `describeHardwareTier` and `describeAging` to prevent.
    expect(MAIN).toContain("describeServeSignal(");
    expect(COUNTER_MAIN).toContain("describeServeSignal(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — ONE DECLARATION. The clause with a measured price attached to getting it wrong.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F52 — one declaration, no per-app fallback", () => {
  it("both surfaces resolve the SAME assignment, out of the shared package", () => {
    // > **One declaration, no per-app fallback.** The assignment is a single org value read by
    // > every surface. Two surfaces each carrying their own default is how a pass screen and a till
    // > come to disagree about who owns handover with every gate green — the failure `01-F60`'s
    // > enabled-set drift already cost this product once.
    //
    // `18 §2` states *"Apps NEVER import … other apps"* as a MUST, so "one declaration" and "read
    // by both apps" together force the declaration into a package; `@restos/device-config` is the
    // one `DEC-ARCH-001` already created for exactly this edge between exactly these two apps.
    for (const [name, source] of [
      ["pass-kds", MAIN],
      ["pos-electron", COUNTER_MAIN],
    ] as const) {
      expect(source, name).toContain("resolveServeSignal(");
      expect(source, name).toContain("@restos/device-config");
    }
  });

  it("neither app DECLARES the owner set, the env key or the resolver a second time", () => {
    // The `01-F60` shape, made checkable: a re-export carries no `=`, a re-declaration does. This
    // is the assertion that fails if a session "helpfully" copies the resolver into the second app
    // rather than importing it — the move that leaves every gate green and lets a pass screen and
    // a till disagree about who owns handover.
    for (const [name, source] of [
      ["pass-kds/main/index.ts", MAIN],
      ["pos-electron/main/index.ts", COUNTER_MAIN],
      ["pass-kds/shared/ipc.ts", IPC],
    ] as const) {
      expect(source, name).not.toMatch(/SERVE_SIGNAL_OWNERS\s*=/);
      expect(source, name).not.toMatch(/SERVE_SIGNAL_OWNER_ENV\s*=/);
      expect(source, name).not.toMatch(/DEFAULT_SERVE_SIGNAL_OWNER\s*=/);
      expect(source, name).not.toMatch(/resolveServeSignal\s*=/);
    }
  });

  it("DEC-HW-003 — the till's settlement trigger no longer branches on the TIER", () => {
    // > **The tier stops being an input.** `02-F31`'s auto-advance ships unchanged in behaviour and
    // > changes its trigger: the till emits on settlement because the branch's serve-signal owner
    // > is `settlement`, not because a label reads `T1`. That is `DEC-HW-003`'s checkable test —
    // > *"no code may branch on the tier to decide whether a piece of hardware EXISTS"* — applied
    // > to the one producer that still failed it.
    //
    // A source read on the MODULE (not the host), sliced to `settled`, because the behavioural
    // proof lives one app over in `serve-signal-settlement.test.ts` and this is the structural
    // half. `printEvent` keeps its tier gate — `kot.printed → in_prep` is `02-F31`'s OTHER half and
    // `03-F52` does not touch it — so the slice matters: an unsliced search would find that one.
    const lineAdvance = read("../../../../pos-electron/src/main/line-advance.ts");
    const settled = lineAdvance.slice(lineAdvance.indexOf("settled: (order_id)"));
    expect(settled).not.toBe("");
    const body = settled.slice(0, settled.indexOf("\n    },"));
    expect(body).not.toBe("");
    expect(body).not.toContain("autoAdvancesLines");
    expect(body).toContain("settlement");
    // …and the OTHER half still is tier-gated, so this is a move and not a deletion.
    const printEvent = lineAdvance.slice(lineAdvance.indexOf("printEvent: (type, payload)"));
    expect(printEvent.slice(0, printEvent.indexOf("\n    },"))).toContain("autoAdvancesLines");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE PLANE BOUNDARY. The renderer is TOLD whether it owns handover; it never decides.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F52 — the refusal exists on both sides of the plane", () => {
  it("18 §9 — the bridge grows exactly one member and no generic invoke", () => {
    // "a bridge that can be handed an arbitrary channel name is `ipcRenderer` with extra steps."
    expect(PRELOAD).not.toMatch(/invoke:\s*\(channel/);
    const members = [...PRELOAD.matchAll(/ipcRenderer\.invoke\(CHANNELS\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(members)).toEqual(new Set(["passState", "queue", "markReady", "handOver"]));
  });

  it("the wire carries the assignment and the per-card eligibility", () => {
    // Commandment 8's property — the renderer's claim is never trusted. `serve-mark.ts` re-reads
    // the policy on every call (`handover.test.ts` §D), and the screen is TOLD: a renderer that
    // computed `mayHandOver` or `handoverable` itself would be a client role claim, and it would
    // be able to disagree with the act main performs.
    expect(IPC).toContain("mayHandOver");
    expect(IPC).toContain("handoverable");
    expect(IPC).toContain("HandOverRequestSchema");
    expect(IPC).toMatch(/handOver:\s*"restos:/);
    expect(MAIN).toMatch(/mayHandOver:/);
    // `03-F52` — *"Surfaces without the assignment are read-only for `served`"*, so the screen must
    // be able to say WHOSE it is, exactly as `readySignalOwner` already lets it.
    expect(IPC).toContain("serveSignalOwner");
  });

  it("the shell hands the control down from main's decision, not from its own", () => {
    expect(APP).toContain("mayHandOver");
    expect(APP).toMatch(/onHandOver=\{/);
    expect(APP).toMatch(/\.handOver\(/);
    // `27-F5` — no control at all rather than an inert one, on both axes: the assignment AND the
    // card's own eligibility. The exact expression is the implementer's; that both terms reach the
    // decision is not.
    expect(SURFACE).toContain("onHandOver");
    expect(SURFACE).toContain("handoverable");
  });

  it("commandment 5 — the handover does not drag the cloud plane onto an operational screen", () => {
    for (const [name, source] of [
      ["App.tsx", APP],
      ["PassSurface.tsx", SURFACE],
    ] as const) {
      expect(source, name).not.toContain("fetch(");
      expect(source, name).not.toContain("trpc");
    }
  });
});
