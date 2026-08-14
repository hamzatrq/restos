// ACCEPTANCE TESTS — `02-F20`'s local manager-PIN pad, on the screen.
//
// PROVENANCE (24 §3 step 2): authored and implemented by the same session; the mitigation is the
// round-3 law, and the mutation matrix is in the session report. `main/__acceptance__/
// escalation.test.ts` owns the authorization half — nothing here may be read as evidence that a
// refusal is enforced, because everything below runs against a stubbed bridge and Commandment 8
// puts the refusal in main whatever a screen draws.
//
// THE FRs THIS FILE IS WRITTEN FROM:
//
//   02-F20 "Two equivalent authorization paths: **local manager PIN on the POS**; remote approval
//          via manager console." Only the first is Wave 1.
//   02-F38 "The control is **absent from the requester's screen** *and* refused server-side."
//          This file owns the FIRST half only.
//   27-F8  the PIN pad is at the 126 dp kiosk minimum — `Tile posture="keypad"`.
//   27-F6  no operational role types non-numeric text on a critical path.
//   01-F61 identify FIRST, then take the PIN, so the per-(device, user) counter can be keyed.
//   01-F17 nothing is blocked: backing out of an approval leaves the counter working.
//   21 §2 / Commandment 6 — `packages/ui` semantic components only. Enforced across every `.tsx`
//          in this directory by `closed-vocabulary.test.ts`; not restated here.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  EscalationResult,
  MenuItem,
  OpenOrder,
} from "../shared/ipc";
import { Counter } from "./Counter";

const REFERENCE_PANEL = { width: 1366, height: 768 } as DOMRectReadOnly;

class StubResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: REFERENCE_PANEL } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const CASHIER = { user_id: "user-ayesha", display_name: "Ayesha" };
const MANAGER = { user_id: "user-hina", display_name: "Hina" };
const OTHER = { user_id: "user-bilal", display_name: "Bilal" };

const DEVICE = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-06",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: CASHIER,
} as DeviceState;

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];
const ORDERS: OpenOrder[] = [];

const CASH = {
  shifts: [
    {
      shift_id: "shift-1",
      cashier: CASHIER.user_id,
      prev_shift_id: null,
      open_at: 1_754_300_000_000,
      expected_json: "{}",
      paid_out_paisa: 0,
      no_sale_count: 0,
      closed: 0,
      counted_cash_paisa: null,
      expected_at_close_json: null,
      variance_paisa: null,
      exceptions_json: "[]",
    },
  ],
  days: [],
  unbound: [],
  unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
};

/** `01-F61`'s PIN, and it begins with `0` — see the `27-F8` test below for why that matters. */
const PIN = "0451";

type MountOpts = {
  /** What main answers `escalationFor` with. `null` = "the matrix does not escalate this". */
  offer?: { satisfied_by: string[] } | null;
  /** What main answers `escalate` with. */
  result?: EscalationResult;
};

const mount = (opts: MountOpts = {}) => {
  const listeners = new Set<() => void>();
  const escalated: { req: AppendRequest; approver: string; pin: string }[] = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => ORDERS),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    cashState: vi.fn(async () => CASH),
    alarms: vi.fn(async () => []),
    staff: vi.fn(async () => [CASHIER, MANAGER, OTHER]),
    // Main REFUSES: `05-F19` puts this above the org threshold and `can()` says `escalate`.
    append: vi.fn(async (_req: AppendRequest) => {
      throw new Error("cash.paid_out needs manager approval (02-F20)");
    }),
    addLine: vi.fn(async (_req: AddLineRequest) => ({ id: "evt-2" })),
    escalationFor: vi.fn(async (_req: AppendRequest) =>
      opts.offer === undefined ? { satisfied_by: ["branch_manager", "owner"] } : opts.offer,
    ),
    escalate: vi.fn(async (req: AppendRequest, approver: string, pin: string) => {
      escalated.push({ req, approver, pin });
      return opts.result ?? ({ ok: true, id: "evt-9" } as EscalationResult);
    }),
    onChanged: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  render(<Counter />);
  return { bridge, escalated };
};

