/**
 * `specs/10` slice 1's cloud read model, over a real host: `10-F18`'s variance report reached
 * through the gated tRPC procedure, from login to numbers.
 *
 * **This file is the SEAM, and its whole reason for existing is `L8`.** `packages/inventory` has
 * 110 tests of its own, and every one of them passes against a product that never imports the
 * package: *"tests exercise a module directly and nothing asserts the APPLICATION reaches it"*, with
 * fifteen recorded instances. So §A drives the composition root — `createApiServer`, `auth.login`,
 * a bearer token, `inventory.variance` over `app.inject` — and asserts a number that can only come
 * from the package's arithmetic.
 *
 * Five sections, each pointed at a specific way this surface can be wrong:
 *
 *   §A  the seam: the shipped host reaches `packages/inventory` and returns its arithmetic.
 *   §B  **commandment 8** — `stockBranchScope` decides how WIDE the answer is, not merely whether
 *       it happens. This is the half the middleware cannot cover, and here the leak is one
 *       branch's per-item unexplained usage reaching another branch's manager.
 *   §C  **`10-F34`** — who may ask at all, on this plane, over HTTP.
 *   §D  **`10-F29` end to end** — one area line missing, over the wire: `not counted`, the floor
 *       flag, and NO ZERO for that item anywhere in the response body.
 *   §E  **`00 §5.7`** — the port REFUSES rather than answering emptily, and the refusal arrives as
 *       an outage rather than as a clean, empty, confident report.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED** — written by the session that wrote `inventory.ts`, so
 * `20 §4.3`'s independent-oracle guarantee is not available and is not claimed. The mutation matrix
 * in `services/api/CLAUDE.md` stands in for it.
 */

import { hashPin } from "@restos/domain";
import type { ReferenceData } from "@restos/inventory";
import superjson from "superjson";
import { beforeAll, describe, expect, it } from "vitest";
import type { InventoryReference } from "../inventory.js";
import type { DayLedger, LedgerWindow } from "../ledger.js";
import { createApiServer } from "../server.js";
import type { SummaryEvent } from "../summary.js";
import { createMemoryUserStore, type UserRecord } from "../users.js";

const ORG = "org-inventory";
const BRANCH_A = "branch-lahore";
const BRANCH_B = "branch-karachi";
const SECRET = "inventory-acceptance-session-secret-not-a-real-one";
const PASSWORD = "a-bootstrap-owner-password";

const OWNER_ID = "user-owner";
const MANAGER_A_ID = "user-manager-a";
const STOREKEEPER_A_ID = "user-storekeeper-a";
const CASHIER_ID = "user-cashier";

const KG = 1_000_000;
const T0 = 1_760_000_000_000;
const at = (offset_hours: number): number => T0 + offset_hours * 3_600_000;

let seq = 0;
const event = (
  type: string,
  payload: Record<string, unknown>,
  options: { readonly at: number; readonly branch_id?: string },
): SummaryEvent => ({
  id: `ev-${String(++seq).padStart(4, "0")}`,
  type,
  branch_id: options.branch_id ?? BRANCH_A,
  branch_created_at: options.at,
  time_basis: "branch",
  actor_user_id: STOREKEEPER_A_ID,
  payload,
});

const REFS: ReferenceData = {
  items: [
    {
      item_id: "chicken",
      name: "Chicken",
      type: "raw",
      base_unit: "mg",
      is_counted: true,
      is_costed: true,
      count_units: { primary_label: "kg", primary_size_base: KG, partial: { kind: "none" } },
      reference_cost: null,
    },
  ],
  // TWO areas — the founder's ketchup case, and what §D leaves half-counted.
  areas: [
    { item_id: "chicken", location_id: BRANCH_A, area_id: "walk-in", sort: 0 },
    { item_id: "chicken", location_id: BRANCH_A, area_id: "kitchen", sort: 1 },
    { item_id: "chicken", location_id: BRANCH_B, area_id: "walk-in", sort: 0 },
  ],
  recipes: [
    {
      recipe_id: "karahi",
      version: 3,
      yield_qty_base: null,
      produces_item_id: null,
      lines: [{ line_no: 0, component: { kind: "item", id: "chicken" }, qty: 250_000 }],
    },
  ],
  menu_recipes: [{ sellable_kind: "menu_item", sellable_id: "karahi", recipe_id: "karahi" }],
};

