// AUTHORED FROM SPEC TEXT ONLY (`24 §3` step 2). Written by a session that did not read the
// plan for this task and did not write the implementation, from `03-F25`, `03-F14`, `03-F47`,
// `03 §7`, `02-F31`, `02-F10`, `01-F43`, `01-F44`, `01-F45`, `01-F54`, `01-F17` and `00 §5.7`.
//
// ───────────────────────────────────────────────────────────────────────────────────────────────
// `03-F25`'s POS T1 PANEL — THE SEAM. Where does the number come from, and is it branch time?
// ───────────────────────────────────────────────────────────────────────────────────────────────
//
// `orders-aging.dom.test.tsx` proves the SCREEN renders whatever ages it is handed. It stubs the
// bridge, so it stays green against a gateway that hands it none — which is instance (1) of this
// wave's named defect (`AGENTS.md`: *"a correct subsystem with no seam to the product"*), and
// the exact shape `catalog-fetch.ts`'s `toEntry` shipped in when it dropped `prices` and
// `station` and failed 0 of 579 tests. This file is the hand-written assertion the rails cannot
// express: `seams:check` Rule A wants an unreached export and Rule B an unsupplied optional bag
// member, and an age that is never computed is neither.
//
// ## §A IS THE STANDING-LAW SECTION AND IT IS WHY THIS LIVES IN MAIN AT ALL
//
// An age is `now − confirmed_at`, so the task has a time question with a legal answer and an
// illegal one.
//
// > 01-F45 **`device_created_at` is untrusted.** It is a display/forensic hint only. No fold,
// > read model, invariant, or ordering key may derive a value from it … Timing read models take
// > branch time (01-F43).
//
// > DEC-TIME-001 (a) **durations need a consistent clock, not a correct one** — a uniform offset
// > cancels in a difference, so kitchen age/ETA are safe on branch-consensus time (01-F43).
//
// So both ends must be branch time. `confirmed_at` already is: `01-F43` stamps it at APPEND from
// `branch_created_at`, and `merge.ts` sets `age_basis` to the confirm anchor and nothing else.
// `now` must therefore be `wallClock.now() + branchTimeStatus().offset_ms` and never the raw
// device clock — which is exactly what `gateway.ts`'s existing `kitchenQueue()` already does one
// projection over, and what `apps/pass-kds`'s `pass-queue.ts` does for the pass.
//
// **This settles WHERE the arithmetic lives, and it is not a taste call.** `18 §9` gives the
// renderer no channel to `branchTimeStatus()` — the bridge exposes read models and an append,
// and nothing else — so a renderer computing its own age is a renderer reading the raw device
// clock, i.e. `01-F45`'s banned quantity on the untrusted side of the plane boundary. Main
// computes; the renderer renders. §A is what makes that checkable rather than asserted: a
// gateway that dropped `+ offset_ms` would be right on every developer machine (offset 0) and
// wrong on every till that has ever spoken to a hub.
//
// ## §D SETTLES THE OTHER DESIGN QUESTION — the threshold table
//
// `apps/pass-kds/src/main/aging.ts` already holds `03-F14`/`03-F47`'s table, its `03 §7` layer-2
// env parser, and the PINNED reading for the two order types the FRs never give defaults for.
// §D does not care which file the counter's copy lives in; it cares that the two surfaces answer
// the SAME question the same way, because `03-F14` describes ONE org policy and `05-F1` alarms
// the manager off *"the red aging threshold (03-F14)"*. A counter showing neutral while the pass
// shows red and the console alarms is not a cosmetic divergence.
//
// ## THE CONTRACT THIS SUITE FIXES
//
//   OpenOrder.aging?: { minutes: number; amberAt: number; redAt: number } | null | undefined
//   GatewayDeps.aging: (order_type: string | null) => { amberAt: number; redAt: number }   // REQUIRED
//
// `aging` on `GatewayDeps` is **required on purpose**, on `catalogRefusal`'s and `panelFit`'s
// precedent in the same type: an optional dep is precisely Rule B's unsupplied-seam shape, and a
// host that forgets it should be a typecheck error rather than a till that silently ages every
// order against somebody's default. Three existing fixtures build `GatewayDeps` as full typed
// literals (`gateway.test.ts`, `strip-attribution.test.ts`, `identity-attribution.test.ts`) and
// will each need one line — that is the intended cost and it is a compile error, not a silence.
//
// The wire carries the THRESHOLDS, not a level and not a colour: `packages/ui`'s standing rule
// is that `AgeBadge` takes *"minutes and thresholds, never a colour"*, and a component that can
// be handed a colour is not a closed vocabulary (commandment 6, `27-F12`).

