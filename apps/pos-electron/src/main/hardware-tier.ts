/**
 * # `02-F31` / `00 §7` layer 2 — the hardware tier, and why it is a CONFIGURED value here
 *
 * `restaurant-os.md:47` (Part I, top of the authority order) defines the ladder: **T1 Counter**
 * (terminal + printers) · **T2 Counter+Pass** (adds a pass screen with ready-marking) · **T3 Full
 * mesh** (waiter handhelds, station routing/KDS, manager console). `02-pos-app.md:14` states the
 * consequence this module exists for — *"in **T1 the POS is the entire restaurant**"* — and
 * `02-F31` gives the detection rule verbatim:
 *
 * > detection: the branch device registry contains no pass/KDS/waiter device
 *
 * ## The precedent this follows, and where it stops following it
 *
 * `panel-density.ts` is the house pattern for a `00 §7` key, and `00 §7` argues it in one line:
 * *"a number a technician types is a number a technician mistypes, and the failure is silent"*.
 * So the chain is **measurement → correction → an honest admission**, and `resolveHardwareTier`
 * below is that chain, in that order, with the source carried out of the function so `00 §5.7`
 * can be satisfied at the boot line instead of left to be discovered.
 *
 * **The difference is that the measurement is not available, and this is checked rather than
 * assumed.** `02-F31`'s detection rule reads the *branch device registry*. That registry exists —
 * `kernel.device_registry` in the gateway's Postgres, written by `registerDevice` and read by
 * `handleHello` — and **no part of it reaches a device**:
 *
 *  - `01-F62` (ruling on `DEC-SYNC-012`) makes `device.registered` / `device.revoked` **org-scoped**:
 *    *"it never enters a branch stream and no device folds it."* So the roster cannot arrive as
 *    ledger events, by a decision that was taken deliberately and for good reasons.
 *  - `hello_ack` carries `session_id`, `hub`, `resume_from`, `relay_authorized`, `renewed_token`,
 *    `compression` and `catalog_version` — and no roster. Every one of those fields was added
 *    under a recorded decision (`DEC-SYNC-009`, `DEC-SYNC-010`, `DEC-AUTH-001`, `01-F9` via T-C1);
 *    adding an eighth with no such record is the wire-protocol version of inventing policy
 *    (commandment 2), on a protected path (commandment 10).
 *  - `packages/sync-client`'s device store has no device table at all — `events`, `sync_state`,
 *    `peer_events`, `global_seq_map`, `audit_chain`, `branch_time`, `device_credential`, `orders`,
 *    `queue`, `parked`, `availability`, `catalog`, `pin_attempts`, `staff`. There is nowhere for a
 *    roster to have been persisted for an offline boot, which commandment 4 would require.
 *  - The LAN mesh would carry `PeerInfo { device_id, device_class }`, which looks like the answer
 *    and **is not**, twice over: `mesh-session.ts` carries a seams-register marker saying no host
 *    runs the LAN mesh yet, and — the part that would still be wrong if it ran — peers are
 *    **liveness**, and `02-F31` says **registry**. A pass screen that is switched off is still a
 *    registered pass screen, and a T2 branch whose pass tablet is charging must not silently start
 *    auto-advancing the lines a human owns (`03-F24`).
 *
 *    (Written out in words rather than quoted: `pnpm seams:check` scans for the marker token
 *     itself, so pasting one into a comment attributes it to this file's exports and the rail's
 *     own anti-rot rule — "a marker on something REACHED fails" — reddens. Measured, not guessed:
 *     the first draft of this header did exactly that and took four exports down with it.)
 *
 * So the roster input is real, typed, and tested — `tierFromRoster` is `02-F31`'s rule and it is
 * ready for the day the roster is reachable — and today the only host passes `null` for it. That
 * is stated at the boot line rather than hidden behind a default, because a wrong tier looks
 * exactly like a right one from the screen.
 *
 * ## Why a key at all, when the task's instinct is to distrust one
 *
 * `00 §7` **already declares this key**: layer 2 (organization / back office) lists *"operating
 * profile, **hardware tier (T1/T2/T3)**, channels enabled, …"*, and `00 §7`'s closing paragraph
 * says *"restaurants pick a profile + tier"*. So the tier is not a config key invented to stand in
 * for derivable state — it is a config key the corpus specifies, whose value `02-F31` says can
 * *also* be derived. Both statements are in the corpus and this module holds both.
 *
 * It is read from the ENVIRONMENT because layer 2 has no transport to a device: `config.changed`
 * is org-scoped under `01-F62` and no device folds it either, so every layer-2 value in this app
 * is currently either pinned in code (`PAID_OUT_APPROVAL_THRESHOLD_PAISA`, `authorize.ts`) or read
 * from the environment (`panel_ppi`, layer 3). This takes the second shape because unlike a
 * threshold it has an operator-visible consequence the operator may need to change on the day.
 */

