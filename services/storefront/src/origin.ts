import { type EventEnvelopeT, parseEvent } from "@restos/domain";
import type { StorefrontCatalog } from "./catalog.js";
import type { OriginIdentity } from "./identity.js";

/**
 * `06-F30`/`06-F31` — **the append half of the cloud origin.** This module turns a customer's
 * cart into `01-F62` envelopes and hands them to a durable outbox. It is the only place in this
 * service that mints a ledger fact.
 *
 * Everything it produces goes through `parseEvent` before it leaves this file, so `01-F4` bites
 * HERE — at emit — rather than at the gateway, which is where the corpus puts it (*"producing an
 * unknown/invalid event type is a build-time and runtime error"*). A malformed storefront order
 * fails the customer's request; it never becomes a quarantine row someone reads next week.
 */

/** `06-F31` — the origin's clock. See `stamp()`; this constant exists so a mutant is one edit. */
export const ORIGIN_TIME_BASIS = "branch_provisional" as const;

/**
 * A line as the CUSTOMER sends it — **and note what is not here: a price.**
 *
 * `06-F33`. The first version of this type carried `unit_price_paisa` and the router declared it
 * as a field of the public, unauthenticated request body, so a browser set the price and `01-F1`
 * froze it (reproduced: a Rs 450 burger in a cashier's inbox at 1 paisa). The field is **gone from
 * the type**, not validated in it: a price that can be sent and is then compared is a price a
 * later session trusts. The origin resolves `(its own branch, storefront, item_id)` against the
 * published catalog (`catalog.ts`), which is the same read `addLine` does on a till, and `01-F18`/
 * `01-F53` then apply unchanged — captured once at line-add, never re-derived afterwards.
 */
export type CartLine = {
  readonly line_id: string;
  readonly item_id: string;
  readonly qty: number;
};

/**
 * `06-F33`/`01-F60` — an item with no cell at `(this branch, storefront)` cannot be sold, and
 * inventing a price is worse than refusing.
 *
 * **Not an `01-F17` breach, and the distinction is the FR's own:** `01-F17` forbids blocking a
 * SALE, and the counter's `addLine` already refuses one unpriced item while the rest of the order
 * completes — *"the sale is not blocked, this one item is"*. Here the whole cart is refused before
 * anything is appended, because a storefront cart is submitted in one act and a partial order the
 * customer never chose is a permanent row under `01-F1`.
 */
export class UnpricedItemsError extends Error {
  constructor(readonly item_ids: readonly string[]) {
    super(
      `06-F33/01-F60: no storefront price for ${item_ids.join(", ")} on this branch. The order ` +
        `is refused rather than priced: 01-F60 admits no fallback, 0 is a sellable price and ` +
        `"unpriced" is not, and 01-F1 would make either mistake permanent.`,
    );
    this.name = "UnpricedItemsError";
  }
}

/**
 * A cart as the CUSTOMER sends it — **and note what is not here either: an order key.**
 *
 * `06-F35`. The first version took `order_id` from the public, unauthenticated request body and
 * this origin, which holds no state and reads none, emitted `order.created` plus a line per
 * request for whatever id was named. Reproduced over real HTTP into a real device fold: a
 * stranger named a CONFIRMED order and put 20 × Rs 450 on someone else's bill, with no anomaly
 * raised and `01-F1` to make it permanent. The origin mints the id now (`placeOrder`), so
 * *joining an existing order* is unrepresentable rather than checked — the shape `06-F33` used
 * for the price, for the same stated reason.
 */
export type PlaceOrderInput = {
  readonly lines: readonly CartLine[];
  /** `02-F42`'s price key. Pinned to `storefront` by `06-F10` and never taken from the caller. */
  readonly order_type?: string;
};

/** Monotonic per-origin lamport source. Durable in production (`06-F30`'s single writer). */
export type LamportSource = {
  /** Reserves `count` CONTIGUOUS slots and returns the first. Contiguity is the gateway's rule. */
  reserve: (count: number) => Promise<number>;
};

export type OriginClock = () => number;

