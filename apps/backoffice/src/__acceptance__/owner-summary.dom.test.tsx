/**
 * `14-F31` — **the nightly owner summary as a read-only desk view**, as an owner meets it.
 *
 * ⚠ **AUTHORED FROM SPEC TEXT ONLY** (`24 §3`). Written before `components/owner-summary.tsx`
 * existed, from `specs/14-backoffice.md` `14-F31`, `specs/12-owner-app.md` `12-F2`/`12-F8`/
 * `12-F10`/`12-F11`/`12-F12`/`12-F13`/`12-F21`/`12-F22`/`12-F26`, `specs/27-design-language.md`
 * `27-F12`/`27-F16`/`27-F23`, `00 §5.7` and Commandment 2. **The wire shape below was read off
 * `services/api`'s `summary.nightly` procedure — its INPUT and OUTPUT are the contract this screen
 * consumes and were not designed here** — but no assertion imports a value from that service, so an
 * implementation cannot pass by re-exporting the server's own rendering of anything.
 *
 * ── WHAT THIS SUITE IS SHAPED AGAINST ─────────────────────────────────────────────────────────
 *
 * The round-3 law of this wave: *the mechanism was built correctly and simply never aimed at the
 * case that matters.* A summary screen is unusually exposed to it, because **every one of its
 * blocks renders correctly against a fixture that never varies.** So three disciplines run through
 * every describe below:
 *
 *  1. **DIFFERENTIAL assertions.** Where a field's only job is to change what is on the screen,
 *     the suite renders two fixtures differing in exactly that field and asserts the rendered text
 *     differs. `K-4`'s defect — ~90 renders varying two of three inputs, so an implementation
 *     ignoring the third passed — is otherwise unavoidable here: an honesty block that renders a
 *     constant sentence looks perfect in a screenshot.
 *  2. **The fixture is never the shipped data.** `OMISSIONS` is a server constant today; this
 *     suite feeds omission lists that are NOT the shipped one, so a screen with the list hardcoded
 *     fails. Same for channels, items and hours.
 *  3. **The fixture is anchored FIVE YEARS from this repo's wall clock** (business day
 *     `2021-03-04`). `12-F8` says the data age is stated by the server; a client that reaches for
 *     `Date.now()` then produces a five-year error rather than a plausible one, and every age
 *     assertion below fails loudly instead of by a few seconds.
 *
 * ── THE CONTRACT THIS SUITE PINS (declared, because acceptance tests come first) ───────────────
 *
 *   module   `apps/backoffice/src/components/owner-summary.tsx`, exporting `OwnerSummary`
 *   reached  from the shipped `Workspace` navigation — the seam, and §A is the only assertion in
 *            this file that would survive the wave's recurring defect being present
 *   regions  `[data-summary-block="…"]` on: `sales`, `cash`, `corrections`, `top-items`, `hourly`,
 *            `honesty`, `omissions`, `sync`
 *   rows     `[data-channel="…"]`, `[data-shift="…"]`, `[data-item="…"]`, `[data-hour="…"]`,
 *            `[data-correction="…"]`, `[data-correction-by="…"]`, `[data-omission="…"]` — one
 *            element per server row, inside its block
 *   controls `[data-summary-control="business-date"]` (a `YYYY-MM-DD` value, `12-F13`) and
 *            `[data-summary-control="branch"]` (a `<select>`, `12-F22`)
 *   money    every figure through `packages/ui`'s `MoneyValue` — which is what makes the `27-F16`
 *            colour sweep in §D possible at all, since a formatted string carries no colour to
 *            measure
 *
 * Anchors rather than copy, deliberately: an assertion keyed to a sentence pins the wording of a
 * screen nobody has written yet, and the two failures this wave keeps producing are a vacuous test
 * and a test that stays red under a correct implementation.
 */

import { paisa, rupeesFromPaisa } from "@restos/domain";
import { palette } from "@restos/ui/tokens";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerSummary } from "../components/owner-summary";
import { Workspace } from "../components/workspace";
import { type CallLog, type Handlers, Harness } from "./harness";

afterEach(cleanup);

// ── the wire shape ────────────────────────────────────────────────────────────────────────────

