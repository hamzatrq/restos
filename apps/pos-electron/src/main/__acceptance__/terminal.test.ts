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
// ⚠ WHAT THIS SUITE DOES NOT CLAIM — REWRITTEN, because the old wording was the cover the
// `04-F36` defects hid under. It said "it says nothing about a browser … no tablet has ever
// connected to this till", which read as a scope statement and was really an admission that the
// only assertions about the wire were written against a hand-copy of the wire. §I now signs with
// `crypto.subtle`, the pad's only primitive; §J drives the SHIPPING client module. What is still
// true: no assertion here is evidence about `04-F22` (a)'s founder call — a browser TRUSTING a
// certificate is the open question, §J's transport waves the rig's own certificate through, and §G
// asserts only that no certificate means no listener. And nothing here runs on Electron, which is
// why §K exists: `verify(null, …)` answers on Node and throws on BoringSSL, so a suite on this
// platform can never be the rail for that class.

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPin } from "@restos/domain";
import { createOrgIssuer } from "@restos/lan-pki";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
/**
 * `04-F36` — **the module the tablet actually loads.** §J drives THIS, not a restatement of it:
 * a helper in this file that hand-copies the till's convention is how two defects shipped green,
 * and the measurement is in §I's `signAs` header.
 *
 * ⚠ **This import crosses `18 §69`'s app-to-app ban.** It is recorded in `04-F36` and OWED. The
 * precedent is `apps/pass-kds/src/layout-gate/main.ts`, which imports the counter's layout probe;
 * this is a test edge rather than production coupling, and the honest resolution — one shared wire
 * module both ends derive from — is named in the FR and is NOT done here.
 */