export type OriginDeps = {
  readonly identity: OriginIdentity;
  readonly lamport: LamportSource;
  readonly clock: OriginClock;
  /**
   * `06-F33` — the price authority. **Required, never optional with a default**: `seams:check`
   * Rule B asks whether an optional member is SUPPLIED and never whether the supply is real, and
   * an `catalog?: StorefrontCatalog` defaulting to anything at all is how a price stops coming
   * from the catalog again, silently.
   */
  readonly catalog: StorefrontCatalog;
  /**
   * Envelope ids **and, since `06-F35`, the `order_id` itself**. Injected so a test can pin them;
   * production passes `crypto.randomUUID`.
   *
   * ⚠ One source rather than two on purpose: an order key minted from anything weaker than the
   * source that mints envelope ids is a key a stranger can name, which is the whole defect. If a
   * later session ever wants a human-readable order handle (`06-F8`'s pickup code is the one the
   * corpus specifies), it is a SECOND, display-only value — never this one.
   */
  readonly newId: () => string;
};

/**
 * `01-F62`'s three required branch fields, plus `06-F31`'s clock ruling.
 *
 * **`time_basis` is `branch_provisional` FOR EVER and that is sanctioned rather than a defect.**
 * `01-F43` frames offset-0 as the transient state of a device *"with no hub contact yet"*; a
 * cloud origin never contacts a branch hub, so it never acquires an offset and never promotes.
 * `01-F45`'s basis precedence is what makes this safe: where a fold selects among competing
 * time-carrying members, `branch` members are preferred and a provisional one is used only when
 * no `branch` member exists. Every duration this product computes anchors on `order.confirmed`
 * (`03-F25`), which the TILL emits with `branch` basis — so this stamp is never the value a
 * kitchen or service timer reads.
 *
 * ⚠ **The exception is real and is stated in `06-F31` rather than hidden here:** an order that is
 * never confirmed has NO `branch` member at all, so its whole life is provisional. That is
 * acceptable only because the affected arithmetic is the storefront's own backpressure and
 * `06-F27` auto-close window — cloud-side computations, specified as such — and never a kitchen
 * duration.
 *
 * **`actor_user_id` is `null`, and it is the honest answer rather than a gap** (`01-F84`,
 * `02-F45`). A customer is not a `ROLES` member and must never become one; inventing a service
 * user would put a fictional person on a permanent record (`01-F1`) and would be `02-F41`'s
 * attribution hole wearing a service account.
 */
const stamp = (
  deps: OriginDeps,
  lamport_seq: number,
  type: string,
  payload: unknown,
): EventEnvelopeT => {
  const now = deps.clock();
  return parseEvent({
    id: deps.newId(),
    org_id: deps.identity.org_id,
    branch_id: deps.identity.branch_id,
    device_id: deps.identity.device_id,
    actor_user_id: null,
    lamport_seq,
    device_created_at: now,
    branch_created_at: now,
    time_basis: ORIGIN_TIME_BASIS,
    server_received_at: null,
    type,
    schema_version: 1,
    payload,
    refs: [],
  }).envelope;
};

/**
 * `06-F10`: *"Channel for all storefront orders is `storefront`."* Pinned here rather than taken
 * from the caller, because `02-F42` makes channel a PRICE KEY (`01-F60`, per (branch, channel)
 * with no fallback) — a caller-supplied channel is a caller-chosen price list.
 */
export const STOREFRONT_CHANNEL = "storefront" as const;

export type OriginBatch = {
  readonly order_id: string;
  readonly events: readonly EventEnvelopeT[];
};

/**
 * `06-F17`/`00 §5.1` — placing an order is `order.created` plus one `order.line_added` per line,
 * in one contiguous lamport run.
 *
 * **Contiguity is the gateway's rule, not a preference.** `handlePush` tracks slots per ORIGIN
 * device and advances a watermark only over a gap-free run, so a batch that skipped a slot would
 * wedge this origin's outbox permanently. Reserving the whole run up front is what makes a
 * partially-failed batch impossible.
 *
 * **No total is computed here and none is written.** `01-F17`'s money law puts the bill in the
 * fold, and `02-F63`'s charge rounding plus `16-F5`'s per-line tax are the till's arithmetic; a
 * second implementation of that in the cloud is the two-writers defect on the money path. What
 * the storefront writes is the LINES, at the prices **the catalog holds** (`06-F33`, `01-F60`).
 *
 * **The price read happens BEFORE the lamport reservation, and the order is deliberate.** A
 * refused cart must consume no slot: `handlePush` advances this origin's watermark only over a
 * gap-free run, so a reservation abandoned by a refusal would wedge the outbox permanently.
 */