type ChannelSales = { channel: string; orders: number; billed_paisa: number };
type ShiftCash = {
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
type ItemRevenue = { item_id: string; qty: number; revenue_paisa: number };
type CorrectionActor = {
  actor_user_id: string | null;
  approver_user_id: string | null;
  count: number;
  value_paisa: number;
};
type CorrectionBlock = {
  kind: "void" | "comp" | "discount";
  count: number;
  value_paisa: number;
  removed_from_sales: boolean;
  by: readonly CorrectionActor[];
};
type HourBucket = { offset: number; wall_hour: number; billed_paisa: number };
type DayState = {
  day_id: string;
  branch_id: string;
  closed: boolean;
  opening_float_paisa: number;
  counted_cash_paisa: number | null;
  deposit_paisa: number;
};
type Honesty = {
  events: number;
  provisional_stamp_events: number;
  every_day_closed: boolean;
  open_shifts: number;
  unsettled_orders: number;
  truncated: boolean;
  anomalies: readonly string[];
};
type Omission = { block: string; reason: string; fr: string };
type Answer = {
  business_date: string;
  branch_ids: readonly string[];
  sales: { total_paisa: number; orders: number; by_channel: readonly ChannelSales[] };
  cash: readonly ShiftCash[];
  corrections: readonly CorrectionBlock[];
  top_items: readonly ItemRevenue[];
  hourly: readonly HourBucket[];
  days: readonly DayState[];
  honesty: Honesty;
  omissions: readonly Omission[];
  sync: { latest_arrival_ms: number | null; server_now_ms: number };
  scope: { org_id: string; branch_id: string | null; covers: readonly string[] | null };
};

// ── the fixture, and why every number in it is the number it is ───────────────────────────────

/**
 * **Five years from this repo's wall clock, on purpose.** Every instant below is derived from
 * these two, and nothing in the screen may derive an instant from anywhere else (`12-F8`).
 */
const DAY = "2021-03-04";
/** 23:10 Asia/Karachi on the day itself — a summary read before the 05:00 cutover closes it. */
const SERVER_NOW_MS = Date.parse("2021-03-04T23:10:00+05:00");
/** `12-F8`'s stale case: the newest cloud-received event is 22 minutes old. */
const ARRIVED_22_MIN_AGO = SERVER_NOW_MS - 22 * 60_000;
/** `12-F8`'s live case: 12 s, comfortably inside the FR's 60 s. */
const ARRIVED_12_S_AGO = SERVER_NOW_MS - 12_000;

/**
 * `12-F10` bullet 1. **`dine_in` carries four real orders and zero rupees** — the row a screen
 * that filters falsy totals drops, and the row an owner most needs to see (four orders opened and
 * nothing rung). The channel ids are the `02-F42` price-key vocabulary.
 */
const CHANNELS: readonly ChannelSales[] = [
  { channel: "counter", orders: 12, billed_paisa: 240_000 },
  { channel: "whatsapp", orders: 3, billed_paisa: 61_500 },
  { channel: "dine_in", orders: 4, billed_paisa: 0 },
  { channel: "foodpanda", orders: 1, billed_paisa: 53_500 },
];

/**
 * `12-F10` bullet 4 — **top items in the server's revenue order, and three orders disagree.**
 * `chai` has the largest `qty` (40) and sits fourth; `karahi` is second by revenue and first by
 * qty among the rest; alphabetical order is a fourth permutation again. An implementation that
 * re-sorts by anything at all lands somewhere this suite can see.
 */
const TOP_ITEMS: readonly ItemRevenue[] = [
  { item_id: "item-biryani", qty: 3, revenue_paisa: 135_000 },
  { item_id: "item-karahi", qty: 12, revenue_paisa: 96_000 },
  { item_id: "item-aloo-paratha", qty: 9, revenue_paisa: 54_000 },
  { item_id: "item-chai", qty: 40, revenue_paisa: 40_000 },
  { item_id: "item-zinger", qty: 2, revenue_paisa: 30_000 },
];

/**
 * `12-F10` bullet 5. **Hour 13 sold nothing and is a MEASURED zero**, not an omission — the fold
 * emits a bucket per hour of the business day, so the empty hour is a fact about the restaurant
 * and dropping it flattens the curve's shape, which is the only thing the curve is for.
 */
const HOURLY: readonly HourBucket[] = [
  { offset: 6, wall_hour: 11, billed_paisa: 42_000 },
  { offset: 7, wall_hour: 12, billed_paisa: 118_500 },
  { offset: 8, wall_hour: 13, billed_paisa: 0 },
  { offset: 9, wall_hour: 14, billed_paisa: 96_500 },
  { offset: 10, wall_hour: 15, billed_paisa: 98_000 },
];

/**
 * `12-F10` bullet 2, and **the four rows are four different sentences.**
 *
 *   - `shift-morning`  closed, counted exactly — variance 0, which is ORDINARY and takes no colour
 *   - `shift-evening`  closed SHORT by Rs 15 — `02-F23`'s signed variance, negative (`registry.ts`
 *                      and `CashSurfaces.tsx` both fix the convention: over positive, short
 *                      negative). This is the abnormal case `27-F16` exists for.
 *   - `shift-night`    closed OVER by Rs 7.50 — the other direction, because a suite carrying only
 *                      a short cannot tell a correct screen from one that prints "SHORT" always
 *   - `shift-open`     open, uncounted, and its cashier's `shift.opened` is outside the window, so
 *                      `expected`, `counted`, `variance` and `cashier_user_id` are ALL null. The
 *                      row a placeholder turns into "Rs 0, no variance, all square" — Commandment 2
 */
const CASH: readonly ShiftCash[] = [
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
    counted_cash_paisa: 90_750,
    variance_paisa: 750,
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

/**
 * **NOT the shipped `OMISSIONS` list.** `12-F11`'s margin entry is here because the FR names it;
 * the loyalty entry is here because no such entry exists in `services/api` and a screen holding a
 * copy of today's seven blocks would render it and miss this one entirely.
 */
const OMISSIONS: readonly Omission[] = [
  {
    block: "Estimated gross margin",
    reason:
      "12-F11 omits the margin line whenever recipe coverage is below 13-F5's precondition. " +
      "Recipe data does not exist at all, so coverage is 0%.",
    fr: "12-F11",
  },
  {
    block: "Loyalty points issued",
    reason: "doc 17 is Wave 5 and no loyalty event can be emitted by anything shipping today.",
    fr: "12-F10",
  },
];

/** Real fold anomaly names (`services/api/src/summary.ts`), never invented ones. */
const ANOMALIES = ["shift_close_divergence", "unbound_drawer_open"] as const;

const HONESTY: Honesty = {
  events: 143,
  provisional_stamp_events: 2,
  every_day_closed: false,
  open_shifts: 1,
  unsettled_orders: 3,
  truncated: true,
  anomalies: ANOMALIES,
};

/**
 * `12-F10` bullet 3, and the fixture is shaped around the one thing this block can get wrong.
 *
 * **The void and the comp carry the SAME money, Rs 120, and differ only in `removed_from_sales`.**
 * A void's value is already out of `sales.total_paisa` (the line exited, and the till's attested
 * bill never held it); a comp's is not, because a comp is recorded and does not move the bill. A
 * screen that printed one sentence for both would be indistinguishable from a correct one on any
 * fixture where the figures differed, so here they do not.
 *
 * The discount row carries a **measured zero** and no attribution — the row a screen that filtered
 * empty kinds would drop, which cannot then tell "no discounts today" from "not computed".
 *
 * `void.by` holds TWO rows for one cashier: one act she needed a manager for, one the manager did
 * herself. `02-F20`'s two identities, and `null` on the second means *no approval was involved*
 * rather than *nobody approved it*.
 */
const CORRECTIONS: readonly CorrectionBlock[] = [
  {
    kind: "void",
    count: 3,
    value_paisa: 12_000,
    removed_from_sales: true,
    by: [
      { actor_user_id: "user-ayesha", approver_user_id: null, count: 1, value_paisa: 4_000 },
      {
        actor_user_id: "user-hina",
        approver_user_id: "user-ayesha",
        count: 2,
        value_paisa: 8_000,
      },
    ],
  },
  {
    kind: "comp",
    count: 1,
    value_paisa: 12_000,
    removed_from_sales: false,
    by: [
      {
        actor_user_id: "user-hina",
        approver_user_id: "user-ayesha",
        count: 1,
        value_paisa: 12_000,
      },
    ],
  },
  { kind: "discount", count: 0, value_paisa: 0, removed_from_sales: false, by: [] },
];

const DAYS: readonly DayState[] = [
  {
    day_id: "day-main",
    branch_id: "branch-main",
    closed: true,
    opening_float_paisa: 500_000,
    counted_cash_paisa: 640_000,
    deposit_paisa: 600_000,
  },
  {
    day_id: "day-two",
    branch_id: "branch-two",
    closed: false,
    opening_float_paisa: 300_000,
    counted_cash_paisa: null,
    deposit_paisa: 0,
  },
];

const ANSWER: Answer = {
  business_date: DAY,
  branch_ids: ["branch-main", "branch-two"],
  sales: { total_paisa: 355_000, orders: 20, by_channel: CHANNELS },
  cash: CASH,
  corrections: CORRECTIONS,
  top_items: TOP_ITEMS,
  hourly: HOURLY,
  days: DAYS,
  honesty: HONESTY,
  omissions: OMISSIONS,
  sync: { latest_arrival_ms: ARRIVED_22_MIN_AGO, server_now_ms: SERVER_NOW_MS },
  scope: { org_id: "org-zaiqa", branch_id: null, covers: null },
};

/** A shallow override, so a test states only the field it is varying. */
const answerWith = (over: Partial<Answer>): Answer => ({ ...ANSWER, ...over });

// ── mounting and reading the screen ───────────────────────────────────────────────────────────

/**
 * `01-F68`/`01-F69` and `11-F20` — the two directories this report resolves its ids through
 * (`21-F15`). **THE FIXTURE IS THE COVERAGE HERE, exactly as the device list records for its actor
 * column.** `branch-two` is absent from the branch list and `user-bilal` is absent from the roster,
 * so one branch and one cashier on this screen stand on the unnamed treatment while the rest are
 * named — and a third state, *the server did not attribute this shift at all*, is already carried
 * by `shift-open`. A suite that named everything could not tell a correct implementation from one
 * that renders whatever a directory happens to hold.
 */
const DIRECTORY = {
  org: { org_id: "org-zaiqa", display_name: "Karachi Biryani House", status: "active" },
  branches: [
    {
      branch_id: "branch-main",
      display_name: "Tariq Road",
      branch_type: "branch",
      branch_class: "production",
    },
  ],
};

const ROSTER = [
  {
    user_id: "user-hina",
    display_name: "Hina Raza",
    email: null,
    grid_ordinal: 1,
    assignments: [],
  },
  {
    user_id: "user-ayesha",
    display_name: "Ayesha Khan",
    email: "ayesha@example.test",
    grid_ordinal: 2,
    assignments: [],
  },
];

const mount = (answer: Answer | (() => unknown), extra: Handlers = {}): CallLog => {
  const log: CallLog = [];
  const nightly = typeof answer === "function" ? answer : () => answer;
  render(
    <Harness
      log={log}
      handlers={{
        "summary.nightly": nightly,
        "tenancy.directory": () => DIRECTORY,
        "users.list": () => ROSTER,
        ...extra,
      }}
    >
      <OwnerSummary />
    </Harness>,
  );
  return log;
};

/**
 * Waits for the two naming reads to land. Waiting on a NAME is what makes this a real wait — the
 * treatment is on screen from the first paint, so waiting on a key would return immediately.
 */
const named = async (): Promise<void> => {
  await waitFor(() => {
    if (!(document.body.textContent ?? "").includes("Ayesha Khan")) {
      throw new Error("the roster has not landed yet");
    }
  });
};

/** Waits for the query to land. Every read below happens after this. */
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

/** A region's text, whitespace-collapsed so an assertion is not a formatting contract. */
const textOf = (name: string): string =>
  (region(name).textContent ?? "").replace(/\s+/g, " ").trim();

const rowsOf = (name: string, attribute: string): HTMLElement[] =>
  Array.from(region(name).querySelectorAll(`[${attribute}]`)) as HTMLElement[];

const rowText = (el: HTMLElement): string => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * **Every money figure on the screen, found by `MoneyValue`'s own signature.**
 *
 * `27-F26` binds `font-variant-numeric: tabular-nums` on the component, and it is the one property
 * a hand-rolled `Rs …` string in this app does not carry — so this finds money that went through
 * the semantic component and *misses* money that did not, which is exactly the discrimination
 * Commandment 6 wants. The `Rs` assertion in §D closes the other half: a screen that renders no
 * money at all would otherwise pass an "every figure is uncoloured" sweep vacuously.
 */
const moneyNodes = (root: ParentNode = document.body): HTMLElement[] =>
  (Array.from(root.querySelectorAll("span[style]")) as HTMLElement[]).filter((el) =>
    (el.getAttribute("style") ?? "").includes("tabular-nums"),
  );

/** `#rrggbb` or `rgb(r, g, b)` → lowercase `#rrggbb`, so the two spellings compare equal. */
const asHex = (raw: string): string => {
  const value = raw.trim().toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value);
  if (rgb === null) return value;
  return `#${[rgb[1], rgb[2], rgb[3]]
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")}`;
};

const colourOf = (el: HTMLElement): string => asHex(el.style.color);

/**
 * `27-F23`'s rendering contract, restated here rather than imported from the component layer —
 * `Rs`, symbol-first, Western 3-digit grouping, no decimals. Restated on purpose: an assertion
 * that called the app's own formatter would agree with whatever formatter the app happened to
 * have, which is a tautology rather than a test.
 *
 * The paisa→rupee divide is `domain`'s, because `DEC-MONEY-005` bans this file doing it — and the
 * GritQL rail proved that live while this line was being written.
 */
const rupees = (value: number): string =>
  `Rs ${rupeesFromPaisa(paisa(value)).rupees.toLocaleString("en-US")}`;

const DEFAULT_INK = asHex(palette.light["fgColor-default"]);
const ABNORMAL_INK = asHex(palette.light["fgColor-status-fault"]);

/** The refusal shape `services/api`'s `errorFormatter` puts on the wire for `12-F2`. */
const forbidden = (message: string): never => {
  throw TRPCClientError.from({
    error: { code: -32003, message, data: { code: "FORBIDDEN", httpStatus: 403 } },
  });
};

/** Long enough for a call to reach the link, so "nothing was sent" means refused, not early. */
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 50));

