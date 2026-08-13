import {
  createPinSession,
  type DeviceStore,
  type PinAuditRecord,
  type UnlockRefusal,
} from "@restos/sync-client";

/**
 * # `03-F53` — WHO IS AT THE PASS, AND WHY THAT IS A MODULE RATHER THAN A LINE IN `index.ts`
 *
 * > 03-F53 **The pass runs `01-F26`'s PIN session, and the gate is on the ACT, never on the
 * > QUEUE.** … **Every state edge the pass writes carries the signed-in user, and with no session
 * > there is no edge.**
 *
 * This is `apps/pos-electron`'s unlock path on a second device, and it is deliberately **not** a
 * second implementation of it: `createPinSession` is `packages/sync-client`'s, protected
 * (commandment 10), and unchanged by this track. What lives here is the small amount that is this
 * app's — which store the session verifies against, what the identification grid is served from,
 * and the projection that crosses the plane.
 *
 * ## WHY A MODULE
 *
 * `main/index.ts` imports `electron` at module scope, so **nothing declared inside it is reachable
 * from vitest** and every claim about it degrades to a source string. `01-F61`'s durable counter is
 * instance 2 of `AGENTS.md`'s recurring defect by name — *"the durable lockout counter engaged only
 * if a host passed `store.pinAttempts`, and none did"* — and the only instrument that can see that
 * is a test which CONSTRUCTS this thing over a real store. So the construction is here and the host
 * does nothing but call it.
 *
 * Named `PassIdentity` and not `PassSession` because `01-F27` is about two identity axes and the
 * one this owns is the **human**: *"device tokens carry device identity only — user identity comes
 * from the PIN session"*.
 *
 * ## ⚠ ONE SESSION, AND THE COUNTER'S SECOND ONE IS NOT A PATTERN TO COPY HERE
 *
 * > 03-F53 `apps/pos-electron` builds a second `createPinSession` because `unlock()` MOVES the
 * > session and `02-F20` needs an actor and an approver in the same instant; approving through the
 * > cashier's own would sign her out and attribute her next twenty orders to whoever authorised one
 * > paid-out. **The pass has one act-class and no approval inside it**, so a second session here
 * > would be manufacturing the *"acting for"* concept `02-F41` ruled out. A change of cook is a
 * > lock and an unlock.
 *
 * So there is exactly one session in this app, and `unlock()` moving it IS the shift change.
 *
 * ## ⚠ WHAT THIS DELIBERATELY DOES NOT HAVE
 *
 *  - **No `lock()`.** `03-F53`'s OWED (1) is an explicit end-of-session control and it is owed, not
 *    built: *"a pass is passed between people far more often than a till is, and idle expiry is the
 *    only exit this FR requires"*. Exporting one with no caller would be the recurring defect in
 *    miniature.
 *  - **No role, and no authorization of any kind.** *"Signing in at the pass grants no authority;
 *    it supplies attribution."* `PERMISSION_ACTIONS` carries no line-state member and `03-F52` (d)
 *    refused to add one, so routing a bump through `can()` would deny every bump at every branch.
 *    `03-F24`/`03-F52`'s layer-2 assignment is the authorization and it lives in the emitters.
 *  - **No credential across the seam.** `roster()` projects `user_id` + a label and nothing else:
 *    `01-F28` puts verification in this process, so a hash reaching the renderer would be a secret
 *    shipped to the untrusted end of the bridge for no purpose at all.
 */

/** One tile on `01-F61`'s identification grid. Never a `StaffMember` — see the header. */
export type PassRosterMember = {
  readonly user_id: string;
  readonly display_name: string;
};

/**
 * `03-F53`: *"A refusal says WHICH refusal. Being locked out is distinguishable on the glass from
 * a PIN that was simply wrong."* The vocabulary is `pin-session.ts`'s own `UnlockRefusal`, reused
 * rather than restated — a second enum here would be a second interpretation of a closed set.
 *
 * The refused shape carries **no `user_id`**, unlike `sync-client`'s `UnlockResult`: the caller
 * asked about a specific identity and echoing it back adds nothing the screen does not hold.
 */
export type PassUnlockResult =
  | { readonly ok: true; readonly user_id: string }
  | { readonly ok: false; readonly reason: UnlockRefusal };