import type { DeviceClass } from "@restos/domain";

/** `restaurant-os.md:47` and `00 §7` layer 2's own vocabulary — the key's domain, exactly. */
export const HARDWARE_TIERS = ["T1", "T2", "T3"] as const;
export type HardwareTier = (typeof HARDWARE_TIERS)[number];

export type HardwareTierSource =
  /** `02-F31`'s detection rule ran against a real branch device registry. */
  | "derived"
  /** `00 §7` layer 2's key was set. A correction, and the only path a human value takes. */
  | "configured"
  /** Neither answered. The boot line says so at length; see `describeHardwareTier`. */
  | "assumed";

export type ResolvedHardwareTier = {
  readonly tier: HardwareTier;
  readonly source: HardwareTierSource;
};

/**
 * `01-F39`'s classes, split the way `02-F31` splits them: *"no **pass/KDS/waiter** device"*.
 *
 * `kitchen` is `01-F39`'s own name for *"pass screen / KDS station, doc 03"*, so it is both of
 * `02-F31`'s first two nouns; `waiter` is the third. `manager` and `rider` are deliberately
 * absent — `restaurant-os.md:47` lists a manager console among T3's characteristics, but
 * `02-F31`'s detection rule names three device kinds and a manager phone is not one of them, and
 * a manager's phone signals no order state. Where the two sentences differ, `02-F31` is the
 * normative detection rule (`00` authority order (3): the owning module spec for its behaviour).
 */
const PASS_OR_KDS: DeviceClass = "kitchen";
const WAITER: DeviceClass = "waiter";

/**
 * `02-F31`'s detection rule, and `restaurant-os.md:47`'s ladder above it, as a pure function of
 * the branch device registry's classes.
 *
 * The T1 boundary is `02-F31`'s, stated as a negation and implemented as one. The T2/T3 boundary
 * is `restaurant-os.md:47`'s — *"T3 Full mesh (**waiter handhelds**, station routing/KDS, manager
 * console)"* — and is the one thing here nothing yet consumes: `autoAdvancesLines` asks only
 * whether the tier is T1. It is included because the key's declared domain in `00 §7` is
 * `T1/T2/T3` and a resolver that could not produce a value the key admits would be answering a
 * narrower question than the one it is named for.
 */
export const tierFromRoster = (roster: readonly DeviceClass[]): HardwareTier => {
  if (roster.includes(WAITER)) return "T3";
  if (roster.includes(PASS_OR_KDS)) return "T2";
  return "T1";
};

/**
 * **T1, and the assumption is the interesting part.**
 *
 * Assuming T1 turns `02-F31`'s auto-advance ON. Assuming anything else leaves every line of every
 * order at `confirmed` forever, which is the defect this work exists to close, so there is no
 * neutral default and the choice has to be argued rather than defaulted.
 *
 * It is T1 because T1 is what is *true* of every deployment that can exist right now, which is the
 * same kind of claim `REFERENCE_COUNTER_DIAGONAL_IN` makes one file over.
 *
 * ⚠ **THE EVIDENCE THIS PARAGRAPH RESTED ON HAS MOVED, AND ONLY HALF OF IT IS THIS SESSION'S TO
 * CORRECT.** It read *"`apps/pass-kds` is a one-file stub, `apps/waiter` does not exist"*. The
 * waiter half is wrong: `04-F21`'s order pad ships. It does not change the conclusion — `04-F23`
 * closes the pad's event set at four order events, `order.line_state_changed` is not among them,
 * so a tablet still cannot move a line and the harm the other default guards against (auto-advance
 * racing the human who owns the signal) is still unreachable from a waiter surface. **The
 * `apps/pass-kds` half is ALSO stale — that app runs — and it is REPORTED rather than corrected
 * here**, because whether a running pass screen changes this default is `02-F31`'s question and
 * not a drive-by in a waiter fix (`24 §3b`). `03-F24`'s ready-signal-ownership assignment still has
 * no representation in the device registry, which is the leg the default actually stands on.
 *
 * When one of them changes this is the line that must change with it, which is why the boot line
 * names the correction out loud instead of logging a tier and moving on.
 */
