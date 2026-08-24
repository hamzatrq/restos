// ACCEPTANCE TESTS — `04-F27`: the terminal's write path IS the till's write path.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: written in the session that fixed the
// adversarial review of `04-F21`..`04-F26`, so `20 §4.3`'s author/implementer separation is NOT
// satisfied and the mitigation is the round-3 law alone — every assertion below was killed by a
// mutant that restores the defect it claims to own, and the matrix is in the session report.
//
// THE TWO DEFECTS THIS FILE EXISTS FOR, both measured on this branch before it was written:
//
//   1. A GUARD THE SECOND PRODUCER DID NOT INHERIT. `02-F49`'s confirm boundary had one call site
//      — inside `Gateway.append`, the RENDERER's method — and `createVerifiedAppend` built its own
//      envelope beside it. Driven over one real store, with the real matrix and the real verified
//      appends: the counter refused `(order_id, line_id)` with `02-F49`'s own sentence and the pad
//      landed the identical pair. `order.line_removed` count 1, order total 45000 → 0, Rs 450 of
//      confirmed and cooking food off the bill, permanently (`01-F1`) and with no `01-F30` term
//      that would ever show it.
//
//   2. A CONSEQUENCE THE SECOND PRODUCER DID NOT REACH. Every consequence of a completed append —
//      `03-F2`'s kitchen handoff, `02-F31`'s line advance, the counter's own re-read — lived
//      inside the renderer's IPC handler. `kot.confirmed` had exactly ONE call site, in that
//      handler. So a waiter's SEND appended `order.confirmed` and **no KOT was ever spooled**:
//      the lines were on the bill, the pad said they were with the till, and no station had been
//      told. `04-F24` names that failure and calls the KOT's the one ack that must stay truthful.
//
// THE FRs, quoted so an assertion can be argued with:
//
//   04-F27  every guard the counter's append passes, the terminal's append passes, because there
//           is ONE guarded append and the actor is the only thing its two callers supply
//           differently; and every consequence a completed append has, it has wherever the append
//           came from.
//   02-F49  "line removal pre-confirm is `order.line_removed`; post-confirm it must be
//           `void.recorded` with an approver" — enforced at origination, against this device's own
//           converged fold.
//   04-F24  "a KOT that has not reached the spooler is food that is not being cooked and no screen
//           may imply otherwise."
//   01-F17  a sale is never blocked: the guard refuses a MIS-ROUTED act and nothing else.
//
// ⚠ WHAT THIS SUITE DOES NOT CLAIM. It says nothing about paper: §D asserts that the consequence
// the host wires is REACHED, and `kot-printing.test.ts` owns what the spooler then does. It says
// nothing about a partition either — two tills that have not converged both accept a removal, and
// `line-removal-guard.ts`'s header states that residual rather than hiding it.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPin } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { authorizeTerminal } from "../authorize";
import {
  createGateway,
  createVerifiedAddLine,
  createVerifiedAppend,
  type Gateway,
} from "../gateway";
import { createTerminal, type Terminal } from "../terminal";

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

const WAITER = "00000000-0000-7000-8000-0000000000a1";
const CASHIER = "00000000-0000-7000-8000-0000000000a2";
const PIN = "0451";
const KARAHI = "item-karahi";
const NAAN = "item-naan";
/** `01-F60` — on the menu, with no price for this branch and channel. The opposite of an 86. */
const UNPRICED = "item-unpriced";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Appended = { type: string; payload: Record<string, unknown> };

type Rig = {
  store: DeviceStore;
  gateway: Gateway;
  terminal: Terminal;
  /** Every request `main/index.ts`'s consequence function would have been handed, in order. */
  consequences: Appended[];
  events: () => string[];
};

/**
 * `main/index.ts`'s construction with the Electron parts removed, and NOTHING about the write path
 * doubled: a real SQLite store, real Argon2id hashes, the real matrix through `authorizeTerminal`,
 * and the real verified appends. A double anywhere in that chain would make this a suite about its
 * own fixture (`K-3`'s dead-oracle defect).
 *
 * `onAppended` is the ONE recording seam, and it records rather than simulates: what a consequence
 * then does is the host's business and `kot-printing.test.ts`'s subject.
 */