// ══ A. THE SEAM ═══════════════════════════════════════════════════════════════════════════════
//
// **The one assertion in this file that the wave's recurring defect can fail.** Every other test
// mounts `OwnerSummary` directly, and a perfect screen no shipped navigation reaches would pass
// all of them — that is instance (1) through (14) of *a correct subsystem with no seam to the
// product*, reproduced inside the suite meant to prevent it. So this renders the SHIPPED
// `Workspace` and reaches the summary the way an owner does.

describe("A · 14-F31 — the shipped back office reaches this screen", () => {
  /**
   * **Did the click just made put the summary on the screen?** Asked once per navigation control.
   *
   * It asks exactly the question `settled()` asks — is there a `[data-summary-block]` — so a `true`
   * from this probe and a `settled()` below cannot disagree about what "the summary is up" means.
   *
   * The budget is `waitFor`'s own default, which is the budget every other read in this file
   * already spends on the same query landing; a probe on a tighter one would be inventing a second
   * standard for how long this screen is allowed to take. It is BOUNDED, and the bound is safe in
   * the only direction that matters: a false POSITIVE is impossible — the block is in the document
   * or it is not — and a false NEGATIVE reds this test by name on the `expect` below rather than
   * passing it quietly. The cost is one budget per control that is NOT the summary's, paid once.
   */
  const PROBE_MS = 1_000;
  const clickMountedTheSummary = async (): Promise<boolean> => {
    try {
      await waitFor(
        () => {
          if (document.querySelector("[data-summary-block]") === null) {
            throw new Error("this control did not mount the summary");
          }
        },
        { timeout: PROBE_MS, interval: 10 },
      );
      return true;
    } catch {
      return false;
    }
  };

  /**
   * ⚠ **REPAIRED 18 August 2026. What this fixture used to rely on is written down here so that
   * the next appended section does not re-break it.**
   *
   * *What it did:* clicked every control in the rail in DOM order and then asked, ONCE and at the
   * end, whether the summary was on screen. `Workspace` renders one section and unmounts the
   * others ("Mounted, not hidden: the inactive section's queries should not run"), so that single
   * trailing question was really a question about the state left by the LAST click. It passed only
   * because Summary happened to be the last tab on the day it was written.
   *
   * *Why that stopped being true:* `14-F14`'s staff section was appended as a fourth tab.
   * `14-F31` recorded the rule when the third landed and `27-F4` is why it binds — a new section
   * goes AFTER the sections that exist, never between them — so the final click now lands on Staff
   * and the summary is unmounted when the assertion runs. **The tab ORDER was never part of this
   * test's claim.** It was an accident of there being three tabs, the assertion silently depended
   * on it, and a fifth appended section would have broken it again for the same reason.
   *
   * *The repair is a STRENGTHENING.* The question is now asked after EVERY click, so the test no
   * longer cares where in the rail the summary's control sits, how many sections precede it or how
   * many follow. The control that mounted it is then clicked AGAIN, last, from wherever the sweep
   * ended — which additionally proves an owner can come BACK to the summary after visiting another
   * section, a claim the old fixture could not make at all. `24-F14`'s empty-match protection moves
   * with it: "no control in this rail mounts the summary" — the wave's recurring defect, a correct
   * screen the product never reaches — now fails here, by name, instead of surfacing as a
   * `settled()` timeout inside a helper that cannot say what it was waiting for.
   *
   * *Measured, not argued* (the round-3 law: a claim that a test bites is not evidence that it
   * does). Five stand-in workspaces, built out of tree, differing in exactly where the summary sits
   * in the rail — the old fixture, this one, and **the control**, which is this one minus its final
   * re-click and nothing else:
   *
   * ```
   * world                                     OLD    THIS   minus the re-click
   * W1  summary LAST of 4 (as authored)       PASS   PASS   PASS
   * W2  summary THIRD of 4 (shipped today)    FAIL   PASS   PASS
   * W3  summary FIRST of 4                    FAIL   PASS   PASS
   * W4  no tab mounts it (the defect)         FAIL   FAIL   FAIL   ← by name, both
   * W5  reachable ONCE, not returnable        FAIL   FAIL   PASS   ← the re-click is load-bearing
   * ```
   *
   * W2/W3 are the repair: the two cells that moved are exactly the order-dependent ones. **W4 is
   * what makes it a strengthening rather than a weakening** — the defect this test exists to catch
   * still kills it. **W5 is why the re-click is not decoration**: without it, a shell an owner can
   * reach the summary from once and never again passes.
   *
   * *What is deliberately NOT asserted:* that exactly one control mounts it. The title's claim is
   * "some control", and a stricter count would be this file's other failure mode — a test that
   * stays red under a correct implementation — the day a second surface legitimately carries a
   * summary block.
   *
   * *No local `testTimeout` override, deliberately.* The sweep's cost grows with the rail — one
   * `PROBE_MS` per section that is not the summary — so the question was asked, and `vitest.
   * config.ts` already answers it: 60 s per project, raised on purpose and with a warning against
   * weakening it. A number written here would be a SMALLER budget than the one the app decided on,
   * hidden at the bottom of one test, which is how the config file's own documented trap
   * (a root `testTimeout` silently not inheriting) got its second life.
   */
  it("some control in the workspace navigation mounts the summary and it asks the server", async () => {
    const log: CallLog = [];
    render(
      <Harness
        log={log}
        handlers={{
          "summary.nightly": () => ANSWER,
          "catalog.published": () => ({ version: 3, entries: [] }),
          "catalog.enabled": () => ({ branches: ["branch-main"], channels: ["counter"] }),
          "catalog.pending": () => [],
          "catalog.history": () => [],
          "devices.list": () => [],
        }}
      >
        <Workspace />
      </Harness>,
    );

    // Deliberately copy-blind: click every navigation control there is, and identify none of
    // them by its word, its index, or its place in the rail. The claim is that the summary is
    // REACHABLE from the shipped shell, not that a particular word sits on a particular tab.
    // Sections whose handlers are absent above are supposed to be clicked too — this test says
    // nothing about them, and a rail it had to be taught the names of would be a rail it could
    // no longer sweep blind.
    const nav = document.querySelector("nav");
    expect(nav).not.toBeNull();
    const controls = Array.from((nav as HTMLElement).querySelectorAll("button"));
    // `24-F14` empty-match protection: a navigation that lost its buttons must fail here rather
    // than pass by finding nothing to click.
    expect(controls.length).toBeGreaterThanOrEqual(3);

    const mounters: HTMLElement[] = [];
    for (const control of controls) {
      fireEvent.click(control);
      if (await clickMountedTheSummary()) mounters.push(control);
    }

    // The second empty-match protection, and the one the old fixture got for free from tab
    // order: a whole rail swept with the summary appearing NOWHERE is the recurring defect, and
    // it must be named rather than time out somewhere else.
    expect(
      mounters.length,
      "no control in the workspace navigation mounts the owner summary",
    ).toBeGreaterThan(0);

    // Back to it, last, from whichever section the sweep ended on.
    fireEvent.click(mounters[0] as HTMLElement);
    await waitFor(() => {
      expect(log.some((call) => call.path === "summary.nightly")).toBe(true);
    });
    await settled();
    expect(region("sales")).toBeTruthy();
  });
});

