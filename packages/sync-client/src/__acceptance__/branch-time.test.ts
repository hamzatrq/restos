// Acceptance tests — T-01-17: branch-consensus time at the APPEND seam
// (01-F43), the provisional marker (01-F44), and skew detection (01-N2).
// Authored from specs/01-kernel-sync.md (01-F43/F44/F45, 01-N2, 01-F1, 01-F17),
// specs/DECISIONS.md (DEC-TIME-001) and specs/25-fold-performance.md §14 ONLY —
// never from an implementation (24 §3 step 2: read-only to the implementing session).
//
// Why the stamp is carried in the EVENT and not applied at fold time: 01-F34 makes
// the fold a pure function of the delivered SET. Two devices holding the same set
// but different offsets must project identically, so the offset can only be applied
// once — by the ORIGINATING device, at append. That property is asserted in
// time-invariance.test.ts; this suite pins the stamping itself.
//
// RED-AWAITING-IMPLEMENTATION: the envelope has no branch_created_at/time_basis and
// the store has no setBranchTimeOffset()/branchTimeStatus() yet.
import { describe, expect, it } from "vitest";
import * as syncClient from "../index.js";
import {
  appendInput,
  identity,
  orderConfirmed,
  orderCreated,
  peerEnvelope,
  peerIdentity,
} from "./builders.js";
import {
  branchTimeStatus,
  SKEW_FLAG_THRESHOLD_MS,
  setBranchTimeOffset,
  stampsOf,
  timeStore,
} from "./time-builders.js";

/** The device's own (possibly very wrong) wall clock during this suite. */
const DEVICE_CLOCK = 1752800000000;
const MINUTE = 60_000;

const exported = syncClient as unknown as { SKEW_FLAG_THRESHOLD_MS?: number };

describe("01-N2 — the flag threshold is platform law, declared once", () => {
  it("01-N2: SKEW_FLAG_THRESHOLD_MS is five minutes, exported for doc-15 fleet health", () => {
    expect(exported.SKEW_FLAG_THRESHOLD_MS).toBe(5 * MINUTE);
    expect(SKEW_FLAG_THRESHOLD_MS).toBe(5 * MINUTE); // the oracle's own reading of 01-N2
  });
});

describe("01-F44 — no hub contact yet: provisional, and never blocked", () => {
  it("01-F44/01-F43: a store that has never met a hub reports offset 0, basis branch_provisional and no skew observation", () => {
    const store = timeStore(identity());
    expect(branchTimeStatus(store)).toEqual({
      offset_ms: 0,
      basis: "branch_provisional",
      skew_ms: null,
      skew_flagged: false,
    });
    store.close();
  });

  it("01-F44: with no hub contact the appended stamp is the raw device clock, MARKED provisional — offset 0 is the honest default", () => {
    const id = identity();
    const store = timeStore(id);
    const env = store.append(
      appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }),
    );
    expect(stampsOf(env)).toEqual({
      device_created_at: DEVICE_CLOCK,
      branch_created_at: DEVICE_CLOCK, // offset 0 — 01-F43's stated fallback
      time_basis: "branch_provisional", // …and it says so, per 01-F44
    });
    store.close();
  });

  it("01-F17/01-F43: offset acquisition NEVER blocks — a device that has never seen a hub appends, persists and serves the sale", () => {
    // 01-F43: "Offset acquisition never blocks operation (01-F17)". A branch whose
    // hub is off is still a restaurant taking orders.
    const id = identity();
    const store = timeStore(id);
    store.append(appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }));
    store.append(
      appendInput(id, { ...orderConfirmed("O1"), device_created_at: DEVICE_CLOCK + 1000 }),
    );
    expect(store.readOwnEvents()).toHaveLength(2);
    expect(store.openOrders()).toHaveLength(1);
    expect(store.kitchenQueue()).toHaveLength(1); // the ticket is on the pass
    expect(branchTimeStatus(store).basis).toBe("branch_provisional");
    store.close();
  });
});

