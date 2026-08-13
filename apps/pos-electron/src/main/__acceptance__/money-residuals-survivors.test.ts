// `01-F63` / `02-F48` — **THE FIVE MUTANTS THAT SURVIVED THE ADVERSARIAL PASS.**
//
// **PROVENANCE, stated first because it decides how these assertions should be weighed.** This
// file was written by the **mutation-testing session**, not by the implementer and not by the
// `24 §3` test author who wrote `settlement-closing-act.test.ts` and `zero-tender.test.ts` from
// spec text. It exists for the reason the round-3 law gives: a 42-mutant matrix over the shipped
// `01-F63`/`02-F48` work killed 37 and **five survived at 906/906 and 329/329**, and a surviving
// mutant on a money attestation is not something to report and move past. Each section below names
// its mutant, states why the assertion that was *supposed* to catch it could not, and is itself
// mutation-proved: with the mutant applied it FAILS, with the shipped code it PASSES, and two
// semantics-preserving negative controls leave it green.
//
// It owes the same independent oracle pass every non-spec-authored suite in this repo owes.
//
// ── THE FIVE, AND WHY READING THE SUITE WOULD NOT HAVE FOUND ANY OF THEM ───────────────────────
//
//  M22  `billed_paisa` re-summed off `json_lines` instead of taken from the engine's
//       `billedEffectiveFromJsonLines`. **No fixture in either suite carries a LINE EXIT**, so a
//       naive `Σ qty × unit_price` is byte-identical on every existing test. §A.
//  M23  `openOrders().find(row => row.order_id === order_id)` → `openOrders()[0]`. **No fixture
//       anywhere holds two open orders**, so the line that decides WHICH bill is permanently
//       closed is unasserted. §B.
//  M15  `.sort()` dropped from `coveringAttemptIds`. §D's reversed-delivery test claims this
//       mutant by name and cannot catch it: `pay_attempts_json` is written through
//       `canonicalJson`, which sorts object keys, so the convergence it measures is the FOLD's
//       and not the emitter's. §C.
//  M26  the host driving `<binding>.settled(order_id)` TWICE off one append. The seam assertion
//       is `toContain`, which cannot count. §E.
//  M28  `amount_paisa === 0` widened to `<= 0`. The module argues for `=== 0` in prose — a
//       negative amount is malformed, not "nothing" — and nothing asserted it. §F.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  billedEffectiveFromJsonLines,
  type DeviceStore,
  type OpenOrderRow,
  openStore,
} from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import type { AppendResult } from "../../shared/ipc";
import type { Gateway } from "../gateway";
import { closingActFor, createSettlementCloser } from "../settlement-closer";
import type { RendererWrites } from "../settlement-guard";
import { refuseZeroTender } from "../zero-tender-guard";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const TILL = "00000000-0000-7000-8000-000000000003";
const ORDER_1 = "0199aaaa-0000-7000-8000-00000000a001";
const ORDER_2 = "0199aaaa-0000-7000-8000-00000000a002";
const BILL_PAISA = 224_000;

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Fixture = {
  store: DeviceStore;
  raw: (type: string, payload: Record<string, unknown>) => void;
  /** Everything the closer appended, as payloads, landed into the same store. */
  emitted: Record<string, unknown>[];
  close: (order_id: string) => void;
};