export const createStorefrontOrigin = (deps: OriginDeps) => ({
  /**
   * `06-F34` (b) — exposed so a caller can compare the tenant it resolved against the tenant this
   * origin will actually stamp. The first version kept the identity private, so `placement` could
   * not have compared even if it had wanted to, and an entitlement check that passed for one org
   * while the events landed in another's ledger was unreachable by any assertion.
   */
  identity: deps.identity,

  placeOrder: async (input: PlaceOrderInput): Promise<OriginBatch> => {
    if (input.lines.length === 0) {
      throw new Error(
        "06-F17: an order with no lines is not an order. Refused at the origin rather than " +
          "written, because 01-F1 makes an empty order a permanent row nothing can clear.",
      );
    }
    // `06-F33` — ONE read for the whole cart, so a publish landing mid-order cannot price half of
    // it against each menu. `CatalogUnreadableError` propagates: a gateway that cannot be read is
    // not an item with no price, and treating it as one would sell at whatever a default said.
    const priced = await deps.catalog.priceLines(input.lines.map((line) => line.item_id));
    const unpriced = input.lines
      .map((line) => line.item_id)
      .filter((item_id) => !priced.paisa.has(item_id));
    if (unpriced.length > 0) throw new UnpricedItemsError([...new Set(unpriced)]);

    /**
     * `06-F35` (a) — **THE ORDER ID IS MINTED HERE AND CANNOT COME FROM THE REQUEST.**
     *
     * The caller names no order, so it cannot name an order that already exists: the id below is
     * `deps.newId()` — the same unguessable source the envelope ids come from — and it is what
     * the response hands back. An implementer reaching for `input.order_id ?? deps.newId()` at
     * this line is restoring the defect: it makes a stranger's key authoritative again the moment
     * anything upstream stops stripping it, and `order-identity.test.ts` §A casts one past the
     * type for exactly that reason.
     */
    const order_id = deps.newId();

    const first = await deps.lamport.reserve(1 + input.lines.length);
    const created = stamp(deps, first, "order.created", {
      order_id,
      channel: STOREFRONT_CHANNEL,
      ...(input.order_type === undefined ? {} : { order_type: input.order_type }),
    });
    const lines = input.lines.map((line, i) =>
      stamp(deps, first + 1 + i, "order.line_added", {
        order_id,
        line_id: line.line_id,
        item_id: line.item_id,
        qty: line.qty,
        // `06-F33` — the CATALOG's cell for this origin's `(branch, storefront)`, resolved above.
        // `priced.paisa.get` cannot be undefined here: every missing item was refused already,
        // and the `?? 0` an implementer reaches for at this line is the whole defect returning.
        unit_price_paisa: priced.paisa.get(line.item_id) as number,
      }),
    );
    return { order_id, events: [created, ...lines] };
  },

  /**
   * `06-F19` (the customer cancels before confirm) and `06-F27` (the window auto-closes).
   *
   * **This is `order.cancelled`'s first producer in the corpus.** `01-F84` registered the payload
   * and recorded that the MVP had no emitter for it; `06-F30`'s origin is the emitter, because
   * both named producers are storefront and a browser cannot append.
   *
   * `reason` is free text by `01-F84`'s ruling — no FR supplies a cancellation list and inventing
   * one is commandment 2 — so the caller's words travel verbatim, including `06-F27`'s
   * machine-written one.
   *
   * ⚠ **THIS DOOR TAKES AN `order_id` IT CAN NEITHER OWN NOR AGE-CHECK, AND `06-F35` (c) IS WHERE
   * THAT IS DECIDED — it is not an oversight and it must not be read as one.** `06-F19` permits a
   * customer cancel *"any time before `order.confirmed`"* and this origin can check **neither**
   * half: it holds no branch slice (`06-F30`), so it cannot know whether the branch confirmed,
   * and there is no customer session, so it cannot know whose order this is. `placeOrder`'s mint
   * closed the ENUMERATION half — an order id is an unguessable value now rather than `web-1` —
   * and what is left is a caller who already HOLDS an id, plus junk rows for ids that were never
   * issued (inert: `26 §3`'s sidecar keys on the payload's order id, so they reach no
   * projection). The two pieces that close it are `06-F12`'s signed customer session and
   * `06 §5`'s order-status read model, both of which belong to the unbuilt customer surface.
   * `order-identity.test.ts` §B pins the hole so the day one of them lands, a test fails and is
   * read rather than the cancel quietly starting to be safe.
   */
  cancelOrder: async (input: { order_id: string; reason: string }): Promise<OriginBatch> => {
    const seq = await deps.lamport.reserve(1);
    return {
      order_id: input.order_id,
      events: [stamp(deps, seq, "order.cancelled", { ...input })],
    };
  },
});

export type StorefrontOrigin = ReturnType<typeof createStorefrontOrigin>;
