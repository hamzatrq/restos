/**
 * # `03-F24` — WHO MARKS `ready`, and why that is not a permission-matrix question
 *
 * > 03-F24 Who marks `ready` is a role assignment at layer 2 (00 §7): chef (KDS bump), pass
 * > person (pass screen), counter (POS, 02-F33), or waiter-on-pickup (doc 04). **The emitted
 * > event is identical regardless of owner; every surface capable of ready-marking respects the
 * > assignment (others render read-only).**
 *
 * Two sentences, and each decides something different:
 *
 *  - **"The emitted event is identical regardless of owner."** So there is no owner field, no
 *    `source: "pass"`, no second event type. `ready-mark.ts` emits exactly the
 *    `order.line_state_changed` shape `registry.ts` declares and `merge.ts` folds, byte-for-byte
 *    what `apps/pos-electron`'s `02-F31` producer emits. An owner-tagged variant would make the
 *    fold's answer depend on which surface pressed the button, which is a projected value reading
 *    something other than the edge (`01-F34`).
 *  - **"Others render read-only."** So the assignment is a REFUSAL and not a preference, and this
 *    module is where it is enforced. `02-F33` says the same thing from the counter's side —
 *    *"otherwise the panel is read-only for states"* — and `apps/pos-electron` already ships that
 *    fallback, which is why the counter cannot race this screen today.
 *
 * ## ⚠ COMMANDMENT 8, AND WHY THERE IS NO `PermissionAction` HERE
 *
 * `apps/pos-electron/src/main/line-advance.ts` predicted this exact moment: *"The two human acts
 * that DO produce this event type (`03-F16` ready-marking, `03-F19` a station bump) are not built
 * and will need their own matrix row when they are."* Measured 2026-08-10: `PERMISSION_ACTIONS`
 * has **22 members and none of them is a line-state act**, and `authorize.ts`'s `WRITE_ACTIONS`
 * has no `order.line_state_changed` row and fails closed — so routing a ready-mark through
 * `authorizeWrites` today **denies it**.
 *
 * **This module does not invent one, and that is commandment 2 rather than laziness.** Adding a
 * `PermissionAction` is a change to `packages/domain`, which is SACRED (`18 §2`) and protected
 * (commandment 10): it needs a spec PR that decides five role cells, a `14-F30`-shaped argument
 * for where the FR lives, and senior review. What it does NOT need is a session inventing the
 * cells while building a screen.
 *
 * **And the corpus already answers the question this screen actually asks.** `03-F24` does not
 * say *"a permission"* — it says *"a role assignment at layer 2"*, and `03 §7` lists
 * *"ready-signal ownership"* under Layer 2 (org) beside the aging thresholds. So the spec's own
 * authorization mechanism for this act is the assignment below, enforced in MAIN, with the
 * renderer's claim never trusted — which is commandment 8's actual property (*"server-side
 * authorization always … client role claims are never trusted"*) discharged through the control
 * the owning FR names.
 *
 * **What is genuinely owed and is named rather than left to look intentional:** the matrix
 * cannot presently express *"this person may not mark ready"*. The assignment is per-DEVICE-role,
 * not per-user — a pass screen where the assignment is `pass` will accept a bump from **any**
 * member of the branch roster who signs in.
 *
 * **That is now a deliberate reading rather than a gap** (`03-F53`, August 2026): *"Signing in at
 * the pass grants no authority; it supplies attribution … `packages/domain`'s action set carries
 * no line-state member, so routing a bump through `can()` would deny every bump at every branch.
 * Any member of the branch roster may therefore identify at the pass, and the session is read for
 * `actor_user_id` and for nothing else."* So `03-F16`'s *"with actor"* is **MET** — the envelope
 * carries the device, the branch, the branch-consensus time **and** the person — while a per-user
 * permission on this act remains a spec question nobody has asked, not a hole in this file.
 */

/**
 * `03-F24`'s four owners, transcribed. There is deliberately no fifth value and no `any`: the FR
 * enumerates the surfaces, and a value outside the set is a configuration the product does not
 * offer rather than one it silently widens to.
 */
export const READY_SIGNAL_OWNERS = ["pass", "kds", "counter", "waiter"] as const;
export type ReadySignalOwner = (typeof READY_SIGNAL_OWNERS)[number];