describe("01-F43 — branch time is stamped at append and carried in the event", () => {
  it("01-F43: after hub contact the stamp is device_clock + offset, marked branch — and the RAW device clock is untouched (01-F45)", () => {
    const id = identity();
    const store = timeStore(id);
    // This device is two hours behind the hub, so its offset is +2 h.
    setBranchTimeOffset(store, 2 * 60 * MINUTE);
    const env = store.append(
      appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }),
    );
    expect(stampsOf(env)).toEqual({
      device_created_at: DEVICE_CLOCK, // forensic hint, preserved verbatim
      branch_created_at: DEVICE_CLOCK + 2 * 60 * MINUTE,
      time_basis: "branch",
    });
    expect(branchTimeStatus(store)).toEqual({
      offset_ms: 2 * 60 * MINUTE,
      basis: "branch",
      skew_ms: 2 * 60 * MINUTE,
      skew_flagged: true, // two hours is well past 01-N2's five minutes
    });
    store.close();
  });

  it("01-F43: the offset is SIGNED — a device running ahead of the hub stamps BELOW its own clock", () => {
    const id = identity();
    const store = timeStore(id);
    setBranchTimeOffset(store, -90_000); // 90 s fast
    const env = store.append(
      appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }),
    );
    expect(stampsOf(env).branch_created_at).toBe(DEVICE_CLOCK - 90_000);
    expect(branchTimeStatus(store).offset_ms).toBe(-90_000);
    expect(branchTimeStatus(store).skew_ms).toBe(90_000); // magnitude
    store.close();
  });

  it("01-F43: the hub — the branch time authority (01-F13) — carries offset 0 with basis branch, NOT provisional", () => {
    // The hub does not measure itself; its clock IS branch time. Basis "branch"
    // with offset 0 is therefore a different state from "never contacted anyone".
    const id = identity();
    const store = timeStore(id);
    setBranchTimeOffset(store, 0);
    expect(branchTimeStatus(store)).toEqual({
      offset_ms: 0,
      basis: "branch",
      skew_ms: 0,
      skew_flagged: false,
    });
    const env = store.append(
      appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }),
    );
    expect(stampsOf(env)).toEqual({
      device_created_at: DEVICE_CLOCK,
      branch_created_at: DEVICE_CLOCK,
      time_basis: "branch",
    });
    store.close();
  });

  it("01-F43/01-F1: a refreshed offset moves LATER appends only — the append-only ledger never restamps history", () => {
    const id = identity();
    const store = timeStore(id);
    setBranchTimeOffset(store, 1_000);
    const first = store.append(
      appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }),
    );
    setBranchTimeOffset(store, 60_000); // hub contact refreshes the measurement
    const second = store.append(
      appendInput(id, { ...orderConfirmed("O1"), device_created_at: DEVICE_CLOCK }),
    );
    expect(stampsOf(first).branch_created_at).toBe(DEVICE_CLOCK + 1_000);
    expect(stampsOf(second).branch_created_at).toBe(DEVICE_CLOCK + 60_000);
    // …and the stored row for the first event is byte-identical to what it was.
    const stored = store.readOwnEvents().find((e) => e.id === first.id);
    expect(stored).toBeDefined();
    expect(stampsOf(stored as Record<string, unknown>).branch_created_at).toBe(
      DEVICE_CLOCK + 1_000,
    );
    store.close();
  });
});

describe("01-F44 — a provisional stamp is never silently promoted", () => {
  it("01-F44/01-F1: an event stamped provisional KEEPS its marker once the offset arrives — the ledger row is never rewritten", () => {
    const id = identity();
    const store = timeStore(id);
    const offline = store.append(
      appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }),
    );
    setBranchTimeOffset(store, 3 * MINUTE); // the hub finally shows up
    const stored = store.readOwnEvents().find((e) => e.id === offline.id);
    expect(stored).toBeDefined();
    expect(stampsOf(stored as Record<string, unknown>)).toEqual({
      device_created_at: DEVICE_CLOCK,
      branch_created_at: DEVICE_CLOCK,
      time_basis: "branch_provisional", // still provisional — promotion is never silent
    });
    // The NEXT append is on the new basis, so one ledger carries both eras
    // distinguishably — which is what makes reconciliation observable.
    const after = store.append(
      appendInput(id, { ...orderConfirmed("O1"), device_created_at: DEVICE_CLOCK }),
    );
    expect(stampsOf(after).time_basis).toBe("branch");
    store.close();
  });

  it("01-F44: reconciliation is OBSERVABLE — a cloud-merged event carries server_received_at beside its unchanged provisional marker", () => {
    // 01-F44: business stamps "use server_received_at when the cloud has seen the
    // event; otherwise … branch time … carry an explicit time_basis marker".
    // Downstream fiscal consumers (16-N3) read the marker; the ledger keeps both
    // facts side by side rather than overwriting one with the other.
    const id = identity();
    const peer = peerIdentity(id);
    const store = timeStore(id);
    const merged = peerEnvelope(peer, 0, {
      ...orderCreated("O2"),
      device_created_at: DEVICE_CLOCK,
      branch_created_at: DEVICE_CLOCK,
      time_basis: "branch_provisional",
      server_received_at: DEVICE_CLOCK + 45_000,
    });
    expect(store.ingest(merged)).toEqual({ stored: true });
    const stored = store.readAllEvents().find((e) => e.id === merged.id) as Record<string, unknown>;
    expect(stored).toBeDefined();
    expect(stampsOf(stored).time_basis).toBe("branch_provisional");
    expect(stored.server_received_at).toBe(DEVICE_CLOCK + 45_000);
    store.close();
  });
});

