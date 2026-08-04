// ACCEPTANCE TESTS — S-0c, main-process half: identity reaches the ledger.
//
// PROVENANCE (24 §3 step 2): written by a session that has seen no implementation of these FRs
// and that did not write the plan. Sources are spec text only — `01-F26`, `01-F27`, `01-F28`,
// `01-F1`, `02-F19`, `02-F41`, `02-F45`, `18 §9`. Committed RED.
//
// WHAT IS BROKEN TODAY: `apps/pos-electron/src/main/index.ts` passes `actorUserId: null` as a
// CONSTRUCTION-TIME CONSTANT, so every event this device has ever appended is attributed to
// nobody. `02-F41` rules that attribution is whoever's PIN is in — an identity that changes
// 20-60x a shift — so a value fixed when the gateway is built cannot express it even once a PIN
// session exists.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE CONTRACT THESE TESTS DEFINE (the implementer builds to this; it is the smallest seam
// that can carry the FRs, and each element is forced by a named one):
//
//   GatewayDeps.session: () => { user_id: string; display_name: string } | null
//
//     REPLACES `actorUserId: string | null`. A GETTER, because `02-F41`'s attribution moves
//     while one gateway instance lives, and `index.ts` binds its IPC handlers to one gateway
//     (`ipcMain.handle` admits one handler per channel). `null` = LOCKED (`01-F26`).
//
//     ONE dep rather than two (`actorUserId` + a display name) on `02-F45`'s own argument: two
//     sources for one fact can disagree, and there is no rule for which wins.
//
//   DeviceState.user: { user_id: string; display_name: string } | null
//
//     The read the lock surface is built on (`18 §6` — operational screens read through this
//     seam and nothing else). Same object the envelope is stamped from, for the same reason.
//
// NOT DEFINED HERE, deliberately: how a PIN is verified, where credential hashes live, what
// `audit.login` carries. That is S-0b. These tests never call an unlock and never name a PIN —
// they assert only what the ledger receives once someone is (or is not) unlocked.
//
// KNOWN RIPPLE, reported rather than hidden: `gateway.test.ts` builds `GatewayDeps` with
// `actorUserId: "user-1"`. Under this contract that becomes
// `session: () => ({ user_id: "user-1", display_name: "Ayesha" })` — a mechanical substitution
// that keeps every assertion in that file, including `expect(arg.actor_user_id).toBe("user-1")`,
// asserting exactly what it asserts now. It is a rename at the dep, not a weakening.

import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { createGateway, type GatewayDeps } from "../gateway";

const AYESHA = { user_id: "user-ayesha", display_name: "Ayesha" } as const;
const BILAL = { user_id: "user-bilal", display_name: "Bilal" } as const;

const DEVICE_ID = "device-counter-1";

const JSON_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 1, unit_price_paisa: 45_000, states: ["confirmed"] },
});

const stubStore = (append: unknown = vi.fn((input) => ({ ...input, lamport_seq: 1 }))) =>
  ({
    identity: { org_id: "org1", branch_id: "br1", device_id: DEVICE_ID },
    openOrders: () => [
      { order_id: "order-1234abcd", json_lines: JSON_LINES, pay_total: 0, channel: "counter" },
    ],
    kitchenQueue: () => [],
    availability: () => [],
    branchTimeStatus: () => ({ offset_ms: 0, basis: "branch", skew_ms: null, skew_flagged: false }),
    append,
  }) as unknown as DeviceStore;

/**
 * A gateway over a MUTABLE session — the shape `02-F41` actually describes. `unlocked` is what a
 * PIN session would set; the tests move it between appends, which is the whole point: a cashier
 * hands the till over mid-shift and the ledger has to follow.
 */
const harness = (start: { user_id: string; display_name: string } | null = null) => {
  let unlocked = start;
  const append = vi.fn((input: unknown) => ({ ...(input as object), lamport_seq: 1 }));
  const deps: GatewayDeps = {
    store: stubStore(append),
    catalog: (id) => ({ name: id }),
    menu: () => [{ id: "i-karahi", name: "Chicken Karahi" }],
    priceOf: () => 45_000,
    session: () => unlocked,
    deviceLabel: "Counter 1",
    actor: "Counter 1",
    training: false,
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
    blockedCursor: () => null,
    businessDay: () => "2026-08-04",
  };
  return {
    gateway: createGateway(deps),
    append,
    /** What a PIN unlock (S-0b) does to this device; `null` is the lock. */
    setSession: (next: { user_id: string; display_name: string } | null) => {
      unlocked = next;
    },
    /** The envelope handed to the store on the nth append (0-based). */
    envelope: (n = 0) => append.mock.calls[n]?.[0] as Record<string, unknown>,
  };
};

