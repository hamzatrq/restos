// THE SEAM for `01-F63`'s closing act and `02-F48`'s zero-tender refusal — does the SHIPPED app
// reach either of them?
//
// **This file exists because of the wave's named defect**, in the two shapes `pnpm seams:check`
// says out loud it cannot see.
//
//  - `order.settlement_closed` is a **missing PRODUCER for an event type**. Rule A wants an
//    unreached export and Rule B an unsupplied optional; a key in an object literal is neither,
//    which is exactly how `audit.print_acknowledged` and `order.line_state_changed` sat in the
//    registry with nothing emitting them. `settlement-closing-act.test.ts` proves the emitter
//    builds a correct act and the kernel folds it; it constructs its own wiring, so it stays green
//    against a host that never calls it — and `settled` would go on being `0` on every order.
//  - `refuseZeroTender` is a **wrapper that can be dropped from the chain**. Both its deps are
//    REQUIRED, so Rule A is satisfied by the import and Rule B has no optional to miss. Deleting
//    one line from `index.ts` leaves every gate green and the defect shipped, which is why
//    `double-settlement.test.ts` §G exists for the guard beside it and why this exists for both.
//
// A SOURCE READ, and stating that plainly is the point: `main/index.ts` builds an Electron app at
// module scope and no suite in this package can import it, so this is the same weak instrument
// `line-advance-seam.test.ts` §A and `double-settlement.test.ts` §G already use, for the same
// reason. Everything BEHAVIOURAL about the two modules is in their own acceptance suites, driven
// through the real code; §C below is the one section here that is not a string match.
//
// ⚠ M10 of `line-advance-seam.test.ts`'s producer round is the standing warning about what a
// source string alone is worth: a mutant that DELETED a call survived because the assertion matched
// the same token written in PROSE in a nearby comment. Every match below is anchored on a form that
// only appears as CODE — `<binding>.settled(order_id)` with its argument, never a bare name.
//
// PROVENANCE: written alongside the implementation by the implementing session, like
// `orders-seam.test.ts` and `line-advance-seam.test.ts` beside it, and owed the same independent
// oracle pass. The two behavioural suites were authored by a different session from spec text.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendResult } from "../../shared/ipc";
import { createSettlementCloser } from "../settlement-closer";
import { type RendererWrites, refuseDoubleSettlement } from "../settlement-guard";
import { refuseZeroTender } from "../zero-tender-guard";

const mainSrc = readFileSync(new URL("../index.ts", import.meta.url).pathname, "utf8");

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const TILL = "00000000-0000-7000-8000-000000000003";
const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";
const BILL_PAISA = 224_000;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE HOST REACHES BOTH. Anchored first on lines that have nothing to do with this work.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A — main/index.ts is the file this suite thinks it is", () => {
  it("is actually reading it", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a scanner over an empty string reports
    // clean. If the file moves or the read fails, every assertion below would pass vacuously.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc).toContain("createKotPrinter({");
    expect(mainSrc.length).toBeGreaterThan(20_000);
  });
});

