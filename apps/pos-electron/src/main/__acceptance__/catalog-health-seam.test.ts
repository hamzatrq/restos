// `01-F56` / `DEC-SYNC-011` (a) / `00 §5.7` — a stuck catalog is visible to the person at the till.
//
// **WHY THIS FILE EXISTS.** `Uplink.catalogRefusal` shipped with T-C6, carried `01-F56`'s refusal
// correctly out of the cloud session, and had **zero consumers**. `catalog-seam.test.ts`'s own
// DEFERRED block named it: *"`DeviceState` has a `blocked` cursor field and no catalog-health
// field, so `DEC-SYNC-011`'s 'observable' holds at the API and nowhere on the counter."* That is
// AGENTS.md's named defect of this wave — a correct subsystem with no seam to the product — in the
// one shape `seams:check` cannot see, because the PRODUCER is wired and the CONSUMER is missing.
//
// So this file asserts TWO SEPARATE CLAIMS, because the wave has repeatedly shipped one without
// the other and a green run on either alone proves nothing:
//
//   1. **The fact travels** — §A/§B, over a real `createGateway` and a real `DeviceStateSchema`
//      parse. A refusal held by the cloud session comes out the other side as words and a number.
//   2. **The shipped application supplies it** — §C, read off the source of `main/index.ts`,
//      because that file imports `electron` and cannot be imported here. `catalogRefusal:
//      () => null` typechecks, satisfies the required dep, keeps `seams:check` clean (Rule B asks
//      whether a member is *supplied*, never whether what was supplied is real) and takes the
//      whole surface off the counter. §C is the only thing in this repo that separates the two.
//
// **The words are the deliverable, not decoration** (§B). `00 §5.7` asks a surface to report what
// is true, and the truth here has to be distinguishable from the truth one element to the left:
// *"this till reached the cloud and refused what came back"* is a different fact from *"this till
// has not heard from the cloud"*, and the second is not a fault at all (`00 §5.1` — offline is the
// normal operating state). `services/api`'s `IntegrationError` is the model: name the dependency,
// say whether this is the till or the world, keep the diagnosis.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAging } from "../../../../pass-kds/src/main/aging";
import { createGateway, type GatewayDeps } from "../gateway";

const IDENTITY = {
  org_id: "00000000-0000-7000-8000-0000000000c1",
  branch_id: "00000000-0000-7000-8000-0000000000c2",
  device_id: "00000000-0000-7000-8000-0000000000c3",
} as const;

let dir: string;
let store: DeviceStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "restos-catalog-health-"));
  store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const gatewayOver = (over: Partial<GatewayDeps> = {}) =>
  createGateway({
    store,
    catalog: () => null,
    menu: () => [],
    priceOf: () => 45_000,
    actor: "Counter 1",
    session: () => null,
    deviceLabel: "Counter 1",
    training: false,
    // Every link HEALTHY on purpose, throughout this file. It is the state that makes the
    // surface necessary: a device that is talking to the cloud perfectly well and refusing what
    // it is sent. A fixture with `cloud: "down"` could not tell this apart from a dead link,
    // which is the exact conflation the whole task exists to prevent.
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "ok" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-08",
    panelPpi: () => 100.5,
    // `27-F11c` — required, so a host that forgets the panel-fit notice is a typecheck
    // error rather than a silent no-op. `null` = this fixture's glass clears the floor.
    // `03-F14`/`03-F47` — REQUIRED on `GatewayDeps` since `03-F25` put aging timers on the
    // counter. The SHIPPED resolver rather than a convenient constant, so a fixture that is not
    // about the thresholds still gets the product's own answers.
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
    ...over,
  });

const src = (file: string): string =>
  readFileSync(new URL(`../${file}`, import.meta.url).pathname, "utf8");

// ── A. the fact travels, and it is a fact of its own ─────────────────────────────────────────

