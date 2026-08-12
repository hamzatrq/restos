import {
  type CloudSession,
  createCloudSession,
  createWsCloudTransport,
  type DeviceStore,
  wallClock,
} from "@restos/sync-client";
import type { z } from "zod";
import type { FactSchema } from "../shared/ipc";

type Fact = z.infer<typeof FactSchema>;

/**
 * # HOW THE COUNTER'S ORDERS REACH THIS SCREEN — THE CLOUD HALF
 *
 * A pass screen shows the **branch** order queue (`03-F13`), and the orders are appended on the
 * counter. `01-F13`/`01-F15` say those events travel over the **LAN mesh** — shop-grade Wi-Fi,
 * `<1 s` p95, no WAN involved — which is exactly what `00 §5.1` requires: *no in-branch feature may
 * require WAN*.
 *
 * **This header used to say that mesh was "built and hosted by nothing", making the cloud "the ONLY
 * path", and called that a `00 §5.1` violation in effect that this app did not close.** It is
 * closed, August 2026: `main/mesh.ts` joins the branch mesh and `apps/pos-electron/src/main/mesh.ts`
 * hosts the hub, so a branch whose internet drops keeps feeding this screen. The cloud path below is
 * unchanged and is still what carries a device on a branch with no LAN configured, and what carries
 * catch-up when this screen has been off.
 *
 * The two are not alternatives and neither is a fallback for the other: `DEC-SYNC-009` makes the
 * hub the branch's cloud uplink for devices that have no WAN of their own, so on most branches this
 * screen's events reach the cloud *through* the counter and this file's session is what a screen
 * with its own internet runs.
 *
 * ## Why this file is not `apps/pos-electron/src/main/sync.ts`
 *
 * It is that file's shape and about half its length, and the duplication is deliberate rather than
 * unnoticed: the `device_class` differs (`kitchen`, `01-F39`'s own name for *"pass screen / KDS
 * station, doc 03"*), the projected state differs, and this app deliberately does **not** consume
 * the catalog-refusal or blocked-cursor facts — it has no menu to be stale and no catalog to
 * refuse. Sharing it would mean exporting a host module across two apps to save thirty lines while
 * coupling the kitchen's boot to the counter's.
 */
export type PassUplink = {
  /**
   * `00 §5.7` wants three separate facts and never one dot — and this file now reports exactly the
   * ONE it knows. `lan` and `hub` used to be hardcoded `"down"` here beside `cloud`, which was true
   * only for as long as no mesh existed; they are `main/mesh.ts`'s facts and `main/index.ts`
   * composes the three. A constant is not a report, and a constant that has stopped being true is
   * the version of that defect nobody re-reads.
   */
  reachability: () => { cloud: Fact };
  stop: () => void;
};

/**
 * An uplink that never connects, for a device with no gateway configured.
 *
 * It is a real object rather than a `null` for `sync.ts`'s reason: an offline device is a device
 * whose uplink reports itself down, not a device missing a component — and `00 §5.7` wants the
 * strip to say so rather than to say nothing.
 */
const offline = (): PassUplink => ({
  reachability: () => ({ cloud: "down" }),
  stop: () => {},
});

export const createPassUplink = (opts: {
  store: DeviceStore;
  /** Absent ⇒ no cloud session. The branch LAN mesh (`main/mesh.ts`) is independent of this. */
  url: string | undefined;
  token: string | undefined;
  /** Called when the folds move, so the renderer re-reads. Carries no data. */
  onChanged: () => void;
}): PassUplink => {
  if (opts.url === undefined || opts.token === undefined) return offline();

  const transport = createWsCloudTransport({ url: opts.url, clock: wallClock });
  const session: CloudSession = createCloudSession({
    store: opts.store,
    transport,
    clock: wallClock,
    // `01-F39`'s own name for "pass screen / KDS station, doc 03". It is a property of the DEVICE
    // and not a preference — and it is the value `02-F31`'s detection rule reads to decide the
    // branch is T2, which is why a pass screen registered as anything else would leave the counter
    // auto-advancing the lines this screen owns (`03-F24`).
    device_class: "kitchen",
    token: opts.token,
  });
  session.start();

  /**
   * The fold-movement signal, polled off the store's own cursor and fired only on CHANGE — the
   * same mechanism and the same argument as `apps/pos-electron/src/main/sync.ts`: the session has
   * no "events landed" callback, and adding one is a change to a protected package for a signal
   * the host app is the only consumer of.
   *
   * **On this surface the tick is also the AGE clock**, and that is the second reason it exists:
   * `03-F14`'s colours move with the minutes even when no event arrives, so the renderer has to
   * re-read on a timer or a ticket would sit at `9 min` until the next order was confirmed. One
   * second is well inside `03-N4`'s *"< 1 s"* render budget and costs one integer read.
   */
  let lastSeen = opts.store.status().last_global_seq ?? 0;
  const tick = setInterval(() => {
    const now = opts.store.status().last_global_seq ?? 0;
    if (now !== lastSeen) lastSeen = now;
    opts.onChanged();
  }, 1000);

  return {
    reachability: () => ({ cloud: session.status().connected ? "ok" : "down" }),
    stop: () => {
      clearInterval(tick);
      session.stop();
    },
  };
};
