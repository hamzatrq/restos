// ACCEPTANCE TESTS — `03-F53`: identity on the pass, and attribution on every edge it writes.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author of this file wrote no production
// code for `03-F53` and is disqualified from implementing it. Every claim below traces to a quoted
// FR; where a reading had to be chosen, the choice is named as a choice and the simpler
// alternative is stated (`24 §3b`). Committed RED.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FRs THIS FILE IS WRITTEN FROM, quoted because the reasoning is the contract:
//
//   03-F53  "**Every state edge the pass writes carries the signed-in user, and with no session
//           there is no edge.** … **The refusal belongs to the emitter that builds the edge, not
//           to the host that wires it**, so ONE read of the session decides both whether the act
//           happens and whose name is on it."
//   03-F53  "**The queue itself is never gated** … Identification is charged on the act and never
//           on the look."
//   03-F53  "**There is no unattributable edge and no urgent bypass** … The harm `01-F17` really
//           names here is the ticket that never leaves (`03-F17`), and it is bounded by two
//           properties this FR relies on rather than invents: the queue stays visible whatever
//           happens, and `01-F61`'s counter is per **(device, user)** and ends on a **time
//           cooldown** — so one cook's five typos never lock the screen, never lock a colleague,
//           and end by themselves."
//   03-F53  "**Acting is activity; looking is not.** … What it fixes is what feeds the timer —
//           every edge the pass writes, and no read."
//   03-F53  "**Signing in at the pass grants no authority; it supplies attribution.**"
//   03-F53  OWED (3) "nothing populates the staff registry on any device … so the pass runs on
//           the same marked DEV SEED the counter does, and it is **one declaration read by both
//           apps** (`DEC-ARCH-001`), never a second copy."
//   03-F16  "Ready-marking: per line and whole-order, one tap → `order.line_state_changed` to
//           `ready` **with actor**."
//   02-F41  "attribution is whoever's PIN is in, with no 'acting for' concept."
//   01-F27  "device tokens carry device identity only — **user identity comes from the PIN
//           session**."
//   01-F28  "Offline auth: PIN verification works on-device against synced credential hashes."
//   01-F61  "**Scope is per (device, user).** … **The counter PERSISTS across an app restart.** …
//           **A lockout ENDS on a time cooldown, never only on a human** … a lockout with no
//           automatic end **bricks the till**."
//   01-F61  "**Selecting a person is not submitting an attempt** … the per-(device, user) counter
//           is charged **only** when a PIN is actually submitted against that user."
//   01-F26  "PIN (Argon2id) unlock on shared devices; idle auto-lock (device-layer setting)."
//   01-F17  a sale is never blocked — and (commandment 4) no in-branch feature may require a WAN
//           or a correct configuration to keep working.
//   DEC-ARCH-001  extract a shared implementation at the moment it acquires a second consumer,
//           because "a second local helper is a second interpretation … and the two diverge
//           silently — one of them starts keeping a field, and nothing says which is right."
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE CONTRACT THESE TESTS DEFINE. Two new declarations and two amended ones.
//
//   apps/pass-kds/src/main/pass-identity.ts
//
//     export type PassRosterMember = { user_id: string; display_name: string }
//     export type PassUnlockResult =
//       | { ok: true;  user_id: string }
//       | { ok: false; reason: UnlockRefusal }        ← `sync-client`'s own vocabulary, reused
//     export type PassIdentity = {
//       roster(): PassRosterMember[]
//       unlock(user_id: string, pin: string): Promise<PassUnlockResult>
//       currentUser(): string | null
//       touch(): void
//     }
//     export const createPassIdentity: (deps: {
//       store: Pick<DeviceStore, "staff" | "pinAttempts" | "identity">
//       idle_lock_ms: number
//       max_failed_attempts: number
//       now: () => number
//       audit: (record: PinAuditRecord) => void
//     }) => PassIdentity
//
//     WHY A MODULE AND NOT A CALL IN `main/index.ts`. This app's main is already six modules and
//     one wiring file, and `main/index.ts` imports `electron` at module scope — so nothing
//     declared inside it is reachable from vitest, and every claim about it degrades to a source
//     string. `01-F61`'s durable counter is instance 2 of `AGENTS.md`'s recurring defect (the
//     host that forgets `attempts:` gets a process-lifetime counter and a green suite), and the
//     only instrument that can see it is a test that CONSTRUCTS the thing over a real store.
//     Named `PassIdentity` and not `PassSession`: `01-F27` is about two identity axes, and the
//     one this owns is the human.
//
//   apps/pass-kds/src/main/{ready-mark,serve-mark}.ts   ← AMENDED
//
//     ReadyMarkDeps.actor / ServeMarkDeps.actor: () => string | null       ← NEW, REQUIRED
//     ReadyMarkDeps.append / ServeMarkDeps.append:
//         (type: string, payload: LineStateChangedPayload, actor_user_id: string) => void
//     ReadyMarkResult / ServeMarkResult gain { ok: false; reason: "no_session" }
//
//     THREE DECISIONS, each argued rather than assumed:
//
//      1. **REQUIRED, not optional.** An optional `actor` with a `null` default is Rule B's
//         unsupplied-seam defect by construction — `AGENTS.md` counts it as half the class — and
//         the thing it would silently drop here is attribution on a terminal claim.
//      2. **A GETTER, matching `policy`.** `02-F41` is read at the act, never captured: a value
//         taken at construction freezes attribution at boot, which is the defect
//         `apps/pos-electron` replaced its own captured `session` to remove.
//      3. **The actor travels ON the append, typed `string` and not `string | null`.** This is
//         `02-F45`'s rule applied to a credential: one read of the session decides both whether
//         the act happens and whose name is on the envelope, so the two cannot disagree, and
//         there is no TOCTOU window in which the session moves between the check and the write.
//         The non-nullable third parameter makes `actor_user_id: null` **unrepresentable** on
//         this path rather than merely discouraged.
//
//     THE SIMPLER ALTERNATIVE, named because `24 §3b` requires it: leave both signatures alone
//     and have `main/index.ts` write `actor_user_id: pins.currentUser()`. It is one line and it
//     is refused for two reasons — the gate would sit in a file no test can import (so every
//     assertion about it is a source string, which `AGENTS.md`'s M10 row warns "can be satisfied
//     by a call that is present and wrong"), and it is two reads of one fact.
//
//   @restos/device-config          ← the DEV SEED, moved rather than copied
//
//     export const DEV_PIN_ENV: "RESTOS_DEV_PIN"
//     export const DEV_STAFF: readonly { user_id, display_name, role }[]
//     export const seedDevStaff: (o: {
//       registry: { version(): number; apply(u: …): unknown }   ← structurally typed, as
//       branch_id: string                                          `DisplayFacts` already is
//       pin: string | undefined
//     }) => Promise<boolean>       // false ⇒ nothing was seeded
//
//     `apps/pos-electron/src/main/index.ts` declares `DEV_STAFF` and `seedDevStaff` today, and
//     `18 §2` forbids `apps → apps` outright. `DEC-ARCH-001` rules EXTRACT at the second consumer
//     — the ruling this app's own module header already cites for `resolveAging` — so the roster
//     moves into the package both apps already depend on. A copy is refused by name there: two
//     declarations of one roster is a pass screen and a till that disagree about who is on shift.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// OUT OF SCOPE, deliberately, so a clean run is not read as coverage: the Argon2id parameters
// and the cost floor (`packages/domain/src/pin.ts` and `sync-client`'s own suites own them); the
// arithmetic of `PinAttemptStore` (`pin-attempt-persistence.test.ts`); what `audit.login` carries
// (`pin-audit-append.test.ts`); the SCREEN, which is `../../renderer/pass-unlock.dom.test.tsx`;
// and whether `main/index.ts` wires any of it, which is `./pass-identity-seam.test.ts` and is a
// source read because this app's main imports `electron` at module scope.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEV_PIN_ENV, DEV_STAFF, resolveServeSignal, seedDevStaff } from "@restos/device-config";
import { hashPin, verifyPin } from "@restos/domain";
import { type DeviceStore, openStore, PIN_LOCKOUT_COOLDOWN_MS } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { createPassIdentity, type PassIdentity } from "../pass-identity";
import { createReadyMark, type LineStateChangedPayload } from "../ready-mark";
import { resolveReadySignal } from "../ready-signal";
import { createServeMark } from "../serve-mark";

