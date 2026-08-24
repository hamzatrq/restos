import { type EventEnvelopeT, parseEvent } from "@restos/domain";
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
 * A line as the storefront resolved it. `01-F18`/`06-F6`: the price is the one shown at
 * add-to-cart, captured then and written verbatim — **the till never re-resolves it** (`01-F53`).
 */
export type CartLine = {
  readonly line_id: string;
  readonly item_id: string;
  readonly qty: number;
  readonly unit_price_paisa: number;
};

export type PlaceOrderInput = {
  readonly order_id: string;
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
  /** Envelope ids. Injected so a test can pin them; production passes `crypto.randomUUID`. */
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
 * the storefront writes is the LINES, at the prices it showed (`01-F18`).
 */
export const createStorefrontOrigin = (deps: OriginDeps) => ({
  placeOrder: async (input: PlaceOrderInput): Promise<OriginBatch> => {
    if (input.lines.length === 0) {
      throw new Error(
        "06-F17: an order with no lines is not an order. Refused at the origin rather than " +
          "written, because 01-F1 makes an empty order a permanent row nothing can clear.",
      );
    }
    const first = await deps.lamport.reserve(1 + input.lines.length);
    const created = stamp(deps, first, "order.created", {
      order_id: input.order_id,
      channel: STOREFRONT_CHANNEL,
      ...(input.order_type === undefined ? {} : { order_type: input.order_type }),
    });
    const lines = input.lines.map((line, i) =>
      stamp(deps, first + 1 + i, "order.line_added", {
        order_id: input.order_id,
        line_id: line.line_id,
        item_id: line.item_id,
        qty: line.qty,
        unit_price_paisa: line.unit_price_paisa,
      }),
    );
    return { order_id: input.order_id, events: [created, ...lines] };
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
