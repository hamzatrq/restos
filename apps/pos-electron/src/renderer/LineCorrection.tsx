/**
 * # `02-F20` / `02-F61` — THE COUNTER'S CORRECTION SURFACE
 *
 * `02-F61`: *"All six correctives reach this counter … what this FR owes is that each has a
 * counter surface **and** a matrix row to be refused against."* Three of the six carry an amount
 * and a line — void, comp, discount — and none of them had a control anywhere in this product, so
 * a cashier who mis-rang a dish after pressing **Send to kitchen** had no act available to her at
 * all and `01-F1` made the error permanent. That is `plans/v0.md`'s gap 1.
 *
 * ── THE SHAPE, AND WHY IT TAKES THE WHOLE WORK AREA ──────────────────────────────────────────
 *
 * `ManagerApproval`'s precedent, one surface over: a low-frequency, high-consequence act that
 * needs several picks gets the whole box rather than a strip inside the Order tab. `C26` is costed
 * at **0–5 per shift** in `role-task-inventories.md`, against `C8`'s 10–25, which is why the
 * select-then-act flow `Counter.tsx` refuses for NOTES is right here: `02-F50`'s tag lands on the
 * last line precisely because a 10–25× act cannot afford a selection step, and that argument does
 * not reach an act performed five times.
 *
 * **Every input is a tile and nothing is typed** (`27-F6`): the line, the act and the reason are
 * all pick-lists. The one exception is a discount's AMOUNT, which is a `NumericKeypad` — the
 * instrument this device already uses for every money entry (`TenderPanel`, `CashSurfaces`) —
 * because a discount is an amount the operator decides, where a void and a comp take the line's
 * own billed value and have no number to choose. `27-F6` permits typing *"as an optional escape
 * hatch"* and its stated test is whether a non-typing operator can complete the task by another
 * route; she can, for both acts that remove a whole line.
 *
 * ── WHAT EACH ACT DOES TO THE MONEY, WHICH IS NOT THE SAME FOR ALL THREE ─────────────────────
 *
 * **A void removes the money now.** `main/line-void.ts` appends `void.recorded` and, in the same
 * authorized act, the line's `01 §4` exit — and `merge.ts`'s `billedCellPaisa` already returns
 * zero for an exited cell under a merge rule `26 §8` pinned with the lines prototype. So the bill
 * drops on this device and on every device, today.
 *
 * **A comp and a discount are RECORDED and DO NOT MOVE THE BILL YET, and this surface says so
 * rather than letting a cashier infer it from a total that did not change.** Neither is a line
 * exit — `01 §4` has no `comped` state, and `01-F30` models both as terms that subtract from a
 * `billed_total` the line stays inside — so their money needs `01-F30`'s `comp_value` and
 * `discounts` terms, which `DEC-MONEY-010` holds ABSENT until its gate condition (iii), *"an
 * oracle-pinned merge rule in `26 §7`"*, is met. It is not met; `line-void.ts`'s header states the
 * reading and the FR ids it rests on.
 *
 * **A recorded-but-unsubtracted comp is exactly `DEC-MONEY-010`'s own named cost** — *"a
 * legitimately comped order therefore reads as a conservation SHORTFALL"* — so this is the ruled
 * state of the product and not a defect introduced here. What `00 §5.7` requires is that the
 * degradation be NAMED, and `27-F12` requires the state to be carried by a word and a number. It
 * is: the act tile carries the consequence, and the surface repeats it beside the reason.
 */

import { paisa } from "@restos/domain";
import {
  acceptKeystroke,
  MoneyValue,
  NumericKeypad,
  Panel,
  Readout,
  space,
  Tile,
  typography,
  useColor,
} from "@restos/ui";
import { useState } from "react";
import type { CampaignOffer } from "../shared/ipc";

/** One line as this surface needs it — the subset of `OpenOrder["lines"]` it can act on. */
export type CorrectableLine = {
  readonly line_id: string;
  readonly name: string;
  readonly quantity: number;
  /** The engine's own billed value for this line, integer paisa. `undefined` if unprojected. */
  readonly billed_paisa?: number | undefined;
  /** The fold's projected states, verbatim. `undefined` if unprojected. */
  readonly states?: readonly string[] | undefined;
};

/** `01 §4` — a line that has already left cannot leave again (`01-F35`, `LEGAL_NEXT` maps to []). */
const TERMINAL = new Set(["served", "delivered", "voided", "cancelled"]);