// ══ B. 12-F10 bullet 1 — SALES TOTAL & ORDER COUNT BY CHANNEL ═════════════════════════════════

describe("B · 12-F10 — sales total and order count by channel", () => {
  it("renders a row per channel the server sent, with BOTH its order count and its money", async () => {
    mount(ANSWER);
    await settled();
    const rows = rowsOf("sales", "data-channel");
    expect(rows.map((el) => el.getAttribute("data-channel"))).toEqual(
      CHANNELS.map((c) => c.channel),
    );
    for (const channel of CHANNELS) {
      const row = rows.find((el) => el.getAttribute("data-channel") === channel.channel);
      const text = rowText(row as HTMLElement);
      // The order COUNT, which is half of what the FR asks for and the half a money-only row drops.
      expect(text).toMatch(new RegExp(`\\b${channel.orders}\\b`));
      expect(text).toContain(rupees(channel.billed_paisa));
    }
  });

  it("keeps the channel that took four orders and no money — a zero is not an absence", async () => {
    mount(ANSWER);
    await settled();
    const row = rowsOf("sales", "data-channel").find(
      (el) => el.getAttribute("data-channel") === "dine_in",
    );
    expect(row).toBeDefined();
    const text = rowText(row as HTMLElement);
    expect(text).toMatch(/\b4\b/);
    expect(text).toContain("Rs 0");
  });

  it("renders the money the way 27-F23 fixes it: Rs first, 3-digit grouping, no decimals", async () => {
    mount(ANSWER);
    await settled();
    // Rs 2,400 — `counter`'s 240,000 paisa. Symbol-first and Western-grouped, and the assertion
    // names the exact string because `27-F23` is a rendering contract rather than a value.
    expect(textOf("sales")).toContain("Rs 2,400");
    expect(textOf("sales")).not.toMatch(/\d\.\d/);
    expect(textOf("sales")).not.toContain("₨");
    expect(textOf("sales")).not.toContain("PKR");
  });

  /**
   * **The fixture below is one no fold can produce, and that is the whole reason it exists.**
   *
   * `sales.total_paisa` and the sum of `by_channel` disagree by Rs 9,999. Only two implementations
   * can be told apart by it: one that renders the server's stated total (`12-F21` — every
   * displayed figure resolves to a semantic-layer metric, and the analyst citing the same metric
   * returns the identical value) and one that re-adds the channels in the browser. The second is
   * the plausible wrong implementation, it is invisible against every consistent fixture, and on
   * a truncated day it would put a different number on the screen from the one the brief cites.
   */
  it("shows the SERVER's total and order count, never a client-side re-sum", async () => {
    mount(
      answerWith({
        sales: { total_paisa: 1_354_900, orders: 77, by_channel: CHANNELS },
      }),
    );
    await settled();
    expect(textOf("sales")).toContain("Rs 13,549");
    expect(textOf("sales")).toMatch(/\b77\b/);
    // The control: the client-side sums must NOT be what is shown.
    expect(textOf("sales")).not.toContain("Rs 3,550");
  });
});

// ══ C. 12-F10 bullet 2 — CASH EXPECTED VS COUNTED PER CASHIER ═════════════════════════════════

describe("C · 12-F10 — cash expected vs counted per cashier", () => {
  it("renders a row per shift, naming the cashier and both figures", async () => {
    mount(ANSWER);
    await settled();
    await named();
    const rows = rowsOf("cash", "data-shift");
    expect(rows.map((el) => el.getAttribute("data-shift"))).toEqual(CASH.map((s) => s.shift_id));

    const evening = rowText(
      rows.find((el) => el.getAttribute("data-shift") === "shift-evening") as HTMLElement,
    );
    // BY NAME (`11-F20`, `21-F15`). The row is still FOUND by `data-shift`, which is a key on an
    // attribute and never on the glass.
    expect(evening).toContain("Ayesha Khan");
    expect(evening).toContain("Rs 1,200"); // expected
    expect(evening).toContain("Rs 1,185"); // counted
  });

  it("27-F12 — a short drawer is a WORD and a magnitude, never a minus sign", async () => {
    mount(ANSWER);
    await settled();
    const evening = rowText(
      rowsOf("cash", "data-shift").find(
        (el) => el.getAttribute("data-shift") === "shift-evening",
      ) as HTMLElement,
    );
    expect(evening).toContain("SHORT Rs 15");
    // The failure `27-F12` is written against: one glyph carrying the entire direction.
    expect(evening).not.toContain("-Rs");
    expect(evening).not.toContain("−15");
    expect(evening).not.toMatch(/Rs\s*-/);
  });

  it("renders the OVER direction too, so the screen is not printing one word always", async () => {
    mount(ANSWER);
    await settled();
    const night = rowText(
      rowsOf("cash", "data-shift").find(
        (el) => el.getAttribute("data-shift") === "shift-night",
      ) as HTMLElement,
    );
    expect(night).toContain("OVER Rs 7");
    expect(night).not.toContain("SHORT");
  });

  it("a variance of exactly zero carries no direction word — 'OVER Rs 0' is not a thing", async () => {
    mount(ANSWER);
    await settled();
    const morning = rowText(
      rowsOf("cash", "data-shift").find(
        (el) => el.getAttribute("data-shift") === "shift-morning",
      ) as HTMLElement,
    );
    expect(morning).not.toContain("OVER");
    expect(morning).not.toContain("SHORT");
    expect(morning).toContain("Rs 500");
  });

  /**
   * **The Commandment 2 row.** An open shift has no expected figure, no count and no variance, and
   * its `shift.opened` fell outside the window so it has no cashier either. Four nulls. The
   * plausible wrong implementation coalesces each to `0` / `—` and the row then reads *counted
   * nothing, all square* — a placeholder that looks like data, about the one number in this report
   * that costs a cashier their job.
   */
  it("an OPEN, uncounted shift states its absences instead of rendering zeros", async () => {
    mount(ANSWER);
    await settled();
    const row = rowsOf("cash", "data-shift").find(
      (el) => el.getAttribute("data-shift") === "shift-open",
    ) as HTMLElement;
    expect(row).toBeDefined();
    const text = rowText(row);

    // No money at all on this row — not through `MoneyValue`, not as a string.
    expect(moneyNodes(row)).toHaveLength(0);
    expect(text).not.toContain("Rs");
    // …and no invented direction.
    expect(text).not.toContain("OVER");
    expect(text).not.toContain("SHORT");
    // The row still SAYS something: it is open, and its cashier is not on the record.
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/open|not closed|not counted|still counting/i);
    expect(text).toMatch(/not recorded|not known|unknown|no cashier/i);
    // The control that stops the two assertions above passing against a blanked row.
    expect(text).toContain("shift-open");
  });
});

// ══ D. 27-F16 — THE COLOUR SWEEP ══════════════════════════════════════════════════════════════
//
// `27-F16`: *"Money is never coloured by default. Colour on a number means* this number is
// abnormal*."* On this screen exactly one figure is abnormal — a closed shift whose carried
// `variance_paisa` is non-zero (`12-F10`: "with over/short highlighted"). Everything else, up to
// and including the largest number on the page, takes `fgColor-default`.
//
// The sweep is written as a SET EQUALITY rather than as per-element checks, because the plausible
// wrong implementations differ in *which* elements they colour: the day's total (the commonest
// number, which is precisely what the FR forbids), the whole variance ROW including the expected
// and counted figures it is measured against, or a zero variance.

