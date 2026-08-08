import { space, Tile, typography, useColor } from "@restos/ui";
import { useState } from "react";
import type { EscalationRefusal, Session } from "../shared/ipc";

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

/** The identity half: who this is about, what has been keyed, and the ways out. */
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

/** `27-F25` — the payload here is WHO the event will record, so it is the largest word. */
const NAME: React.CSSProperties = {
  fontFamily: typography["text-numeric-primary"].fontFamily,
  fontSize: typography["text-numeric-primary"].fontSize,
  fontWeight: typography["text-numeric-primary"].fontWeight,
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

/** Step one, and it is a column so the roster and its way out share one vertical rhythm. */
const STEP: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space["space-4"],
};

/** A wrapping row of approver tiles, bounded so a large roster pages down rather than sideways. */
const ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: space["space-2"],
  maxWidth: 720,
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
  roster: readonly Session[];
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
          Which credential closes it, in the matrix's own words. `02-F20`'s two paths are
          equivalent, so this deliberately does not claim the remote one is unavailable — it
          says who can approve, and doc 05 will add the other route without changing the line.
        */}
        <p style={PROMPT}>Manager approval needed — {satisfiedBy.join(" or ")}</p>
        <div style={ROW}>
          {approvers.map((member) => (
            <Tile
              key={member.user_id}
              posture="counter"
              label={member.display_name}
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
      </div>
    );
  }

  return (
    <div style={GATE}>
      <div style={IDENTITY}>
        <p style={{ ...PROMPT, color: color["fgColor-muted"] }}>Approving as</p>
        {/* `02-F20` — whose approval the event will record. She has to see it before submitting. */}
        <p style={NAME}>{chosen.display_name}</p>
        {/* One mark per digit; `01-F61` records that shoulder-surfing is the norm at a counter. */}
        <p
          style={{
            ...MARKS,
            background: color["bgColor-surface-sunken"],
            border: `1px solid ${color["borderColor-default"]}`,
          }}
        >
          {"•".repeat(pin.length)}
        </p>
        {/* `01-F61` — re-choosing costs NOTHING and submits nothing; the counter is charged only
            when a PIN is actually submitted against a user. `posture="counter"`, beside the
            identity it undoes, exactly as `App.tsx` places "Not you?". */}
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
        {refusal === null ? null : (
          <p style={{ ...PROMPT, color: color["fgColor-status-fault"] }}>
            {REFUSAL_WORDS[refusal]}
          </p>
        )}
      </div>

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
