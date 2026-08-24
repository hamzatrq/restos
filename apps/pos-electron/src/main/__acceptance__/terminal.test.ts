// ACCEPTANCE TESTS — `04-F21`..`04-F26`, the waiter's order pad as a TERMINAL of this till.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: authored and implemented by the same
// session, which `20 §4.3` separates and R66 permits for a v0 gap. This is not a v0 gap, so the
// separation rule stands as written and is NOT satisfied here — the mitigation is the round-3 law
// and nothing else. Every assertion below was mutation-tested against a CONTROL differing in
// exactly one branch, and the matrix is in the session report. Where an assertion could pass
// vacuously it is anchored on something the implementation cannot also supply: §A and §F drive a
// REAL store and read the envelopes back out of it.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   04-F21  the pad is "a remote renderer of a local-plane device … it holds no store, no device
//           identity and no credential beyond a session handle. Every act travels to the till as
//           an intent; the till verifies, authorizes and appends. The envelope's `device_id` is
//           the TILL's; the envelope's `actor_user_id` is the WAITER's."
//   04-F22  three gates: (a) TLS or nothing listens — "absent means OFF, never absent means
//           plaintext"; (b) the tablet proves possession of a key over a single-use server nonce
//           BOUND TO THAT REQUEST'S BODY, never a bearer string; (c) "the person is verified BY
//           THE TILL, and the tablet never names an actor … the tablet receives an opaque handle
//           and never a user id it could edit", against the same durable `01-F61` counter.
//   04-F23  the terminal's event set is CLOSED and narrower than any role's — "it refuses
//           `payment.recorded` for an OWNER" — and BOTH gates must pass.
//   04-F24  the durable point is the till; the pad never acks a KOT it has not sent.
//   04-F25  `table_id` is the operator's label, normalized at the WRITER.
//   02-F41  attribution is whoever's PIN is in, with no "acting for". Two identities, one order.
//   01-F60  price resolves per (branch, channel) with no fallback; the channel is the ORDER's.
//   01-F19  two orders may stand on one table; a fold never picks a winner.
//
// ⚠ WHAT THIS SUITE DOES NOT CLAIM. It says nothing about a browser: `terminal.ts` is the trust
// boundary and `terminal-server.ts` is the wire, and §G drives that wire through its own handler
// rather than over a socket. No tablet has ever connected to this till, and no assertion here may
// be read as evidence that one can. It also says nothing about `04-F22` (a)'s founder call — a
// browser TRUSTING the certificate is the open question, and §G asserts only that no certificate
// means no listener.

import { createHash, generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPin } from "@restos/domain";
import { createOrgIssuer } from "@restos/lan-pki";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { authorizeTerminal } from "../authorize";
import { createGateway, createVerifiedAddLine, createVerifiedAppend } from "../gateway";
import { createTerminal, normalizeTableLabel, type Terminal } from "../terminal";
import { createTerminalServer } from "../terminal-server";

const WAITER = "00000000-0000-7000-8000-0000000000a1";
const CASHIER = "00000000-0000-7000-8000-0000000000a2";
const OWNER = "00000000-0000-7000-8000-0000000000a3";
const KEEPER = "00000000-0000-7000-8000-0000000000a4";
const PIN = "0451";
const NOW = 1_754_300_000_000;
const KARAHI = "item-karahi";
const NAAN = "item-naan";
const UNPRICED = "item-unpriced";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

type Rig = {
  store: DeviceStore;
  terminal: Terminal;
  now: { value: number };
  /** Every envelope this till has appended, read back out of the REAL store. */
  events: () => { type: string; actor_user_id: string | null; payload: Record<string, unknown> }[];
};

/**
 * The rig is `main/index.ts`'s construction with the electron parts removed, and NOTHING about the
 * security model is doubled: a real SQLite store, real Argon2id hashes, the real permission matrix
 * through `authorizeTerminal`, and the real verified appends. A test double anywhere in that chain
 * would be a suite asserting about its own fixture (`K-3`'s dead-oracle defect).
 */