const ASSUMED_TIER: HardwareTier = "T1";

/** A `00 §7` value that is not one of the three is not a tier. Refused, never coerced. */
const parseTier = (raw: string | undefined): HardwareTier | null =>
  (HARDWARE_TIERS as readonly string[]).includes(raw ?? "") ? (raw as HardwareTier) : null;

/**
 * The whole chain, as one pure function so it is testable without a gateway and without a display.
 *
 * The order is `panel-density.ts`'s, inverted in exactly one place and for a stated reason. There,
 * the configured value comes FIRST because `00 §7` calls `panel_ppi` a *correction* to a
 * measurement that is normally present. Here the derivation comes first when it is present at all,
 * because `02-F31` states the detection rule as the definition rather than as a fallback — a
 * registry that says a pass screen is registered is a fact about the restaurant, and a stale
 * environment variable on one till is not.
 *
 * @param roster the branch device registry's classes, or `null` where this device cannot reach it
 *   — which is every host today. See this module's header for why, and for what it would take.
 */
export const resolveHardwareTier = (input: {
  roster: readonly DeviceClass[] | null;
  /** `00 §7` layer 2 — `hardware tier`. Raw, as it arrives; parsed and refused here. */
  configured: string | undefined;
}): ResolvedHardwareTier => {
  if (input.roster !== null) return { tier: tierFromRoster(input.roster), source: "derived" };
  const configured = parseTier(input.configured);
  if (configured !== null) return { tier: configured, source: "configured" };
  return { tier: ASSUMED_TIER, source: "assumed" };
};

/**
 * `02-F31` — whether this device may advance line states nothing else will.
 *
 * A predicate rather than a comparison at the call site, because the FR's reason is *"where no
 * device exists to signal them"* and the tier is the proxy for that reason, not the reason itself.
 * The proxy is **branch-wide and `03-F22` is per-station** — *"KDS may run alongside printers or
 * replace them per station — layer-2 choice"* — so a T2 branch with one printer-only station has
 * lines nothing will signal and this predicate answers `false` for them. That refinement is owed
 * and is deliberately not guessed here. It had TWO blockers and **one has cleared (August 2026):**
 * `03-F22`'s layer-2 choice now exists in code as `main/station-routing.ts` (`03-F51`). The other
 * still binds and is sufficient on its own — `kot.printed` carries no station (its payload is
 * `{ order_id }`), so this predicate could not tell which of a fanned-out order's tickets printed
 * even with the routes in hand, and `packages/domain`'s registry is a protected path.
 *
 * Note the direction of the remaining gap, because it is the opposite of what a reader expects:
 * `03-F51` makes a screen-only station emit no `kot.printed` at all, so its lines are never
 * auto-advanced by this predicate under any tier — which is correct, since a screen's bump
 * (`03-F19`) is the right owner. The unresolved case is a printer-only station at a T2/T3 branch.
 */
export const autoAdvancesLines = (tier: HardwareTier): boolean => tier === "T1";

/**
 * What the boot line says. `00 §5.7` — the device reports what is true, and `assumed` is a
 * different fact from `derived` on a value whose being wrong is invisible from the screen.
 */
export const describeHardwareTier = (resolved: ResolvedHardwareTier): string =>
  `tier: ${resolved.tier} (${resolved.source})` +
  (resolved.source === "assumed"
    ? ` — 02-F31's detection rule needs the branch device registry, which no device can read` +
      ` (01-F62 keeps device.registered/revoked out of every branch stream), so ${ASSUMED_TIER}` +
      ` is ASSUMED and this till auto-advances line states on 02-F31's rules. If this branch has` +
      ` a pass screen, a KDS or a waiter handheld, set RESTOS_HARDWARE_TIER=T2 (or T3) — the` +
      ` device that owns the ready signal (03-F24) must not be raced.`
    : "") +
  (resolved.source === "configured"
    ? ` — from 00 §7 layer 2's hardware-tier key (RESTOS_HARDWARE_TIER)`
    : "");

/**
 * Read `00 §7` layer 2's key off the process environment.
 *
 * Named here rather than spelled at the call site for `panel-density.ts`'s reason: the variable
 * name appears in a boot line the operator is asked to act on, and a name that disagreed with
 * itself across two files would send them to set the wrong one.
 */
export const HARDWARE_TIER_ENV = "RESTOS_HARDWARE_TIER";
