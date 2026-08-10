import { Panel, PersonTile, Readout, space, Tile, typography, useColor } from "@restos/ui";
import { useState } from "react";
import type { EscalationRefusal, RosterMember, Session } from "../shared/ipc";

/**
 * `02-F20`'s **local manager PIN on the POS** — the surface that outcome never had.
 *
 * `can()` returns three values; the third is `escalate`, and `02-F20` gives it two equivalent
 * paths — this one, and a remote approval from the manager console (doc 05, not Wave 1). With
 * neither built, an above-threshold paid-out (`05-F19`) was refused outright at every till, and
 * `05-F8` had to be corrected for claiming this path "remains fully available".
 *
 * ── The rules this screen is shaped by ───────────────────────────────────────────────────────
 *
 * **`01-F61` — identify FIRST, then take the PIN.** The same two steps as `App.tsx`'s unlock
 * gate, for the same reason: a bare pad matched against every hash on the device leaves a failed
 * attempt belonging to no user, so the per-(device, user) counter cannot be keyed, and two
 * managers who share a four-digit PIN become indistinguishable in a ledger `01-F1` forbids
 * correcting in place.
 *
 * **`02-F38` — the requester is ABSENT from the grid**, never greyed. That FR is explicit that
 * the control is *"absent from the requester's screen* **and** *refused server-side"*, so this is
 * the first half only; `main/authorize.ts` performs the second and a client that drew the tile
 * anyway would still fail. `27-F4`'s disable-in-place governs a *conditional* control on a
 * surface an operator has learned — this grid is built per approval and has no learned positions.
 *
 * **`27-F8`, and `packages/ui`'s `NumericKeypad` MUST NOT be used here.** Its own header says
 * why: `acceptKeystroke` computes `current === "0" ? key : current + key`, which is right for
 * rupees and makes a PIN beginning `0` impossible to enter — a silent permanent lockout of
 * roughly a tenth of enrolled staff — and it bounds entry by magnitude (`27-F29`), a money rule
 * with no meaning for a secret. So entry is plain concatenation and the digits are `Tile`s at
 * `posture="keypad"`, which carries the 126 dp kiosk target. Commandment 6 is satisfied by the
 * vocabulary, not by the money component. This is `App.tsx`'s composition, deliberately identical.
 *
 * **Nothing about the PIN is kept and nothing is appended from here** (`01-F1`): the digits go
 * over the bridge and a structured result comes back.
 */

/** `27-F6` — no operational role types non-numeric text on a critical path. 1–9 then 0. */
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/**
 * ── THE LAYOUT, AND WHY IT MOVED (August 2026) ────────────────────────────────────────────────
 *
 * **This surface has never been usable by anyone.** Measured in a real `BrowserWindow` at
 * `27 §1a`'s counter panel: the PIN step laid out **1162 px of content in a 632 px box quiet**
 * and 530 px with `03-F5`'s band, so `Approve`, `Not them?` and `Cancel` sat entirely below the
 * viewport (top edges y=852, 1002, 1152) in **both** device states. `02-F20`'s local manager-PIN
 * path is the only escalation route that exists — doc 05's remote one is unbuilt — so `05-F19`'s
 * over-threshold paid-out was dead on arrival at every till.
 *
 * **`27-F68` was necessary and not sufficient.** The founder ruling (`DEC-UI-001`) makes a dp a
 * physical size, which at this panel's density turns the shell's budget from 530 px into 953 dp
 * of work area — but the stack is still 1162 dp, so it overruns in both states even after the
 * conversion. `DEC-UI-001` says so in its own consequences: *"three trailing full-size buttons
 * cannot all be keypad-posture under a keypad in a 768 px panel."*
 *
 * **The change is a `27-F4` breaking change, and the PR justification that FR requires is this.**
 *
 * 1. **There is no positional memory to break.** `27-F4` protects an operator who learned a
 *    layout; `Approve` has never been on screen for anyone to learn. The acclimation window the
 *    FR asks for costs nothing here because there is no prior arrangement in service.
 * 2. **It moves TOWARD `27-F4`, not away from it.** This file's own header claims to be
 *    *"`App.tsx`'s composition, deliberately identical"* and it was not: the unlock pad is
 *    `1‑9, Clear, 0, Unlock` — `Clear` bottom-left and the confirming act bottom-right, where
 *    `NumericKeypad` also puts its twelfth key — while this pad was `1‑9, 0, Clear` in a wrapping
 *    row, putting `0` where the other pad puts `Clear`. `App.tsx` names that exact hazard: *"two
 *    pads on one device that disagree about which cell closes an entry is the muscle-memory break
 *    `27-F4` exists to prevent."* Two PIN pads on one device now agree.
 *
 * The shape is `App.tsx`'s, for the reason `App.tsx` gives: the pad's own height is the tallest
 * fixed thing on the surface, so everything else fits BESIDE it instead of under it.
 * `27-F9` is why `Cancel` is on the identity side — it is the control whose mis-tap costs the
 * cashier the act, and a wet hand reaching for `Clear` must not find it.
 */