describe("02-F41 — attribution is whoever's PIN is in", () => {
  it("stamps the unlocked user onto the envelope, on every append path", () => {
    // Two append SITES exist in this gateway — `append` and `addLine` — and they are separate
    // call sites with separate envelope literals. Fixing one and missing the other leaves the
    // counter's highest-frequency act (~300x a shift, `01-F53`'s price capture) unattributed,
    // which `02-F19` names explicitly: "line added" is an attributed action.
    const h = harness(AYESHA);
    h.gateway.append({ type: "order.created", payload: { order_id: "o-1" }, refs: [] });
    h.gateway.addLine({ order_id: "order-1234abcd", item_id: "i-karahi", qty: 1 });

    expect(h.envelope(0)?.["actor_user_id"]).toBe("user-ayesha");
    expect(h.envelope(1)?.["actor_user_id"]).toBe("user-ayesha");
  });

  it("FOLLOWS the session — a value fixed when the gateway was built cannot be right", () => {
    // The defect this owns is the one in the tree: `actorUserId` is read once, at construction.
    // A shift lead taking the till over mid-order is the ordinary case (`27-F51` designs for it,
    // `02-F41` rules there is no "acting for" — so the identity simply CHANGES), and one gateway
    // instance serves the whole process life.
    const h = harness(AYESHA);
    h.gateway.append({ type: "order.created", payload: { order_id: "o-1" }, refs: [] });
    h.setSession(BILAL);
    h.gateway.append({ type: "order.confirmed", payload: { order_id: "o-1" }, refs: [] });

    expect(h.envelope(0)?.["actor_user_id"]).toBe("user-ayesha");
    expect(h.envelope(1)?.["actor_user_id"]).toBe("user-bilal");
  });

  it("a LOCKED device attributes to NOBODY — never to the last user who was in", () => {
    // `01-F26`'s idle auto-lock ends a session. An implementation that caches the last unlocked
    // user (the natural shape if the session is read once and stored) keeps attributing to a
    // cashier who has walked away — and `01-F1` makes that permanent: a false attribution in an
    // append-only ledger can only be corrected by another event, never removed.
    const h = harness(AYESHA);
    h.gateway.append({ type: "order.created", payload: { order_id: "o-1" }, refs: [] });
    h.setSession(null);
    h.gateway.append({ type: "order.confirmed", payload: { order_id: "o-1" }, refs: [] });

    expect(h.envelope(0)?.["actor_user_id"]).toBe("user-ayesha");
    expect(h.envelope(1)?.["actor_user_id"]).toBeNull();
  });

  it("01-F27 — a device identity is NEVER promoted into a user identity", () => {
    // "Device tokens carry device identity only — user identity comes from the PIN session."
    // The two axes are separate on purpose. The tempting fix for a null `actor_user_id` is to
    // fall back to something non-null, and the device id is what is in scope at that line;
    // doing so would make an unattended till look like a person in every report.
    const h = harness(null);
    h.gateway.append({ type: "order.created", payload: { order_id: "o-1" }, refs: [] });

    const env = h.envelope(0);
    expect(env?.["device_id"]).toBe(DEVICE_ID);
    expect(env?.["actor_user_id"]).toBeNull();
    expect(env?.["actor_user_id"]).not.toBe(DEVICE_ID);
  });
});

describe("02-F45 — attribution is read from the ENVELOPE, never from a payload field", () => {
  it("a payload naming a cashier does not become the attribution", () => {
    // "A `cashier` field duplicated into the `shift.opened` payload would be a second source for
    // one fact, and the two can disagree — in an append-only ledger, with no rule for which
    // wins." So the envelope is the only source, and a payload that carries the name anyway
    // (an older device, a hand-built request, a compromised renderer — `shared/ipc.ts` calls the
    // renderer "the untrusted end of this bridge") changes nothing about who is accountable.
    const h = harness(AYESHA);
    h.gateway.append({
      type: "shift.opened",
      payload: { shift_id: "shift-1", cashier: "user-someone-else" },
      refs: [],
    });

    expect(h.envelope(0)?.["actor_user_id"]).toBe("user-ayesha");
  });

  it("and a payload naming a cashier cannot manufacture one on a LOCKED device", () => {
    // The dangerous direction of the same defect: `payload.cashier ?? session()` reads correctly
    // whenever someone is unlocked and silently accepts a caller-supplied identity whenever
    // nobody is. Asserting only the unlocked case above would pass such an implementation.
    const h = harness(null);
    h.gateway.append({
      type: "shift.opened",
      payload: { shift_id: "shift-1", cashier: "user-someone-else" },
      refs: [],
    });

    expect(h.envelope(0)?.["actor_user_id"]).toBeNull();
  });
});

describe("18 §6 — the lock surface reads the session through the same seam", () => {
  it("deviceState() reports the unlocked user, and LOCKED as null", () => {
    // `01-F26` is a device-layer lock: the renderer has no other way to learn it (`18 §9` — the
    // renderer reaches main through one bridge, and `shared/ipc.ts` cannot express a query).
    const h = harness(AYESHA);
    expect(h.gateway.deviceState().user).toEqual({
      user_id: "user-ayesha",
      display_name: "Ayesha",
    });

    h.setSession(null);
    expect(h.gateway.deviceState().user).toBeNull();
  });

  it("the identity SHOWN and the identity STAMPED are one fact, not two", () => {
    // `02-F45`'s argument applies to the screen as much as to the payload: a strip naming Ayesha
    // over a ledger attributing Bilal is the same disagreement with no rule for which wins, and
    // `00 §5.7` requires the device to report what is true. Two independent sources read at
    // different moments is exactly how that drifts.
    const h = harness(BILAL);
    const shown = h.gateway.deviceState().user;
    h.gateway.append({ type: "order.created", payload: { order_id: "o-1" }, refs: [] });

    expect(shown?.user_id).toBe(h.envelope(0)?.["actor_user_id"]);
    expect(shown?.user_id).toBe("user-bilal");
  });
});