const rig = async (): Promise<Rig> => {
  const dir = mkdtempSync(join(tmpdir(), "restos-terminal-"));
  dirs.push(dir);
  const identity = {
    org_id: "00000000-0000-7000-8000-000000000001",
    branch_id: "00000000-0000-7000-8000-000000000002",
    device_id: "00000000-0000-7000-8000-000000000003",
  };
  const store = openStore({ path: join(dir, "device.db"), identity });
  const pin_hash = await hashPin(PIN);
  const member = (user_id: string, display_name: string, role: string, grid_ordinal: number) => ({
    user_id,
    display_name,
    grid_ordinal,
    status: "active" as const,
    pin_hash,
    assignments: [{ role, branch_id: identity.branch_id }],
  });
  store.staff.apply({
    kind: "snapshot",
    version: 1,
    members: [
      // `04-F23`: build 1 mints NO role. The pad's waiter holds a `cashier` PIN, which is what a
      // restaurant can actually issue today, and the narrowing comes from the TERMINAL.
      member(WAITER, "Sana", "cashier", 0),
      member(CASHIER, "Ayesha", "cashier", 1),
      member(OWNER, "Zeeshan", "owner", 2),
      member(KEEPER, "Imran", "storekeeper", 3),
    ],
  });

  const now = { value: NOW };
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
    // THE TILL'S session, and it is deliberately a DIFFERENT person from the waiter for the whole
    // suite: §A's claim is that the pad's envelope names the waiter while this reads the cashier.
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

  const terminal = createTerminal({
    verifyWaiter: async (user_id, pin) => {
      // The real verifier over the real registry, exactly as the host builds it.
      const { createPinSession } = await import("@restos/sync-client");
      return createPinSession({
        registry: store.staff,
        device: { device_id: identity.device_id, registered: true },
        idle_lock_ms: 10 * 60_000,
        max_failed_attempts: 5,
        now: () => now.value,
        audit: () => {},
        attempts: store.pinAttempts,
      }).unlock(user_id, pin);
    },
    authorize: authorizeTerminal({ store }),
    appendAs: createVerifiedAppend({ store }),
    addLineAs: createVerifiedAddLine({ store, priceOf }),
    reads: gateway,
    store,
    idle_lock_ms: 10 * 60_000,
    now: () => now.value,
    newHandle: () => `handle-${Math.random().toString(36).slice(2)}`,
  });

  return {
    store,
    terminal,
    now,
    events: () =>
      store.readOwnEvents().map((e) => ({
        type: e.type,
        actor_user_id: e.actor_user_id,
        payload: e.payload as Record<string, unknown>,
      })),
  };
};

const signedIn = async (r: Rig, user = WAITER): Promise<string> => {
  const result = await r.terminal.signIn(user, PIN);
  if (!result.ok) throw new Error(`sign-in refused: ${result.reason}`);
  return result.handle;
};

describe("§A 02-F41/04-F21 — the envelope names the WAITER while the till names the cashier", () => {
  it("A1 — every event the pad causes carries the waiter, not the till's live session", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(
      r.terminal.act(handle, {
        kind: "add_line",
        order_id: opened.order_id,
        item_id: KARAHI,
        qty: 1,
      }).ok,
    ).toBe(true);
    expect(r.terminal.act(handle, { kind: "confirm", order_id: opened.order_id }).ok).toBe(true);

    const actors = r.events().map((e) => `${e.type}:${e.actor_user_id}`);
    expect(actors).toEqual([
      `order.created:${WAITER}`,
      `order.line_added:${WAITER}`,
      `order.confirmed:${WAITER}`,
    ]);
    // The CONTROL for that claim: the till's own session is a different person throughout, so a
    // pass here cannot be an accident of both being the same id.
    expect(actors.some((a) => a.includes(CASHIER))).toBe(false);
  });

  it("A2 — the device_id on the pad's envelope is the TILL's (04-F21)", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    r.terminal.act(handle, { kind: "open", table_id: "7" });
    const envelopes = r.store.readOwnEvents();
    expect(envelopes.length).toBe(1);
    expect(envelopes[0]?.device_id).toBe("00000000-0000-7000-8000-000000000003");
    // `01-F62`: a branch-scoped envelope stamped at APPEND by an originating device. The pad is
    // not one and never appears anywhere in it.
    expect(envelopes[0]?.branch_id).toBe("00000000-0000-7000-8000-000000000002");
  });

  it("A3 — a second waiter's act is attributed to HER, not to the first (02-F41, no acting-for)", async () => {
    const r = await rig();
    const one = await signedIn(r, WAITER);
    const two = await signedIn(r, OWNER);
    const a = r.terminal.act(one, { kind: "open", table_id: "7" });
    const b = r.terminal.act(two, { kind: "open", table_id: "9" });
    expect(a.ok && b.ok).toBe(true);
    const created = r.events().filter((e) => e.type === "order.created");
    expect(created.map((e) => e.actor_user_id)).toEqual([WAITER, OWNER]);
  });
});