const GATE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space["space-8"],
  height: "100%",
};

/**
 * ── THE ONE SURFACE WHERE `27-F16`'s COLOUR IS GENUINELY APPROPRIATE, DECIDED RATHER THAN
 * ASSUMED ────────────────────────────────────────────────────────────────────────────────────
 *
 * **`27-F16` does not govern this and reading it as if it did is the mistake to avoid.** That FR
 * is about MONEY — *"money is never coloured by default … colouring the commonest number on
 * screen spends the whole preattentive channel on the base case"* — and there is no money on this
 * surface at all. What governs a non-money signal is `27-F14`, whose four-slot allocation names
 * this claimant **by name**: *"amber — abnormal, attention required — ticket approaching due, low
 * stock, **pending approval**, unaccepted channel order, sync degraded"*. This is `02-F20`'s
 * pending approval, which is the literal words of the table.
 *
 * So amber is not a stretch here, it is the allocation being spent on exactly what it was
 * allocated for — and it is the only surface in this app that can say that.
 *
 * **Three things it deliberately does NOT do, each refused on a resolving FR.**
 *
 * 1. **It is not RED.** `27-F14`'s fault claimants are enumerated — *"ticket overdue, print
 *    failure, cash variance past threshold, void & refund actions, revoked device"* — and an
 *    escalation is none of them. `03-F5`'s S1 band owns red on this device, and `27-F11d` makes
 *    that band's loudness the whole point; a second red region beside it would take that away.
 * 2. **`Approve` does NOT become the blue primary.** `27-F14` allocates blue to *"any control the
 *    operator may press"* and `TenderPanel` spends it on one control per surface, so the argument
 *    for a blue `Approve` is real. It is refused because this pad and `App.tsx`'s unlock pad were
 *    deliberately brought into agreement — same twelve cells, same confirming act bottom-right —
 *    and colouring one pad's twelfth key and not the other's teaches two habits for one gesture,
 *    which is `27-F4`'s muscle-memory break in a new channel.
 * 3. **The amber goes on the IDENTITY column, not around the whole surface.** Measured: the pad
 *    is 536 dp and the tightest work area this device is swept at is 540 dp with `03-F5`'s band
 *    up, so a `Panel` wrapping both columns costs 64 dp the surface does not have and the
 *    escalation pad — `02-F20`'s only built path — goes off the bottom for the second time. The
 *    identity column is ~300 dp beside a 536 dp pad, so bounding THAT costs nothing at all. The
 *    marker lands where the operator is already reading, and the pad keeps every pixel `27-F8`
 *    gives it.
 */
const IDENTITY: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space["space-4"],
  minWidth: 320,
};

/**
 * An EXPLICIT 3-column grid rather than a wrapping row, and `App.tsx` gives the reason: `27-F4`
 * calls the keypad the most position-dependent surface in the product, and a layout that derives
 * its column count from how the browser happens to wrap can silently re-rank on another panel.
 * Twelve cells, no hole — 1–9, then Clear, 0, Approve.
 */
const PAD: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, min-content)",
  alignContent: "center",
};

/** `27-F42` — composite type tokens, taken whole. Never an assembled pairing. */
const PROMPT: React.CSSProperties = {
  fontFamily: typography["text-label"].fontFamily,
  fontSize: typography["text-label"].fontSize,
  fontWeight: typography["text-label"].fontWeight,
  letterSpacing: typography["text-label"].letterSpacing,
  margin: 0,
};

/**
 * `27-F25` — the payload here is WHO the event will record, so it is the largest word.
 *
 * **Raised from `text-numeric-primary` to `-hero`, which is the size `App.tsx` already uses one
 * screen earlier and for a reason that applies here verbatim:** *"a name that shrinks between
 * choosing it and confirming it tells the operator the fact got less important exactly as it
 * became irreversible."* This surface is `01-F61`'s two-step act performed a second time — the
 * approver picks a `PersonTile`, then confirms — and it was drawing the confirmation at 28 dp
 * where the choice was at 48. Two surfaces on one device that draw one act at two sizes teach two
 * habits (`27-F4`), and `02-F20` makes this the identity the event will carry as `approver`.
 */
const NAME: React.CSSProperties = {
  fontFamily: typography["text-numeric-hero"].fontFamily,
  fontSize: typography["text-numeric-hero"].fontSize,
  lineHeight: `${typography["text-numeric-hero"].lineHeight}px`,
  fontWeight: typography["text-numeric-hero"].fontWeight,
  letterSpacing: typography["text-numeric-hero"].letterSpacing,
  margin: 0,
};

