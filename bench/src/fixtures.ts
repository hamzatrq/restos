// fixtures.ts — deterministic, seeded workloads and adversarial payloads that drive
// both the parity battery and the benchmarks. No ambient randomness, no clocks read
// at generation time: the same seed yields byte-identical inputs on every run and
// every engine (the precondition for a meaningful cross-runtime byte comparison).
import type { ParsedEvent } from "./domain-kernel.ts";
import { idFactory, mkEvent, seededRng } from "./harness.ts";

const CHAIN = ["confirmed", "in_prep", "ready"] as const;

/** One realistic order's lifecycle → a stream of ParsedEvents (created, lines, edges,
 * confirm, kot, table moves, payments, refund, close). `skewClock` decides whether the
 * per-event device_created_at is monotone or wildly skewed across devices. */
function emitOrder(
  push: (e: ParsedEvent) => void,
  nextId: () => string,
  rng: () => number,
  orderId: string,
  baseClock: number,
  skewClock: boolean,
): void {
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const chance = (p: number) => rng() < p;
  // Skewed clocks: each event stamps a time up to ±1 day off, out of order. The fold
  // reads no ordering metadata, so this must not change any projection (parity) and
  // must not change fold cost (bench) — that is exactly what these fixtures probe.
  const clock = () =>
    skewClock ? baseClock + int(-86_400_000, 86_400_000) : baseClock + int(0, 400);
  const device = `d${int(0, 3)}`;
  const ev = (type: string, payload: Record<string, unknown>) =>
    push(mkEvent(type, payload, { id: nextId(), at: clock(), lamport: int(0, 9), device }));

  const hasTable = chance(0.4);
  const createId = nextId();
  push(
    mkEvent(
      "order.created",
      hasTable
        ? { order_id: orderId, channel: "dine_in", table_id: `T${int(1, 8)}` }
        : { order_id: orderId, channel: chance(0.3) ? "takeaway" : "dine_in" },
      { id: createId, at: clock(), lamport: 0, device },
    ),
  );

  const lineCount = int(1, 4);
  for (let l = 0; l < lineCount; l++) {
    const lineId = `${orderId}-L${l}`;
    ev("order.line_added", {
      order_id: orderId,
      line_id: lineId,
      item_id: `item-${int(1, 40)}`,
      qty: int(1, 5),
      unit_price_paisa: int(1, 12) * 5000,
    });
    // A legal edge chain: placed → confirmed → in_prep → ready, then often a terminal.
    let current = "placed";
    let head: string | null = null;
    const steps = int(0, 3);
    for (let s = 0; s < steps; s++) {
      const to = CHAIN[s];
      if (!to) break;
      const id = nextId();
      push(
        mkEvent(
          "order.line_state_changed",
          {
            order_id: orderId,
            line_ids: [lineId],
            state: to,
            line_context: { [lineId]: { to, from_states: [current], preds: head ? [head] : [] } },
          },
          { id, at: clock(), lamport: int(0, 9), device },
        ),
      );
      head = id;
      current = to;
    }
    if (current === "ready" && chance(0.6)) {
      ev("order.line_state_changed", {
        order_id: orderId,
        line_ids: [lineId],
        state: "served",
        line_context: {
          [lineId]: { to: "served", from_states: ["ready"], preds: head ? [head] : [] },
        },
      });
    }
  }

  for (let c = int(1, 2); c > 0; c--) ev("order.confirmed", { order_id: orderId });
  if (chance(0.7)) ev("kot.printed", { order_id: orderId });

  if (chance(0.5)) {
    const first = nextId();
    push(
      mkEvent(
        "order.table_assigned",
        {
          order_id: orderId,
          table_id: `T${int(9, 14)}`,
          from_table_id: null,
          supersedes: [createId],
        },
        { id: first, at: clock(), lamport: int(0, 9), device },
      ),
    );
    if (chance(0.4))
      ev("order.table_assigned", {
        order_id: orderId,
        table_id: `T${int(15, 20)}`,
        from_table_id: null,
        supersedes: [first],
      });
  }

  const attempts = int(1, 2);
  for (let p = 0; p < attempts; p++) {
    const attempt = `sa-${orderId}-${p}`;
    const amount = int(1, 8) * 10000;
    ev("payment.recorded", {
      order_id: orderId,
      amount_paisa: amount,
      method: chance(0.5) ? "cash" : "card",
      purpose: "settles_order",
      settlement_attempt_id: attempt,
    });
    if (chance(0.15))
      ev("payment.refunded", {
        order_id: orderId,
        amount_paisa: int(0, amount / 10000) * 10000,
        method: "cash_out",
        settlement_attempt_id: `rf-${orderId}-${p}`,
        payment_attempt_id: attempt,
      });
  }
  if (chance(0.5)) ev("order.settlement_closed", { order_id: orderId });
}

/** A busy-day event log with at least `targetEvents` events, generated order by order.
 * `skewClock` toggles the wildly-out-of-order timestamp profile. Deterministic in seed. */
export function busyDay(
  seed: number,
  targetEvents: number,
  skewClock = false,
): { events: ParsedEvent[]; orders: number } {
  const rng = seededRng(seed);
  const nextId = idFactory("e");
  const events: ParsedEvent[] = [];
  const push = (e: ParsedEvent) => events.push(e);
  const baseClock = 1_752_800_000_000;
  let orders = 0;
  while (events.length < targetEvents) {
    emitOrder(push, nextId, rng, `O${orders}`, baseClock + orders * 1000, skewClock);
    orders++;
  }
  return { events, orders };
}

// ---------------------------------------------------------------------------
// Adversarial payloads for canonicalJson / payloadHash parity. Each targets a
// documented Node/V8-vs-Hermes divergence risk (key ordering, number formatting,
// UTF-16 code-unit sort, non-ASCII, dropped values, surrogate pairs).
// ---------------------------------------------------------------------------
export const canonicalPayloads: ReadonlyArray<{ name: string; value: unknown }> = [
  { name: "flat-key-order", value: { z: 1, a: 2, m: 3, B: 4, "0": 5 } },
  {
    name: "nested-key-order",
    value: { b: { d: 1, c: 2 }, a: { z: [3, 2, 1], y: { q: 0, p: 0 } } },
  },
  { name: "utf16-key-sort", value: { é: 1, e: 2, Z: 3, a: 4, É: 5, z: 6 } },
  {
    name: "non-ascii-values",
    value: {
      urdu: "کھانا تیار ہے",
      arabic: "الطعام جاهز",
      emoji: "🍛🔥😀",
      mixed: "Table 12 — سلام",
    },
  },
  { name: "surrogate-pairs", value: { a: "😀𝕏🇵🇰", b: "😀", combining: "é" } },
  {
    name: "number-formatting",
    value: {
      neg: -0,
      big: 1e21,
      small: 1e-7,
      frac: 0.1 + 0.2,
      safe: 9007199254740991,
      int: 123456789012345680,
    },
  },
  {
    name: "dropped-values",
    value: { keep: 1, undef: undefined, fn: () => 1, sym: Symbol("s"), nested: [1, undefined, 3] },
  },
  { name: "array-of-objects", value: [{ b: 1, a: 2 }, { d: 3, c: 4 }, [5, { z: 6, y: 7 }]] },
  { name: "empty-and-null", value: { obj: {}, arr: [], nul: null, str: "", zero: 0, f: false } },
  {
    name: "money-shaped-payload",
    value: {
      order_id: "O-42",
      amount_paisa: 9007199254740991,
      settlement_attempt_id: "sa-π-1",
      method: "raast",
      note: "بقایا رقم",
    },
  },
];