const purchase = (id: string, qty: number, paisa: number, when: number, branch = BRANCH_A) =>
  event(
    "stock.purchase_recorded",
    {
      purchase_id: id,
      supplier_id: "supplier-metro",
      location_id: branch,
      lines: [
        {
          line_no: 0,
          item_id: "chicken",
          supplier_item_id: "si-chicken",
          qty_base: qty,
          line_total_paisa: paisa,
        },
      ],
      invoice_total_paisa: paisa,
    },
    { at: when, branch_id: branch },
  );

const countEvent = (
  id: string,
  lines: readonly Record<string, unknown>[],
  when: number,
  branch = BRANCH_A,
) =>
  event(
    "stock.count_recorded",
    { count_id: id, location_id: branch, lines },
    { at: when, branch_id: branch },
  );

const line = (area_id: string, qty_base: number) => ({
  item_id: "chicken",
  area_id,
  counted: true,
  qty_base,
  basis: "exact",
});

/**
 * The history every section reads off. Two closed periods at BRANCH_A, so the second one reconciles
 * — `10-F28`: a location's first period is a BASELINE and reconciles nothing.
 *
 *   baseline close: 10 kg walk-in + 5 kg kitchen = 15 kg, valued at p1's Rs 6,800 / 10 kg
 *   period 1:       buy 5 kg for Rs 3,500; sell 4 karahi (1 kg); close at 12 + 6 = 18 kg
 *                   expected 15 + 5 − 1 = 19 kg ⇒ gap −1 kg
 *                   pair (1 020 000 + 350 000, 20 kg) ⇒ −1 kg × 1 370 000 / 20 000 000 = −68 500
 *
 * BRANCH_B carries its own count and purchase, so §B has something to leak.
 */
const history = (closing: readonly Record<string, unknown>[]): SummaryEvent[] => {
  seq = 0;
  return [
    purchase("p1", 10 * KG, 680_000, at(1)),
    countEvent("c0", [line("walk-in", 10 * KG), line("kitchen", 5 * KG)], at(2)),
    event("order.created", { order_id: "o1", channel: "counter" }, { at: at(3) }),
    event(
      "order.line_added",
      { order_id: "o1", line_id: "l1", item_id: "karahi", qty: 4, unit_price_paisa: 45_000 },
      { at: at(3) },
    ),
    event("order.confirmed", { order_id: "o1" }, { at: at(3) }),
    purchase("p2", 5 * KG, 350_000, at(4)),
    countEvent("c1", closing, at(5)),

    // ── BRANCH_B: a whole second location's history, which no BRANCH_A subject may ever see ──
    //
    // ⚠ **THE ORDERS HERE ARE THE HALF THAT MAKES §B BITE, AND THE FIRST DRAFT OF THIS FIXTURE HAD
    // ONLY THE STOCK EVENTS.** Measured: with purchases and counts alone, mutants A2 (the narrowing
    // deleted) and A3 (the resolver's second filter deleted) killed **0 of 402** — because
    // `packages/inventory` filters `stock.*` by `payload.location_id` itself, so a leaked BRANCH_B
    // purchase or count is dropped one layer down and the answer is byte-identical.
    //
    // **Order events carry no location.** `order.*` names a BRANCH, and `10-F3` deducts "at the
    // selling location", so the CALLER is the only thing that scopes them — which means the
    // narrowing is the ONLY defence for consumption, and consumption is the one term a leak can
    // move. 20 karahis here is 5 kg of chicken; leaked into BRANCH_A they turn a 1 kg shortfall
    // into a 4 kg surplus. The round-3 defect verbatim: the mechanism was aimed one case away.
    purchase("pb1", 100 * KG, 6_800_000, at(1), BRANCH_B),
    countEvent("cb0", [{ ...line("walk-in", 100 * KG) }], at(2), BRANCH_B),
    event(
      "order.created",
      { order_id: "ob1", channel: "counter" },
      { at: at(3), branch_id: BRANCH_B },
    ),
    event(
      "order.line_added",
      { order_id: "ob1", line_id: "lb1", item_id: "karahi", qty: 20, unit_price_paisa: 45_000 },
      { at: at(3), branch_id: BRANCH_B },
    ),
    event("order.confirmed", { order_id: "ob1" }, { at: at(3), branch_id: BRANCH_B }),
    countEvent("cb1", [{ ...line("walk-in", 40 * KG) }], at(5), BRANCH_B),
  ];
};

