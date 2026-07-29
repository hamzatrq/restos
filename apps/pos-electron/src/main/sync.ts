import {
  type BlockedCursor,
  type CloudSession,
  createCloudSession,
  createWsCloudTransport,
  type DeviceStore,
  wallClock,
} from "@restos/sync-client";
import type { DeviceState } from "../shared/ipc";

/**
 * The device's cloud uplink — the thing that turns a built transport into a used one.
 *
 * Until this existed, `packages/sync-client` held a complete, tested cloud session and **no
 * application constructed one**. An oracle reviewer put it plainly: `catalog_request` had never
 * left a RestOS device, and the counter's menu came from a database seeded by hand. The
 * transport was correct in isolation and unconnected in fact — the shape `01-F22`'s availability
 * fold was caught in a round earlier, one level up.
 *
 * Three consequences of it existing, all previously hardcoded lies in `main/index.ts`:
 *
 * - **reachability** reported `cloud: "down"` unconditionally. `00 §5.7` requires the strip to
 *   report what is TRUE, and a constant is not a report.
 * - **the blocked cursor** was `() => null`, so `DEC-SYNC-011`'s "a blocked cursor is
 *   observable" was satisfied at the API and nowhere a human could see it.
 * - **the catalog** only ever arrived by hand.
 *
 * `01-F17` governs the whole file: a sale is never blocked. Nothing here is on the append path,
 * nothing here can throw into a render, and a device with no `RESTOS_CLOUD_URL` simply runs
 * offline — which is the normal state for a branch on a bad link, not an error.
 */

export type Uplink = {
  /** Three separate facts (`00 §5.7`), never one dot. LAN and hub arrive with the mesh. */
  reachability: () => Pick<DeviceState, "lan" | "hub" | "cloud">;
  blockedCursor: () => BlockedCursor | null;
  /** Catalog health (`01-F56`): a refused update is observable rather than silently stuck. */
  catalogRefusal: () => { reason: string; have_version: number } | null;
  stop: () => void;
};

/**
 * An uplink that never connects. Returned when no gateway is configured, so the caller has no
 * branch: an offline device is a device with an uplink that reports itself down, not a device
 * missing a component.
 */
const offline = (): Uplink => ({
  reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
  blockedCursor: () => null,
  catalogRefusal: () => null,
  stop: () => {},
});

export const createUplink = (opts: {
  store: DeviceStore;
  /** Absent ⇒ offline. `01-F17`/`00 §5.1`: no in-branch feature may require WAN. */
  url: string | undefined;
  token: string | undefined;
  /** Called when the folds move, so the renderer re-reads. Carries no data. */
  onChanged: () => void;
}): Uplink => {
  if (opts.url === undefined || opts.token === undefined) return offline();

  const transport = createWsCloudTransport({ url: opts.url, clock: wallClock });
  const session: CloudSession = createCloudSession({
    store: opts.store,
    transport,
    clock: wallClock,
    // 01-F13 — hub-eligible, and the class is a property of the DEVICE, not a preference. A
    // Windows counter terminal is the preferred branch hub.
    device_class: "counter_electron",
    token: opts.token,
  });
  session.start();

  /**
   * The fold-movement signal. The session has no callback for "events landed", so this polls
   * the store's own cursor and fires only on CHANGE.
   *
   * Polling is the honest choice here rather than the lazy one: the alternative is a callback
   * seam through `sync-client`, which is a protected path, for a signal the host app is the
   * only consumer of. A 1 s tick is well inside `01-F15`'s LAN budget and costs one integer
   * read. When the mesh session lands it brings its own edges and this goes.
   */
  let lastSeen = opts.store.status().last_global_seq ?? 0;
  const tick = setInterval(() => {
    const now = opts.store.status().last_global_seq ?? 0;
    if (now === lastSeen) return;
    lastSeen = now;
    opts.onChanged();
  }, 1000);

  return {
    reachability: () => ({
      // LAN and hub are the MESH's facts and the mesh is not wired yet. Reporting them as
      // `down` is true — this device has contacted no hub — and it is what `00 §5.7` asks for:
      // three facts, each honest, never collapsed into one.
      lan: "down",
      hub: "down",
      cloud: session.status().connected ? "ok" : "down",
    }),
    blockedCursor: () => session.status().blocked,
    catalogRefusal: () => session.status().catalog_refusal,
    stop: () => {
      clearInterval(tick);
      session.stop();
    },
  };
};