describe("D · 27-F16 — signal colour is spent on the abnormal figure and nothing else", () => {
  const sweep = (): { abnormal: string[]; ordinary: string[] } => {
    const nodes = moneyNodes();
    return {
      abnormal: nodes
        .filter((el) => colourOf(el) === ABNORMAL_INK)
        .map(rowText)
        .sort(),
      ordinary: nodes
        .filter((el) => colourOf(el) === DEFAULT_INK)
        .map(rowText)
        .sort(),
    };
  };

  it("every money figure went through MoneyValue — the sweep has something to measure", async () => {
    mount(ANSWER);
    await settled();
    // `24-F14` empty-match protection. Without this the two assertions below pass on a blank page,
    // and every one of them is a claim about a set that would then be empty.
    const nodes = moneyNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(10);
    for (const node of nodes) expect(rowText(node)).toMatch(/^(OVER |SHORT )?Rs [\d,]+$/);
    // Commandment 6 seen from the DOM: nothing on this screen paints money a third colour.
    for (const node of nodes) expect([DEFAULT_INK, ABNORMAL_INK]).toContain(colourOf(node));
  });

  it("the two non-zero variances are coloured and NOTHING else is", async () => {
    mount(ANSWER);
    await settled();
    expect(sweep().abnormal).toEqual(["OVER Rs 7", "SHORT Rs 15"]);
  });

  it("the day's total — the biggest number on the page — is uncoloured", async () => {
    mount(ANSWER);
    await settled();
    const total = moneyNodes(region("sales")).find((el) => rowText(el) === "Rs 3,550");
    expect(total).toBeDefined();
    expect(colourOf(total as HTMLElement)).toBe(DEFAULT_INK);
  });

  it("the expected and counted figures BESIDE a short variance stay uncoloured", async () => {
    mount(ANSWER);
    await settled();
    const row = rowsOf("cash", "data-shift").find(
      (el) => el.getAttribute("data-shift") === "shift-evening",
    ) as HTMLElement;
    const inRow = moneyNodes(row);
    expect(inRow.map(rowText).sort()).toEqual(["Rs 1,185", "Rs 1,200", "SHORT Rs 15"]);
    for (const node of inRow) {
      const expected = rowText(node) === "SHORT Rs 15" ? ABNORMAL_INK : DEFAULT_INK;
      expect(colourOf(node)).toBe(expected);
    }
  });

  it("a variance of zero is ORDINARY — a balanced drawer takes no signal colour", async () => {
    mount(ANSWER);
    await settled();
    const row = rowsOf("cash", "data-shift").find(
      (el) => el.getAttribute("data-shift") === "shift-morning",
    ) as HTMLElement;
    for (const node of moneyNodes(row)) expect(colourOf(node)).toBe(DEFAULT_INK);
  });

  /**
   * The differential half. With every variance zeroed, **nothing on the screen is coloured** — so
   * an implementation that paints a fixed element (the variance column, the last row, the total)
   * cannot pass both this and the test above.
   */
  it("a day where every drawer balanced has NO coloured figure at all", async () => {
    mount(
      answerWith({
        cash: CASH.map((shift) =>
          shift.variance_paisa === null
            ? shift
            : { ...shift, counted_cash_paisa: shift.expected_cash_paisa, variance_paisa: 0 },
        ),
      }),
    );
    await settled();
    expect(sweep().abnormal).toEqual([]);
    expect(moneyNodes().length).toBeGreaterThanOrEqual(10);
  });
});

// ══ E. 12-F10 bullet 4 — TOP 5 ITEMS BY REVENUE ═══════════════════════════════════════════════

describe("E · 12-F10 — top items by revenue", () => {
  it("renders every item the server ranked, in the SERVER's order", async () => {
    mount(ANSWER);
    await settled();
    expect(rowsOf("top-items", "data-item").map((el) => el.getAttribute("data-item"))).toEqual(
      TOP_ITEMS.map((i) => i.item_id),
    );
  });

  it("carries the quantity as well as the revenue", async () => {
    mount(ANSWER);
    await settled();
    const chai = rowsOf("top-items", "data-item").find(
      (el) => el.getAttribute("data-item") === "item-chai",
    ) as HTMLElement;
    expect(rowText(chai)).toMatch(/\b40\b/);
    expect(rowText(chai)).toContain("Rs 400");
  });

  /**
   * The ranking is the SERVER's (`12-F21` — one number, and one order, everywhere). A second
   * fixture whose order is the reverse of the first proves the screen is not sorting: a client
   * that re-sorts by revenue renders both fixtures identically, and this one is the odd fixture
   * out. Three orderings are live in the data — revenue, quantity and alphabetical — and no
   * client-side sort key reproduces the list below.
   */
  it("does not re-rank: a deliberately unsorted answer renders exactly as it arrived", async () => {
    const scrambled = [...TOP_ITEMS].reverse();
    mount(answerWith({ top_items: scrambled }));
    await settled();
    expect(rowsOf("top-items", "data-item").map((el) => el.getAttribute("data-item"))).toEqual(
      scrambled.map((i) => i.item_id),
    );
  });

  it("a day with no items says so rather than drawing an empty frame", async () => {
    mount(answerWith({ top_items: [] }));
    await settled();
    expect(rowsOf("top-items", "data-item")).toHaveLength(0);
    expect(textOf("top-items").length).toBeGreaterThan(0);
  });
});

// ══ F. 12-F10 bullet 5 — THE HOURLY CURVE ═════════════════════════════════════════════════════

describe("F · 12-F10 — the hourly sales curve", () => {
  it("renders one entry per bucket, labelled with the SERVER's wall hour", async () => {
    mount(ANSWER);
    await settled();
    const rows = rowsOf("hourly", "data-hour");
    expect(rows.map((el) => el.getAttribute("data-hour"))).toEqual(
      HOURLY.map((h) => String(h.offset)),
    );
    for (const bucket of HOURLY) {
      const row = rows.find(
        (el) => el.getAttribute("data-hour") === String(bucket.offset),
      ) as HTMLElement;
      // The WALL hour, not the offset — the offset is a cutover-relative index and would put the
      // lunch peak at "07:00" on an axis an owner reads as clock time (`01-F46`).
      expect(rowText(row)).toMatch(new RegExp(`\\b${bucket.wall_hour}\\b`));
    }
  });

  it("keeps the hour that sold nothing — the shape of the curve is the point", async () => {
    mount(ANSWER);
    await settled();
    const dead = rowsOf("hourly", "data-hour").find((el) => el.getAttribute("data-hour") === "8");
    expect(dead).toBeDefined();
    expect(rowText(dead as HTMLElement)).toContain("Rs 0");
  });

  it("draws the hours the server sent and no others", async () => {
    // Two buckets only — a lunch-only day. A screen padding to a fixed 24-hour axis invents
    // twenty-two hours of measured zero from a window that never covered them.
    const short: readonly HourBucket[] = [
      { offset: 7, wall_hour: 12, billed_paisa: 61_500 },
      { offset: 8, wall_hour: 13, billed_paisa: 12_000 },
    ];
    mount(answerWith({ hourly: short }));
    await settled();
    expect(rowsOf("hourly", "data-hour")).toHaveLength(2);
  });
});

// ══ G. OMISSIONS AS CONTENT — 12-F11 AND COMMANDMENT 2 ════════════════════════════════════════

describe("G · the summary's own omissions, rendered as content", () => {
  it("renders every omission the server sent, with its reason and its FR", async () => {
    mount(ANSWER);
    await settled();
    const rows = rowsOf("omissions", "data-omission");
    expect(rows.map((el) => el.getAttribute("data-omission"))).toEqual(
      OMISSIONS.map((o) => o.block),
    );
    const text = textOf("omissions");
    for (const omission of OMISSIONS) {
      expect(text).toContain(omission.block);
      // The reason, not a house sentence: `12-F11`'s margin and doc 17's loyalty are absent for
      // completely different reasons and an owner deciding what to trust needs the difference.
      expect(text).toContain(omission.reason);
      expect(text).toContain(omission.fr);
    }
  });

  it("12-F11 — the margin block is a stated omission and never a zero or a guess", async () => {
    mount(ANSWER);
    await settled();
    expect(textOf("omissions")).toContain("Estimated gross margin");
    expect(textOf("omissions")).toContain("12-F11");
    // Nowhere on the screen is there a margin FIGURE. `12-F11` is explicit: never guessed, never
    // shown as zero — so no percentage may appear at all.
    const page = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(page).not.toMatch(/margin[^.]{0,40}\d+\s*%/i);
    expect(page).not.toMatch(/\d+\s*%\s*(gross )?margin/i);
  });

  /**
   * **The list is DATA.** A screen holding a copy of today's seven blocks passes every fixture
   * equal to that list and silently drops the eighth the day the server adds one — which is the
   * failure mode `services/api`'s own `OMISSIONS` doc comment is written against ("it travels to
   * the screen and the screen renders it").
   */
  it("renders an omission this product has never shipped", async () => {
    mount(
      answerWith({
        omissions: [
          {
            block: "Rider settlement",
            reason: "doc 09 is unbuilt; no rider event exists to count.",
            fr: "12-F10",
          },
        ],
      }),
    );
    await settled();
    expect(
      rowsOf("omissions", "data-omission").map((el) => el.getAttribute("data-omission")),
    ).toEqual(["Rider settlement"]);
    expect(textOf("omissions")).toContain("doc 09 is unbuilt");
    // …and the hardcoded list is gone with it.
    expect(textOf("omissions")).not.toContain("Estimated gross margin");
  });

  it("an empty omission list is not an empty region — it is a claim, and must read as one", async () => {
    mount(answerWith({ omissions: [] }));
    await settled();
    expect(rowsOf("omissions", "data-omission")).toHaveLength(0);
    expect(textOf("omissions").length).toBeGreaterThan(0);
  });
});

