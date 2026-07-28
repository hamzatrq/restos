import { paisa } from "@restos/domain";
import { AppShell, Cart, ItemGrid, type Tab, usePhysicalSize } from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import type { DeviceState, MenuItem, OpenOrder } from "../shared/ipc";

/**
 * The counter screen — the first RestOS surface that renders on a device.
 *
 * Composed entirely from `packages/ui`'s closed vocabulary (Commandment 6): there is not a
 * raw primitive or a colour in this file. That is the test of whether the vocabulary is
 * actually complete, and it is why this screen was built before the catalog transport — a
 * component set that has never composed a real screen has never been checked against one.
 *
 * `18 §6` two-plane law: every read here goes through `window.restos`, which is the preload
 * bridge over the main-process gateway. There is no query channel and no SQL, because
 * `shared/ipc.ts` cannot express one.
 */

/**
 * `27-F4` — the rail is POSITIONAL MEMORY, so it is a fixed list and a surface that is not
 * ready is DISABLED IN PLACE with its reason, never absent. Every tab past the first is
 * unbuilt, and saying so is more honest than a rail that grows as the product does and
 * destroys the muscle memory of everyone who learned it early.
 */
const TABS: readonly Tab[] = [
  { id: "counter", label: "Counter" },
  { id: "orders", label: "Orders", unavailable: true, unavailableReason: "not built yet" },
  { id: "payments", label: "Payments", unavailable: true, unavailableReason: "not built yet" },
  { id: "shift", label: "Shift", unavailable: true, unavailableReason: "not built yet" },
];

export const Counter = () => {
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [orders, setOrders] = useState<readonly OpenOrder[]>([]);
  const [items, setItems] = useState<readonly MenuItem[]>([]);
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState("counter");
  /**
   * `27-F11c` — capacity is a PHYSICAL question, so the grid's surface is MEASURED.
   *
   * This used to be two hardcoded constants naming the `27 §1a` reference panel. On that panel
   * they are right; on a resized window, a 10.1" tablet or the 22" pass display they compute a
   * layout for a screen that is not there — which is what put the cart off the right edge and
   * left two thirds of the window dead.
   */
  const [surfaceRef, gridMm] = usePhysicalSize();

  const reload = useCallback(async () => {
    // Three reads, never a join in the renderer: the folds already hold these projections and
    // assembling a fourth shape here would be fold logic reimplemented outside the engine
    // (26 §8). The gateway does the one join the queue genuinely needs.
    const [d, o, m] = await Promise.all([
      window.restos.deviceState(),
      window.restos.openOrders(),
      window.restos.menu(),
    ]);
    setDevice(d);
    setOrders(o);
    setItems(m);
  }, []);

  useEffect(() => {
    void reload();
    // The push carries no data — main says "the folds moved" and the renderer re-reads. A
    // push that carried rows would be a second source of truth for what the folds already own.
    return window.restos.onChanged(() => void reload());
  }, [reload]);

  // `01-F17` — a sale is never blocked. A shell that has not loaded its device state yet is
  // the one case where there is genuinely nothing to draw, so it says so in a word rather
  // than rendering an empty counter that looks like a working one with no orders.
  if (!device) return <p>Starting…</p>;

  const current = orders[0];

  return (
    <AppShell
      actor={device.actor}
      deviceLabel={device.deviceLabel}
      businessDay={device.businessDay}
      lan={device.lan}
      hub={device.hub}
      cloud={device.cloud}
      alarms={[]}
      onAcknowledgeAlarm={() => {}}
      tabs={TABS}
      activeTabId={activeTab}
      onSelectTab={setActiveTab}
      training={device.training}
    >
      <div style={{ display: "flex", gap: 16, height: "100%", minHeight: 0 }}>
        {/*
          The measured surface. The grid renders INSIDE this box, so what is measured and what
          is filled are the same element — a grid sized from one box and placed in another is
          how the cart got pushed off screen.
        */}
        <div ref={surfaceRef} style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
          {/*
            Nothing is drawn until the first measurement. `usePhysicalSize` deliberately returns
            null rather than a default, because a default is a guessed panel by another name and
            a grid costed for the wrong surface puts tiles off-page where no pager can reach
            them — on a counter, an item that cannot be sold.
          */}
          {gridMm === null ? null : (
            <ItemGrid
              items={items}
              posture="counter"
              widthMm={gridMm.widthMm}
              heightMm={gridMm.heightMm}
              tileMm={28}
              page={page}
              onPageChange={setPage}
              onSelect={() => {}}
            />
          )}
        </div>
        <Cart
          lines={(current?.lines ?? []).map((l) => ({
            id: l.line_id,
            name: l.name,
            quantity: l.quantity,
            modifiers: l.modifiers,
            removals: l.removals,
            ...(l.note === null ? {} : { note: l.note }),
          }))}
          // The total is the ENGINE's own derivation, carried across the IPC seam as branded
          // integer paisa and never re-summed here (00 §6, 26 §8).
          totalPaisa={paisa(current?.total_paisa ?? 0)}
        />
      </div>
    </AppShell>
  );
};