describe("§B 04-F22 (c) — the tablet never names an actor", () => {
  it("B1 — the view carries a display name and NO user id anywhere in it", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const view = r.terminal.view(handle);
    expect(view?.waiter).toBe("Sana");
    // The whole response body, not just the field we remembered to check: a user id reaching the
    // tablet through ANY field is the thing `04-F22` (c) forbids.
    expect(JSON.stringify(view)).not.toContain(WAITER);
  });

  it("B2 — an act with no handle appends nothing and says only 'not signed in'", async () => {
    const r = await rig();
    const result = r.terminal.act(undefined, { kind: "open", table_id: "7" });
    expect(result).toEqual({ ok: false, reason: "not_signed_in" });
    expect(r.events()).toEqual([]);
  });

  it("B3 — a guessed handle is refused, and a wrong PIN yields no handle at all", async () => {
    const r = await rig();
    expect(r.terminal.act("handle-guessed", { kind: "open", table_id: "7" }).ok).toBe(false);
    const refused = await r.terminal.signIn(WAITER, "9999");
    expect(refused).toEqual({ ok: false, reason: "bad_pin" });
    expect(r.events()).toEqual([]);
  });

  it("B4 — 01-F26's idle lock retires the handle, and the pad appends nothing after it", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    expect(r.terminal.view(handle)).not.toBeNull();
    r.now.value += 10 * 60_000;
    expect(r.terminal.view(handle)).toBeNull();
    expect(r.terminal.act(handle, { kind: "open", table_id: "7" }).ok).toBe(false);
    expect(r.events()).toEqual([]);
  });

  it("B5 — 01-F61's DURABLE counter is the till's own, shared with the counter's unlock gate", async () => {
    const r = await rig();
    // Five failures at the pad. The counter is `store.pinAttempts`, so this is the SAME per-(device,
    // user) counter the cashier's unlock gate charges — a pad with its own would be an unmetered
    // place to guess a colleague's PIN.
    for (let i = 0; i < 5; i += 1) await r.terminal.signIn(WAITER, "9999");
    const after = await r.terminal.signIn(WAITER, PIN);
    expect(after).toEqual({ ok: false, reason: "locked_out" });
    // Read off the store, not off the session object: the durability claim is about what persists.
    expect(
      r.store.pinAttempts.read("00000000-0000-7000-8000-000000000003", WAITER).failures,
    ).toBeGreaterThanOrEqual(5);
  });

  it("B6 — a malformed sign-in is refused WITHOUT charging 01-F61's counter", async () => {
    const r = await rig();
    await r.terminal.signIn(WAITER, "");
    await r.terminal.signIn(undefined, PIN);
    // Otherwise anyone on the shop Wi-Fi locks a waiter out by posting nonsense in her name.
    expect(r.store.pinAttempts.read("00000000-0000-7000-8000-000000000003", WAITER).failures).toBe(
      0,
    );
    expect((await r.terminal.signIn(WAITER, PIN)).ok).toBe(true);
  });
});

describe("§C 04-F23 — the CLOSED event set, and it binds an owner too", () => {
  it("C1 — the pad cannot settle, and the refusal is the SURFACE's, not the matrix's", async () => {
    const r = await rig();
    const handle = await signedIn(r, OWNER);
    // An owner holds the settle action at the counter. The terminal refuses it anyway — this is
    // the property no matrix cell can state, and it is the whole of `04-F23`'s ruling.
    for (const kind of ["settle", "pay", "void", "cash_count"]) {
      expect(r.terminal.act(handle, { kind, order_id: "x" })).toEqual({
        ok: false,
        reason: "malformed",
      });
    }
    expect(r.events()).toEqual([]);
  });

  it("C2 — the AUTHORIZATION gate refuses a non-terminal event type by name", async () => {
    const r = await rig();
    const gate = authorizeTerminal({ store: r.store });
    for (const type of ["payment.recorded", "cash.paid_out", "day.opened", "void.recorded"]) {
      expect(gate(OWNER, type)).toEqual({ ok: false, refusal: "not_a_terminal_act" });
    }
    // And the four it does admit, for a person who holds `order.create`.
    for (const type of [
      "order.created",
      "order.line_added",
      "order.line_removed",
      "order.confirmed",
    ]) {
      expect(gate(OWNER, type).ok).toBe(true);
    }
  });

  it("C3 — gate 2 refuses a storekeeper, whom Appendix A denies `order.create`", async () => {
    const r = await rig();
    const handle = await signedIn(r, KEEPER);
    expect(r.terminal.act(handle, { kind: "open", table_id: "7" })).toEqual({
      ok: false,
      reason: "not_permitted",
    });
    expect(r.events()).toEqual([]);
  });

  it("C4 — a member 01-F42 revokes BETWEEN sign-in and act is refused (the subject is re-read)", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    // She held a handle a moment ago. The roster is the authority at the moment of the act, which
    // is why the subject is rebuilt per request rather than captured at sign-in.
    r.store.staff.apply({ kind: "snapshot", version: 2, members: [] });
    expect(r.terminal.act(handle, { kind: "open", table_id: "7" })).toEqual({
      ok: false,
      reason: "not_permitted",
    });
    expect(r.events()).toEqual([]);
  });
});

