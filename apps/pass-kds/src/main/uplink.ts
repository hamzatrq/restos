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
 * # HOW THE COUNTER'S ORDERS REACH THIS SCREEN — AND THE HONEST ANSWER IS "OVER THE WAN"
 *
 * This is the single most important thing to know about this app, and it is a **product-shape
 * finding rather than a limitation of this file**.
 *
 * A pass screen shows the **branch** order queue (`03-F13`), and the orders are appended on the
 * counter. `01-F13`/`01-F15` say those events travel over the **LAN mesh** — shop-grade Wi-Fi,
 * `<1 s` p95, no WAN involved — which is exactly what `00 §5.1` requires: *no in-branch feature
 * may require WAN*. **That mesh is built and hosted by nothing**: `packages/sync-client`'s
 * `mesh-session.ts`, `hub-election.ts` and `transport-ws.ts` all carry seams-register markers
 * saying no host runs it, and `restaurant-os.md` puts it in **Wave 0**.
 *
 * So the only path that exists is the **cloud**: this device pushes and receives through
 * `services/sync-gateway`, which fans an org's events out to its other sessions. That works, it is
 * what `plans/wave-1/running-the-stack.md` sets up, and it is **WAN-dependent**, which means a
 * branch whose internet drops has a pass screen that stops learning about new orders while the
 * counter goes on selling (`01-F17` — the sale is never blocked, and correctly is not).
 *
 * **That is a `00 §5.1` violation in effect and it is NOT closed by this app.** It is named here,
 * in the boot line, and in this package's `CLAUDE.md`, because the fix is the Wave-0 mesh host and
 * not a workaround in a screen. Building a second, screen-specific transport would be inventing a
 * mechanism the corpus already specifies (commandment 2) and would give the branch two answers to
 * one question.
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
  /** Three separate facts (`00 §5.7`), never one dot. LAN and hub arrive with the Wave-0 mesh. */
  reachability: () => { lan: Fact; hub: Fact; cloud: Fact };
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
  reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
  stop: () => {},
});

export const createPassUplink = (opts: {
  store: DeviceStore;
  /** Absent ⇒ offline. See the header: the LAN path that SHOULD carry this does not exist yet. */
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
    reachability: () => ({
      // LAN and hub are the MESH's facts and the mesh is not wired. `down` is TRUE — this device
      // has contacted no hub — and `00 §5.7` asks for three honest facts rather than one summary.
      lan: "down",
      hub: "down",
      cloud: session.status().connected ? "ok" : "down",
    }),
    stop: () => {
      clearInterval(tick);
      session.stop();
    },
  };
};