// ══ H. THE HONESTY BLOCK — 00 §5.7, 12-F9 ═════════════════════════════════════════════════════
//
// **Every assertion here is DIFFERENTIAL**, because an honesty block is the single easiest thing
// in this screen to build vacuously: render six labels and a constant sentence and it photographs
// perfectly. Each test varies exactly one field and asserts the block's text moves.

describe("H · the honesty block reads every field the server states", () => {
  const honestyTextFor = async (over: Partial<Honesty>): Promise<string> => {
    mount(answerWith({ honesty: { ...HONESTY, ...over } }));
    await settled();
    const text = textOf("honesty");
    cleanup();
    return text;
  };

  it("says how many delivered events the window held", async () => {
    const a = await honestyTextFor({ events: 143 });
    const b = await honestyTextFor({ events: 9_412 });
    expect(a).not.toBe(b);
    expect(a).toMatch(/\b143\b/);
    expect(b).toMatch(/9,?412/);
  });

  it("01-F44 — reports events stamped on a raw device clock", async () => {
    const some = await honestyTextFor({ provisional_stamp_events: 2 });
    const none = await honestyTextFor({ provisional_stamp_events: 0 });
    expect(some).not.toBe(none);
    expect(some).toMatch(/\b2\b/);
  });

  it("12-F9 — an unclosed day makes the figures PROVISIONAL, and says the word", async () => {
    const open = await honestyTextFor({ every_day_closed: false });
    const closed = await honestyTextFor({ every_day_closed: true });
    expect(open).not.toBe(closed);
    expect(open).toMatch(/provisional/i);
    expect(closed).not.toMatch(/provisional/i);
  });

  it("counts shifts whose money is still in an open drawer", async () => {
    const one = await honestyTextFor({ open_shifts: 1 });
    const none = await honestyTextFor({ open_shifts: 0 });
    expect(one).not.toBe(none);
  });

  it("a truncated window makes every total a FLOOR, and the screen says so", async () => {
    const cut = await honestyTextFor({ truncated: true });
    const whole = await honestyTextFor({ truncated: false });
    expect(cut).not.toBe(whole);
    expect(cut).toMatch(/incomplete|floor|truncat|partial|at least|not the whole/i);
    expect(whole).not.toMatch(/incomplete|truncat|at least/i);
  });

  it("names each fold anomaly the server reported", async () => {
    const some = await honestyTextFor({ anomalies: ANOMALIES });
    const none = await honestyTextFor({ anomalies: [] });
    expect(some).not.toBe(none);
    for (const anomaly of ANOMALIES) expect(some).toContain(anomaly);
  });

  /**
   * `services/api`'s `OMISSIONS` says it in the corpus's own words: *"The anomalies reported above
   * are the ledger's own 01-F31/02-F37/02-F43 facts. They are not alerts and are not labelled as
   * any."* `12-F14a`'s alert classes cannot fire — `alert.raised` has no schema and no producer —
   * so a screen calling these alerts tells an owner the intelligence plane is watching.
   */
  it("does not call an anomaly an ALERT", async () => {
    mount(ANSWER);
    await settled();
    expect(textOf("honesty")).not.toMatch(/\balert/i);
  });

  /**
   * **The distinction the track brief turns on: honesty is CONTENT, not an error state.** With the
   * window truncated, a day unclosed, a shift open and two anomalies raised, an owner still gets
   * the figures — because a report that hides its numbers whenever it has a caveat is a report
   * nobody can use on the one night it matters.
   */
  it("a day with every caveat raised still renders all four 12-F10 blocks", async () => {
    mount(ANSWER);
    await settled();
    expect(rowsOf("sales", "data-channel").length).toBeGreaterThan(0);
    expect(rowsOf("cash", "data-shift").length).toBeGreaterThan(0);
    expect(rowsOf("top-items", "data-item").length).toBeGreaterThan(0);
    expect(rowsOf("hourly", "data-hour").length).toBeGreaterThan(0);
    expect(textOf("sales")).toContain("Rs 3,550");
  });
});

// ══ I. 12-F8 — THE DATA AGE, AS THE SERVER STATES IT ══════════════════════════════════════════
//
// The server sends two instants and no age: `sync.latest_arrival_ms` and `sync.server_now_ms`.
// The plausible wrong implementation is one line — `Date.now() - latest_arrival_ms` — and it looks
// right in every screenshot taken on the day the fixture was written. This fixture is anchored in
// 2021, so that line produces a five-year age and every assertion below fails at a glance.

describe("I · 12-F8 — sync age comes from the server's clock, never the browser's", () => {
  it("states the 22-minute age the server's own two instants describe", async () => {
    mount(ANSWER);
    await settled();
    expect(textOf("sync")).toMatch(/\b22\s*(m|min|minute)/i);
    // A browser clock would put the age in years. No five-digit number belongs in this region.
    expect(textOf("sync")).not.toMatch(/\d{5,}/);
  });

  it("stale data is visibly distinct from live data (00 §5.7)", async () => {
    mount(ANSWER);
    await settled();
    const stale = textOf("sync");
    cleanup();

    mount(
      answerWith({ sync: { latest_arrival_ms: ARRIVED_12_S_AGO, server_now_ms: SERVER_NOW_MS } }),
    );
    await settled();
    const live = textOf("sync");

    expect(stale).not.toBe(live);
    expect(live).not.toMatch(/\b22\s*(m|min|minute)/i);
  });

  /**
   * `latest_arrival_ms` is `null` when nothing has ever been received for this window. An age of
   * zero is the one thing that cannot be true, and "live" is worse — it is the `00 §5.7` failure
   * stated outright: *stale data is never presented as live.*
   */
  it("nothing received at all is stated, never rendered as an age of zero", async () => {
    mount(answerWith({ sync: { latest_arrival_ms: null, server_now_ms: SERVER_NOW_MS } }));
    await settled();
    const text = textOf("sync");
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/\b0\s*(s|sec|second|m|min|minute|h|hour)/i);
    expect(text).not.toMatch(/\b22\b/);
  });

  /**
   * The independent kill for the same defect, and the one that survives someone changing the
   * fixture's year. Two renders of the SAME answer with the browser clock a fortnight apart must
   * produce the same sentence.
   */
  it("the age does not move when the browser's clock does", async () => {
    const realNow = Date.now;
    try {
      Date.now = () => SERVER_NOW_MS;
      mount(ANSWER);
      await settled();
      const first = textOf("sync");
      cleanup();

      Date.now = () => SERVER_NOW_MS + 14 * 24 * 60 * 60_000;
      mount(ANSWER);
      await settled();
      expect(textOf("sync")).toBe(first);
    } finally {
      Date.now = realNow;
    }
  });

  /**
   * `12-F13` seen from the same angle: the header names the day the SERVER answered for. On first
   * load the client sends no `business_date`, so the server picks it — and a header built from
   * `new Date()` in the browser would name today, five years adrift of the figures under it.
   */
  it("the header names the business day the server answered for", async () => {
    mount(ANSWER);
    await settled();
    const first = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(first).toMatch(/2021/);
    // A header built from the browser's clock names today. The fixture is five years away, so
    // this is the assertion that separates the two — and it is written against the year the test
    // is RUN in rather than a literal, so it does not decay.
    expect(first).not.toMatch(new RegExp(`\\b${new Date().getFullYear()}\\b`));
    cleanup();

    // The differential half: a different answered day is a different header. Without it, a
    // hardcoded "2021" passes — and this suite would have shipped the defect it is written
    // against, in the assertion written to prevent it.
    mount(answerWith({ business_date: "2019-11-27" }));
    await settled();
    const second = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(second).toMatch(/2019/);
    expect(second).not.toMatch(/2021/);
  });
});