describe("§B 01-F63 — the closing act has a production emitter, and the host drives it", () => {
  it("constructs the emitter over the device store and the RAW gateway", () => {
    // `gateway`, not `writes`: `WRITE_ACTIONS` fails closed and carries no row for
    // `order.settlement_closed`, so the authorized surface would DENY the act. Passing the raw
    // gateway is what `line-advance.ts` and `aggregator-settlement.ts` already do, for the same
    // reason and with the same argument written on the dep.
    expect(mainSrc).toMatch(/createSettlementCloser\(\{\s*store,\s*writes:\s*gateway\s*\}\)/);
  });

  it("calls it from the payment.recorded arm of the append handler, and nowhere else", () => {
    // THE SEAM ITSELF. Sliced to the `payment.recorded` branch so a call sitting in some other
    // handler — or in a comment — cannot satisfy this. The trigger must be a COMPLETED append of a
    // tender (`01-F63`: emitted after the money is in the ledger), which is what that branch is.
    const branch = mainSrc.slice(mainSrc.indexOf('confirm.data.type === "payment.recorded"'));
    const arm = branch.slice(0, branch.indexOf("\n    }\n"));
    expect(arm).not.toBe("");
    expect(arm).toContain("closer.settled(order_id)");
    // And it is the SAME call site as the receipt and the line advance — `01-F63`'s "one
    // definition of settlement completes, not four" (`02-F45`). Three consequences, one trigger.
    expect(arm).toContain("receipts.settled(order_id)");
    expect(arm).toContain("lines.settled(order_id)");
  });

  it("is the ONLY construction of the emitter in the shipped app", () => {
    // Two constructions would be two emitters racing on one order, and `01-F1` makes both rows
    // permanent. The at-most-once check is a read of converged state, not a lock, so it cannot
    // save a product that built the emitter twice inside one process.
    expect(mainSrc.match(/createSettlementCloser\(/g) ?? []).toHaveLength(1);
  });
});

describe("§C 02-F48 — the zero-tender guard is in the chain the renderer reaches", () => {
  it("is constructed over the double-settlement guard, and takes nothing else", () => {
    // `02-F48`: the decision is made on the payload alone, "consulting no shift, no day, no
    // session scope, no peer, no clock and no network". A `store` appearing in this construction
    // is the exact repair the FR's own measured warning tells an implementer not to make.
    expect(mainSrc).toMatch(/refuseZeroTender\(\{\s*writes:\s*settlementGuarded\s*\}\)/);
    expect(mainSrc).not.toMatch(/refuseZeroTender\(\{[^}]*store/);
  });

  it("the chain the renderer's append channel travels is matrix → amount → duplicate → ledger", () => {
    // Every link, in order. Pinning only the outermost name goes green on a chain that silently
    // dropped a middle link — which is the whole failure this file is about.
    expect(mainSrc).toMatch(/refuseDoubleSettlement\(\{\s*writes:\s*gateway,\s*store\s*\}\)/);
    // ⚠ **THE INNER NAME MOVED IN AUGUST 2026 AND THE ASSERTION MOVED WITH IT.** The chain
    // gained `voidExitsLine` between the matrix and the amount guard (`02-F20`'s post-confirm
    // void appends the line's `01 §4` exit as part of one authorized act, so it must sit
    // INSIDE commandment 8 and OUTSIDE the two guards that refuse by throwing). Both links
    // are pinned rather than just the new outermost one — pinning the outermost alone is what
    // this test's own comment above says goes green on a chain that dropped a middle link.
    expect(mainSrc).toMatch(/voidExitsLine\(\{\s*writes:\s*tenderGuarded,\s*store\s*\}\)/);
    expect(mainSrc).toMatch(/authorizeWrites\(\{\s*writes:\s*voidGuarded,/);
    expect(mainSrc).toMatch(/CHANNELS\.append[\s\S]{0,200}writes\.append\(req\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE CHAIN, DRIVEN. §C is a string match; this is not.
//
// The three wrappers are composed here in the ORDER `index.ts` composes them, over a real store,
// and the two refusals are shown to be distinguishable and non-overlapping. A source read cannot
// tell you that composing them in that order still lets a real tender through — and a chain that
// refuses everything would satisfy every match above.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D — the composed chain refuses exactly two things and lands the rest", () => {
  const chain = (): { writes: RendererWrites; landed: string[]; store: DeviceStore } => {
    const dir = mkdtempSync(join(tmpdir(), "restos-closer-seam-"));
    dirs.push(dir);
    const store = openStore({
      path: join(dir, "device.db"),
      identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL },
    });
    let n = 0;
    const raw = (type: string, payload: Record<string, unknown>): void => {
      n += 1;
      store.append({
        id: `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`,
        org_id: ORG,
        branch_id: BRANCH,
        device_id: TILL,
        actor_user_id: "user-ayesha",
        device_created_at: 1_754_300_000_000 + n,
        type,
        schema_version: 1,
        payload,
        refs: [],
      });
    };
    raw("order.created", { order_id: ORDER_ID, channel: "counter", order_type: "takeaway" });
    raw("order.line_added", {
      order_id: ORDER_ID,
      line_id: LINE_A,
      item_id: "i-karahi",
      qty: 1,
      unit_price_paisa: BILL_PAISA,
    });

    const landed: string[] = [];
    const sink: RendererWrites = {
      append: (req: unknown): AppendResult => {
        const r = req as { type: string; payload: Record<string, unknown> };
        landed.push(r.type);
        raw(r.type, r.payload);
        return { id: `landed-${landed.length}` };
      },
      addLine: () => ({ id: "unused" }),
      toggleAvailability: () => ({ id: "unused" }),
      recordCustomer: () => ({ id: "unused" }),
      // `02-F64` stub — this fixture has no opinion about a customer link.
      linkCustomer: () => ({ id: "unused" }),
    };
    // The composition `index.ts` ships, minus the matrix (commandment 8 is `authorization.test.ts`'s
    // subject and wrapping it here would test that instead of this).
    const settlementGuarded = refuseDoubleSettlement({ writes: sink, store });
    return { writes: refuseZeroTender({ writes: settlementGuarded }), landed, store };
  };

  const tender = (amount_paisa: number, key: string) => ({
    type: "payment.recorded",
    payload: {
      order_id: ORDER_ID,
      amount_paisa,
      method: "cash",
      settlement_attempt_id: `0199aaaa-0000-7000-8000-${key.padStart(12, "0")}`,
      purpose: "settles_order",
      shift_id: null,
    },
    refs: [] as string[],
  });

  it("a Rs 0 tender is refused for being NOTHING, not for being a duplicate", () => {
    // The two refusals travel one channel and throw the same class. An assertion that something
    // merely threw cannot tell them apart — `F60`'s amendment-test defect — so this reads the
    // message, on a bill that is NOT covered, where only `02-F48` can be the reason.
    const { writes, landed } = chain();
    let refusal: unknown;
    try {
      writes.append(tender(0, "1"));
    } catch (error) {
      refusal = error;
    }
    expect(String((refusal as Error).message)).toMatch(/02-F48/);
    expect(String((refusal as Error).message)).not.toMatch(/DEC-MONEY-009/);
    expect(landed).toEqual([]);
  });

  it("a real tender lands through BOTH wrappers, and a second one is refused as a DUPLICATE", () => {
    // The negative control for the composition, and the `DEC-MONEY-009` half of it: adding the
    // zero guard must not shadow the duplicate guard, and the duplicate guard must not shadow the
    // zero guard. A chain that refused everything satisfies every source match in §B and §C.
    const { writes, landed } = chain();
    expect(() => writes.append(tender(BILL_PAISA, "2"))).not.toThrow();
    expect(landed).toEqual(["payment.recorded"]);

    let refusal: unknown;
    try {
      writes.append(tender(BILL_PAISA, "3"));
    } catch (error) {
      refusal = error;
    }
    expect(String((refusal as Error).message)).toMatch(/DEC-MONEY-009/);
    expect(landed).toEqual(["payment.recorded"]);
  });

  it("and the emitter, driven over the same chain, closes that bill exactly once", () => {
    // The whole loop as `index.ts` runs it: a tender through the guarded writes, then the closing
    // act off the completed append. `01-F63` gated on `01-F30`: this is the first time in this
    // product's life that `settled` reaches 1 on an order a cashier could actually have rung.
    const { writes, store } = chain();
    writes.append(tender(BILL_PAISA, "4"));
    const closer = createSettlementCloser({
      store,
      writes: {
        append: (req: unknown): AppendResult => {
          const r = req as { type: string; payload: Record<string, unknown> };
          store.append({
            id: "0199cccc-0000-7000-8000-0000000000ff",
            org_id: ORG,
            branch_id: BRANCH,
            device_id: TILL,
            actor_user_id: "user-ayesha",
            device_created_at: 1_754_300_009_999,
            type: r.type,
            schema_version: 1,
            payload: r.payload,
            refs: [],
          });
          return { id: "closed" };
        },
      },
    });
    closer.settled(ORDER_ID);

    const row = store.openOrders().find((o) => o.order_id === ORDER_ID);
    expect(row?.settled).toBe(1);
    expect(store.readAllEvents().filter((e) => e.type === "order.settlement_closed")).toHaveLength(
      1,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `settlement_attempt_ids` IS "THE KEYS THE COVER WAS MADE OF".
//
// ⚠ **THIS SECTION EXISTS BECAUSE OF A MEASURED SURVIVOR, and it is disclosed rather than quietly
// added.** The implementation's mutation matrix ran a mutant (`M14`) that replaced the filter
//
//     members.length === 1 && members[0]?.purpose !== REPAYMENT      →      members.length >= 1
//
// and it **SURVIVED at 65/65** — no fixture anywhere carried a khata repayment or a divergent
// attempt against an order that then closed, so both halves of that filter were unasserted. The
// round-3 law's own conclusion applies: reading the suite would not have found this, and a
// surviving mutant on a MONEY attestation is not something to report and move past.
//
// **Why the filter is right and the mutant is wrong**, so this is a defect closed rather than an
// implementation pinned to itself: `tendered_paisa` is the fold's `pay_total`, which excludes
// `repays_receivable` (`DEC-MONEY-007`) and contributes ZERO for a divergent key (`01-F31`'s
// contested head). Naming such a key here would attest keys that the attested TOTAL does not
// contain — an act whose two halves disagree, permanently, under `01-F1`. `printing.ts` walks the
// same map under the same two rules for `02-F15`'s receipt, which is the precedent.
//
// Implementer-authored, like the rest of this file, and owed the same independent oracle pass.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 01-F63 — the attested keys are the keys that made the cover", () => {
  const PEER = "00000000-0000-7000-8000-000000000004";

  /** A store with a Rs 2,240 bill, and both `append` (this till) and `ingest` (a peer). */
  const twoOrigins = () => {
    const dir = mkdtempSync(join(tmpdir(), "restos-closer-keys-"));
    dirs.push(dir);
    const store = openStore({
      path: join(dir, "device.db"),
      identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL },
    });
    let n = 0;
    let peerLamport = 0;
    const raw = (device_id: string, type: string, payload: Record<string, unknown>): void => {
      n += 1;
      const id = `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`;
      const at = 1_754_300_000_000 + n;
      if (device_id === TILL) {
        store.append({
          id,
          org_id: ORG,
          branch_id: BRANCH,
          device_id,
          actor_user_id: "user-ayesha",
          device_created_at: at,
          type,
          schema_version: 1,
          payload,
          refs: [],
        });
        return;
      }
      peerLamport += 1;
      store.ingest({
        id,
        org_id: ORG,
        branch_id: BRANCH,
        device_id,
        actor_user_id: "user-bilal",
        lamport_seq: peerLamport,
        device_created_at: at,
        branch_created_at: at,
        time_basis: "branch",
        server_received_at: null,
        type,
        schema_version: 1,
        payload,
        refs: [],
      });
    };
    raw(TILL, "order.created", { order_id: ORDER_ID, channel: "counter", order_type: "takeaway" });
    raw(TILL, "order.line_added", {
      order_id: ORDER_ID,
      line_id: LINE_A,
      item_id: "i-karahi",
      qty: 1,
      unit_price_paisa: BILL_PAISA,
    });
    return { store, raw };
  };

  const closerOver = (store: DeviceStore) => {
    const emitted: Record<string, unknown>[] = [];
    return {
      emitted,
      closer: createSettlementCloser({
        store,
        writes: {
          append: (req: unknown): AppendResult => {
            emitted.push((req as { payload: Record<string, unknown> }).payload);
            return { id: "closed" };
          },
        },
      }),
    };
  };

  const COVER = "0199aaaa-0000-7000-8000-00000000c0a1";
  const REPAY = "0199aaaa-0000-7000-8000-00000000c0a2";
  const SPLIT = "0199aaaa-0000-7000-8000-00000000c0a3";

  it("DEC-MONEY-007 — a khata REPAYMENT's key is not one of them", () => {
    // The repayment is a genuine `payment.recorded` against the same order, with its own
    // `01-F31` key, and `pay_total` deliberately excludes its amount. So the act attests
    // Rs 2,240 tendered — and naming the repayment's key beside that figure would say the cover
    // was made of a payment that contributed nothing to it.
    const { store, raw } = twoOrigins();
    raw(TILL, "payment.recorded", {
      order_id: ORDER_ID,
      amount_paisa: BILL_PAISA,
      method: "cash",
      settlement_attempt_id: COVER,
      purpose: "settles_order",
      shift_id: null,
    });
    raw(TILL, "payment.recorded", {
      order_id: ORDER_ID,
      amount_paisa: 185_000,
      method: "khata_credit",
      settlement_attempt_id: REPAY,
      purpose: "repays_receivable",
      shift_id: null,
    });
    const { closer, emitted } = closerOver(store);
    closer.settled(ORDER_ID);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.tendered_paisa, "the fixture is not exercising the repayment path").toBe(
      BILL_PAISA,
    );
    expect(emitted[0]?.settlement_attempt_ids).toEqual([COVER]);
  });

  it("01-F31 — a DIVERGENT attempt's key is not one of them either", () => {
    // Two devices, one key, different payloads: `01-F31`'s contested head. It contributes ZERO to
    // `pay_total`, is rendered and never picked — so the cover here is the Rs 2,240 tender alone,
    // and the disputed key must not appear beside a total it is excluded from.
    const { store, raw } = twoOrigins();
    raw(TILL, "payment.recorded", {
      order_id: ORDER_ID,
      amount_paisa: BILL_PAISA,
      method: "cash",
      settlement_attempt_id: COVER,
      purpose: "settles_order",
      shift_id: null,
    });
    raw(TILL, "payment.recorded", {
      order_id: ORDER_ID,
      amount_paisa: 50_000,
      method: "cash",
      settlement_attempt_id: SPLIT,
      purpose: "settles_order",
      shift_id: null,
    });
    raw(PEER, "payment.recorded", {
      order_id: ORDER_ID,
      amount_paisa: 70_000,
      method: "cash",
      settlement_attempt_id: SPLIT,
      purpose: "settles_order",
      shift_id: null,
    });
    const row = store.openOrders().find((o) => o.order_id === ORDER_ID);
    expect(JSON.parse(row?.exceptions_json ?? "[]"), "the fixture produced no dispute").toContain(
      "attempt_divergence",
    );
    expect(row?.pay_total, "a disputed key contributed to the total").toBe(BILL_PAISA);

    const { closer, emitted } = closerOver(store);
    closer.settled(ORDER_ID);

    expect(emitted[0]?.settlement_attempt_ids).toEqual([COVER]);
  });
});