/** The entry marks, holding their line at zero characters so nothing moves on the first key. */
const MARKS: React.CSSProperties = {
  fontFamily: typography["text-numeric-hero"].fontFamily,
  fontSize: typography["text-numeric-hero"].fontSize,
  lineHeight: `${typography["text-numeric-hero"].lineHeight}px`,
  letterSpacing: "0.15em",
  minHeight: typography["text-numeric-hero"].lineHeight,
  padding: space["space-2"],
  borderRadius: space["space-2"],
  margin: 0,
};

/**
 * Step one, and it is a column so the roster and its way out share one vertical rhythm.
 *
 * **Centred on both axes, like step two and like the unlock door.** It was top-left anchored and
 * the layout gate's composition check found it on all five panels — 138 dp of content in a 619 dp
 * work area with **471 dp of slack below it**, and 809 dp on the 24″ panel. Every other check
 * passed it, which is the whole reason that check exists: an approval pad in the top-left corner
 * of an empty surface fits perfectly.
 *
 * It matters more here than on a quiet tab. This surface appears **over a cashier's work**, once,
 * with a manager standing at the till and a customer waiting (`05-F19`'s over-threshold paid-out
 * is the live case). A centred pad is the one arrangement where the thing that just interrupted
 * you is where your eye already is.
 */
const STEP: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: space["space-6"],
  height: "100%",
  minHeight: 0,
};

/**
 * A wrapping row of approver cards.
 *
 * The 720 dp cap is gone for the reason `App.tsx`'s roster row records: it was chosen for 76 dp
 * tiles and would now force a `PersonTile` row to wrap at three cards on a panel with room for
 * four — the responsive defect this round exists to remove, surviving in a constant.
 */
const ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: space["space-5"],
};

/**
 * The four refusals, in the operator's words.
 *
 * Worded HERE rather than in main, which is the opposite of `03-F5`'s band and is deliberate:
 * that band's sentence is a spec requirement ("naming the printer and order"), while these are a
 * closed set of codes whose only reader is this screen. `00 §5.6` English; `00 §5.7` — each says
 * what is actually true, because a single "not accepted" would send an operator to re-key a PIN
 * that was already right.
 */
const REFUSAL_WORDS: Readonly<Record<EscalationRefusal, string>> = {
  bad_pin: "That PIN was not accepted.",
  self_approval: "You cannot approve your own request.",
  not_permitted: "That manager cannot approve this.",
  not_escalatable: "This cannot be approved here.",
};

export type ManagerApprovalProps = {
  /**
   * `02-F20` — the roles whose credential closes this gap, read off the permission matrix by
   * main (`can().satisfied_by`) and never decided here. `18 §5` bans the inline role check, and
   * a screen that printed "manager" would be that check relocated into UI.
   */
  satisfiedBy: readonly string[];
  /** `01-F61`'s roster — the same list the unlock grid is drawn from, in main's order (`27-F4`). */
  roster: readonly RosterMember[];
  /** `02-F38` — whose request this is. Their tile is not drawn. */
  requesterId: string;
  /** The last server answer, or `null` before one. */
  refusal: EscalationRefusal | null;
  onSubmit: (approver_user_id: string, pin: string) => void;
  onCancel: () => void;
};

