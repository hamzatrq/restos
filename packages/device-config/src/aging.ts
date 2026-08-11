/**
 * # `03-F14` / `03-F47` — the aging thresholds, and the one thing they are NOT
 *
 * > 03-F14 Aging colors on each card: neutral → amber at X min → red at Y min.
 * >   - X/Y are org-configurable per order type (defaults: dine-in 10/20, delivery 15/25);
 * >   - **timer basis is `order.confirmed`, so a failed print never hides a late order.**
 *
 * The second clause is the load-bearing one and it is enforced one file over: `pass-queue.ts`
 * ages every ticket off `KitchenQueueRow.age_basis`, which `merge.ts` sets to the **confirm
 * anchor** and nothing else (*"= the confirm anchor; the kot fallback is deleted"*). A kitchen
 * whose printer died at 20:40 still watches its tickets go amber and then red, which is the
 * entire point of the clause: the failure the operator must see is the food, not the paper.
 *
 * `03-F47` then settles what the colour is driven BY, against `21 §5`'s superseded *"amber at
 * expected-prep"*: **fixed configured minutes.** Expected-prep only exists once `03-F27/F28`'s
 * confidence gate passes, `03 §3` forbids the kitchen showing ETAs at all, and *"a colour driven
 * by a model that may never become confident is a colour that lies about how late the food is."*
 * So there is no ETA input here and there is nowhere for one to enter.
 *
 * ## Layer 2, read from the environment — `station-routing.ts`'s precedent and its reason
 *
 * `03 §7` lists *"aging thresholds X/Y per order type"* under **Layer 2 (org)**, and layer 2 has
 * no transport to a device: `config.changed` is org-scoped under `01-F62` and no device folds it.
 * So every layer-2 value in this repo is either pinned in code or read from the environment, and
 * this takes the second shape for `station-routing.ts`'s stated reason — it is a value an
 * operator may need to change on the day, and a kitchen that runs 10/20 in a rush and 15/25 at
 * lunch is exactly the org policy the FR is describing.
 *
 * ## ⚠ TWO OF THE THREE ORDER TYPES HAVE NO STATED DEFAULT — PINNED, NOT INVENTED
 *
 * `02-F1` names three order types — **dine-in, takeaway, delivery** — and `01 §4`'s terminal rule
 * adds a fourth mode, **pickup**. `03-F14` and `03-F47` both give defaults for exactly two of
 * them: *dine-in 10/20, delivery 15/25*. Takeaway and pickup are unstated, and an implementation
 * has to answer for them on the first ticket.
 *
 * **Pinned: takeaway and pickup take dine-in's 10/20**, and the reading is stated so it can be
 * argued with rather than discovered. Delivery's looser 15/25 is the one that is *different*, and
 * the difference has an obvious cause — a delivery order's clock is still running after it leaves
 * the kitchen, so the kitchen's share of the promise is a smaller fraction of it. Takeaway and
 * pickup are handed over at the counter the moment they are ready, exactly like dine-in, so the
 * kitchen's whole budget is the customer's whole wait. **The simpler alternative** — refusing to
 * age an order type the FR does not name — is refused because it makes the commonest takeaway
 * ticket in a Pakistani restaurant permanently neutral, which is a colour that lies in the other
 * direction.
 *
 * An **unknown or absent** order type takes the same 10/20, for the opposite reason to
 * `line-advance.ts`'s allowlist: there the harm of acting was terminal and unrecoverable, so it
 * refused; here the harm of NOT acting is a late ticket that never changes colour, and the harm
 * of acting is a ticket that goes amber earlier than an org would have chosen. Aging is a
 * display, it writes nothing, and `01-F1` is not engaged.
 */

/** `03-F14`'s two numbers, in minutes. */
export type AgingThresholds = {
  /** X — amber at. */
  readonly amberAt: number;
  /** Y — red at. */
  readonly redAt: number;
};

/**
 * `03-F14` / `03-F47`'s stated defaults, transcribed. The two rows the FRs name are exact; the
 * other two are the pinned interpretation argued in this module's header.
 */
export const DEFAULT_AGING_THRESHOLDS: Readonly<Record<string, AgingThresholds>> = {
  dine_in: { amberAt: 10, redAt: 20 },
  delivery: { amberAt: 15, redAt: 25 },
  takeaway: { amberAt: 10, redAt: 20 },
  pickup: { amberAt: 10, redAt: 20 },
};

/** The row an order type with no entry of its own falls back to. See the header. */
export const FALLBACK_AGING: AgingThresholds = { amberAt: 10, redAt: 20 };