export const CORRECTION_ACTS = ["void", "comp", "discount"] as const;
export type CorrectionAct = (typeof CORRECTION_ACTS)[number];

/**
 * `01 §4`'s three event types, keyed by act. Declared once so the surface and its oracle read the
 * same table and a typo cannot make a comp land as a void.
 */
export const CORRECTION_EVENT_TYPES: Readonly<Record<CorrectionAct, string>> = {
  void: "void.recorded",
  comp: "comp.recorded",
  discount: "discount.recorded",
};

/**
 * The operator words, and what each act does to the bill **today** — the honest half.
 *
 * `00 §5.6` English-only; `27-F12` a word and a number, never a colour. The consequence line is
 * not decoration: two of these three record an act whose money `DEC-MONEY-010` holds back, and a
 * cashier who comps a dish and then takes full payment because the total did not move has been
 * misled by this screen.
 */
export const ACT_WORDS: Readonly<Record<CorrectionAct, { label: string; effect: string }>> = {
  void: { label: "Void", effect: "Comes off the bill now" },
  comp: { label: "Comp", effect: "Recorded — the bill does NOT change yet" },
  discount: { label: "Discount", effect: "Recorded — the bill does NOT change yet" },
};

/**
 * `27-F6`'s pick-list — **PINNED, not specified.**
 *
 * `void.recorded` / `comp.recorded` / `discount.recorded` all require `reason` (`z.string().min(1)`
 * in `registry.ts`) and **no FR supplies a list of reasons for any of them**. `01-F84` refused to
 * invent one for `order.cancelled` on exactly that ground, and this pin is taken instead of typed
 * entry on the precedent shipping one surface over: `CashSurfaces.tsx`'s `PAID_OUT_REASONS`
 * (`Supplier` / `Repair` / `Advance` / `Other`) is the same shape for `02-F26`'s paid-out, which
 * likewise names *"reason"* and no list. `Other` is recorded verbatim, exactly as it is there.
 *
 * **ONE list for all three acts**, not three: `02-F20` names them in one clause as one escalation
 * family, three lists would be three habits on one gesture (`27-F4`), and every extra word here is
 * a word no FR asked for. The list is the first thing to replace when `00 §7` layer 2 arrives —
 * R63 already moves the discount THRESHOLD there and a reason list belongs beside it.
 */
export const CORRECTION_REASONS = [
  "Wrong item",
  "Customer changed",
  "Kitchen error",
  "Goodwill",
  "Other",
] as const;

/** A discount is entered in rupees, on `TenderPanel`'s bounds. */
const MAX_DIGITS = 6;

export type LineCorrectionSubmit = {
  readonly act: CorrectionAct;
  readonly line_id: string;
  readonly amount_paisa: number;
  readonly reason: string;
  /**
   * `17-F27` (b) — which campaign this discount is taken under, or `null` for a discretionary one.
   *
   * **`null` is the ordinary case and is a stated fact, not an omission**: the overwhelming
   * majority of discounts cite nothing, which is why `registry.ts` declares the payload field
   * `.optional()` rather than required-and-nullable. It is `null` for a void and a comp always —
   * `17-F24`'s arm is `canDiscount`'s and neither of the other two acts has a campaign to cite.
   */
  readonly campaign_id: string | null;
};

export type LineCorrectionProps = {
  readonly lines: readonly CorrectableLine[];
  /**
   * `17-F27` (a) — the campaigns THIS device says reach THIS order, resolved in main.
   *
   * Empty is the ordinary state (no artifact, none reaching the order, or one whose scope this
   * till cannot resolve — `17-F24` as amended), and then this surface behaves exactly as it did
   * before `17-F27`: no offer panel, every discount discretionary.
   *
   * ⚠ **It is display data and never a verdict** (Commandment 8). `authorizeWrites` resolves the
   * citation again from the device's own artifact, so a screen that showed a campaign that does
   * not apply would produce a discount judged discretionary — the same answer as citing nothing,
   * never a pre-approval this surface invented.
   */
  readonly campaigns: readonly CampaignOffer[];
  readonly onSubmit: (correction: LineCorrectionSubmit) => void;
  readonly onCancel: () => void;
};

/**
 * Why a line cannot be corrected, or `null`.
 *
 * Exported because it is the whole of the surface's availability policy and `27-F5` requires the
 * tile to be **disabled in place with the reason shown** rather than absent — so the reason is a
 * value the oracle can assert, not a rendering detail.
 *
 * **This is a courtesy, not the guard.** `main/line-void.ts` re-derives all of it from the device's
 * own projection and refuses there; a renderer that drew the tile anyway must still fail
 * (Commandment 8, `02-F38`'s pattern). What it buys is that a cashier is not sent to a refusal she
 * could have been told about.
 */
