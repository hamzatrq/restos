/**
 * # `C26` / `02-F20` / `02-F61` — VOID, COMP AND DISCOUNT REACH THE COUNTER
 *
 * `plans/v0.md` gap 1. Three of `01 §4`'s six correctives had payload schemas, matrix rows and an
 * approval path and **no control anywhere**, so a cashier who mis-rang a dish after **Send to
 * kitchen** had no act available to her and `01-F1` made it permanent.
 *
 * **The assertion this file is really for is `01-F83`'s attempt key surviving a retry** (§C). A
 * suite that only checks "a `void.recorded` was appended" blesses an implementation that mints a
 * fresh key inside `approve`, and that implementation makes a double-tapped manager approval
 * subtract the money twice — converged on every device, permanent, and invisible to every test of
 * a single append. It is the exact failure `01-F31` exists to prevent, one family over.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppendRequest,
  CampaignOffer,
  DeviceState,
  EscalationOffer,
  EscalationResult,
  MenuItem,
  OpenOrder,
} from "../shared/ipc";
import { Counter } from "./Counter";
import { CORRECTION_REASONS, correctionUnavailable } from "./LineCorrection";

class StubResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: { width: 1366, height: 768 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const DEVICE: DeviceState = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-13",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user: { user_id: "user-ayesha", display_name: "Ayesha" },
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const KARAHI = 45_000;
const NAAN = 6_000;

const ORDER: OpenOrder = {
  order_id: "order-1",
  reference: "order-1",
  total_paisa: KARAHI + NAAN,
  paid_paisa: 0,
  channel: "counter",
  confirmed_at: 1_754_300_000_000,
  lines: [
    {
      line_id: "line-karahi",
      name: "Karahi",
      quantity: 1,
      modifiers: [],
      removals: [],
      note: null,
      billed_paisa: KARAHI,
      states: ["in_prep"],
    },
    {
      line_id: "line-naan",
      name: "Naan",
      quantity: 1,
      modifiers: [],
      removals: [],
      note: null,
      billed_paisa: NAAN,
      states: ["in_prep"],
    },
  ],
};

let appended: AppendRequest[];
let escalated: { req: AppendRequest; approver: string }[];

/**
 * `refuse` is the whole point of the rig: `void.recorded` is `escalate` for a cashier, so the
 * REAL path is append-refused → `escalationFor` → `ManagerApproval` → `escalate`. A fixture whose
 * append always succeeds measures the manager's path never.
 */
const mount = (
  opts: {
    orders?: OpenOrder[];
    refuse?: boolean;
    offer?: EscalationOffer | null;
    /**
     * `17-F27` (a) — the campaign offers main resolves for this order.
     *
     * **UNDEFINED means the bridge does not serve the channel at all**, which is both the
     * pre-`17-F27` product and a real shipping state (`campaignOffers` is optional on the
     * contract). Every test above mounts that way, so they are the control for §F below: no
     * panel, no citation, every discount discretionary.
     */
    campaigns?: readonly CampaignOffer[];
  } = {},
) => {
  appended = [];
  escalated = [];
  const bridge = {
    deviceState: vi.fn(async () => DEVICE),
    openOrders: vi.fn(async () => opts.orders ?? [ORDER]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    staff: vi.fn(async () => [
      { user_id: "user-hina", display_name: "Hina", roles: ["branch_manager"] },
    ]),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      if (opts.refuse === true && req.type.endsWith(".recorded")) throw new Error("escalate");
      return { id: `evt-${appended.length}` };
    }),
    escalationFor: vi.fn(
      async (): Promise<EscalationOffer | null> =>
        opts.offer === undefined ? { satisfied_by: ["branch_manager"] } : opts.offer,
    ),
    escalate: vi.fn(async (req: AppendRequest, approver: string): Promise<EscalationResult> => {
      escalated.push({ req, approver });
      return { ok: true, id: "evt-approved" };
    }),
    addLine: vi.fn(async () => ({ id: "evt-line" })),
    ...(opts.campaigns === undefined
      ? {}
      : { campaignOffers: vi.fn(async () => opts.campaigns as readonly CampaignOffer[]) }),
    quickTags: vi.fn(async () => ["less spicy"]),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return bridge;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});
