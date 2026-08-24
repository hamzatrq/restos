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
import { hashPin, newId } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { createAggregatorSettlement } from "../aggregator-settlement";
import { authorizeTerminal, authorizeWrites, TERMINAL_EVENT_TYPES } from "../authorize";
import {
  createCausedAppend,
  createGateway,
  createVerifiedAddLine,
  createVerifiedAppend,
  type Gateway,
} from "../gateway";
import { createLineAdvance } from "../line-advance";
import { voidExitsLine } from "../line-void";
import { refuseDoubleSettlement } from "../settlement-guard";
import { createTerminal, type Terminal } from "../terminal";
import { refuseZeroTender } from "../zero-tender-guard";

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
const rig = async (
  /**
   * `04-F27` (c) — an optional REAL consequence block, built over this rig's own store and
   * gateway exactly as `main/index.ts` builds it. §C records what the seam is handed; §G needs
   * what the seam then APPENDS, and the two questions must not share a fixture: recording
   * unconditionally keeps §C's exact event lists true of a rig that causes nothing.
   */
  hostConsequences?: (deps: {
    store: DeviceStore;
    gateway: Gateway;
  }) => (req: Appended, caused_by: string | null) => void,
): Promise<Rig> => {
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
  const host = hostConsequences?.({ store, gateway });
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
    onAppended: (req, actor_user_id) => {
      consequences.push(req as Appended);
      host?.(req as Appended, actor_user_id);
    },
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

  it("B2 — all FIVE order-event producers delegate, and none builds an envelope of its own", () => {
    // Four are two pairs of twins: `append`/`createVerifiedAppend` and
    // `addLine`/`createVerifiedAddLine`. Each pair differs in exactly one thing — where the actor
    // comes from — and each was a hand-written envelope beside its twin, which is how one pair
    // came to carry `02-F49` and the other not.
    //
    // ⚠ **THE FIFTH IS `createCausedAppend` AND THIS LIST IS WHY IT IS SAFE TO HAVE ADDED ONE.**
    // `04-F27` (c) needed an append whose actor is `string | null`, and a producer added beside
    // the road rather than on it is exactly the fork (a) closed — a fourth-and-a-half envelope,
    // guarded by nothing, reachable from a tablet. It is listed here on the same terms as the
    // other four, so building its own envelope is a red test rather than a silent second road.
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
      ["createCausedAppend", "export const createCausedAppend"],
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
    //
    // `04-F27` (c) — and it must take the ACTOR beside the request. This pinned
    // `(req: unknown): void` until August 2026, when the consequence's own appends were still
    // reading the till's live session: a waiter's SEND wrote an `order.line_state_changed` naming
    // the cashier at the counter, or nobody when it was locked.
    const declaration = new RegExp(
      `const ${bound as string} = \\(req: unknown, caused_by: string \\| null\\): void => \\{`,
    );
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
    ).toContain(`${bound}(req, session()?.user_id ?? null);`);
  });

  it("D3 — the consequence function is where the kitchen handoff lives", () => {
    // The load-bearing one: `03-F2`'s fan-out per station. If this moves back inside the handler,
    // the pad stops reaching it and nothing else in this repo notices.
    const bound = /onAppended:\s*(\w+)\s*,/.exec(terminalWiring())?.[1] as string;
    const at = mainSrc.indexOf(
      `const ${bound} = (req: unknown, caused_by: string | null): void => {`,
    );
    expect(at).toBeGreaterThan(-1);
    const body = mainSrc.slice(at, mainSrc.indexOf("\n  };", at));
    expect(body).toContain("kot.confirmed(order_id)");
    expect(body).toContain("lines.confirmed(order_id, caused_by)");
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE GUARD AUDIT, PER GUARD. `04-F27` (a) says every guard the counter's append passes, the
// terminal's passes; the FIRST review found `assertRemovableLine` with exactly one call site in
// the repo and asked whether a sibling guard was in the same position. Reading the chain is not
// an answer, so every guard on the renderer's road is enumerated from the SHIPPED host and then
// driven on both roads over one store. A guard bearing on an event type the pad cannot express is
// proved UNREACHABLE rather than assumed so — and the chain's own composition is pinned, because
// an audit that silently omits the wrapper added after it was written is the same defect wearing
// the audit's name.
//
// The five guards a renderer append passes, in order, and where each is answered:
//
//   1. the matrix (`authorizeWrites` → `verdictFor`)        F1 (driven, both roads)
//   2. `voidExitsLine`          — `void.recorded` only      F2 (pass-through) + F3 (unreachable)
//   3. `refuseZeroTender`       — `payment.recorded` only   F2 + F3
//   4. `refuseDoubleSettlement` — `payment.recorded` only   F2 + F3
//   5. `checkedAppend` — schema parse · `02-F49` · envelope F4 (schema) · §A/§B · F5 (envelope)
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 04-F27 (a) — every guard on the counter's road, audited against the pad's", () => {
  const mainSrc = readSrc("index.ts");

  /** The shipped chain, rebuilt over one rig's store — the same objects `index.ts` composes. */
  const counterChain = (r: Rig) =>
    authorizeWrites({
      writes: voidExitsLine({
        writes: refuseZeroTender({
          writes: refuseDoubleSettlement({ writes: r.gateway, store: r.store }),
        }),
        store: r.store,
      }),
      store: r.store,
      session: () => ({ user_id: CASHIER, display_name: "Ayesha" }),
      paidOutApprovalThresholdPaisa: 200_000,
    });

  it("F0 — everything the host puts on the renderer's write road is a row in this audit", () => {
    /**
     * The tripwire that makes the rest of §F an audit rather than a snapshot. A fifth thing
     * appearing between the renderer and the ledger is a guard nobody has asked the pad about —
     * `02-F49`'s defect one layer up — so it reddens here and the author has to add a row.
     *
     * **Discovered by DATA FLOW, not by a naming convention**, because a convention is what an
     * audit like this quietly rots behind: the first draft of this assertion matched
     * `refuse*`/`authorize*`/`*Guard*` and **missed `voidExitsLine` entirely** while reporting a
     * confident-looking set of four. Anything that wraps the write surface is handed it as
     * `writes:`, so that is what is swept.
     */
    const consumers = [...mainSrc.matchAll(/(\w+)\(\{\s*writes:|(\w+)\(\{[^})]*\bwrites:/g)]
      .map((m) => (m[1] ?? m[2]) as string)
      .concat(
        // The multi-line constructions, where `writes:` is on its own line under the factory.
        [...mainSrc.matchAll(/(\w+)\(\{\n(?:.*\n)?\s*writes:/g)].map((m) => m[1] as string),
      );
    // `24-F14` — an empty sweep would satisfy any expectation that happened to be empty too.
    expect(consumers.length, "nothing in the host consumes `writes:` at all").toBeGreaterThan(0);
    expect(
      [...new Set(consumers)].sort(),
      "something new was put on the renderer's write road — audit it against the pad's road and add a row to §F",
    ).toEqual(
      [
        // Guards 2–4 of the audit: rows F2 and F3.
        "refuseDoubleSettlement",
        "refuseZeroTender",
        "voidExitsLine",
        // Guard 1: row F1.
        "authorizeWrites",
        // NOT a wrapper — a second CALLER of the guarded surface (`02-F20`'s approved write enters
        // below the matrix and above the money guards, which is `line-void.ts`'s stated reason for
        // its own position). The pad has no escalation path at all: `04-F23` refuses `escalate`
        // with the matrix's own word, so there is nothing here for the audit to compare.
        "authorizeEscalation",
        // NOT a wrapper either — `01-F63`'s closing act is handed the RAW gateway, and the pad
        // cannot reach it (§F3: gate 1 refuses `payment.recorded`, which is its only trigger).
        "createSettlementCloser",
      ].sort(),
    );
  });

  it("F1 — the MATRIX refuses the same person for the same act on both roads", async () => {
    const r = await rig();
    const chain = counterChain(r);
    const handle = await signedIn(r);
    // Both people are cashiers here, so `order.created` is allowed on both roads…
    expect(r.terminal.act(handle, { kind: "open", table_id: "3" }).ok).toBe(true);
    expect(() =>
      chain.append({
        type: "order.created",
        payload: { order_id: newId(), channel: "counter", order_type: "takeaway" },
        refs: [],
      }),
    ).not.toThrow();

    // …and a user the roster does not carry is refused by BOTH, from the same reading: the pad
    // asks `authorizeTerminal` and the counter asks `authorizeWrites`, and both build the subject
    // with `subjectOf` over this store. A divergence here is a second reading of the matrix.
    const stranger = "00000000-0000-7000-8000-00000000dead";
    expect(
      authorizeTerminal({ store: r.store })(stranger, "order.created").ok,
      "the pad's gate 2 admitted a user the registry does not carry",
    ).toBe(false);
    const strangerChain = authorizeWrites({
      writes: r.gateway,
      store: r.store,
      session: () => ({ user_id: stranger, display_name: "?" }),
      paidOutApprovalThresholdPaisa: 200_000,
    });
    expect(() =>
      strangerChain.append({
        type: "order.created",
        payload: { order_id: newId(), channel: "counter", order_type: "takeaway" },
        refs: [],
      }),
    ).toThrow();
  });

  it("F2 — the three money/void wrappers are PASS-THROUGHS for every type the pad can express", async () => {
    /**
     * The audit's real question for guards 2–4: not *"does the pad reach them"* (it does not) but
     * *"do they decide anything about the four types it CAN produce"*. Driven rather than read —
     * each wrapper is handed each terminal event type over a store holding a confirmed, cooking
     * order, and must pass every one of them on unchanged.
     */
    const r = await rig();
    const handle = await signedIn(r);
    const { order, line } = await cookingOrder(r, handle);
    const seen: string[] = [];
    const spy = {
      append: (req: unknown) => {
        seen.push((req as { type: string }).type);
        return { id: "spy" };
      },
      addLine: () => ({ id: "spy" }),
      toggleAvailability: () => ({ id: "spy" }),
      recordCustomer: () => ({ id: "spy" }),
    };
    const wrapped = voidExitsLine({
      writes: refuseZeroTender({
        writes: refuseDoubleSettlement({ writes: spy, store: r.store }),
      }),
      store: r.store,
    });
    for (const type of TERMINAL_EVENT_TYPES) {
      const payload =
        type === "order.created"
          ? { order_id: newId(), channel: "counter", order_type: "takeaway" }
          : type === "order.line_added"
            ? { order_id: order, line_id: newId(), item_id: KARAHI, qty: 1, unit_price_paisa: 1 }
            : type === "order.line_removed"
              ? { order_id: order, line_id: line }
              : { order_id: order };
      expect(
        () => wrapped.append({ type, payload, refs: [] }),
        `a money/void wrapper decided something about ${type} — it is a guard the pad does not pass`,
      ).not.toThrow();
    }
    expect(seen, "a wrapper swallowed a terminal event type").toEqual([...TERMINAL_EVENT_TYPES]);
  });

  it("F3 — and the two types they DO bear on cannot be expressed by the pad at all", async () => {
    // Guards 2–4 are not SKIPPED on the pad's road; they are unreachable, because `04-F23`'s gate
    // 1 refuses their subject types by name. Driven through the real terminal, then asked of the
    // gate directly — including for a person the matrix would allow at the counter, which is the
    // property no matrix cell can state.
    const r = await rig();
    const handle = await signedIn(r);
    for (const kind of ["payment", "payment.recorded", "void", "void.recorded", "settle"]) {
      expect(
        r.terminal.act(handle, { kind, order_id: "x", amount_paisa: 1 }).ok,
        `the pad expressed ${kind}`,
      ).toBe(false);
    }
    expect(r.events(), "an act outside the terminal's surface reached the ledger").toEqual([]);
    const gate = authorizeTerminal({ store: r.store });
    expect(gate(WAITER, "payment.recorded")).toEqual({ ok: false, refusal: "not_a_terminal_act" });
    expect(gate(WAITER, "void.recorded")).toEqual({ ok: false, refusal: "not_a_terminal_act" });
  });

  it("F4 — the SCHEMA parse is applied on both roads", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const chain = counterChain(r);
    // A payload that is not an object at all. `AppendRequestSchema` is the only thing between a
    // producer and `store.append`, and `checkedAppend` runs it for both callers.
    expect(() =>
      chain.append({ type: "order.created", payload: "not-an-object", refs: [] }),
    ).toThrow();
    // The pad cannot even express it — the intent union parses first — and the refusal is kept
    // distinct from a guard's, so the tablet never renders a parse error as a policy refusal.
    const malformed = r.terminal.act(handle, { kind: "open", table_id: 7 });
    expect(malformed.ok).toBe(false);
    if (malformed.ok) return;
    expect(malformed.reason).toBe("malformed");
    expect(r.events()).toEqual([]);
  });

  it("F5 — the ENVELOPE both roads build is identical except for the actor", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const chain = counterChain(r);
    expect(r.terminal.act(handle, { kind: "open", table_id: "12" }).ok).toBe(true);
    chain.append({
      type: "order.created",
      payload: { order_id: newId(), channel: "counter", order_type: "takeaway" },
      refs: [],
    });
    const [pad, counter] = r.store.readOwnEvents();
    expect(pad, "the pad's append never reached the ledger").toBeDefined();
    expect(counter, "the counter's append never reached the ledger").toBeDefined();
    for (const field of ["org_id", "branch_id", "device_id", "schema_version"] as const) {
      expect(
        (pad as unknown as Record<string, unknown>)[field],
        `the two roads stamp different ${field}`,
      ).toEqual((counter as unknown as Record<string, unknown>)[field]);
    }
    // The ONE difference, and `04-F27` says it is the only thing either caller supplies.
    expect(pad?.actor_user_id).toBe(WAITER);
    expect(counter?.actor_user_id).toBe(CASHIER);
  });

  it("F6 — 04-F34: the terminal's table row carries the till's own 02-F55 kitchen state", async () => {
    /**
     * The till's half of `04-F34`. `apps/waiter`'s send-loop suite drives SEND against a fixture
     * carrying this field; without this assertion that fixture would be measuring a wire this
     * product does not ship, which is `K-3`'s dead-oracle defect.
     */
    const r = await rig();
    const handle = await signedIn(r);
    const { order } = await cookingOrder(r, handle);
    // This rig's gateway is built with no `kot` projector, so the field is ABSENT rather than
    // `"none"` — `01-F54`'s distinction between "this host did not say" and a claim.
    const row = r.terminal.view(handle)?.tables.find((t) => t.order_id === order);
    expect(row).toBeDefined();
    expect(
      Object.hasOwn(row as object, "kitchen"),
      "an absent projection was turned into a claim at the terminal's plane boundary",
    ).toBe(false);

    // …and when the host DOES project it, the row carries the till's answer unchanged.
    const projecting = createTerminal({
      verifyWaiter: async () => ({ ok: true }) as never,
      authorize: authorizeTerminal({ store: r.store }),
      appendAs: createVerifiedAppend({ store: r.store }),
      addLineAs: createVerifiedAddLine({ store: r.store, priceOf: () => 1 }),
      onAppended: () => {},
      reads: {
        menu: r.gateway.menu,
        openOrders: () => r.gateway.openOrders().map((o) => ({ ...o, kitchen: "owed" as const })),
      },
      store: r.store,
      idle_lock_ms: 10 * 60_000,
      now: () => 1_754_300_000_000,
      newHandle: () => "projected-handle",
    });
    const signIn = await projecting.signIn(WAITER, PIN);
    expect(signIn.ok).toBe(true);
    if (!signIn.ok) return;
    expect(
      projecting.view(signIn.handle)?.tables.find((t) => t.order_id === order)?.kitchen,
      "the terminal DROPPED 02-F55's kitchen state — SEND cannot tell an unticketed addendum from a sent one",
    ).toBe("owed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — `04-F27` (c): THE ACTOR OF A CONSEQUENCE'S OWN APPEND. Closing (b) routed the pad into the
// host's consequence function, and every append that function makes read the till's LIVE SESSION
// — right while the renderer was the only producer, wrong the moment a tablet could reach it.
// Reproduced on this rig with the real `createLineAdvance` before the fix:
//
//   AYESHA SIGNED IN AT THE TILL — a pad SEND by Sana:
//     order.created            -> SANA(waiter)
//     order.line_added         -> SANA(waiter)
//     order.confirmed          -> SANA(waiter)
//     order.line_state_changed -> AYESHA(cashier at the till)
//   TILL LOCKED — the same act: order.line_state_changed -> null
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 04-F27 (c) — a consequence names the actor of the act that caused it", () => {
  /** `main/index.ts`'s consequence block in shape: the real emitter over the real caused append. */
  const withLineAdvance = (deps: { store: DeviceStore; gateway: Gateway }) => {
    const causedAppend = createCausedAppend({ store: deps.store });
    const lines = createLineAdvance({
      store: deps.store,
      tier: () => "T1",
      serveOwner: () => "settlement",
      append: (caused_by, type, payload) => {
        causedAppend(caused_by, { type, payload, refs: [] });
      },
    });
    return (req: Appended, caused_by: string | null): void => {
      if (req.type === "order.confirmed" && typeof req.payload.order_id === "string") {
        lines.confirmed(req.payload.order_id, caused_by);
      }
    };
  };

  const actorsOf = (r: Rig): Record<string, (string | null)[]> => {
    const byType: Record<string, (string | null)[]> = {};
    for (const e of r.store.readOwnEvents()) {
      const held = byType[e.type] ?? [];
      held.push(e.actor_user_id);
      byType[e.type] = held;
    }
    return byType;
  };

  it("G1 — a pad SEND's line advance names the WAITER, not the cashier standing at the till", async () => {
    const r = await rig(withLineAdvance);
    const handle = await signedIn(r);
    const { order } = await cookingOrder(r, handle);
    const actors = actorsOf(r);
    expect(
      actors["order.line_state_changed"],
      "the pad's confirm caused no line advance — this test is measuring nothing",
    ).toHaveLength(1);
    expect(
      actors["order.line_state_changed"]?.[0],
      "a consequence of the WAITER's act names the cashier at the counter (02-F41, permanent under 01-F1)",
    ).toBe(WAITER);
    expect(actors["order.line_state_changed"]?.[0]).not.toBe(CASHIER);
    // The order itself is untouched: this is an ENVELOPE property and nothing else moved.
    expect(r.gateway.openOrders().find((o) => o.order_id === order)?.total_paisa).toBe(45_000);
  });

  it("G2 — CONTROL: the counter's own road still names the counter's session", async () => {
    // The fix must not change what the renderer's road records. `appended` is handed the actor the
    // handler appended under, which for the counter IS the session — so a mutant that hardcoded
    // the waiter, or passed `null` everywhere, dies here rather than passing G1 by luck.
    const r = await rig();
    const consequence = withLineAdvance({ store: r.store, gateway: r.gateway });
    const order_id = newId();
    r.gateway.append({
      type: "order.created",
      payload: { order_id, channel: "counter", order_type: "takeaway" },
      refs: [],
    });
    r.gateway.addLine({ order_id, item_id: KARAHI, qty: 1 });
    const req = { type: "order.confirmed", payload: { order_id } };
    r.gateway.append({ ...req, refs: [] });
    consequence(req, CASHIER);
    expect(actorsOf(r)["order.line_state_changed"]).toEqual([CASHIER]);
  });

  it("G3 — the print-caused advance names NOBODY, because no person performed it", () => {
    // `02-F31`: *"line statuses auto-advance where no device exists to signal them"*. The actor
    // must not be whoever happens to be signed in when the paper came out — she may have gone home
    // between the confirm and the print, and `01-F1` would keep her name on it for ever.
    const seen: (string | null)[] = [];
    const lines = createLineAdvance({
      store: {
        openOrders: () =>
          [
            {
              order_id: "o1",
              json_lines: JSON.stringify({
                l1: { item_id: "i", qty: 1, unit_price_paisa: 1, states: ["confirmed"] },
              }),
            },
          ] as never,
      } as never,
      tier: () => "T1",
      serveOwner: () => "settlement",
      append: (caused_by) => seen.push(caused_by),
    });
    lines.printEvent("kot.printed", { order_id: "o1" });
    expect(seen, "the KOT advance did not fire — this test is measuring nothing").toHaveLength(1);
    expect(seen[0], "a device fact was attributed to a person").toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §H — `04-F33`: THE PAD MAY ACT ONLY ON AN ORDER ITS OWN VIEW LISTS. `04-F23` bounds this surface
// by EVENT TYPE, and every intent but `open` carries an order id nothing checked. Reproduced with
// `view()` listing NO tables at all:
//
//   PAD VIEW LISTS: []
//   PAD REMOVE ON A COUNTER ORDER: {"ok":true,…}   ORDER TOTAL AFTER: 0
//   PAD CONFIRM ON FOODPANDA ORDER: {"ok":true,…}
//   PAYMENT: actor=null amount_paisa=45000 method=aggregator_receivable purpose=settles_order
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§H 04-F33 — an order the pad cannot see is an order it cannot touch", () => {
  /** A counter order with one Rs 450 line and NO table, so `view()` never lists it. */
  const unseenOrder = (r: Rig, channel = "counter"): { order: string; line: string } => {
    const order = newId();
    r.gateway.append({
      type: "order.created",
      payload: { order_id: order, channel, order_type: "takeaway" },
      refs: [],
    });
    r.gateway.addLine({ order_id: order, item_id: KARAHI, qty: 1 });
    const line = r.gateway.openOrders().find((o) => o.order_id === order)?.lines[0]?.line_id;
    if (line === undefined) throw new Error("the fixture's order holds no line");
    return { order, line };
  };

  it("H1 — it cannot remove a line off an order its view does not list", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const { order, line } = unseenOrder(r);
    expect(
      r.terminal.view(handle)?.tables.map((t) => t.order_id),
      "the fixture's order IS in the pad's view — this test is measuring nothing",
    ).not.toContain(order);

    const removed = r.terminal.act(handle, { kind: "remove_line", order_id: order, line_id: line });
    expect(removed.ok, "the pad took Rs 450 off a bill it cannot see (04-F33)").toBe(false);
    if (removed.ok) return;
    expect(removed.reason).toBe("not_permitted");
    expect(r.events()).not.toContain("order.line_removed");
    expect(r.gateway.openOrders().find((o) => o.order_id === order)?.total_paisa).toBe(45_000);
  });

  it("H2 — it cannot confirm one, so no CONSEQUENCE of one can move money either", async () => {
    /**
     * The sharper half. `04-F23`'s gate 1 refuses `payment.recorded` BY NAME, and a pad confirm on
     * a `foodpanda` order reached one anyway — as `08-F17`'s consequence rather than as an act.
     * The real receivable producer is wired here, so this is about the money and not about a
     * refusal message.
     */
    const settlements: string[] = [];
    const r = await rig(({ store }) => {
      const causedAppend = createCausedAppend({ store });
      const aggregator = createAggregatorSettlement({
        store,
        append: (caused_by, type, payload) => {
          settlements.push(type);
          causedAppend(caused_by, { type, payload, refs: [] });
        },
      });
      return (req, caused_by) => {
        if (req.type === "order.confirmed" && typeof req.payload.order_id === "string") {
          aggregator.confirmed(req.payload.order_id, caused_by);
        }
      };
    });
    const handle = await signedIn(r);
    const { order } = unseenOrder(r, "foodpanda");

    expect(
      r.terminal.act(handle, { kind: "confirm", order_id: order }).ok,
      "the pad confirmed an aggregator order it cannot see (04-F33)",
    ).toBe(false);
    expect(settlements, "a pad intent caused a payment.recorded (04-F23's blast radius)").toEqual(
      [],
    );
    expect(r.events()).not.toContain("payment.recorded");
    expect(r.events()).not.toContain("order.confirmed");
  });

  it("H3 — 01-F17 CONTROL: every act on the pad's OWN table still lands", async () => {
    // The gate must narrow the blast radius and nothing else. An order this pad opened names a
    // table by construction, so it is in the list and the whole loop works.
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "5" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(
      r.terminal.act(handle, { kind: "add_line", order_id: opened.order_id, item_id: NAAN, qty: 2 })
        .ok,
    ).toBe(true);
    const line = r.gateway.openOrders().find((o) => o.order_id === opened.order_id)
      ?.lines[0]?.line_id;
    expect(
      r.terminal.act(handle, {
        kind: "remove_line",
        order_id: opened.order_id,
        line_id: line ?? "",
      }).ok,
    ).toBe(true);
    expect(r.terminal.act(handle, { kind: "confirm", order_id: opened.order_id }).ok).toBe(true);
  });

  it("H4 — the refusal is decided BEFORE the ledger, and leaves nothing behind", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const { order } = unseenOrder(r);
    const before = r.events().length;
    const consequencesBefore = r.consequences.length;
    expect(
      r.terminal.act(handle, { kind: "add_line", order_id: order, item_id: NAAN, qty: 1 }).ok,
    ).toBe(false);
    expect(r.events()).toHaveLength(before);
    expect(r.consequences).toHaveLength(consequencesBefore);
  });
});
