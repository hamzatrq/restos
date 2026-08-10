// ACCEPTANCE TESTS — `02-F31`'s line auto-advance, and `00 §7`'s hardware tier under it.
//
// PROVENANCE (24 §3 step 2), stated rather than glossed: authored and implemented by the same
// session. The mitigation is the round-3 law and not a claim of independence — every assertion
// below was mutation-tested against a CONTROL differing in exactly one branch, and the matrix is
// in the session report. Where an assertion could pass vacuously it is anchored on something the
// implementation cannot also supply: §C folds every emitted payload through the REAL merge engine
// in a REAL store and reads the projection back, so a payload that satisfies this module's own
// idea of an edge and not the kernel's fails there rather than here.
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   02-F31  "T1 mode — the entire restaurant runs on this one device: detection: the branch
//           device registry contains no pass/KDS/waiter device; … line statuses auto-advance
//           where no device exists to signal them: `kot.printed` → lines `in_prep`; settlement →
//           lines `served` — dine-in/takeaway/pickup only. Delivery lines are NEVER advanced by
//           settlement … no `ready` state is fabricated."
//   01 §4   the canonical chain `placed → confirmed → in_prep → ready →` terminal service state,
//           and `packages/domain/src/states.ts`'s `LEGAL_NEXT` encoding of it.
//   01-F34  a fold reads NO ordering metadata; an edge's legality is a pure function of its own
//           payload (`from_states` → `to`), never of comparator position.
//   01-F35  terminal-state monotonicity; the ignored event is retained and flagged.
//   01-F31  a fold never picks a winner — a contested cell renders its whole MVR set.
//   01-F62  `device.registered`/`device.revoked` are ORG-scoped: "it never enters a branch stream
//           and no device folds it" — the reason `02-F31`'s detection rule cannot run here.
//   00 §7   layer 2 carries "hardware tier (T1/T2/T3)"; layer 3's `panel_ppi` is the precedent
//           for measurement-first-with-config-as-correction.
//
// ⚠ WHAT THIS SUITE DOES NOT CLAIM.
//  1. ~~**`02-F31`'s settlement → `served` half is not built**~~ — **BUILT (August 2026).**
//     `DEC-HW-002` ruled `LEGAL_NEXT.in_prep` gains `served`, and §E–§H cover the half that used
//     to be refused. The three assertions that pinned the refusal were INVERTED rather than
//     deleted; §E's header says exactly what each one said before.
//  2. ~~**The delivery exclusion is untested because it is unreachable**~~ — **§F, and it is the
//     section to read first.** It is a producer-side ALLOWLIST and not a legality rule: `01 §4`
//     sends delivery down `picked_up → delivered`, and a delivery line at `ready` could reach
//     `served` perfectly legally, so `LEGAL_NEXT` cannot express it. §F's fixtures are identical
//     on every other axis so a refusal can only be about `order_type`.
//  2b. **What is still NOT claimed here: `preds`.** The settlement edge ships `preds: []` and the
//     fold therefore flags the two edges it supersedes `terminal_regression`. §H pins that as a
//     MEASURED fact rather than hiding it — the state is right, the flag is derived, and closing
//     it needs head ids on a `sync-client` cell shape. Owed, not done.
//  3. **The tier is `assumed`, never `derived`, on any real device today.** `tierFromRoster` is
//     tested against rosters no host can currently produce; that is the point of testing it.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LEGAL_NEXT } from "@restos/domain";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  autoAdvancesLines,
  describeHardwareTier,
  HARDWARE_TIERS,
  resolveHardwareTier,
  tierFromRoster,
} from "../hardware-tier";
import { advanceEdgesFor, createLineAdvance, type LineStateChangedPayload } from "../line-advance";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const LINE_A = "0199aaaa-0000-7000-8000-00000000ff01";
const LINE_B = "0199aaaa-0000-7000-8000-00000000ff02";

