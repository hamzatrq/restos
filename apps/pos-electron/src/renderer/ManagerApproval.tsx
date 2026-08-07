import { Tile } from "@restos/ui";
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

  /**
   * `02-F38`'s first half. The filter is on the CLIENT and is worth nothing on its own — main
   * refuses a self-approval whatever this renders — but the FR asks for both, and a requester
   * looking at her own name on an approval grid is being invited to try.
   */
  const approvers = roster.filter((member) => member.user_id !== requesterId);

  if (chosen === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/*
          Which credential closes it, in the matrix's own words. `02-F20`'s two paths are
          equivalent, so this deliberately does not claim the remote one is unavailable — it
          says who can approve, and doc 05 will add the other route without changing the line.
        */}
        <p>Manager approval needed — {satisfiedBy.join(" or ")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 720 }}>
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
        {refusal === null ? null : <p>{REFUSAL_WORDS[refusal]}</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {/* `02-F20` — whose approval the event will record. She has to see it before submitting. */}
      <p>{chosen.display_name}</p>
      {/* One mark per digit; `01-F61` records that shoulder-surfing is the norm at a counter. */}
      <p>{"•".repeat(pin.length)}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 420 }}>
        {DIGITS.map((d) => (
          <Tile key={d} posture="keypad" label={d} onPress={() => setPin(pin + d)} />
        ))}
        {/*
          Without a correction key a mistyped digit forces a failed attempt, and `01-F61` counts
          failed attempts toward a lockout — on a shared manager PIN, one that then blocks the
          unlock gate too, because both pads charge the same durable counter.
        */}
        <Tile posture="keypad" label="Clear" onPress={() => setPin("")} />
      </div>
      {/* `01-F26` fixes no PIN length, so a confirming act has to exist. */}
      <Tile
        posture="keypad"
        label="Approve"
        onPress={() => {
          const entered = pin;
          setPin("");
          onSubmit(chosen.user_id, entered);
        }}
      />
      {/* `01-F61` — re-choosing costs NOTHING and submits nothing; the counter is charged only
          when a PIN is actually submitted against a user. */}
      <Tile
        posture="keypad"
        label="Not them?"
        onPress={() => {
          setChosen(null);
          setPin("");
        }}
      />
      <Tile posture="keypad" label="Cancel" onPress={onCancel} />
      {refusal === null ? null : <p>{REFUSAL_WORDS[refusal]}</p>}
    </div>
  );
};