const COMPLETE = [line("walk-in", 12 * KG), line("kitchen", 6 * KG)];
const HALF_COUNTED = [line("walk-in", 12 * KG)];

// ── the host ───────────────────────────────────────────────────────────────────────────────────

let app: Awaited<ReturnType<typeof createApiServer>>;
const tokens = new Map<string, string>();
/** Every window the procedure asked for, so §B can assert the NARROWING reached the reader. */
const asked: LedgerWindow[] = [];

const users = async (): Promise<UserRecord[]> => {
  const password_hash = await hashPin(PASSWORD);
  return [
    {
      user_id: OWNER_ID,
      org_id: ORG,
      email: "owner@inventory.test",
      password_hash,
      assignments: [{ role: "owner", branch_id: null, status: "active" }],
    },
    {
      user_id: MANAGER_A_ID,
      org_id: ORG,
      email: "manager-a@inventory.test",
      password_hash,
      assignments: [{ role: "branch_manager", branch_id: BRANCH_A, status: "active" }],
    },
    {
      user_id: STOREKEEPER_A_ID,
      org_id: ORG,
      email: "store-a@inventory.test",
      password_hash,
      assignments: [{ role: "storekeeper", branch_id: BRANCH_A, status: "active" }],
    },
    {
      user_id: CASHIER_ID,
      org_id: ORG,
      email: "cashier@inventory.test",
      password_hash,
      assignments: [{ role: "cashier", branch_id: BRANCH_A, status: "active" }],
    },
  ];
};

/**
 * A ledger that HONOURS the branch filter, which is the only way §B means anything.
 *
 * A reader that ignored `branch_ids` would make the resolver's second `filter` the sole defence, and
 * the test would then pass under a mutant that deleted the narrowing from the QUERY.
 */
let ledgerEvents: readonly SummaryEvent[] = [];
const recordingLedger: DayLedger = {
  read: (window) => {
    asked.push(window);
    const inWindow = ledgerEvents.filter(
      (e) => e.branch_created_at >= window.from_ms && e.branch_created_at < window.to_ms,
    );
    const scoped =
      window.branch_ids === null
        ? inWindow
        : inWindow.filter((e) => window.branch_ids?.includes(e.branch_id) === true);
    return Promise.resolve({ events: scoped, truncated: false, latest_arrival_ms: at(6) });
  },
};

const reference: InventoryReference = {
  read: () => Promise.resolve(REFS),
  // `InventoryReference` gained its writer half in August 2026 (`inventory.saveReference`). This
  // file's subject is the READ, so the writer THROWS rather than recording: a fixture that quietly
  // accepted a publish would let a future test believe it had changed `REFS` when it had not.
  // No assertion in this file moved — only the port's arity.
  publish: () => Promise.reject(new Error("this fixture is a reader; nothing here publishes")),
};

type Reply = { status: number; body: unknown };

const varianceFor = async (who: string | null, input: unknown): Promise<Reply> => {
  const bearer = who === null ? undefined : `Bearer ${tokens.get(who) as string}`;
  const response = await app.inject({
    method: "GET",
    url: `/trpc/inventory.variance?input=${encodeURIComponent(
      JSON.stringify(superjson.serialize(input)),
    )}`,
    ...(bearer === undefined ? {} : { headers: { authorization: bearer } }),
  });
  const raw = response.json() as { result?: { data?: unknown }; error?: unknown };
  const data =
    raw.result?.data === undefined ? undefined : superjson.deserialize(raw.result.data as never);
  return { status: response.statusCode, body: raw.error ?? data };
};

const login = async (email: string, who: string): Promise<void> => {
  const response = await app.inject({
    method: "POST",
    url: "/trpc/auth.login",
    payload: superjson.serialize({ email, password: PASSWORD }) as object,
  });
  const raw = response.json() as { result: { data: unknown } };
  const { token } = superjson.deserialize(raw.result.data as never) as { token: string };
  tokens.set(who, token);
};

const WINDOW = { from_ms: T0, to_ms: at(24) };

beforeAll(async () => {
  ledgerEvents = history(COMPLETE);
  app = await createApiServer({
    store: createMemoryUserStore(await users()),
    sessionSecret: SECRET,
    now: () => at(6),
    ledger: recordingLedger,
    inventory: reference,
  });
  await login("owner@inventory.test", OWNER_ID);
  await login("manager-a@inventory.test", MANAGER_A_ID);
  await login("store-a@inventory.test", STOREKEEPER_A_ID);
  await login("cashier@inventory.test", CASHIER_ID);
});

