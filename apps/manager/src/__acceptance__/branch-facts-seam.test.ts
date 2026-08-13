// ⚠ **IMPLEMENTER-AUTHORED, and it is here because a MUTATION SURVIVED.** `24 §3` puts the
// acceptance suite in another session's hands and `branch-slice-seam.test.ts` is that suite; this
// file makes one assertion it does not.
//
// ── THE MEASUREMENT ────────────────────────────────────────────────────────────────────────────
//
// `branch-slice-seam.test.ts` proves the snapshot carries the QUEUE and the ORDERS off a real
// fold, with real ages. It never exercises `AlarmInput.facts`. Measured 2026-08-13: replacing
// `facts: factsOf(source)` with `facts: []` in `home.ts` leaves **all 62 tests in this package
// green**, and takes with it BOTH of the things that field exists for:
//
//   · `05-F3`'s print-failure alarm — *"`kot.print_failed` … raise on the console with the same
//     persistence rules"* — would never appear, on a console whose whole job is to notice;
//   · `05-F2`'s acknowledgment exit — *"alarms persist … until … the manager acknowledges"* —
//     would never clear anything, so every acknowledged alarm returns for ever (`05-F4`'s siren
//     wall reached from the other side).
//
// `merge.ts` leaves both types projection-inert on purpose (*"its reader is doc 05's alarm
// console"*), so this seam is the ONLY path either fact has to a manager. A test that watched only
// late orders would bless a console that reads half its ledger.
//
// The `alarmsFrom` derivation itself is `alarm-derivation.test.ts`'s subject and is not re-tested
// here — what is asserted is that the FACTS ARRIVE, over a real store, through the shipped
// `branchSnapshotFrom`.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config/aging";
import { newId } from "@restos/domain";
import {
  createNodeStorageAdapter,
  type DeviceStore,
  openStore,
  type StoreIdentity,
} from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { type BranchSource, branchSnapshotFrom, managerHome } from "../home.js";

const MINUTE = 60_000;
const NOW = 1_770_000_000_000;
const LATE_MINUTES = 40;

const dirs: string[] = [];
const stores: DeviceStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      // a test closed it already
    }
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const realStore = (identity: StoreIdentity): DeviceStore => {
  const dir = mkdtempSync(join(tmpdir(), "restos-manager-facts-"));
  dirs.push(dir);
  const store = openStore({
    adapter: createNodeStorageAdapter({ path: join(dir, "device.db") }),
    identity,
  });
  stores.push(store);
  return store;
};

const appendTo =
  (store: DeviceStore, identity: StoreIdentity) =>
  (type: string, payload: Record<string, unknown>, when: number): void => {
    store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      actor_user_id: null,
      device_created_at: when,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };

const source = (store: DeviceStore): BranchSource => ({
  store,
  connected: () => true,
  lastSeenMs: () => NOW,
  aging: resolveAging(undefined),
  now: () => NOW,
});

/** A confirmed, unready order that is unambiguously red, plus whatever else the case needs. */
const lateOrder = (store: DeviceStore, identity: StoreIdentity): string => {
  const append = appendTo(store, identity);
  const order_id = newId();
  const at = NOW - LATE_MINUTES * MINUTE;
  append("order.created", { order_id, order_type: "dine_in", channel: "counter" }, at - 1);
  append(
    "order.line_added",
    { order_id, line_id: "line-1", item_id: "item-karahi", qty: 1, unit_price_paisa: 50_000 },
    at - 1,
  );
  append("order.confirmed", { order_id }, at);
  return order_id;
};

const identityOf = (): StoreIdentity => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

describe("05-F3 — a kot.print_failed in the LEDGER reaches the console's alarm list", () => {
  it("raises a print alarm naming the printer, beside the late-order alarm", () => {
    const identity = identityOf();
    const store = realStore(identity);
    const order_id = lateOrder(store, identity);
    appendTo(store, identity)(
      "kot.print_failed",
      { order_id, printer_name: "kitchen-1" },
      NOW - 39 * MINUTE,
    );

    const home = managerHome(branchSnapshotFrom(source(store)), NOW);
    expect(home.alarms.known).toBe(true);
    if (!home.alarms.known) return;
    const print = home.alarms.list.find((alarm) => alarm.kind === "print_failed");
    // `03-F5`: the manager has to know WHICH printer to walk to.
    expect(print?.printer_name).toBe("kitchen-1");
    expect(print?.order_id).toBe(order_id);
    // The control: the late-order alarm is still there, so "everything is raised" and "nothing is
    // raised" are both distinguishable from this passing.
    expect(home.alarms.list.map((alarm) => alarm.kind).sort()).toEqual([
      "late_order",
      "print_failed",
    ]);
  });
});

describe("05-F2 — an audit.alarm_acknowledged in the LEDGER clears its alarm", () => {
  it("clears the acknowledged alarm and leaves the other one standing", () => {
    // Two alarms on one order with two different remedies (`05-F2`: acknowledging one may never
    // silently dismiss the other). The ack names `late_order`, so the print alarm survives — which
    // is also what makes this fail against a snapshot that drops the facts wholesale rather than
    // one that merely mis-keys them.
    const identity = identityOf();
    const store = realStore(identity);
    const append = appendTo(store, identity);
    const order_id = lateOrder(store, identity);
    append("kot.print_failed", { order_id, printer_name: "kitchen-1" }, NOW - 39 * MINUTE);

    const before = managerHome(branchSnapshotFrom(source(store)), NOW);
    expect(before.alarms.known && before.alarms.list.length).toBe(2);

    append(
      "audit.alarm_acknowledged",
      { alarm_kind: "late_order", order_id, printer_name: null },
      NOW - 38 * MINUTE,
    );

    const after = managerHome(branchSnapshotFrom(source(store)), NOW);
    expect(after.alarms.known).toBe(true);
    if (!after.alarms.known) return;
    expect(after.alarms.list.map((alarm) => alarm.kind)).toEqual(["print_failed"]);
  });
});