const ORG = "0199aaaa-0000-7000-8000-000000000001";
const BRANCH = "0199aaaa-0000-7000-8000-000000000002";
const DEVICE = "0199aaaa-0000-7000-8000-000000000005";
const ORDER = "0199cccc-0000-7000-8000-00000000abcd";

/**
 * The two cooks. Their PINs are DIFFERENT and neither is the other's, so a per-user assertion
 * cannot pass by accident — and IMRAN's begins with `0`, which is the digit
 * `packages/ui`'s `NumericKeypad` silently eats (the renderer oracle's own trap, restated here
 * because main must not normalise a credential either).
 */
const SAJID = "0199bbbb-0000-7000-8000-00000000c001";
const IMRAN = "0199bbbb-0000-7000-8000-00000000c002";
const SAJID_PIN = "846201";
const IMRAN_PIN = "046201";
const WRONG_PIN = "111111";

const dirs: string[] = [];
const freshStore = (path?: string): DeviceStore => {
  const dir = path ?? mkdtempSync(join(tmpdir(), "pass-identity-"));
  if (path === undefined) dirs.push(dir);
  return openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
  });
};
const scratchDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "pass-identity-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Two real Argon2id credentials in a real registry — `01-F28`'s synced reference data. */
const enrol = async (store: DeviceStore): Promise<void> => {
  store.staff.apply({
    kind: "snapshot",
    version: store.staff.version() + 1,
    members: [
      {
        user_id: SAJID,
        display_name: "Sajid",
        pin_hash: await hashPin(SAJID_PIN),
        assignments: [{ role: "cashier", branch_id: BRANCH }],
      },
      {
        user_id: IMRAN,
        display_name: "Imran",
        pin_hash: await hashPin(IMRAN_PIN),
        assignments: [{ role: "cashier", branch_id: BRANCH }],
      },
    ],
  });
};

/** A clock the test moves by hand — never a sleep (`24-F12`: a duration assertion is a flake). */
const clock = (start = 1_754_300_000_000) => {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
};

type Harness = {
  identity: PassIdentity;
  advance: (ms: number) => number;
  logins: number;
};

