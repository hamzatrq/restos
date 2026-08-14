// ACCEPTANCE TESTS — `02-F56`: a drawer that was not counted is never recorded as a drawer
// counted at zero.
//
// PROVENANCE (`24 §3` step 2): authored from spec text by the test-authoring session for the
// August 2026 dress rehearsal. **Committed RED.** The FRs read for this file, and nothing else:
//
//   02-F56  either the close REQUIRES the count, or the surface STATES the number and the
//           variance it is about to record before the press; the third behaviour — accept, record
//           a count nobody took, say nothing — is forbidden. Zero is a legitimate count and that
//           is the problem. Not an `01-F17` block. The event and its schema are untouched.
//           `02-F24`'s day close binds identically.
//   02-F23  shift close: system-expected cash (by method) vs **counted cash**; over/short
//           recorded and **attributed**; the cashier sees her own reconciliation ("I'm clean").
//   02-F24  day close: manager cash count + deposit record → `day.closed`,
//           `cash.deposit_recorded`.
//   02-F48  `day.opened` accepts `opening_float_paisa: 0` because an empty drawer is a real,
//           STATED fact — the precedent that forbids refusing the value.
//   02-F37  "succeed and lie" is the failure mode this FR names.
//   02-F41  attribution is whoever's PIN is in — the shortage lands on her name.
//   01-F1   append-only; the false shortage is permanent and not correctable in place.
//   01-F17  a sale is never blocked. A shift close is not a sale (`01-F60`, `02-F48`).
//   27-F4   disabled IN PLACE with its reason.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// §0 — THE MEASUREMENT (observed on a running till, August 2026)
//
// A dress rehearsal pressed `Close my shift` with the keypad untouched. It was accepted, and it
// wrote `counted_cash_paisa: 0` with a `variance_paisa` of the whole expectation — **an observed
// Rs 1,080 shortage against the cashier's own name**, permanent under `01-F1`, attributed under
// `02-F41`, and read downstream as a real shortage by the manager's reconciliation and the
// owner's nightly summary. Nobody counted anything.
//
// `CashSurfaces.tsx` shows why it is not a slip: `enteredPaisa = (Number(entry) || 0) * 100`, so
// an untouched pad is indistinguishable from a typed `0` **at the event**, and the reconciliation
// block that would have shown her the shortage renders only `entry !== ""` — so the one figure
// `02-F23` calls her protection is on screen in every state except the one that files it.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PINS THAT THE FRs DO NOT — declared, not discovered
//
// If the implementer needs any of these different, that is a FINDING FOR THIS SESSION and not an
// edit to this file (`24 §3` step 2, `.claude/rules/tests-and-conformance.md`).
//
//  1. **The `window.restos.cashState()` shape**, taken verbatim from `cash-tab.dom.test.tsx`,
//     which owns it. Nothing here is a second vocabulary for those rows.
//  2. **`02-F56`'s arm (b) needs WORDS and no FR fixes them**, so `UNCOUNTED` below is a
//     permissive family (`not counted`, `no count`, `uncounted`, `nothing counted`), on
//     `cash-tab.dom.test.tsx`'s own precedent for the paid-out reason. It is the ONE invented
//     vocabulary in this file and it is only ever consulted on arm (b) — an implementation that
//     takes arm (a) never meets it.
//  3. **Arm (a)'s refusal must NAME THE COUNT** (`27-F4`: disabled in place *with its reason*).
//     A control that goes quiet with no reason is the failure that FR exists to prevent, and it
//     would leave a cashier at the end of a shift with a dead button.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// EVERY SECTION IS AIMED AT A PLAUSIBLE WRONG IMPLEMENTATION (the round-3 law):
//
//   §A  **THE DANGEROUS CASE.** An untouched pad against a real expectation. This is the measured
//       defect and it is the only section that can fail on the shipped tree.
//   §B  **THE CONTROL THAT MATTERS MOST** — a STATED zero. `02-F48` says an empty drawer is a
//       real fact, so an implementation that simply refuses `0` has broken the FR in the other
//       direction and §B is what catches it. A suite without §B would bless "ban zero", which is
//       wrong and is the easiest fix to reach for.
//   §C  the ordinary close, so nothing here has banned closing a shift.
//   §D  `01-F17` — a refused close may not take the drawer, the paid-out or the sale down with
//       it. `02-F48`'s M4 row measured that the plausible safe repair kills six `02-F37` tests;
//       this is that hazard, one control along.
//   §E  `02-F24`'s day close, which carries the same hazard into `cash.deposit_recorded`.
//   §F  the event and its schema are untouched (`01-F37`) — no payload key is invented to carry
//       "uncounted", because that would be retroactive on an append-only log.

