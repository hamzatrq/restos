/**
 * # `03-F52` — WHO MARKS `served`, and why the declaration lives HERE rather than in an app
 *
 * > 03-F52 **Who marks `served` is a role assignment at layer 2 — the second row of the key
 * > `00 §7` already declares — and the act is an explicit HANDOVER, never a widening of the
 * > ready-mark and never a widening of settlement.**
 *
 * `03-F24` filled in the `ready` row and left the `served` row blank, so a branch with a pass
 * screen had **no producer for `served` at all**: `02-F31`'s settlement half was tier-gated to T1,
 * `04-F14`'s waiter is a T3 device that does not exist, and a fully-bumped ticket therefore never
 * satisfied `03-F17`'s exit condition. This module is the row.
 *
 * ## ⚠ IT IS NOT `apps/pass-kds/src/main/serve-signal.ts`, AND THAT DEPARTS FROM ITS SIBLING
 *
 * `ready-signal.ts` — the module this one is otherwise modelled on line for line — lives in the
 * pass app, because `03-F24`'s assignment has exactly one consumer. `03-F52`'s does not: its
 * *"the tier stops being an input"* clause makes `apps/pos-electron` read the **same value**
 * (*"the till emits on settlement because the branch's serve-signal owner is `settlement`"*).
 *
 * Two rules then decide the location between them and neither is a preference:
 *
 *  - `18 §2` states the dependency direction as a MUST — *"Apps NEVER import … other apps"* — so
 *    the second consumer cannot reach across for it.
 *  - `DEC-ARCH-001` rules EXTRACT at the moment a module acquires its second consumer, and this
 *    package exists because that exact edge was drawn wrong once already **between these exact two
 *    apps** (`aging.ts` reached from the pass into the counter and made the pair a cycle).
 *
 * And the FR names the failure the copy would produce, with a price attached: *"**One declaration,
 * no per-app fallback.** … Two surfaces each carrying their own default is how a pass screen and a
 * till come to disagree about who owns handover with every gate green — the failure `01-F60`'s
 * enabled-set drift already cost this product once."*
 *
 * ## Layer 2, read from the environment — `aging.ts`'s precedent and its reason
 *
 * `03 §7` lists *"**serve-signal ownership** (`03-F52`)"* under **Layer 2 (org)**, and layer 2 has
 * no transport to a device: `config.changed` is org-scoped under `01-F62` and no device folds it.
 * So every layer-2 value in this repo is either pinned in code or read from the environment, and
 * this takes the second shape for the reason `aging.ts` gives — it is a value an operator may need
 * to change on the day, and it must be settable on each of the two hosts that read it.
 *
 * **The env variable is not the declaration.** Each host reads its own process environment because
 * that is the only transport layer 2 has today; what is declared once, here, is the *owner set*,
 * the *derivation*, the *refusal* and the *words*. The day `config.changed` reaches a device, one
 * call site changes and both surfaces move together.
 */

import type { DeviceClass } from "@restos/domain";

/**
 * `03-F52`'s four owners, transcribed.
 *
 * > **The owners:** `settlement` (no device signals handover — `02-F31`'s auto-advance, unchanged
 * > in behaviour), `pass` (the pass screen's handover control), `counter` (the POS queue panel,
 * > `02-F33`'s surface), `waiter` (the handheld, `04-F14`). **`kds` is deliberately NOT an
 * > owner**: a station cook hands food to a pass, never to a customer, and a bump is `03-F19`'s
 * > act.
 *
 * ⚠ **The set is NOT `READY_SIGNAL_OWNERS` and must never be aliased to it.** They differ by two
 * members in both directions — `kds` is an owner there and forbidden here, `settlement` is an
 * owner here and meaningless there — and the dangerous implementation is the one that reuses the
 * other list, type-checks, resolves, and quietly lets a station cook's bump surface own the claim
 * that food reached a customer.
 */
export const SERVE_SIGNAL_OWNERS = ["settlement", "pass", "counter", "waiter"] as const;
export type ServeSignalOwner = (typeof SERVE_SIGNAL_OWNERS)[number];