export const correctionUnavailable = (line: CorrectableLine): string | null => {
  if (line.states === undefined || line.billed_paisa === undefined)
    return "this till has not projected this line yet";
  if (line.states.length !== 1) return "this line is disputed between devices";
  if (TERMINAL.has(line.states[0] as string)) return `already ${line.states[0]}`;
  return null;
};

export const LineCorrection = ({ lines, campaigns, onSubmit, onCancel }: LineCorrectionProps) => {
  const color = useColor();
  const [lineId, setLineId] = useState<string | null>(null);
  const [act, setAct] = useState<CorrectionAct | null>(null);
  const [entry, setEntry] = useState("");
  // `17-F27` (b) — the citation. `null` is *no offer*, which is a chosen state here and not an
  // absence: the `No offer` tile below is a real control, so a cashier who means "this is my own
  // decision" says so with a tap rather than by not tapping.
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const line = lines.find((l) => l.line_id === lineId);
  const lineTotal = line?.billed_paisa ?? 0;
  // A discount may not exceed the line it is taken off: `01-F30` SUBTRACTS the term, and a
  // discount larger than the line is a negative bill wearing a magnitude (`registry.ts` makes
  // `amount_paisa` non-negative for the same reason one family over). `27-F29`: an impossible
  // number is REFUSED at the keystroke, never accepted and flagged.
  const maxRupees = Math.floor(lineTotal / 100);
  const entered = (Number(entry) || 0) * 100;
  const amount = act === "discount" ? entered : lineTotal;

  const label = typography["text-label"];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
        height: "100%",
        minHeight: 0,
      }}
    >
      <Panel title="Correct a line" note={line === undefined ? "pick a dish" : line.name}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
          {lines.map((l) => {
            const why = correctionUnavailable(l);
            return (
              <Tile
                key={l.line_id}
                posture="counter"
                label={`${l.quantity} × ${l.name}`}
                selected={l.line_id === lineId}
                unavailable={why !== null}
                {...(why === null ? {} : { unavailableReason: why })}
                onPress={() => {
                  setLineId(l.line_id);
                  setEntry("");
                  // `17-F27` — a citation is about one act on one line. Carrying it across a
                  // change of line would attribute the next discount to a campaign the cashier
                  // chose for a different dish, permanently (`01-F1`).
                  setCampaignId(null);
                }}
              >
                <MoneyValue paisa={paisa(l.billed_paisa ?? 0)} />
              </Tile>
            );
          })}
        </div>
      </Panel>

      {line === undefined || correctionUnavailable(line) !== null ? null : (
        <Panel title="What happened" note={act === null ? "pick one" : ACT_WORDS[act].effect}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
            {CORRECTION_ACTS.map((a) => (
              <Tile
                key={a}
                posture="counter"
                label={ACT_WORDS[a].label}
                selected={a === act}
                // `27-F9` — a void removes a cooked dish from a bill and is the destructive one of
                // the three. A comp and a discount give money away and are recorded either way.
                destructive={a === "void"}
                onPress={() => {
                  setAct(a);
                  setEntry("");
                  setCampaignId(null);
                }}
              >
                {/*
                  `27-F12` — `selected` is the preattentive half and never the only signal, which
                  `Tile`'s own note requires: the chosen act says what it does to the bill in
                  words, on the tile, so a cashier reading nothing but this control still learns
                  that a comp does not move the total. `CashSurfaces` renders its chosen tile's
                  word the same way.
                */}
                {a === act ? ACT_WORDS[a].effect : null}
              </Tile>
            ))}
          </div>
        </Panel>
      )}

      {/*
        `17-F27` (a)/(b) — THE CITATION, and it is the producer `17-F24` assumed and never had.

        Until this panel existed nothing in the product put a `campaign_id` on a
        `discount.recorded`: the payload was five literal fields, so `canDiscount`'s campaign arm
        could not fire and every campaign function behind it was dead. A cashier applying a
        campaign discount must be able to CITE one, and this is where she does it.

        **⚠ `27-F4` — this is a positional change to a shipped surface and here is its PR
        justification, recorded in the file rather than in a commit message so it is checkable.**
        (i) **Nothing is added to, removed from or reordered within any existing GRID**: the line
        tiles, the act tiles, the keypad and the reason tiles all keep their contents and their
        order, which is the governing rule `27-F4`'s August-2026 amendment states in terms — *a
        mode may change where a thing is, never what is there or in what order*. What changes is
        that `How much` and `Why` sit one panel lower **in the discount arm only**.
        (ii) **It must precede the amount, and that is why it is not appended at the bottom.** The
        tile carries the bound the campaign allows; a cashier who keys an amount first and learns
        the cap second has to re-enter it, on a surface `02-F37` says nothing may come between her
        and the customer.
        (iii) **It does not appear and disappear under her hands.** The offer list is a render over
        this device's `17-F22` artifact, which is configuration and stable within a shift; a till
        that holds no campaigns shows this panel never and behaves exactly as it did before.
        A dev-pilot acclimation window is owed, per this FR's own requirement.

        **⚠ AND THE LAYOUT COST IS UNMEASURED, which is a finding rather than a claim of safety.**
        `layout:check` has never reached this surface at all — its fixture navigates to the tabs,
        the unlock pad and `ManagerApproval`, and there is no press of `Correct a line` anywhere in
        it — so the correction surface was outside the sweep before this panel and is outside it
        now (`L9`: the fixture is the coverage boundary, not the assertions). This adds one Panel
        of chrome in the discount arm when a campaign reaches the order, on a surface that clips
        rather than scrolls (`27-F2`). Whoever adds this surface to the gate should drive it with a
        campaign served.

        **No tile applies an amount.** `17-F27` (b): the campaign's base is the ORDER and this
        discount is per line, and resolving one into the other is exactly the scoped-base problem
        `17-F24`'s amendment refuses. A tile that silently clamped would be that refusal undone at
        the surface.
      */}
      {act === "discount" && line !== undefined && campaigns.length > 0 ? (
        <Panel
          title="Under which offer?"
          note={campaignId === null ? "none — the usual approval rules apply" : "cited"}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
            <Tile
              posture="counter"
              label="No offer"
              selected={campaignId === null}
              onPress={() => setCampaignId(null)}
            />
            {campaigns.map((c) => (
              <Tile
                key={c.campaign_id}
                posture="counter"
                label={c.campaign_id}
                selected={c.campaign_id === campaignId}
                onPress={() => setCampaignId(c.campaign_id)}
              >
                {/*
                  `27-F12` — a word and a number: what this offer allows on THIS order, computed in
                  main from the campaign's own `benefit` (`applyRateBps` then `min(cap)`). It is a
                  bound and not an instruction, and the cashier still keys what she gives.
                */}
                <MoneyValue paisa={paisa(c.bound_paisa)} />
              </Tile>
            ))}
          </div>
        </Panel>
      ) : null}

      {act === "discount" && line !== undefined ? (
        <Panel title="How much" note="off this line">
          <div style={{ display: "flex", gap: space["space-4"], alignItems: "flex-start" }}>
            <NumericKeypad
              value={entry}
              onChange={setEntry}
              max={maxRupees}
              maxDigits={MAX_DIGITS}
            />
            <Readout caption="DISCOUNT">
              <MoneyValue paisa={paisa(entered)} />
            </Readout>
          </div>
        </Panel>
      ) : null}

      {act === null || line === undefined || (act === "discount" && entered <= 0) ? null : (
        <Panel title="Why" note={ACT_WORDS[act].effect}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center" }}>
            {CORRECTION_REASONS.map((reason) => (
              <Tile
                key={reason}
                posture="counter"
                label={reason}
                onPress={() =>
                  onSubmit({
                    act,
                    line_id: line.line_id,
                    amount_paisa: amount,
                    reason,
                    // `17-F24`'s arm is `canDiscount`'s alone, so a void and a comp cite nothing
                    // even if a campaign was somehow selected before the act changed.
                    campaign_id: act === "discount" ? campaignId : null,
                  })
                }
              />
            ))}
          </div>
        </Panel>
      )}

      {/*
        `27-F5` — the way out is present in every state and never moves. `02-F37`: nothing may come
        between the cashier and the customer, so leaving costs one tap from wherever she is.
      */}
      <div style={{ display: "flex", alignItems: "center", gap: space["space-3"] }}>
        <Tile posture="counter" label="Back" onPress={onCancel} />
        <p style={{ ...label, color: color["fgColor-muted"], margin: 0 }}>
          {act === null ? "Pick the dish, then what happened, then why." : ACT_WORDS[act].effect}
        </p>
      </div>
    </div>
  );
};