const rig = async (): Promise<Rig> => {
  const dir = mkdtempSync(join(tmpdir(), "restos-write-path-"));
  dirs.push(dir);
  const identity = {
    org_id: "00000000-0000-7000-8000-000000000001",
    branch_id: "00000000-0000-7000-8000-000000000002",
    device_id: "00000000-0000-7000-8000-000000000003",
  };
  const store = openStore({ path: join(dir, "device.db"), identity });
  const pin_hash = await hashPin(PIN);
  const member = (user_id: string, display_name: string, grid_ordinal: number) => ({
    user_id,
    display_name,
    grid_ordinal,
    status: "active" as const,
    pin_hash,
    assignments: [{ role: "cashier", branch_id: identity.branch_id }],
  });
  store.staff.apply({
    kind: "snapshot",
    version: 1,
    members: [member(WAITER, "Sana", 0), member(CASHIER, "Ayesha", 1)],
  });

  const priceOf = (item_id: string): number | null =>
    item_id === KARAHI ? 45_000 : item_id === NAAN ? 6_000 : null;

  const gateway = createGateway({
    store,
    catalog: (item_id) => ({ name: item_id }),
    menu: () => [
      { id: KARAHI, name: "Chicken Karahi" },
      { id: NAAN, name: "Naan" },
      { id: UNPRICED, name: "Unpriced" },
    ],
    priceOf,
    actor: "dev",
    // The TILL's session is a DIFFERENT person from the waiter throughout, so no assertion here
    // can pass by the two being the same id.
    session: () => ({ user_id: CASHIER, display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-24",
    panelPpi: () => 100,
    panelFit: () => null,
    aging: () => ({ amberAt: 10, redAt: 20 }),
  });

  const consequences: Appended[] = [];
  const terminal = createTerminal({
    verifyWaiter: async (user_id, pin) => {
      const { createPinSession } = await import("@restos/sync-client");
      return createPinSession({
        registry: store.staff,
        device: { device_id: identity.device_id, registered: true },
        idle_lock_ms: 10 * 60_000,
        max_failed_attempts: 5,
        now: () => 1_754_300_000_000,
        audit: () => {},
        attempts: store.pinAttempts,
      }).unlock(user_id, pin);
    },
    authorize: authorizeTerminal({ store }),
    appendAs: createVerifiedAppend({ store }),
    addLineAs: createVerifiedAddLine({ store, priceOf }),
    onAppended: (req) => consequences.push(req as Appended),
    reads: gateway,
    store,
    idle_lock_ms: 10 * 60_000,
    now: () => 1_754_300_000_000,
    newHandle: () => `handle-${Math.random().toString(36).slice(2)}`,
  });

  return {
    store,
    gateway,
    terminal,
    consequences,
    events: () => store.readOwnEvents().map((e) => e.type),
  };
};

const signedIn = async (r: Rig): Promise<string> => {
  const result = await r.terminal.signIn(WAITER, PIN);
  if (!result.ok) throw new Error(`sign-in refused: ${result.reason}`);
  return result.handle;
};

/** A confirmed order carrying one Rs 450 line — the kitchen has the ticket. */
const cookingOrder = async (r: Rig, handle: string): Promise<{ order: string; line: string }> => {
  const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
  if (!opened.ok) throw new Error("the pad could not open a table");
  const order = opened.order_id;
  expect(
    r.terminal.act(handle, { kind: "add_line", order_id: order, item_id: KARAHI, qty: 1 }).ok,
  ).toBe(true);
  expect(r.terminal.act(handle, { kind: "confirm", order_id: order }).ok).toBe(true);
  const row = r.gateway.openOrders().find((o) => o.order_id === order);
  const line = row?.lines[0]?.line_id;
  if (line === undefined) throw new Error("the order the pad just rang holds no line");
  // The fixture is only a fixture if the state it claims is real: this order is CONFIRMED on this
  // device's own converged fold, which is the only thing `02-F49` reads.
  expect(row?.confirmed_at, "the fixture never confirmed the order it is about").toBeTypeOf(
    "number",
  );
  expect(row?.total_paisa).toBe(45_000);
  return { order, line };
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE GUARD, ON BOTH PATHS, WITH THE COUNTER AS THE CONTROL IN THE SAME TEST.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F49/04-F27 — the pad cannot remove a line the counter refuses", () => {
  it("A1 — the identical (order, line) is refused on BOTH paths, and the ledger holds neither", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const { order, line } = await cookingOrder(r, handle);

    // THE CONTROL, in the same test and against the same store: the counter's own path refuses by
    // name. Without it, "the pad refused" could mean the pad is broken rather than guarded.
    let counter: unknown;
    try {
      r.gateway.append({
        type: "order.line_removed",
        payload: { order_id: order, line_id: line },
        refs: [],
      });
    } catch (error) {
      counter = error;
    }
    expect(
      (counter as { removal_after_confirm?: unknown } | undefined)?.removal_after_confirm,
      "the counter stopped refusing post-confirm removals — this test is measuring nothing",
    ).toBeDefined();

    const pad = r.terminal.act(handle, { kind: "remove_line", order_id: order, line_id: line });
    expect(pad.ok, "the pad landed a removal the counter refuses (02-F49)").toBe(false);
    if (pad.ok) return;
    expect(pad.reason).toBe("refused");
    // `02-F49` requires the refusal to carry the way OUT — a `void.recorded` with an approver —
    // and the pad renders the till's own sentence, so the words have to survive the boundary.
    expect(pad.detail ?? "").toMatch(/void|approv/i);

    // The ledger is the claim, not the return value.
    expect(r.events()).not.toContain("order.line_removed");
    expect(r.gateway.openOrders().find((o) => o.order_id === order)?.total_paisa).toBe(45_000);
  });

  it("A2 — the guard is the SAME one, so its refusal is the same FACT on both paths", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const { order, line } = await cookingOrder(r, handle);
    const pad = r.terminal.act(handle, { kind: "remove_line", order_id: order, line_id: line });
    expect(pad.ok).toBe(false);
    if (pad.ok) return;
    // The branch stamp of the confirm anchor is what `02-F49`'s fact carries, and it reaches the
    // tablet inside the sentence. A second guard written for the terminal would have had to
    // reproduce this, which is the duplication `04-F27` forbids.
    const confirmed_at = r.gateway.openOrders().find((o) => o.order_id === order)?.confirmed_at;
    expect(pad.detail ?? "").toContain(String(confirmed_at));
    expect(pad.detail ?? "").toContain(order);
  });

  it("A3 — 01-F17: a PRE-confirm removal from the pad still lands, and so does every other act", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "9" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const order = opened.order_id;
    expect(
      r.terminal.act(handle, { kind: "add_line", order_id: order, item_id: NAAN, qty: 2 }).ok,
    ).toBe(true);
    const line = r.gateway.openOrders().find((o) => o.order_id === order)?.lines[0]?.line_id ?? "";

    // The kitchen has NOT been told, so this is a correction and not a void: it must land.
    const removed = r.terminal.act(handle, { kind: "remove_line", order_id: order, line_id: line });
    expect(removed.ok, "the guard over-fired and refused a pre-confirm correction (01-F17)").toBe(
      true,
    );
    expect(r.events()).toContain("order.line_removed");
    expect(r.gateway.openOrders().find((o) => o.order_id === order)?.total_paisa).toBe(0);
  });

  it("A4 — the actor on the pad's envelope is still the WAITER, not the till's session", async () => {
    // The guard moved into a shared function, and the one thing that function must NOT decide is
    // WHO. `02-F41`: the till's session is Ayesha's throughout this suite.
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "11" });
    expect(opened.ok).toBe(true);
    const actors = r.store.readOwnEvents().map((e) => e.actor_user_id);
    expect(actors).toEqual([WAITER]);
    expect(actors).not.toContain(CASHIER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE STRUCTURE. One guard, one road, and a copy is a red test rather than a silent fork.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 04-F27 — there is ONE guarded append and both callers reach it", () => {
  const gatewaySrc = readSrc("gateway.ts");

  it("B0 — is actually reading the file it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. Anchored on lines that have nothing to do with this work.
    expect(gatewaySrc).toContain("export const createGateway");
    expect(gatewaySrc.length).toBeGreaterThan(20_000);
  });

  it("B1 — `assertRemovableLine` has exactly one call site, and it is the shared append", () => {
    // The FIX for defect 1 could have been a second call inside `createVerifiedAppend`. That closes
    // the instance and leaves the class open: the NEXT guard added to one path would be absent from
    // the other, silently. This is the assertion that makes the copy visible.
    const calls = gatewaySrc.match(/^\s*assertRemovableLine\(/gm) ?? [];
    expect(calls, "02-F49's guard is called from more than one place, or from none").toHaveLength(
      1,
    );
    const shared = gatewaySrc.slice(gatewaySrc.indexOf("const checkedAppend = ("));
    expect(
      shared.slice(0, shared.indexOf("\n};")),
      "the one call site is not on the shared road",
    ).toContain("assertRemovableLine(parsed, store)");
  });

  it("B2 — all FOUR order-event producers delegate, and none builds an envelope of its own", () => {
    // The four are two pairs of twins: `append`/`createVerifiedAppend` and
    // `addLine`/`createVerifiedAddLine`. Each pair differs in exactly one thing — where the actor
    // comes from — and each was a hand-written envelope beside its twin, which is how one pair
    // came to carry `02-F49` and the other not.
    //
    // ⚠ SCOPE, stated: `toggleAvailability` and `recordCustomer` build their own envelopes and are
    // deliberately untouched. They are single-producer acts with no terminal twin, so there is no
    // fork to close — and widening this assertion to "one envelope in the module" would be a claim
    // this work has not earned.
    const bodies: [string, string][] = [
      ["Gateway.append", "  append: (req: unknown): AppendResult =>"],
      ["Gateway.addLine", "  addLine: (req: unknown): AppendResult =>"],
      ["createVerifiedAppend", "export const createVerifiedAppend"],
      ["createVerifiedAddLine", "export const createVerifiedAddLine"],
    ];
    for (const [name, anchor] of bodies) {
      const at = gatewaySrc.indexOf(anchor);
      expect(at, `no ${name} in gateway.ts`).toBeGreaterThan(-1);
      const body = gatewaySrc.slice(at, at + 700);
      expect(body, `${name} does not reach the shared append`).toMatch(
        /checkedApp?end\(|checkedAddLine\(/,
      );
      expect(body, `${name} builds an envelope of its own — the fork 04-F27 forbids`).not.toContain(
        "store.append({",
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE CONSEQUENCES, driven. `04-F24`'s one ack that must stay truthful.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 04-F27/04-F24 — a completed append on the pad causes what one at the counter causes", () => {
  it("C1 — a confirm reaches the consequence seam, naming the order the kitchen must cook", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const { order } = await cookingOrder(r, handle);
    const confirms = r.consequences.filter((c) => c.type === "order.confirmed");
    expect(
      confirms,
      "the pad appended order.confirmed and told nothing on this till — no KOT is spooled (04-F24)",
    ).toHaveLength(1);
    expect(confirms[0]?.payload.order_id).toBe(order);
  });

  it("C2 — every act reaches it, in the order the ledger took them", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    if (!opened.ok) throw new Error("open refused");
    r.terminal.act(handle, { kind: "add_line", order_id: opened.order_id, item_id: NAAN, qty: 1 });
    r.terminal.act(handle, { kind: "confirm", order_id: opened.order_id });
    expect(r.consequences.map((c) => c.type)).toEqual([
      "order.created",
      "order.line_added",
      "order.confirmed",
    ]);
    // The same sequence the store took: a consequence list that drifted from the ledger would be a
    // second reading of what happened (`02-F45`).
    expect(r.events()).toEqual(["order.created", "order.line_added", "order.confirmed"]);
    for (const c of r.consequences) expect(c.payload.order_id).toBe(opened.order_id);
  });

  it("C3 — a REFUSED act causes nothing, because the consequence hangs off a completed append", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const { order, line } = await cookingOrder(r, handle);
    const before = r.consequences.length;
    expect(r.terminal.act(handle, { kind: "remove_line", order_id: order, line_id: line }).ok).toBe(
      false,
    );
    // A consequence that ran before the append — or after a refusal — is a kitchen told about food
    // no store holds (`01-F2`: the ledger is the durable point).
    expect(r.consequences.length).toBe(before);
  });

  it("C4 — an act refused by the GATE causes nothing either", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    expect(r.terminal.act(handle, { kind: "settle", order_id: "x" }).ok).toBe(false);
    expect(r.consequences).toEqual([]);
    expect(r.events()).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE SEAM. `main/index.ts` builds an Electron app at module scope and no suite here can
// import it, so this is a SOURCE READ — the same weak instrument `line-advance-seam.test.ts` §A
// uses, and named as weak rather than dressed up. What makes it more than a string match is that
// the BINDING is read out of the file rather than assumed: the host may name its consequence
// function anything, and what is asserted is that the terminal is handed the SAME one the
// renderer's handler calls.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 04-F27 — the shipped host wires one consequence function to both producers", () => {
  const mainSrc = readSrc("index.ts");

  it("D0 — is actually reading the file it guards", () => {
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc).toContain("createKotPrinter({");
    expect(mainSrc.length).toBeGreaterThan(20_000);
  });

  /** The `createTerminal({ … })` argument block, and nothing else in a 90k-character file. */
  const terminalWiring = (): string => {
    const at = mainSrc.indexOf("createTerminal({");
    // `24-F14`: a slice that missed would make every assertion below vacuous.
    expect(at, "no createTerminal({ … }) construction in main/index.ts").toBeGreaterThan(-1);
    const end = mainSrc.indexOf("\n  });", at);
    expect(end).toBeGreaterThan(at);
    return mainSrc.slice(at, end);
  };

  it("D1 — the terminal is handed a consequence function, and it is the host's own binding", () => {
    const bound = /onAppended:\s*(\w+)\s*,/.exec(terminalWiring())?.[1];
    expect(bound, "the terminal is constructed with no consequence seam").toBeTruthy();
    // A `() => {}` would satisfy a required member and ship nothing — AGENTS.md's "port supplied
    // with a STUB", which `seams:check` cannot see. The binding must be a named function.
    const declaration = new RegExp(`const ${bound as string} = \\(req: unknown\\): void => \\{`);
    expect(mainSrc).toMatch(declaration);
  });

  it("D2 — that same function is what the renderer's own append handler calls", () => {
    const bound = /onAppended:\s*(\w+)\s*,/.exec(terminalWiring())?.[1] as string;
    const at = mainSrc.indexOf("ipcMain.handle(CHANNELS.append,");
    expect(at, "no append handler in main/index.ts").toBeGreaterThan(-1);
    const handler = mainSrc.slice(at, mainSrc.indexOf("\n  });", at));
    expect(
      handler,
      "the renderer's handler no longer calls the same consequence function the pad is handed — two lists of consequences is the fork 04-F27 forbids",
    ).toContain(`${bound}(req);`);
  });

  it("D3 — the consequence function is where the kitchen handoff lives", () => {
    // The load-bearing one: `03-F2`'s fan-out per station. If this moves back inside the handler,
    // the pad stops reaching it and nothing else in this repo notices.
    const bound = /onAppended:\s*(\w+)\s*,/.exec(terminalWiring())?.[1] as string;
    const at = mainSrc.indexOf(`const ${bound} = (req: unknown): void => {`);
    expect(at).toBeGreaterThan(-1);
    const body = mainSrc.slice(at, mainSrc.indexOf("\n  };", at));
    expect(body).toContain("kot.confirmed(order_id)");
    expect(body).toContain("lines.confirmed(order_id)");
    // …and the re-read, so a waiter's order appears on the counter's own screen rather than at the
    // next tick.
    expect(body).toContain("notifyChanged()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `01-F59`/`04-F28`. THE TILL'S OWN ANSWER, which is what makes the pad's client-side gate
// measurable at all: an 86'd item is SELLABLE here, an unpriced one is not, and the two facts
// travel to the tablet separately.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F59/04-F28 — an 86 is not a block, and the pad is told which is which", () => {
  it("E1 — the terminal's menu carries `sold_out` beside the display verdict", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    r.gateway.toggleAvailability({ item_id: KARAHI, available: false });

    const menu = r.terminal.view(handle)?.menu ?? [];
    const karahi = menu.find((m) => m.id === KARAHI);
    const unpriced = menu.find((m) => m.id === UNPRICED);
    // Both are greyed, and ONE boolean cannot tell them apart — which is why the pad read
    // `unavailable` alone and refused a sale `01-F17` says it must never refuse.
    expect(karahi?.unavailable).toBe(true);
    expect(unpriced?.unavailable).toBe(true);
    expect(karahi?.sold_out, "the 86 does not reach the tablet as its own fact").toBe(true);
    expect(unpriced?.sold_out, "an unpriced item is not sold out").toBeUndefined();
  });

  it("E2 — the till ACCEPTS a line for an 86'd item, so refusing it on the pad was self-inflicted", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    if (!opened.ok) throw new Error("open refused");
    r.gateway.toggleAvailability({ item_id: KARAHI, available: false });

    const added = r.terminal.act(handle, {
      kind: "add_line",
      order_id: opened.order_id,
      item_id: KARAHI,
      qty: 1,
    });
    expect(added.ok, "the till refused an 86'd item — 01-F59/02-F31 say it may still be sold").toBe(
      true,
    );
    expect(r.gateway.openOrders().find((o) => o.order_id === opened.order_id)?.total_paisa).toBe(
      45_000,
    );
  });

  it("E3 — and it REFUSES an unpriced one, which is the case the pad may decline in advance", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    if (!opened.ok) throw new Error("open refused");
    const added = r.terminal.act(handle, {
      kind: "add_line",
      order_id: opened.order_id,
      item_id: UNPRICED,
      qty: 1,
    });
    expect(added.ok).toBe(false);
    if (added.ok) return;
    // `01-F60`: no number, no sale, and the refusal names it rather than inventing a price.
    expect(added.reason).toBe("refused");
    expect(r.events()).not.toContain("order.line_added");
  });
});
