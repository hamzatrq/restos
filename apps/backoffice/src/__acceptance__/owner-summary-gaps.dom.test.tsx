/**
 * `14-F31` — **the seven claims the acceptance suite makes in its prose and does not assert.**
 *
 * ⚠ **AUTHORED BY THE MUTATION SESSION**, after `owner-summary.dom.test.tsx` and
 * `owner-summary-discipline.test.ts` were both green against `77115e8`. It is an ADDITION and
 * neither of those files is edited: this one exists because a 25-mutant matrix over the shipped
 * screen produced **eight survivors**, and seven of them are cases the original suite names in a
 * comment, a test title or a doc block while asserting something weaker beside it.
 *
 * Every test below was built the way the round-3 law requires: written against the mutant that
 * survived, confirmed RED with that mutant applied, then confirmed GREEN against the shipped file
 * restored byte-for-byte. The mutant each one owns is named in its doc block, because an assertion
 * whose kill is not recorded is indistinguishable from an assertion that never bit.
 *
 * ── WHAT IS DELIBERATELY *NOT* HERE ───────────────────────────────────────────────────────────
 *
 * The eighth survivor — `<Input type="date">` weakened to `type="text"` — is reported and not
 * asserted. `12-F13` says *"browsable by calendar date"* and the original suite's declared contract
 * asks only for *"a `YYYY-MM-DD` value"*; pinning the `type` attribute would red a perfectly correct
 * screen that ships a calendar component instead of the platform control, and *"a test that stays
 * RED under a CORRECT implementation is as damaging as a vacuous one"*.
 */

import { paisa, rupeesFromPaisa } from "@restos/domain";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerSummary } from "../components/owner-summary";
import { type CallLog, type Handlers, Harness } from "./harness";

afterEach(cleanup);

// ── the fixture ───────────────────────────────────────────────────────────────────────────────
//
// Its own, not a copy of the original suite's — that file exports nothing, and a shared fixture is
// a shared blind spot. Anchored in the same 2021 so a browser clock still fails by five years, and
// every cash figure is a whole rupee so the coherence check in §2 is arithmetic and not rounding.

const DAY = "2021-03-04";
const SERVER_NOW_MS = Date.parse("2021-03-04T23:10:00+05:00");
const ago = (ms: number): number => SERVER_NOW_MS - ms;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY_MS = 24 * HOUR;

type Shift = {
  shift_id: string;
  cashier_user_id: string | null;
  branch_id: string;
  closed: boolean;
  expected_cash_paisa: number | null;
  counted_cash_paisa: number | null;
  variance_paisa: number | null;
  no_sale_count: number;
  paid_out_paisa: number;
};

/**
 * Three closed drawers and one open one. Every closed row's `variance_paisa` is exactly
 * `counted − expected` in whole rupees, which is what makes §2's coherence check readable: the
 * three figures on the row have to agree with each other, and a transposition breaks the agreement
 * without changing the multiset of figures.
 */
const CASH: readonly Shift[] = [
  {
    shift_id: "shift-morning",
    cashier_user_id: "user-hina",
    branch_id: "branch-main",
    closed: true,
    expected_cash_paisa: 50_000,
    counted_cash_paisa: 50_000,
    variance_paisa: 0,
    no_sale_count: 0,
    paid_out_paisa: 0,
  },
  {
    shift_id: "shift-evening",
    cashier_user_id: "user-ayesha",
    branch_id: "branch-main",
    closed: true,
    expected_cash_paisa: 120_000,
    counted_cash_paisa: 118_500,
    variance_paisa: -1_500,
    no_sale_count: 2,
    paid_out_paisa: 3_000,
  },
  {
    shift_id: "shift-night",
    cashier_user_id: "user-bilal",
    branch_id: "branch-two",
    closed: true,
    expected_cash_paisa: 90_000,
    counted_cash_paisa: 90_700,
    variance_paisa: 700,
    no_sale_count: 0,
    paid_out_paisa: 0,
  },
  {
    shift_id: "shift-open",
    cashier_user_id: null,
    branch_id: "branch-two",
    closed: false,
    expected_cash_paisa: null,
    counted_cash_paisa: null,
    variance_paisa: null,
    no_sale_count: 1,
    paid_out_paisa: 0,
  },
];

