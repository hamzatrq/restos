// S-3 + S-4 — the CASH tab, tested as behaviour: day open/close, shift open/close, the no-sale
// drawer and paid-outs.
//
// Authored from spec text only (`24 §3` step 2), by a session that does not implement it.
// Scope: `02-F21` (no-sale drawer, "logged AND counted"), `02-F22` (day open + float, shift open,
// the role guard), `02-F23` (shift close: expected by method vs counted, over/short recorded),
// `02-F24` (day close: manager count + deposit), `02-F26`/`02-F44` (paid-outs: amount, reason,
// receipt ref), `02-F43` (drawer events with no shift open SUCCEED and are counted), `02-F45`
// (attribution is read from the envelope, never duplicated into the payload), `01-F17` (a sale is
// never blocked), `26 §7` (bucketing and the causal link are CARRIED, never resolved at read
// time), and the surface laws `27-F1`/`27-F4`/`27-F6`/`27-F8`/`27-F23`/`27-F24`.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PINS THAT THE FRs DO NOT (declare it, do not discover it)
//
// A screen test cannot be written without naming a seam and some labels. Three things below are
// the oracle's choice, each with the reason it is not arbitrary. If the implementer needs any of
// them different, that is a finding for THIS session — not an edit to this file (`24 §3` step 2,
// `.claude/rules/tests-and-conformance.md`).
//
//  1. **One new bridge read: `window.restos.cashState()`.** The `shift_cash` fold already
//     projects `{ shifts, days, unbound, unbound_drawer }` and `18 §6`/`18 §9` give the renderer
//     exactly one way to see a fold — a typed IPC read. The field names below are the fold's own
//     row names, unchanged, so nothing here is a second vocabulary for the same rows.
//  2. **The surface is DEPTH ONE.** `27-F1` caps navigational depth at one and `27-F5` forbids
//     context-dependent or invisible controls ("every action has a persistent, visible, labelled
//     target"), so these tests type a number on a visible keypad and then tap a visible labelled
//     action — no modal, no wizard, no reveal step. That is the shape `TenderPanel` already
//     ships, on the same posture.
//  3. **Action labels**, matched by permissive case-insensitive regex, taken verbatim from the
//     task names in `role-task-inventories.md`: C2 "Open my shift", C3 "Open the day", C28 "Open
//     the drawer without a sale" (no-sale), C29 the paid-out, C33 "Close my shift", C34 "Close
//     the day".
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS DELIBERATELY NOT TESTED HERE, AND WHY
//
// - **The `02-F22` role guard's identity half.** `02-F22` refuses day open/close and float entry
//   to a cashier session, and `domain/permissions.ts` already carries the row
//   (`day.open_close`: cashier `deny`, branch_manager/owner `allow`). But `01-F27` puts user
//   identity in the PIN session, S-0b/S-0c are unbuilt, and `main/index.ts:201` still hardcodes
//   `actorUserId: null` — so there is no subject to refuse. Writing the guard test against an
//   invented session shape would pin a seam another session owns. What IS tested is the half
//   that needs no identity: a REFUSED day open must not be shown as a day that opened, and must
//   not wedge the till (`01-F17`). Reported as owed.
// - **The drawer physically opening.** `03-F9`'s kick is executed by the print service over
//   RJ11 and there is still no printer (K-8 is owed). `cash.drawer_opened` is the authoritative
//   RECORD; no assertion here implies a drawer moved.
// - **`27-F9`'s adjacency law.** Nothing destructive lives on this tab, so an adjacency
//   assertion here would have no dangerous case to point at — which is the exact vacuity
//   `oracle-round-2-findings.md §C` names. Reported instead of faked.

import { parseEvent } from "@restos/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem, OpenOrder } from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** happy-dom has no layout, so the measured grid would never render. See `counter.dom.test.tsx`. */
const REFERENCE_PANEL = { width: 1366, height: 768 };

class StubResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: REFERENCE_PANEL as DOMRectReadOnly } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

// ── The fold's rows, as the renderer must receive them ──────────────────────────────────────
// Declared here rather than imported so this suite compiles today (the seam does not exist yet)
// and so a rename in `shared/ipc.ts` is a runtime finding rather than a silent compile break.
// Field names are `sync-client/src/folds/shift-cash.ts`'s own.

type CashShift = {
  shift_id: string;
  cashier: string | null;
  prev_shift_id: string | null;
  open_at: number;
  /** `02-F23` "system-expected cash (by method)" — canonical JSON, methods actually tendered. */
  expected_json: string;
  paid_out_paisa: number;
  no_sale_count: number;
  closed: number;
  counted_cash_paisa: number | null;
  expected_at_close_json: string | null;
  variance_paisa: number | null;
  exceptions_json: string;
};

type CashDay = {
  day_id: string;
  business_date: string;
  prev_day_id: string | null;
  opening_float_paisa: number;
  deposit_paisa: number;
  closed: number;
  counted_cash_paisa: number | null;
  exceptions_json: string;
};

type CashState = {
  shifts: CashShift[];
  days: CashDay[];
  unbound: {
    settlement_attempt_id: string;
    order_id: string | null;
    method: string | null;
    amount_paisa: number;
    anomaly: string;
  }[];
  unbound_drawer: { no_sale_count: number; paid_out_paisa: number; exceptions_json: string };
};

const aShift = (over: Partial<CashShift> = {}): CashShift => ({
  shift_id: "shift-1",
  // `02-F45` — projected from the envelope's `actor_user_id`, which is null until S-0b/c land.
  cashier: null,
  prev_shift_id: null,
  open_at: 1_780_000_000_000,
  expected_json: JSON.stringify({ cash: 100_000 }),
  paid_out_paisa: 0,
  no_sale_count: 0,
  closed: 0,
  counted_cash_paisa: null,
  expected_at_close_json: null,
  variance_paisa: null,
  exceptions_json: "[]",
  ...over,
});

const aDay = (over: Partial<CashDay> = {}): CashDay => ({
  day_id: "day-1",
  business_date: "2026-08-04",
  prev_day_id: null,
  // Held at zero in every shift-close fixture ON PURPOSE: whether an opening float belongs in a
  // SHIFT's expected drawer cash is not decided by any FR (the float is a DAY fact, `02-F22`;
  // the variance is a SHIFT fact, `02-F23`). At zero every reading agrees, so no assertion here
  // depends on the undecided part. Reported as an open question.
  opening_float_paisa: 0,
  deposit_paisa: 0,
  closed: 0,
  counted_cash_paisa: null,
  exceptions_json: "[]",
  ...over,
});

const aCashState = (over: Partial<CashState> = {}): CashState => ({
  shifts: [],
  days: [],
  unbound: [],
  unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
  ...over,
});

const DEVICE = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-04",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
} as DeviceState;

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

let appended: AppendRequest[];
/** Bridge members the screen reached for that this harness does not implement. */
let unexpectedBridgeCalls: string[];

const mountWith = (
  cash: CashState,
  overrides: Partial<{
    orders: OpenOrder[];
    appendRejects: { type: string; message: string };
  }> = {},
) => {
  appended = [];
  unexpectedBridgeCalls = [];
  const known = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => overrides.orders ?? []),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    cashState: vi.fn(async () => cash),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      const reject = overrides.appendRejects;
      // Main legitimately refuses: `01-F4` schema violations, and `02-F22`'s role guard once a
      // subject exists. The renderer is the untrusted end of this bridge (`shared/ipc.ts`).
      if (reject !== undefined && reject.type === req.type) throw new Error(reject.message);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    onChanged: vi.fn(() => () => {}),
  } as Record<string, unknown>;
  // A member the screen reaches for that this harness does not know is RECORDED rather than
  // thrown, so a missing seam shows up as a named finding instead of an unhandled rejection
  // that React 19 turns into a blank till.
  const bridge = new Proxy(known, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      unexpectedBridgeCalls.push(prop);
      return async () => undefined;
    },
    has: () => true,
  });
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/** Select a tab from the rail and wait for it to become the current surface. */
/**
 * The rail's tab buttons, found by their LABEL text rather than by accessible name: an
 * unavailable tab folds its reason into the name ("Cash not built yet"), so a name query
 * cannot find it at all and the failure reads as a missing tab instead of an unbuilt one.
 * `27-F4` distinguishes those two cases and so must this helper.
 */