/** `00 §7` layer 2 — the aging thresholds, as this host reads them. */
export const AGING_THRESHOLDS_ENV = "RESTOS_AGING_THRESHOLDS";

export type ParsedAging = {
  /** Explicit `order_type → X/Y` entries, merged over the shipped defaults. */
  readonly thresholds: ReadonlyMap<string, AgingThresholds>;
  /** Entries this parser could not read, verbatim. A malformed entry is REFUSED, never guessed. */
  readonly malformed: readonly string[];
};

/**
 * `order_type=X/Y` pairs, comma-separated — e.g. `dine_in=8/16,delivery=15/25`.
 *
 * **Every unreadable entry is COLLECTED rather than skipped**, exactly as `parseStationRoutes`
 * does and for the same `00 §5.7` reason: a parser that dropped `dine_in=8//16` on the floor
 * would leave the dine-in row at its default for ever with nothing said, and *"I could not read
 * one of your three settings"* is the true thing.
 *
 * **`X < Y` is a legality, not a preference.** `03-F14`'s ladder is neutral → amber → red, and a
 * row where red comes first (or at the same minute) means the amber step never renders — the
 * `27-F15` lightness ladder collapses to two states and the operator loses the warning that
 * exists to be acted on before the ticket is late. It is refused rather than reordered, because
 * an org that typed `20/10` meant something and the product does not know which number it meant.
 */
export const parseAgingThresholds = (raw: string | undefined): ParsedAging => {
  const thresholds = new Map<string, AgingThresholds>(Object.entries(DEFAULT_AGING_THRESHOLDS));
  const malformed: string[] = [];
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const split = trimmed.indexOf("=");
    const type = split === -1 ? "" : trimmed.slice(0, split).trim();
    const pair = split === -1 ? "" : trimmed.slice(split + 1).trim();
    const [x, y] = pair.split("/");
    const amberAt = Number(x);
    const redAt = Number(y);
    const usable =
      type !== "" &&
      Number.isInteger(amberAt) &&
      Number.isInteger(redAt) &&
      amberAt > 0 &&
      redAt > amberAt;
    if (!usable) {
      malformed.push(trimmed);
      continue;
    }
    thresholds.set(type, { amberAt, redAt });
  }
  return { thresholds, malformed };
};

export type AgingSource =
  /** `00 §7` layer 2's key was set and accepted. */
  | "configured"
  /** The key was set and REFUSED. The shipped defaults apply and the reason is reported. */
  | "refused"
  /** The key was not set. `03-F14`'s own defaults. */
  | "default";

export type AgingPolicy = {
  /** `03-F14` — the two minute marks for one order's type. Never throws; see the header. */
  readonly thresholdsFor: (order_type: string | null) => AgingThresholds;
  readonly source: AgingSource;
  readonly malformed: readonly string[];
};

/**
 * The whole chain as one pure function, so the policy is testable without Electron and without a
 * store.
 *
 * **A refused configuration is not applied and does not stop anything** (`01-F17`, commandment 4;
 * `station-routing.ts`'s ruling on the same question). A typo in a threshold must never take the
 * pass screen off the wall in the middle of a service — the shipped defaults apply, the reason
 * travels out in `malformed`, and the boot line says it at length.
 */
export const resolveAging = (configured: string | undefined): AgingPolicy => {
  const parsed = parseAgingThresholds(configured);
  const refused = parsed.malformed.length > 0;
  const applied = refused ? parseAgingThresholds(undefined) : parsed;
  const set = (configured ?? "").trim() !== "";
  return {
    thresholdsFor: (order_type) => applied.thresholds.get(order_type ?? "") ?? FALLBACK_AGING,
    source: refused ? "refused" : set ? "configured" : "default",
    malformed: parsed.malformed,
  };
};

/** What the boot line says. `00 §5.7` — a threshold that is wrong looks exactly like one that is right. */
export const describeAging = (policy: AgingPolicy): string => {
  const head = `aging: ${policy.source} (03-F14/03-F47, ${AGING_THRESHOLDS_ENV})`;
  if (policy.source === "refused") {
    return (
      `${head} — REFUSED and NOT APPLIED: every entry must be <order_type>=<amber>/<red> with` +
      ` whole minutes and amber strictly before red. Offending: ${policy.malformed.join(", ")}.` +
      ` 03-F14's own defaults are in force (dine-in 10/20, delivery 15/25).`
    );
  }
  const rows = ["dine_in", "takeaway", "pickup", "delivery"]
    .map((t) => {
      const { amberAt, redAt } = policy.thresholdsFor(t);
      return `${t} ${amberAt}/${redAt}`;
    })
    .join(", ");
  return `${head} — ${rows}`;
};