const ANSWER = {
  business_date: DAY,
  branch_ids: ["branch-main", "branch-two"] as readonly string[],
  sales: {
    total_paisa: 355_000,
    orders: 20,
    by_channel: [
      { channel: "counter", orders: 12, billed_paisa: 240_000 },
      { channel: "whatsapp", orders: 3, billed_paisa: 61_500 },
      { channel: "dine_in", orders: 4, billed_paisa: 0 },
      { channel: "foodpanda", orders: 1, billed_paisa: 53_500 },
    ],
  },
  cash: CASH,
  top_items: [
    { item_id: "item-biryani", qty: 3, revenue_paisa: 135_000 },
    { item_id: "item-chai", qty: 40, revenue_paisa: 40_000 },
  ],
  hourly: [
    { offset: 6, wall_hour: 11, billed_paisa: 42_000 },
    { offset: 7, wall_hour: 12, billed_paisa: 118_500 },
  ],
  days: [],
  honesty: {
    events: 143,
    provisional_stamp_events: 2,
    every_day_closed: false,
    open_shifts: 1,
    truncated: true,
    anomalies: ["shift_close_divergence"] as readonly string[],
  },
  omissions: [
    { block: "Estimated gross margin", reason: "recipe coverage is 0%.", fr: "12-F11" },
  ] as readonly { block: string; reason: string; fr: string }[],
  sync: { latest_arrival_ms: ago(22 * MINUTE), server_now_ms: SERVER_NOW_MS } as {
    latest_arrival_ms: number | null;
    server_now_ms: number;
  },
  scope: { org_id: "org-zaiqa", branch_id: null as string | null, covers: null },
};

type Answer = typeof ANSWER;

const answerWith = (over: Partial<Answer>): Answer => ({ ...ANSWER, ...over });

const mount = (answer: Answer | ((input: unknown) => unknown), extra: Handlers = {}): CallLog => {
  const log: CallLog = [];
  const nightly = typeof answer === "function" ? answer : () => answer;
  render(
    <Harness log={log} handlers={{ "summary.nightly": nightly, ...extra }}>
      <OwnerSummary />
    </Harness>,
  );
  return log;
};

const settled = async (): Promise<void> => {
  await waitFor(() => {
    if (document.querySelector("[data-summary-block]") === null) {
      throw new Error("no [data-summary-block] rendered yet");
    }
  });
};

const region = (name: string): HTMLElement => {
  const el = document.querySelector(`[data-summary-block="${name}"]`);
  if (el === null) throw new Error(`the screen has no [data-summary-block="${name}"]`);
  return el as HTMLElement;
};

const flat = (el: ParentNode | null): string =>
  ((el as HTMLElement | null)?.textContent ?? "").replace(/\s+/g, " ").trim();

/** `MoneyValue`'s own signature — `27-F26` binds `tabular-nums` and nothing else on the page does. */
const moneyNodes = (root: ParentNode = document.body): HTMLElement[] =>
  (Array.from(root.querySelectorAll("span[style]")) as HTMLElement[]).filter((el) =>
    (el.getAttribute("style") ?? "").includes("tabular-nums"),
  );

const rowFor = (block: string, attribute: string, value: string): HTMLElement => {
  const el = region(block).querySelector(`[${attribute}="${value}"]`);
  if (el === null) throw new Error(`no [${attribute}="${value}"] inside ${block}`);
  return el as HTMLElement;
};

/** The rupee integer a `MoneyValue` rendered, direction word and grouping removed. */
const rupeesOf = (el: HTMLElement): number =>
  Number((flat(el).match(/Rs\s([\d,]+)/)?.[1] ?? "").replace(/,/g, ""));

const rupeesFrom = (value: number): number => rupeesFromPaisa(paisa(Math.abs(value))).rupees;

const syncTextFor = async (latest_arrival_ms: number | null): Promise<string> => {
  mount(answerWith({ sync: { latest_arrival_ms, server_now_ms: SERVER_NOW_MS } }));
  await settled();
  const text = flat(region("sync"));
  cleanup();
  return text;
};

/** Markup with every text node emptied — what is left is the treatment and not the wording. */
const markupOf = (el: HTMLElement): string => el.innerHTML.replace(/>[^<>]*</g, "><");

