// ACCEPTANCE TESTS — THREE PLACES THE PAPER CONTRADICTED THE LEDGER, AND THE LEDGER WAS RIGHT.
//
// PROVENANCE (`24 §3` step 2), stated rather than glossed: authored by the session that made the
// fixes, which is NOT the `24 §3` split. `20 §4.3` as amended by **R66** tiers the separation rule
// by path and these are corrections to two existing documents rather than new money arithmetic.
// The mitigation is the round-3 law (`L10`): every assertion below was mutation-checked against a
// single-branch mutant reproducing the defect it claims to own, with a NEGATIVE CONTROL, and the
// matrix is in the session report. A suite nobody has tried to break is a suite nobody knows the
// strength of.
//
// ⚠ **WHY THIS FILE USES A REAL `openStore` AND NOT THE STUB STORES ITS NEIGHBOURS USE.** All
// three defects live at a SEAM between a fold and a document, and a stub store is a hand-copy of
// the fold's answer — it can be written to say whatever the test wants and therefore cannot
// witness the disagreement. §A's cell shape (`states` beside a price in `json_lines`), §B's
// projection (a `days` row that is one append behind) and §C's channel field are all things the
// real fold decides. That is `L8`'s shape exactly: the modules are correct, and nothing asserted
// that the application reaches them with the right facts.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   01 §4   `voided` / `cancelled` are the two canonical EXIT states of an order line.
//   01-F30  "billed derives from delivered lines, **exited lines excluded** — a fully-voided order
//           nets to zero."
//   01-F45  a stamp this device does not hold is not one it may invent.
//   01-F46  the business day is Asia/Karachi with a 05:00 cutover.
//   01-F17  "A sale is never blocked" — a cashier may settle an order that never went to the
//           kitchen, which is what produces an order with no delivered branch stamp at all.
//   02-F8   "removal pre-KOT is a plain event; post-KOT it must be a `void.recorded` with
//           approver" — the chit is the boundary.
//   02-F20  "Manager escalation required for: **void after KOT**, comp, discount above org
//           threshold, price override" — the after case is escalated because the dish is being
//           made; the before case is a dish that must never be started.
//   02-F24  "manager cash count + deposit record → `day.closed`, `cash.deposit_recorded`; a
//           day-summary ticket (**sales by channel**, voids/comps/discounts, over/short) can be
//           printed via doc 03."
//   02-F42  the closed channel set.
//   02-F43  money that cannot be bound is "counted into an unbound bucket" and surfaced; what the
//           FR forbids is "the silent path … money vanishing from … `02-F24`'s day close with
//           nothing to point at".
//   02-F45  one fact, one source.
//   03-F2   "one `order.confirmed` fans out to N KOTs by category→printer rules."
//   03-F32  a `kot` renders no money token under any profile.
//   26 §8   fold logic is never reimplemented outside `packages/sync-client`.
//
// ⚠ NOT EVIDENCE FOR: any physical printer (K-8 is owed in full and no printer has ever been
// attached), or that a cook or a manager can READ any of this (`27-F35`'s ≥85% comprehension gate
// is measured on real staff and is untouched).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { businessDate, newId, TAX_OFF } from "@restos/domain";
import {
  classifyTransmit,
  createSpooler,
  type PrinterCapability,
  printerCapability,
  type Spooler,
} from "@restos/escpos";
import { billedTotalPaisa, type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { createCashPrinter, createKotPrinter, createReceiptPrinter } from "../printing";

// ── the fixture ─────────────────────────────────────────────────────────────────────────────────

/** 2026-08-20 13:00 Asia/Karachi — inside the business day, clear of `01-F46`'s 05:00 cutover. */
const AT = Date.UTC(2026, 7, 20, 8, 0, 0);
const BUSINESS_DATE = businessDate(AT);

const NAMES: Record<string, string> = {
  "i-karahi": "Chicken Karahi",
  "i-naan": "Naan",
  "i-water": "Water (with meal)",
};
/** `03-F50`'s per-item station. Two stations so `03-F2`'s fan-out is real rather than degenerate. */
const STATIONS: Record<string, string> = {
  "i-karahi": "GRILL",
  "i-naan": "TANDOOR",
  "i-water": "TANDOOR",
};

const capability: PrinterCapability = printerCapability("TH230");
const textOf = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

/**
 * The document's rows, as WHOLE lines.
 *
 * ⚠ **A `toContain` over the decoded document CANNOT separate the two channel blocks, and the
 * first draft of §C's headline assertion was defeated by exactly that:** `not.toContain("Phone Rs
 * 893")` passes only until `Undated Phone Rs 893` is on the paper, which CONTAINS it as a
 * substring — so the assertion that was supposed to prove the money had not been DATED was
 * satisfied by the row proving it had been named. Splitting on the encoder's control bytes is
 * what makes `Phone Rs 0` and `Undated Phone Rs 893` two different rows rather than one string.
 */
const rowsOf = (bytes: Uint8Array): string[] => {
  const rows: string[] = [];
  let current = "";
  for (const byte of bytes) {
    // Every ESC/POS command byte and every feed is below 0x20; nothing this document prints is.
    if (byte < 0x20) {
      if (current.trim().length > 0) rows.push(current.trim());
      current = "";
      continue;
    }
    current += String.fromCharCode(byte);
  }
  if (current.trim().length > 0) rows.push(current.trim());
  return rows;
};

type Rig = {
  readonly store: DeviceStore;
  readonly spooler: Spooler;
  readonly sent: Uint8Array[];
  /** Appends through the real store, so the real fold decides every projected value. */
  readonly append: (type: string, payload: Record<string, unknown>) => void;
  readonly kot: ReturnType<typeof createKotPrinter>;
  readonly receipts: ReturnType<typeof createReceiptPrinter>;
  readonly cash: ReturnType<typeof createCashPrinter>;
};

const open: DeviceStore[] = [];
afterEach(() => {
  for (const store of open.splice(0)) store.close();
});

const rig = (): Rig => {
  const identity = { org_id: newId(), branch_id: newId(), device_id: newId() };
  const store = openStore({
    path: join(mkdtempSync(join(tmpdir(), "restos-paper-")), "device.db"),
    identity,
  });
  open.push(store);
  const actor = newId();
  let tick = 0;
  const append = (type: string, payload: Record<string, unknown>): void => {
    tick += 1;
    store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      actor_user_id: actor,
      // Monotone within the business day, so `01-F46` files every event on `BUSINESS_DATE` and no
      // assertion below depends on the machine's own clock (`01-F45`).
      device_created_at: AT + tick,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };

  const sent: Uint8Array[] = [];
  const spooler = createSpooler({
    transport: {
      send: async (document) => {
        sent.push(document);
        return classifyTransmit(
          { status: { paper_out: false, near_end: false }, timed_out: false, link_error: null },
          capability,
        );
      },
      status: async () => ({ paper_out: false, near_end: false }),
    },
  });
  const catalog = (item_id: string) =>
    NAMES[item_id] === undefined ? null : { name: NAMES[item_id] as string };
  return {
    store,
    spooler,
    sent,
    append,
    kot: createKotPrinter({
      spooler,
      store,
      catalog,
      station: (item_id) => STATIONS[item_id] ?? "DEFAULT",
      capability,
      append,
    }),
    receipts: createReceiptPrinter({
      spooler,
      store,
      catalog,
      capability,
      pump: () => spooler.pump(),
      cashier: () => "Ayesha Khan",
    }),
    cash: createCashPrinter({
      spooler,
      store,
      capability,
      pump: () => spooler.pump(),
      append,
    }),
  };
};

const line = (
  r: Rig,
  order_id: string,
  line_id: string,
  item_id: string,
  unit_price_paisa: number,
): void => r.append("order.line_added", { order_id, line_id, item_id, qty: 1, unit_price_paisa });

/** One `order.line_state_changed` edge per line — `01-F35`'s per-line context, `preds` empty. */
const edge = (r: Rig, order_id: string, line_ids: string[], to: string, from: string): void =>
  r.append("order.line_state_changed", {
    order_id,
    line_ids,
    state: to,
    line_context: Object.fromEntries(
      line_ids.map((id) => [id, { to, from_states: [from], preds: [] }]),
    ),
  });

/** `02-F20`'s corrective beside the exit, with `01-F83`'s adjustment key. */
const voidRecorded = (r: Rig, order_id: string, amount_paisa: number): void =>
  r.append("void.recorded", {
    order_id,
    amount_paisa,
    reason: "customer changed mind",
    approver_user_id: null,
    adjustment_attempt_id: newId(),
  });

const settle = (r: Rig, order_id: string, amount_paisa: number, shift_id: string | null): void => {
  r.append("payment.recorded", {
    order_id,
    settlement_attempt_id: newId(),
    amount_paisa,
    method: "cash",
    shift_id,
    purpose: "settles_order",
  });
  r.append("order.settlement_closed", { order_id });
};

const billedOf = (r: Rig, order_id: string): number =>
  billedTotalPaisa(
    r.store.openOrders().find((row) => row.order_id === order_id)?.json_lines ?? "{}",
    TAX_OFF,
    100,
  );

// ── A. THE KITCHEN — a line that left the order is not cooked ───────────────────────────────────

describe("01 §4/02-F20 — a VOIDED line does not reach the kitchen", () => {
  /**
   * Rings karahi + naan, voids the naan (exit edge + `02-F20`'s corrective), confirms the rest.
   * Returns every document the transport was handed.
   */
  const oneVoidedNaan = async (naanPrice: number): Promise<{ r: Rig; order_id: string }> => {
    const r = rig();
    const order_id = newId();
    r.append("order.created", { order_id, channel: "counter", order_type: "dine_in" });
    line(r, order_id, "l-karahi", "i-karahi", 45_000);
    line(r, order_id, "l-naan", "i-naan", naanPrice);
    edge(r, order_id, ["l-naan"], "voided", "placed");
    voidRecorded(r, order_id, naanPrice);
    edge(r, order_id, ["l-karahi"], "confirmed", "placed");
    r.append("order.confirmed", { order_id });
    r.kot.confirmed(order_id);
    await r.spooler.pump();
    return { r, order_id };
  };

  it("THE DEFECT VERBATIM: the fold says voided and the tandoor chit does not exist", async () => {
    // Reproduced on this exact rig before the fix: `json_lines` carried
    // `"l-naan": {"states":["voided"], …}` while the bytes handed to the transport read
    // `TANDOOR 13:00 / 1 Naan`. `owedChits` walked every entry of `json_lines` unconditionally and
    // `LineCell` declared no `states` field, so the print path could not see a void at all.
    const { r, order_id } = await oneVoidedNaan(6_000);
    const cells = JSON.parse(
      r.store.openOrders().find((row) => row.order_id === order_id)?.json_lines ?? "{}",
    ) as Record<string, { states: string[] }>;
    expect(cells["l-naan"]?.states, "the ledger is the thing being agreed with").toEqual([
      "voided",
    ]);

    const paper = r.sent.map(textOf);
    expect(paper.length, "no chit was transmitted at all").toBeGreaterThan(0);
    expect(paper.some((doc) => doc.includes("Chicken Karahi"))).toBe(true);
    for (const doc of paper) expect(doc).not.toContain("Naan");
  });

  it("03-F2: the station whose ONLY line was voided gets no chit, rather than an empty one", async () => {
    // The fan-out is per STATION. A tandoor ticket carrying no lines is a cook walking to a
    // printer for nothing, and it is one keystroke away from the fix that merely blanks the row.
    const { r } = await oneVoidedNaan(6_000);
    const paper = r.sent.map(textOf);
    for (const doc of paper) expect(doc).not.toContain("TANDOOR");
    expect(paper.some((doc) => doc.includes("GRILL"))).toBe(true);
  });

  it("01-F60: a VOIDED line priced at ZERO is off the chit too — the neighbouring case", async () => {
    // The exit test must not be derived from the money, because `billedLinePaisa` answers `0` for
    // an exited line, a free line and a zero-quantity line alike. A guard built on that number is
    // aimed one case away from a voided giveaway.
    const { r } = await oneVoidedNaan(0);
    for (const doc of r.sent.map(textOf)) expect(doc).not.toContain("Naan");
  });

  it("01-F17/03-F2: a line that has NOT exited still reaches its station", async () => {
    // The anti-scope half. A filter that took every line off the paper would pass every assertion
    // above it and starve the kitchen — the failure direction that loses a customer's food.
    const r = rig();
    const order_id = newId();
    r.append("order.created", { order_id, channel: "counter", order_type: "dine_in" });
    line(r, order_id, "l-karahi", "i-karahi", 45_000);
    line(r, order_id, "l-naan", "i-naan", 6_000);
    line(r, order_id, "l-water", "i-water", 0);
    edge(r, order_id, ["l-karahi", "l-naan", "l-water"], "confirmed", "placed");
    r.append("order.confirmed", { order_id });
    r.kot.confirmed(order_id);
    await r.spooler.pump();
    const paper = r.sent.map(textOf).join("\n");
    expect(paper).toContain("Chicken Karahi");
    expect(paper).toContain("Naan");
    // `01-F60`'s explicit zero is a line the kitchen must make, and `03-F32` keeps its price off
    // the paper — so a free item is indistinguishable from a paid one on a chit, by design.
    expect(paper).toContain("Water (with meal)");
  });
});

// ── B. THE CUSTOMER'S COPY — the same predicate, one document over ──────────────────────────────

describe("01-F30/02-F45 — the receipt itemises what the bill is built from", () => {
  const settledReceipt = async (waterPrice: number): Promise<string[]> => {
    const r = rig();
    const order_id = newId();
    r.append("order.created", { order_id, channel: "counter", order_type: "dine_in" });
    line(r, order_id, "l-karahi", "i-karahi", 45_000);
    line(r, order_id, "l-water", "i-water", waterPrice);
    edge(r, order_id, ["l-water"], "voided", "placed");
    voidRecorded(r, order_id, waterPrice);
    edge(r, order_id, ["l-karahi"], "confirmed", "placed");
    r.append("order.confirmed", { order_id });
    settle(r, order_id, billedOf(r, order_id), null);
    r.receipts.settled(order_id);
    await r.spooler.pump();
    return r.sent.map(textOf);
  };

  it("a VOIDED line priced at ZERO is off the customer's copy too", async () => {
    // The measured wart this fix closes on the receipt side: `billedOnPaper` read
    // `unit_price_paisa === 0 || billedLinePaisa(cell) > 0`, whose FIRST arm short-circuits before
    // the exit is consulted — so a line in state `["voided"]` at price 0 printed as
    // `1 Water (with meal) Rs 0 each` on a copy of an order it had been taken off. The arithmetic
    // closed either way, which is why no money assertion could see it.
    const paper = await settledReceipt(0);
    expect(paper.length, "no receipt was transmitted at all").toBeGreaterThan(0);
    for (const doc of paper) expect(doc).not.toContain("Water (with meal)");
    expect(paper.some((doc) => doc.includes("Chicken Karahi"))).toBe(true);
  });

  it("a VOIDED line WITH a price stays off it — the case that was already closed", async () => {
    const paper = await settledReceipt(3_000);
    for (const doc of paper) expect(doc).not.toContain("Water (with meal)");
  });

  it("01-F60: a line priced at zero that did NOT exit still prints", async () => {
    // The anti-scope half again, and the reason the price arm survives: `01-F60` created the
    // explicit zero so that FREE is distinguishable from FORGOTTEN, and a customer holding a
    // receipt with no water on it cannot tell the two apart either.
    const r = rig();
    const order_id = newId();
    r.append("order.created", { order_id, channel: "counter", order_type: "dine_in" });
    line(r, order_id, "l-karahi", "i-karahi", 45_000);
    line(r, order_id, "l-water", "i-water", 0);
    edge(r, order_id, ["l-karahi", "l-water"], "confirmed", "placed");
    r.append("order.confirmed", { order_id });
    settle(r, order_id, billedOf(r, order_id), null);
    r.receipts.settled(order_id);
    await r.spooler.pump();
    expect(r.sent.map(textOf).join("\n")).toContain("Water (with meal)");
  });
});

// ── C. THE DAY SUMMARY — the deposit, and the channel the undated money came from ───────────────

const DAY_ID = () => newId();

describe("02-F24 — the day summary agrees with the day row it was assembled from", () => {
  /** `day.opened`, a shift, and one settled counter order. Returns the day id. */
  const aDay = (r: Rig): { day_id: string; shift_id: string } => {
    const day_id = DAY_ID();
    const shift_id = newId();
    r.append("day.opened", { day_id, opening_float_paisa: 500_000, prev_day_id: null });
    r.append("shift.opened", { shift_id, prev_shift_id: null });
    return { day_id, shift_id };
  };

  const closeAndPrint = async (
    r: Rig,
    day_id: string,
    counted: number,
    order: "deposit-first" | "close-first",
  ): Promise<string> => {
    // `main/index.ts` hangs the day summary off the COMPLETED append of `day.closed`, so the
    // trigger sits exactly where the host puts it and this test measures the ORDER of the act.
    if (order === "deposit-first") {
      r.append("cash.deposit_recorded", { day_id, amount_paisa: counted });
      r.append("day.closed", { day_id, counted_cash_paisa: counted });
      r.cash.dayClosed(day_id);
    } else {
      r.append("day.closed", { day_id, counted_cash_paisa: counted });
      r.cash.dayClosed(day_id);
      r.append("cash.deposit_recorded", { day_id, amount_paisa: counted });
    }
    await r.spooler.pump();
    expect(r.sent.length, "no day summary was transmitted").toBeGreaterThan(0);
    return textOf(r.sent[r.sent.length - 1] as Uint8Array);
  };

  it("THE DEFECT VERBATIM: the deposit reaches the paper because it is appended FIRST", async () => {
    // Reproduced on this rig with `order: "close-first"` — the shipped emission order before the
    // fix: the `days` row carried `deposit_paisa: 610200` and the slip printed `Deposit Rs 0`,
    // two rows from `Counted cash Rs 6,102`, on the document a manager reconciles against the
    // bank. Nothing was wrong with the ledger, the fold or the printer: the document was assembled
    // from a projection that was one append behind its own act.
    const r = rig();
    const { day_id } = aDay(r);
    const text = await closeAndPrint(r, day_id, 610_200, "deposit-first");
    expect(r.store.days().find((row) => row.day_id === day_id)?.deposit_paisa).toBe(610_200);
    expect(text).toContain("Deposit Rs 6,102");
    expect(text).toContain("Counted cash Rs 6,102");
  });

  it("the CONTROL: with the pre-fix order the same rig prints Rs 0 against the same day row", async () => {
    // The attribution. This is the defect, driven deliberately, so that the assertion above is
    // known to be measuring the ORDER of the two appends and not something else about the rig.
    const r = rig();
    const { day_id } = aDay(r);
    const text = await closeAndPrint(r, day_id, 610_200, "close-first");
    expect(r.store.days().find((row) => row.day_id === day_id)?.deposit_paisa).toBe(610_200);
    expect(text).toContain("Deposit Rs 0");
  });

  it("02-F43/02-F24: a channel with UNDATED money is not left reading Rs 0 alone", async () => {
    // `01-F17` lets a cashier settle an order that never went to the kitchen — a bill rung after
    // the food went out — so it carries no delivered branch stamp and `01-F46` can date nothing
    // about it. Before this, the slip printed `Phone Rs 0` five rows above the aggregate that
    // held its money.
    const r = rig();
    const { day_id, shift_id } = aDay(r);

    const dated = newId();
    r.append("order.created", { order_id: dated, channel: "counter", order_type: "dine_in" });
    line(r, dated, "l-karahi", "i-karahi", 45_000);
    edge(r, dated, ["l-karahi"], "confirmed", "placed");
    r.append("order.confirmed", { order_id: dated });
    settle(r, dated, billedOf(r, dated), shift_id);

    const undated = newId();
    r.append("order.created", { order_id: undated, channel: "phone", order_type: "takeaway" });
    line(r, undated, "l-p1", "i-karahi", 89_300);
    settle(r, undated, 89_300, shift_id);

    await closeAndPrint(r, day_id, 610_200, "deposit-first");
    const rows = rowsOf(r.sent[r.sent.length - 1] as Uint8Array);
    expect(
      r.store.openOrders().find((row) => row.order_id === undated)?.confirmed_at,
      "the phone order is undated — that is the premise, not the defect",
    ).toBeNull();
    expect(rows).toContain("Counter Rs 450");
    expect(rows).toContain("Undated sales so far Rs 893");
    expect(rows).toContain("Undated Phone Rs 893");
    // `01-F45` — the money is NAMED, never DATED. The phone CHANNEL row stays at zero, and the
    // two figures are never added together anywhere on this paper.
    expect(rows).toContain("Phone Rs 0");
    expect(rows).not.toContain("Phone Rs 893");
    expect(rows.join("\n")).not.toContain("Rs 1,343");
  });

  it("02-F43: two undated channels are each named, and they sum to the aggregate", async () => {
    // The breakdown decomposes the aggregate and never replaces it. With money on two channels a
    // reader can see which is which, and the row above them still carries the figure she adds.
    //
    // ⚠ **THE CHANNEL OUTSIDE `02-F42`'s CLOSED SET IS UNTESTABLE THROUGH THIS DOOR AND THAT IS
    // REPORTED RATHER THAN WORKED AROUND.** The walk keeps such an order in the aggregate and
    // buckets it nowhere — deliberately, so the breakdown can be short of the aggregate but never
    // over it — and the branch is unreachable from a real store: `order.created.channel` is a
    // closed `z.enum` in `packages/domain`'s registry, so `parseEvent` refuses the append. A test
    // that reached it would have to stub the store, which is exactly the hand-copy this file
    // exists to avoid. The defensive `?.` stays and is honestly unasserted.
    const r = rig();
    const { day_id, shift_id } = aDay(r);
    for (const [channel, price] of [
      ["phone", 89_300],
      ["whatsapp", 12_300],
    ] as const) {
      const order_id = newId();
      r.append("order.created", { order_id, channel, order_type: "takeaway" });
      line(r, order_id, "l-1", "i-karahi", price);
      settle(r, order_id, price, shift_id);
    }
    await closeAndPrint(r, day_id, 0, "deposit-first");
    const rows = rowsOf(r.sent[r.sent.length - 1] as Uint8Array);
    expect(rows).toContain("Undated sales so far Rs 1,016");
    expect(rows).toContain("Undated orders so far 2");
    expect(rows).toContain("Undated Phone Rs 893");
    expect(rows).toContain("Undated WhatsApp Rs 123");
    for (const label of ["Counter", "Storefront", "Foodpanda"]) {
      expect(rows, `${label} took money it never saw`).toContain(`Undated ${label} Rs 0`);
    }
  });

  it("02-F24: the business date on the paper is the fold's, and the day row is this day's", async () => {
    // A cheap guard on the rig itself: if the fixture ever stopped landing inside `BUSINESS_DATE`
    // the assertions above would pass vacuously with every figure at zero.
    const r = rig();
    const { day_id } = aDay(r);
    const text = await closeAndPrint(r, day_id, 610_200, "deposit-first");
    expect(text).toContain(`DAY SUMMARY ${BUSINESS_DATE}`);
    expect(r.store.days().find((row) => row.day_id === day_id)?.business_date).toBe(BUSINESS_DATE);
  });
});