afterEach(cleanup);

const appendsOf = (type: string) => appended.filter((r) => r.type === type);

/** Open the surface: the entry control, then the line, then the act. */
const openSurface = async () => {
  render(<Counter />);
  fireEvent.click(await screen.findByRole("button", { name: /correct a line/i }));
};
const pick = async (name: RegExp) => fireEvent.click(await screen.findByRole("button", { name }));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE CONTROLS EXIST AND THEY EMIT. `02-F61`'s owed surface.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F61 — all three correctives are reachable from the counter", () => {
  it("a cashier can void a line, and the event names that line on refs", async () => {
    // MUTATION THIS CATCHES: the whole surface unmounted; the act table wired to one event type;
    // the line taken from the cart's first row rather than the one pressed.
    mount();
    await openSurface();
    await pick(/naan/i);
    await pick(/^void/i);
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));

    await waitFor(() => expect(appendsOf("void.recorded")).toHaveLength(1));
    const req = appendsOf("void.recorded")[0];
    expect(req?.payload).toMatchObject({
      order_id: "order-1",
      amount_paisa: NAAN,
      reason: CORRECTION_REASONS[0],
      approver_user_id: null,
    });
    expect(req?.refs, "00 §6 — the line is a soft reference on the envelope").toEqual([
      "line-naan",
    ]);
  });

  it("comp and discount emit their OWN event types, not a void wearing a label", async () => {
    // MUTATION THIS CATCHES: `CORRECTION_EVENT_TYPES` collapsed to one type — which is invisible
    // to any assertion that only checks "something was appended".
    mount();
    await openSurface();
    await pick(/karahi/i);
    await pick(/^comp/i);
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));
    await waitFor(() => expect(appendsOf("comp.recorded")).toHaveLength(1));
    expect(appendsOf("comp.recorded")[0]?.payload).toMatchObject({ amount_paisa: KARAHI });
    expect(appendsOf("void.recorded"), "a comp is not a void").toHaveLength(0);
  });

  it("a discount carries the amount the operator ENTERED, not the line's value", async () => {
    // The one number this surface originates. MUTATION THIS CATCHES: a discount falling through to
    // the line total, which would make it indistinguishable from a comp and silently give away the
    // whole dish whenever a cashier meant Rs 100.
    mount();
    await openSurface();
    await pick(/karahi/i);
    await pick(/^discount/i);
    for (const key of ["1", "0", "0"])
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${key}$`) }));
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));

    await waitFor(() => expect(appendsOf("discount.recorded")).toHaveLength(1));
    expect(appendsOf("discount.recorded")[0]?.payload).toMatchObject({ amount_paisa: 10_000 });
  });

  it("every emission carries an `adjustment_attempt_id` and NEVER a settlement key", async () => {
    // `01-F83`. The two names share one uniqueness space deliberately and the FIELD NAME is what
    // stops a fold summing both sides of `01-F30`'s equation into one Σ.
    //
    // It is also `01-F4`'s hardest edge on this repo: `parseEvent` returns `payload: unknown`, so
    // `tsc` cannot see a missing required field — and an event appended without the key throws
    // inside `readAllParsed()` at STORE OPEN, i.e. a till that will not start, for ever.
    mount();
    await openSurface();
    await pick(/naan/i);
    await pick(/^void/i);
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));
    await waitFor(() => expect(appendsOf("void.recorded")).toHaveLength(1));

    const payload = appendsOf("void.recorded")[0]?.payload as Record<string, unknown>;
    expect(typeof payload.adjustment_attempt_id).toBe("string");
    expect((payload.adjustment_attempt_id as string).length).toBeGreaterThan(30);
    expect(payload, "01-F83 — one namespace, two field names").not.toHaveProperty(
      "settlement_attempt_id",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `27-F6` / `27-F5`: nothing is typed, and nothing that cannot work is offered.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 27-F6/27-F5 — the reason is picked and a dead line says why", () => {
  it("the reason is a pick-list of controls, with no text input anywhere on the surface", async () => {
    // `27-F6`: 24 of 27 field subjects could not type a single word. MUTATION THIS CATCHES: a
    // free-text reason box, which is the shape a session reaches for when a schema says
    // `z.string().min(1)`.
    mount();
    await openSurface();
    await pick(/naan/i);
    await pick(/^void/i);
    for (const reason of CORRECTION_REASONS)
      expect(await screen.findByRole("button", { name: new RegExp(reason, "i") })).toBeTruthy();
    expect(screen.queryAllByRole("textbox"), "27-F6 — no typing on this path").toHaveLength(0);
  });

  it("a line that cannot be corrected is DISABLED IN PLACE with the reason shown", async () => {
    // `27-F5`: a control that vanishes destroys positional memory; an unexplained dead one reads
    // as a broken app. MUTATION THIS CATCHES: filtering terminal lines out of the list.
    mount({
      orders: [
        {
          ...ORDER,
          lines: [
            ORDER.lines[0] as OpenOrder["lines"][number],
            { ...(ORDER.lines[1] as OpenOrder["lines"][number]), states: ["served"] },
          ],
        },
      ],
    });
    await openSurface();
    const naan = await screen.findByRole("button", { name: /naan/i });
    expect(naan.textContent?.toLowerCase(), "01-F35 — served is terminal").toContain("served");
  });

  it("`correctionUnavailable` names every case, and null only for a live line", () => {
    // The policy alone, so a rendering change cannot quietly widen it. This is a COURTESY —
    // `main/line-void.ts` re-derives all of it and refuses there (Commandment 8).
    const base = { line_id: "l", name: "n", quantity: 1 };
    expect(correctionUnavailable({ ...base, billed_paisa: 1, states: ["in_prep"] })).toBeNull();
    for (const s of ["served", "delivered", "voided", "cancelled"])
      expect(correctionUnavailable({ ...base, billed_paisa: 1, states: [s] })).toContain(s);
    expect(
      correctionUnavailable({ ...base, billed_paisa: 1, states: ["voided", "cancelled"] }),
      "01-F31 — a fold never picks a winner and neither may a screen",
    ).toMatch(/disputed/);
    expect(correctionUnavailable({ ...base, states: ["in_prep"] }), "01-F54 degrade").toMatch(
      /not projected/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `01-F83`. THE ATTEMPT KEY SURVIVES THE RETRY. The assertion this file exists for.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F83 — one act is one key, across the refusal and the approval", () => {
  it("a cashier's refused void raises the manager pad rather than dying silently", async () => {
    // `02-F49`: "the refusal must hand the operator the escalation for the SAME line in the same
    // gesture". MUTATION THIS CATCHES: `write` instead of `escalatableWrite` — which is exactly
    // what `removeLine` next door correctly uses, so it is the plausible wrong copy.
    mount({ refuse: true });
    await openSurface();
    await pick(/naan/i);
    await pick(/^void/i);
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));
    expect(await screen.findByRole("button", { name: /hina/i })).toBeTruthy();
  });

  it("⚠ the manager-approved retry carries the SAME key as the refused attempt", async () => {
    // **THE ASSERTION THIS FILE EXISTS FOR.** `01-F83`: "minted at the UI … before the append, and
    // reused by a retry of the same act". `01-F8`'s event-id dedupe already covers transport
    // duplicates; the case this key exists for is a DOUBLE-TAPPED APPROVAL — two genuine events
    // with two envelope ids that must sum ONCE.
    //
    // MUTATION THIS CATCHES: `adjustment_attempt_id: newId()` moved inside `approve`, or derived
    // from the envelope. Both look right, both pass every assertion in §A, and both make a
    // double-tapped approval subtract the money twice — permanently (`01-F1`), converged
    // everywhere, on an append-only ledger with no way to take it back.
    mount({ refuse: true });
    await openSurface();
    await pick(/naan/i);
    await pick(/^void/i);
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));

    const refusedKey = (
      appendsOf("void.recorded")[0]?.payload as Record<string, unknown> | undefined
    )?.adjustment_attempt_id;
    expect(typeof refusedKey).toBe("string");

    fireEvent.click(await screen.findByRole("button", { name: /hina/i }));
    for (const key of ["1", "2", "3", "4"])
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${key}$`) }));
    fireEvent.click(await screen.findByRole("button", { name: /^approve$/i }));

    await waitFor(() => expect(escalated).toHaveLength(1));
    const approved = escalated[0];
    const approvedKey = (approved?.req.payload as Record<string, unknown> | undefined)
      ?.adjustment_attempt_id;
    expect(approvedKey, "one act, one key").toBe(refusedKey);
    expect(approved?.req.refs, "and the same line").toEqual(["line-naan"]);
  });

  it("two SEPARATE corrections get two different keys", async () => {
    // The other half, and it is not implied by the first: an implementation that minted ONE key at
    // module scope, or reused a constant, would pass the retry assertion above and then collapse
    // two genuine voids into one — cash vanishing silently, which is `01-F31`'s named failure.
    mount();
    await openSurface();
    await pick(/naan/i);
    await pick(/^void/i);
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));
    await waitFor(() => expect(appendsOf("void.recorded")).toHaveLength(1));

    fireEvent.click(await screen.findByRole("button", { name: /correct a line/i }));
    await pick(/karahi/i);
    await pick(/^void/i);
    await pick(new RegExp(CORRECTION_REASONS[1], "i"));
    await waitFor(() => expect(appendsOf("void.recorded")).toHaveLength(2));

    const keys = appendsOf("void.recorded").map(
      (r) => (r.payload as Record<string, unknown>).adjustment_attempt_id,
    );
    expect(new Set(keys).size, "two acts, two keys").toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — HONESTY. Two of the three do not move the bill, and the screen says so (`00 §5.7`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D DEC-MONEY-010 — what each act does to the bill is stated, not inferred", () => {
  it("the comp and discount controls say the bill does NOT change yet", async () => {
    // `DEC-MONEY-010` holds `01-F30`'s `comp_value` and `discounts` terms ABSENT until gate (iii),
    // so a comp is recorded and the total does not move — the ruling's own named cost ("a
    // legitimately comped order reads as a conservation SHORTFALL"). `00 §5.7` requires the
    // degradation to be NAMED and `27-F12` requires a word, not a colour.
    //
    // MUTATION THIS CATCHES: the honesty words deleted — which leaves a cashier comping a dish,
    // seeing an unchanged total, and taking full payment.
    mount();
    await openSurface();
    await pick(/karahi/i);
    await pick(/^comp/i);
    expect(
      screen.getAllByText(/does not change yet/i).length,
      "a comp that silently leaves the bill alone is worse than no control",
    ).toBeGreaterThan(0);
  });

  it("a VOID says the opposite, because for a void it IS true", async () => {
    // The control for the honesty assertion: if both words read the same, the sentence above is
    // measuring the presence of a string rather than the truth of a claim.
    mount();
    await openSurface();
    await pick(/naan/i);
    await pick(/^void/i);
    expect(screen.getAllByText(/comes off the bill now/i).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — `17-F27` — THE CITATION, DRIVEN. The producer `17-F24` assumed and never had.
//
// ⚠ **THIS IS THE BEHAVIOURAL HALF, and it exists because the seam assertion beside it is a
// SOURCE-STRING match.** `loyalty-seam.test.ts` §E SEAM 5 reads `Counter.tsx` for the payload
// spread — the same weak instrument `line-advance-seam.test.ts` §A uses, and it proves the line
// exists and nothing about what reaches the ledger. Everything below presses real controls and
// reads what `append` was actually called with.
//
// The defect it is aimed at: before `17-F27` this payload was five literal fields, so
// `payload.campaign_id` was `undefined` on every `discount.recorded` any surface could emit,
// `canDiscount`'s campaign arm could never fire, and three campaign functions were dead. Nothing
// in 1,372 tests could tell that from a working implementation.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const OFFER: CampaignOffer = { campaign_id: "camp-bank", bound_paisa: 1_000_000 };

describe("§F 17-F27 — a cashier can CITE a campaign, and the citation reaches the payload", () => {
  const enter = async (digits: string) => {
    for (const key of digits)
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${key}$`) }));
  };

  it("the cited campaign travels on `discount.recorded`", async () => {
    mount({ campaigns: [OFFER] });
    await openSurface();
    await pick(/karahi/i);
    await pick(/^discount/i);
    await pick(/camp-bank/i);
    await enter("100");
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));

    await waitFor(() => expect(appendsOf("discount.recorded")).toHaveLength(1));
    const payload = appendsOf("discount.recorded")[0]?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ amount_paisa: 10_000, campaign_id: "camp-bank" });
    // ⚠ **The renderer does NOT send a version.** `17-F27` (c) puts the stamp at the writer,
    // because a version the renderer supplied answers `17-F25`'s "under what rule?" with a number
    // no publisher minted. A screen that sent one would be the untrusted side asserting the rule.
    expect(payload).not.toHaveProperty("campaign_version");
  });

  it("`No offer` is a real control, and a discretionary discount carries NO key at all", async () => {
    // `registry.ts` declares the field `.optional()` and says why: absence means discretionary,
    // which is the ordinary case, so there is nothing for a `null` to state. MUTANT this kills:
    // `campaign_id: correction.campaign_id` unconditionally, which writes `null` into the
    // commonest event in this family — permanently (`01-F1`).
    mount({ campaigns: [OFFER] });
    await openSurface();
    await pick(/karahi/i);
    await pick(/^discount/i);
    await pick(/camp-bank/i);
    await pick(/no offer/i);
    await enter("100");
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));

    await waitFor(() => expect(appendsOf("discount.recorded")).toHaveLength(1));
    expect(appendsOf("discount.recorded")[0]?.payload).not.toHaveProperty("campaign_id");
  });

  it("a VOID and a COMP never cite a campaign, whatever was selected", async () => {
    // `17-F24`'s arm is `canDiscount`'s alone. MUTANT this kills: the citation carried on every
    // act, which would put a campaign id on a void — a rule that authorised nothing.
    mount({ campaigns: [OFFER] });
    await openSurface();
    await pick(/karahi/i);
    await pick(/^discount/i);
    await pick(/camp-bank/i);
    // ...and she changes her mind about the ACT, which must clear the citation with it.
    await pick(/^comp/i);
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));
    await waitFor(() => expect(appendsOf("comp.recorded")).toHaveLength(1));
    expect(appendsOf("comp.recorded")[0]?.payload).not.toHaveProperty("campaign_id");
  });

  it("⚠ THE CONTROL — a bridge that serves no offers shows no panel and still emits", async () => {
    /*
      This is the state every other test in this file mounts, and it is a real shipping one: the
      channel is optional on the contract, a device may hold no artifact, and `17-F24` as amended
      refuses a campaign whose scope this till cannot resolve. The surface must behave EXACTLY as
      it did before `17-F27` — which is what makes the three tests above evidence about the
      citation rather than about the surface having changed.
    */
    mount();
    await openSurface();
    await pick(/karahi/i);
    await pick(/^discount/i);
    expect(screen.queryByText(/under which offer/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /no offer/i })).toBeNull();
    await enter("100");
    await pick(new RegExp(CORRECTION_REASONS[0], "i"));
    await waitFor(() => expect(appendsOf("discount.recorded")).toHaveLength(1));
    expect(appendsOf("discount.recorded")[0]?.payload).toMatchObject({ amount_paisa: 10_000 });
  });

  it("the offer names the campaign and the bound it allows — a citation is not an instruction", async () => {
    // `17-F27` (b): no tile applies an amount. The bound is shown so a cashier knows what she may
    // give; the number she enters stays hers, and the writer decides whether the pair is
    // pre-approved. MUTANT this kills: a tile that sets the entry, which would have to resolve
    // `item_scope`'s base — the refusal `17-F24`'s amendment records.
    mount({ campaigns: [OFFER] });
    await openSurface();
    await pick(/karahi/i);
    await pick(/^discount/i);
    const tile = await screen.findByRole("button", { name: /camp-bank/i });
    expect(within(tile).getByText(/10,000/)).toBeTruthy();
    fireEvent.click(tile);
    // Selecting an offer must not enter an amount: the `Why` panel is gated on a positive entry,
    // so if the tile had applied one the reasons would be on screen already.
    expect(
      screen.queryByRole("button", { name: new RegExp(CORRECTION_REASONS[0], "i") }),
    ).toBeNull();
  });
});