/**
 * The owner a branch that has configured nothing gets.
 *
 * **`pass`, and the choice is argued rather than defaulted**, because there is no neutral value:
 * every option here either lets this screen mark ready or renders it read-only, and one of those
 * is a pass screen that cannot do the thing a pass screen is for.
 *
 * It is `pass` because that is what is TRUE of every branch that can be running this app: this
 * binary is the pass surface, and a restaurant that has stood it up at the pass has by that act
 * said where the ready signal lives. The two alternatives both fail on their own terms — `counter`
 * would make a freshly-installed pass screen inert with every gate green (this wave's named
 * defect, manufactured deliberately), and refusing to run without an explicit assignment would be
 * a device that will not turn on, which `DEC-HW-001` refuses one layer up.
 *
 * The cost is real and bounded: a branch that runs this screen for *visibility only* while the
 * counter owns the signal (`02-F33`) must set the key. The boot line says so at length.
 */
export const DEFAULT_READY_SIGNAL_OWNER: ReadySignalOwner = "pass";

/** `00 §7` layer 2 — ready-signal ownership, as this host reads it. */
export const READY_SIGNAL_OWNER_ENV = "RESTOS_READY_SIGNAL_OWNER";

/**
 * The surface this binary IS. Fixed, not configured: a device does not get to claim it is the
 * counter. `03-F18`'s per-station KDS mode is the one thing that would ever change it, and that
 * mode is not built (see `pass-queue.ts`).
 */
export const THIS_SURFACE: ReadySignalOwner = "pass";

export type ReadySignalSource = "configured" | "refused" | "default";

export type ReadySignalPolicy = {
  readonly owner: ReadySignalOwner;
  /** `03-F24` — may THIS surface mark ready, or does it render read-only? */
  readonly maySignal: boolean;
  readonly source: ReadySignalSource;
  /** The value that was refused, verbatim, so the boot line can name it. */
  readonly refused: string | null;
};

const isOwner = (raw: string): raw is ReadySignalOwner =>
  (READY_SIGNAL_OWNERS as readonly string[]).includes(raw);

/**
 * The whole chain as one pure function.
 *
 * **A refused value falls back and never throws** — `station-routing.ts`'s ruling and `01-F17`'s
 * spirit: a typo in a layer-2 key must not take the kitchen's screen off the wall mid-service.
 * But note the direction of the fallback here is the *permissive* one, which is the opposite of
 * `station-routing.ts`'s, and the asymmetry is deliberate. There, falling back to `paper` meant
 * falling back to the route whose failures are LOUD. Here, falling back to read-only would mean a
 * kitchen that cannot bump a ticket because someone mistyped a word — and a bump that does not
 * happen is a ticket that never leaves the queue, which is silent. The loud failure and the
 * permissive fallback are the same choice made twice.
 */
export const resolveReadySignal = (configured: string | undefined): ReadySignalPolicy => {
  const raw = (configured ?? "").trim();
  const owner =
    raw === "" ? DEFAULT_READY_SIGNAL_OWNER : isOwner(raw) ? raw : DEFAULT_READY_SIGNAL_OWNER;
  const source: ReadySignalSource =
    raw === "" ? "default" : isOwner(raw) ? "configured" : "refused";
  return {
    owner,
    maySignal: owner === THIS_SURFACE,
    source,
    refused: source === "refused" ? raw : null,
  };
};

/** What the boot line says. `00 §5.7`. */
export const describeReadySignal = (policy: ReadySignalPolicy): string => {
  const head = `ready signal: ${policy.owner} (03-F24, ${READY_SIGNAL_OWNER_ENV})`;
  if (policy.source === "refused") {
    return (
      `${head} — REFUSED "${policy.refused}": the owner must be one of` +
      ` ${READY_SIGNAL_OWNERS.join(" | ")}. ${DEFAULT_READY_SIGNAL_OWNER} is in force.`
    );
  }
  if (!policy.maySignal) {
    return (
      `${head} — this pass screen is READ-ONLY for line states. The queue, the ages and the` +
      ` assembly counts are all live; the bump control is not drawn, because 03-F24 assigns the` +
      ` ready signal to "${policy.owner}" and every surface capable of ready-marking respects` +
      ` the assignment. Set ${READY_SIGNAL_OWNER_ENV}=${THIS_SURFACE} to move it here.`
    );
  }
  return (
    `${head} — this pass screen owns the ready signal and its bump control is live` +
    (policy.source === "default"
      ? `. NOT CONFIGURED: this is the shipped default. If the counter owns the signal at this` +
        ` branch (02-F33), set ${READY_SIGNAL_OWNER_ENV}=counter or two surfaces can both mark` +
        ` the same line ready.`
      : "")
  );
};