const identityOn = (store: DeviceStore, tick = clock(), idle_lock_ms = 10 * 60_000): Harness => {
  const h: Harness = {
    advance: tick.advance,
    logins: 0,
    identity: createPassIdentity({
      store,
      idle_lock_ms,
      max_failed_attempts: 3,
      now: tick.now,
      audit: () => {
        h.logins += 1;
      },
    }),
  };
  return h;
};

let seq = 0;
const uuid = (): string => `0199dddd-0000-7000-8000-${String(++seq).padStart(12, "0")}`;

/** The seed events, written by "the counter" — `actor_user_id: null` is right for a fixture. */
const seedEvent = (store: DeviceStore, type: string, payload: unknown): void => {
  store.append({
    id: uuid(),
    org_id: ORG,
    branch_id: BRANCH,
    device_id: DEVICE,
    actor_user_id: null,
    device_created_at: 1_000,
    type,
    schema_version: 1,
    payload,
    refs: [],
  });
};

/** A confirmed two-line dine-in order with both lines walked to `ready`. */
const readyOrder = (store: DeviceStore): void => {
  seedEvent(store, "order.created", {
    order_id: ORDER,
    channel: "counter",
    order_type: "dine_in",
  });
  for (const n of [0, 1]) {
    seedEvent(store, "order.line_added", {
      order_id: ORDER,
      line_id: `L${n}`,
      item_id: "item-karahi",
      qty: 1,
      unit_price_paisa: 45_000,
    });
  }
  seedEvent(store, "order.confirmed", { order_id: ORDER });
  const step = (from: string, to: string): void =>
    seedEvent(store, "order.line_state_changed", {
      order_id: ORDER,
      line_ids: ["L0", "L1"],
      state: to,
      line_context: {
        L0: { to, from_states: [from], preds: [] },
        L1: { to, from_states: [from], preds: [] },
      },
    });
  step("placed", "confirmed");
  step("confirmed", "in_prep");
  step("in_prep", "ready");
};

/** A confirmed order whose lines are still at `confirmed`, so DONE has work to do. */
const cookingOrder = (store: DeviceStore): void => {
  seedEvent(store, "order.created", {
    order_id: ORDER,
    channel: "counter",
    order_type: "dine_in",
  });
  seedEvent(store, "order.line_added", {
    order_id: ORDER,
    line_id: "L0",
    item_id: "item-karahi",
    qty: 1,
    unit_price_paisa: 45_000,
  });
  seedEvent(store, "order.confirmed", { order_id: ORDER });
  seedEvent(store, "order.line_state_changed", {
    order_id: ORDER,
    line_ids: ["L0"],
    state: "confirmed",
    line_context: { L0: { to: "confirmed", from_states: ["placed"], preds: [] } },
  });
};

/**
 * THE HOST FIXTURE, written the way `main/index.ts` must write it: the actor the EMITTER handed
 * over is the actor that reaches the envelope. Nothing here may read the session a second time —
 * that is the whole content of decision 3 in the contract above.
 */