describe("01-F56/DEC-SYNC-011 — a refused catalog crosses the plane boundary", () => {
  it("is null when the catalog is healthy, and that is a real state and not an absence", () => {
    // `27-F16` — the healthy case must reach the screen as a definite "nothing is wrong" so the
    // chip can render nothing. A missing key would be a third state with no meaning.
    expect(gatewayOver().deviceState().catalog).toBeNull();
  });

  it("carries the version this till is ACTUALLY serving, not the one it was offered", () => {
    // `01-F56` is monotonic: the device holds `have_version` and refused whatever came after.
    // The number a manager reads down a phone has to be the one being SOLD FROM — reporting the
    // rejected version would say the menu is current when it is not, which inverts `00 §5.7`.
    const state = gatewayOver({
      catalogRefusal: () => ({ reason: "needs_snapshot", have_version: 4 }),
    }).deviceState();
    expect(state.catalog?.version).toBe(4);
  });

  it("is read on EVERY deviceState(), so a refusal that clears leaves the screen", () => {
    // The getter is not captured when the gateway is built. `01-F56`'s refusal both arrives and
    // clears under a running process (`cloud-session.ts` sets `catalogRefusal = null` the moment
    // an update applies), so a value frozen at construction would leave an amber chip on a till
    // whose menu is current again — a false alarm that never goes, which teaches staff to ignore
    // the strip (`27-F16`'s own argument, one surface along).
    let refusal: { reason: string; have_version: number } | null = {
      reason: "needs_snapshot",
      have_version: 4,
    };
    const gateway = gatewayOver({ catalogRefusal: () => refusal });
    expect(gateway.deviceState().catalog).not.toBeNull();
    refusal = null;
    expect(gateway.deviceState().catalog).toBeNull();
  });

  it("is INDEPENDENT of reachability — a healthy cloud can still be refusing a menu", () => {
    // THE case this surface exists for, and the one a fourth `ConnectionFacts` chip would have
    // reported as fine. Both facts are asserted in one read so they cannot be conflated.
    const state = gatewayOver({
      catalogRefusal: () => ({ reason: "divergent", have_version: 9 }),
    }).deviceState();
    expect(state.cloud).toBe("ok");
    expect(state.catalog).not.toBeNull();
  });

  it("is a DIFFERENT field from DEC-SYNC-011's blocked cursor, not a reuse of it", () => {
    // Both are `DEC-SYNC-011` observability and they are not the same fact: `blocked` is the
    // event catch-up cursor, this is reference data (`01-F52` — the catalog is not ledger and
    // travels its own path). A device can be stuck on either alone.
    const state = gatewayOver({
      catalogRefusal: () => ({ reason: "malformed", have_version: 2 }),
    }).deviceState();
    expect(state.blocked).toBeNull();
    expect(state.catalog).not.toBeNull();
  });

  it("survives the DeviceStateSchema parse the whole read goes through", () => {
    // `deviceState()` is `checked()` against `DeviceStateSchema`, so a shape the schema refuses
    // throws at the boundary rather than blanking the till. A negative version would be one.
    expect(() =>
      gatewayOver({
        catalogRefusal: () => ({ reason: "needs_snapshot", have_version: -1 }),
      }).deviceState(),
    ).toThrow(/device state/);
  });
});

// ── B. the WORDS — `00 §5.7`, and the distinction the strip cannot otherwise make ────────────

describe("00 §5.7 — the message says what happened, in words an operator can relay", () => {
  const messageFor = (reason: string): string => {
    const m = gatewayOver({ catalogRefusal: () => ({ reason, have_version: 4 }) }).deviceState()
      .catalog?.message;
    if (m === undefined) throw new Error(`no message for ${reason}`);
    return m;
  };

  it.each(["needs_snapshot", "no_progress", "malformed", "divergent"])(
    "gives `%s` its own sentence rather than one generic refusal",
    (reason) => {
      const message = messageFor(reason);
      // Not a code. `IntegrationError`'s lesson: `"fetch failed"` was true of nothing an operator
      // could act on, and the fix was a sentence naming the dependency and the state.
      expect(message).not.toContain(reason);
      expect(message.length).toBeGreaterThan(20);
    },
  );

  it("gives FOUR distinct sentences, so the causes are not collapsed into one", () => {
    // The four reasons need different next acts — a snapshot request, a paging failure, damaged
    // bytes, and a genuine divergence between this till and the cloud. Collapsing them is what
    // `IntegrationError`'s `retriable` flag exists to stop one plane over.
    const all = ["needs_snapshot", "no_progress", "malformed", "divergent"].map(messageFor);
    expect(new Set(all).size).toBe(4);
  });

  it.each(["needs_snapshot", "no_progress", "malformed", "divergent"])(
    "`%s` never reads as a connectivity failure — that is the chip next to it",
    (reason) => {
      // **THE DISTINCTION THIS TASK WAS SET TO MAKE.** `Cloud OFF` already says the till has not
      // heard from the cloud, and `00 §5.1` makes that the normal operating state of a Pakistani
      // restaurant rather than a fault. A refusal sentence borrowing that vocabulary would send a
      // manager to check a router while the menu stayed frozen.
      const message = messageFor(reason).toLowerCase();
      for (const word of ["offline", "disconnect", "no connection", "unreachable", "network"]) {
        expect(message, `"${word}" makes a refusal read as a dead link`).not.toContain(word);
      }
    },
  );

  it("names WHO refused — the till or the cloud — in every sentence", () => {
    // `IntegrationError`'s first property: *what failed*. "Something went wrong with the menu"
    // is not actionable; "this till refused the update it was sent" tells the person on the phone
    // which end to look at.
    for (const reason of ["needs_snapshot", "no_progress", "malformed", "divergent"]) {
      const message = messageFor(reason).toLowerCase();
      expect(message.includes("this till") || message.includes("the cloud")).toBe(true);
    }
  });

  it("an UNRECOGNISED reason still raises the chip and still names the code", () => {
    // `sync-client` is a protected path that may gain a refusal reason without telling this file.
    // A `Record` lookup returning `undefined` would drop the whole surface silently on exactly
    // that change — the quiet default this repo has been bitten by. `00 §5.7`: "the till is
    // refusing its menu for a reason this build has no words for" is true and is actionable.
    const state = gatewayOver({
      catalogRefusal: () => ({ reason: "some_future_reason", have_version: 7 }),
    }).deviceState();
    expect(state.catalog).not.toBeNull();
    expect(state.catalog?.message).toContain("some_future_reason");
    expect(state.catalog?.version).toBe(7);
  });
});