describe("§D 02-F1/01-F60 — the money axes are the TILL's, never the tablet's", () => {
  it("D1 — a tablet supplying its own channel and order type is ignored", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, {
      kind: "open",
      table_id: "7",
      // `01-F60` makes the channel a PRICE KEY, so this is an attempt to ring at another
      // channel's prices. The intent schema does not carry it and the till supplies its own.
      channel: "foodpanda",
      order_type: "delivery",
    });
    expect(opened.ok).toBe(true);
    const created = r.events().find((e) => e.type === "order.created");
    expect(created?.payload.channel).toBe("counter");
    expect(created?.payload.order_type).toBe("dine_in");
  });

  it("D2 — the price is the gateway's own resolution, and an unpriced item is refused", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    if (!opened.ok) throw new Error("open refused");
    r.terminal.act(handle, {
      kind: "add_line",
      order_id: opened.order_id,
      item_id: KARAHI,
      qty: 2,
    });
    const line = r.events().find((e) => e.type === "order.line_added");
    // `01-F53` — snapshotted at line-add. The number is the catalog's, never the tablet's.
    expect(line?.payload.unit_price_paisa).toBe(45_000);
    expect(line?.payload.qty).toBe(2);

    const refused = r.terminal.act(handle, {
      kind: "add_line",
      order_id: opened.order_id,
      item_id: UNPRICED,
      qty: 1,
    });
    // `01-F60`: refusing is better than inventing a number. `01-F17` is intact — the ORDER is not
    // blocked, this one item is.
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe("refused");
    expect(r.events().filter((e) => e.type === "order.line_added").length).toBe(1);
  });

  it("D3 — a tablet cannot supply a unit price at all", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    if (!opened.ok) throw new Error("open refused");
    r.terminal.act(handle, {
      kind: "add_line",
      order_id: opened.order_id,
      item_id: NAAN,
      qty: 1,
      unit_price_paisa: 1,
    });
    expect(r.events().find((e) => e.type === "order.line_added")?.payload.unit_price_paisa).toBe(
      6_000,
    );
  });

  it("D4 — a line against an order this till does not hold is refused, not orphaned (01-F1)", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const result = r.terminal.act(handle, {
      kind: "add_line",
      order_id: "00000000-0000-7000-8000-00000000dead",
      item_id: NAAN,
      qty: 1,
    });
    expect(result.ok).toBe(false);
    expect(r.events()).toEqual([]);
  });
});

describe("§E 04-F25 — the table label, normalized at the writer", () => {
  it("E1 — surrounding and inner whitespace collapse; case is NOT folded", () => {
    expect(normalizeTableLabel("  7 ")).toBe("7");
    expect(normalizeTableLabel("Roof  3")).toBe("Roof 3");
    expect(normalizeTableLabel("\tRoof\n3  ")).toBe("Roof 3");
    // Commandment 7 — user content renders faithfully. `04-F25` states the cost of not folding.
    expect(normalizeTableLabel("roof 3")).toBe("roof 3");
    // Commandment 7 again, and it is asserted rather than hoped: an Urdu label survives intact.
    expect(normalizeTableLabel("  چھت  ٣ ")).toBe("چھت ٣");
  });

  it("E2 — a label that is not a label is refused before the ledger (01-F1)", async () => {
    expect(normalizeTableLabel("")).toBeNull();
    expect(normalizeTableLabel("   ")).toBeNull();
    expect(normalizeTableLabel(7)).toBeNull();
    const r = await rig();
    const handle = await signedIn(r);
    expect(r.terminal.act(handle, { kind: "open", table_id: "   " })).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(r.events()).toEqual([]);
  });

  it("E3 — the normalized label is what reaches the ledger", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    r.terminal.act(handle, { kind: "open", table_id: " Roof   3 " });
    expect(r.events()[0]?.payload.table_id).toBe("Roof 3");
  });
});

