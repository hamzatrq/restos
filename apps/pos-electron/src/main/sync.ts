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
  /**
   * `00 §5.7` wants three separate facts and never one dot — and this file reports exactly the ONE
   * it knows. `lan` and `hub` were hardcoded `"down"` here beside `cloud`, which was true only for
   * as long as the branch mesh was hosted by nothing; they are `main/mesh.ts`'s facts now and
   * `main/index.ts` composes the three. A constant that has stopped being true is the version of
   * "a constant is not a report" that nobody re-reads.
   */
  reachability: () => Pick<DeviceState, "cloud">;
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
  reachability: () => ({ cloud: "down" }),
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
   * The fold-movement signal, and — since August 2026 — **the only thing in this product that
   * makes a locally appended event leave the device while the socket stays up.**
   *
   * `CloudSession.notifyAppended` is `01-F15`'s host-app fast path and it had **zero production
   * callers**: `cloud-session.ts` drains the outbox on `hello_ack`, chains the next page after a
   * `push_ack`, and otherwise pushes only when a host asks it to. No host asked. So a till
   * pushed its outbox **at connect and never again** — every order rung after the socket came up
   * sat in the outbox until the next reconnect, and `02-F11` (an order started on till A is
   * visible on till B) was true only across a bounce.
   *
   * Measured, two tills against a real gateway: A opened the day and both tills opened a shift,
   * five events durably appended locally, `kernel.events` held **0 rows**; restarting the gateway
   * put all five in and each till then held the other's — the whole replication path is correct
   * and it had no trigger.
   *
   * **This is the same defect as the fold-movement signal directly below it, one direction over**,
   * which is why it is one call and not a new mechanism: the tick is already here, it already
   * pays for a store read, and `notifyAppended` on an empty outbox sends nothing (`drainPush`
   * returns on an empty `nextBatch`). **It is called BEFORE the change check on purpose** — the
   * cursor below moves when events *arrive*, and a till that is only *sending* never moves it, so
   * draining inside that branch would reproduce the defect for the single-till case.
   *
   * **OWED: the actual fast path.** `01-F15` wants a push on the append, not up to a second later,
   * and the seam for it exists (`notifyAppended` is a declared member of `CloudSession`). Wiring
   * it needs a call at every place main completes an append — eight `notifyChanged()` sites plus
   * the printing and line-advance producers — and forgetting one is this exact defect again, so
   * it wants one funnel rather than eight edits. A 1 s ceiling is well inside `01-F15`'s LAN
   * budget, which is the same argument the fold-movement signal below already rests on.
   */
  let lastSeen = opts.store.status().last_global_seq ?? 0;
  const tick = setInterval(() => {
    session.notifyAppended();
    const now = opts.store.status().last_global_seq ?? 0;
    if (now === lastSeen) return;
    lastSeen = now;
    opts.onChanged();
  }, 1000);

  return {
    reachability: () => ({ cloud: session.status().connected ? "ok" : "down" }),
    blockedCursor: () => session.status().blocked,
    catalogRefusal: () => session.status().catalog_refusal,
    stop: () => {
      clearInterval(tick);
      session.stop();
    },
  };
};
