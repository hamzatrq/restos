import { paisa } from "@restos/domain";
import { AppShell, Cart, ItemGrid, type Tab } from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import type { DeviceState, OpenOrder } from "../shared/ipc";

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
 * `27 §1a` — the counter target is a 15.6" 16:9 panel. `27-F11c` computes capacity from the
 * PHYSICAL surface, so the grid is handed millimetres and a PPI, never a pixel box: the same
 * panel at 1366×768 and at 1920×1080 must hold the same number of tiles.
 *
 * These are constants because the device's panel is a fixed physical fact. When admission
 * (`01-F47`) lands it carries the device's class, and the class is where this belongs.
 */
const PANEL = { widthMm: 345.4, heightMm: 194.3, ppi: 141 } as const;
/** The work surface is the panel minus the strip, the rail and the cart. Measured, not guessed. */
const GRID = { widthMm: 210, heightMm: 120 } as const;

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
  const [page, setPage] = useState(0);
  const [activeTab, setActiveTab] = useState("counter");

  const reload = useCallback(async () => {
    // Three reads, never a join in the renderer: the folds already hold these projections and
    // assembling a fourth shape here would be fold logic reimplemented outside the engine
    // (26 §8). The gateway does the one join the queue genuinely needs.
    const [d, o] = await Promise.all([window.restos.deviceState(), window.restos.openOrders()]);
    setDevice(d);
    setOrders(o);
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
      <div style={{ display: "flex", gap: 16, height: "100%" }}>
        <ItemGrid
          items={[]}
          posture="counter"
          widthMm={GRID.widthMm}
          heightMm={GRID.heightMm}
          ppi={PANEL.ppi}
          tileMm={24}
          page={page}
          onPageChange={setPage}
          onSelect={() => {}}
        />
        {/*
          Empty until the catalog transport lands (plans/wave-1/catalog-transport.md): the
          device catalog stores and versions correctly and nothing delivers to it yet. An
          empty grid is the honest state, and `01-F54`'s degradation path is what fills it.
        */}
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