describe("§F 04-F12 — the pad reads the till's own projection, tables and all", () => {
  it("F1 — an opened table appears with the fold's own total, and a counter order does not", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    if (!opened.ok) throw new Error("open refused");
    r.terminal.act(handle, {
      kind: "add_line",
      order_id: opened.order_id,
      item_id: KARAHI,
      qty: 1,
    });
    r.terminal.act(handle, { kind: "add_line", order_id: opened.order_id, item_id: NAAN, qty: 2 });

    const view = r.terminal.view(handle);
    expect(view?.tables.length).toBe(1);
    const table = view?.tables[0];
    expect(table?.table_ids).toEqual(["7"]);
    expect(table?.lines).toBe(2);
    // 45,000 + 2 x 6,000 — the ENGINE's number, carried through. A pad that summed its own lines
    // would be a second implementation of a figure the receipt also renders (`26 §8`).
    expect(table?.total_paisa).toBe(57_000);
    expect(table?.confirmed).toBe(false);
    expect(table?.conflict).toBe(false);
  });

  it("F2 — confirm is visible to the pad, so SEND can say what it will do (02-F8)", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const opened = r.terminal.act(handle, { kind: "open", table_id: "7" });
    if (!opened.ok) throw new Error("open refused");
    r.terminal.act(handle, { kind: "add_line", order_id: opened.order_id, item_id: NAAN, qty: 1 });
    expect(r.terminal.view(handle)?.tables[0]?.confirmed).toBe(false);
    r.terminal.act(handle, { kind: "confirm", order_id: opened.order_id });
    expect(r.terminal.view(handle)?.tables[0]?.confirmed).toBe(true);
  });

  it("F3 — the menu the pad is offered is the TERMINAL's channel, so a greyed tile is one the append would refuse", async () => {
    const r = await rig();
    const handle = await signedIn(r);
    const view = r.terminal.view(handle);
    const unpriced = view?.menu.find((m) => m.id === UNPRICED);
    // `menu()`'s own rule: the grid must ask the question `addLine` will ask, or it offers a tile
    // the append then refuses. `01-F60` — unpriced is greyed for its OWN reason, not as an 86.
    expect(unpriced?.unavailable).toBe(true);
    expect(unpriced?.sold_out ?? false).toBe(false);
    expect(view?.menu.find((m) => m.id === KARAHI)?.unavailable ?? false).toBe(false);
  });

  it("F4 — an unauthenticated caller reads nothing at all", async () => {
    const r = await rig();
    await signedIn(r);
    expect(r.terminal.view("nope")).toBeNull();
    expect(r.terminal.view(undefined)).toBeNull();
  });
});

describe("§G 04-F22 (a) — no certificate, no listener", () => {
  it("G1 — a till with no TLS material binds NOTHING and says why", () => {
    let logged = "";
    const server = createTerminalServer({
      terminal: {} as Terminal,
      tls: null,
      port: 0,
      bundleDir: null,
      now: () => NOW,
      log: (line) => {
        logged = line;
      },
    });
    expect(server.listening).toBe(false);
    // "absent means OFF, never absent means plaintext" — the failure direction is the assertion.
    expect(server.reason).toContain("no terminal certificate");
    expect(logged).toContain("04-F22");
    expect(server.enrolments()).toEqual([]);
  });

  it("G2 — an unlistening server still refuses to admit anything", () => {
    const server = createTerminalServer({
      terminal: {} as Terminal,
      tls: null,
      port: 0,
      bundleDir: null,
      now: () => NOW,
      log: () => {},
    });
    expect(server.revoke("anything")).toBe(false);
  });
});