import { createTerminalClient } from "../../../../waiter/src/terminal-client";
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
    // `04-F27` — REQUIRED, so this rig has to say something about it. It says nothing on purpose:
    // every assertion in this file is about what reaches the LEDGER, and what a completed append
    // then causes is `terminal-write-path.test.ts`'s subject, driven there against a recording
    // seam and against `main/index.ts`'s own wiring.
    onAppended: () => {},
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

  /**
   * The LENGTH-PREFIXED bytes both ends agree on: `len32BE(nonce) || nonce || body`.
   *
   * The prefix, rather than a separator character, is deliberate on both sides and this suite found
   * out why the hard way: the shipped file was first written with a SEPARATOR and one byte of it
   * was silently a NUL instead of a space. Every honest signature was rejected and the failure was
   * indistinguishable from an attack, which is exactly what that function's own header predicted. A
   * length prefix has no character anyone can get wrong invisibly, and it also removes the
   * concatenation ambiguity a separator carries whenever it can occur in the nonce.
   */
  const prefixed = (nonce: string, body: string): Uint8Array<ArrayBuffer> => {
    const n = Buffer.from(nonce, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(n.length);
    return new Uint8Array(Buffer.concat([length, n, Buffer.from(body, "utf8")]));
  };

  /**
   * ⚠ **SIGNED WITH THE BROWSER'S OWN PRIMITIVE, AND `04-F36` IS WHY THAT SENTENCE IS THE WHOLE
   * ASSERTION.** This helper used to compute `sha256(...)` itself and call `sign(null, digest, …)`
   * — a HAND-COPY of the till's convention, and a call no browser has. It therefore agreed with
   * the implementation, disagreed with the shipping pad, and ran on the one platform where a null
   * algorithm is legal at all: measured against the shipping server, browser-shaped signatures got
   * **401** while this helper's got **200**, and on Electron 43's BoringSSL the server's own
   * `verify(null, …)` threw `ERR_OSSL_EVP_NO_DEFAULT_DIGEST` into a `catch` that returned "not
   * admitted". Every signed request from every tablet, for ever, and 38 green tests.
   *
   * `crypto.subtle.sign({ ECDSA, SHA-256 }, key, bytes)` is the ONLY thing the pad can do, and it
   * hashes its input exactly once — WebCrypto exposes no pre-hashed mode. So an implementation
   * that hashes twice cannot be made to pass this, whatever the server's helper is later rewritten
   * to return. It emits IEEE P1363 (`r||s`), which is why the server sets `dsaEncoding`.
   */
  const signAs = async (privateKey: CryptoKey, nonce: string, body: string): Promise<string> =>
    Buffer.from(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        prefixed(nonce, body),
      ),
    ).toString("base64url");

  /** The pad's own keypair, generated exactly as `terminal-client.ts` generates it. */
  const padKeys = async (): Promise<CryptoKeyPair> =>
    (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;

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
    const keys = await padKeys();
    const spki = Buffer.from(await crypto.subtle.exportKey("spki", keys.publicKey));
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
    const signature = await signAs(w.keys.privateKey, nonce, raw);
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
    const signature = await signAs(w.keys.privateKey, nonce, raw);
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
    const impostor = await padKeys();
    const raw = JSON.stringify({ op: "roster" });
    const nonce = await nonceFor(w.port, terminal_id);
    const res = await post(w.port, "/rpc", raw, {
      "x-restos-terminal": terminal_id,
      "x-restos-nonce": nonce,
      "x-restos-signature": await signAs(impostor.privateKey, nonce, raw),
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

describe("§J 04-F36 — the REAL pad client against this till, over the real socket", () => {
  const servers: { close: () => Promise<void> }[] = [];
  const globals = globalThis as unknown as { indexedDB?: unknown; fetch?: unknown };
  let savedFetch: unknown;

  beforeEach(() => {
    savedFetch = globals.fetch;
    const cell = new Map<string, unknown>();
    const soon = (fn: () => void): void => void setTimeout(fn, 0);
    type Req = { onsuccess?: () => void; onerror?: () => void; result?: unknown };
    globals.indexedDB = {
      open() {
        const db = {
          transaction: () => ({
            objectStore: () => ({
              get(key: string) {
                const r: Req = {};
                soon(() => {
                  r.result = cell.get(key);
                  r.onsuccess?.();
                });
                return r;
              },
              put(value: unknown, key: string) {
                const r: Req = {};
                soon(() => {
                  cell.set(key, value);
                  r.onsuccess?.();
                });
                return r;
              },
            }),
          }),
        };
        const request: Req = { result: db };
        soon(() => request.onsuccess?.());
        return request;
      },
    };
    globals.fetch = (url: string, init: { method: string; body: string; headers: HeadersInit }) =>
      new Promise((done, fail) => {
        const target = new URL(url);
        const req = httpsRequest(
          {
            host: target.hostname,
            port: target.port,
            path: target.pathname,
            method: init.method,
            headers: init.headers as Record<string, string>,
            // The rig's own certificate — see this section's header.
            rejectUnauthorized: false,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () =>
              done({
                status: res.statusCode,
                json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")),
              }),
            );
          },
        );
        req.on("error", fail);
        req.end(init.body);
      });
  });

  afterEach(async () => {
    globals.fetch = savedFetch;
    globals.indexedDB = undefined;
    for (const s of servers.splice(0)) await s.close();
  });

  /** A real till, a real TLS socket, and the shipping client pointed at it. */
  const pad = async () => {
    const r = await rig();
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
    const client = createTerminalClient(`https://127.0.0.1:${port}`);
    return { r, server, client };
  };

  it("J1 — 04-F22 (b): the shipping client enrols and its FIRST signed request is admitted", async () => {
    const p = await pad();
    expect(await p.client.enrol(p.server.mintEnrolmentCode())).toBe(true);
    // This is the assertion the suite did not have. BOTH shipped defects — the double hash, and
    // the null digest algorithm BoringSSL refuses — make this line throw "no longer admitted".
    const roster = (await p.client.call({ op: "roster" })) as {
      roster: { display_name: string }[];
    };
    expect(roster.roster.map((m) => m.display_name)).toContain("Sana");
  });

  it("J2 — a SECOND call from the same client lands too: the nonce path is the client's own", async () => {
    const p = await pad();
    await p.client.enrol(p.server.mintEnrolmentCode());
    await p.client.call({ op: "roster" });
    // A client reusing its first nonce would be refused here — the till consumes each one on
    // first use (§I3) — and the fresh-nonce-per-call rule lives in the CLIENT, not in the till.
    expect(await p.client.call({ op: "roster" })).toHaveProperty("roster");
  });

  it("J3 — 02-F41/04-F21: a pad SEND records the WAITER, not whoever is at the till", async () => {
    const p = await pad();
    await p.client.enrol(p.server.mintEnrolmentCode());
    const signIn = (await p.client.call({ op: "sign_in", user_id: WAITER, pin: PIN })) as {
      handle: string;
    };
    const opened = (await p.client.call({
      op: "act",
      handle: signIn.handle,
      intent: { kind: "open", table_id: " Roof  3 " },
    })) as { order_id: string };
    await p.client.call({
      op: "act",
      handle: signIn.handle,
      intent: { kind: "add_line", order_id: opened.order_id, item_id: KARAHI, qty: 1 },
    });
    await p.client.call({
      op: "act",
      handle: signIn.handle,
      intent: { kind: "confirm", order_id: opened.order_id },
    });

    // The till's own session is Ayesha for this whole rig (`rig()`'s `session:`). Read out of the
    // REAL store, never off a return value.
    expect(p.r.events().map((e) => `${e.type}:${e.actor_user_id}`)).toEqual([
      `order.created:${WAITER}`,
      `order.line_added:${WAITER}`,
      `order.confirmed:${WAITER}`,
    ]);
    expect(p.r.events().map((e) => e.actor_user_id)).not.toContain(CASHIER);
    // `04-F25` — normalized at the writer, and it survives the real client's own serialization.
    expect(p.r.events()[0]?.payload.table_id).toBe("Roof 3");
  });

  it("J4 — 02-F49: removing a line AFTER the KOT is refused, from the real pad", async () => {
    const p = await pad();
    await p.client.enrol(p.server.mintEnrolmentCode());
    const { handle } = (await p.client.call({ op: "sign_in", user_id: WAITER, pin: PIN })) as {
      handle: string;
    };
    const { order_id } = (await p.client.call({
      op: "act",
      handle,
      intent: { kind: "open", table_id: "12" },
    })) as { order_id: string };
    await p.client.call({
      op: "act",
      handle,
      intent: { kind: "add_line", order_id, item_id: KARAHI, qty: 1 },
    });
    const line_id = p.r.events().find((e) => e.type === "order.line_added")?.payload.line_id;
    expect(typeof line_id, "no line to remove — J4 would measure nothing").toBe("string");

    // PRE-confirm, a removal is a CORRECTION and must land (`01-F17`): the guard has to be aimed
    // at the confirm boundary, not at the pad. Without this half, J4 passes against a terminal
    // that refuses every removal.
    const before = (await p.client.call({
      op: "act",
      handle,
      intent: { kind: "remove_line", order_id, line_id },
    })) as { ok: boolean };
    expect(before.ok, "the guard over-fired on a pre-confirm correction (01-F17)").toBe(true);

    await p.client.call({
      op: "act",
      handle,
      intent: { kind: "add_line", order_id, item_id: NAAN, qty: 2 },
    });
    const cooking = p.r
      .events()
      .filter((e) => e.type === "order.line_added")
      .at(-1)?.payload.line_id;
    await p.client.call({ op: "act", handle, intent: { kind: "confirm", order_id } });

    const after = (await p.client.call({
      op: "act",
      handle,
      intent: { kind: "remove_line", order_id, line_id: cooking },
    })) as { ok: boolean; reason?: string; detail?: string };
    // 200 with a refusal, never a transport status: the tablet is admitted and the ACT is not.
    expect(after.ok, "the pad removed a line the kitchen is already cooking (02-F49)").toBe(false);
    expect(after.reason).toBe("refused");
    // `02-F49` requires the refusal to carry the way OUT, and the waiter is the person reading it,
    // so the words have to survive the wire as well as the boundary.
    expect(after.detail ?? "").toMatch(/void|approv/i);
    expect(
      p.r.events().filter((e) => e.type === "order.line_removed"),
      "a post-KOT removal reached the ledger, permanently (01-F1)",
    ).toHaveLength(1);
  });
});

describe("§K 04-F36 (a) — no Electron-hosted file may leave a digest to the platform", () => {
  /**
   * The rail the fix needs, and it exists because the SUITE cannot be the rail: vitest runs on
   * Node, where `verify(null, …)` is legal and returns an answer, and the product runs on Electron,
   * where it throws. A mutant restoring `null` at `terminal-server.ts`'s call site is GREEN in
   * every test above and dead on a real till — measured, both platforms, in the session report.
   *
   * Deliberately NOT a repo-wide sweep: `services/` really does run on Node, and a rail firing
   * there would be wrong rather than strict.
   */
  const hosted = (dir: string): { file: string; source: string }[] =>
    readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.includes(".test."))
      .map((e) => ({
        file: join(e.parentPath, e.name),
        source: readFileSync(join(e.parentPath, e.name), "utf8"),
      }));

  const ELECTRON_HOSTED = [
    join(import.meta.dirname, "..", ".."),
    join(import.meta.dirname, "..", "..", "..", "..", "pass-kds", "src"),
    join(import.meta.dirname, "..", "..", "..", "..", "..", "packages", "sync-client", "src"),
  ];

  it("K1 — sign/verify name their digest, everywhere the main process can reach", () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const root of ELECTRON_HOSTED) {
      for (const { file, source } of hosted(root)) {
        scanned += 1;
        // `verify(\n  null,` as well as `sign(null,` — the newline is how the shipped call hid
        // from a single-line grep.
        if (/\b(sign|verify)\w*\(\s*(null|undefined)\s*,/.test(source)) offenders.push(file);
      }
    }
    // `24-F14` — a rename or a moved directory must not silently disable this.
    expect(scanned, "K1 scanned nothing — the roots moved and this rail is inert").toBeGreaterThan(
      40,
    );
    expect(offenders, "a defaulted digest is ERR_OSSL_EVP_NO_DEFAULT_DIGEST on BoringSSL").toEqual(
      [],
    );
  });

  it("K2 — the wire's own verification NAMES sha256, so K1 cannot pass vacuously", () => {
    // K1 is a negative assertion and stays green against a file that stopped verifying at all.
    // This is the positive half, on the one call `04-F36` is about.
    const source = readFileSync(join(import.meta.dirname, "..", "terminal-server.ts"), "utf8");
    expect(source).toMatch(/verifySignature\(\s*"sha256"/);
    // And the fault is RECORDED rather than swallowed — `04-F36` (a)'s second half.
    expect(source).toMatch(/catch \(cause\)/);
    expect(source).toMatch(/verifyFaultLogged/);
  });
});
