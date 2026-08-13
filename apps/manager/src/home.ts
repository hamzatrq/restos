/**
 * # `05-F21`/`05-F22`/`05-F23` — the console home model, and the thing it is NOT allowed to claim
 *
 * > 05-F22 … Every screen shows last-synced age; when the branch is unreachable, the console says
 * > so plainly ("branch offline — last seen 12 min ago") and never renders stale state as live.
 * > 05-F23 … while the branch is offline, the console shows the alarm gap honestly INSTEAD OF
 * > IMPLYING CALM.
 * > 05 §4 … alarm silence is labeled as unknown, not calm.
 *
 * `alarms.ts` answers *what is wrong in the kitchen*. This answers *am I entitled to say so*, and
 * the honest state is expressed as a **type** rather than as a caption: `alarms` is
 * `{ known: true; list }` or `{ known: false }`, so an empty list and an unknown one cannot be
 * confused by this module, by a renderer, or by a reviewer. `OrdersSurface.tsx` recorded the
 * alternative failure — *"a caption asserting a rule the rows do not follow is worse than no
 * caption"*.
 *
 * ## ⚠ THE BRANCH IS REACHABLE NOW, AND THAT IS WHAT CHANGED (August 2026)
 *
 * This header used to carry a measurement: `branchSnapshot()` returned `reachable: false`
 * unconditionally because `openStore` constructed `better-sqlite3` at module scope and no plane
 * carried a queue. `18 §4`'s storage adapter landed (`packages/sync-client/src/storage.ts`,
 * `rn.ts`), so this device opens a real store on `@op-engineering/op-sqlite`, fills it over the
 * cloud path (`05-F29`), and `branchSnapshotFrom` reads the REAL fold.
 *
 * **`05-F22`/`05-F23`'s offline arm is not scaffolding and is not deleted.** A manager at home
 * with the phone's WAN down must still be told the alarm state is UNKNOWN rather than shown a
 * calm screen, so both arms are live and which one you get is a fact about the uplink.
 *
 * ## THIS MODULE STAYS PURE, AND THAT IS A MEASURED CONSTRAINT
 *
 * Nothing here may import the RN store door. With `@restos/sync-client/rn` imported at module
 * scope this file stops loading under Node, and so does every suite that reads it — `18 §6`'s
 * *"components NEVER touch SQLite or fold internals"* is the same boundary one layer up. The live
 * source is therefore **attached at runtime** by `branch.ts` (the impure composition root) rather
 * than imported here, which is also what keeps `managerHomeNow()` callable in a test.
 */

import type { AgingPolicy } from "@restos/device-config/aging";
// ⚠ TYPE-only, and it must STAY type-only — see the purity note above. `alarms.ts` carries the
// same warning on its `fold-engine` import for the same reason.
import type { DeviceStore } from "@restos/sync-client/rn";
import { type Alarm, type AlarmInput, alarmsFrom } from "./alarms.js";

/**
 * What this device knows about its branch right now.
 *
 * The reachable arm carries the whole `AlarmInput` rather than a ready-made list, deliberately: a
 * model handed alarms cannot be tested for having derived them, and this is the seam the recurring
 * defect would enter through.
 */
export type BranchSnapshot =
  | {
      readonly reachable: true;
      /** Epoch ms of the last contact with the branch, on this device's own clock. */
      readonly last_seen_ms: number;
      readonly branch: AlarmInput;
    }
  | {
      readonly reachable: false;
      /** Why, in words a manager can act on — `05-F22`'s *"says so plainly"*. */
      readonly reason: string;
      /** Epoch ms of the last contact, or `null` when the branch has never been seen. */
      readonly last_seen_ms: number | null;
    };

/** `05-F23` as a type: "no alarms" is unrepresentable while the branch is unreachable. */
export type AlarmKnowledge =
  | { readonly known: true; readonly list: readonly Alarm[] }
  | { readonly known: false };

/** `05-F21`'s glance, reduced to the half this wave can honestly compute. */
export type ManagerHome = {
  readonly reachable: boolean;
  readonly alarms: AlarmKnowledge;
  /** `05-F22`/`05-F9`'s data age as a NUMBER, so a renderer cannot round it into reassurance. */
  readonly last_seen_seconds: number | null;
  /** The sentence `00 §5.7` requires. Never empty, in any state. */
  readonly honesty: string;
};

/** `05-F22`'s own worked example is "12 min ago", so seconds below a minute and minutes above. */
const ageWords = (seconds: number): string =>
  seconds < 60 ? `${seconds} s ago` : `${Math.floor(seconds / 60)} min ago`;

/**
 * **The home model.** Pure: the snapshot and the clock are arguments, so every state below is
 * reachable in a suite — including the one this app is actually in.
 *
 * It renders in every state rather than refusing in any, per `05-N4` (*"console offline must cost
 * the branch nothing"*) and commandment 4.
 */
export const managerHome = (snapshot: BranchSnapshot, now: number): ManagerHome => {
  const last_seen_seconds =
    snapshot.last_seen_ms === null
      ? null
      : Math.max(0, Math.floor((now - snapshot.last_seen_ms) / 1000));

  if (!snapshot.reachable) {
    const seen =
      last_seen_seconds === null ? "never synced" : `last seen ${ageWords(last_seen_seconds)}`;
    return {
      reachable: false,
      // `05 §4`: "alarm silence is labeled as unknown, not calm."
      alarms: { known: false },
      last_seen_seconds,
      honesty: `branch offline — ${seen}. Alarm state UNKNOWN, not calm (05-F23) — ${snapshot.reason}.`,
    };
  }

  const list = alarmsFrom(snapshot.branch);
  return {
    reachable: true,
    alarms: { known: true, list },
    last_seen_seconds,
    honesty: `synced ${ageWords(last_seen_seconds ?? 0)} — ${list.length} active alarm${
      list.length === 1 ? "" : "s"
    } (05-F1/05-F3).`,
  };
};

