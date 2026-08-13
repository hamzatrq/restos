/**
 * The PIN session — who is signed in on this device (`01-F26`, `01-F27`, `01-F28`, `01-F61`).
 *
 * `01-F27` keeps the two identity axes apart on purpose: a device token carries DEVICE identity
 * only, and user identity comes from here. Collapsing them would turn a shoulder-surfed
 * four-digit PIN into a remote credential — which is exactly the hazard
 * `plans/wave-1/identity-and-authorization.md` §4.1 names, and why an unregistered device
 * refuses even a correct PIN (`01-F25`, `01-F48` fail-closed).
 *
 * `01-F28` is the FR this file mostly exists for: verification happens ON-DEVICE against the
 * synced credential hashes in `staff.ts`. There is no transport here and none is constructed —
 * a cashier unlocks with the WAN cable pulled, which is the whole point of `00 §5.1`.
 *
 * Time is injected (`now`), never read from the host clock, so idle auto-lock is exercised by
 * moving a variable rather than by sleeping. That is not only a test affordance: Argon2id is
 * deliberately slow, and a timing-dependent lock would flake (`24-F12`).
 */

import { type AuditEventType, verifyPin } from "@restos/domain";
import {
  createMemoryPinAttemptStore,
  type PinAttemptRecord,
  type PinAttemptStore,
} from "./pin-attempts.js";
import type { StaffRegistry } from "./staff.js";

/**
 * Why an unlock was refused. Kept DISTINCT rather than collapsed into one "no": telling a
 * cashier to re-key a PIN that was already right, on a terminal that will never accept it, is
 * the failure `02-F20`'s three-valued lesson is about — and it hides a revoked device behind a
 * typo message.
 */
export type UnlockRefusal =
  /** `01-F25`/`01-F48` — this terminal is not paired, so no PIN can authorise anything here. */
  | "device_not_registered"
  /** `00 §5.4`/`01-F61` — too many consecutive failures for this (device, user) pair. */
  | "locked_out"
  /** Not in the synced registry (`01-F28`) — including a user `01-F42` revoked. */
  | "unknown_user"
  /** The PIN did not verify. */
  | "bad_pin";

export type UnlockResult =
  | { readonly ok: true; readonly user_id: string }
  | { readonly ok: false; readonly reason: UnlockRefusal; readonly user_id: string };

/**
 * `01-F5` already has `audit.login` — this invents no event type (commandment 2), and the
 * `AuditEventType` annotation is what makes that a compile error rather than a review note.
 *
 * It is a SINK, not a `store.append`: `01-F5` makes `prev_audit_hash` store-owned (the device
 * stamps it inside the append transaction and rejects a caller-supplied value), so a session
 * that filled it in would produce a record the store refuses.
 */
export type PinAuditRecord = {
  readonly type: AuditEventType;
  readonly payload: {
    readonly user_id: string;
    readonly device_id: string;
    readonly outcome: "success" | "failure";
    readonly reason?: UnlockRefusal;
  };
};

export type PinSession = {
  unlock(user_id: string, pin: string): Promise<UnlockResult>;
  lock(): void;
  /** Register activity — resets the idle timer (`01-F26`). */
  touch(): void;
  /** Whoever's PIN is in, or null. Evaluates idle auto-lock against the injected clock. */
  currentUser(): string | null;
};

export type PinSessionOptions = {
  /** The synced reference data `01-F28` verifies against — normally `store.staff`. */
  registry: StaffRegistry;
  /** `01-F27`'s other axis. `registered` false = not paired (`01-F25`). */
  device: { device_id: string; registered: boolean };
  /** `01-F26` idle auto-lock, a device-layer setting (`00 §7` layer 3) — never a constant. */
  idle_lock_ms: number;
  /** `01-F61`: N consecutive failures tolerated; the (N+1)th attempt is refused. */
  max_failed_attempts: number;
  now: () => number;
  audit: (record: PinAuditRecord) => void;
  /**
   * `01-F61`: the counter PERSISTS across an app restart. Pass `store.pinAttempts`. Omitted,
   * the session falls back to a process-lifetime counter, which keeps the scope and the
   * cooldown but NOT the persistence — a host that means to satisfy `01-F61` passes the
   * durable one.
   */
  attempts?: PinAttemptStore;
  /**
   * `01-F61`: a lockout ends on a time cooldown. Defaults to `PIN_LOCKOUT_COOLDOWN_MS`.
   *
   * @unreached-by-design A TUNING DEFAULT, and the contrast with `attempts` directly above is the
   * whole reason this opt-out is per property. Omitting `attempts` silently downgrades `01-F61`
   * from a durable counter to a process-lifetime one — instance 2 of the wave's named defect.
   * Omitting this one takes the pinned five minutes, which is the value the FR is satisfied by.
   * A host overrides it when a branch asks; none has.
   */
  lockout_cooldown_ms?: number;
};