const emittersOn = (store: DeviceStore, actor: () => string | null) => {
  const appended: { type: string; payload: LineStateChangedPayload; actor: string }[] = [];
  const write = (type: string, payload: LineStateChangedPayload, actor_user_id: string): void => {
    appended.push({ type, payload, actor: actor_user_id });
    store.append({
      id: uuid(),
      org_id: ORG,
      branch_id: BRANCH,
      device_id: DEVICE,
      actor_user_id,
      device_created_at: 1_000,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  return {
    appended,
    ready: createReadyMark({
      store,
      policy: () => resolveReadySignal(undefined),
      actor,
      append: write,
    }),
    serve: createServeMark({
      store,
      policy: () => resolveServeSignal({ roster: null, configured: "pass" }),
      actor,
      append: write,
    }),
  };
};

/** Every `order.line_state_changed` this device wrote, newest last, as the ledger holds it. */
const edgesInLedger = (store: DeviceStore) =>
  store.readAllEvents().filter((e) => e.type === "order.line_state_changed");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE ROSTER REACHES THE DEVICE, AND IT IS ONE DECLARATION (`03-F53` OWED (3)).
//
// This section exists because of the failure mode named in this round's brief: *a feature that
// shipped green and could not be USED, because the dev seed had not grown with it.* Nothing
// populates `store.staff` on any device — `01-F47` admits devices, not people — so a pass screen
// with a correct unlock path and an empty registry is a kitchen nobody can sign in to.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F53 OWED (3) / DEC-ARCH-001 — the DEV SEED, moved and not copied", () => {
  it("seeds a real Argon2id credential for every member, against a REAL registry", async () => {
    // MUTANT: a seed that stores the PIN, or a hash from a different algorithm. Caught — the
    // credential is proved by `domain`'s own verifier and the plaintext is proved absent.
    const store = freshStore();
    const seeded = await seedDevStaff({ registry: store.staff, branch_id: BRANCH, pin: "4821" });

    expect(seeded, "seedDevStaff reported that it seeded nothing").toBe(true);
    expect(store.staff.list()).toHaveLength(DEV_STAFF.length);
    expect(DEV_STAFF.length, "a roster of nobody cannot be identified against").toBeGreaterThan(0);

    for (const member of store.staff.list()) {
      expect(await verifyPin(member.pin_hash, "4821"), `${member.user_id} cannot unlock`).toBe(
        true,
      );
      // `01-F1`/`01-F28`: what is synced is a HASH. A registry row holding the digits would be a
      // credential on disk, and the same row is what a real transport will one day carry.
      expect(member.pin_hash.includes("4821"), "the PIN is in the credential").toBe(false);
      // `01-F26` — the assignment is per LOCATION, and it must be THIS branch or the row
      // authorizes nothing here and renders no role on the tile.
      expect(member.assignments.some((a) => a.branch_id === BRANCH)).toBe(true);
      // `01-F61` — "a grid of tiles labelled by opaque id is unusable".
      expect(member.display_name ?? "").not.toBe("");
    }
  });

  it("seeds NOTHING when the environment names no PIN — an empty grid is the honest state", async () => {
    // `apps/pos-electron`'s own rule, carried across rather than re-decided: "Unset ⇒ nothing is
    // seeded, and an empty grid on a locked till is the honest state of a device no roster has
    // reached (`00 §5.7`) — which is also what production looks like until the transport lands."
    //
    // MUTANT: a hardcoded fallback PIN. Caught — a seeded roster reds both assertions.
    const store = freshStore();
    expect(await seedDevStaff({ registry: store.staff, branch_id: BRANCH, pin: undefined })).toBe(
      false,
    );
    expect(store.staff.list()).toEqual([]);
    expect(await seedDevStaff({ registry: store.staff, branch_id: BRANCH, pin: "" })).toBe(false);
    expect(store.staff.list()).toEqual([]);
    // The env var is NAMED by the package, not spelled out twice — a second spelling is the
    // divergence `DEC-ARCH-001` exists to prevent, and it fails silently (unset ⇒ no roster).
    expect(DEV_PIN_ENV).toBe("RESTOS_DEV_PIN");
  });

  it("01-F17 — a re-seed on a device that already has a roster does not empty it", async () => {
    // The restart case, and it is not hypothetical: both apps seed at every boot. A seed that
    // applied at a stale version would be REFUSED by `staff.ts` as `stale`, leaving a device that
    // ran once with a roster and every time after without one — a pass nobody can sign in to,
    // arriving on the second launch.
    //
    // MUTANT: `version: 1` hardcoded instead of `version() + 1`. Caught here and nowhere else.
    const dir = scratchDir();
    const first = freshStore(dir);
    await seedDevStaff({ registry: first.staff, branch_id: BRANCH, pin: "4821" });
    first.close();

    const second = freshStore(dir);
    expect(second.staff.list(), "the roster did not survive the restart").toHaveLength(
      DEV_STAFF.length,
    );
    await seedDevStaff({ registry: second.staff, branch_id: BRANCH, pin: "4821" });
    expect(second.staff.list(), "re-seeding emptied the registry").toHaveLength(DEV_STAFF.length);
    second.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `01-F27` / `01-F28`: WHO IS SIGNED IN COMES FROM THE PIN SESSION, VERIFIED ON DEVICE.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F27 / 01-F28 — identity comes from the session, never from the device", () => {
  it("starts with nobody signed in, and a correct PIN puts THAT person in", async () => {
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    // A device that boots signed-in-as-somebody is `02-F41` naming whoever left the kitchen.
    expect(h.identity.currentUser(), "the pass booted with a session already in").toBeNull();

    await expect(h.identity.unlock(SAJID, SAJID_PIN)).resolves.toEqual({
      ok: true,
      user_id: SAJID,
    });
    expect(h.identity.currentUser()).toBe(SAJID);
  });

  it("the identity is not inferred from the PIN — a correct PIN under the wrong id is refused", async () => {
    // `01-F61`'s whole first argument, driven rather than described: a pad that matched the entry
    // against every hash on the device would accept this, because `IMRAN_PIN` IS a valid PIN on
    // this device — just not Sajid's.
    //
    // MUTANT: `unlock` that ignores `user_id` and scans the registry. Caught — it returns
    // `{ ok: true }` here, and then signs in the wrong cook, which `02-F41` writes into a ledger
    // `01-F1` forbids correcting in place.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    const result = await h.identity.unlock(SAJID, IMRAN_PIN);
    expect(result.ok, "a PIN belonging to somebody else unlocked this identity").toBe(false);
    expect(h.identity.currentUser()).toBeNull();
  });

  it("a leading-zero PIN verifies unchanged — main normalises no credential", async () => {
    // The renderer oracle bans `NumericKeypad` for eating a leading `0`; this is the same trap on
    // the trusted side. MUTANT: any `Number(pin)` / `trimStart` on the way to the verifier.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);
    await expect(h.identity.unlock(IMRAN, IMRAN_PIN)).resolves.toEqual({
      ok: true,
      user_id: IMRAN,
    });
  });

  it("an unknown user is refused, and distinguishably so (00 §5.7)", async () => {
    // `pin-session.ts` keeps its refusals distinct on purpose: "telling a cashier to re-key a PIN
    // that was already right, on a terminal that will never accept it, … hides a revoked device
    // behind a typo message." `03-F53` requires that distinction survive to the surface.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    const result = await h.identity.unlock("0199bbbb-0000-7000-8000-0000000000ff", SAJID_PIN);
    expect(result).toEqual({ ok: false, reason: "unknown_user" });
  });

  it("the roster carries NO credential across the seam", () => {
    // `01-F28` puts verification in this process, so nothing downstream of `roster()` has any use
    // for a hash — and the renderer is the untrusted end of a bridge this feeds.
    //
    // MUTANT: `roster: () => store.staff.list()`. Caught — `StaffMember` carries `pin_hash`, and
    // it type-checks all the way to the screen.
    const store = freshStore();
    const h = identityOn(store);
    store.staff.apply({
      kind: "snapshot",
      version: 1,
      members: [
        {
          user_id: SAJID,
          display_name: "Sajid",
          pin_hash: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA",
          assignments: [{ role: "cashier", branch_id: BRANCH }],
        },
      ],
    });

    const rows = h.identity.roster();
    expect(rows).toEqual([{ user_id: SAJID, display_name: "Sajid" }]);
    expect(JSON.stringify(rows).includes("argon2"), "a credential reached the roster").toBe(false);
  });

  it("01-F54 — a member with no display name still gets a tile, labelled by identifier", () => {
    // `staff.ts` makes `display_name` optional on purpose (a device holding rows written before
    // the field existed must not have its whole roster refused). A blank tile "is indistinguishable
    // from a rendering failure on a surface an operator taps 20–60× a shift".
    const store = freshStore();
    const h = identityOn(store);
    store.staff.apply({
      kind: "snapshot",
      version: 1,
      members: [{ user_id: SAJID, pin_hash: "x", assignments: [] }],
    });
    expect(h.identity.roster()).toEqual([{ user_id: SAJID, display_name: SAJID }]);
  });

  it("01-F61 — the ORDER is the registry's, passed through untouched", () => {
    // `27-F4`: "a tile learned by position is usable without reading it". `staff.ts` documents
    // that its order is `user_id`'s and that a hire still shifts tiles (`grid_ordinal` is OWED and
    // `03-F53` re-states that it is unclosed here). What this asserts is the narrower thing that
    // IS in the implementer's hands: this module imposes no order of its own.
    //
    // MUTANT: `.sort((a, b) => a.display_name.localeCompare(b.display_name))` — alphabetical is
    // the tempting one and `27-F4` bans it by name. Caught: Zubair is enrolled with the LOWEST
    // user_id and the LAST name in the alphabet, so registry order and alphabetical order differ.
    const store = freshStore();
    const h = identityOn(store);
    const ZUBAIR = "0199bbbb-0000-7000-8000-00000000a001";
    store.staff.apply({
      kind: "snapshot",
      version: 1,
      members: [
        { user_id: SAJID, display_name: "Sajid", pin_hash: "x", assignments: [] },
        { user_id: ZUBAIR, display_name: "Zubair", pin_hash: "x", assignments: [] },
      ],
    });
    expect(h.identity.roster().map((m) => m.display_name)).toEqual(
      store.staff.list().map((m) => m.display_name ?? m.user_id),
    );
    // …and the fixture really does separate the two orders, or the assertion above is vacuous.
    expect(store.staff.list()[0]?.display_name).toBe("Zubair");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `01-F61` ON THE SURFACE WHERE COMMANDMENT 4 BINDS HARDEST.
//
// `03-F53`: "one cook's five typos never lock the screen, never lock a colleague, and end by
// themselves. A device-wide counter here would be `01-F61`'s bricked till one surface along."
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F61 / 01-F17 — a cook who cannot sign in cannot stop the kitchen", () => {
  it("a locked-out cook does NOT lock out her colleague", async () => {
    // THE `01-F17` PROPERTY OF THIS TRACK, and the one a plausible wrong implementation breaks:
    // a device-wide counter is the shape a session reaches for when it has no user to key on, and
    // it passes every other row in this file.
    //
    // MUTANT: `attempts` keyed on `device_id` alone. Caught here, and ONLY here.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    for (let i = 0; i < 3; i += 1) await h.identity.unlock(SAJID, WRONG_PIN);
    expect(await h.identity.unlock(SAJID, SAJID_PIN)).toEqual({
      ok: false,
      reason: "locked_out",
    });

    // Imran walks up to the same screen. Nothing about Sajid's typing may touch him.
    await expect(h.identity.unlock(IMRAN, IMRAN_PIN)).resolves.toEqual({
      ok: true,
      user_id: IMRAN,
    });
    expect(h.identity.currentUser()).toBe(IMRAN);
  });

  it("the lockout ENDS on a time cooldown, with no human involved", async () => {
    // `01-F61`: "A manager-clear path cannot be the sole exit: a T1 branch may have no manager
    // present, and a lockout with no automatic end BRICKS THE TILL." A pass mid-service is the
    // same argument with food on it.
    //
    // MUTANT: a lockout cleared only by a manager, or `lockout_cooldown_ms: Infinity`. Caught.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    for (let i = 0; i < 3; i += 1) await h.identity.unlock(SAJID, WRONG_PIN);
    expect((await h.identity.unlock(SAJID, SAJID_PIN)).ok).toBe(false);

    h.advance(PIN_LOCKOUT_COOLDOWN_MS + 1);
    await expect(h.identity.unlock(SAJID, SAJID_PIN)).resolves.toEqual({
      ok: true,
      user_id: SAJID,
    });
  });

  it("01-F61 — the counter is DURABLE: relaunching the app does not clear it", async () => {
    // Instance 2 of `AGENTS.md`'s recurring defect, in the one place it can still recur: "the
    // durable lockout counter engaged only if a host passed `store.pinAttempts`, and none did."
    // A host that omits it keeps the scope and the cooldown and loses the persistence — and every
    // other row in this file stays green.
    //
    // MUTANT: `createPassIdentity` that does not pass `attempts: store.pinAttempts`. Caught here,
    // and ONLY here.
    const dir = scratchDir();
    const first = freshStore(dir);
    await enrol(first);
    const tick = clock();
    const before = identityOn(first, tick);
    for (let i = 0; i < 3; i += 1) await before.identity.unlock(SAJID, WRONG_PIN);
    expect((await before.identity.unlock(SAJID, SAJID_PIN)).ok).toBe(false);
    first.close();

    // The attacker's move: pull the power, start the app again.
    const second = freshStore(dir);
    const after = identityOn(second, tick);
    expect(
      await after.identity.unlock(SAJID, SAJID_PIN),
      "the lockout did not survive a restart — the counter is in the process, not on the disk",
    ).toEqual({ ok: false, reason: "locked_out" });
    second.close();
  });

  it("01-F61 — a proven PIN ends the run; ordinary typos never accumulate into a lockout", async () => {
    // "`00 §5.4`'s repeated failure is CONSECUTIVE failure … A counter that only ever climbs locks
    // every cashier out within a week of ordinary typos — a stopped till on a fixed schedule."
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    for (let round = 0; round < 4; round += 1) {
      await h.identity.unlock(SAJID, WRONG_PIN);
      await h.identity.unlock(SAJID, WRONG_PIN);
      expect(
        (await h.identity.unlock(SAJID, SAJID_PIN)).ok,
        `locked out on round ${round} — two typos an hour must never brick a pass`,
      ).toBe(true);
    }
  });

  it("01-F61 — identification alone charges nothing; only a submitted PIN does", async () => {
    // "Selecting a person is not submitting an attempt … Without this, a mis-tap on a grid charges
    // a failed attempt to someone WHO IS NOT IN THE BUILDING."
    //
    // On this seam that reads as: reading the roster, and reading who is signed in, are free. A
    // mis-tap that never reaches `unlock` cannot cost anybody anything — so the roster is read
    // repeatedly here and Sajid's three attempts still have to be his own.
    //
    // MUTANT: any implementation that charges a failure on `roster()` or `currentUser()`.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    for (let i = 0; i < 20; i += 1) {
      h.identity.roster();
      h.identity.currentUser();
    }
    for (let i = 0; i < 2; i += 1) await h.identity.unlock(SAJID, WRONG_PIN);
    expect(
      (await h.identity.unlock(SAJID, SAJID_PIN)).ok,
      "taps on the grid were charged to somebody",
    ).toBe(true);
  });

  it("01-F5 — every unlock and every refusal leaves an audit record", async () => {
    // `pin-session.ts`: "Every refusal is audited, including the lockout itself: a lockout that
    // stops writing the record hides the tail of an attack from the one surface that would show
    // it." The sink is the host's; what is asserted here is that this module HAS one and feeds it.
    //
    // MUTANT: `audit: () => {}` inside `createPassIdentity`, which is instance 4 of the recurring
    // defect wearing this app's name. Caught — the count stays 0.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store);

    await h.identity.unlock(SAJID, WRONG_PIN);
    await h.identity.unlock(SAJID, SAJID_PIN);
    expect(h.logins, "the pass verified two PINs and recorded neither").toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `01-F26` / `03-F53`: ACTING IS ACTIVITY; LOOKING IS NOT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F26 — idle auto-lock, and what feeds its clock", () => {
  it("the session expires when nobody has acted for the configured window", async () => {
    // `03-F53`: "a screen nobody has touched must not hold a session open behind whoever walked
    // away, because `02-F41` would go on naming them."
    //
    // MUTANT: `idle_lock_ms: Number.MAX_SAFE_INTEGER`, or a session that never expires. Caught.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store, clock(), 10 * 60_000);

    await h.identity.unlock(SAJID, SAJID_PIN);
    h.advance(10 * 60_000 - 1);
    expect(h.identity.currentUser(), "the session expired early").toBe(SAJID);
    h.advance(2);
    expect(h.identity.currentUser(), "the session outlived the idle window").toBeNull();
  });

  it("looking is not activity — polling the session does not hold it open", async () => {
    // `pin-session.ts` owns this ("every POS screen that polls the signed-in user would hold the
    // session open forever"), and the pass polls harder than the counter does: `main/uplink.ts`
    // fires `changed` EVERY SECOND so the age colours move, and the renderer re-reads on each one.
    // If a read were activity, the idle lock on this app would be unreachable by construction.
    //
    // MUTANT: `currentUser()` implemented as `touch(); return user`. Caught.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store, clock(), 10 * 60_000);
    await h.identity.unlock(SAJID, SAJID_PIN);

    for (let i = 0; i < 700; i += 1) {
      h.identity.currentUser();
      h.advance(1_000);
    }
    expect(h.identity.currentUser(), "polling the session held it open past the idle window").toBe(
      null,
    );
  });

  it("acting IS activity — a cook bumping every two minutes is not signed out", async () => {
    // The other half, and the one whose absence is a support call rather than a security hole:
    // without `touch()` the clock runs from the moment of unlock, so a cook is signed out ten
    // minutes into a service she has been working continuously.
    //
    // MUTANT: a `PassIdentity` with no `touch()`, or a host that never calls it. This row catches
    // the first; `pass-identity-seam.test.ts` is what catches the second.
    const store = freshStore();
    await enrol(store);
    const h = identityOn(store, clock(), 10 * 60_000);
    await h.identity.unlock(SAJID, SAJID_PIN);

    for (let i = 0; i < 15; i += 1) {
      h.advance(2 * 60_000);
      h.identity.touch();
    }
    expect(h.identity.currentUser(), "half an hour of continuous work signed the cook out").toBe(
      SAJID,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `03-F53` / `03-F16` / `02-F41`: NO SESSION, NO EDGE — AND EVERY EDGE CARRIES THE PERSON.
//
// This is the section the track exists for. It drives the REAL emitters over a REAL store and
// reads the ledger back, so an implementation that satisfies the emitter's idea of attribution
// and not the envelope's fails here rather than in review.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 03-F53 — with no session there is no edge", () => {
  it("DONE appends NOTHING while nobody is signed in", async () => {
    // MUTANT: the gate wired in `main/index.ts` instead of in the emitter. Caught — it is not
    // reachable from any suite, so every emitter test stays green and this one appends an edge.
    const store = freshStore();
    cookingOrder(store);
    const e = emittersOn(store, () => null);

    const before = edgesInLedger(store).length;
    const result = e.ready.mark(ORDER, null);

    expect(result.ok, "a ready-mark was accepted with nobody signed in").toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_session");
    expect(e.appended, "the emitter appended without an actor").toEqual([]);
    expect(edgesInLedger(store)).toHaveLength(before);
  });

  it("HAND OVER appends NOTHING while nobody is signed in — the terminal claim most of all", async () => {
    // `03-F52` makes this edge TERMINAL and `01-F1` makes it permanent: "an unattributable
    // permanent claim that food reached a customer". `03-F53` refuses it outright, with no urgent
    // bypass — "what waits is the RECORD", never the food.
    const store = freshStore();
    readyOrder(store);
    const e = emittersOn(store, () => null);

    const before = edgesInLedger(store).length;
    const result = e.serve.handOver(ORDER);

    expect(result.ok, "food was handed over by nobody, terminally").toBe(false);
    if (!result.ok) expect(result.reason).toBe("no_session");
    expect(edgesInLedger(store)).toHaveLength(before);
  });

  it("the refusal is not a crash — the kitchen keeps its queue and the act works once signed in", async () => {
    // `01-F17`, and the positive control for both rows above: they are also satisfied by an
    // emitter that throws, or by one that refuses everything forever. Neither is acceptable on
    // this surface, and the second is indistinguishable from the first in a ledger.
    const store = freshStore();
    readyOrder(store);
    let who: string | null = null;
    const e = emittersOn(store, () => who);

    expect(e.serve.handOver(ORDER).ok).toBe(false);
    // The queue is untouched by the refusal — `03-F53`: the queue is never gated.
    expect(store.openOrders().some((o) => o.order_id === ORDER)).toBe(true);

    who = SAJID;
    expect(e.serve.handOver(ORDER)).toEqual({ ok: true, lines: 2 });
  });
});

describe("§E 03-F16 / 02-F41 — the envelope names the person who pressed the control", () => {
  it("every event of a multi-edge bump carries the signed-in user", async () => {
    // A line at `confirmed` takes TWO events (`ready-mark.ts`'s walk), and both are the same act
    // by the same person. MUTANT: an implementation that attributes only the first — or only the
    // last — leaves half a bump belonging to nobody, permanently (`01-F1`).
    const store = freshStore();
    cookingOrder(store);
    const e = emittersOn(store, () => SAJID);

    const result = e.ready.mark(ORDER, null);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.events).toBeGreaterThan(1);

    expect(e.appended.length).toBe(result.ok ? result.events : 0);
    for (const call of e.appended) expect(call.actor).toBe(SAJID);
    for (const envelope of edgesInLedger(store)) {
      // The seed edges were written by "the counter" with a null actor; only the ones this act
      // produced are asserted, and there is at least one or the loop is vacuous.
      if (envelope.device_created_at === 1_000 && envelope.actor_user_id === null) continue;
      expect(envelope.actor_user_id, "an edge reached the ledger unattributed").toBe(SAJID);
    }
    expect(
      edgesInLedger(store).filter((e2) => e2.actor_user_id === SAJID).length,
      "no attributed edge reached the ledger at all",
    ).toBeGreaterThan(1);
  });

  it("the handover names the person too, in the ledger", async () => {
    const store = freshStore();
    readyOrder(store);
    const e = emittersOn(store, () => IMRAN);

    expect(e.serve.handOver(ORDER)).toEqual({ ok: true, lines: 2 });
    const attributed = edgesInLedger(store).filter((x) => x.actor_user_id !== null);
    expect(attributed).toHaveLength(1);
    expect(attributed[0]?.actor_user_id).toBe(IMRAN);
    // `01-F35`'s terminal edge really landed — otherwise the row above is satisfied by an
    // attributed event that changed nothing.
    const cells = JSON.parse(
      store.openOrders().find((o) => o.order_id === ORDER)?.json_lines ?? "{}",
    ) as Record<string, { states: string[] }>;
    expect(Object.values(cells).every((c) => c.states.includes("served"))).toBe(true);
  });

  it("02-F41 — the actor is read AT THE ACT, never captured at construction", async () => {
    // The defect this getter replaced one app over: "closing over its VALUE would freeze
    // attribution at boot". On a pass that is a shift change — Sajid signs out, Imran signs in,
    // and every ticket Imran hands over goes into the ledger under Sajid's name, permanently.
    //
    // MUTANT: `const actor = deps.actor()` hoisted into `createReadyMark`'s body. Caught here,
    // and by nothing else in this file: every other row uses one identity for the whole test.
    const store = freshStore();
    cookingOrder(store);
    let who: string | null = SAJID;
    const e = emittersOn(store, () => who);

    expect(e.ready.mark(ORDER, ["L0"]).ok).toBe(true);
    who = IMRAN;
    // A second act on the same emitter, after the session moved.
    readyOrderSecond(store);
    expect(e.ready.mark(SECOND_ORDER, null).ok).toBe(true);

    const actors = e.appended.map((c) => c.actor);
    expect(actors.includes(SAJID), "the first act lost its actor").toBe(true);
    expect(
      actors.includes(IMRAN),
      "the emitter froze the actor at construction — every later act is attributed to whoever " +
        "signed in first, permanently (01-F1)",
    ).toBe(true);
  });

  it("a refused act charges nothing to the person who is signed in", async () => {
    // `01-F1` again, from the other side: an edge for an order this device does not hold, or for
    // a delivery ticket `03-F52` will not serve, must leave NO record naming the cook who pressed.
    const store = freshStore();
    readyOrder(store);
    const e = emittersOn(store, () => SAJID);

    expect(e.serve.handOver("0199ffff-0000-7000-8000-000000000000").ok).toBe(false);
    expect(e.appended).toEqual([]);
    expect(edgesInLedger(store).every((x) => x.actor_user_id === null)).toBe(true);
  });
});

// A second order, so `§E`'s shift-change row can act twice without re-marking a done line.
const SECOND_ORDER = "0199cccc-0000-7000-8000-00000000bcde";
function readyOrderSecond(store: DeviceStore): void {
  seedEvent(store, "order.created", {
    order_id: SECOND_ORDER,
    channel: "counter",
    order_type: "dine_in",
  });
  seedEvent(store, "order.line_added", {
    order_id: SECOND_ORDER,
    line_id: "M0",
    item_id: "item-karahi",
    qty: 1,
    unit_price_paisa: 45_000,
  });
  seedEvent(store, "order.confirmed", { order_id: SECOND_ORDER });
  seedEvent(store, "order.line_state_changed", {
    order_id: SECOND_ORDER,
    line_ids: ["M0"],
    state: "confirmed",
    line_context: { M0: { to: "confirmed", from_states: ["placed"], preds: [] } },
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE NEGATIVE CONTROL.
//
// The round-3 law: "use a CONTROL (an implementation differing in exactly one branch) or your
// kill count proves nothing about attribution". These rows assert what `03-F53` must NOT change,
// so a mutation run that reddens them has broken something other than the thing it aimed at.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F the negative control — what identity must NOT change", () => {
  it("03-F53 — the QUEUE is readable with nobody signed in", async () => {
    // The ruling's second clause, asserted on the trusted side: the projection this screen draws
    // from takes no session and must never learn to. A `passQueue(session)` would be `01-F17`'s
    // stopped till arriving as a signature change.
    const store = freshStore();
    readyOrder(store);
    const e = emittersOn(store, () => null);
    expect(e.ready.mark(ORDER, null).ok).toBe(false);
    expect(store.openOrders().some((o) => o.order_id === ORDER)).toBe(true);
  });

  it("03-F24 / 03-F52 — the layer-2 assignment still refuses a surface that does not own the act", () => {
    // Identity is not authorization (`03-F53`: "signing in at the pass grants no authority"), so a
    // signed-in cook on a screen the assignment does not name is STILL read-only. If landing the
    // session weakened this, the ownership gate has quietly become decorative.
    const store = freshStore();
    readyOrder(store);
    const appended: unknown[] = [];
    const serve = createServeMark({
      store,
      policy: () => resolveServeSignal({ roster: null, configured: "counter" }),
      actor: () => SAJID,
      append: (type, payload) => appended.push({ type, payload }),
    });
    const result = serve.handOver(ORDER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_the_owner");
    expect(appended).toEqual([]);
  });

  it("03-F52 — a delivery ticket is still not handed over, signed in or not", () => {
    // The allowlist survives. MUTANT: a session check inserted BEFORE the order-type filter that
    // returns `ok` for anything once somebody is signed in.
    const store = freshStore();
    seedEvent(store, "order.created", {
      order_id: ORDER,
      channel: "counter",
      order_type: "delivery",
    });
    seedEvent(store, "order.line_added", {
      order_id: ORDER,
      line_id: "L0",
      item_id: "item-karahi",
      qty: 1,
      unit_price_paisa: 45_000,
    });
    seedEvent(store, "order.confirmed", { order_id: ORDER });
    for (const [from, to] of [
      ["placed", "confirmed"],
      ["confirmed", "in_prep"],
      ["in_prep", "ready"],
    ] as const) {
      seedEvent(store, "order.line_state_changed", {
        order_id: ORDER,
        line_ids: ["L0"],
        state: to,
        line_context: { L0: { to, from_states: [from], preds: [] } },
      });
    }
    const e = emittersOn(store, () => SAJID);
    expect(e.serve.handOver(ORDER).ok).toBe(false);
    expect(e.appended).toEqual([]);
  });
});
