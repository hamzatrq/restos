// ACCEPTANCE TESTS — THE SEAMS. The hand-written half of `AGENTS.md`'s recurring defect.
//
// > ⚠ THE RECURRING DEFECT OF THIS WAVE: A CORRECT SUBSYSTEM WITH NO SEAM TO THE PRODUCT.
// > THIRTEEN instances and counting … Every one with all gates green — `pnpm verify` exit 0,
// > suites passing, review clean — because tests exercise a module DIRECTLY and nothing asserts
// > the APPLICATION reaches it.
//
// Every other suite in this app constructs its own dependencies, so **all of them stay green if
// `main/index.ts` never calls any of this**. That is precisely the shape `seams:check` cannot
// express here: `createReadyMark` and `passQueue` are reached (Rule A is satisfied), every option
// is supplied (Rule B is satisfied), and the rail's own two blind spots — *a port supplied with a
// STUB* and *a missing PRODUCER for an event type* — are exactly the two ways this app can go
// quiet. So the assertions have to be written by hand, and this file is them.
//
// ⚠ **THESE ARE SOURCE READS AND THAT IS STATED PLAINLY.** `main/index.ts` builds an Electron app
// at module scope and no suite in this package can import it, so the guard on *"does the host call
// the emitter"* is a string match — exactly as it already is for `lines.confirmed` in
// `apps/pos-electron`. `AGENTS.md`'s M10 row is the standing warning about what a source string
// alone is worth: it can be satisfied by a call that is present and wrong. What it CAN do is fail
// when the call is absent, which is the failure mode this wave keeps shipping.

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