const press = (label: string) => {
  const control = screen
    .getAllByRole("button")
    .find((b) => (b.textContent ?? "").trim().startsWith(label));
  if (control === undefined) throw new Error(`no control labelled ${label}`);
  fireEvent.click(control);
};

/** Drive the Cash surface to a refused, above-threshold paid-out. */
const refusedPaidOut = async () => {
  // The shell paints "Starting…" until `deviceState()` answers (`01-F17` — nothing to draw yet).
  await screen.findByText("Cash");
  press("Cash");
  await screen.findAllByText("Paid out");
  // `02-F26` — the tile is unavailable until a reason and a receipt ref exist.
  press("Supplier");
  // ⚠ WIDENED 2026-08-14, by the test owner, under `02-F53`. This pressed `"Receipt photo"`.
  // NOTHING IS RETIRED HERE: this is `refusedPaidOut`, a NAVIGATOR that drives the Cash surface
  // to a refused above-threshold paid-out so the ESCALATION pad renders. This file owns
  // `02-F20`'s pad and asserts nothing whatever about the receipt control's wording — the label
  // is `CashSurfaces.tsx`'s, and `cash-tab.dom.test.tsx` (its owning oracle) already navigates
  // tolerantly with `/photo|receipt|camera/i` for exactly this reason. `02-F53` relabels the
  // control `Receipt kept` / `confirmed`, because there is no camera, no file picker and no
  // uploader anywhere in this product and the old label made `cash.paid_out.receipt_photo_ref`
  // assert an image nobody photographed, permanently (`01-F1`). Matching the stable prefix keeps
  // this navigator pointed at the control rather than at a word another FR owns.
  press("Receipt");
  press("Paid out");
};

afterEach(cleanup);

describe("02-F20 — the local manager-PIN path appears when the matrix escalates", () => {
  it("raises the pad only after MAIN says the write escalates", async () => {
    const { bridge } = mount();
    await refusedPaidOut();

    // The refusal is main's; the renderer asks the SAME guard whether a credential closes it.
    await waitFor(() => expect(bridge.escalationFor).toHaveBeenCalled());
    // `02-F20`'s roles, read off the matrix by main and rendered verbatim. A screen that printed
    // "manager" would be `18 §5`'s banned inline role check relocated into UI.
    const heading = await screen.findByText(/Manager approval needed/);
    expect(heading.textContent).toContain("branch_manager");
    expect(heading.textContent).toContain("owner");
  });

  it("raises NOTHING when main says the write does not escalate", async () => {
    // A plain `deny` (or an allowed write that failed for another reason) must not produce an
    // approval pad: a control that cannot succeed is worse than the refusal it decorates.
    mount({ offer: null });
    await refusedPaidOut();
    await waitFor(() => expect(screen.queryByText(/Manager approval needed/)).toBeNull());
    // `01-F17` — and the counter is still working underneath.
    expect(screen.getAllByText("Paid out").length).toBeGreaterThan(0);
  });

  it("02-F38 — the requester's own tile is ABSENT from the approver grid", async () => {
    mount();
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);

    // The roster carries all three; the grid may not offer the cashier her own name.
    expect(screen.getByText(MANAGER.display_name)).toBeTruthy();
    expect(screen.getByText(OTHER.display_name)).toBeTruthy();
    const tiles = screen.getAllByRole("button").map((b) => (b.textContent ?? "").trim());
    expect(tiles).not.toContain(CASHIER.display_name);
  });
});