/**
 * **Everything the console needs from the device to answer `05-F22`.** `branch.ts` builds one of
 * these around a real `openRnStore` handle and a real `createCloudSession`; a suite builds one
 * around a real store on disk with the uplink facts injected, which is why BOTH arms are
 * reachable from one source rather than one of them being dead code.
 *
 * It carries the STORE and not a ready-made list on purpose: a model handed alarms cannot be
 * tested for having derived them, and that is the seam this wave's recurring defect enters
 * through.
 */
export type BranchSource = {
  /** `05 §8` — *"the manager device holds a normal full branch slice"*. The real one. */
  readonly store: DeviceStore;
  /** Is the branch stream reaching this device right now? `05-F22`'s whole question. */
  readonly connected: () => boolean;
  /** Epoch ms of the last contact on this device's clock, or `null` if never. */
  readonly lastSeenMs: () => number | null;
  /** `03-F14`'s X/Y per order type, resolved from `00 §7` layer 2. Asked, never second-guessed. */
  readonly aging: AgingPolicy;
  /** This DEVICE's clock. Branch time is this plus the store's own offset — see below. */
  readonly now: () => number;
};

/**
 * One ledger envelope as `alarms.ts` reads it.
 *
 * **Nothing is filtered by type here**, deliberately: which types matter is `alarms.ts`'s
 * knowledge (`kot.print_failed`, `audit.alarm_acknowledged`), and a second copy of that list on
 * this side is `03-F40`'s two-readings defect — the console would silently stop clearing
 * acknowledged alarms the day the view learned a third type. The forbidden ordering fields
 * (`lamport_seq`, `global_seq`, `device_created_at`, `server_received_at`) are dropped rather than
 * carried, so standing law 1 holds by construction on this side of the seam too.
 *
 * ⚠ **COST, stated rather than hidden:** this is a full scan of the device's ledger on every
 * derivation, because `merge.ts` leaves both of those types projection-inert (*"its reader is doc
 * 05's alarm console"*) and there is no cheaper store read. `05 §5` says this device MATERIALISES
 * the alarm list, so the real answer is a device projection — and writing one is a `26 §7`
 * oracle-pinned decision, i.e. a spec PR, exactly as `apps/manager/CLAUDE.md` already records for
 * the approval queue. Recorded as a finding, not worked around with a cache: a stale console is a
 * worse failure than a slow one.
 */
const factsOf = (source: BranchSource): AlarmInput["facts"] =>
  source.store.readAllEvents().map((envelope) => ({
    id: envelope.id,
    type: envelope.type,
    branch_created_at: envelope.branch_created_at,
    payload: envelope.payload as Readonly<Record<string, unknown>>,
  }));

/**
 * **What this device can see of its branch, read fresh from the ledger every time.**
 *
 * The clock arithmetic is standing law 2 and is the one line most likely to be got wrong: the age
 * of an order is measured in BRANCH time, which is this device's clock plus the offset the store
 * learned from the hub (`01-F43`) — never `Date.now()` and never the raw injected clock. A phone
 * whose clock is ten minutes behind the branch must still report the same age as the till, because
 * *"durations need a consistent clock, not a correct one"*.
 */
export const branchSnapshotFrom = (source: BranchSource): BranchSnapshot => {
  const last_seen_ms = source.lastSeenMs();
  if (!source.connected()) {
    return {
      reachable: false,
      last_seen_ms,
      // `05-F22`'s "says so plainly". It names the uplink because that is what is actually down:
      // the slice on this phone is intact and is simply not being fed.
      reason: "this phone's uplink to the branch is down, so the slice below has stopped moving",
    };
  }
  return {
    reachable: true,
    // Connected ⇒ contact is now. The `??` is for the first snapshot of a session, where the
    // uplink is up but no poll has recorded a contact yet.
    last_seen_ms: last_seen_ms ?? source.now(),
    branch: {
      queue: source.store.kitchenQueue(),
      orders: source.store.openOrders(),
      facts: factsOf(source),
      now: source.now() + source.store.branchTimeStatus().offset_ms,
      aging: source.aging,
    },
  };
};

/**
 * The live source, or the reason there is not one. Module state, and it is the ONE piece of
 * mutable state in this file — it exists so that `home.ts` can stay importable without a native
 * module while still answering with real data once `branch.ts` has run.
 */
let attachment: BranchSource | { readonly unavailable: string } = {
  unavailable: "the branch slice has not been opened on this device yet",
};

/**
 * **The composition seam.** `branch.ts` calls this once at start-up with a live source, or with
 * the reason it could not build one (`05-F22`: an unconfigured or unadmitted phone must SAY so,
 * not render a calm screen). Nothing else may call it.
 */
export const attachBranch = (next: BranchSource | { readonly unavailable: string }): void => {
  attachment = next;
};

/**
 * **The shipped composition** — the one place a source, a clock and the derivation are wired
 * together, and therefore the one place the recurring defect can enter the product. `App.tsx`
 * calls this; nothing else may construct a `ManagerHome`.
 *
 * The clock is the DEVICE clock, and that is correct here and only here: `last_seen_seconds` is a
 * device-local duration between two device-clock readings. Branch time lives inside
 * `AlarmInput.now`, which `branchSnapshotFrom` computes from the store's offset (standing law 2).
 */
export const managerHomeNow = (): ManagerHome => {
  const now = Date.now();
  const snapshot: BranchSnapshot =
    "unavailable" in attachment
      ? { reachable: false, last_seen_ms: null, reason: attachment.unavailable }
      : branchSnapshotFrom(attachment);
  return managerHome(snapshot, now);
};