describe("01-N2 — clock-skew detection is observational and never blocks", () => {
  it("01-N2: skew ABOVE five minutes raises the health flag; exactly five minutes does not", () => {
    const id = identity();
    const over = timeStore(id);
    setBranchTimeOffset(over, SKEW_FLAG_THRESHOLD_MS + 1);
    expect(branchTimeStatus(over).skew_flagged).toBe(true);
    expect(branchTimeStatus(over).skew_ms).toBe(SKEW_FLAG_THRESHOLD_MS + 1);
    over.close();

    const exact = timeStore(id);
    setBranchTimeOffset(exact, SKEW_FLAG_THRESHOLD_MS);
    expect(branchTimeStatus(exact).skew_flagged).toBe(false); // "> 5 min", not "≥"
    exact.close();

    const under = timeStore(id);
    setBranchTimeOffset(under, 4 * MINUTE + 59_000);
    expect(branchTimeStatus(under).skew_flagged).toBe(false);
    under.close();
  });

  it("01-N2: the flag is magnitude-based — a device six minutes BEHIND the hub flags exactly like one six minutes ahead", () => {
    const id = identity();
    const behind = timeStore(id);
    setBranchTimeOffset(behind, 6 * MINUTE);
    const ahead = timeStore(id);
    setBranchTimeOffset(ahead, -6 * MINUTE);
    expect(branchTimeStatus(behind).skew_flagged).toBe(true);
    expect(branchTimeStatus(ahead).skew_flagged).toBe(true);
    expect(branchTimeStatus(ahead).skew_ms).toBe(6 * MINUTE);
    expect(branchTimeStatus(ahead).offset_ms).toBe(-6 * MINUTE);
    behind.close();
    ahead.close();
  });

  it("01-N2/01-F17: a device flagged ten years out still appends, still folds and still serves — the flag NEVER blocks operation", () => {
    // 01-N2: "raises a device health flag (doc 15) but never blocks operation."
    const id = identity();
    const store = timeStore(id);
    const tenYears = 10 * 365 * 24 * 60 * MINUTE;
    setBranchTimeOffset(store, tenYears);
    expect(branchTimeStatus(store).skew_flagged).toBe(true);
    store.append(appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }));
    store.append(appendInput(id, { ...orderConfirmed("O1"), device_created_at: DEVICE_CLOCK }));
    expect(store.readOwnEvents()).toHaveLength(2);
    expect(store.openOrders()).toHaveLength(1);
    expect(store.kitchenQueue()).toHaveLength(1);
    // …and the ticket's age basis is branch time, so the kitchen sees a sane age
    // even though the device believes it is ten years earlier (01-F43/01-F45).
    expect(store.kitchenQueue()[0]?.age_basis).toBe(DEVICE_CLOCK + tenYears);
    store.close();
  });

  it("01-N2/01-F45: skew is measured against the RAW device clock — which is exactly why device_created_at must stay raw", () => {
    // If the stamping had overwritten device_created_at with branch time, the
    // difference would be identically zero and the fleet could never see a broken
    // clock (25 §14; the reason 01-F45 keeps the field instead of redefining it).
    const id = identity();
    const store = timeStore(id);
    const offset = 3 * 365 * 24 * 60 * MINUTE; // three years behind the hub
    setBranchTimeOffset(store, offset);
    const env = store.append(
      appendInput(id, { ...orderCreated("O1"), device_created_at: DEVICE_CLOCK }),
    );
    const stamps = stampsOf(env);
    expect(stamps.device_created_at).toBe(DEVICE_CLOCK);
    expect(stamps.branch_created_at - stamps.device_created_at).toBe(offset);
    expect(branchTimeStatus(store).skew_ms).toBe(offset);
    expect(branchTimeStatus(store).skew_flagged).toBe(true);
    store.close();
  });
});