const fixture = (): Fixture => {
  const dir = mkdtempSync(join(tmpdir(), "restos-survivors-"));
  dirs.push(dir);
  const store = openStore({
    path: join(dir, "device.db"),
    identity: { org_id: ORG, branch_id: BRANCH, device_id: TILL },
  });
  let n = 0;
  const raw = (type: string, payload: Record<string, unknown>): void => {
    n += 1;
    store.append({
      id: `0199cccc-0000-7000-8000-${String(n).padStart(12, "0")}`,
      org_id: ORG,
      branch_id: BRANCH,
      device_id: TILL,
      actor_user_id: "user-ayesha",
      device_created_at: 1_754_300_000_000 + n,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
  };
  const emitted: Record<string, unknown>[] = [];
  const writes: Pick<Gateway, "append"> = {
    append: (req: unknown): AppendResult => {
      const r = req as { type: string; payload: Record<string, unknown> };
      emitted.push(r.payload);
      raw(r.type, r.payload);
      return { id: `closed-${emitted.length}` };
    },
  };
  const closer = createSettlementCloser({ store, writes });
  return { store, raw, emitted, close: (order_id) => closer.settled(order_id) };
};

const line = (order_id: string, line_id: string, unit_price_paisa: number) => ({
  order_id,
  line_id,
  item_id: `i-${line_id.slice(-4)}`,
  qty: 1,
  unit_price_paisa,
});

const tender = (order_id: string, amount_paisa: number, key: string) => ({
  order_id,
  amount_paisa,
  method: "cash",
  settlement_attempt_id: key,
  purpose: "settles_order",
  shift_id: null,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — M22. THE ATTESTED CEILING IS THE ENGINE'S BILLED, NOT A RE-SUM OF THE LINES.
//
// `01-F30`: billed derives from delivered lines, **exited lines excluded** — *"a fully-voided
// order nets to zero"*, which `billedCellPaisa` implements and `01 §4`'s `voided`/`cancelled`
// exit states are the only vocabulary for. `Σ qty × unit_price` over `json_lines` is the obvious
// first draft, it is what a reader writes when the helper is one import away, and it is identical
// to the correct answer on **every fixture in both suites**, because none of them exits a line.
//
// The consequence is not cosmetic. `merge.ts` reads `billed_paisa` back as `uncovered_addition`'s
// ceiling (`01-F33`: *"a late line-add raises `uncovered_addition` rather than reopening"*), so an
// inflated ceiling silently swallows the exception that is the ONLY signal a settled bill grew.
// Both halves are asserted, because the first alone would let a reader think this is a rounding
// quibble about a field nobody reads.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F63 / 01-F30 — a VOIDED line is not billed, and the attested ceiling knows it", () => {
  const withVoidedLine = (): Fixture => {
    const f = fixture();
    f.raw("order.created", { order_id: ORDER_1, channel: "counter", order_type: "takeaway" });
    f.raw("order.line_added", line(ORDER_1, "0199aaaa-0000-7000-8000-00000000ff01", BILL_PAISA));
    f.raw("order.line_added", line(ORDER_1, "0199aaaa-0000-7000-8000-00000000ff02", 50_000));
    // The naan is voided before it is cooked. `01 §4`: `placed → voided` is a legal exit.
    f.raw("order.line_state_changed", {
      order_id: ORDER_1,
      line_ids: ["0199aaaa-0000-7000-8000-00000000ff02"],
      state: "voided",
      line_context: {
        "0199aaaa-0000-7000-8000-00000000ff02": {
          to: "voided",
          from_states: ["placed"],
          preds: [],
        },
      },
    });
    return f;
  };

  it("attests the ENGINE's billed_effective, not the sum of the lines", () => {
    const f = withVoidedLine();
    const row = f.store.openOrders().find((o) => o.order_id === ORDER_1);
    expect(
      billedEffectiveFromJsonLines(row?.json_lines ?? "{}"),
      "the fixture did not actually void the line — this section would then be vacuous",
    ).toBe(BILL_PAISA);

    f.raw("payment.recorded", tender(ORDER_1, BILL_PAISA, "0199aaaa-0000-7000-8000-00000000c0a1"));
    f.close(ORDER_1);

    expect(f.emitted).toHaveLength(1);
    // A re-sum reads 274000: the voided naan attested as if it had been sold.
    expect(f.emitted[0]?.billed_paisa).toBe(BILL_PAISA);
  });

  it("01-F33 — and a LATE line-add on that order still raises `uncovered_addition`", () => {
    // THE MONEY CONSEQUENCE. With a ceiling of 274000 instead of 224000, Rs 300 added after the
    // close sits under it and the exception never fires — measured, not argued: the re-sum mutant
    // leaves `exceptions_json` EMPTY here.
    const f = withVoidedLine();
    f.raw("payment.recorded", tender(ORDER_1, BILL_PAISA, "0199aaaa-0000-7000-8000-00000000c0a1"));
    f.close(ORDER_1);
    f.raw("order.line_added", line(ORDER_1, "0199aaaa-0000-7000-8000-00000000ff03", 30_000));

    const row = f.store.openOrders().find((o) => o.order_id === ORDER_1);
    expect(JSON.parse(row?.exceptions_json ?? "[]")).toContain("uncovered_addition");
    expect(row?.settled, "a late line-add reopened the order").toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — M23. THE CLOSER CLOSES THE ORDER IT WAS ASKED ABOUT.
//
// `Counter.tsx:508` binds `current = orders.find(o => o.order_id === cartOrderId) ?? orders[0]`.
// That `find` is `DEC-MONEY-009`'s contributing defect fixed — *"there is no way to start a second
// order … two cashiers serving two customers ring into one bill"* — so a real counter holds more
// than one open order, and every fixture in both `01-F63` suites holds exactly one. Under
// `openOrders()[0]` the whole existing suite is green while a till with two bills open either
// closes the wrong one, on the wrong snapshot, or closes nothing at all. Both directions are
// asserted, because they are different failures and only one of them is visible on a screen.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F63 — two OPEN orders, and the act names the right bill", () => {
  const twoOpenOrders = (): Fixture => {
    const f = fixture();
    for (const [i, order_id] of [ORDER_1, ORDER_2].entries()) {
      f.raw("order.created", { order_id, channel: "counter", order_type: "takeaway" });
      f.raw(
        "order.line_added",
        line(order_id, `0199aaaa-0000-7000-8000-0000000ff1${i}`, i === 0 ? 100_000 : BILL_PAISA),
      );
    }
    expect(f.store.openOrders(), "the fixture does not hold two open orders").toHaveLength(2);
    return f;
  };

  it("settling the SECOND bill closes the second bill and leaves the first owed", () => {
    const f = twoOpenOrders();
    f.raw("payment.recorded", tender(ORDER_2, BILL_PAISA, "0199aaaa-0000-7000-8000-00000000c0a2"));
    f.close(ORDER_2);

    expect(f.emitted, "the settled bill was never closed").toHaveLength(1);
    expect(f.emitted[0]?.order_id).toBe(ORDER_2);
    expect(f.emitted[0]?.billed_paisa).toBe(BILL_PAISA);
    const rows = f.store.openOrders();
    expect(rows.find((o) => o.order_id === ORDER_2)?.settled).toBe(1);
    expect(
      rows.find((o) => o.order_id === ORDER_1)?.settled,
      "an unpaid bill was permanently settled (01-F1 — there is no way back)",
    ).toBe(0);
  });

  it("and settling the FIRST does not close the second, whichever way the rows are ordered", () => {
    // The mirror image, and the one that closes the wrong order rather than none: with the first
    // row covered, an implementation reading `openOrders()[0]` gets the right answer here by luck.
    // Asserted so the pair cannot be satisfied by a lookup that happens to agree once.
    const f = twoOpenOrders();
    f.raw("payment.recorded", tender(ORDER_1, 100_000, "0199aaaa-0000-7000-8000-00000000c0a3"));
    f.close(ORDER_1);

    expect(f.emitted).toHaveLength(1);
    expect(f.emitted[0]?.order_id).toBe(ORDER_1);
    expect(f.emitted[0]?.billed_paisa).toBe(100_000);
    expect(
      f.store.openOrders().find((o) => o.order_id === ORDER_2)?.settled,
      "a bill nobody has paid for was closed",
    ).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — M15. THE EMITTER'S OWN SORT, MEASURED WITHOUT THE FOLD IN THE WAY.
//
// `settlement-closing-act.test.ts` §D says of its reversed-delivery test: *"MUTATION THIS CATCHES:
// `settlement_attempt_ids` built in insertion/delivery order instead of sorted"*. **It does not.**
// `merge.ts:1206` writes `pay_attempts_json` through `canonicalJson`, which sorts object keys, so
// the map handed to `coveringAttemptIds` is already in ascending key order however the events
// arrived — and dropping `.sort()` is byte-identical through that path. Measured: M15 survives at
// 906/906. §D is not wrong about convergence; it is measuring the FOLD's canonicalisation and
// attributing it to the emitter, which is the round-3 law's "aimed at the wrong case" exactly.
//
// The fix is to stop going through the fold. `closingActFor` is exported *"so a suite can drive
// the branch directly"* (`settlement-closer.ts`) and **had zero test callers** — a symbol exported
// so a test could assert it, with no test asserting it, which is blind spot (i) of the three
// `seams:check` cannot see, in the same module whose comment cites `K-3`'s dead oracle as the
// reason for the export.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F34 — the attested keys are sorted BY THE EMITTER", () => {
  /** A row exactly as the fold hands one over, except that its attempt keys are DESCENDING. */
  const rowWithKeyOrder = (keys: readonly string[]): OpenOrderRow => ({
    order_id: ORDER_1,
    channel: "counter",
    order_type: "takeaway",
    confirmed_at: null,
    settled: 0,
    table_ids_json: "[]",
    table_conflict: 0,
    pay_total: 224_000,
    repaid_total: 0,
    refund_total: 0,
    // Written as a STRING, in this exact order: `JSON.parse` preserves the insertion order of
    // string keys, which is the whole mechanism under test. Building it from an object literal
    // and stringifying would let the source's own key order decide the fixture.
    pay_attempts_json: `{${keys
      .map((k) => `"${k}":[{"amount_paisa":112000,"method":"cash","purpose":"settles_order"}]`)
      .join(",")}}`,
    refund_attempts_json: "{}",
    cap_violated: 0,
    exceptions_json: "[]",
    json_lines: JSON.stringify({
      "line-a": { item_id: "i-a", qty: 1, unit_price_paisa: BILL_PAISA, states: ["placed"] },
    }),
  });

  const ASC = ["0199aaaa-0000-7000-8000-0000000000a1", "0199aaaa-0000-7000-8000-0000000000b2"];

  it("a DESCENDING attempt map still attests ascending keys", () => {
    const descending = closingActFor(rowWithKeyOrder([...ASC].reverse()));
    expect(descending, "the fixture did not produce an act at all").not.toBeNull();
    expect(descending?.settlement_attempt_ids).toEqual(ASC);
  });

  it("and the act is byte-identical whichever order the map arrived in", () => {
    // The `01-F34` property stated over the emitter's real input rather than over a store: equal
    // SET of attempts ⇒ byte-equal act, with no canonicalising layer between the fixture and the
    // branch being measured.
    expect(JSON.stringify(closingActFor(rowWithKeyOrder([...ASC].reverse())))).toBe(
      JSON.stringify(closingActFor(rowWithKeyOrder(ASC))),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — M26. THE HOST DRIVES THE ACT EXACTLY ONCE.
//
// `settlement-closer-seam.test.ts` §B asserts the call is present with `toContain`, which cannot
// count, and asserts the FACTORY is constructed exactly once with a `match(...)` length check —
// so two constructions red and two calls do not. Duplicating the line survives at 906/906.
//
// It is behaviourally inert TODAY and that is precisely why it needs pinning: the second call is a
// no-op only because `gateway.append` projects synchronously before it returns, which is a
// property of a different module that nothing here declares. `01-F1` makes the failure permanent
// if that ever stops being true, and `01-F63`'s own words are **"at most one per order"**.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F63 / 01-F1 — the closing-act call site appears exactly once", () => {
  const mainSrc = readFileSync(new URL("../index.ts", import.meta.url).pathname, "utf8");

  it("is actually reading main/index.ts", () => {
    // The `24-F14` empty-match guard: a scanner over an empty string reports clean.
    expect(mainSrc).toContain("app.whenReady()");
    expect(mainSrc.length).toBeGreaterThan(20_000);
  });

  it("exactly one call, in the whole file", () => {
    // Anchored on a form that only appears as CODE — the binding, a dot, the method, its argument.
    // `settlement-closer-seam.test.ts`'s header records why that matters: a mutant deleting a call
    // once survived because the assertion matched the same token written in PROSE nearby.
    expect(mainSrc.match(/\bcloser\.settled\(order_id\)/g) ?? []).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — M28. `=== 0`, NOT `<= 0`, AND THE REASON IS THE MESSAGE.
//
// `zero-tender-guard.ts` argues the comparison in prose — *"a negative amount is not 'nothing', it
// is malformed: `registry.ts` makes `amount_paisa` a non-negative integer, so `parseEvent` refuses
// it downstream with its own reason. Widening this comparison would take a second, different
// refusal under this FR's name"* — and nothing asserted it. Widening to `<= 0` survives at 906/906.
//
// This is the same defect `zero-tender.test.ts` §A already refuses in the other direction (a
// refusal that cannot be told apart from `DEC-MONEY-009`'s), one comparison operator over: under
// `<= 0` a malformed −Rs 5 tender is refused with *"amount_paisa is 0, so this tender is worth
// nothing"*, which is a false statement about the request (`00 §5.7`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F48 — a NEGATIVE amount is malformed, not nothing", () => {
  const passthrough = (): { guard: RendererWrites; seen: unknown[] } => {
    const seen: unknown[] = [];
    return {
      seen,
      guard: refuseZeroTender({
        writes: {
          append: (req: unknown): AppendResult => {
            seen.push(req);
            return { id: "passed-through" };
          },
          addLine: () => ({ id: "unused" }),
          toggleAvailability: () => ({ id: "unused" }),
          recordCustomer: () => ({ id: "unused" }),
        },
      }),
    };
  };

  const request = (amount_paisa: number) => ({
    type: "payment.recorded",
    payload: tender(ORDER_1, amount_paisa, "0199aaaa-0000-7000-8000-00000000c0a4"),
    refs: [] as string[],
  });

  it("passes a NEGATIVE amount through to the validator that owns it", () => {
    // Over an inert sink, exactly as `zero-tender.test.ts` §D's malformed-request assertion does:
    // this is about what the GUARD does with it, and a real store would throw from the schema.
    const { guard, seen } = passthrough();
    expect(() => guard.append(request(-500))).not.toThrow();
    expect(seen, "a malformed amount was refused under 02-F48's name").toHaveLength(1);
  });

  it("still refuses exactly zero — the negative control for the line above", () => {
    // Without this, deleting the whole guard would satisfy the assertion above.
    const { guard, seen } = passthrough();
    expect(() => guard.append(request(0))).toThrow(/02-F48/);
    expect(seen).toHaveLength(0);
  });
});
