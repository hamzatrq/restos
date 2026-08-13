/**
 * ACCEPTANCE TESTS — `02-F49`'s confirm-boundary guard, and the SEAMS that carry `C8`'s removal
 * and `C7`'s note from a cashier's tap to the ledger, the cart and the kitchen chit.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read `specs/02-pos-app.md`,
 * `specs/03-kitchen-fulfillment.md`, `specs/01-kernel-sync.md` and `restaurant-os.md`'s Appendix A
 * and B, and that did not write the implementation it describes (`24 §3` step 2). Read-only to the
 * implementing session.
 *
 * ## WHY THIS FILE IS THE MOST IMPORTANT ONE IN THE TRACK
 *
 * `AGENTS.md` names this wave's recurring defect thirteen times over: **a correct subsystem with no
 * seam to the product.** Both halves of this track are already sitting in that state before a line
 * is written — `packages/ui`'s `Cart` has declared `onRemove` throughout and `Counter.tsx` has
 * never passed it; `OpenOrder.lines[].note` is declared, schema-checked, rendered by
 * `QuantityItemLine`, and `main/gateway.ts` hardcodes `note: null`. Every gate is green over both.
 *
 * So the schema oracle, the fold oracle and the UI oracle can each pass in full while a cashier
 * still cannot take a Coke off an order. This file is the assertion that the product REACHES them,
 * and it drives a REAL store and the REAL folds for the reason `availability-seam.test.ts` states:
 * a stubbed projection lets a suite assert its own fixture (K-3's dead-oracle defect) and passes
 * against a gateway that appends nothing at all.
 *
 * ## §0 — PINNED INTERPRETATIONS (`24 §3b`)
 *
 * **S1 — both types map to `order.create` in `WRITE_ACTIONS`, and NO new `PermissionAction` is
 * minted.** `02-F49` rules it: Appendix A's *"Create order / print KOT"* row already covers order
 * capture, `order.line_added → order.create` already ships, and Appendix B names the attributed
 * acts as *"order, **line add/remove**, discount, void, comp, reprint, drawer open, settlement"* —
 * add and remove in one clause, one act — while listing *"item notes"* under **Order capture**.
 * This is the OPPOSITE case to `02-F46`/`02-F47`/`14-F30`: those three minted actions because
 * Appendix A had **no row at all**, so the fail-closed default denied every attempt.
 *   *The alternative, named:* a fresh `order.correct` action. Refused as the speculative widening
 *   `24-F23` forbids — and it would have to be `allow` for a cashier anyway, since `02-F8` calls
 *   the pre-confirm removal a plain event.
 *
 * **S2 — the guard is a synchronous read of `store.openOrders()[…].confirmed_at`, and nothing
 * else.** `DEC-MONEY-009`'s pattern, restated by `02-F49`: no peer, no lock, no clock, no network.
 * `02-F8`'s boundary is `order.confirmed` and the fold already publishes it as the anchor
 * `03-F25`'s timers read.
 *   *Why NOT `kot.printed`:* `02-F9` puts KOT jobs *"after confirm, never before"*, so the confirm
 *   is the boundary; keying on the print fact would let a removal through for exactly as long as a
 *   printer was offline (`03-F5`) or absent (`03-F51`'s screen-only station).
 *
 * **S3 — the refusal is a REFUSAL, not a silent no-op and not a thrown crash.** `01-F17` is
 * unharmed — no sale is blocked, the order is still settleable, and `02-F49` requires the
 * `02-F20` escalation to remain reachable for the same line. What must never happen is the event
 * landing anyway: `01-F1` makes it permanent, unattributed to any approver, and `01-F30` has no
 * term to balance it with.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT ASSERT
 *
 * - **The screen.** `apps/pos-electron/src/renderer/line-correction.dom.test.tsx` owns the
 *   controls; `packages/ui`'s `cart-correction.dom.test.tsx` owns the component.
 * - **Any geometry.** `pnpm layout:check` owns it, and its own limits are in `AGENTS.md`.
 * - **The escalation's own behaviour.** `escalation.test.ts` and `manager-approval.dom.test.tsx`
 *   already own `02-F20`'s local path; this file asserts only that the refusal names it as
 *   available, so a cashier is not left with a dish nobody can take off the bill.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { PERMISSION_ACTIONS } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { WRITE_ACTIONS } from "../authorize";
import { createGateway, type Gateway, type GatewayDeps } from "../gateway";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;
const KARAHI = "i-karahi";
const COKE = "i-coke";
const PRICES: Record<string, Record<string, number>> = {
  [KARAHI]: { counter: 45_000 },
  [COKE]: { counter: 6_000 },
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const harness = (over: Partial<GatewayDeps> = {}): { store: DeviceStore; gateway: Gateway } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-line-correction-"));
  dirs.push(dir);
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const gateway = createGateway({
    store,
    catalog: (id) => (id === KARAHI ? { name: "Chicken Karahi" } : { name: "Coke" }),
    menu: () => [
      { id: KARAHI, name: "Chicken Karahi" },
      { id: COKE, name: "Coke" },
    ],
    priceOf: (item_id, channel) => PRICES[item_id]?.[channel] ?? null,
    actor: "dev",
    session: () => ({ user_id: "u-ayesha", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-10",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
    ...over,
  });
  return { store, gateway };
};

/** One counter order with two lines, exactly as the counter builds it (`C4` then `C5` twice). */
const twoLineOrder = (gateway: Gateway): { order_id: string; karahi: string; coke: string } => {
  const order_id = `O-${Math.random().toString(36).slice(2, 10)}`;
  gateway.append({
    type: "order.created",
    payload: { order_id, channel: "counter", order_type: "takeaway" },
    refs: [],
  });
  gateway.addLine({ order_id, item_id: KARAHI, qty: 1 });
  gateway.addLine({ order_id, item_id: COKE, qty: 2 });
  const order = gateway.openOrders().find((o) => o.order_id === order_id);
  if (order === undefined) throw new Error("the order the gateway just created is not open");
  const karahi = order.lines.find((l) => l.name === "Chicken Karahi")?.line_id;
  const coke = order.lines.find((l) => l.name === "Coke")?.line_id;
  if (karahi === undefined || coke === undefined) throw new Error("expected two named lines");
  return { order_id, karahi, coke };
};