// ── C. THE SEAM — the shipped application supplies the real getter ───────────────────────────

describe("the shipped app wires the uplink's refusal into the gateway", () => {
  it("main/index.ts passes uplink.catalogRefusal, not a literal that types the same", () => {
    // **THE ASSERTION `seams:check` CANNOT EXPRESS.** `catalogRefusal` is a REQUIRED member, so
    // Rule B is satisfied by any supply at all — and `() => null` is a supply. This is the
    // "port supplied with a STUB" case AGENTS.md measures as invisible to every rail in the repo.
    //
    // Source-read rather than imported: `main/index.ts` imports `electron` and cannot be loaded
    // in vitest, which is the same constraint `catalog-seam.test.ts` §D works under.
    const mainSrc = src("index.ts");
    expect(
      mainSrc,
      "01-F56 — the counter's catalog health must come from the cloud session, not from a constant",
    ).toMatch(/catalogRefusal:\s*uplink\.catalogRefusal\b/);
    // The stub shapes, refused by name. Each of these compiles and is silent on the counter.
    expect(mainSrc).not.toMatch(/catalogRefusal:\s*\(\)\s*=>\s*null/);
    expect(mainSrc).not.toMatch(/catalogRefusal:\s*\(\)\s*=>\s*undefined/);
  });

  it("main/sync.ts reads the refusal off the cloud session's own status", () => {
    // The producer half. `cloud-session.ts` is where `01-F56`'s refusal is decided; an uplink
    // that computed its own would be a second opinion about a protected path's verdict.
    expect(src("sync.ts")).toMatch(
      /catalogRefusal:\s*\(\)\s*=>\s*session\.status\(\)\.catalog_refusal/,
    );
  });

  it("the OFFLINE uplink reports a healthy catalog, because it has no session to refuse one", () => {
    // `01-F17`/`00 §5.1` — a device with no `RESTOS_CLOUD_URL` is not broken, it is offline, and
    // an amber chip on every such till would be the `ConnectionFacts` mistake repeated: colour
    // spent on the base case until nobody reads it (`27-F16`).
    expect(src("sync.ts")).toMatch(/catalogRefusal:\s*\(\)\s*=>\s*null/);
  });
});

// ── D. the renderer draws it, and draws it on the chrome that never leaves ───────────────────

describe("the fact reaches the screen and not just the seam", () => {
  it("Counter.tsx hands DeviceState.catalog to the shell", () => {
    // The last argument in the chain. Everything above can be correct with this line missing,
    // and then `deviceState()` carries a perfectly good refusal to a renderer that drops it —
    // the same defect one plane further out. `27-F1`: the shell is the only chrome guaranteed to
    // be on every surface, because there is nowhere to navigate.
    expect(src("../renderer/Counter.tsx")).toMatch(/catalog=\{device\.catalog\}/);
  });

  it("the layout gate's fixture RAISES a refusal, so the strip is measured with it up", () => {
    // Blind spot 2 of the layout gate, paid up front: *"it only sees the states the fixture
    // produces"*. `CatalogHealth` renders nothing when the catalog is healthy, so a fixture that
    // did not raise one would measure a strip this element is not in — and chrome is the
    // scarcest budget on this device (`DEC-UI-001`: 51 + 85 + 102 + 528 = 766 in a 768 px panel).
    // This is the assertion that stops `preload.ts` quietly reverting the way
    // `escalationFor: () => null` did for `ManagerApproval`.
    expect(src("../layout-gate/preload.ts")).toMatch(/catalog:\s*\{/);
  });
});