const tabButton = (label: string): HTMLButtonElement => {
  const rail = document.querySelector('nav[aria-label="Main"]');
  const found = [...(rail?.querySelectorAll("button") ?? [])].find(
    (b) => (b.querySelector("span")?.textContent ?? "").trim() === label,
  );
  expect(
    found,
    `27-F4 — the rail must carry a ${label} tab, disabled in place if unbuilt`,
  ).toBeDefined();
  return found as HTMLButtonElement;
};

const goToTab = async (label: string) => {
  await screen.findByText("Order", { exact: true });
  const tab = tabButton(label);
  expect(
    tab.disabled,
    `27-F4 — the ${label} tab must be reachable, not disabled in place, once its surface ships`,
  ).toBe(false);
  fireEvent.click(tab);
  await waitFor(() => expect(tabButton(label).getAttribute("aria-current")).toBe("page"));
};

/**
 * Type an amount in RUPEES on the 126 dp keypad, as a cashier would.
 *
 * Rupees, not paisa: `27-F23` puts no decimals on operational screens and no sub-rupee unit
 * circulates, so what she types is whole rupees and the ×100 is a UNIT conversion the screen
 * owes. Every money assertion below is on the paisa that reach the event.
 */
const typeRupees = (rupees: string) => {
  for (const d of rupees) fireEvent.click(screen.getByRole("button", { name: d }));
};

const press = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

const LABEL = {
  openDay: /open\s+(the\s+)?day/i,
  closeDay: /close\s+(the\s+)?day/i,
  openShift: /open\s+(my\s+)?shift/i,
  closeShift: /close\s+(my\s+)?shift/i,
  noSale: /no.?sale/i,
  paidOut: /paid.?out|pay\s*out/i,
} as const;

/**
 * `02-F26`/`27-F6` — the reason is a PICK-LIST of tiles ("of 27 field subjects, 24 could not
 * type a single word"), but no FR names the vocabulary. So the driver taps whatever reason
 * control the surface offers and the ASSERTIONS stay unconditional: the event must carry a
 * non-empty reason either way. Same for the receipt photo, whose capture seam does not exist
 * (`02 §8`: captured locally, uploaded opportunistically, referenced by id).
 */
const tapIfOffered = (name: RegExp) => {
  const [control] = screen.queryAllByRole("button", { name });
  if (control !== undefined) fireEvent.click(control);
};

const A_REASON = /supplier|vegetable|petty|purchase|repair|advance|reason|other/i;
const A_PHOTO = /photo|receipt|camera/i;

/**
 * Every payload this screen emits must survive the `01 §4` catalog's own schema (`01-F4`:
 * an unknown type or a malformed payload is an error at emit).
 *
 * This is the registry, not a transcription of it — so `prev_shift_id` being required-and-
 * nullable, `expected_paisa_by_method` being EXHAUSTIVE over the five tenders, `amount_paisa`
 * being a non-negative integer and `receipt_photo_ref` being non-empty are all enforced here
 * without this file restating any of them.
 */
const ENVELOPE = {
  id: "01J00000000000000000000000",
  org_id: "org-1",
  branch_id: "branch-1",
  device_id: "device-1",
  actor_user_id: null,
  lamport_seq: 1,
  device_created_at: 1_780_000_000_000,
  branch_created_at: 1_780_000_000_000,
  time_basis: "branch" as const,
  server_received_at: null,
  schema_version: 1,
};