type Body = {
  readonly periods: readonly {
    readonly is_baseline: boolean;
    readonly rows: readonly Record<string, unknown>[];
    readonly unexplained_usage_paisa: number;
    readonly surplus_paisa: number;
    readonly is_floor: boolean;
    readonly withheld_row_count: number;
  }[];
  readonly hints: readonly unknown[];
  readonly reference_refusals: readonly unknown[];
  readonly scope: { readonly org_id: string; readonly branch_id: string };
};

// ── §A · THE SEAM ──────────────────────────────────────────────────────────────────────────────

describe("§A · the shipped host reaches packages/inventory and returns its arithmetic", () => {
  it("an owner logs in and reads a variance report over HTTP", async () => {
    const reply = await varianceFor(OWNER_ID, { branch_id: BRANCH_A, ...WINDOW });
    expect(reply.status).toBe(200);
    const body = reply.body as Body;
    expect(body.periods).toHaveLength(2);
    expect(body.scope).toEqual({ org_id: ORG, branch_id: BRANCH_A });
  });

  it("⚠ THE NUMBER — Rs 685.00 short, and it can only come from the package's arithmetic", () => {
    // 15 kg opening + 5 kg bought − 1 kg consumed = 19 kg expected against 18 counted ⇒ −1 kg.
    // Valued at the PERIOD pair (Rs 13,700 over 20 kg): 1 000 000 × 1 370 000 / 20 000 000 = 68 500.
    // A resolver that returned a placeholder, an empty report or a re-derived line sum cannot
    // produce this figure — it is `10-F28`'s pair arithmetic and nothing else.
    return varianceFor(OWNER_ID, { branch_id: BRANCH_A, ...WINDOW }).then((reply) => {
      const [baseline, second] = (reply.body as Body).periods;
      expect(baseline?.is_baseline).toBe(true);
      expect(baseline?.rows).toEqual([]);
      expect(second?.rows[0]?.gap_qty_base).toBe(-1_000_000);
      expect(second?.rows[0]?.gap_value_paisa).toBe(-68_500);
      expect(second?.unexplained_usage_paisa).toBe(68_500);
    });
  });

  it("the response carries what it does NOT know: the window, the sync age, the refusals", async () => {
    const reply = await varianceFor(OWNER_ID, { branch_id: BRANCH_A, ...WINDOW });
    const body = reply.body as Body & {
      readonly window: { from_ms: number; to_ms: number };
      readonly sync: { latest_arrival_ms: number | null };
      readonly ledger_truncated: boolean;
    };
    // `10-F28`'s chain is exact only from its true baseline, so the window IS the coverage boundary
    // and the answer states it rather than presenting a bounded answer as an unbounded one.
    expect(body.window).toEqual(WINDOW);
    expect(body.sync.latest_arrival_ms).toBe(at(6));
    expect(body.ledger_truncated).toBe(false);
    expect(body.reference_refusals).toEqual([]);
  });

  it("NO FOOD-COST RATIO IS ANYWHERE IN THE ANSWER — slice 1 ships without one, deliberately", () => {
    // `10-F31` R1: an unqualified ratio requires COMPLETE for its window, and the window gate is
    // unreachable on day one by construction. A field here would be R1 broken at the first surface
    // that wanted a number.
    return varianceFor(OWNER_ID, { branch_id: BRANCH_A, ...WINDOW }).then((reply) => {
      const serialised = JSON.stringify(reply.body);
      expect(serialised).not.toContain("food_cost");
      expect(serialised).not.toContain("gross_margin");
      expect(serialised).not.toContain("costed_revenue_share");
    });
  });
});

// ── §B · commandment 8 — how WIDE the answer is ────────────────────────────────────────────────