/** One `open_orders` row, shaped as `merge.ts` projects it — only `json_lines` is read. */
const orderWith = (cells: Record<string, { states: string[] }>) => ({
  order_id: ORDER_ID,
  json_lines: JSON.stringify(
    Object.fromEntries(
      Object.entries(cells).map(([id, c]) => [
        id,
        { item_id: "i-karahi", qty: 1, unit_price_paisa: 45_000, states: c.states },
      ]),
    ),
  ),
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — `02-F31`'s DETECTION RULE, and the honest admission that it cannot run.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F31/00 §7 — the tier", () => {
  it("is T1 exactly when the registry holds no pass/KDS/waiter device", () => {
    // `02-F31`'s rule is stated as a negation and is tested as one, over `01-F39`'s vocabulary.
    expect(tierFromRoster(["counter_electron"])).toBe("T1");
    expect(tierFromRoster(["counter_electron", "counter_rn"])).toBe("T1");
    // `manager` and `rider` are NOT among the three nouns `02-F31` names, so neither lifts the
    // tier. This is the one place this module reads `02-F31` more narrowly than
    // `restaurant-os.md:47`'s prose (which lists a manager console among T3's characteristics),
    // and the choice is argued in `hardware-tier.ts`.
    expect(tierFromRoster(["counter_electron", "manager", "rider"])).toBe("T1");
    // `kitchen` is 01-F39's own name for "pass screen / KDS station, doc 03".
    expect(tierFromRoster(["counter_electron", "kitchen"])).toBe("T2");
    expect(tierFromRoster(["counter_electron", "waiter"])).toBe("T3");
    // A waiter outranks a kitchen — `restaurant-os.md:47` puts handhelds at T3.
    expect(tierFromRoster(["counter_electron", "kitchen", "waiter"])).toBe("T3");
  });

  it("prefers a reachable registry over the config key, and says which it used", () => {
    // The derivation OUTRANKS the key, which is the one place this inverts `panel_ppi`'s order
    // (there the config is a correction to a measurement that is normally present; here `02-F31`
    // states the detection rule as the definition). A stale env var on one till must not
    // contradict a registry that says a pass screen exists.
    expect(
      resolveHardwareTier({ roster: ["counter_electron", "kitchen"], configured: "T1" }),
    ).toEqual({ tier: "T2", source: "derived" });
    expect(resolveHardwareTier({ roster: null, configured: "T3" })).toEqual({
      tier: "T3",
      source: "configured",
    });
  });

  it("assumes T1 when neither answers, and a junk key is refused rather than coerced", () => {
    expect(resolveHardwareTier({ roster: null, configured: undefined })).toEqual({
      tier: "T1",
      source: "assumed",
    });
    // A typo must fall through to the assumption rather than stop the till (`01-F17`) or silently
    // become something. `t2`, `2`, `T4` and an empty string are all not tiers.
    for (const junk of ["t2", "2", "T4", "", "T1 "]) {
      expect(resolveHardwareTier({ roster: null, configured: junk }).source).toBe("assumed");
    }
    // …and every legal value IS accepted, so the loop above cannot pass by refusing everything.
    for (const tier of HARDWARE_TIERS) {
      expect(resolveHardwareTier({ roster: null, configured: tier })).toEqual({
        tier,
        source: "configured",
      });
    }
  });

  it("00 §5.7 — the assumed boot line names the consequence AND the correction", () => {
    const line = describeHardwareTier({ tier: "T1", source: "assumed" });
    // Being wrong here looks exactly like being right, so the line has to carry three things: the
    // value, that it is a guess, and what to do about it. Asserted individually because a single
    // snapshot would let any one of them be dropped in a reword.
    expect(line).toContain("T1");
    expect(line).toContain("assumed");
    expect(line).toContain("RESTOS_HARDWARE_TIER");
    // The reason, so an operator is not told to set a variable without being told why.
    expect(line).toContain("02-F31");
    // A derived or configured tier is NOT lectured at.
    expect(describeHardwareTier({ tier: "T2", source: "derived" })).not.toContain(
      "RESTOS_HARDWARE_TIER",
    );
  });

  it("02-F31 — only T1 auto-advances", () => {
    expect(autoAdvancesLines("T1")).toBe(true);
    expect(autoAdvancesLines("T2")).toBe(false);
    expect(autoAdvancesLines("T3")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE EDGE POLICY. A pure function of the projection, so every rule is arguable.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F34/01-F35 — advanceEdgesFor builds edges, never values", () => {
  it("moves every placed line to confirmed, declaring the state it leaves", () => {
    const payload = advanceEdgesFor(
      orderWith({ [LINE_A]: { states: ["placed"] }, [LINE_B]: { states: ["placed"] } }),
      "confirmed",
    ) as LineStateChangedPayload;
    expect(payload.order_id).toBe(ORDER_ID);
    expect(payload.state).toBe("confirmed");
    // `from_states` is what the FOLD projects, not an assumption — that is the difference between
    // an edge and a value (`01-F34`), and legality is judgeable only from it.
    expect(payload.line_context[LINE_A]).toEqual({
      to: "confirmed",
      from_states: ["placed"],
      preds: [],
    });
    // `line_ids` is `registry.ts`'s legacy field; it must agree with `line_context` or the two
    // halves of one event describe different lines.
    expect([...payload.line_ids].sort()).toEqual(Object.keys(payload.line_context).sort());
  });

  it("emits nothing rather than an ILLEGAL edge — the fold would keep it for ever", () => {
    // `LEGAL_NEXT.confirmed` excludes `confirmed`, so a second confirm has nothing to do. An
    // implementation that emitted anyway would write an `illegal_transition` into an append-only
    // ledger (`01-F1`) on every duplicate trigger.
    expect(
      advanceEdgesFor(orderWith({ [LINE_A]: { states: ["confirmed"] } }), "confirmed"),
    ).toBeNull();
    // The same property is what makes the second and third station's `kot.printed` harmless
    // (`03-F2` fans one confirm out to N tickets and the payload carries no station).
    expect(advanceEdgesFor(orderWith({ [LINE_A]: { states: ["in_prep"] } }), "in_prep")).toBeNull();
    // A terminal line is never re-opened (`01-F35`).
    expect(advanceEdgesFor(orderWith({ [LINE_A]: { states: ["voided"] } }), "in_prep")).toBeNull();
  });

  it("advances only the ELIGIBLE lines of a mixed order, and leaves the rest alone", () => {
    const payload = advanceEdgesFor(
      orderWith({
        [LINE_A]: { states: ["confirmed"] },
        [LINE_B]: { states: ["voided"] },
      }),
      "in_prep",
    ) as LineStateChangedPayload;
    // A voided line must not be dragged along by an order-level trigger — this is the assertion
    // that separates "advance the order" from "advance the lines `02-F31` names".
    expect(Object.keys(payload.line_context)).toEqual([LINE_A]);
  });

  it("01-F31 — a CONTESTED line is left alone; a fold never picks a winner and nor does this", () => {
    // `merge.ts` renders a contested line as its full terminal MVR set, so today every contested
    // cell is refused twice over — by the arity guard AND by the legality filter, since every
    // member is terminal and `LEGAL_NEXT` maps a terminal to `[]`.
    //
    // ⚠ **THIS ASSERTION ALONE DOES NOT DISCRIMINATE, and it was measured rather than assumed.**
    // Mutant M8 (`states.length !== 1` weakened to `=== 0`) left all 469 tests green, because the
    // legality filter catches this fixture on its own. That is the round-3 shape — a guard aimed
    // one case away from the dangerous one — so the NEXT assertion is the one that bites.
    expect(
      advanceEdgesFor(orderWith({ [LINE_A]: { states: ["served", "voided"] } }), "in_prep"),
    ).toBeNull();
  });

  it("01-F31 — a multi-state cell is refused EVEN WHEN a member would advance legally", () => {
    // A two-element set containing a non-terminal is a shape `merge.ts` does not produce today
    // (`states` is the terminal MVR set when contested and a single watermark otherwise). It is
    // asserted anyway, and this is the one place this suite deliberately tests a shape the current
    // fold cannot emit: `merge.ts` is a PROTECTED path this work does not own, `states` is typed
    // `string[]`, and an emitter that reached for `states[0]` on a set would be picking a winner —
    // which is precisely what `01-F31` says a reader may never do.
    //
    // This is what kills M8. Without the arity guard `states[0]` is `confirmed`, `confirmed →
    // in_prep` is legal, and the emitter advances a line whose state is disputed.
    expect(
      advanceEdgesFor(orderWith({ [LINE_A]: { states: ["confirmed", "placed"] } }), "in_prep"),
    ).toBeNull();
    // Not vacuous: the SAME cell with the contest resolved DOES advance.
    expect(
      advanceEdgesFor(orderWith({ [LINE_A]: { states: ["confirmed"] } }), "in_prep"),
    ).not.toBeNull();
  });

  it("01-F17 — an empty state array is skipped, never a crash on the confirm that triggered it", () => {
    // Also a shape no fold produces; `applyLineState(undefined, …)` would throw inside a handler
    // the operator cannot get out of, and the append that triggered this has already landed.
    expect(advanceEdgesFor(orderWith({ [LINE_A]: { states: [] } }), "confirmed")).toBeNull();
  });

  it("an order with no lines yields no event at all", () => {
    expect(advanceEdgesFor({ order_id: ORDER_ID, json_lines: "{}" }, "confirmed")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE REAL FOLD. This is the section that cannot pass vacuously: every payload above is
// appended through a REAL `sync-client` store and the projection is read back out.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const IDENTITY = {
  org_id: "00000000-0000-7000-8000-000000000001",
  branch_id: "00000000-0000-7000-8000-000000000002",
  device_id: "00000000-0000-7000-8000-000000000003",
};

type Appended = { type: string; payload: LineStateChangedPayload };

/** A store seeded with one two-line order, plus the emitter wired to append into it for real. */
const rig = (
  opts: {
    tier?: "T1" | "T2" | "T3";
    idPrefix?: string;
    clock?: number;
    /** `01 §4`'s service-mode axis — the one input the delivery exclusion reads. */
    orderType?: string;
  } = {},
) => {
  const dir = mkdtempSync(join(tmpdir(), "restos-line-advance-"));
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const prefix = opts.idPrefix ?? "0199bbbb";
  const clock = opts.clock ?? 1_754_300_000_000;
  let n = 0;
  const put = (type: string, payload: Record<string, unknown>): string => {
    n += 1;
    const id = `${prefix}-0000-7000-8000-${String(n).padStart(12, "0")}`;
    store.append({
      id,
      ...IDENTITY,
      actor_user_id: "u-cashier",
      device_created_at: clock + n,
      type,
      schema_version: 1,
      payload,
      refs: [],
    });
    return id;
  };
  put("order.created", {
    order_id: ORDER_ID,
    channel: "counter",
    order_type: opts.orderType ?? "dine_in",
  });
  for (const line_id of [LINE_A, LINE_B]) {
    put("order.line_added", {
      order_id: ORDER_ID,
      line_id,
      item_id: "i-karahi",
      qty: 1,
      unit_price_paisa: 45_000,
    });
  }
  const appended: Appended[] = [];
  const lines = createLineAdvance({
    store,
    tier: () => opts.tier ?? "T1",
    append: (type, payload) => {
      appended.push({ type, payload });
      put(type, payload as unknown as Record<string, unknown>);
    },
  });
  const cells = (): Record<string, { states: string[]; anomalies?: Record<string, string> }> => {
    const row = store.openOrders().find((r) => r.order_id === ORDER_ID);
    return JSON.parse((row as { json_lines: string }).json_lines);
  };
  /**
   * Tender the whole bill through a REAL `payment.recorded`, so `pay_total` is the fold's own
   * `01-F31` keyed sum rather than a number this test typed onto a stub row. Two lines at
   * Rs 450 = 90_000 paisa; `02-F37`'s null shift is the honest value here (no shift is open).
   */
  const payFull = (): void => {
    put("payment.recorded", {
      order_id: ORDER_ID,
      amount_paisa: 90_000,
      method: "cash",
      settlement_attempt_id: `${prefix}-attempt-1`,
      shift_id: null,
      purpose: "settles_order",
    });
  };
  return { store, dir, lines, appended, cells, payFull };
};

describe("§C 01 §4 — the kernel accepts these edges and the projection MOVES", () => {
  const rigs: { store: DeviceStore; dir: string }[] = [];
  afterEach(() => {
    for (const r of rigs.splice(0)) {
      r.store.close();
      rmSync(r.dir, { recursive: true, force: true });
    }
  });
  const open = (opts?: Parameters<typeof rig>[0]) => {
    const r = rig(opts);
    rigs.push(r);
    return r;
  };

  it("a line with no edges reads `placed` — the state this product has never left", () => {
    const r = open();
    // The pre-state is what makes every post-state below mean something. If this ever fails,
    // something else has started emitting line edges and this suite's premise has moved.
    expect(r.cells()[LINE_A]?.states).toEqual(["placed"]);
  });

  it("01 §4 — confirm advances the lines to `confirmed`, with NO anomaly", () => {
    const r = open();
    r.lines.confirmed(ORDER_ID);
    expect(r.cells()[LINE_A]?.states).toEqual(["confirmed"]);
    expect(r.cells()[LINE_B]?.states).toEqual(["confirmed"]);
    // An empty anomaly map is the assertion that `preds: []` is correct here rather than merely
    // convenient: a wrong predecessor set surfaces as `inconsistent_predecessor` or
    // `terminal_regression`, and this is where it would show.
    expect(r.cells()[LINE_A]?.anomalies ?? {}).toEqual({});
  });

  it("02-F31 — kot.printed then advances them to `in_prep`, still with NO anomaly", () => {
    const r = open();
    r.lines.confirmed(ORDER_ID);
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(r.cells()[LINE_A]?.states).toEqual(["in_prep"]);
    expect(r.cells()[LINE_A]?.anomalies ?? {}).toEqual({});
    expect(r.appended.map((e) => e.type)).toEqual([
      "order.line_state_changed",
      "order.line_state_changed",
    ]);
  });

  it("03-F2 — a SECOND station's print appends nothing at all", () => {
    const r = open();
    r.lines.confirmed(ORDER_ID);
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    // Not "idempotent by luck": `LEGAL_NEXT.in_prep` excludes `in_prep`, so there is no eligible
    // line and no event is written. One order, one advance, whatever the station count.
    expect(r.appended).toHaveLength(2);
    expect(r.cells()[LINE_A]?.states).toEqual(["in_prep"]);
  });

  it("02-F31 — kot.printed BEFORE a confirm advances nothing (placed → in_prep is illegal)", () => {
    const r = open();
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(r.appended).toHaveLength(0);
    expect(r.cells()[LINE_A]?.states).toEqual(["placed"]);
  });

  it("02-F31 — a T2 device does NOT auto-advance on print, and STILL confirms", () => {
    // The CONTROL for the tier gate, in the fold: exactly one input differs from the T1 rig.
    const r = open({ tier: "T2" });
    r.lines.confirmed(ORDER_ID);
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    // `03-F24` — on T2 the pass screen owns the signal and auto-advancing would race a human.
    expect(r.cells()[LINE_A]?.states).toEqual(["confirmed"]);
    expect(r.appended).toHaveLength(1);
  });

  it("01-F17 — an unknown order is a no-op, never a throw", () => {
    const r = open();
    expect(() => r.lines.confirmed("0199ffff-0000-7000-8000-00000000dead")).not.toThrow();
    expect(r.appended).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — LAW 1 (`01-F34`), and the half of `02-F31` that is REFUSED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F34 — the emitted edge reads no ordering metadata", () => {
  const rigs: { store: DeviceStore; dir: string }[] = [];
  afterEach(() => {
    for (const r of rigs.splice(0)) {
      r.store.close();
      rmSync(r.dir, { recursive: true, force: true });
    }
  });

  it("bijective id relabel + clock injection leave the payloads BYTE-IDENTICAL", () => {
    // Plain convergence testing is insufficient here (`AGENTS.md` law 1: a `min(id)` tiebreak
    // passes it while smuggling wall clock in through the UUIDv7 prefix), so the two rigs differ
    // in exactly the two things law 1 bans a projected value from reading: every envelope id, and
    // the device clock. The LOGICAL content — order id, line ids, states — is identical.
    const a = rig({ idPrefix: "0199bbbb", clock: 1_754_300_000_000 });
    const b = rig({ idPrefix: "0199eeee", clock: 1_500_000_000_000 });
    rigs.push(a, b);
    for (const r of [a, b]) {
      r.lines.confirmed(ORDER_ID);
      r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    }
    // Byte-identical, not merely equivalent: an emitter that put an envelope id into `preds`, or
    // sorted lines by id, or stamped a time, would differ here.
    expect(JSON.stringify(a.appended)).toBe(JSON.stringify(b.appended));
    // And the projection agrees, which is the fold's half of the same claim.
    expect(a.cells()[LINE_A]?.states).toEqual(b.cells()[LINE_A]?.states);
  });

  it("no emitted payload contains an envelope id from any store", () => {
    const r = rig();
    rigs.push(r);
    r.lines.confirmed(ORDER_ID);
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    const ids = new Set(r.store.readAllEvents().map((e) => (e as { id: string }).id));
    const text = JSON.stringify(r.appended);
    for (const id of ids) expect(text).not.toContain(id);
    // The negative above can pass by the payloads being empty, so anchor it: they are not.
    expect(text).toContain(LINE_A);
    expect(text.length).toBeGreaterThan(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `02-F31`'s SETTLEMENT HALF, unblocked by `DEC-HW-002`.
//
// This section REPLACED an anti-scope block titled *"the settlement half is REFUSED, not silently
// skipped"*, whose three tests asserted (1) `LEGAL_NEXT.in_prep` does NOT contain `served`,
// (2) `advanceEdgesFor(…, "served")` returns null from `in_prep`, and (3) `LineAdvance` has exactly
// two methods. All three were correct while the conflict stood and all three are false now; the
// first even said so in its own comment — *"if this expectation ever fails, the kernel has been
// amended and `02-F31`'s settlement half is newly buildable — go and build it."* Each has been
// INVERTED rather than deleted, so the same facts are still pinned, from the other side.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E DEC-HW-002/01 §4 — `served` has a legal predecessor at T1, and only the ruled one", () => {
  it("LEGAL_NEXT.in_prep gains `served` — the amendment, as an executable statement", () => {
    // The inverse of the old anti-scope assertion. `DEC-HW-002`: a line in a restaurant with no
    // pass goes from being cooked to being handed over with no observed moment of readiness.
    expect(LEGAL_NEXT.in_prep).toContain("served");
    // The pass-owning route is UNCHANGED — the ruling added an edge, it did not replace one.
    expect(LEGAL_NEXT.ready).toContain("served");
    // And the ruling stopped where it stopped. A line still at `confirmed` (a till whose KOT never
    // printed) is NOT reachable to `served`: that would be inventing past `DEC-HW-002`, and
    // `DEC-HW-001`'s second open sub-question — is there a tier below T1? — is the founder's.
    expect(LEGAL_NEXT.confirmed).not.toContain("served");
    // `03-F26` / `02-F31`: no `ready` is fabricated, so nothing may make `in_prep → ready`
    // automatic. The edge still exists for the T2/T3 device that OBSERVES readiness.
    expect(LEGAL_NEXT.in_prep).toContain("ready");
  });

  it("02-F31 — the edge declares the state the line is REALLY in, never a lie about `ready`", () => {
    // The dangerous implementation was never the one that emits an illegal edge — it is the one
    // that writes `from_states: ["ready"]` on a line that never reached `ready`, because that edge
    // is legal on its face and would work. `DEC-HW-002` removed the temptation by making the TRUE
    // statement legal; this asserts the true statement is what gets written.
    const built = advanceEdgesFor(orderWith({ [LINE_A]: { states: ["in_prep"] } }), "served");
    expect(built?.line_context[LINE_A]?.to).toBe("served");
    expect(built?.line_context[LINE_A]?.from_states).toEqual(["in_prep"]);
    // From `confirmed` it is still refused — not vacuously, since the line above proves the same
    // call builds an edge one state along.
    expect(
      advanceEdgesFor(orderWith({ [LINE_A]: { states: ["confirmed"] } }), "served"),
    ).toBeNull();
  });

  it("03-F26 — no code path here ever emits `ready`", () => {
    // `02-F31`'s explicit prohibition and the easiest thing to get wrong by being helpful. The
    // surface is now THREE methods; the old assertion pinned two as an anti-scope guard, and this
    // pins the same property the right way round — the settlement method exists, and none of the
    // three can be talked into a ready-mark.
    const appended: Appended[] = [];
    const lines = createLineAdvance({
      store: {
        openOrders: () => [
          {
            ...orderWith({ [LINE_A]: { states: ["in_prep"] } }),
            order_type: "dine_in",
            pay_total: 45_000,
          },
        ],
      } as never,
      tier: () => "T1",
      append: (type, payload) => appended.push({ type, payload }),
    });
    expect(Object.keys(lines).sort()).toEqual(["confirmed", "printEvent", "settled"]);
    lines.confirmed(ORDER_ID);
    lines.printEvent("kot.printed", { order_id: ORDER_ID });
    lines.settled(ORDER_ID);
    // Exactly one event — the settlement edge. `confirmed` and `in_prep` are both already past.
    expect(appended).toHaveLength(1);
    expect(appended[0]?.payload.state).toBe("served");
    // The whole emitted corpus, checked for the forbidden word rather than only its `state` field:
    // a `ready` smuggled into `from_states` or into a second line's context would show here.
    expect(JSON.stringify(appended)).not.toContain("ready");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE DELIVERY EXCLUSION. `01 §4` is canonical and `02-F31` points at it:
//
//   "terminal service state — `served` (dine-in/takeaway/pickup) OR `picked_up → delivered`
//    (delivery, rider-driven only — never advanced by payment/settlement, 09)"
//
// ⚠ EVERY FIXTURE HERE IS PAID IN FULL, AT T1, AND ELIGIBLE ON EVERY OTHER AXIS, so a refusal can
// only be about `order_type`. That is deliberate: `K-4`'s defect was a suite that varied everything
// except the one field it existed to test.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 02-F31/01 §4 — delivery lines are NEVER advanced by settlement", () => {
  /** One order, fully tendered, at a state from which `served` is legal. Only the type varies. */
  const settle = (order_type: string | null, states: string[] = ["in_prep"]) => {
    const appended: Appended[] = [];
    const lines = createLineAdvance({
      store: {
        openOrders: () => [
          { ...orderWith({ [LINE_A]: { states } }), order_type, pay_total: 45_000 },
        ],
      } as never,
      tier: () => "T1",
      append: (type: string, payload: LineStateChangedPayload) => appended.push({ type, payload }),
    });
    lines.settled(ORDER_ID);
    return appended;
  };

  it("a DELIVERY order is refused — the food is still in the building", () => {
    // `served` is TERMINAL (`01-F35`), so this is not a delayed advance a later edge fixes: it is a
    // permanent record of a handover that did not happen. COD settles at the door or on rider
    // return, and doc 09's `rider.picked_up`/`rider.delivered` own the real transition.
    expect(settle("delivery")).toHaveLength(0);
  });

  it("a delivery line at `ready` is refused too — the exclusion is not the legality change", () => {
    // THE ROW THAT SEPARATES THE TWO MECHANISMS. `ready → served` was legal long before
    // `DEC-HW-002`, so if the exclusion were quietly resting on `LEGAL_NEXT` this would advance.
    // A T2 branch whose pass screen marked a delivery line ready, settled at the counter, is the
    // real configuration this protects.
    expect(settle("delivery", ["ready"])).toHaveLength(0);
  });

  it.each(["dine_in", "takeaway", "pickup"])(
    "%s IS advanced — the CONTROL, without which the refusals above prove nothing",
    (order_type) => {
      const appended = settle(order_type);
      expect(appended).toHaveLength(1);
      expect(appended[0]?.payload.state).toBe("served");
    },
  );

  it("01 §4 is read as an ALLOWLIST — an unknown or absent type does NOT advance", () => {
    // `order_type` is an OPEN string in `registry.ts` (`02-F42` closed `channel` and left this axis
    // open), so every value below is constructible and a `!== "delivery"` denylist would advance
    // all of them. The harm is asymmetric and recoverable in only one direction: refusing costs a
    // queue row that lingers; advancing wrongly writes a terminal falsehood `01-F1` will not let
    // anyone remove. `"Delivery"` is in the list precisely because it is the one a denylist misses
    // while looking correct.
    for (const order_type of [null, "", "Delivery", "delivery_cod", "dine-in", "DINE_IN"]) {
      expect(settle(order_type)).toHaveLength(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — THE OTHER TWO GATES.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 02-F31 — the tier gate, and what counts as settlement completing", () => {
  /** Two lines at Rs 450 = 90_000 paisa billed. Only tier and tender vary. */
  const drive = (opts: { tier?: "T1" | "T2" | "T3"; pay_total: number }) => {
    const appended: Appended[] = [];
    const lines = createLineAdvance({
      store: {
        openOrders: () => [
          {
            ...orderWith({ [LINE_A]: { states: ["in_prep"] }, [LINE_B]: { states: ["in_prep"] } }),
            order_type: "dine_in",
            pay_total: opts.pay_total,
          },
        ],
      } as never,
      tier: () => opts.tier ?? "T1",
      append: (type: string, payload: LineStateChangedPayload) => appended.push({ type, payload }),
    });
    lines.settled(ORDER_ID);
    return appended;
  };

  it("02-F31 — a T2 or T3 device does NOT auto-advance on settlement", () => {
    // `03-F24` gives the ready signal to a pass screen on T2/T3, and the line's service state with
    // it. The CONTROL is the full-tender T1 row below: exactly one input differs.
    expect(drive({ tier: "T2", pay_total: 90_000 })).toHaveLength(0);
    expect(drive({ tier: "T3", pay_total: 90_000 })).toHaveLength(0);
  });

  it("02-F13 — a PARTIAL tender advances nothing; the full one advances both lines", () => {
    // `served` is terminal, so marking lines handed-over at the first half of a split settlement is
    // not a timing quibble — it is unrecoverable. This is also what keeps the open
    // `TAKE CASH`-on-an-empty-entry defect out of line state: a Rs 0 tender leaves
    // `pay_total < billed_effective`.
    expect(drive({ pay_total: 0 })).toHaveLength(0);
    expect(drive({ pay_total: 89_999 })).toHaveLength(0);
    const full = drive({ pay_total: 90_000 });
    expect(full).toHaveLength(1);
    expect([...(full[0]?.payload.line_ids ?? [])].sort()).toEqual([LINE_A, LINE_B].sort());
    // Overpayment (change due) settles too — `>=`, never `===`.
    expect(drive({ pay_total: 100_000 })).toHaveLength(1);
  });

  it("01-F17 — settling an order this device cannot read is a no-op, never a throw", () => {
    const lines = createLineAdvance({
      store: { openOrders: () => [] } as never,
      tier: () => "T1",
      append: () => {},
    });
    expect(() => lines.settled("0199ffff-0000-7000-8000-00000000dead")).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §H — THE REAL FOLD AGAIN, for the settlement half. Nothing here can pass vacuously.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§H 01 §4 — the kernel accepts the settlement edge and the line reaches `served`", () => {
  const rigs: { store: DeviceStore; dir: string }[] = [];
  afterEach(() => {
    for (const r of rigs.splice(0)) {
      r.store.close();
      rmSync(r.dir, { recursive: true, force: true });
    }
  });
  const open = (opts?: Parameters<typeof rig>[0]) => {
    const r = rig(opts);
    rigs.push(r);
    return r;
  };

  it("02-F31 — confirm, print, settle: the line ends at `served` through the REAL fold", () => {
    // Every payload goes through a real `sync-client` store and the projection is read back, so an
    // edge this module thinks is well-formed and the kernel does not fails HERE rather than in a
    // unit assertion about our own object.
    const r = open();
    r.lines.confirmed(ORDER_ID);
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    expect(r.cells()[LINE_A]?.states).toEqual(["in_prep"]);
    r.payFull();
    r.lines.settled(ORDER_ID);
    expect(r.cells()[LINE_A]?.states).toEqual(["served"]);
    expect(r.cells()[LINE_B]?.states).toEqual(["served"]);
  });

  it("⚠ MEASURED — the terminal edge carries `preds: []`, and the fold flags the two it supersedes", () => {
    // NOT an aspiration and NOT a bug being hidden. `line-advance.ts` PREDICTED this before the
    // half was buildable; the prediction is now pinned as a fact so it cannot change silently.
    //
    // `projectLine` retires heads ONLY through `preds`. This emitter cannot build them — the
    // `json_lines` cell carries `states` and no head edge ids — so the `confirmed` and `in_prep`
    // edges remain live heads beside a terminal one and `01-F35`'s absorption rule flags both.
    //
    // Why it ships anyway, with each clause asserted rather than merely claimed:
    //  - the projected STATE is correct regardless (the test above);
    //  - the flag is DERIVED — every edge here is legal, so nothing wrong enters the append-only
    //    ledger, and a refold clears it the day `preds` can be built;
    //  - the cloud Auditor filters to `illegal_transition` by name, so this raises no finding.
    const r = open();
    r.lines.confirmed(ORDER_ID);
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    r.payFull();
    r.lines.settled(ORDER_ID);
    const flags = Object.values(r.cells()[LINE_A]?.anomalies ?? {});
    expect(flags).toEqual(["terminal_regression", "terminal_regression"]);
    // The point of the row: NOT `illegal_transition`. If that ever appears the EDGE is wrong and
    // the ledger carries it for ever (`01-F1`) — a different and far worse fact.
    expect(flags).not.toContain("illegal_transition");
    expect(flags).not.toContain("inconsistent_predecessor");
  });

  it("02-F31 — a DELIVERY order rings up and settles, and its lines stay at `in_prep`", () => {
    // The exclusion driven end to end through the real store rather than against a stub row,
    // because the fixture is the coverage boundary: `01 §4` sends these lines down
    // `picked_up → delivered` on a rider event this device does not emit.
    const r = open({ orderType: "delivery" });
    r.lines.confirmed(ORDER_ID);
    r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
    r.payFull();
    r.lines.settled(ORDER_ID);
    expect(r.cells()[LINE_A]?.states).toEqual(["in_prep"]);
    // And no anomaly either — refusing to emit is silent, not a rejected edge in the ledger.
    expect(r.cells()[LINE_A]?.anomalies ?? {}).toEqual({});
  });

  it("01 §4 — a line still at `confirmed` is not advanced by settlement", () => {
    // The till whose KOT never printed. `LEGAL_NEXT.confirmed` excludes `served`, so
    // `advanceEdgesFor` finds no eligible line and appends NOTHING — no illegal edge is written.
    // `restaurant-os.md:47` defines T1 as "terminal + printers", so this is outside the corpus
    // rather than a gap in it (`DEC-HW-001` sub-question 2).
    const r = open();
    r.lines.confirmed(ORDER_ID);
    r.payFull();
    r.lines.settled(ORDER_ID);
    expect(r.cells()[LINE_A]?.states).toEqual(["confirmed"]);
    expect(r.cells()[LINE_A]?.anomalies ?? {}).toEqual({});
  });

  it("01-F34 — the settlement edge reads no ordering metadata either", () => {
    // Law 1 on the new emitter, on §D's shape: the two rigs differ in every envelope id and in the
    // device clock, and the emitted payloads must be BYTE-identical.
    const a = open({ idPrefix: "0199bbbb", clock: 1_754_300_000_000 });
    const b = open({ idPrefix: "0199eeee", clock: 1_500_000_000_000 });
    for (const r of [a, b]) {
      r.lines.confirmed(ORDER_ID);
      r.lines.printEvent("kot.printed", { order_id: ORDER_ID });
      r.payFull();
      r.lines.settled(ORDER_ID);
    }
    expect(JSON.stringify(a.appended)).toBe(JSON.stringify(b.appended));
    // Anchored: the payloads are not empty, so the equality above is not two empty arrays.
    expect(a.appended.map((e) => e.payload.state)).toEqual(["confirmed", "in_prep", "served"]);
  });
});