// ══ 1. COMMANDMENT 6 — EVERY FIGURE ON THE PAGE WENT THROUGH THE SEMANTIC COMPONENT ═══════════
//
// **Survivor `hand-money`.** Replacing ONE `<MoneyValue>` — the by-channel figure — with
// `` <span>{`Rs ${(channel.billed_paisa / 100).toLocaleString("en-US")}`}</span> `` passes all 188
// tests at `77115e8`. Both halves of the existing guard miss it, in different ways:
//
//   - `owner-summary-discipline.test.ts` bans `toLocaleString(` and `/ 100` over blanked source,
//     but its `blank()` treats a backtick as a string quote and blanks through to the closing
//     backtick — so everything inside a `${…}` interpolation is invisible to every rule in that
//     file. Template literals are this screen's dominant idiom.
//   - the `27-F16` sweep in §D of the render suite finds money BY `MoneyValue`'s signature and then
//     asserts `nodes.length >= 10`. A figure that skipped the component is not a node that fails
//     the sweep; it is a figure the sweep never sees. The count stayed at 20 of 24 and the floor is
//     10.
//
// So the claim has to be made from the other end: not *"every node we found is well-behaved"* but
// *"there is no rupee figure on this page that we did not find"*. That is also the only form that
// survives someone changing the component's internals.

describe("1 · Commandment 6 — no rupee figure reaches the screen outside MoneyValue", () => {
  it("every Rs on the page belongs to a swept money node", async () => {
    mount(ANSWER);
    await settled();
    const nodes = moneyNodes();
    // `24-F14` empty-match protection: a blank page satisfies the equality below vacuously.
    expect(nodes.length).toBeGreaterThanOrEqual(10);

    const onPage = flat(document.body).match(/Rs\s[\d,]+/g) ?? [];
    // One match per node and no others. A hand-rolled figure adds a match with no node behind it.
    expect(onPage).toHaveLength(nodes.length);
  });
});

// ══ 2. 12-F10 — EXPECTED vs COUNTED, AND THE VARIANCE THAT MEASURES THEM ══════════════════════
//
// **Survivor `swap-exp-counted`.** Transposing the two `<MoneyValue>` expressions on the cash row —
// the row then reads *Expected Rs 1,185 · Counted Rs 1,200 · SHORT Rs 15* — passes all 188 tests.
// §C asserts the row CONTAINS both figures and §D sorts the row's nodes before comparing, so both
// are order-blind by construction, and no assertion ties a figure to the label beside it.
//
// The claim asserted here is arithmetic rather than positional wording: `12-F10` names the block
// *"cash expected vs counted"*, `02-F23` fixes the sign convention (over positive, short negative),
// and the three figures on one row therefore have to agree — `counted − expected` must be the
// variance the row itself prints. A transposition leaves the multiset of figures untouched and
// breaks exactly that agreement.

describe("2 · 12-F10 — the three cash figures on a row agree with each other", () => {
  it("counted minus expected is the variance the row prints, on every closed shift", async () => {
    mount(ANSWER);
    await settled();

    const closed = CASH.filter((s) => s.variance_paisa !== null);
    // `24-F14`: the loop below is vacuous over an empty list, and this fixture's whole point is
    // that it carries a short, an over and a balanced drawer.
    expect(closed).toHaveLength(3);

    for (const shift of closed) {
      const row = rowFor("cash", "data-shift", shift.shift_id);
      const figures = moneyNodes(row);
      expect(figures).toHaveLength(3);

      const [expected, counted, variance] = figures as [HTMLElement, HTMLElement, HTMLElement];
      const printed = flat(variance);
      const signed = printed.includes("SHORT")
        ? -rupeesOf(variance)
        : printed.includes("OVER")
          ? rupeesOf(variance)
          : 0;

      expect(rupeesOf(counted) - rupeesOf(expected)).toBe(signed);
      // …and the row is reporting THIS shift's numbers, not a coherent set from another row.
      expect(rupeesOf(expected)).toBe(rupeesFrom(shift.expected_cash_paisa as number));
      expect(signed).toBe(
        (shift.variance_paisa as number) < 0
          ? -rupeesFrom(shift.variance_paisa as number)
          : rupeesFrom(shift.variance_paisa as number),
      );
    }
  });
});

// ══ 3. 12-F8 — THE LIVE WINDOW, ASSERTED FROM THE LIVE SIDE ═══════════════════════════════════
//
// **Survivor `live-threshold`.** `LIVE_WITHIN_MS = 60_000` weakened to `60` — the unit slip a
// session makes reading *"older than 60 s"* — passes all 188 tests. A branch that synced twelve
// seconds ago then reads *"Last synced 0 minutes ago"*. §I asserts the live case only by DIFFERENCE
// (`stale !== live`, and `live` does not say 22 minutes), and "0 minutes ago" satisfies both. The
// existing ban on a zero age is written for the `null` fixture alone; the defect is that it is a
// claim about every fixture.

