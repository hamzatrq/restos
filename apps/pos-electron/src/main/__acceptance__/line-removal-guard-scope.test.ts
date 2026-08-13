/**
 * TRIPWIRES — the three properties `02-F49`'s guard STATES in prose and that nothing asserted.
 *
 * **Not an oracle.** `line-correction-seam.test.ts` is the `24 §3` acceptance suite for this
 * track, authored from spec text by a session that did not implement it, and it is read-only.
 * This file is the adversarial round's output: each `it` below closes a mutant that survived the
 * whole suite — 984 tests in `apps/pos-electron`, 732 in `packages/sync-client`, zero failures —
 * and each names the mutant it kills, so a later reader can re-run the attribution rather than
 * trust this header.
 *
 * `line-removal-guard.ts` is unusually explicit about its own boundaries, and that is exactly why
 * the gap was invisible: **three of its stated properties were carried by the prose alone.** A
 * comment is not a test, and `AGENTS.md` records the sharper version — *a comment promising a
 * protection that does not exist is worse than no comment, because it retires the hand-written
 * assertion someone would otherwise write.* One of the three below is that failure verbatim.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
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

/** A REAL store and the REAL folds, for `line-correction-seam.test.ts`'s stated reason. */
const harness = (over: Partial<GatewayDeps> = {}): { store: DeviceStore; gateway: Gateway } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-guard-scope-"));
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

const twoLineOrder = (gateway: Gateway): { order_id: string; coke: string } => {
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
  const coke = order.lines.find((l) => l.name === "Coke")?.line_id;
  if (coke === undefined) throw new Error("expected a Coke line");
  return { order_id, coke };
};

describe("02-F49 — the guard's stated scope, which only prose was holding", () => {
  /**
   * **The comment that was false.** `line-removal-guard.ts` says of `removal_after_confirm`:
   * *"The property is attached anyway because the SUITE asserts on it, and an assertion on the
   * message alone could not tell 'refused for being post-confirm' from any refusal."*
   *
   * The suite did not. A symbol-precise search for `removal_after_confirm` across `apps/`,
   * `services/` and `packages/` returned **one file — the guard itself** — so the discriminator
   * was produced by one line and consumed by nobody, which is `Uplink.catalogRefusal`'s shape and
   * this wave's named recurring defect. Measured: deleting `error.removal_after_confirm = fact;`
   * failed **0 of 984** `pos-electron` tests.
   *
   * It matters beyond tidiness because `02-F49` requires the refusal to hand the operator
   * `02-F20`'s escalation *for the same line*. A renderer can only route on a discriminator; the
   * existing assertion is `expect(message.toLowerCase()).toMatch(/void|approv|escalat/)`, which is
   * the wording match that comment says is insufficient — and it would pass for any future refusal
   * on this seam whose sentence happens to contain the word "approved".
   */
  it("the refusal carries the machine-readable fact, not only words a renderer cannot route on", () => {
    const { gateway } = harness();
    const { order_id, coke } = twoLineOrder(gateway);
    gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });

    let caught: unknown;
    try {
      gateway.append({
        type: "order.line_removed",
        payload: { order_id, line_id: coke },
        refs: [],
      });
    } catch (error) {
      caught = error;
    }

    const fact = (caught as { removal_after_confirm?: Record<string, unknown> } | undefined)
      ?.removal_after_confirm;
    expect(
      fact,
      "the guard's discriminator is produced and consumed by nobody — a renderer cannot tell this refusal from any other, so 02-F49's escalation cannot be offered for THIS line",
    ).toBeDefined();
    expect(fact?.order_id).toBe(order_id);
    expect(fact?.line_id).toBe(coke);
    // `01-F43`'s branch stamp on the confirm anchor: the fact names WHY, not just THAT.
    expect(typeof fact?.confirmed_at).toBe("number");
  });

  /**
   * **The guard is about WHEN a REMOVAL may be issued, and about nothing else.**
   *
   * `02-F49` scopes itself to `order.line_removed` in every clause — `01 §4`'s dagger splits
   * *"line removal"* pre/post confirm, and no FR anywhere puts a boundary on `order.note_added`.
   * Widening the guard to refuse a post-confirm note would be commandment 2: inventing policy the
   * catalog does not carry. It is also the wrong direction on the merits — a note after confirm is
   * the *"no chili, he's allergic"* the customer says while the cook is already working, and
   * `27-F59` calls a missed removal instruction an allergen incident rather than a preference miss.
   *
   * Measured: adding `&& req.type !== "order.note_added"` to the guard's type check failed
   * **0 of 984** tests. The scope was pinned by nothing.
   */
  it("a note added AFTER confirm is still accepted — 02-F49 bounds removals, not notes", () => {
    const { gateway } = harness();
    const { order_id, coke } = twoLineOrder(gateway);
    gateway.append({ type: "order.confirmed", payload: { order_id }, refs: [] });

    expect(() =>
      gateway.append({
        type: "order.note_added",
        payload: { order_id, line_id: coke, note: "no chili" },
        refs: [],
      }),
    ).not.toThrow();

    const line = gateway
      .openOrders()
      .find((o) => o.order_id === order_id)
      ?.lines.find((l) => l.line_id === coke);
    expect(line?.note, "the late note never reached the projection the chit is built from").toBe(
      "no chili",
    );
  });

  /**
   * **Absence of local evidence is not evidence of a confirm — the `01-F17` direction.**
   *
   * The guard's own comment: *"An order this device has never seen is NOT confirmed here, and that
   * is deliberate … refusing on absence would refuse every removal on a till that has not yet
   * caught up — an `01-F17` break in the one direction `02-F49` is not about."* Nothing asserted
   * it: making the guard fail CLOSED on a missing row failed **0 of 984** tests.
   *
   * ⚠ **Honest scope.** The shipped counter only ever removes a line from an order it drew out of
   * `store.openOrders()`, so this branch is not reachable from today's UI — and `01-F15`'s LAN
   * mesh is hosted by nothing, so the catch-up case the comment describes cannot arise from the
   * shipped binary either (`AGENTS.md`'s instance 13). This pins the decision so that the day a
   * second till or a catch-up path lands, the till fails OPEN as designed rather than silently
   * refusing corrections on every order it has not yet folded.
   */
  it("a removal against an order this device has never seen is ACCEPTED, never refused", () => {
    const { store, gateway } = harness();

    expect(() =>
      gateway.append({
        type: "order.line_removed",
        payload: { order_id: "O-never-delivered", line_id: "L-unknown" },
        refs: [],
      }),
    ).not.toThrow();

    expect(
      store.readOwnEvents().map((e) => e.type),
      "the guard refused on ABSENCE — a till that has not caught up would decline every correction",
    ).toContain("order.line_removed");
  });
});
