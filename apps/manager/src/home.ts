/**
 * # `05-F21`/`05-F22`/`05-F23` — the console home model, and the thing it is NOT allowed to claim
 *
 * > 05-F22 … Every screen shows last-synced age; when the branch is unreachable, the console says
 * > so plainly ("branch offline — last seen 12 min ago") and never renders stale state as live.
 * > 05-F23 … while the branch is offline, the console shows the alarm gap honestly INSTEAD OF
 * > IMPLYING CALM.
 * > 05 §4 … alarm silence is labeled as unknown, not calm.
 *
 * `alarms.ts` answers *what is wrong in the kitchen*. This answers *am I entitled to say so* — and
 * on this device today the answer is no, which is why the honest state is expressed as a **type**
 * rather than as a caption: `alarms` is `{ known: true; list }` or `{ known: false }`, so an empty
 * list and an unknown one cannot be confused by this module, by a renderer, or by a reviewer.
 * `OrdersSurface.tsx` recorded the alternative failure — *"a caption asserting a rule the rows do
 * not follow is worse than no caption"*.
 *
 * ## ⚠ THE BRANCH IS UNREACHABLE FROM THIS APP, AND `branchSnapshot()` IS A MEASUREMENT
 *
 * It is **not** a stub standing in for something that exists — AGENTS.md's *"a port supplied with
 * a STUB"* — it is the accurate report of a capability this platform does not have. Measured
 * 2026-08-12, symbol-precise, both planes:
 *
 * - **Device plane.** `openStore` constructs `better-sqlite3` directly
 *   (`packages/sync-client/src/device-store.ts:33`), which cannot load under Hermes, and
 *   `createCloudSession` takes a whole `DeviceStore` (`cloud-session.ts:125`). `05-N5` wants the
 *   alarm list *"re-derived on start (01-F6)"*, so an in-memory `createMergeEngine()` is not the
 *   gap either: there is no durable stream to re-derive FROM. `packages/sync-client` is a
 *   PROTECTED path (commandment 10) and the adapter is its own `24 §3` task.
 * - **Cloud plane.** `services/api`'s router is `auth · session · catalog · devices · summary ·
 *   ops` (`router.ts:123`). There is **no live order or queue read model**, so even the read-only
 *   render `05-F29` explicitly grafts as legal for a cloud surface has no source to render.
 * - **Admission.** `01-F25`'s pairing is a back-office code that does not exist; the gateway's
 *   `provision-device` needs shell access on the service host, which a manager's phone has not.
 *
 * The day any of those lands, `branchSnapshot()` is the one function that changes, and
 * `alarm-honesty.test.ts` states its invariant as an IMPLICATION so it holds before and after.
 */

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
 * What this device can see of its branch. **A measurement, not a placeholder** — see the header
 * for the four things measured and the one function that changes when any of them lands.
 */
const branchSnapshot = (): BranchSnapshot => ({
  reachable: false,
  last_seen_ms: null,
  reason:
    "no branch stream on this device — sync-client's store binds better-sqlite3 (native), the " +
    "cloud plane exposes no order read model, and this phone has no 01-F25 pairing",
});

/**
 * **The shipped composition** — the one place a source, a clock and the derivation are wired
 * together, and therefore the one place the recurring defect can enter the product. `App.tsx`
 * calls this; nothing else may construct a `ManagerHome`.
 *
 * The clock is the DEVICE clock, and that is correct here and only here: `last_seen_seconds` is a
 * device-local duration between two device-clock readings. Branch time belongs inside
 * `AlarmInput.now`, which the adapter that supplies the reachable arm will own (standing law 2).
 */
export const managerHomeNow = (): ManagerHome => managerHome(branchSnapshot(), Date.now());