describe("3 · 12-F8 — a branch inside the live window never states an age of zero", () => {
  const ZERO_AGE = /\b0\s*(s\b|sec|second|m\b|min|minute|h\b|hour|day)/i;

  it("twelve seconds and fifty-nine seconds both read as current, not as zero", async () => {
    expect(await syncTextFor(ago(12_000))).not.toMatch(ZERO_AGE);
    expect(await syncTextFor(ago(59 * 1_000))).not.toMatch(ZERO_AGE);
  });

  it("crossing 12-F8's 60 s boundary changes the sentence", async () => {
    const inside = await syncTextFor(ago(59 * 1_000));
    const outside = await syncTextFor(ago(61 * 1_000));
    expect(inside).not.toBe(outside);
    expect(outside).not.toMatch(ZERO_AGE);
  });
});

// ══ 4. 00 §5.7 — STALE DATA IS NEVER PRESENTED AS LIVE ════════════════════════════════════════
//
// **Survivor `ladder-lies`.** The age ladder's hour and day branches are reachable by no fixture in
// the suite — 22 minutes, 12 seconds and `null` are the only three ages it ever renders. Replacing
// both branches with `return strings.summary.sync.live;` passes all 188 tests, and a branch offline
// since Friday then reports *"Live — an event reached the cloud within the last minute."* That is
// `00 §5.7` stated and inverted, in the one sentence on the screen that exists to state it.

describe("4 · 00 §5.7 — a six-hour and a three-day silence are stated, never called live", () => {
  it("four ages produce four sentences, and none of the three stale ones is the live one", async () => {
    const live = await syncTextFor(ago(12_000));
    const minutes = await syncTextFor(ago(22 * MINUTE));
    const hours = await syncTextFor(ago(6 * HOUR));
    const days = await syncTextFor(ago(3 * DAY_MS));

    for (const text of [live, minutes, hours, days]) expect(text.length).toBeGreaterThan(0);
    expect(new Set([live, minutes, hours, days]).size).toBe(4);
    for (const stale of [minutes, hours, days]) expect(stale).not.toBe(live);
  });
});

// ══ 5. 12-F22 — THE ROLL-UP IS REACHABLE FROM A DRILL-IN ══════════════════════════════════════
//
// **Survivor `no-all-branches`.** Deleting the `<option value="">` passes all 188 tests: §K reads
// the option list, FILTERS OUT the empty value and compares the rest to `branch_ids`, so the one
// option that is not a branch is the one option no assertion covers. Without it the drill-in is
// one-way — and worse, the picker then displays `branch-main` while the query is still org-scoped,
// so the control names a scope the figures under it do not have.

describe("5 · 12-F22 — an owner who drilled into a branch can return to the org roll-up", () => {
  /**
   * The claim is asserted on what the screen SHOWS, not on what it sends — deliberately, and the
   * first draft of this test got it wrong in a way worth recording. Asserting *"the last call
   * carried no `branch_id`"* is RED against the correct implementation: going back to the org key
   * is a cache hit in TanStack Query, so no second call is made and the last logged input is still
   * the branch. A correct screen was failing an assertion about a request it had no reason to
   * repeat. The two answers below differ in exactly one figure, so what is on the screen answers
   * the question the FR actually asks.
   */
  const ORG_TOTAL = "Rs 3,550";
  const BRANCH_TOTAL = "Rs 7,777";
  const scoped = (input: unknown): Answer => {
    const branch_id = (input as { branch_id?: string | null }).branch_id ?? null;
    return branch_id === null
      ? ANSWER
      : answerWith({
          sales: { total_paisa: 777_700, orders: 5, by_channel: [] },
          cash: [],
          top_items: [],
          hourly: [],
          scope: { org_id: "org-zaiqa", branch_id, covers: null },
        });
  };

  /**
   * The control is re-read after every settle rather than held — the screen shows a loading state
   * between two scopes, so the `<select>` an interaction acts on is a NEW element each time and a
   * held reference is a detached node that swallows the event silently. §K of the render suite
   * records the same hazard in its own words.
   */
  const branchControl = (): HTMLSelectElement => {
    const el = document.querySelector('[data-summary-control="branch"]');
    if (el === null) throw new Error("the screen has no branch control");
    return el as HTMLSelectElement;
  };

  it("offers a choice that is not a branch, and choosing it restores the org answer", async () => {
    mount(scoped);
    await settled();

    const rollUp = Array.from(branchControl().querySelectorAll("option"))
      .map((el) => (el as HTMLOptionElement).value)
      .filter((value) => !ANSWER.branch_ids.includes(value));
    // `24-F14`: exactly one option that is not a branch, and it is the way back.
    expect(rollUp).toHaveLength(1);
    expect(flat(region("sales"))).toContain(ORG_TOTAL);

    fireEvent.change(branchControl(), { target: { value: "branch-two" } });
    await waitFor(() => {
      expect(flat(region("sales"))).toContain(BRANCH_TOTAL);
    });

    fireEvent.change(branchControl(), { target: { value: rollUp[0] } });
    await waitFor(() => {
      expect(flat(region("sales"))).toContain(ORG_TOTAL);
    });
  });
});