/** `00 §7` layer 2 — serve-signal ownership, as a device host reads it. */
export const SERVE_SIGNAL_OWNER_ENV = "RESTOS_SERVE_SIGNAL_OWNER";

export type ServeSignalSource =
  /** `02-F31`'s detection rule ran against a real branch device registry. */
  | "derived"
  /** `00 §7` layer 2's key was set and accepted. A correction, and the only path a human takes. */
  | "configured"
  /** Neither answered. `00 §5.7` — the boot line says so rather than presenting it as an answer. */
  | "assumed"
  /** The key was set to something that is not an owner. Named, never coerced. */
  | "refused";

export type ServeSignalPolicy = {
  readonly owner: ServeSignalOwner;
  readonly source: ServeSignalSource;
  /** The value that was refused, verbatim, so the boot line can name it. */
  readonly refused: string | null;
};

/**
 * **`settlement`, and the choice is argued rather than defaulted**, because there is no neutral
 * value: this is ONE declaration read by two hosts, so whatever it answers decides both the till's
 * behaviour and the pass screen's at a branch that has configured nothing.
 *
 * It is `settlement` because that is what is TRUE of every deployment that exists right now, and
 * because the harm is asymmetric in a way the FR itself measures:
 *
 *  - Assuming `settlement` leaves `02-F31` **byte-identical to what ships today** — the counter
 *    already assumes `T1` (`hardware-tier.ts`'s `ASSUMED_TIER`, same argument, same reason) and
 *    already auto-advances at settlement. The cost is a freshly-installed pass screen whose
 *    handover control is not drawn until the key is set, and the boot line says exactly that.
 *  - Assuming `pass` would **stop every existing till auto-serving** the moment this shipped. At a
 *    branch with no pass screen there is then no producer for `served` at all, which is the defect
 *    this FR exists to close, manufactured in the other direction and on every branch at once.
 *
 * The alternative is stated because it is genuinely arguable: `ready-signal.ts` defaults to `pass`
 * on the grounds that *"this binary IS the pass surface"*. That argument does not carry here,
 * because this value is not read only by the pass binary.
 */
const ASSUMED_OWNER: ServeSignalOwner = "settlement";

/** `01-F39`'s own name for *"pass screen / KDS station, doc 03"* — `02-F31`'s first two nouns. */
const PASS_OR_KDS: DeviceClass = "kitchen";

/**
 * `02-F31`'s detection rule, as `03-F52` sends us to it: *"the default is derived from `02-F31`'s
 * own detection rule over the branch device roster (the capability set, `DEC-HW-003` (b))"*.
 *
 * > 02-F31 detection: the branch device registry contains **no pass/KDS/waiter device**
 *
 * A branch with no such device has nothing that can signal a handover, so `settlement` is the only
 * producer there can be; a branch with a `kitchen` device has the surface this FR assigns the act
 * to.
 *
 * ## ⚠ A `waiter`-ONLY ROSTER DERIVES `settlement`, AND THAT IS A PINNED READING
 *
 * `02-F31`'s rule names three device kinds and this maps two of them. The third is deliberate:
 * `04-F14`'s handheld is unbuilt (`apps/waiter` does not exist — `03-F52`'s own OWED item 3 says
 * so), so deriving `waiter` would hand the act to a surface that cannot perform it and leave that
 * branch with **no producer at all** — the exact defect this FR closes. `DEC-HW-003` (b) reads the
 * roster as a **capability set**, and a device class whose app does not ship supplies no
 * capability.
 *
 * **The alternative is named**: derive `waiter` from a waiter device, faithful to `02-F31`'s
 * three-noun sentence. It is refused for the reason above and it is cheap to change — when
 * `apps/waiter` ships, this is the line that moves with it. An operator who wants it today may
 * configure `waiter` explicitly, which beats the derivation.
 *
 * **None of this path is reachable in production**: `roster` is `null` on every host (`01-F62`
 * keeps `device.registered` out of every branch stream — the whole argument is in
 * `hardware-tier.ts`), so this exists for the day the registry is readable and is exercised only
 * by its suite.
 */