const orderOf = (gateway: Gateway, order_id: string) => {
  const found = gateway.openOrders().find((o) => o.order_id === order_id);
  if (found === undefined) throw new Error(`order ${order_id} is not open`);
  return found;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — commandment 8: both acts are authorized by the MATRIX, and neither invents an action.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F49/commandment 8 — the matrix has something to refuse against", () => {
  /**
   * `authorize.ts`'s own header states the consequence of omission: *"an event type absent from
   * `WRITE_ACTIONS` below is REFUSED rather than waved through"*. So without these two rows the
   * fail-closed default denies every removal and every note for **every role including owner** —
   * which is the state `02-F46` records for the availability toggle (*"the feature could not exist
   * without this row"*) and `02-F47` for the customer file. This is the same shape, resolved the
   * other way because Appendix A already has the row.
   */
  it.each(["order.line_removed", "order.note_added"])(
    "%s maps to a matrix action rather than hitting the fail-closed default",
    (type) => {
      expect(
        WRITE_ACTIONS[type],
        `${type} has no WRITE_ACTIONS row — every attempt is DENIED for every role, so the ` +
          "control cannot exist rather than merely being unbuilt",
      ).toBeDefined();
    },
  );

  it("S1: both ride `order.create` — the row Appendix A already has, not a new action", () => {
    // `02-F49` argues this at length and names the alternative. The pin is here rather than in a
    // comment because a session reading `02-F46`/`02-F47` in sequence will see two consecutive
    // precedents for MINTING an action and copy the pattern rather than the reasoning.
    expect(WRITE_ACTIONS["order.line_removed"]).toBe("order.create");
    expect(WRITE_ACTIONS["order.note_added"]).toBe("order.create");
    expect(
      WRITE_ACTIONS["order.line_added"],
      "the two corrections must share the ACT they correct — a divergence here means one of the " +
        "three can be narrowed without the others",
    ).toBe("order.create");
  });

  it("no new PermissionAction was minted for either (24-F23 — no speculative widening)", () => {
    const actions: readonly string[] = PERMISSION_ACTIONS;
    for (const invented of ["order.correct", "order.remove_line", "order.note", "order.amend"]) {
      expect(
        actions.includes(invented),
        `${invented} was added to the matrix — 02-F49 rules that Appendix A's "Create order" row ` +
          "already covers order capture, and an unused cell is a permission nobody can reason about",
      ).toBe(false);
    }
  });

  it("CONTROL — the POST-confirm act keeps its own, DIFFERENT row (the dagger in the matrix)", () => {
    // What makes `02-F8`'s boundary observable in the permission matrix rather than only inside a
    // guard: a void is a different action with a different verdict for a cashier (`escalate`),
    // and that must not be quietly widened to `order.create` by a session "unifying" the family.
    expect(WRITE_ACTIONS["void.recorded"]).toBe("order.void_after_kot");
    expect(WRITE_ACTIONS["void.recorded"]).not.toBe(WRITE_ACTIONS["order.line_removed"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the SEAM: an appended removal reaches the cart and the money. The recurring defect.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F8/01-F30 — the removal travels tap → ledger → fold → cart", () => {
  it("the removed line is gone from the gateway's own openOrders, and the other is not", () => {
    const { gateway } = harness();
    const { order_id, coke } = twoLineOrder(gateway);
    expect(orderOf(gateway, order_id).lines).toHaveLength(2);

    gateway.append({ type: "order.line_removed", payload: { order_id, line_id: coke }, refs: [] });

    const after = orderOf(gateway, order_id);
    expect(after.lines.map((l) => l.name)).toEqual(["Chicken Karahi"]);
    expect(
      after.total_paisa,
      "01-F30: the customer is still being billed for the Coke she refused",
    ).toBe(45_000);
  });

  it("01-F53: the price that leaves is the one the EVENT captured, not a re-derived one", () => {
    // The Coke is 2 × 6,000. A gateway that subtracted one unit price, or re-read the catalog at
    // removal time, produces a smaller-but-wrong total — and `01-F1` makes the bill permanent.
    const { gateway } = harness();
    const { order_id, karahi } = twoLineOrder(gateway);
    expect(orderOf(gateway, order_id).total_paisa).toBe(45_000 + 2 * 6_000);

    gateway.append({
      type: "order.line_removed",
      payload: { order_id, line_id: karahi },
      refs: [],
    });
    expect(orderOf(gateway, order_id).total_paisa).toBe(2 * 6_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — 02-F49: the confirm boundary. The security half of this track.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F49/02-F8 — after confirm, a removal is REFUSED and the void path is offered", () => {
  /**
   * ⚠ **THE ASSERTION §C EXISTS FOR, and the one with a theft vector behind it.** Without the
   * guard, `order.line_removed` is schema-valid at any time: a cashier rings a Rs 4,500 karahi,
   * confirms it so the KOT prints and the kitchen cooks it, removes the line, and settles a bill
   * that no longer contains it. The event is permanent (`01-F1`), carries no approver, and
   * `01-F30` has **no `removed_value` term** to make the shortfall visible in any reconciliation.
   * Appendix A's *"Void after KOT printed → needs Mgr PIN"* row is bypassed by an event type.
   *
   * `01-F4` cannot close it — whether an order is confirmed is a fold fact no payload carries —
   * and the fold must not, because a fold that refused history would diverge from the cloud
   * Auditor's refold (`01-F7`). `main` is the only place left, which is `02-F49`'s ruling.
   */
  it("a removal AFTER order.confirmed is refused", () => {
    const { gateway } = harness();
    const { order_id, coke } = twoLineOrder(gateway);
    gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });

    expect(() =>
      gateway.append({
        type: "order.line_removed",
        payload: { order_id, line_id: coke },
        refs: [],
      }),
    ).toThrow();
  });

  it("S3: the refused removal did NOT reach the ledger — 01-F1 would make it permanent", () => {
    // The half that matters more than the throw. A guard that raised AFTER the append, or that
    // logged and continued, satisfies the test above and still writes the event.
    const { store, gateway } = harness();
    const { order_id, coke } = twoLineOrder(gateway);
    gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });
    try {
      gateway.append({
        type: "order.line_removed",
        payload: { order_id, line_id: coke },
        refs: [],
      });
    } catch {
      // The refusal is the subject of the test above; here only its effect on the ledger matters.
    }

    expect(
      store.readOwnEvents().map((e) => e.type),
      "the refusal was cosmetic — the removal is in the ledger and 01-F1 forbids taking it back",
    ).not.toContain("order.line_removed");
    expect(orderOf(gateway, order_id).lines).toHaveLength(2);
  });

  it("the refusal names 02-F20's escalation, so the cashier is not left with an uncorrectable dish", () => {
    // `02-F49`: "A refusal is never a dead end." `27-F5` forbids the control that disappears
    // instead, and a cook holding a returned dish nobody can take off the bill is worse than the
    // unguarded state. The assertion is on the REASON the seam gives, not on its wording: what is
    // pinned is that the refusal is distinguishable from every other refusal this seam raises, so
    // the renderer can route it to `ManagerApproval` rather than to a generic band.
    const { gateway } = harness();
    const { order_id, coke } = twoLineOrder(gateway);
    gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });

    let message = "";
    try {
      gateway.append({
        type: "order.line_removed",
        payload: { order_id, line_id: coke },
        refs: [],
      });
    } catch (error) {
      message = String((error as Error).message ?? error);
    }
    expect(message.toLowerCase()).toMatch(/void|approv|escalat/);
  });

  it("CONTROL — the SAME removal BEFORE confirm is accepted (the guard is on the boundary)", () => {
    // The one-branch control, and the reason it is not optional: a guard that refused every
    // removal passes all three assertions above and deletes `C8` entirely, which is the failure
    // this whole track exists to end. `02-F49`'s guard is about WHEN, never about WHETHER.
    const { gateway } = harness();
    const { order_id, coke } = twoLineOrder(gateway);
    gateway.append({ type: "order.line_removed", payload: { order_id, line_id: coke }, refs: [] });
    expect(orderOf(gateway, order_id).lines).toHaveLength(1);
  });

  it("CONTROL — a POST-confirm void is still accepted (01-F17: the correction path stays open)", () => {
    // `02-F49` requires the escalation to complete the act as `void.recorded`. A guard that
    // over-reached and blocked the void too would leave a confirmed order permanently
    // uncorrectable — worse than the state before this track.
    const { gateway } = harness();
    const { order_id } = twoLineOrder(gateway);
    gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });
    expect(() =>
      gateway.append({
        type: "void.recorded",
        payload: {
          order_id,
          amount_paisa: 12_000,
          reason: "customer returned the dish",
          approver_user_id: "u-hina",
        },
        refs: [],
      }),
    ).not.toThrow();
  });

  it("00 §5.1: the guard consults NOTHING off this device — it works with every link down", () => {
    // `DEC-MONEY-009`'s constraint, restated by `02-F49`. The harness above already reports `lan`,
    // `hub` and `cloud` all DOWN, so a guard that reached for a peer or the WAN could not answer
    // at all — and `01-F17`/`00 §5.1` forbid a till that stops selling when the WAN drops. This
    // asserts the ordinary pre-confirm path still completes under exactly those conditions.
    const { gateway } = harness();
    const { order_id, karahi } = twoLineOrder(gateway);
    expect(gateway.deviceState().cloud).toBe("down");
    gateway.append({
      type: "order.line_removed",
      payload: { order_id, line_id: karahi },
      refs: [],
    });
    expect(orderOf(gateway, order_id).lines.map((l) => l.name)).toEqual(["Coke"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — the NOTE's seam, which is hardcoded `null` today in two separate files.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F6 — the note reaches the cart and the chit, not a hardcoded null", () => {
  /**
   * ⚠ **THE SEAM THAT DOES NOT EXIST TODAY, in the wave's exact shape.**
   * `main/gateway.ts`'s `linesFrom` writes `note: null` with the comment *"The read models carry
   * no modifier or note detail yet"* — true when written, and the whole chain downstream of it is
   * already built: `OpenOrderSchema.lines[].note` is declared, `Counter.tsx` forwards it, and
   * `QuantityItemLine` renders it. One literal is the entire gap.
   */
  it("a note appended on this device comes back on ITS line", () => {
    const { gateway } = harness();
    const { order_id, karahi } = twoLineOrder(gateway);
    gateway.append({
      type: "order.note_added",
      payload: { order_id, line_id: karahi, note: "less spicy" },
      refs: [],
    });

    const lines = orderOf(gateway, order_id).lines;
    const noted = lines.find((l) => l.line_id === karahi);
    expect(
      noted?.note,
      "02-F6's note reaches the fold and `linesFrom` still hardcodes `note: null` — the cashier " +
        "sees nothing and the kitchen is told nothing",
    ).toContain("less spicy");
  });

  it("CONTROL — the OTHER line still carries no note", () => {
    // Without this, `note: "less spicy"` hardcoded onto every line passes the test above.
    const { gateway } = harness();
    const { order_id, karahi, coke } = twoLineOrder(gateway);
    gateway.append({
      type: "order.note_added",
      payload: { order_id, line_id: karahi, note: "less spicy" },
      refs: [],
    });
    const lines = orderOf(gateway, order_id).lines;
    expect(lines.find((l) => l.line_id === coke)?.note).toBeNull();
  });

  it("02-F50: TWO tags on one line both reach the cart", () => {
    // The pick-list case. A seam that rendered `notes[0]` — the natural way to squeeze an array
    // into `OpenOrder.lines[].note`'s single string — passes the first test in this section and
    // silently drops *"no peanuts"*, which `27-F59` calls an allergen incident on the paper side.
    const { gateway } = harness();
    const { order_id, karahi } = twoLineOrder(gateway);
    for (const note of ["no peanuts", "less spicy"]) {
      gateway.append({
        type: "order.note_added",
        payload: { order_id, line_id: karahi, note },
        refs: [],
      });
    }
    const noted = orderOf(gateway, order_id).lines.find((l) => l.line_id === karahi);
    expect(noted?.note).toContain("no peanuts");
    expect(noted?.note).toContain("less spicy");
  });

  it("03-F56: the note is on the KITCHEN ticket too — that is where 02-F6 sends it", () => {
    // `kitchenQueue()` is what `main/printing.ts` builds `KotData` from, and `KitchenTicketSchema`
    // reuses `OpenOrderSchema.shape.lines` — so a note that reaches the cart and not the queue is
    // a note the cook never gets, which is the half `02-F6` actually cares about.
    const { gateway } = harness();
    const { order_id, karahi } = twoLineOrder(gateway);
    gateway.append({
      type: "order.note_added",
      payload: { order_id, line_id: karahi, note: "less spicy" },
      refs: [],
    });
    gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });

    const ticket = gateway.kitchenQueue().find((t) => t.order_id === order_id);
    expect(ticket, "the confirmed order is not on the kitchen queue").toBeDefined();
    expect(ticket?.lines.find((l) => l.line_id === karahi)?.note).toContain("less spicy");
  });

  it("a note on a line that is then REMOVED leaves with it", () => {
    // M4 in the fold oracle, asserted at the seam because the consequence is physical: a chit
    // printing "less spicy" with no dish above it, which `03-F56` gives no legal place to render.
    const { gateway } = harness();
    const { order_id, karahi } = twoLineOrder(gateway);
    gateway.append({
      type: "order.note_added",
      payload: { order_id, line_id: karahi, note: "less spicy" },
      refs: [],
    });
    gateway.append({
      type: "order.line_removed",
      payload: { order_id, line_id: karahi },
      refs: [],
    });

    const lines = orderOf(gateway, order_id).lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]?.note).toBeNull();
  });
});