// ══ J. 12-F12 — THE NARRATIVE THAT CANNOT BE RENDERED ═════════════════════════════════════════

describe("J · 12-F12 — the narrative is absent, and the screen says so", () => {
  /**
   * `12-F12` makes the summary's prose *"the doc 13 nightly brief"*. Doc 13 is Wave 4 and
   * `services/intelligence` is a scaffold stub, so there is no brief — and unlike every other
   * absence on this screen it does NOT arrive in `omissions`, because the server's list covers
   * blocks of *numbers*. The statement is therefore the client's to make, and it must be made:
   * a summary with no prose and no explanation reads as a summary whose analyst had nothing to say.
   */
  /**
   * ⚠ **RETIRED ASSERTION, 16 August 2026 — `expect(page).toMatch(/12-F12/)`.**
   *
   * *What changed:* this test required the FR id `12-F12` to be RENDERED, as the proof that the
   * statement was the reasoned one and not a decorative apology. `14-F38` (August 2026) forbids
   * exactly that: *"No rendered string contains an FR id … The citation does not disappear — it
   * moves. It belongs in the string catalog's comment beside the sentence, where commandment 9
   * and `14-F2`'s traceability are served and no owner reads it."* To a restaurant owner reading
   * his own takings, `12-F12` is an error code on a report.
   *
   * *Which FR decides it:* `14-F38`, whose scope clause binds this module — and `14-F31` is what
   * puts this screen in it (the Wave-1 owner summary ships as a read-only desk view in the back
   * office). The citation now lives in the comment above `strings.summary.noNarrative`.
   *
   * *What is kept, because the ruling does not touch it:* the screen must still NAME the absence
   * rather than leave a silent gap. That half is strengthened here rather than merely preserved —
   * the negative direction is now asserted on the sentence itself, so the mutant this file was
   * written against (a screen with no statement at all) still dies, and so does the mutant that
   * puts the id back. The sweep is deliberately scoped to the leaf carrying the sentence: the
   * fixture's own `omissions` reasons are SERVER text quoting `12-F11` and `13-F5`, and a
   * page-wide id sweep would fail on a string this client does not author.
   */
  it("names the missing narrative rather than leaving a silent gap, in an owner's words", async () => {
    mount(ANSWER);
    await settled();
    const page = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(page).toMatch(/narrative/i);

    const carriers = Array.from(document.querySelectorAll<HTMLElement>("*")).filter(
      (el) => el.children.length === 0 && /narrative/i.test(el.textContent ?? ""),
    );
    expect(carriers.length).toBeGreaterThan(0);
    const sentence = (carriers[0]?.textContent ?? "").replace(/\s+/g, " ");
    // It says the brief does not exist and that nothing was invented in its place (`00 §5.7`).
    expect(sentence).toMatch(/not built|no brief|none is written|nothing/i);
    // `14-F38` — no FR id, on the sentence an owner actually reads.
    expect(sentence).not.toMatch(/\b(?:[0-9]{2}|[A-Z])-[FNT][0-9]+[a-z]?\b/);
  });

  it("invents no prose — the block still carries its numbers", async () => {
    mount(ANSWER);
    await settled();
    expect(textOf("sales")).toContain("Rs 3,550");
  });
});

// ══ K. 12-F2 AND 12-F26 — SCOPE AND READ-ONLINESS ═════════════════════════════════════════════

describe("K · 12-F2 — the server decides the scope and the screen never widens it", () => {
  it("a FORBIDDEN refusal shows the server's own sentence and NO figures", async () => {
    mount(() =>
      forbidden(
        'report.sales_view reaches "own_shift" for this subject, which cannot answer a whole ' +
          "business day (12-F10).",
      ),
    );
    await waitFor(() => {
      expect((document.body.textContent ?? "").length).toBeGreaterThan(0);
    });
    await flush();
    const page = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(page).toContain("report.sales_view");
    // Not a single fabricated figure behind the refusal.
    expect(document.querySelector('[data-summary-block="sales"]')).toBeNull();
    expect(moneyNodes()).toHaveLength(0);
  });

  it("the branch drill-in offers only branches the SERVER's answer covers (12-F22)", async () => {
    mount(ANSWER, {
      // The client-side widening this test exists to catch: the back office already knows a
      // third branch from `catalog.enabled`, and `12-F2` says the app never widens scope
      // client-side. A picker built from the config plane rather than from the answer offers a
      // branch this subject may hold no assignment at.
      "catalog.enabled": () => ({
        branches: ["branch-main", "branch-two", "branch-three"],
        channels: ["counter"],
      }),
    });
    await settled();
    const control = document.querySelector('[data-summary-control="branch"]');
    expect(control).not.toBeNull();
    const options = Array.from((control as HTMLElement).querySelectorAll("option"))
      .map((el) => (el as HTMLOptionElement).value)
      .filter((value) => value !== "");
    expect(options.length).toBeGreaterThan(0);
    expect(options.sort()).toEqual([...ANSWER.branch_ids].sort());
    expect(options).not.toContain("branch-three");
  });
});

describe("K · 12-F26 — this surface emits nothing", () => {
  it("every call it makes is the summary query, control-worked and all", async () => {
    const log = mount(ANSWER);
    await settled();

    // Work every control the screen declares — the read-only claim is worth nothing if the suite
    // never touched anything. Each interaction is re-settled before the next control is looked
    // up, because a screen is free to show a loading state between two business days and this
    // test's subject is what it SENDS, not what it shows while it waits.
    const date = document.querySelector('[data-summary-control="business-date"]');
    expect(date).not.toBeNull();
    fireEvent.change(date as HTMLElement, { target: { value: "2021-03-01" } });
    await settled();

    const branch = document.querySelector('[data-summary-control="branch"]');
    expect(branch).not.toBeNull();
    fireEvent.change(branch as HTMLElement, { target: { value: "branch-two" } });
    await settled();

    for (const button of Array.from(document.querySelectorAll("button"))) fireEvent.click(button);
    await flush();

    expect(log.length).toBeGreaterThan(1);
    /*
      **THE CLAIM IS "NO MUTATION", AND IT IS NOW ASSERTED AS THAT.** This read
      `toEqual(["summary.nightly"])`, which is a proxy: `12-F26` bans *creation, edit or deletion*
      and asks for a test that *"the app's API client has no mutating endpoints"*. A one-member path
      set is a stricter claim than the FR makes and a weaker one than it wants — it reddens on a
      legal added READ (`21-F15`'s naming reads, which is what happened) while saying nothing about
      the KIND of call, so a mutation to `summary.*` would have passed it.

      Both halves are here now: every call is a QUERY, and the paths are an allow-list, so a new
      read is still a diff a reviewer sees rather than a silent widening.
    */
    expect(log.every((call) => call.type === "query")).toBe(true);
    expect([...new Set(log.map((call) => call.path))].sort()).toEqual([
      "summary.nightly",
      "tenancy.directory",
      "users.list",
    ]);
  });
});

// ══ L. 12-F13 AND 12-F22 — BROWSE BY DATE, DRILL IN BY BRANCH ═════════════════════════════════

describe("L · 12-F13 — summary history is browsable by calendar date", () => {
  it("asks for no particular day on first load — the server names the business day", async () => {
    const log = mount(ANSWER);
    await settled();
    const first = log.find((call) => call.path === "summary.nightly");
    expect(
      (first?.input as { business_date?: unknown } | undefined)?.business_date,
    ).toBeUndefined();
  });

  it("a chosen date is sent to the server as 01-F46's YYYY-MM-DD", async () => {
    const log = mount(ANSWER);
    await settled();
    fireEvent.change(
      document.querySelector('[data-summary-control="business-date"]') as HTMLElement,
      {
        target: { value: "2021-03-01" },
      },
    );
    await waitFor(() => {
      expect(
        log.some(
          (call) =>
            call.path === "summary.nightly" &&
            (call.input as { business_date?: unknown }).business_date === "2021-03-01",
        ),
      ).toBe(true);
    });
  });
});

