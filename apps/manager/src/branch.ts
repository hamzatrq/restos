/**
 * # `05 §8` — THE BRANCH SLICE ON THE MANAGER'S PHONE: the impure composition root
 *
 * > `05 §8` — "Same `packages/sync-client`; **the manager device holds a normal full branch
 * >            slice** (trusted role — doc 04's scoped-slice mechanism is not used here)."
 * > `05-N5` — "The approval queue and alarm list **survive app kill/restart without loss** — they
 * >            are folds over the branch stream, re-derived on start (`01-F6`)."
 * > `05-F29` — RULED: this app is the manager surface, and **the grant travels over the CLOUD
 * >            path, not the LAN mesh**.
 * > `18 §8`  — "Storage: `op-sqlite` **via `sync-client` only**."
 * > `01-F39` — the `manager` device class. **NOT hub-eligible.**
 *
 * **This is the only file in the app that touches a native module, and it is where the recurring
 * defect would enter the product.** `home.ts` stays pure so it can be tested; everything that
 * cannot run under Node lives here.
 *
 * ## Why the CLOUD path and not the LAN mesh
 *
 * `01-F13`/`01-F15` put in-branch traffic on the LAN mesh, and `apps/pass-kds/src/main/mesh.ts` is
 * the worked example — but it cannot be copied here. `createWsLanTransport` is a WebSocket
 * **server** built on `ws` and `node:net`; React Native has a client only, and a phone cannot
 * accept an inbound socket on a shop LAN. `05-F29` already ruled the manager onto the cloud path,
 * and `05 §8` gives the reason that outlives the mesh's absence: *"iOS LAN participation needs the
 * local-network permission prompt and falls back to cloud relay when the OS parks the socket;
 * approvals must be correct, not LAN-dependent"*. **This is not a `00 §5.1` breach** — that law is
 * about *in-branch* features, and the branch's tills keep running on the LAN mesh whether or not
 * the manager's phone can see anything (`05-N4`).
 *
 * ## ⚠ WHAT IS SEEDED RATHER THAN SOLVED, AND MUST BE READ BEFORE THIS IS CALLED FINISHED
 *
 * 1. **Identity and the device credential come from `EXPO_PUBLIC_*`, i.e. from the BUILD.**
 *    `18 §8` says *"`expo-secure-store` for device tokens"* and `01-F25` says registration is *"a
 *    one-time pairing via back office code"*. Neither exists: the back office has no pairing
 *    screen (`14-F13`'s device list covers revocation, not issuance) and the gateway's
 *    `provision-device` needs shell access on the service host, which a manager's phone has not.
 *    So a human still provisions this phone by hand and puts the four values in the build. That is
 *    the same state `apps/pos-electron` is in (`RESTOS_DEVICE_TOKEN` read from the environment and
 *    stored nowhere) — the honest current shape of admission in this product, not a shortcut taken
 *    here. **A credential inlined into a bundle is not the shipped design**, and closing it means
 *    `01-F25`'s pairing screen plus `expo-secure-store`, in that order: secure storage with no way
 *    to fill it would be a correct subsystem with no seam.
 * 2. **The three ids are REQUIRED here, with no dev-seed fallback.** `resolveDeviceIdentity` falls
 *    back to `DEV_IDENTITY` per key, which is right for a till (a second till differs in one id)
 *    and catastrophic here: an unconfigured phone would silently adopt the COUNTER's `device_id`,
 *    and two devices pushing under one origin fork one outbox into a ledger `01-F1` cannot unwind.
 *    Absent configuration is reported to the screen instead (`05-F22`).
 * 3. **No PIN session.** `01-F26`'s unlock is not wired, so this device READS the branch and cannot
 *    yet AUTHOR anything — `05-F30`'s `audit.alarm_acknowledged` and `05-F7`'s `approval.granted`
 *    both need an actor on the envelope (`02-F41`), and `probe.ts` exists because nobody has
 *    measured Argon2id under Hermes. Reading is the whole of this slice today, and the ack this
 *    console honours still has no producer anywhere.
 */
import { resolveAging } from "@restos/device-config/aging";
import { resolveDeviceIdentity } from "@restos/device-config/device-identity";
import {
  type CloudSession,
  createCloudSession,
  createRnCloudTransport,
  type DeviceStore,
  openRnStore,
  type RnWebSocket,
  wallClock,
} from "@restos/sync-client/rn";
import { attachBranch, type BranchSource } from "./home";

/**
 * `00 §7` layer 3, and the ONE runtime configuration an Expo bundle has: `babel-preset-expo`
 * substitutes `process.env.EXPO_PUBLIC_*` **member expressions** at build time. They are therefore
 * written as literal member accesses below — a computed lookup is NOT substituted and reads
 * `undefined` on a phone, which is the sort of thing that works perfectly in Vitest and ships
 * broken.
 *
 * Declared locally because this app's program runs with `types: []` (its tsconfig explains why:
 * RN's ambient globals and `@types/node` cannot share one program). Naming the four keys
 * explicitly makes this the app's whole configuration surface, in one place.
 */
declare const process: {
  readonly env: {
    readonly EXPO_PUBLIC_RESTOS_ORG_ID?: string;
    readonly EXPO_PUBLIC_RESTOS_BRANCH_ID?: string;
    readonly EXPO_PUBLIC_RESTOS_DEVICE_ID?: string;
    readonly EXPO_PUBLIC_RESTOS_GATEWAY_URL?: string;
    readonly EXPO_PUBLIC_RESTOS_DEVICE_TOKEN?: string;
  };
};

