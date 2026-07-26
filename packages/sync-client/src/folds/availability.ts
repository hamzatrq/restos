/**
 * Item-availability fold (`01-F22`, `01-F57`..`01-F59`; merge semantics per `26`).
 *
 * Kept out of `folds/merge.ts` because the key space is disjoint — that engine is
 * order-keyed (`dirty` is order ids, `projectOrder` takes an order id) and this is
 * item-keyed. This is **not** the `26 §8` violation of reimplementing fold logic outside
 * the engine: it is a different fold over different events, sharing no arithmetic with it.
 *
 * The rule, and why the obvious one is illegal:
 *
 * "The latest toggle wins" would need either a device clock (banned in folds, `01-F45`) or
 * an envelope-id comparison reaching a projected value (banned, `01-F34`). And concurrent
 * toggles are ordinary here, not exotic — `01-F22` puts the control on the POS, the pass
 * screen and the manager console at once. So each toggle **names the toggles it replaces**
 * and the fold takes the maximal set, exactly as `order.table_assigned` already does.
 *
 * Convergence: the maximal set is a pure function of the event SET, so delivery order
 * cannot change it. Commutative, associative, idempotent.
 */

export type AvailabilityToggle = {
  event_id: string;
  item_id: string;
  available: boolean;
  supersedes: readonly string[];
};

export type AvailabilityRow = {
  item_id: string;
  /** 0/1 rather than boolean — SQLite STRICT has no boolean type. */
  available: number;
  /** 01-F58: the maximal set disagreed. Surfaced to the manager, never silently resolved. */
  contested: number;
};

export type AvailabilityFold = {
  apply(t: AvailabilityToggle): void;
  rebuild(toggles: readonly AvailabilityToggle[]): void;
  /** Every item that has ever been toggled. Untoggled items are available by default. */
  snapshot(): AvailabilityRow[];
  /** `true` unless an un-superseded toggle says otherwise (`01-F59` default: available). */
  isAvailable(item_id: string): boolean;
  isContested(item_id: string): boolean;
};

/**
 * Project one item from its toggle set. Exported for direct property testing: this is the
 * whole merge rule, and it must be assertable without a database or a delivery order.
 */
export const projectAvailability = (
  toggles: readonly AvailabilityToggle[],
): { available: boolean; contested: boolean } => {
  // An item nobody has toggled is available. The catalog says what exists; availability is
  // an operational override on top of it (01-F22 — an event, never a catalog edit).
  if (toggles.length === 0) return { available: true, contested: false };

  // Superseded = named by ANY other toggle for this item. Self-reference is ignored so a
  // malformed event cannot erase itself and take the item's whole history with it.
  const superseded = new Set<string>();
  for (const t of toggles) {
    for (const id of t.supersedes) if (id !== t.event_id) superseded.add(id);
  }

  const maximal = toggles.filter((t) => !superseded.has(t.event_id));
  // Every toggle superseded by another that is itself absent (a chain whose head has not
  // arrived) leaves nothing maximal. Treat as untoggled rather than inventing a winner —
  // the head will arrive and the fold is a pure function of whatever set is present.
  if (maximal.length === 0) return { available: true, contested: false };

  const distinct = new Set(maximal.map((t) => t.available));
  if (distinct.size === 1) {
    return { available: maximal[0]?.available ?? true, contested: false };
  }

  // 01-F58 — the fold does not pick a winner (01-F31). It resolves to UNAVAILABLE and flags
  // the disagreement. A semantic choice, not a tiebreak: erring toward not selling a dish
  // the kitchen may have run out of is the recoverable direction — failing to sell one you
  // could costs a re-toggle, selling one you cannot costs a refund and a customer.
  return { available: false, contested: true };
};

export const createAvailabilityFold = (): AvailabilityFold => {
  const byItem = new Map<string, Map<string, AvailabilityToggle>>();

  const put = (t: AvailabilityToggle): void => {
    let m = byItem.get(t.item_id);
    if (!m) {
      m = new Map();
      byItem.set(t.item_id, m);
    }
    // Keyed by event id, so redelivery of the same event is a no-op (idempotent, 01-F34).
    m.set(t.event_id, t);
  };

  const project = (item_id: string) =>
    projectAvailability([...(byItem.get(item_id)?.values() ?? [])]);

  return {
    apply: put,

    rebuild: (toggles) => {
      byItem.clear();
      for (const t of toggles) put(t);
    },

    snapshot: () =>
      [...byItem.keys()].sort().map((item_id) => {
        const r = project(item_id);
        return { item_id, available: r.available ? 1 : 0, contested: r.contested ? 1 : 0 };
      }),

    isAvailable: (item_id) => project(item_id).available,
    isContested: (item_id) => project(item_id).contested,
  };
};