describe("L · 12-F22 — org roll-up with per-branch drill-in", () => {
  it("a chosen branch is sent as branch_id", async () => {
    const log = mount(ANSWER);
    await settled();
    fireEvent.change(document.querySelector('[data-summary-control="branch"]') as HTMLElement, {
      target: { value: "branch-two" },
    });
    await waitFor(() => {
      expect(
        log.some(
          (call) =>
            call.path === "summary.nightly" &&
            (call.input as { branch_id?: unknown }).branch_id === "branch-two",
        ),
      ).toBe(true);
    });
  });

  /**
   * `12-F22`: *"the branch view inside the roll-up is identical to the single-branch view
   * (structure never changes with org size)"*. So the same eight regions are present whether the
   * answer covers two branches or one.
   */
  it("a single-branch answer renders the same regions as the roll-up", async () => {
    mount(ANSWER);
    await settled();
    const rollUp = Array.from(document.querySelectorAll("[data-summary-block]"))
      .map((el) => el.getAttribute("data-summary-block"))
      .sort();
    cleanup();

    mount(
      answerWith({
        branch_ids: ["branch-two"],
        cash: CASH.filter((s) => s.branch_id === "branch-two"),
        days: DAYS.filter((d) => d.branch_id === "branch-two"),
        scope: { org_id: "org-zaiqa", branch_id: "branch-two", covers: ["branch-two"] },
      }),
    );
    await settled();
    const drilled = Array.from(document.querySelectorAll("[data-summary-block]"))
      .map((el) => el.getAttribute("data-summary-block"))
      .sort();

    expect(drilled).toEqual(rollUp);
    expect(rollUp).toEqual([
      "cash",
      "corrections",
      "honesty",
      "hourly",
      "omissions",
      "sales",
      "sync",
      "top-items",
    ]);
  });
});

// ══ L2. 12-F10 BULLET 3 — VOIDS, COMPS AND DISCOUNTS ═══════════════════════════════════════════

/**
 * **The block that replaced a sentence telling an owner the opposite of the truth.** Until August
 * 2026 this screen rendered, as part of the server's `omissions` list, the claim that voids, comps
 * and discounts *"have no payload schema and no emitter anywhere in the product — the counter has
 * no void, comp or discount surface at all"*. All three clauses had become false, and on the same
 * day an end-to-end run printed `raita · 2 sold` for two voided dishes and a day total Rs 289
 * short.
 *
 * The assertions below are aimed at the ONE thing this block can still get wrong, which is not a
 * figure: a void's money is already out of the takings and a comp's is not, and an owner who reads
 * them alike is wrong about her own day in the opposite direction.
 */
describe("L2 · 12-F10 bullet 3 — count, value, and by whom", () => {
  it("renders one row per kind, including the kind that did not happen", async () => {
    mount(ANSWER);
    await settled();
    expect(rowsOf("corrections", "data-correction").map((el) => el.dataset.correction)).toEqual([
      "void",
      "comp",
      "discount",
    ]);
  });

  it("carries each kind's COUNT and its money (12-F10)", async () => {
    mount(ANSWER);
    await settled();
    const rows = rowsOf("corrections", "data-correction");
    expect(rowText(rows[0] as HTMLElement)).toContain("3");
    expect(rowText(rows[0] as HTMLElement)).toContain("Rs 120");
    expect(rowText(rows[1] as HTMLElement)).toContain("Rs 120");
    // The zero row keeps its zero rather than being dropped — `00 §5.7`.
    expect(rowText(rows[2] as HTMLElement)).toContain("Rs 0");
  });

  /**
   * **THE ASSERTION THIS SECTION EXISTS FOR.** The void and the comp carry the SAME Rs 120 in the
   * fixture, so nothing but the sentence can tell them apart — a screen printing one sentence for
   * both passes every other assertion in this file.
   */
  it("says the void is OFF the takings and the comp is NOT (DEC-MONEY-010)", async () => {
    mount(ANSWER);
    await settled();
    const rows = rowsOf("corrections", "data-correction");
    const voided = rowText(rows[0] as HTMLElement);
    const comped = rowText(rows[1] as HTMLElement);
    expect(voided).toContain("Already off the takings");
    expect(voided).not.toContain("still include this money");
    expect(comped).toContain("still include this money");
    expect(comped).not.toContain("Already off the takings");
    // Both really do carry the same figure, or this proves nothing about the sentences.
    expect(CORRECTIONS[0]?.value_paisa).toBe(CORRECTIONS[1]?.value_paisa);
  });

  /**
   * `02-F20`'s two identities. `null` on the approver is *"a manager did this unsupervised"*,
   * which `permissions.ts` allows outright — not *"nobody approved it"*, and a screen that
   * rendered a blank or an id there would say the second.
   */
  it("names the cashier AND the approver, and says so when there was no approval", async () => {
    mount(ANSWER);
    await settled();
    await named();
    const by = rowsOf("corrections", "data-correction-by").map(rowText);
    // BY NAME (`11-F20`, `21-F15`) — the event carried the id and the roster resolves the word.
    expect(by[0]).toContain("Ayesha Khan");
    expect(by[0]).toContain("no approval needed");
    expect(by[1]).toContain("Hina Raza");
    /*
      The label and the identity are asserted SEPARATELY rather than as one concatenated string,
      because `21-F15` puts a person's id through `Named` — a roster lookup with a technical-id
      fallback — so the two are no longer adjacent characters in the rendered text. What this test
      owns is that the approver is NAMED under an "approved by" label and is not merged into the
      actor; how a person's identity is spelled is that FR's business, not this one's.
    */
    expect(by[1]).toContain("approved by");
    expect(by[1]).toContain("Ayesha Khan");
    expect(by[1]).not.toContain("no approval needed");
  });

  it("states the unsettled-bill count as its own honesty fact (00 §5.7)", async () => {
    mount(ANSWER);
    await settled();
    expect(textOf("honesty")).toContain("not settled yet");
    expect(textOf("honesty")).toContain("3");
  });

  /**
   * `12-F10` bullet 4 is the one block that does not add up to the takings, and the screen has to
   * say so: an owner adding five item figures and finding a different number would read the
   * mismatch as an error rather than as a different measurement.
   */
  it("labels the item table as a pre-tax ranking that excludes voided dishes", async () => {
    mount(ANSWER);
    await settled();
    expect(textOf("top-items")).toContain("before tax");
    expect(textOf("top-items")).toContain("voided");
  });
});

// ══ M. THE EMPTY DAY — ZERO IS A REAL ANSWER ══════════════════════════════════════════════════

describe("M · a day with no events reads as a day with no events", () => {
  /**
   * `services/api`'s honesty comment: *"Zero is a real answer and reads as one."* The plausible
   * wrong implementation treats an empty payload as a failure and renders the app's unreachable
   * surface — which tells an owner the service is broken on the night her restaurant was closed.
   */
  it("renders the summary, with a total of Rs 0, and not a failure surface", async () => {
    mount(
      answerWith({
        sales: { total_paisa: 0, orders: 0, by_channel: [] },
        cash: [],
        corrections: [
          { kind: "void", count: 0, value_paisa: 0, removed_from_sales: true, by: [] },
          { kind: "comp", count: 0, value_paisa: 0, removed_from_sales: false, by: [] },
          { kind: "discount", count: 0, value_paisa: 0, removed_from_sales: false, by: [] },
        ],
        top_items: [],
        hourly: [],
        days: [],
        honesty: {
          events: 0,
          provisional_stamp_events: 0,
          every_day_closed: true,
          open_shifts: 0,
          unsettled_orders: 0,
          truncated: false,
          anomalies: [],
        },
      }),
    );
    await settled();
    expect(textOf("sales")).toContain("Rs 0");
    const page = (document.body.textContent ?? "").replace(/\s+/g, " ");
    expect(page).not.toMatch(/can't reach|cannot reach|try again/i);
    // Every region still stands, so the day reads as measured-and-empty rather than as missing.
    expect(Array.from(document.querySelectorAll("[data-summary-block]"))).toHaveLength(8);
    // …and a day with three all-zero correction rows says NOTHING WAS CORRECTED, in words. The
    // three rows are still delivered, so the screen is stating a measurement rather than an
    // absence of one — the distinction the whole `omissions` mechanism exists to keep.
    expect(textOf("corrections")).toContain("Nothing was corrected today");
  });
});
