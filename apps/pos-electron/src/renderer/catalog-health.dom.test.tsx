// `01-F56` / `DEC-SYNC-011` (a) / `00 §5.7` — the counter, with its menu stuck.
//
// The `packages/ui` half of this is `catalog-health.dom.test.tsx` over there, and it asserts what
// the COMPONENT does. This file asserts what the SHIPPED SCREEN does with the seam's answer,
// which is a different claim: `Counter` reads `deviceState()` and hands `AppShell` a dozen props,
// and the wave's named defect is precisely a correct component the application does not reach.
//
// ⚠ happy-dom performs NO LAYOUT, so nothing here is evidence that the chip is ON the screen —
// only that it is in the document. `pnpm layout:check` owns the other half and its fixture raises
// this exact condition on both of `27 §1a`'s panels.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceState, RestosBridge } from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

const REFUSAL = {
  version: 4,
  message: "this till refused the update it was sent — it needs a full menu, not a change list",
} as const;

/**
 * Every link HEALTHY, throughout. That is not a convenience — it is the case the surface exists
 * for. A device that cannot reach the cloud already says so three chips to the left, and if this
 * harness ran with `cloud: "down"` it could not tell a refused menu from a dead link, which is
 * the conflation the whole task was set to prevent.
 */
const deviceState = (over: Partial<DeviceState> = {}): DeviceState => ({
  actor: "Ayesha Khan",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-08",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "ok",
  blocked: null,
  catalog: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha Khan" },
  ...over,
});

/**
 * Mount the shipped `Counter` over a scripted bridge, and hand back the `changed` PUSH.
 *
 * The push is real rather than a convenience: `main` notifies and the renderer re-reads
 * `deviceState()` — there is no polling anywhere in this app — so a test that swapped the state
 * by re-rendering would be exercising a refresh path the product does not have.
 */
const mount = (initial: DeviceState) => {
  let state = initial;
  const listeners = new Set<() => void>();
  const bridge: Partial<RestosBridge> = {
    deviceState: () => Promise.resolve(state),
    openOrders: () => Promise.resolve([]),
    kitchenQueue: () => Promise.resolve([]),
    menu: () => Promise.resolve([]),
    staff: () => Promise.resolve([]),
    cashState: () =>
      Promise.resolve({
        shifts: [],
        days: [],
        unbound: [],
        unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
      }),
    alarms: () => Promise.resolve([]),
    acknowledgeAlarm: () => Promise.resolve(),
    append: () => Promise.resolve({ id: "evt" }),
    addLine: () => Promise.resolve({ id: "evt" }),
    unlock: () => Promise.resolve({ unlocked: true }),
    onChanged: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  vi.stubGlobal("restos", bridge);
  Object.defineProperty(globalThis, "window", {
    value: Object.assign(globalThis.window, { restos: bridge }),
    writable: true,
    configurable: true,
  });
  render(<Counter />);
  /** What main does when the folds — or the cloud session's catalog health — move. */
  return (next: DeviceState) => {
    state = next;
    for (const fn of listeners) fn();
  };
};

describe("01-F56 — the counter says when it is refusing its menu", () => {
  it("draws nothing about the catalog while the menu is current (27-F16)", async () => {
    mount(deviceState());
    // Wait for the seam's first answer, or this asserts the absence of a surface that has not
    // rendered yet — a pass for the wrong reason, which is the round-2 vacuity pattern.
    await screen.findByText(/Counter 1/);
    expect(screen.queryByText(/NOT UPDATING/)).toBeNull();
  });

  it("raises the notice on the strip when the seam reports a refusal", async () => {
    mount(deviceState({ catalog: REFUSAL }));
    expect(await screen.findByText("NOT UPDATING")).toBeTruthy();
    // `27-F12`'s number — the menu she is actually selling from.
    expect(screen.getByText(/still showing v4/)).toBeTruthy();
    expect(screen.getByText(REFUSAL.message)).toBeTruthy();
  });

  it("says something DIFFERENT from the reachability chips, on the same healthy links", async () => {
    // The whole point, asserted as one observation: `Cloud OK` and `Menu NOT UPDATING` are on
    // screen together. Before this work the till rendered only the first, and it was true.
    mount(deviceState({ catalog: REFUSAL }));
    await screen.findByText("NOT UPDATING");
    expect(screen.getByLabelText("Cloud: ok")).toBeTruthy();
    expect(screen.getByLabelText(/Menu: not updating/)).toBeTruthy();
  });

  it("27-F11d — the work surface is still there and still usable underneath", async () => {
    mount(deviceState({ catalog: REFUSAL }));
    await screen.findByText("NOT UPDATING");
    // No modal, nothing removed. `27-F11d`'s ruling is that a half-built cart is never taken
    // away from a cashier with a customer waiting, and `01-F53` is why this is safe: the prices
    // already captured into her open order are unaffected by a catalog that cannot update.
    for (const tab of ["Order", "Orders", "Pay", "Cash", "Me"]) {
      expect(screen.getByText(tab), `${tab} left the rail under a catalog refusal`).toBeTruthy();
    }
  });

  it("follows the seam in BOTH directions, on main's own `changed` push", async () => {
    // `01-F56` refusals clear the moment an update applies (`cloud-session.ts` sets
    // `catalogRefusal = null` on a successful apply). A chip that latched would be a permanent
    // false alarm on a healthy till, which `27-F16` says is what makes the real one invisible —
    // and it is the failure `ConnectionFacts` actually shipped with two red blocks.
    //
    // Driven through `onChanged`, which is the only refresh path this app has: no reload, no
    // remount, no polling.
    const push = mount(deviceState({ catalog: REFUSAL }));
    await screen.findByText("NOT UPDATING");

    push(deviceState({ catalog: null }));
    await waitFor(() => {
      expect(screen.queryByText(/NOT UPDATING/)).toBeNull();
    });

    // And back, so this cannot pass against a screen that simply stopped drawing it.
    push(deviceState({ catalog: { version: 9, message: "the cloud stopped sending the menu" } }));
    await screen.findByText("NOT UPDATING");
    expect(screen.getByText(/still showing v9/)).toBeTruthy();
  });
});