import { parseEvent } from "@restos/domain";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, DeviceState, MenuItem } from "../shared/ipc";
import { Counter } from "./Counter";

afterEach(cleanup);

/** happy-dom performs no layout. See `counter.dom.test.tsx`. */
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

// ── The fold's rows, as `cash-tab.dom.test.tsx` declares them ───────────────────────────────

type CashShift = {
  shift_id: string;
  cashier: string | null;
  prev_shift_id: string | null;
  open_at: number;
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

/** THE MEASURED FIGURE: Rs 1,080 of cash the fold expects in the drawer. */
const EXPECTED_CASH_PAISA = 108_000;

const aShift = (over: Partial<CashShift> = {}): CashShift => ({
  shift_id: "shift-1",
  cashier: "user-ayesha",
  prev_shift_id: null,
  open_at: 1_780_000_000_000,
  expected_json: JSON.stringify({ cash: EXPECTED_CASH_PAISA }),
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
  business_date: "2026-08-14",
  prev_day_id: null,
  // Held at zero for `cash-tab.dom.test.tsx`'s recorded reason: whether an opening float belongs
  // in a SHIFT's expected cash is undecided (`02-F56`'s closing clause), and at zero every
  // reading agrees, so nothing here depends on the undecided part.
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

const DEVICE: DeviceState = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-14",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

let appended: AppendRequest[];
let unexpectedBridgeCalls: string[];

const mountWith = (cash: CashState) => {
  appended = [];
  unexpectedBridgeCalls = [];
  const known: Record<string, unknown> = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => []),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    cashState: vi.fn(async () => cash),
    alarms: vi.fn(async () => []),
    quickTags: vi.fn(async () => []),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    onChanged: vi.fn(() => () => {}),
  };
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

const railButtons = (): HTMLButtonElement[] => {
  const rail = document.querySelector('nav[aria-label="Main"]');
  return [...(rail?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];
};

/** `cash-tab.dom.test.tsx`'s helper: found by LABEL text, so an unbuilt tab reads as unbuilt. */
const goToCash = async () => {
  await screen.findByText("Order", { exact: true });
  const tab = railButtons().find(
    (b) => (b.querySelector("span")?.textContent ?? "").trim() === "Cash",
  );
  expect(tab, "27-F4 — the rail must carry a Cash tab").toBeDefined();
  fireEvent.click(tab as HTMLButtonElement);
  await waitFor(() =>
    expect(
      railButtons()
        .find((b) => (b.querySelector("span")?.textContent ?? "").trim() === "Cash")
        ?.getAttribute("aria-current"),
    ).toBe("page"),
  );
};

const nameOf = (el: Element): string =>
  el.getAttribute("aria-label") ?? (el.textContent ?? "").trim();

const controlNamed = (re: RegExp): HTMLElement => {
  const found = screen.queryAllByRole("button").find((b) => re.test(nameOf(b)));
  expect(
    found,
    `27-F4 — the ${re} control must be on the surface, disabled IN PLACE if unavailable`,
  ).toBeDefined();
  return found as HTMLElement;
};

const CLOSE_SHIFT = /close\s+(my\s+)?shift/i;
const CLOSE_DAY = /close\s+(the\s+)?day/i;
const NO_SALE = /no.?sale/i;

/**
 * `02-F56`'s arm (b) vocabulary. The ONE invented family in this file (see the header), and it
 * is consulted only when the control was OFFERED against an untouched pad.
 */
const UNCOUNTED = /not\s+counted|no\s+count|uncounted|nothing\s+counted|not\s+been\s+counted/i;

/** Everything the operator can read on the work surface, as one string. */
const surfaceText = (): string => document.querySelector("main")?.textContent ?? "";

/** Type an amount in RUPEES on the 126 dp pad, as a cashier would (`27-F23` — no decimals). */
const typeRupees = (rupees: string) => {
  for (const d of rupees) fireEvent.click(screen.getByRole("button", { name: d }));
};

const closesOf = (type: string) => appended.filter((a) => a.type === type);

/**
 * Every payload must survive the `01 §4` catalog's own schema (`01-F4`). This is the registry,
 * not a transcription of it, so `counted_cash_paisa` being a non-negative integer and
 * `expected_paisa_by_method` being exhaustive are enforced without restating either.
 */
const ENVELOPE = {
  id: "01J00000000000000000000000",
  org_id: "org-1",
  branch_id: "branch-1",
  device_id: "device-1",
  actor_user_id: "user-ayesha",
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
  // `parseEvent` THROWS on a bad payload (`01-F4` — an unknown type or a malformed payload is an
  // error at emit), so the call is the assertion. `cash-tab.dom.test.tsx`'s own shape.
  parseEvent({ ...ENVELOPE, type: r.type, payload: r.payload, refs: r.refs ?? [] });
  return r;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE DANGEROUS CASE. The only section that can fail on the shipped tree.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F56 — closing a shift with an UNCOUNTED drawer", () => {
  it("either refuses with a reason naming the count, or states the shortage BEFORE the press", async () => {
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    const control = controlNamed(CLOSE_SHIFT);
    // `Tile` never sets `disabled` (`01-F59`'s recorded reason), so a refusal shows up as the
    // reason folded into the accessible name — which is `27-F4`'s "disabled in place WITH ITS
    // REASON" exactly, and it is what the shipped surface already does for "no shift open".
    const refusedInPlace = /count/i.test(nameOf(control));

    // What the cashier can read at the moment her finger is over the button. `02-F56` arm (b):
    // "the surface STATES the number and the variance it is about to record before the press".
    const before = surfaceText();
    const statedTheVariance = /Rs\s*1,080/.test(before) && /SHORT/i.test(before);
    const statedItIsUncounted = UNCOUNTED.test(before);

    fireEvent.click(control);
    const closes = closesOf("shift.closed");

    expect(
      refusedInPlace || (statedTheVariance && statedItIsUncounted),
      "02-F56 — the close was accepted in silence against an untouched pad. What lands is " +
        "`counted_cash_paisa: 0` and a Rs 1,080 shortage attributed to the cashier (02-F41) and " +
        "permanent (01-F1) — a count nobody took. Either refuse it (naming the count) or say " +
        "unmistakably what is about to be recorded.\n" +
        `control read: "${nameOf(control)}"\nsurface said: ${JSON.stringify(before)}`,
    ).toBe(true);

    if (refusedInPlace) {
      // Arm (a): nothing may be recorded, and the reason must be on the surface (`27-F4`).
      expect(
        closes,
        "02-F56 arm (a) — the control named a missing count and filed a close anyway",
      ).toHaveLength(0);
    } else {
      // Arm (b): the operator was told, so the record stands — but it must be the ONE she was
      // shown, not some other number.
      for (const close of closes) {
        expect(emittable(close).payload).toMatchObject({ counted_cash_paisa: 0 });
      }
    }
  });

  it("never files a shortage the cashier was not shown", async () => {
    // The sharpest form of the same fact, and the one a reader should take away: a
    // `variance_paisa` of −108000 is what a manager and the owner's nightly summary read as a
    // real Rs 1,080 shortage. It may not exist unless it was on the glass first.
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    const before = surfaceText();
    fireEvent.click(controlNamed(CLOSE_SHIFT));

    for (const close of closesOf("shift.closed")) {
      const variance = (close.payload as { variance_paisa?: number }).variance_paisa ?? 0;
      if (variance === 0) continue;
      expect(
        /Rs\s*1,080/.test(before) && /SHORT/i.test(before),
        `02-F23 — a variance of ${variance} paisa was recorded against Ayesha and the surface ` +
          "never showed it to her. The reconciliation block renders only once something has " +
          'been counted (`entry !== ""`), which is every state except the one that files it.',
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE CONTROL THAT MATTERS MOST: a STATED zero is a real, recordable fact (`02-F48`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F48 — an empty drawer that was COUNTED still closes", () => {
  it("typing 0 and closing records counted_cash_paisa: 0 and the real variance", async () => {
    // `02-F48`'s own words about the sibling case: *"`day.opened` accepts
    // `opening_float_paisa: 0` because an empty drawer is a real, stated fact"*. An
    // implementation that refuses the VALUE has broken `02-F56` in the other direction and left
    // a cashier whose till was robbed unable to close her shift at all.
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    typeRupees("0");
    fireEvent.click(controlNamed(CLOSE_SHIFT));

    await waitFor(() => expect(closesOf("shift.closed")).toHaveLength(1));
    const close = emittable(closesOf("shift.closed")[0] as AppendRequest);
    expect(close.payload).toMatchObject({
      shift_id: "shift-1",
      counted_cash_paisa: 0,
      variance_paisa: -EXPECTED_CASH_PAISA,
    });
  });

  it("and she was shown that shortage before she pressed", async () => {
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    typeRupees("0");
    const before = surfaceText();
    expect(before, "02-F23 — the cashier sees her own reconciliation at close").toMatch(
      /Rs\s*1,080/,
    );
    expect(before, "27-F12 — direction is a WORD, never a sign alone").toMatch(/SHORT/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE ORDINARY CLOSE. Nothing here has banned closing a shift.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F23 — a counted drawer closes and reconciles", () => {
  it("Rs 1,080 counted against Rs 1,080 expected records a zero variance", async () => {
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    typeRupees("1080");
    fireEvent.click(controlNamed(CLOSE_SHIFT));

    await waitFor(() => expect(closesOf("shift.closed")).toHaveLength(1));
    expect(emittable(closesOf("shift.closed")[0] as AppendRequest).payload).toMatchObject({
      counted_cash_paisa: EXPECTED_CASH_PAISA,
      variance_paisa: 0,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `01-F17`: a refused close takes nothing else down with it.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F17 — refusing an uncounted close blocks nothing", () => {
  it("the drawer still opens with no sale, which `02-F21` requires to be logged AND counted", async () => {
    // `02-F48`'s M4 row measured what the plausible safe repair costs: gating an act on a
    // precondition killed six `02-F37` tests that exist to stop exactly this. A close guard that
    // reached the drawer would be that mistake one control along, and `02-F43` says a drawer
    // legitimately opens with no shift at all.
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    fireEvent.click(controlNamed(CLOSE_SHIFT));
    fireEvent.click(controlNamed(NO_SALE));

    await waitFor(() => expect(closesOf("cash.drawer_opened")).toHaveLength(1));
  });

  it("and the counter still sells", async () => {
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();
    fireEvent.click(controlNamed(CLOSE_SHIFT));

    const orderTab = railButtons().find(
      (b) => (b.querySelector("span")?.textContent ?? "").trim() === "Order",
    );
    fireEvent.click(orderTab as HTMLButtonElement);

    fireEvent.click(await screen.findByRole("button", { name: /^In restaurant$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Dine-in$/i }));
    await waitFor(() => expect(closesOf("order.created")).toHaveLength(1));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `02-F24`: the day close carries the same hazard into `cash.deposit_recorded`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F24 / 02-F56 — the day close binds identically", () => {
  it("an uncounted day either refuses or says what it is about to deposit", async () => {
    mountWith(aCashState({ shifts: [], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    const control = controlNamed(CLOSE_DAY);
    const refusedInPlace = /count/i.test(nameOf(control));
    const before = surfaceText();

    fireEvent.click(control);

    const closed = closesOf("day.closed");
    const deposits = closesOf("cash.deposit_recorded");

    expect(
      refusedInPlace || UNCOUNTED.test(before),
      "02-F56 / 02-F24 — the day was closed against an untouched pad. `day.closed` carries a " +
        "`counted_cash_paisa` nobody counted and `cash.deposit_recorded` asserts that amount " +
        "went to the bank. The entry echo reads `Rs 0` whether or not a key was ever pressed, " +
        "so it cannot be the statement arm (b) asks for.\n" +
        `control read: "${nameOf(control)}"`,
    ).toBe(true);

    if (refusedInPlace) {
      expect(closed).toHaveLength(0);
      expect(deposits).toHaveLength(0);
    }
  });

  it("CONTROL — a counted day still closes and deposits what was counted", async () => {
    mountWith(aCashState({ shifts: [], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    typeRupees("5000");
    fireEvent.click(controlNamed(CLOSE_DAY));

    await waitFor(() => expect(closesOf("day.closed")).toHaveLength(1));
    expect(emittable(closesOf("day.closed")[0] as AppendRequest).payload).toMatchObject({
      day_id: "day-1",
      counted_cash_paisa: 500_000,
    });
    expect(emittable(closesOf("cash.deposit_recorded")[0] as AppendRequest).payload).toMatchObject({
      amount_paisa: 500_000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — the event and its schema are UNTOUCHED (`01-F37`, `02-F53`'s identical refusal).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F37 — nothing is invented on the wire to carry 'uncounted'", () => {
  it("every close this surface emits is an ordinary 01 §4 payload", async () => {
    mountWith(aCashState({ shifts: [aShift()], days: [aDay()] }));
    render(<Counter />);
    await goToCash();

    typeRupees("1080");
    fireEvent.click(controlNamed(CLOSE_SHIFT));
    await waitFor(() => expect(closesOf("shift.closed")).toHaveLength(1));

    // `02-F56` is explicit: `shift.closed` keeps a required non-negative `counted_cash_paisa`,
    // because tightening or extending a schema on an append-only log is retroactive. A
    // `counted: false` flag would be exactly that, and it would make every historical close
    // ambiguous rather than fewer future ones wrong.
    for (const close of appended) emittable(close);
    expect(
      unexpectedBridgeCalls,
      "18 §9 — a bridge member this contract does not declare was reached",
    ).toEqual([]);
  });
});