// ══ 6. 00 §5.7 — AN OFFLINE BRANCH IS VISUALLY DISTINCT ═══════════════════════════════════════
//
// **Survivor `no-stale-tone`.** Collapsing `{stale ? <Note tone="abnormal"> : <p>}` to the bare
// `<p>` passes all 188 tests. §I's *"stale data is visibly distinct from live data (00 §5.7)"*
// asserts `stale !== live` on TEXT, and the two sentences differ for a reason that has nothing to
// do with treatment — so the assertion is satisfied by wording alone and the FR's word is
// *visually*. The comparison below strips every text node, which is precisely the half §I already
// owns, and leaves the treatment: tag, class, and the warning glyph.

describe("6 · 00 §5.7 — the stale sync region differs from the live one in more than its words", () => {
  it("the two states do not render the same markup", async () => {
    mount(
      answerWith({ sync: { latest_arrival_ms: ago(22 * MINUTE), server_now_ms: SERVER_NOW_MS } }),
    );
    await settled();
    const staleMarkup = markupOf(region("sync"));
    const staleWords = flat(region("sync"));
    cleanup();

    mount(answerWith({ sync: { latest_arrival_ms: ago(12_000), server_now_ms: SERVER_NOW_MS } }));
    await settled();
    const liveMarkup = markupOf(region("sync"));
    const liveWords = flat(region("sync"));

    // The control: both states really did render, and they really do say different things — so a
    // failure below is about TREATMENT and cannot be read as "one of them was empty".
    expect(staleWords).not.toBe(liveWords);
    expect(staleMarkup.length).toBeGreaterThan(0);
    expect(staleMarkup).not.toBe(liveMarkup);
  });
});

// ══ 7. 01-F44 — THE DEVICE-CLOCK COUNT IS ON THE DEVICE-CLOCK LINE ════════════════════════════
//
// **Survivor `swap-honesty-labels`.** Transposing two labels in the honesty block — so 143
// delivered events are reported as *"Events stamped on a raw device clock (01-F44)"* and the 2 that
// really were are reported as the day's event count — passes all 188 tests. §H is entirely
// differential: it varies one field and asserts the block's TEXT moved, which a label swap
// preserves exactly. Nothing binds a number to the label beside it.
//
// Sentinels rather than the fixture's own numbers, so a line carrying the wrong count cannot
// coincide with the right one.

describe("7 · 01-F44 — each honesty figure sits under the label that names it", () => {
  it("the device-clock line carries the provisional count and not the event count", async () => {
    mount(
      answerWith({
        honesty: { ...ANSWER.honesty, events: 101, provisional_stamp_events: 202 },
      }),
    );
    await settled();

    const lines = Array.from(region("honesty").querySelectorAll("li")) as HTMLElement[];
    expect(lines.length).toBeGreaterThanOrEqual(4);

    const deviceClock = lines.filter((el) => /device[- ]?clock|raw clock|01-F44/i.test(flat(el)));
    expect(deviceClock).toHaveLength(1);
    expect(flat(deviceClock[0] as HTMLElement)).toMatch(/\b202\b/);
    expect(flat(deviceClock[0] as HTMLElement)).not.toMatch(/\b101\b/);

    // The other half: 101 is on the page, on some other line. Without this the assertion above is
    // satisfied by a screen that dropped the event count altogether.
    const carrying101 = lines.filter((el) => /\b101\b/.test(flat(el)));
    expect(carrying101).toHaveLength(1);
    expect(carrying101[0]).not.toBe(deviceClock[0]);
  });
});