describe("§B · 10-F34 — the narrowing decides which rows are read, and the middleware cannot", () => {
  it("a branch manager's request asks the reader for HER BRANCH ONLY", async () => {
    asked.length = 0;
    await varianceFor(MANAGER_A_ID, { branch_id: BRANCH_A, ...WINDOW });
    expect(asked.at(-1)?.branch_ids).toEqual([BRANCH_A]);
  });

  it("⚠ NO BRANCH_B ROW REACHES A BRANCH_A SUBJECT — the leak this section exists for", async () => {
    // Under a resolver that dropped the narrowing, this passes `can()` correctly and returns
    // another location's per-item unexplained usage with a 200. On this surface that is not a
    // number she should not see — it is an accusation about people she does not employ.
    const reply = await varianceFor(STOREKEEPER_A_ID, { branch_id: BRANCH_A, ...WINDOW });
    expect(reply.status).toBe(200);
    // BRANCH_B's chicken moved 100 kg → 40 kg, which would dominate any leaked report.
    expect(JSON.stringify(reply.body)).not.toContain("100000000");
    const body = reply.body as Body;
    // ⚠ The load-bearing half: BRANCH_B's 20 karahis are 5 kg of chicken, and consumption is the
    // ONE term a leak can move (order events carry no location — see the fixture's note). Leaked
    // in, BRANCH_A's expected closing falls from 19 kg to 14 kg and this shortfall becomes a
    // SURPLUS. Asserting only "no BRANCH_B string appears" left mutants A2 and A3 alive.
    expect(body.periods[1]?.rows[0]?.expected_qty_base).toBe(19_000_000);
    expect(body.periods[1]?.rows[0]?.gap_qty_base).toBe(-1_000_000);
    expect(body.periods[1]?.unexplained_usage_paisa).toBe(68_500);
    expect(body.periods[1]?.surplus_paisa).toBe(0);
  });

  it("a branch manager asking about ANOTHER branch is refused before any row is read", async () => {
    asked.length = 0;
    const reply = await varianceFor(MANAGER_A_ID, { branch_id: BRANCH_B, ...WINDOW });
    expect(reply.status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("an owner may ask about either branch — Appendix A's 'everything'", async () => {
    expect((await varianceFor(OWNER_ID, { branch_id: BRANCH_B, ...WINDOW })).status).toBe(200);
  });

  it("⚠ THE SECOND LOCK — a reader that IGNORES the filter is caught by the resolver", async () => {
    // Both ends have to be exercised separately and the first draft only did one. The shared
    // `recordingLedger` HONOURS `branch_ids`, so the resolver's own filter never had anything to
    // drop and mutant A3 (deleting it) killed **0 of 402**. This host's reader returns everything it
    // holds, whatever it was asked for — a peer that regressed, or a query that lost its predicate.
    //
    // On this surface that is not merely a wider answer: `order.*` carries no location, so BRANCH_B's
    // 20 karahis would be counted as BRANCH_A's consumption and a 1 kg shortfall would render as a
    // 4 kg SURPLUS. The manager would be shown the opposite of what happened, with a 200.
    const all = history(COMPLETE);
    const leakyLedger: DayLedger = {
      read: (window) =>
        Promise.resolve({
          events: all.filter(
            (e) => e.branch_created_at >= window.from_ms && e.branch_created_at < window.to_ms,
          ),
          truncated: false,
          latest_arrival_ms: at(6),
        }),
    };
    const host = await createApiServer({
      store: createMemoryUserStore(await users()),
      sessionSecret: SECRET,
      now: () => at(6),
      ledger: leakyLedger,
      inventory: reference,
    });
    const auth = await host.inject({
      method: "POST",
      url: "/trpc/auth.login",
      payload: superjson.serialize({
        email: "manager-a@inventory.test",
        password: PASSWORD,
      }) as object,
    });
    const { token } = superjson.deserialize(
      (auth.json() as { result: { data: unknown } }).result.data as never,
    ) as { token: string };

    const reply = await host.inject({
      method: "GET",
      url: `/trpc/inventory.variance?input=${encodeURIComponent(
        JSON.stringify(superjson.serialize({ branch_id: BRANCH_A, ...WINDOW })),
      )}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = superjson.deserialize(
      (reply.json() as { result: { data: unknown } }).result.data as never,
    ) as Body;
    // Identical to the honest reader's answer: the leaked rows changed nothing.
    expect(body.periods[1]?.rows[0]?.expected_qty_base).toBe(19_000_000);
    expect(body.periods[1]?.rows[0]?.gap_qty_base).toBe(-1_000_000);
    expect(body.periods[1]?.surplus_paisa).toBe(0);
  });
});

// ── §C · 10-F34 — who may ask at all ───────────────────────────────────────────────────────────

describe("§C · 10-F34 — the cashier is refused, and 10-F19 is the reason", () => {
  it("a CASHIER is refused with 403 and reaches no reader", async () => {
    asked.length = 0;
    const reply = await varianceFor(CASHIER_ID, { branch_id: BRANCH_A, ...WINDOW });
    expect(reply.status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("a STOREKEEPER is allowed — Appendix A's 'stock reports' cell, the one it states", async () => {
    expect((await varianceFor(STOREKEEPER_A_ID, { branch_id: BRANCH_A, ...WINDOW })).status).toBe(
      200,
    );
  });

  it("an UNAUTHENTICATED request is refused", async () => {
    expect((await varianceFor(null, { branch_id: BRANCH_A, ...WINDOW })).status).toBe(401);
  });

  it("`branch_id` is REQUIRED, and the two refusals arrive in the SAFE order", async () => {
    // ⚠ This assertion was written expecting 400 for both callers and it was WRONG about the order
    // the host applies its two gates, which is worth keeping because the real order is the safer
    // one. `authorized()` is middleware and runs BEFORE zod: it reads `branch_id` off the RAW
    // input, so an absent one resolves the scope to `null` — the org-wide reach — and a
    // branch-scoped manager is refused **403 before the schema is ever consulted**. Only a subject
    // who would have passed org-wide (the owner) reaches the schema and gets the 400.
    //
    // The property both halves assert is the one that matters: an omitted `branch_id` never
    // produces an answer. If validation ran first, a manager would get a 400 and learn nothing;
    // if the middleware scoped from something other than the input, she would get a report.
    expect((await varianceFor(MANAGER_A_ID, { ...WINDOW })).status).toBe(403);
    expect((await varianceFor(OWNER_ID, { ...WINDOW })).status).toBe(400);
  });
});

// ── §D · 10-F29 end to end ─────────────────────────────────────────────────────────────────────

describe("§D · 10-F29 over the wire — one area line missing, and no zero anywhere", () => {
  it("the item reads NOT COUNTED, the total is a floor, and NO ZERO appears for it", async () => {
    ledgerEvents = history(HALF_COUNTED);
    const reply = await varianceFor(OWNER_ID, { branch_id: BRANCH_A, ...WINDOW });
    ledgerEvents = history(COMPLETE);

    const body = reply.body as Body;
    const second = body.periods[1];
    const row = second?.rows[0];
    expect(row?.withheld).toEqual({ kind: "not_counted", reason: "area_line_missing" });
    expect(second?.is_floor).toBe(true);
    expect(second?.withheld_row_count).toBe(1);

    // The three that the "treat a blank as zero" implementation would each get wrong, asserted on
    // the SERIALISED body because that is what a screen receives.
    expect(row?.counted_qty_base).toBeNull();
    expect(row?.expected_qty_base).toBeNull();
    expect(row?.gap_qty_base).toBeNull();
    expect(row?.gap_value_paisa).toBeNull();
    expect(second?.unexplained_usage_paisa).toBe(0);
  });
});

// ── §E · 00 §5.7 — the port refuses rather than answering emptily ──────────────────────────────

describe("§E · 00 §5.7 — an unconfigured reference source is an OUTAGE, not an empty report", () => {
  it("⚠ THE STUB SHAPE, REFUSED: a host with no inventory source 500s instead of answering", async () => {
    // `L8`'s measured blind spot: "Rule B asks whether an optional member is supplied, never
    // whether what was supplied is real, and a stub is a supply." A source answering
    // `{ items: [] }` renders a complete, confident, entirely EMPTY variance report — no rows, no
    // floor flag, no unexplained usage — for a location that is short Rs 685, and nothing on that
    // screen says anything is missing. The fallback refuses so the screen shows an outage.
    const host = await createApiServer({
      store: createMemoryUserStore(await users()),
      sessionSecret: SECRET,
      now: () => at(6),
      ledger: recordingLedger,
      // `inventory` deliberately omitted — `unconfiguredInventoryReference` is what resolves.
    });
    const auth = await host.inject({
      method: "POST",
      url: "/trpc/auth.login",
      payload: superjson.serialize({ email: "owner@inventory.test", password: PASSWORD }) as object,
    });
    const { token } = superjson.deserialize(
      (auth.json() as { result: { data: unknown } }).result.data as never,
    ) as { token: string };

    const reply = await host.inject({
      method: "GET",
      url: `/trpc/inventory.variance?input=${encodeURIComponent(
        JSON.stringify(superjson.serialize({ branch_id: BRANCH_A, ...WINDOW })),
      )}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(reply.statusCode).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(reply.json())).toContain("no inventory reference source is configured");
  });
});