/**
 * The device database, under the app's own document directory (op-sqlite resolves the name).
 * Stable across launches on purpose — `05-N5` requires the alarm list to survive app kill, and a
 * per-launch name would re-derive from an empty ledger every time.
 */
const DB_NAME = "restos-manager.db";

/**
 * `05-N2` budgets *"remote push best-effort with a **60 s in-app poll fallback** while the app is
 * foregrounded"*, and this device is on the remote path by `05-F29`. Five seconds sits an order of
 * magnitude inside that ceiling and is also the AGE clock: `03-F14`'s minutes move with the wall
 * even when no event arrives, so a console that re-read only on delivery would show an alarm
 * frozen at the age it had when it was raised.
 */
export const BRANCH_POLL_MS = 5_000;

/** What the app holds onto so it can shut the uplink down. */
export type BranchAttachment = { stop: () => void };

/** Nothing to stop — returned when the slice could not be opened at all. */
const detached: BranchAttachment = { stop: () => {} };

/**
 * The platform WebSocket, as `transport-rn.ts` needs it.
 *
 * React Native provides `WebSocket` as a global on both platforms. It is supplied from here rather
 * than reached for inside `packages/sync-client` so that the transport's own logic stays
 * exercisable off a phone, and so that this app's dependency on a platform global is visible in
 * the app instead of buried in the kernel.
 */
const platformSocket = (url: string): RnWebSocket => new WebSocket(url) as unknown as RnWebSocket;

/** One shape for the source, so there is exactly one definition of what the console reads. */
const sourceOver = (
  store: DeviceStore,
  connected: () => boolean,
  lastSeenMs: () => number | null,
): BranchSource => ({
  store,
  connected,
  lastSeenMs,
  // `03-F14`'s thresholds. `resolveAging(undefined)` is the `00 §7` default: an Expo bundle has no
  // per-branch layer-2 channel yet, and the till reads this same declaration (`DEC-ARCH-001`).
  aging: resolveAging(undefined),
  now: () => wallClock.now(),
});

/**
 * **Open the slice, start the uplink, and hand `home.ts` a live source.**
 *
 * Every failure path ends in `attachBranch({ unavailable })` rather than a throw: `05-N4` says a
 * dead console must cost the branch nothing, and commandment 4 says the surface renders in every
 * state. A phone that cannot open its database has to SAY so — the one thing it must never do is
 * show a quiet screen.
 */
export const attachBranchSlice = (): BranchAttachment => {
  const configured: Record<string, string | undefined> = {
    RESTOS_ORG_ID: process.env.EXPO_PUBLIC_RESTOS_ORG_ID,
    RESTOS_BRANCH_ID: process.env.EXPO_PUBLIC_RESTOS_BRANCH_ID,
    RESTOS_DEVICE_ID: process.env.EXPO_PUBLIC_RESTOS_DEVICE_ID,
  };
  const url = process.env.EXPO_PUBLIC_RESTOS_GATEWAY_URL;
  const token = process.env.EXPO_PUBLIC_RESTOS_DEVICE_TOKEN;

  const missing = [
    ...Object.entries(configured)
      .filter(([, value]) => value === undefined)
      .map(([key]) => `EXPO_PUBLIC_${key}`),
    ...(url === undefined ? ["EXPO_PUBLIC_RESTOS_GATEWAY_URL"] : []),
    ...(token === undefined ? ["EXPO_PUBLIC_RESTOS_DEVICE_TOKEN"] : []),
  ];
  if (missing.length > 0 || url === undefined || token === undefined) {
    // Checked before the store is opened: a database with no uplink is a permanently empty slice,
    // and an empty slice rendered as "reachable" is exactly the calm screen `05-F23` forbids.
    attachBranch({
      unavailable:
        `this phone is not provisioned — ${missing.join(", ")} unset. An operator must run ` +
        "`provision-device` on the gateway host and build with those values (01-F25's pairing " +
        "code does not exist yet)",
    });
    return detached;
  }

  let store: DeviceStore;
  try {
    // Reuses the shipped resolver rather than reading the three keys by hand, so this device gets
    // the same blank/padded refusal a till gets — a typo that silently resolved elsewhere is a
    // forked outbox `01-F1` cannot correct. The dev-seed fallback cannot fire: every key is
    // present by the check above.
    store = openRnStore({ name: DB_NAME, identity: resolveDeviceIdentity(configured) });
  } catch (error) {
    attachBranch({
      unavailable: `the branch slice on this device could not be opened — ${String(error)}`,
    });
    return detached;
  }

  const session: CloudSession = createCloudSession({
    store,
    transport: createRnCloudTransport({ url, clock: wallClock, socket: platformSocket }),
    clock: wallClock,
    // `01-F39`'s own name for the manager's phone, and it is a property of the DEVICE rather than
    // a preference: the class decides hub eligibility, and `01-F39` puts `manager` OUTSIDE the
    // eligible set. A phone announcing itself as the till would take branch-time authority
    // (`01-F43`) and the branch's cloud uplink onto someone's pocket.
    device_class: "manager",
    token,
  });
  session.start();

  /**
   * Last contact, on this device's clock — `05-F22`'s *"last seen 12 min ago"* needs a number and
   * `CloudSessionStatus` carries only a boolean. Sampled on the same beat the screen re-reads on,
   * so the age is never staler than one poll.
   */
  let lastSeen: number | null = null;
  const sample = (): void => {
    if (session.status().connected) lastSeen = wallClock.now();
  };
  sample();
  const tick = setInterval(sample, BRANCH_POLL_MS);

  attachBranch(
    sourceOver(
      store,
      () => session.status().connected,
      () => lastSeen,
    ),
  );

  return {
    stop: () => {
      clearInterval(tick);
      session.stop();
      store.close();
    },
  };
};