/**
 * How long a lockout lasts (`01-F61`).
 *
 * The FR requires that a lockout **end on a cooldown** and names no number, so this value is a
 * pinned interpretation, not a spec fact. What is not interpretation is the direction: a
 * manager-clear path cannot be the sole exit, because a T1 branch (`27-F11e`, most deployments)
 * may have no manager present and a lockout with no automatic end BRICKS THE TILL — which
 * `01-F17` forbids in spirit, since it stops sales to enforce a security control.
 *
 * Five minutes is chosen against the two failure modes it sits between: long enough that online
 * guessing at ~13 bits of PIN entropy is hopeless (three tries per five minutes), short enough
 * that a cashier who fat-fingered their PIN three times waits out one order rather than a shift.
 */
export const PIN_LOCKOUT_COOLDOWN_MS = 5 * 60_000;

const isLockedOut = (
  record: PinAttemptRecord,
  max_failed_attempts: number,
  at: number,
  cooldown_ms: number,
): boolean => record.failures >= max_failed_attempts && at - record.last_failure_at < cooldown_ms;

export const createPinSession = (options: PinSessionOptions): PinSession => {
  const { registry, device, idle_lock_ms, max_failed_attempts, now, audit } = options;
  const attempts = options.attempts ?? createMemoryPinAttemptStore();
  const cooldown_ms = options.lockout_cooldown_ms ?? PIN_LOCKOUT_COOLDOWN_MS;

  let user: string | null = null;
  let last_activity = 0;

  const emit = (user_id: string, outcome: "success" | "failure", reason?: UnlockRefusal): void => {
    audit({
      type: "audit.login",
      // `reason` is OMITTED on success rather than set to a sentinel, and `prev_audit_hash` is
      // absent entirely — the chain is store-owned (`01-F5`).
      payload:
        reason === undefined
          ? { user_id, device_id: device.device_id, outcome }
          : { user_id, device_id: device.device_id, outcome, reason },
    });
  };

  /** Every refusal is audited, including the lockout itself: a lockout that stops writing the
   *  record hides the tail of an attack from the one surface that would show it (`01-F5`). */
  const refuse = (user_id: string, reason: UnlockRefusal): UnlockResult => {
    emit(user_id, "failure", reason);
    return { ok: false, reason, user_id };
  };

  /** `01-F26` idle auto-lock, evaluated on read rather than on a timer — a timer would need a
   *  host clock and would fire in a process that may be suspended between orders anyway. */
  const expireIfIdle = (): void => {
    if (user !== null && now() - last_activity >= idle_lock_ms) user = null;
  };

  return {
    async unlock(user_id, pin) {
      // `01-F27`: BOTH factors are validated, and `01-F48` makes the direction fail-closed.
      // Checked before the registry so an unpaired terminal reveals nothing about who exists.
      if (!device.registered) return refuse(user_id, "device_not_registered");

      const at = now();
      const record = attempts.read(device.device_id, user_id);
      if (isLockedOut(record, max_failed_attempts, at, cooldown_ms)) {
        return refuse(user_id, "locked_out");
      }
      // The cooldown has run out: the counter is reset, not merely bypassed, so the cashier
      // gets a full set of attempts back. Leaving it at the ceiling would allow exactly one
      // try per cooldown for the rest of the device's life — the bricked till by instalments.
      if (record.failures > 0 && record.failures >= max_failed_attempts) {
        attempts.clear(device.device_id, user_id);
      }

      // `01-F28`: the answer comes from synced reference data. No transport is reached for —
      // an unknown user is a refusal here, not a question for the cloud.
      const member = registry.lookup(user_id);
      if (member === null) return refuse(user_id, "unknown_user");

      if (!(await verifyPin(member.pin_hash, pin))) {
        attempts.recordFailure(device.device_id, user_id, now());
        return refuse(user_id, "bad_pin");
      }

      // `00 §5.4`'s "repeated failure" is CONSECUTIVE failure: a proven PIN is proof the run
      // ended. A counter that only ever climbs locks every cashier out within a week of
      // ordinary typos — a stopped till on a fixed schedule (`01-F17`).
      attempts.clear(device.device_id, user_id);
      user = user_id;
      last_activity = now();
      emit(user_id, "success");
      return { ok: true, user_id };
    },

    lock() {
      user = null;
    },

    touch() {
      expireIfIdle();
      if (user !== null) last_activity = now();
    },

    currentUser() {
      // Reading is NOT activity. If it were, every POS screen that polls the signed-in user
      // would hold the session open forever and idle auto-lock would never fire anywhere.
      expireIfIdle();
      return user;
    },
  };
};