describe("§A 03-F16 — the host CONSTRUCTS the producer and the IPC channel REACHES it", () => {
  it("main builds the ready-mark against the real store and the real policy", () => {
    expect(MAIN).toContain("createReadyMark({");
    // The store, not a fixture: a mark built on anything else would append into nothing.
    expect(MAIN).toMatch(/createReadyMark\(\{\s*store,/);
    // `03-F24`'s assignment as a GETTER — a captured value would freeze the device at boot.
    expect(MAIN).toContain("policy: () => readySignal");
  });

  it("the markReady channel calls it — the producer is not merely constructed", () => {
    // The defect this catches is the twelfth instance's shape: producer wired, consumer missing.
    expect(MAIN).toContain("readyMark.mark(parsed.order_id, parsed.line_ids)");
    expect(MAIN).toContain("ipcMain.handle(CHANNELS.markReady");
    // …and the request is PARSED at the plane boundary rather than trusted (`18 §9`).
    expect(MAIN).toContain("MarkReadyRequestSchema.parse(req)");
  });

  it("the append writes a REAL envelope, and it is ATTRIBUTED", () => {
    // ⚠ RETIRED AND REPLACED, August 2026 — this row asserted `actor_user_id: null` and said so
    // deliberately: *"Pinned here so a future session cannot quietly fill it with something
    // plausible."* `03-F53` is that ruling arriving — the pass runs `01-F26`'s PIN session and
    // every edge it writes carries the signed-in user — so the pin is SUPERSEDED, not weakened.
    //
    // It is retired in the same change that lands the FR, which is `AGENTS.md`'s `01-F60` worked
    // example applied on purpose: a green test defending an overruled rule *"would have failed
    // the correct implementation"*, and last time nobody carried the ruling back into the suite
    // for ~3 weeks. The assertion's PURPOSE — the host writes a REAL envelope and the actor field
    // is not left to a future session's judgement — is unchanged and now bites harder.
    //
    // The replacement lives in `pass-identity-seam.test.ts` §B (the host hands the emitter's
    // resolved actor to the append) and in `pass-identity.test.ts` §E (the ledger is read back).
    expect(MAIN).toContain("store.append({");
    expect(
      MAIN.includes("actor_user_id: null"),
      "03-F53: the pass writes an unattributable edge — and since 03-F52 the handover is a " +
        "TERMINAL claim that food reached a customer, which 01-F1 makes permanent",
    ).toBe(false);
    expect(MAIN).toContain("actor_user_id");
  });
});

describe("§A2 the app can START — `screen` is not touched before `app.whenReady()`", () => {
  it("00 §5.7 — the boot reaches `whenReady` BEFORE it reads the display", () => {
    // ⚠ ADDED August 2026 AFTER LAUNCHING THE APP AND WATCHING IT DIE, which is the only
    // instrument that could have found it. At the time this row was written `main/index.ts` read
    // `screen.getPrimaryDisplay()` **158 lines before** its `await app.whenReady()`, and Electron
    // throws `The 'screen' module can't be used before the app 'ready' event` — so `boot()`
    // rejected on every launch, no window was ever created, and the process sat there.
    //
    // Every gate was green while that was true: 134 tests passed, `layout:check` passed (it has
    // its OWN entry point, `src/layout-gate/main.ts`, which correctly does everything inside
    // `app.whenReady().then(...)`), and `seams:check` cannot express "the binary starts".
    // `apps/pos-electron` carries the warning in terms — *"Lazy, because `screen` throws before
    // `app.whenReady()`"* — and boots inside `app.whenReady().then(...)`; this app was written
    // from the same shapes and inherited the reads without the guard.
    //
    // `services/sync-gateway/__acceptance__/startable.test.ts` is the precedent for holding
    // "it starts" as an assertion. That one SPAWNS the declared script; this one cannot, because
    // an Electron launch needs a downloaded runtime, an X server and a native addon built for the
    // Electron ABI — none of which a package suite may require. So it is a source-order read, and
    // that is stated plainly: it can be satisfied by a call that is present and wrong, and what it
    // CAN do is fail when the order is the one that crashed.
    // ⚠ **COMMENT-BLIND, and it was not until the merge that proved it had to be (August 2026).**
    // Both parallel tracks that touched `main/index.ts` fixed this defect, and each left a comment
    // ABOVE the `whenReady()` call explaining it — necessarily naming `screen.getPrimaryDisplay()`
    // to do so. A raw search then finds the EXPLANATION before the guard and fails a file that is
    // correct: measured at the merge, `screen` at char 6975 (a comment) against `whenReady` at
    // 7890 (the call). That is `seams:check` Rule A's own rule one tool over — *a mention is not a
    // use* — and this repo has now paid for it three separate times in one week, twice in greps
    // and once here.
    //
    // Stripping is deliberately crude and that is safe in ONE direction: it can only ever REMOVE
    // text, so a real `screen.` call can never be hidden by it, and the worst case is that this
    // assertion becomes harder to satisfy rather than easier. The tripwire below is what stops it
    // becoming vacuous by stripping everything.
    const code = MAIN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(
      code,
      "the comment stripper emptied the file — every assertion below would pass vacuously",
    ).toContain("app.whenReady()");
    const ready = code.indexOf("app.whenReady()");
    const display = code.search(/\bscreen\.\w/);
    expect(ready, "main never awaits app.whenReady()").toBeGreaterThan(-1);
    if (display === -1) return; // a host that stopped reading `screen` at all is fine.
    expect(
      display,
      "main/index.ts reads `screen` before `app.whenReady()`: Electron throws there, boot() " +
        "rejects, and no window is ever created — every suite stays green because no suite " +
        "launches the app",
    ).toBeGreaterThan(ready);
  });
});

describe("§B 03-F13 — the queue reaches the renderer, on BRANCH time", () => {
  it("main serves the queue from the real store and the real catalog", () => {
    expect(MAIN).toContain("ipcMain.handle(CHANNELS.queue");
    expect(MAIN).toContain("passQueue({");
    // `03-F38` — the short kitchen name, then the display name, then `01-F54`'s identifier.
    expect(MAIN).toContain("store.catalog.lookup(");
    expect(MAIN).toContain("kitchen_name ?? entry?.name ?? item_id");
  });

  it("01-F43 — the age clock is BRANCH time and not this device's raw clock", () => {
    // The whole of standing law 2 on this surface, in one expression: a raw `wallClock.now()` here
    // would make every age on the pass a function of ONE device's clock rather than the branch's.
    //
    // ⚠ **THE FIRST DRAFT OF THIS ASSERTION SURVIVED ITS OWN MUTANT, and the reason is worth more
    // than the row it replaced.** It read `expect(MAIN).toContain("wallClock.now() + store.branch…")`
    // — and that string appears TWICE in this host, on the age clock and on `businessDay`. So the
    // mutant that dropped the offset from the QUEUE's clock left the assertion green, matching the
    // other occurrence. The guard was built correctly and pointed one call site away from the one
    // it existed to hold, which is the round-3 law's shape on a source read.
    //
    // It is anchored on the ARGUMENT NAME now, so the two call sites are distinguishable.
    expect(MAIN).toContain("now: () => wallClock.now() + store.branchTimeStatus().offset_ms");
    // …and the business day takes the same correction, asserted separately for the same reason.
    expect(MAIN).toContain("businessDate(wallClock.now() + store.branchTimeStatus().offset_ms)");
    // No raw device clock reaches either. `01-F45` bans `device_created_at` from a read model and
    // this is the host-side analogue: a bare `Date.now()` on this surface is the same defect.
    expect(MAIN).not.toContain("Date.now()");
  });
});

describe("§C 27-F68 — the density crosses the plane and the renderer applies it", () => {
  it("main resolves it and puts it on the wire", () => {
    // `apps/pos-electron`'s M4 mutation row is the reason this is asserted rather than assumed:
    // dropping this field from the projection leaves the layout gate GREEN, because the gate
    // drives its own preload. Only a hand-written assertion sees it.
    expect(MAIN).toContain("resolvePanelDensity({");
    expect(MAIN).toContain("panelPpi: density.ppi");
    expect(IPC).toContain("panelPpi: z.number().positive()");
  });

  it("the renderer wraps its WHOLE tree in PanelRoot with that value", () => {
    // M1/M2's shape: `PanelRoot` correct and unreached is indistinguishable from `PanelRoot`
    // applying no zoom, and both leave every happy-dom suite green.
    expect(APP).toContain("<PanelRoot panelPpi={state.panelPpi}>");
  });
});

describe("§D commandment 5 — this is an OPERATIONAL screen and the plane is not mixed", () => {
  it("no renderer file reaches the cloud plane", () => {
    // `18 §6` / commandment 5: operational screens are `sync-client` reads and writes only. A
    // `fetch` or a tRPC client here would make the kitchen queue depend on the WAN, which
    // `00 §5.1` forbids outright — and it is the kind of thing that arrives one convenient import
    // at a time, so it is asserted rather than reviewed for.
    for (const [name, source] of [
      ["App.tsx", APP],
      ["PassSurface.tsx", SURFACE],
    ] as const) {
      expect(source, name).not.toContain("fetch(");
      expect(source, name).not.toContain("trpc");
      expect(source, name).not.toContain("@tanstack/react-query");
    }
  });

  it("18 §9 — the bridge has no generic invoke and no channel parameter", () => {
    // "a bridge that can be handed an arbitrary channel name is `ipcRenderer` with extra steps".
    // The ban exists so the set of things this renderer can ask for is auditable by reading one
    // file, and this is the assertion that keeps that true.
    expect(PRELOAD).toContain("contextBridge.exposeInMainWorld");
    expect(PRELOAD).not.toMatch(/invoke:\s*\(channel/);
    const members = [...PRELOAD.matchAll(/ipcRenderer\.invoke\(CHANNELS\.(\w+)/g)].map((m) => m[1]);
    // ⚠ RETIRED AND REPLACED, August 2026 — this read `["passState", "queue", "markReady"]` and
    // `03-F52` adds a FOURTH member: the handover is *"a second, explicit control, separate from
    // DONE"*, so it is a second bridge member and not a flag on the first. The assertion's PURPOSE
    // (`18 §9` — the renderer's reachable surface is auditable by reading one file) is unchanged
    // and only the expected set moved. `handover-seam.test.ts` §C holds the same set from the
    // other side, deliberately: a rule two files assert is a rule neither can quietly drop.
    // ⚠ WIDENED AGAIN, August 2026 — `03-F53` adds `roster` and `unlock`, and the note above
    // applies unchanged: the PURPOSE is that this renderer's reachable surface stays auditable
    // from one file, and only the expected set moved. `pass-identity-seam.test.ts` §C holds the
    // same set from the other side.
    expect(new Set(members)).toEqual(
      new Set(["passState", "queue", "markReady", "handOver", "roster", "unlock"]),
    );
  });
});

describe("§E 03-F24 — the READ-ONLY refusal exists on both sides of the plane", () => {
  it("main decides it and the renderer draws from that decision, not its own", () => {
    // Commandment 8's property — the renderer's claim is never trusted. `ready-mark.ts` re-reads
    // the policy on every call (§B of `ready-mark.test.ts`), and the screen is told rather than
    // deciding: a renderer that computed `maySignal` itself would be a client role claim.
    expect(MAIN).toContain("maySignal: readySignal.maySignal");
    expect(APP).toContain("onBump={state.maySignal ? onBump : null}");
    // `27-F5` — no control at all rather than an inert one.
    //
    // ⚠ WIDENED, August 2026. This pinned the exact expression `onBump === null || !t.bumpable ?
    // null :`, and `03-F52` added a THIRD term to it: a card's controls are also retired while
    // the handover confirm is up, because that confirm covers the ticket grid and a control under
    // a cover is a dead target (`layout:check` calls it COVERED). The assertion's PURPOSE — the
    // renderer renders no control rather than an inert one, on main's decision and not its own —
    // is unchanged, so the two terms it was written for are still each asserted, by name, and a
    // third term cannot silently retire either of them.
    expect(SURFACE).toContain("onBump === null");
    expect(SURFACE).toContain("!t.bumpable");
    expect(SURFACE).toMatch(/onBump=\{[^}]*\?\s*null/);
  });
});

describe("§F 03-F23 — the anti-scope guard, asserted rather than reviewed for", () => {
  it("nothing on this surface sorts, filters or prioritises the queue", () => {
    // > 03-F23 Sequencing is VISIBILITY ONLY. The system never dictates cook order: no
    // > auto-prioritization, no reordering of the queue, no "cook this next" prompts — at any
    // > tier, ever.
    //
    // The corpus's strongest anti-scope statement, and the temptation is real: a red ticket at the
    // bottom of page 2 looks like a bug to a helpful session. It is not. This fails if the
    // renderer ever grows a comparator of its own — the ONE sort in this app is
    // `pass-queue.ts`'s `byConfirmTime`, on the trusted side, where §A of `pass-queue.test.ts`
    // holds it to the confirm stamp.
    expect(SURFACE).not.toContain(".sort(");
    expect(SURFACE).not.toContain(".filter(");
    expect(SURFACE).not.toContain(".reverse(");
  });

  it("03-F32 / 03 §3 — no money and no ETA can reach this screen", () => {
    // Structural rather than a review convention: the wire schema has no money field and no ETA
    // field, so a screen that wanted to draw one would have to change the contract first.
    expect(IPC).not.toContain("paisa");
    expect(IPC).not.toContain("eta");
    expect(SURFACE).not.toContain("MoneyValue");
  });
});