const emittable = (req: AppendRequest | undefined): AppendRequest => {
  expect(req, "the screen appended nothing").toBeDefined();
  const r = req as AppendRequest;
  parseEvent({ ...ENVELOPE, type: r.type, payload: r.payload, refs: r.refs ?? [] });
  return r;
};

const only = (type: string): AppendRequest => {
  const matching = appended.filter((a) => a.type === type);
  expect(matching, `expected exactly one ${type}`).toHaveLength(1);
  return emittable(matching[0]);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("27-F4 — the Cash tab stops being 'not built yet' without moving anything", () => {
  it("keeps all five surfaces, in order, and makes Cash reachable", async () => {
    // `27-F4` makes adding, removing or REORDERING an operational item a breaking change. The
    // rail was shipped complete for exactly this moment: building Cash must change one tab's
    // availability and nothing else. A build that quietly drops `Me` or reorders the rail costs
    // every operator who already learned it.
    mountWith(aCashState());
    const { container } = render(<Counter />);
    await screen.findByText("Order", { exact: true });

    const rail = container.querySelector('nav[aria-label="Main"]');
    expect(rail, "the shell must still render one tab rail").toBeTruthy();
    const labels = [...(rail as Element).querySelectorAll("button")].map((b) =>
      (b.querySelector("span")?.textContent ?? "").trim(),
    );
    expect(labels).toEqual(["Order", "Orders", "Pay", "Cash", "Me"]);

    await goToTab("Cash");
    expect(unexpectedBridgeCalls, "the Cash surface reached for an unknown bridge member").toEqual(
      [],
    );
  });

  it("appends NOTHING merely by opening the tab", async () => {
    // The whole tab is low-frequency and high-consequence. A surface that emits a ledger event
    // on arrival is unrecoverable under `01-F1`.
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");
    expect(appended).toHaveLength(0);
  });
});

describe("27-F8 / 27-F6 / Commandment 6 — how a count is entered", () => {
  it("uses the 126 dp keypad, not the 76 dp tile sizing the menu grid uses", async () => {
    // `27-F8`: numeric entry is the KIOSK condition — standing, high-consequence — and every
    // count field on this tab qualifies. 126 dp is the largest target in the system and a count
    // field may not share the grid tile's 76 dp. The digit buttons carry it structurally.
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    const five = screen.getByRole("button", { name: "5" });
    expect((five as HTMLElement).style.width, "27-F8 — the count keypad is 126 dp").toBe("126px");
    expect((five as HTMLElement).style.height).toBe("126px");
  });

  it("has no raw text entry anywhere on the surface", async () => {
    // `27-F6`: of 27 field subjects, 24 could not type a single word, so no operational role is
    // required to type non-numeric text to complete a critical-path task — reasons are
    // pick-lists. And Commandment 6 closes it structurally: `packages/ui` contains no input,
    // textarea or select at all, so one appearing here is a raw primitive by definition.
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    const { container } = render(<Counter />);
    await goToTab("Cash");

    expect(
      [...container.querySelectorAll("input, textarea, select")].map((e) => e.tagName),
      "21 §2 / 27-F6 — no raw primitives, and no typing on the critical path",
    ).toEqual([]);
  });
});

describe("C3 — opening the day and its float (02-F22, 26 §7)", () => {
  it("appends ONE day.opened carrying the float in integer paisa", async () => {
    // `02-F22`: "opening float entry → `day.opened`". The cashier types RUPEES (`27-F23`: no
    // decimals on operational screens); the ledger takes integer PAISA (`00 §6`). Rs 5,000 is
    // 500,000 paisa, and a screen that forwards 5000 has understated the drawer by a factor of
    // 100 in an append-only ledger that `01-F1` allows no edit to.
    mountWith(aCashState());
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("5000");
    press(LABEL.openDay);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("day.opened");
    expect(req.payload.opening_float_paisa).toBe(500_000);
    expect(typeof req.payload.day_id).toBe("string");
    expect((req.payload.day_id as string).length).toBeGreaterThan(0);
    // `26 §7` — duplicate day open is resolved by a CARRIED causal link, and `null` is the
    // branch's first day ever. Required, so a forgotten field cannot pass as a stated one.
    expect(req.payload.prev_day_id).toBeNull();
  });

  it("names the day it follows — the causal link is CARRIED, not inferred later (26 §7)", async () => {
    // Two devices both opening a day after a partition is ordinary offline behaviour, not an
    // edge case. The fork is only visible IN THE EVENT SET if each open names its predecessor;
    // an emitter that always sends `null` passes the test above and makes every day look like
    // the first one, which is a fork the fold can never see.
    mountWith(aCashState({ days: [aDay({ day_id: "day-yesterday", closed: 1 })] }));
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("2000");
    press(LABEL.openDay);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("day.opened");
    expect(req.payload.prev_day_id).toBe("day-yesterday");
    expect(req.payload.day_id).not.toBe("day-yesterday");
  });

  it("a REFUSED day open leaves the till working and does not claim the day opened (01-F17)", async () => {
    // Main refuses: `01-F4` at the schema, and `02-F22`'s role guard once a PIN session exists
    // (`domain/permissions.ts` already rules `day.open_close` DENY for a cashier). Two things
    // must survive it. An unhandled rejection in React 19 unmounts the root and blanks a counter
    // mid-service; and a screen that optimistically shows the day as open after a refusal is
    // `02-F37`'s "succeed and lie" wearing a different hat — the day is not open, and the next
    // shift would settle against a day that does not exist.
    mountWith(aCashState(), {
      appendRejects: { type: "day.opened", message: "permission denied: day.open_close" },
    });
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("2000");
    press(LABEL.openDay);
    await waitFor(() => expect(appended).toHaveLength(1));

    // The day-open action is still LIVE — because the day did not open. A manager may now put a
    // PIN in and try again, and the second attempt must REACH THE LEDGER. Merely finding the
    // button is not that assertion: a screen that locally decided the day opened still renders
    // the control, greyed, and the branch then has no route to open its day at all. Pressing it
    // is what tells the two apart.
    typeRupees("2000");
    press(LABEL.openDay);
    await waitFor(() => expect(appended).toHaveLength(2));
    expect(appended[1]?.type).toBe("day.opened");
    // And the rest of the till is untouched: `01-F17`, a sale is never blocked.
    await goToTab("Order");
    expect(await screen.findByRole("button", { name: /Karahi/i })).toBeTruthy();
  });
});

describe("C2 — opening a shift (02-F22, 02-F45)", () => {
  it("appends ONE shift.opened carrying the shift it follows", async () => {
    mountWith(
      aCashState({ days: [aDay()], shifts: [aShift({ shift_id: "shift-earlier", closed: 1 })] }),
    );
    render(<Counter />);
    await goToTab("Cash");

    press(LABEL.openShift);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("shift.opened");
    expect(typeof req.payload.shift_id).toBe("string");
    expect(req.payload.shift_id).not.toBe("shift-earlier");
    expect(req.payload.prev_shift_id).toBe("shift-earlier");
  });

  it("carries prev_shift_id null for the branch's first shift ever", async () => {
    mountWith(aCashState({ days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    press(LABEL.openShift);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    expect(only("shift.opened").payload.prev_shift_id).toBeNull();
  });

  it("does NOT duplicate the cashier into the payload (02-F45)", async () => {
    // `02-F45` is explicit: attribution is read from the envelope's `actor_user_id`, and a
    // `cashier` field in the payload would be a SECOND SOURCE for one fact — two values that can
    // disagree, in an append-only ledger with no rule for which wins. `FOLDS.md`'s `cashier`
    // column is a PROJECTED column, not a declared payload field. The payload schemas are loose
    // objects, so the registry will not catch this: only this assertion does.
    mountWith(aCashState({ days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    press(LABEL.openShift);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const keys = Object.keys(only("shift.opened").payload);
    expect(keys).not.toContain("cashier");
    expect(
      keys.filter((k) => /cashier|user|staff|actor|operator|pin/i.test(k)),
      "02-F45 — attribution travels in the envelope, never in the payload",
    ).toEqual([]);
  });
});

describe("C33 — closing a shift and counting the drawer (02-F23, 27-F24)", () => {
  const OPEN_SHIFT = aShift({
    shift_id: "shift-77",
    // Only cash was tendered, so the fold's map carries one method. `shift.closed`'s schema is
    // EXHAUSTIVE over the five tenders, so the screen owes the explicit zeros.
    expected_json: JSON.stringify({ cash: 100_000 }),
    paid_out_paisa: 0,
  });

  it("shows expected cash BY METHOD, finished, before anything is counted", async () => {
    // `02-F23` requires it by method and `01-F32`/`DEC-MONEY-007` make four of the five tenders
    // behave differently: `khata_credit` is not money received, `aggregator_receivable` is
    // collected by the aggregator, `card`/`raast` never enter the drawer. A single scalar
    // "expected cash" passes a naive test and is wrong for four of five.
    mountWith(aCashState({ shifts: [OPEN_SHIFT], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    // `27-F23`: `Rs`, symbol-first, Western 3-digit grouping, no decimals.
    expect(screen.getAllByText("Rs 1,000").length).toBeGreaterThan(0);
    for (const method of [/raast/i, /khata/i, /aggregator/i, /card/i]) {
      expect(
        screen.queryAllByText(method).length,
        `02-F23 — every tender is a named row, ${method} is missing`,
      ).toBeGreaterThan(0);
    }
    // Explicit zeros, not vanished rows: a bucket that disappears when it is empty moves the
    // ones below it (`27-F4`) and is indistinguishable from a bucket that was never tendered.
    expect(screen.queryAllByText("Rs 0").length).toBeGreaterThanOrEqual(4);
  });

  it("computes OVER before she confirms — she reads it, she never derives it (27-F24)", async () => {
    // ~60% of rural Class 1 recognise numbers against 9.5% who can do any arithmetic. The whole
    // point of `02-F23`'s reconciliation is that the difference arrives finished.
    mountWith(aCashState({ shifts: [OPEN_SHIFT], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("1200");

    // `27-F12`: direction is a WORD, never a minus sign and never colour alone. A lone `-` is one
    // glyph wide and means nothing to a non-reader.
    await waitFor(() => expect(screen.getAllByText("OVER Rs 200").length).toBeGreaterThan(0));
  });

  it("computes SHORT in the other direction — the half that costs a cashier her job", async () => {
    mountWith(aCashState({ shifts: [OPEN_SHIFT], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("900");

    await waitFor(() => expect(screen.getAllByText("SHORT Rs 100").length).toBeGreaterThan(0));
  });

  it("appends shift.closed carrying the counted figure, the SIGNED variance, and the expectation SNAPSHOT", async () => {
    // `26 §7`: over/short is a CARRIED FACT. The counted figure and the expected figure the
    // cashier was shown are both facts at close time, and both travel on the event — because a
    // fold that recomputed "expected" at read time would silently move a number she already
    // signed the moment a late payment arrived (`01-F1` forbids that mutation; a read-time
    // recompute performs it in effect). `sync-client`'s fold has NO derived fallback, so an
    // omitted or wrong field here is unrecoverable.
    mountWith(aCashState({ shifts: [OPEN_SHIFT], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("1200");
    await waitFor(() => expect(screen.getAllByText("OVER Rs 200").length).toBeGreaterThan(0));
    press(LABEL.closeShift);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("shift.closed");
    expect(req.payload.shift_id).toBe("shift-77");
    expect(req.payload.counted_cash_paisa).toBe(120_000);
    // SIGNED. "Over/short" is two directions and a magnitude-only field can record an over but
    // not a short.
    expect(req.payload.variance_paisa).toBe(20_000);
    // Exhaustive over the closed tender set with explicit zeros — the fold's map carried one
    // method and the event's schema is a strict object over all five.
    expect(req.payload.expected_paisa_by_method).toEqual({
      cash: 100_000,
      card: 0,
      raast: 0,
      khata_credit: 0,
      aggregator_receivable: 0,
    });
  });

  it("records a SHORT as a negative variance, not a magnitude", async () => {
    mountWith(aCashState({ shifts: [OPEN_SHIFT], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("900");
    await waitFor(() => expect(screen.getAllByText("SHORT Rs 100").length).toBeGreaterThan(0));
    press(LABEL.closeShift);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    expect(only("shift.closed").payload.variance_paisa).toBe(-10_000);
  });

  it("a paid-out is drawer cash the naive subtraction never sees (02-F44)", async () => {
    // `02-F44` states the failure exactly: `02-F26` named no amount, "which makes `02-F23`'s
    // system-expected cash uncomputable the moment any cash leaves the drawer as a paid-out —
    // the drawer is short by an amount the ledger never recorded, and the variance is
    // unattributable." Rs 300 left the drawer for the vegetable man; Rs 1,000 of cash was
    // tendered; Rs 750 is counted. The drawer is Rs 50 OVER, not Rs 250 SHORT, and a cashier
    // told she is Rs 250 short at the end of her shift over a paid-out SHE recorded is the
    // precise harm `02-F23`'s staff-protection framing exists to prevent.
    mountWith(
      aCashState({
        shifts: [
          aShift({
            shift_id: "shift-77",
            expected_json: JSON.stringify({ cash: 100_000 }),
            paid_out_paisa: 30_000,
          }),
        ],
        days: [aDay()],
      }),
    );
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("750");
    await waitFor(() => expect(screen.getAllByText("OVER Rs 50").length).toBeGreaterThan(0));
    expect(
      screen.queryAllByText("SHORT Rs 250"),
      "02-F44 — the paid-out was ignored, so the cashier is falsely short by what she paid out",
    ).toEqual([]);

    press(LABEL.closeShift);
    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("shift.closed");
    expect(req.payload.variance_paisa).toBe(5_000);
    // The SNAPSHOT is the tender by method, unadjusted — a paid-out is not a tender method, and
    // netting it into the `cash` bucket would make `01-F30`'s conservation unresolvable.
    expect((req.payload.expected_paisa_by_method as Record<string, number>).cash).toBe(100_000);
  });
});

describe("C34 — closing the day (02-F24)", () => {
  it("records BOTH the manager's count and the deposit, against the same day", async () => {
    // `02-F24`: "manager cash count + deposit record → `day.closed`, `cash.deposit_recorded`".
    // Two facts and two events. A close that emits only `day.closed` leaves the night's cash
    // accounted for in no deposit record at all — which is the same silent path `02-F43` names
    // and forbids one level down.
    mountWith(
      aCashState({ days: [aDay({ day_id: "day-live" })], shifts: [aShift({ closed: 1 })] }),
    );
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("8000");
    press(LABEL.closeDay);

    await waitFor(() => expect(appended.length).toBeGreaterThan(1));
    const closed = only("day.closed");
    expect(closed.payload.day_id).toBe("day-live");
    expect(closed.payload.counted_cash_paisa).toBe(800_000);

    const deposit = only("cash.deposit_recorded");
    expect(deposit.payload.day_id, "02-F24 — the deposit belongs to the day it closed").toBe(
      "day-live",
    );
    // The FR names a deposit record and no rule for its value (all of it? the takings above the
    // float?), so what is pinned is that a real integer-paisa amount is recorded, not which one.
    expect(Number.isInteger(deposit.payload.amount_paisa)).toBe(true);
    expect(deposit.payload.amount_paisa as number).toBeGreaterThanOrEqual(0);
  });
});

describe("C28 — the no-sale drawer open (02-F21, 02-F43)", () => {
  it("appends cash.drawer_opened with reason=no_sale, bound to the open shift", async () => {
    // `02-F21` names this a classic theft vector and requires it "logged AND counted". `02-F22`
    // binds drawer events to the cashier's shift, and `26 §7` makes that a CARRIED key — a fold
    // asking "which shift was open when this arrived?" reads the READING device's state, so two
    // devices project different money from one event set (`01-F34`).
    mountWith(aCashState({ shifts: [aShift({ shift_id: "shift-77" })], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    press(LABEL.noSale);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("cash.drawer_opened");
    expect(req.payload.reason).toBe("no_sale");
    expect(req.payload.shift_id).toBe("shift-77");
  });

  it("SUCCEEDS with no shift open, and records the null shift reference (02-F43, 01-F17)", async () => {
    // `02-F43`: a drawer legitimately opens before the first shift of the day — making change, a
    // supplier at the door — and `01-F17` forbids blocking. "Never a modal, never a block." The
    // event is accepted, recorded against a NULL shift reference and counted into the unbound
    // bucket. A guard that refuses this is asserting the exact opposite of the FR, and the
    // unlogged open it produces IS the theft vector `02-F21` exists to catch.
    mountWith(aCashState());
    render(<Counter />);
    await goToTab("Cash");

    press(LABEL.noSale);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("cash.drawer_opened");
    expect(req.payload.reason).toBe("no_sale");
    expect(req.payload.shift_id).toBeNull();
  });
});

describe("C29 — paying the vegetable man out of the drawer (02-F26, 02-F44, 02-F43)", () => {
  it("appends cash.paid_out carrying the amount in integer paisa, a reason and a receipt ref", async () => {
    mountWith(aCashState({ shifts: [aShift({ shift_id: "shift-77" })], days: [aDay()] }));
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("300");
    tapIfOffered(A_REASON);
    tapIfOffered(A_PHOTO);
    press(LABEL.paidOut);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("cash.paid_out");
    // `02-F44` — the amount is required and the DIRECTION is carried by the event type, never by
    // a sign: a negative `amount_paisa` is a deposit in disguise that nets the drawer the wrong
    // way, and `01-F4` refuses it at emit.
    expect(req.payload.amount_paisa).toBe(30_000);
    expect(typeof req.payload.reason).toBe("string");
    expect((req.payload.reason as string).length).toBeGreaterThan(0);
    // `02-F26`: "receipt photo (object storage ref)". `02 §8`: captured locally, uploaded
    // opportunistically, referenced by id — the event never waits for the upload.
    expect(typeof req.payload.receipt_photo_ref).toBe("string");
    expect((req.payload.receipt_photo_ref as string).length).toBeGreaterThan(0);
    expect(req.payload.shift_id).toBe("shift-77");
  });

  it("SUCCEEDS with no shift open, against a null shift reference (02-F43)", async () => {
    // The same half of `02-F43` the drawer open exercises, on the event that actually removes
    // money: unbound petty cash that leaves the drawer accounted for in no shift, no day and no
    // anomaly is money vanishing from `02-F23`'s expected cash with nothing to point at.
    mountWith(aCashState());
    render(<Counter />);
    await goToTab("Cash");

    typeRupees("300");
    tapIfOffered(A_REASON);
    tapIfOffered(A_PHOTO);
    press(LABEL.paidOut);

    await waitFor(() => expect(appended.length).toBeGreaterThan(0));
    const req = only("cash.paid_out");
    expect(req.payload.amount_paisa).toBe(30_000);
    expect(req.payload.shift_id).toBeNull();
  });
});