export type PassIdentity = {
  /**
   * `01-F61`'s grid, **in the registry's order and never this module's**.
   *
   * `27-F4` bans adaptive, frecency-sorted and alphabetical ordering anywhere staff-facing, and
   * `01-F61` calls the absence of sorting an asset — *"a tile learned by position is usable without
   * reading it"*. `staff.ts` documents that its order is `user_id`'s and that a hire still shifts
   * tiles; `01-F61`'s `grid_ordinal` is what closes that and is OWED (`03-F53` OWED (2)). What is
   * in this module's hands is imposing no order of its own, and it imposes none.
   */
  roster(): PassRosterMember[];
  /** `01-F28` — verified on-device against the synced credential hashes. No transport. */
  unlock(user_id: string, pin: string): Promise<PassUnlockResult>;
  /** Whoever's PIN is in, or `null`. Evaluates `01-F26`'s idle auto-lock against the clock. */
  currentUser(): string | null;
  /** `03-F53`: *"Acting is activity; looking is not."* Fed by every edge, by no read. */
  touch(): void;
};

export type PassIdentityDeps = {
  /**
   * The device store, narrowed to the three things a session needs, so the type says what is
   * touched: the synced registry (`01-F28`), the DURABLE failure counter (`01-F61`) and the
   * device's own id (`01-F27`'s other axis).
   */
  readonly store: Pick<DeviceStore, "staff" | "pinAttempts" | "identity">;
  /** `01-F26` — a device-layer setting (`00 §7` layer 3), never a constant in this file. */
  readonly idle_lock_ms: number;
  /** `01-F61` — N consecutive failures tolerated; the (N+1)th attempt is refused. */
  readonly max_failed_attempts: number;
  readonly now: () => number;
  /** `01-F5`'s `audit.login` sink. A no-op here is instance 4 of the recurring defect. */
  readonly audit: (record: PinAuditRecord) => void;
};

export const createPassIdentity = (deps: PassIdentityDeps): PassIdentity => {
  const { store } = deps;
  const session = createPinSession({
    // `01-F28` — the synced credential hashes, on disk, verified with the WAN cable pulled.
    registry: store.staff,
    // `01-F27`'s other axis. `registered: true` because the resolved identity stands in for an
    // admitted device; when `01-F47`'s device-side admission lands this reads the real state and
    // an unpaired screen refuses every PIN (`01-F25`, `01-F48` fail-closed). Same reading as the
    // counter's, deliberately: two devices disagreeing about what admission means is worse than
    // one pinned interpretation stated twice.
    device: { device_id: store.identity.device_id, registered: true },
    idle_lock_ms: deps.idle_lock_ms,
    max_failed_attempts: deps.max_failed_attempts,
    now: deps.now,
    audit: deps.audit,
    /**
     * `01-F61`'s second decision, and the one line that makes it real: *"the counter PERSISTS
     * across an app restart. A counter held in memory is defeated by relaunching the app, which
     * makes the lockout theatre — and the attacker who most needs locking out is standing at the
     * device with physical access to do exactly that."* Omitted, `pin-session.ts` falls back to a
     * process-lifetime counter in silence: same scope, same cooldown, no persistence.
     */
    attempts: store.pinAttempts,
    // `lockout_cooldown_ms` is deliberately not passed — `PIN_LOCKOUT_COOLDOWN_MS`'s five minutes
    // is the pinned value the FR is satisfied by, and `03-F53` fixes no timeout of its own.
  });

  return {
    roster: () =>
      store.staff.list().map((member) => ({
        user_id: member.user_id,
        // `01-F54` — degrade to the identifier rather than render a blank tile. `staff.ts` makes
        // `display_name` optional on purpose (a device holding rows written before the field
        // existed must not have its whole roster refused), and a blank tile is indistinguishable
        // from a rendering failure on a surface an operator taps all service.
        display_name: member.display_name ?? member.user_id,
      })),
    unlock: async (user_id, pin) => {
      const result = await session.unlock(user_id, pin);
      return result.ok
        ? { ok: true, user_id: result.user_id }
        : { ok: false, reason: result.reason };
    },
    currentUser: () => session.currentUser(),
    touch: () => session.touch(),
  };
};