describe("§H the SEAM — the shipped host reaches all of this, or none of it matters", () => {
  // `L7`/`L8`: for this class of defect a passing suite proves nothing, and the grep for the
  // production caller is the closing evidence. `main/index.ts` builds an Electron app at module
  // scope, so no suite here can import it — this is a SOURCE READ, the same weak instrument
  // `line-advance-seam.test.ts` §A and `double-settlement.test.ts` M1 already use, and it is named
  // as weak rather than dressed up. Comments are stripped first (`L5`: a mention is not a use).
  const host = (): string =>
    readFileSync(new URL("../index.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

  /**
   * ⚠ **THE TERMINAL'S OWN WIRING BLOCK, AND THE NARROWING IS THE ASSERTION.**
   *
   * The first draft of §H2 read the WHOLE file for `appendAs: createVerifiedAppend(`. It passed
   * under the mutant that points the terminal's `appendAs` at the session-reading gateway —
   * because `recordApprovals` twenty lines up wires an IDENTICAL line for `05-F29`'s grant, and a
   * file-wide `toMatch` cannot tell the two apart. That is the round-3 law's shape on this
   * session's own work: the mechanism was built correctly and aimed one call site away. Reading
   * the suite did not find it; running the mutant did.
   */
  const terminalWiring = (): string => {
    const source = host();
    const start = source.indexOf("createTerminal({");
    const end = source.indexOf("createTerminalServer({");
    // `24-F14` — if the block cannot be located the assertions below would pass against an empty
    // string, so this fails loudly instead.
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("the host no longer contains a createTerminal wiring block to read");
    }
    return source.slice(start, end);
  };

  it("H1 — the host CONSTRUCTS the terminal and its server", () => {
    const source = host();
    expect(source).toMatch(/\bcreateTerminal\s*\(/);
    expect(source).toMatch(/\bcreateTerminalServer\s*\(/);
  });

  it("H2 — 04-F22 (c): the host wires the VERIFIED appends, not the session-reading ones", () => {
    const source = terminalWiring();
    // The defect this whole surface exists to avoid, and the one invisible to every behavioural
    // test in the repo: the order would still be correct and only the envelope would name the
    // wrong person (`approval-record`'s own note says the same one screen up).
    expect(source).toMatch(/appendAs:\s*createVerifiedAppend\(/);
    expect(source).toMatch(/addLineAs:\s*createVerifiedAddLine\(/);
    // And the terminal is never handed the gateway's own write surface, which reads `session()`.
    expect(source).not.toMatch(/appendAs:\s*gateway\b/);
    expect(source).not.toMatch(/addLineAs:\s*gateway\b/);
  });

  it("H3 — 04-F23: the host reaches the matrix through authorize.ts, not a local rule", () => {
    expect(terminalWiring()).toMatch(/authorize:\s*authorizeTerminal\(/);
  });

  it("H4 — 01-F61: the pad's verifier is a createPinSession over the DURABLE counter", () => {
    // A hand-rolled `verifyPin` here would be a third credential surface with its own lockout to
    // forget. The durable store is what makes `01-F61`'s persistence real.
    const wiring = terminalWiring();
    expect(wiring).toMatch(/createPinSession\(/);
    expect(wiring.slice(0, wiring.indexOf("authorize:"))).toMatch(/attempts:\s*store\.pinAttempts/);
  });

  it("H5 — 04-F22 (a): the certificate is READ from configuration and never invented", () => {
    const source = host();
    expect(source).toMatch(/tls:\s*terminalTls\(\)/);
    // A self-signing fallback would train an operator to tap through a browser warning, which is
    // worth more to an attacker than the certificate is to us.
    expect(source).not.toMatch(/createSelfSigned|generateKeyPairSync/);
  });

  it("H2b — the narrowing BITES: the approval record's identical wiring is outside the window", () => {
    // Without this, H2 could be satisfied by any `appendAs: createVerifiedAppend(` in the file and
    // the terminal's own could be anything at all — which is exactly what the M2 mutant proved.
    const whole = host();
    expect(whole.match(/appendAs:\s*createVerifiedAppend\(/g)?.length).toBeGreaterThan(1);
    expect(terminalWiring().match(/appendAs:\s*createVerifiedAppend\(/g)?.length).toBe(1);
  });

  it("H6 — 24-F14: this file's own reads are not vacuous", () => {
    // If `index.ts` is renamed or emptied, every assertion above passes against nothing. The two
    // rails this repo has for that shape are an empty-match guard and a floor.
    const source = host();
    expect(source.length).toBeGreaterThan(1_000);
    expect(source).toMatch(/createGateway\(/);
  });
});

describe("§I 04-F22 (b) — proof of possession over a real TLS socket", () => {
  const servers: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) await s.close();
  });

  /** A browser's `crypto.subtle.sign` emits IEEE P1363; Node's default is DER. This mimics the browser. */
  /**
   * What a browser's `crypto.subtle.sign` would produce: ECDSA P-256 over the same LENGTH-PREFIXED
   * bytes the till hashes, in IEEE P1363 form (Node's default is DER, which is why the server sets
   * `dsaEncoding`).
   *
   * The prefix, rather than a separator character, is deliberate on both sides and this suite found
   * out why the hard way: the shipped file was first written with a SEPARATOR and one byte of it
   * was silently a NUL instead of a space. Every honest signature was rejected and the failure was
   * indistinguishable from an attack, which is exactly what that function's own header predicted. A
   * length prefix has no character anyone can get wrong invisibly, and it also removes the
   * concatenation ambiguity a separator carries whenever it can occur in the nonce.
   */
  const signAs = (privateKey: KeyObject, nonce: string, body: string): string => {
    const n = Buffer.from(nonce, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(n.length);
    const digest = createHash("sha256")
      .update(length)
      .update(n)
      .update(Buffer.from(body, "utf8"))
      .digest();
    return sign(null, digest, { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  };

  const wired = async () => {
    const r = await rig();
    // A real certificate, so this is a real TLS handshake rather than a claim about one.
    const issuer = await createOrgIssuer("terminal-test", NOW);
    const server = createTerminalServer({
      terminal: r.terminal,
      tls: { cert: issuer.certPem, key: issuer.privateKeyPem },
      port: 0,
      bundleDir: null,
      now: () => r.now.value,
      log: () => {},
    });
    servers.push(server);
    const port = await server.boundPort();
    if (port === null) throw new Error("the terminal server did not bind");
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const spki = keys.publicKey.export({ format: "der", type: "spki" });
    return { r, server, port, keys, spki };
  };

  const post = (
    port: number,
    path: string,
    body: string,
    headers: Record<string, string> = {},
  ): Promise<{ status: number; body: string }> =>
    new Promise((done, fail) => {
      const req = httpsRequest(
        {
          host: "127.0.0.1",
          port,
          path,
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          // The certificate is this rig's own. `04-F22` (a)'s open question is precisely whether a
          // BROWSER trusts one, and nothing here is evidence either way.
          rejectUnauthorized: false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            done({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      req.on("error", fail);
      req.end(body);
    });

  const enrolled = async (w: Awaited<ReturnType<typeof wired>>) => {
    const code = w.server.mintEnrolmentCode();
    const res = await post(
      w.port,
      "/enrol",
      JSON.stringify({ code, public_key: Buffer.from(w.spki).toString("base64url") }),
    );
    return JSON.parse(res.body).terminal_id as string;
  };

  const nonceFor = async (port: number, terminal_id: string): Promise<string> => {
    const res = await post(port, "/nonce", JSON.stringify({ terminal_id }));
    return JSON.parse(res.body).nonce as string;
  };

  const rpc = async (
    w: Awaited<ReturnType<typeof wired>>,
    terminal_id: string,
    body: unknown,
    tamper?: (raw: string) => string,
  ) => {
    const raw = JSON.stringify(body);
    const nonce = await nonceFor(w.port, terminal_id);
    const signature = signAs(w.keys.privateKey, nonce, raw);
    return post(w.port, "/rpc", tamper === undefined ? raw : tamper(raw), {
      "x-restos-terminal": terminal_id,
      "x-restos-nonce": nonce,
      "x-restos-signature": signature,
    });
  };

  it("I1 — an ENROLLED tablet signing a fresh nonce reaches the till", async () => {
    const w = await wired();
    const terminal_id = await enrolled(w);
    expect(w.server.enrolments()).toEqual([terminal_id]);
    const res = await rpc(w, terminal_id, { op: "roster" });
    expect(res.status).toBe(200);
    expect(
      JSON.parse(res.body).roster.map((m: { display_name: string }) => m.display_name),
    ).toContain("Sana");
  });

  it("I2 — an UNENROLLED caller is refused, with no bearer string that could have worked", async () => {
    const w = await wired();
    const res = await post(w.port, "/rpc", JSON.stringify({ op: "roster" }));
    expect(res.status).toBe(401);
    // `01-F72` (a) refuses a replayable secret. There is no header this call could have carried.
    expect(res.body).not.toContain("Sana");
  });

  it("I3 — a REPLAYED request is refused: the nonce is consumed on first use", async () => {
    const w = await wired();
    const terminal_id = await enrolled(w);
    const raw = JSON.stringify({ op: "roster" });
    const nonce = await nonceFor(w.port, terminal_id);
    const signature = signAs(w.keys.privateKey, nonce, raw);
    const headers = {
      "x-restos-terminal": terminal_id,
      "x-restos-nonce": nonce,
      "x-restos-signature": signature,
    };
    expect((await post(w.port, "/rpc", raw, headers)).status).toBe(200);
    // Byte-identical, captured off the wire and sent again. This is the whole reason a bearer
    // string was refused.
    expect((await post(w.port, "/rpc", raw, headers)).status).toBe(401);
  });

  it("I4 — the signature is bound to the BODY: tampering with the act is refused", async () => {
    const w = await wired();
    const terminal_id = await enrolled(w);
    const signIn = await rpc(w, terminal_id, { op: "sign_in", user_id: WAITER, pin: PIN });
    const handle = JSON.parse(signIn.body).handle as string;
    const opened = await rpc(w, terminal_id, {
      op: "act",
      handle,
      intent: { kind: "open", table_id: "7" },
    });
    const order_id = JSON.parse(opened.body).order_id as string;

    // A signed request whose body is rewritten in flight — the quantity changed from 1 to 99.
    const tampered = await rpc(
      w,
      terminal_id,
      { op: "act", handle, intent: { kind: "add_line", order_id, item_id: KARAHI, qty: 1 } },
      (raw) => raw.replace('"qty":1', '"qty":99'),
    );
    expect(tampered.status).toBe(401);
    // `01-F1` makes whatever lands permanent, so what must be authenticated is the ACT.
    expect(w.r.events().some((e) => e.type === "order.line_added")).toBe(false);
  });

  it("I5 — a WRONG key is refused even with a valid nonce", async () => {
    const w = await wired();
    const terminal_id = await enrolled(w);
    const impostor = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const raw = JSON.stringify({ op: "roster" });
    const nonce = await nonceFor(w.port, terminal_id);
    const res = await post(w.port, "/rpc", raw, {
      "x-restos-terminal": terminal_id,
      "x-restos-nonce": nonce,
      "x-restos-signature": signAs(impostor.privateKey, nonce, raw),
    });
    expect(res.status).toBe(401);
  });

  it("I6 — an enrolment code is single use", async () => {
    const w = await wired();
    const code = w.server.mintEnrolmentCode();
    const key = Buffer.from(w.spki).toString("base64url");
    expect((await post(w.port, "/enrol", JSON.stringify({ code, public_key: key }))).status).toBe(
      200,
    );
    // A code that survives one use is a code two tablets can enrol against.
    expect((await post(w.port, "/enrol", JSON.stringify({ code, public_key: key }))).status).toBe(
      403,
    );
  });

  it("I7 — revoking a terminal cuts it immediately, mid-service", async () => {
    const w = await wired();
    const terminal_id = await enrolled(w);
    expect((await rpc(w, terminal_id, { op: "roster" })).status).toBe(200);
    expect(w.server.revoke(terminal_id)).toBe(true);
    expect((await rpc(w, terminal_id, { op: "roster" })).status).toBe(401);
    expect(w.server.enrolments()).toEqual([]);
  });

  it("I8 — the whole 04-F6 loop over the wire, and the envelope names the WAITER", async () => {
    const w = await wired();
    const terminal_id = await enrolled(w);
    const signIn = await rpc(w, terminal_id, { op: "sign_in", user_id: WAITER, pin: PIN });
    const handle = JSON.parse(signIn.body).handle as string;
    // `04-F22` (c) — the response carries a name and no user id for the tablet to edit.
    expect(signIn.body).not.toContain(WAITER);

    const opened = await rpc(w, terminal_id, {
      op: "act",
      handle,
      intent: { kind: "open", table_id: " Roof  3 " },
    });
    const order_id = JSON.parse(opened.body).order_id as string;
    await rpc(w, terminal_id, {
      op: "act",
      handle,
      intent: { kind: "add_line", order_id, item_id: KARAHI, qty: 1 },
    });
    await rpc(w, terminal_id, { op: "act", handle, intent: { kind: "confirm", order_id } });

    expect(w.r.events().map((e) => `${e.type}:${e.actor_user_id}`)).toEqual([
      `order.created:${WAITER}`,
      `order.line_added:${WAITER}`,
      `order.confirmed:${WAITER}`,
    ]);
    // `04-F25` — normalized at the writer, over the wire as well as in process.
    expect(w.r.events()[0]?.payload.table_id).toBe("Roof 3");
  });

  it("I9 — a signed but unauthorized act is refused by the MATRIX, not by the transport", async () => {
    const w = await wired();
    const terminal_id = await enrolled(w);
    const signIn = await rpc(w, terminal_id, { op: "sign_in", user_id: KEEPER, pin: PIN });
    const handle = JSON.parse(signIn.body).handle as string;
    const res = await rpc(w, terminal_id, {
      op: "act",
      handle,
      intent: { kind: "open", table_id: "7" },
    });
    // 200 with a refusal, because the tablet is admitted and the PERSON is not — two different
    // gates, and collapsing them into one status is how a waiter is told the wrong thing.
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: false, reason: "not_permitted" });
    expect(w.r.events()).toEqual([]);
  });
});