import { readFileSync } from "node:fs";
import { resolveAging } from "@restos/device-config";
import type { DeviceStore } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGateway, type GatewayDeps } from "../gateway";

const JSON_LINES = JSON.stringify({
  "line-a": { item_id: "i-karahi", qty: 1, unit_price_paisa: 45_000, states: ["confirmed"] },
});

/** Branch-consensus milliseconds (`01-F43`), stamped at the origin's append. */
const CONFIRM_AT = 1_754_300_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** One `OpenOrderRow` as the merge fold projects it. */
const ROW = {
  order_id: "order-1234abcd",
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: CONFIRM_AT,
  settled: 0,
  json_lines: JSON_LINES,
  pay_total: 0,
};

const stubStore = (rows: readonly unknown[], offset_ms: number) =>
  ({
    identity: { org_id: "org1", branch_id: "br1", device_id: "dev1" },
    openOrders: () => rows,
    kitchenQueue: () => [],
    availability: () => [],
    branchTimeStatus: () => ({ offset_ms, basis: "branch", skew_ms: null, skew_flagged: false }),
    append: vi.fn((input) => ({ ...input, lamport_seq: 1 })),
  }) as unknown as DeviceStore;

type Thresholds = { amberAt: number; redAt: number };

const deps = (opts: {
  rows: readonly unknown[];
  offset_ms?: number;
  aging?: (order_type: string | null) => Thresholds;
}): GatewayDeps =>
  ({
    store: stubStore(opts.rows, opts.offset_ms ?? 0),
    catalog: () => ({ name: "Chicken Karahi" }),
    menu: () => [],
    priceOf: () => 145_000,
    actor: "Counter 1",
    session: () => ({ user_id: "user-1", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-07",
    panelPpi: () => 100.5,
    panelFit: () => null,
    // `03-F14`'s two numbers, per order type. Defaults to the SHIPPED resolver so a test that is
    // not about the table gets the product's own answers rather than a convenient constant.
    aging: opts.aging ?? resolveAging(undefined).thresholdsFor,
  }) as GatewayDeps;

/** The one order the fixture serves, read back through the seam. */
const only = (d: GatewayDeps) => createGateway(d).openOrders()[0];

afterEach(() => {
  vi.useRealTimers();
});

/** Put the DEVICE's clock at a chosen instant. `wallClock.now()` is `Date.now()`. */
const atDeviceClock = (ms: number): void => {
  vi.useFakeTimers();
  vi.setSystemTime(ms);
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — standing law 2: the age is BRANCH time on both ends, never this device's clock.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F43/01-F45 — the age is a branch-consensus duration", () => {
  it("reports the elapsed minutes since the confirm anchor", () => {
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    expect(only(deps({ rows: [ROW] }))?.aging?.minutes).toBe(12);
  });

  it("is UNCHANGED by a device clock that is three hours slow, because the offset cancels", () => {
    // DEC-TIME-001 (a) in one assertion: *"a uniform offset cancels in a difference"*. This till
    // thinks it is 15:00 while the branch is at 18:00, and the ticket is still twelve minutes
    // old. An implementation reading `wallClock.now()` alone reports MINUS 168 — floored to 0 —
    // and a kitchen watching a red ticket sees a counter calling it fresh.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE - 3 * HOUR);
    expect(only(deps({ rows: [ROW], offset_ms: 3 * HOUR }))?.aging?.minutes).toBe(12);
  });

  it("MOVES with the branch offset, so the offset is genuinely read and not decoration", () => {
    // The control for the assertion above. Same device clock, different branch offset: if the
    // two disagree, `offset_ms` is in the arithmetic. If they agree, the previous test passed
    // because both numbers happened to be zero, which is every developer machine.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const withOffset = only(deps({ rows: [ROW], offset_ms: 3 * HOUR }))?.aging?.minutes;
    expect(withOffset).toBe(12 + 180);
  });

  it("re-reads the clock on every call — this is a TIMER, not a value captured at boot", () => {
    // `03-F25` says *"aging timers"*. The mutant is `const now = branchNow()` hoisted out of the
    // mapping into the module or into `createGateway`, which renders a perfect first frame and
    // then freezes for the rest of the shift. Nothing static can see it: ONE gateway, TWO reads,
    // the clock moved between them and the ledger did not.
    atDeviceClock(CONFIRM_AT + 5 * MINUTE);
    const gateway = createGateway(deps({ rows: [ROW] }));
    expect(gateway.openOrders()[0]?.aging?.minutes).toBe(5);
    vi.setSystemTime(CONFIRM_AT + 41 * MINUTE);
    expect(gateway.openOrders()[0]?.aging?.minutes).toBe(41);
  });

  it("never reports a negative age when the branch clock is behind the stamp", () => {
    // `01-F44`'s `branch_provisional` basis is the raw device clock at offset 0, so a device
    // powered on before the counter can legitimately hold a `now` that precedes a delivered
    // confirm anchor. `pass-queue.ts` floors at zero for the stated reason — *"a negative age on
    // a kitchen ticket is a number that teaches an operator to distrust the row"* — and the
    // counter must not answer differently. `01-F17`: never a throw on a read path.
    atDeviceClock(CONFIRM_AT - 9 * MINUTE);
    expect(only(deps({ rows: [ROW] }))?.aging?.minutes).toBe(0);
  });

  it("floors to whole minutes rather than rounding up into a threshold", () => {
    // 59 seconds is not a minute. Rounding would tip a ticket into amber before the org's
    // configured minute, which is `03-F47`'s *"colour that lies about how late the food is"*
    // wearing the other sign.
    atDeviceClock(CONFIRM_AT + 9 * MINUTE + 59_000);
    expect(only(deps({ rows: [ROW] }))?.aging?.minutes).toBe(9);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — `03-F14`'s basis: the timer starts at `order.confirmed` and nowhere else.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 03-F14/03-F25 — no confirm anchor, no age", () => {
  it("gives an unconfirmed order a null age, not a zero and not an epoch age", () => {
    // `02-F9`'s inbox is entirely unconfirmed, so this is a resting state and not an edge.
    // `now - (confirmed_at ?? 0)` renders ~29 million minutes; `?? now` renders `0 min` on an
    // order that arrived forty minutes ago. Both are non-null, so both die here.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const order = only(deps({ rows: [{ ...ROW, confirmed_at: null, channel: "storefront" }] }));
    expect(order?.aging ?? null).toBeNull();
  });

  it("gives a row that predates the column a null age rather than dropping the order", () => {
    // `01-F54`/`01-F17` — degrade, never drop. The order must still be findable (`C31`).
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const order = only(
      deps({ rows: [{ order_id: "legacy", json_lines: JSON_LINES, pay_total: 0 }] }),
    );
    expect(order?.order_id).toBe("legacy");
    expect(order?.aging ?? null).toBeNull();
  });

  it("ages the confirmed rows of a mixed list and leaves the unconfirmed one alone", () => {
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const orders = createGateway(
      deps({
        rows: [
          { ...ROW, order_id: "confirmed-1" },
          { ...ROW, order_id: "inbox-1", confirmed_at: null, channel: "storefront" },
          { ...ROW, order_id: "confirmed-2", confirmed_at: CONFIRM_AT - 8 * MINUTE },
        ],
      }),
    ).openOrders();
    expect(orders.map((o) => o.aging?.minutes ?? null)).toEqual([12, null, 20]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — `03-F47`: the thresholds are per ORDER TYPE, and it is the ROW's type that decides.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F47 — each order is judged against its own type's thresholds", () => {
  /** A policy whose answer is a function of the type, so a wrong lookup is visible in the value. */
  const byType = (order_type: string | null): Thresholds =>
    order_type === "delivery"
      ? { amberAt: 15, redAt: 25 }
      : order_type === "takeaway"
        ? { amberAt: 7, redAt: 14 }
        : order_type === null
          ? { amberAt: 3, redAt: 6 }
          : { amberAt: 10, redAt: 20 };

  it("carries each row's own thresholds across the seam", () => {
    // The K-4 defect verbatim if this is skipped: vary the minutes across ninety renders and
    // never vary the TYPE, and an implementation that looks up one row of the table passes.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const orders = createGateway(
      deps({
        aging: byType,
        rows: [
          { ...ROW, order_id: "o-dine", order_type: "dine_in" },
          { ...ROW, order_id: "o-deliv", order_type: "delivery" },
          { ...ROW, order_id: "o-take", order_type: "takeaway" },
          { ...ROW, order_id: "o-none", order_type: null },
        ],
      }),
    ).openOrders();
    expect(orders.map((o) => [o.order_id, o.aging?.amberAt, o.aging?.redAt])).toEqual([
      ["o-dine", 10, 20],
      ["o-deliv", 15, 25],
      ["o-take", 7, 14],
      ["o-none", 3, 6],
    ]);
  });

  it("asks the policy about the type the ROW carries, including a null one", () => {
    // The mutant this kills is narrower and nastier than the one above: asking the policy once,
    // with the first row's type, and reusing the answer. The values would still differ per row
    // if the table were consulted per row, so the ARGUMENT is what is asserted here.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const asked: (string | null)[] = [];
    const spy = (order_type: string | null): Thresholds => {
      asked.push(order_type);
      return byType(order_type);
    };
    createGateway(
      deps({
        aging: spy,
        rows: [
          { ...ROW, order_id: "o-deliv", order_type: "delivery" },
          { ...ROW, order_id: "o-none", order_type: null },
        ],
      }),
    ).openOrders();
    expect(asked).toEqual(["delivery", null]);
  });

  it("does not consult the table for an order it has no age for", () => {
    // `03-F14`'s basis again, from the other side: an unconfirmed order has no age, so it has no
    // colour, so there is no threshold question to ask. An implementation that emits thresholds
    // with a null age is emitting a status with no state (`27-F12` has nothing to render).
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const order = only(deps({ rows: [{ ...ROW, confirmed_at: null, channel: "storefront" }] }));
    expect(order?.aging ?? null).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §D — `03-F14` is ONE org policy: the counter and the pass must answer identically.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 03-F14/03-F47/05-F1 — one table, two surfaces, the same numbers", () => {
  /** `02-F1`'s three types, `01 §4`'s pickup mode, an unknown string, and no type at all. */
  const TYPES: readonly (string | null)[] = [
    "dine_in",
    "takeaway",
    "delivery",
    "pickup",
    "banquet",
    null,
  ];

  const agesOf = (configured: string | undefined) => {
    const policy = resolveAging(configured).thresholdsFor;
    const orders = createGateway(
      deps({
        aging: policy,
        rows: TYPES.map((t, i) => ({ ...ROW, order_id: `o-${i}`, order_type: t })),
      }),
    ).openOrders();
    return orders.map((o) => `${o.aging?.amberAt}/${o.aging?.redAt}`);
  };

  it("ships 03-F47's stated defaults — dine-in 10/20 and delivery 15/25", () => {
    // The only two rows the FRs actually state. Quoted: *"Thresholds stay org-configurable per
    // order type (defaults: dine-in 10/20, delivery 15/25)."*
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    const [dine, , delivery] = agesOf(undefined);
    expect(dine).toBe("10/20");
    expect(delivery).toBe("15/25");
  });

  it("ages EVERY order type, including the ones no FR gives a default for", () => {
    // The alternative — refuse to age a type the FR does not name — leaves the commonest
    // takeaway ticket in a Pakistani restaurant permanently neutral, which is `03-F47`'s
    // *"colour that lies about how late the food is"* with the sign flipped. `03-F25` puts a
    // timer on the panel, not on a subset of it.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    expect(agesOf(undefined)).toEqual(["10/20", "10/20", "15/25", "10/20", "10/20", "10/20"]);
  });

  it("moves with `03 §7`'s layer-2 configuration rather than pinning the shipped numbers", () => {
    // `03 §7` **Layer 2 (org)**: *"aging thresholds X/Y per order type"*. An org running 8/16 at
    // lunch must see 8/16 on the counter, not only on the pass.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    expect(agesOf("dine_in=8/16,delivery=12/30")).toEqual([
      "8/16",
      "10/20",
      "12/30",
      "10/20",
      "10/20",
      "10/20",
    ]);
  });

  it("refuses a malformed configuration without taking the timer off the counter", () => {
    // `01-F17`/commandment 4 and `station-routing.ts`'s ruling on the same question: a typo in a
    // threshold must never stop a surface. The shipped defaults apply and the reason travels.
    atDeviceClock(CONFIRM_AT + 12 * MINUTE);
    expect(agesOf("dine_in=20/10")).toEqual(["10/20", "10/20", "15/25", "10/20", "10/20", "10/20"]);
    expect(resolveAging("dine_in=20/10").malformed).toEqual(["dine_in=20/10"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §E — the wave's named defect: does the SHIPPED HOST supply any of this?
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§E — the host wires a real policy, and the layout rail can see the badge", () => {
  const read = (name: string): string =>
    readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  it("reads 03 §7's layer-2 environment key at all", () => {
    // `main/index.ts` cannot be imported here (it opens Electron and a native SQLite addon), so
    // this is the source-anchored form `station-routing-seam.test.ts` §E and `pass-seam.test.ts`
    // already use for exactly this question. Half of it: the org's key is read somewhere.
    const main = read("index.ts");
    // `24-F14` — a check whose haystack is empty passes vacuously. Prove the file is the one.
    expect(main).toContain("createGateway(");
    expect(main).toMatch(/AGING_THRESHOLDS_ENV|RESTOS_AGING_THRESHOLDS/);
  });

  it("does not hand the gateway a LITERAL pair of thresholds", () => {
    // ⚠ **THE ASSERTION ABOVE IS NOT SUFFICIENT AND THE MUTANT PROVED IT.** Replacing the shipped
    // `aging:` argument with `() => ({ amberAt: 10, redAt: 20 })` — the blind spot `AGENTS.md`
    // measures by name, *"a port supplied with a stub is a supplied port"*, which `seams:check`
    // Rule B cannot express because a stub IS a supply — killed **0 of 1046 tests**, because the
    // `import` of the env key survives the edit and the regex above went on matching. A mention
    // is not a use; that is this repo's own Rule A distinction, one tool over.
    //
    // So the second half is aimed at the SHAPE OF THE ARGUMENT rather than at the file: whatever
    // the host passes, it may not be two numbers typed at the call site. A real policy is a
    // function reference or a call; `03-F14` makes X/Y **org-configurable**, and a literal there
    // is the org's configuration silently deleted for the counter while the pass screen keeps it.
    const main = read("index.ts");
    const agingArguments = main
      .split("\n")
      .filter((line) => /^\s*aging:/.test(line))
      .join("\n");
    // `24-F14` again — with no `aging:` argument at all this would pass on an empty string.
    expect(agingArguments).not.toBe("");
    expect(agingArguments).not.toMatch(/amberAt/);
    expect(agingArguments).not.toMatch(/redAt/);
  });

  it("gives the layout gate an aged order to measure", () => {
    // **The one rail that can see this component is blind to any state its FIXTURE never
    // produces** — `AGENTS.md`: *"the fixture is the real coverage boundary, not the
    // assertions"*, measured twice (the alarm-band defects and `ManagerApproval`'s dead
    // controls were both invisible until the fixture produced the state).
    //
    // This matters more here than usual. The counter's row already carries a reference, a
    // channel, an item count, a money value and — in the inbox — an Accept tile, and eight of
    // the nine recorded layout defects in this app were a control pushed out of a box that was
    // costed before something else was added to it. A sixth element on that row is exactly that
    // move. If `layout-gate/preload.ts` serves no aged order, `pnpm layout:check` measures the
    // row WITHOUT the badge and reports green for a screen that clips it.
    //
    // ⚠ The first draft of this assertion was `expect(fixture).toContain("aging")` and it
    // **passed before a line of the feature existed** — the file already says *"a paging grid"*
    // twice. A substring is not a fixture state; this parses the aging blocks the fixture
    // actually declares and requires one of them to be AT OR PAST its own red threshold, which
    // is the widest badge (`27-F15`'s fault fill, and the largest number the row will carry).
    const fixture = readFileSync(new URL("../../layout-gate/preload.ts", import.meta.url), "utf8");
    // `24-F14` — prove the haystack is the file this test thinks it is before matching in it.
    expect(fixture).toContain("openOrders:");
    const blocks = [...fixture.matchAll(/aging:\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    const numberOf = (body: string, key: string): number | null => {
      const hit = new RegExp(`${key}:\\s*(\\d[\\d_]*)`).exec(body);
      return hit?.[1] === undefined ? null : Number(hit[1].replaceAll("_", ""));
    };
    const overdue = blocks.filter((body) => {
      const minutes = numberOf(body, "minutes");
      const redAt = numberOf(body, "redAt");
      return minutes !== null && redAt !== null && minutes >= redAt;
    });
    expect(overdue.length).toBeGreaterThan(0);
  });
});