const ownerFromRoster = (roster: readonly DeviceClass[]): ServeSignalOwner =>
  roster.includes(PASS_OR_KDS) ? "pass" : "settlement";

const isOwner = (raw: string): raw is ServeSignalOwner =>
  (SERVE_SIGNAL_OWNERS as readonly string[]).includes(raw);

/**
 * The whole chain as one pure function, so the policy is testable without Electron and without a
 * store.
 *
 * **A configured value BEATS the derivation**, which is the opposite of `hardware-tier.ts`'s order
 * and the difference is the FR's: `03-F52` calls this *"a role assignment at layer 2"* — a thing
 * an org decides — where `02-F31` states its detection rule as the definition of the tier. A key
 * the derivation could override would be a readout and not an assignment.
 *
 * **A refused value falls back and never throws** (`01-F17`, `station-routing.ts`'s ruling): a
 * typo in a layer-2 key must not take a kitchen screen off the wall or stop a till settling in the
 * middle of a service. It falls back to whatever the *unset* key would have answered — the
 * derivation where a roster exists, the assumption where it does not — so the refusal costs
 * exactly the correction and nothing else, and `describeServeSignal` names the offending value.
 *
 * @param roster the branch device registry's classes, or `null` where this device cannot reach it
 *   — which is every host today.
 */
export const resolveServeSignal = (input: {
  roster: readonly DeviceClass[] | null;
  /** `00 §7` layer 2's key. Raw, as it arrives; parsed and refused here. */
  configured: string | undefined;
}): ServeSignalPolicy => {
  const raw = (input.configured ?? "").trim();
  const unset: ServeSignalPolicy =
    input.roster !== null
      ? { owner: ownerFromRoster(input.roster), source: "derived", refused: null }
      : { owner: ASSUMED_OWNER, source: "assumed", refused: null };
  if (raw === "") return unset;
  if (isOwner(raw)) return { owner: raw, source: "configured", refused: null };
  return { owner: unset.owner, source: "refused", refused: raw };
};

/**
 * What the boot line says. `00 §5.7` — and this value has the property that decides what goes in
 * one: **being wrong about it is invisible from the screen.** A pass screen that does not own the
 * handover simply has no control where one might have been; a till that assumed it owns handover
 * serves every order at settlement and looks exactly like a till that was told to.
 *
 * `03-F52` asks for the `assumed` case by name — *"where the roster cannot be read the surface
 * REPORTS the assumption on its boot line rather than presenting it as configured"* — and for the
 * refusal — *"An assignment naming a surface this product does not ship is refused **when it is
 * configured**, with the offending value named, never discovered once per order at 20:40 on a
 * Friday"*.
 */
export const describeServeSignal = (policy: ServeSignalPolicy): string => {
  const head = `serve signal: ${policy.owner} (03-F52, ${SERVE_SIGNAL_OWNER_ENV})`;
  if (policy.source === "refused") {
    return (
      `${head} — REFUSED "${policy.refused}": the serve-signal owner must be one of` +
      ` ${SERVE_SIGNAL_OWNERS.join(" | ")}. Note kds is NOT one of them (03-F52: a station cook` +
      ` hands food to a pass, never to a customer). "${policy.owner}" is in force.`
    );
  }
  if (policy.source === "assumed") {
    return (
      `${head} — ASSUMED. 02-F31's detection rule needs the branch device registry, which no` +
      ` device can read (01-F62 keeps device.registered/revoked out of every branch stream), so` +
      ` "${policy.owner}" is a guess and not a configured answer. If this branch has a pass` +
      ` screen, set ${SERVE_SIGNAL_OWNER_ENV}=pass on BOTH the till and the pass — otherwise the` +
      ` till marks lines served at settlement and the pass screen draws no handover control.`
    );
  }
  if (policy.source === "derived") {
    return `${head} — DERIVED from 02-F31's detection rule over the branch device roster.`;
  }
  return `${head} — from 00 §7 layer 2's serve-signal-ownership key.`;
};