describe("01-F61/27-F8 — identify, then the PIN", () => {
  it("takes the identity FIRST and submits both to main", async () => {
    const { bridge, escalated } = mount();
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);

    // Choosing costs nothing and sends nothing — `01-F61`: "the per-(device, user) counter is
    // charged only when a PIN is actually submitted against that user".
    press(MANAGER.display_name);
    await screen.findByText("Approve");
    expect(bridge.escalate).not.toHaveBeenCalled();

    for (const digit of PIN) press(digit);
    press("Approve");

    await waitFor(() => expect(escalated).toHaveLength(1));
    expect(escalated[0]?.approver).toBe(MANAGER.user_id);
    expect(escalated[0]?.req.type).toBe("cash.paid_out");
  });

  it("27-F8 — a PIN beginning with 0 is enterable: this is NOT NumericKeypad", async () => {
    const { escalated } = mount();
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);
    press(MANAGER.display_name);
    await screen.findByText("Approve");

    for (const digit of PIN) press(digit);
    press("Approve");

    await waitFor(() => expect(escalated).toHaveLength(1));
    // `NumericKeypad.acceptKeystroke` computes `current === "0" ? key : current + key`, which is
    // right for rupees and would turn "0451" into "451" — a silent permanent lockout of roughly a
    // tenth of enrolled staff. THIS is the assertion that a money component was not reused for a
    // secret, and it fails the moment one is.
    expect(escalated[0]?.pin).toBe(PIN);
  });

  it("the digits are never shown — one mark each (01-F61, shoulder-surfing is the norm)", async () => {
    mount();
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);
    press(MANAGER.display_name);
    await screen.findByText("Approve");
    for (const digit of PIN) press(digit);

    expect(screen.getByText("•".repeat(PIN.length))).toBeTruthy();
    // The entry itself appears nowhere on the surface.
    expect(document.body.textContent ?? "").not.toContain(PIN);
  });

  it("Clear costs nothing and submits nothing — a fat finger is not a failed attempt", async () => {
    const { bridge } = mount();
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);
    press(MANAGER.display_name);
    await screen.findByText("Approve");

    press("9");
    press("9");
    expect(screen.getByText("••"), "two keystrokes, two marks").toBeTruthy();
    press("Clear");
    // The buffer is empty again — and nothing was submitted, so `01-F61`'s counter is untouched.
    expect(screen.queryByText("••")).toBeNull();
    expect(bridge.escalate).not.toHaveBeenCalled();
  });
});

describe("02-F20/01-F17 — what the answer does to the screen", () => {
  it("closes the pad when main approves", async () => {
    mount();
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);
    press(MANAGER.display_name);
    await screen.findByText("Approve");
    for (const digit of PIN) press(digit);
    press("Approve");

    await waitFor(() => expect(screen.queryByText("Approve")).toBeNull());
    // …and the Cash surface is back, not a blank work area.
    expect(screen.getAllByText("Paid out").length).toBeGreaterThan(0);
  });

  it("keeps the pad and SAYS WHY when main refuses", async () => {
    mount({ result: { ok: false, refused: "bad_pin" } });
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);
    press(MANAGER.display_name);
    await screen.findByText("Approve");
    for (const digit of PIN) press(digit);
    press("Approve");

    // `00 §5.7` — the device reports what is true. A refusal with no feedback is
    // indistinguishable from a stuck app, and the manager is standing right there.
    await screen.findByText("That PIN was not accepted.");
    expect(screen.getByText("Approve")).toBeTruthy();
  });

  it("02-F38 — a self-approval refusal is worded as itself, not as a bad PIN", async () => {
    // The four causes are kept apart because the operator's next act differs: re-key, or fetch
    // somebody else. Collapsing them sends her to re-type a PIN that was already right.
    mount({ result: { ok: false, refused: "self_approval" } });
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);
    press(MANAGER.display_name);
    await screen.findByText("Approve");
    press("0");
    press("Approve");

    await screen.findByText("You cannot approve your own request.");
  });

  it("01-F17 — Cancel leaves the counter exactly as it was", async () => {
    const { bridge } = mount();
    await refusedPaidOut();
    await screen.findByText(/Manager approval needed/);

    press("Cancel");
    await waitFor(() => expect(screen.queryByText(/Manager approval needed/)).toBeNull());
    expect(bridge.escalate).not.toHaveBeenCalled();
    expect(screen.getAllByText("Paid out").length).toBeGreaterThan(0);
  });
});