export const ManagerApproval = ({
  satisfiedBy,
  roster,
  requesterId,
  refusal,
  onSubmit,
  onCancel,
}: ManagerApprovalProps) => {
  const [chosen, setChosen] = useState<Session | null>(null);
  const [pin, setPin] = useState("");
  const color = useColor();

  /**
   * `02-F38`'s first half. The filter is on the CLIENT and is worth nothing on its own — main
   * refuses a self-approval whatever this renders — but the FR asks for both, and a requester
   * looking at her own name on an approval grid is being invited to try.
   */
  const approvers = roster.filter((member) => member.user_id !== requesterId);

  if (chosen === null) {
    return (
      <div style={STEP}>
        {/*
          `27-F14`'s amber, on the caption of a bounded region — see the note above `IDENTITY` for
          why this claimant is the FR's own words and why it is not red and not the pad.
        */}
        <Panel title="Approval needed" tone="abnormal">
          {/*
            Which credential closes it, in the matrix's own words. `02-F20`'s two paths are
            equivalent, so this deliberately does not claim the remote one is unavailable — it
            says who can approve, and doc 05 will add the other route without changing the line.
          */}
          <p style={PROMPT}>Manager approval needed — {satisfiedBy.join(" or ")}</p>
          {/*
          `PersonTile`, the SAME component the unlock door draws its roster with, and that is a
          `27-F4` argument rather than a tidiness one: this is `01-F61`'s identification step
          performed a second time — identify, then PIN — and two surfaces on one device that draw
          the same act at two different sizes teach two different habits. It also carries the
          `01-F26` role, which matters more here than at the door: `02-F20` asks for a credential
          that HOLDS the permission, so "which of these people is a manager" is the question the
          operator is actually answering.
        */}
          <div style={ROW}>
            {approvers.map((member) => (
              <PersonTile
                key={member.user_id}
                name={member.display_name}
                {...(member.role === null || member.role === undefined
                  ? {}
                  : { staffRole: member.role })}
                onPress={() => setChosen(member)}
              />
            ))}
          </div>
          {/*
            `01-F17` — the sale is never blocked, and neither is the cashier: backing out costs
            nothing and leaves the counter exactly as it was. The act simply did not happen.
          */}
          <Tile posture="counter" label="Cancel" onPress={onCancel} />
          {refusal === null ? null : (
            <p style={{ ...PROMPT, color: color["fgColor-status-fault"] }}>
              {REFUSAL_WORDS[refusal]}
            </p>
          )}
        </Panel>
      </div>
    );
  }

  return (
    <div style={GATE}>
      {/*
        The marked region is the IDENTITY column and not the whole surface — see the note above
        `IDENTITY` for the measurement that decides it. Wrapping this column costs no height at
        all beside a 536 dp pad, and it puts `27-F14`'s amber where the operator's eye already is.
      */}
      <Panel title="Approval needed" tone="abnormal">
        <div style={IDENTITY}>
          {/*
            `02-F20` — whose approval the event will record. She has to see it before submitting.

            `Readout` rather than a loose label over a loose name: it is the caption-above-fact
            pairing every money surface on this device uses and the one `App.tsx` uses for
            `SIGNING IN AS` one screen earlier. This surface had its own dialect — a muted
            sentence-case `<p>` — which is the drift `27-F43` describes for pairings left in
            prose.
          */}
          <Readout caption="APPROVING AS">
            <p style={NAME}>{chosen.display_name}</p>
          </Readout>
          {/* One mark per digit; `01-F61` records that shoulder-surfing is the norm at a counter. */}
          <Readout caption="PIN">
            <p
              style={{
                ...MARKS,
                background: color["bgColor-surface-sunken"],
                border: `1px solid ${color["borderColor-default"]}`,
              }}
            >
              {"•".repeat(pin.length)}
            </p>
          </Readout>
          {/* `01-F61` — re-choosing costs NOTHING and submits nothing; the counter is charged only
              when a PIN is actually submitted against a user. `posture="counter"`, beside the
              identity it undoes, exactly as `App.tsx` places "Not you?".

              The two ways out share a ROW rather than stacking. They are peers — both leave the
              ledger untouched — and stacking them read as two primary acts under the name, which
              is weight the identity should be carrying. `27-F9` is unaffected: both are still a
              column away from `Clear`, which is the mis-tap this rule is about. */}
          <div style={{ display: "flex", gap: space["space-2"], flexWrap: "wrap" }}>
            <Tile
              posture="counter"
              label="Not them?"
              onPress={() => {
                setChosen(null);
                setPin("");
              }}
            />
            {/* `01-F17` — backing out costs nothing. `27-F9` puts it a column away from the pad. */}
            <Tile posture="counter" label="Cancel" onPress={onCancel} />
          </div>
          {refusal === null ? null : (
            <p style={{ ...PROMPT, color: color["fgColor-status-fault"] }}>
              {REFUSAL_WORDS[refusal]}
            </p>
          )}
        </div>
      </Panel>

      <div style={PAD}>
        {DIGITS.slice(0, 9).map((d) => (
          <Tile key={d} posture="keypad" label={d} onPress={() => setPin(pin + d)} />
        ))}
        {/*
          Without a correction key a mistyped digit forces a failed attempt, and `01-F61` counts
          failed attempts toward a lockout — on a shared manager PIN, one that then blocks the
          unlock gate too, because both pads charge the same durable counter.
        */}
        <Tile posture="keypad" label="Clear" onPress={() => setPin("")} />
        <Tile posture="keypad" label="0" onPress={() => setPin(`${pin}0`)} />
        {/*
          `01-F26` fixes no PIN length, so a confirming act has to exist — and it sits
          bottom-right, where `App.tsx`'s `Unlock` and `NumericKeypad`'s twelfth key both are.
          That agreement is the `27-F4` half of this change.
        */}
        <Tile
          posture="keypad"
          label="Approve"
          onPress={() => {
            const entered = pin;
            setPin("");
            onSubmit(chosen.user_id, entered);
          }}
        />
      </div>
    </div>
  );
};
