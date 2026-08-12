import { PersonTile, Readout, space, Tile, targetFor, typography, useColor } from "@restos/ui";
import { useState } from "react";
import type { PassRosterMemberWire, PassUnlockResultWire } from "../shared/ipc";

/**
 * # `03-F53` / `01-F61` — THE DOOR, AND IT IS RAISED BY THE ACT
 *
 * > 03-F53 A press with nobody signed in raises `01-F61`'s two steps — the fixed grid of staff
 * > tiles, then the PIN — and nothing is appended until one succeeds.
 *
 * **This is not `02-F18`'s lock screen and must never become one.** The counter's gate covers
 * everything, on every launch, because that device holds the drawer. Here the FR is explicit that
 * *"the queue itself is never gated"*: this surface shows no money (`03-F32`) and no ETA
 * (`03 §3`), its whole purpose is to be READ, and gating it would turn a roster this device has
 * not yet synced into a kitchen that cannot see its own tickets. So the door appears only when a
 * cook has pressed a control that needs a name, and it always has a way out.
 *
 * ## THE TWO STEPS, AND WHY THE ORDER IS LOAD-BEARING
 *
 * `01-F61`: a bare pad matched against every hash on the device leaves a failed attempt belonging
 * to **no** user, so the per-(device, user) lockout cannot be keyed at all and collapses into the
 * device-wide counter that FR refuses — and two cooks sharing a four-digit PIN (ordinary at ~13
 * bits) become indistinguishable in a ledger `01-F1` forbids correcting in place. So: identify,
 * then the PIN.
 *
 * **Identification costs nothing.** *"Tapping a different tile before submit costs nothing, and the
 * per-(device, user) counter is charged only when a PIN is actually submitted against that user"* —
 * without which a mis-tap charges a failed attempt to somebody who is not in the building. Nothing
 * crosses the bridge until `Unlock`.
 *
 * **The grid is TILES and never a list of names** (`27-F6` forbids requiring typing on a critical
 * path; `21 §5` puts the cook at plausibly non-reading), in MAIN's order and never re-sorted
 * (`27-F4`; `01-F61` calls the absence of sorting an asset, because a tile learned by position is
 * usable without reading it).
 *
 * ## ⚠ `packages/ui`'s `NumericKeypad` IS BANNED HERE, AND IT IS A RULE RATHER THAN A PREFERENCE
 *
 * `acceptKeystroke` computes `current === "0" ? key : current + key`, which is right for rupees and
 * makes a PIN beginning `0` **impossible to enter** — a silent permanent lockout of roughly a tenth
 * of a roster. It also bounds entry by magnitude (`27-F29`), a money rule with no meaning for a
 * secret. Entry is plain concatenation and the digits are composed from `Tile`, so commandment 6 is
 * satisfied by the vocabulary rather than by the money component. This is the counter's rule,
 * carried across rather than re-derived.
 *
 * ## A REFUSAL SAYS WHICH REFUSAL (`00 §5.7`)
 *
 * > 03-F53 Being locked out is distinguishable on the glass from a PIN that was simply wrong, and
 * > a device whose registry is empty says so rather than drawing an empty grid. A cook who cannot
 * > tell those apart re-keys instead of fetching a colleague, and that is the one behaviour that
 * > turns a five-minute cooldown into a stopped pass.
 *
 * The reason therefore crosses the plane (it does not on the counter) and is turned into English
 * here. An unrecognised reason degrades to a plain refusal rather than rendering a raw token:
 * `pin-session.ts` owns that closed set and this surface must not silently become a second
 * declaration of it.
 */

/** `27-F42` — composite type tokens, taken whole. Never an assembled size/line-height pairing. */
const PROMPT: React.CSSProperties = {
  fontFamily: typography["text-label"].fontFamily,
  fontSize: typography["text-label"].fontSize,
  fontWeight: typography["text-label"].fontWeight,
  letterSpacing: "0.12em",
  margin: 0,
};

/**
 * The identified cook, at the top of the type ladder (`27-F25`): on this surface the payload is
 * WHO the ledger is about to name (`02-F41`) — the one fact a mis-tap makes wrong and the one the
 * cook must catch before submitting.
 */
const NAME: React.CSSProperties = {
  fontFamily: typography["text-numeric-hero"].fontFamily,
  fontSize: typography["text-numeric-hero"].fontSize,
  lineHeight: `${typography["text-numeric-hero"].lineHeight}px`,
  fontWeight: typography["text-numeric-hero"].fontWeight,
  margin: 0,
};

/**
 * The entry marks, in a box that holds its height at zero characters — an element that appears
 * only once entry starts moves everything under it on the first keystroke, which is exactly what
 * `27-F4` is about. One mark per digit and never the digits: `01-F61` records that shoulder-surfing
 * is the norm on a shared terminal.
 */
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

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * `pin-session.ts`'s closed refusal set, said in English. `00 §5.6` — the UI is English.
 *
 * The lockout message names **the way out that needs no human**, which is the whole of `01-F61`'s
 * third decision: *"a lockout ENDS on a time cooldown, never only on a human … a lockout with no
 * automatic end bricks the till"*. A message that only said "locked" would send a cook to find a
 * manager a T1 branch may not have.
 */
const refusalText = (reason: string): string => {
  if (reason === "locked_out") {
    return (
      "Too many wrong PINs for this person. It clears itself after a few minutes — a colleague " +
      "can sign in and carry on meanwhile."
    );
  }
  if (reason === "unknown_user") return "That person is not on this screen's staff list.";
  if (reason === "device_not_registered") {
    return "This screen is not paired with the restaurant, so no PIN can sign in on it.";
  }
  return "That PIN was not accepted.";
};

export type UnlockDoorProps = {
  /** `01-F61`'s grid, from the seam, rendered in the order it arrived. */
  roster: readonly PassRosterMemberWire[];
  /** Verified in MAIN (`01-F28`); this hands over two strings and reads the answer. */
  onUnlock: (user_id: string, pin: string) => Promise<PassUnlockResultWire>;
  /** `01-F17` — a mis-pressed control must not trap a cook at a pad with the work hidden. */
  onDismiss: () => void;
};

export const UnlockDoor = ({ roster, onUnlock, onDismiss }: UnlockDoorProps) => {
  const color = useColor();
  /**
   * Who the cook has identified as. `01-F61` is explicit that this is **not** an attempt, so
   * nothing crosses the bridge from here and re-tapping is free.
   */
  const [chosen, setChosen] = useState<PassRosterMemberWire | null>(null);
  const [pin, setPin] = useState("");
  /** The REASON, not a boolean: one boolean is one message for every refusal (`03-F53`). */
  const [refused, setRefused] = useState<string | null>(null);

  const step = (children: React.ReactNode) => (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space["space-4"],
      }}
    >
      {children}
    </div>
  );

  if (chosen === null) {
    return step(
      <>
        {/*
          The surface names its own act. `27-F1` gives the operator nowhere to be lost and no back
          affordance, so the one line of chrome a door gets has to say what this step IS — and
          `01-F61` makes it a step, not the whole thing: identify, THEN the PIN.
        */}
        <p style={{ ...PROMPT, color: color["fgColor-muted"] }}>WHO IS COOKING?</p>
        {roster.length === 0 ? (
          /*
            `00 §5.7` / `03-F53` — *"a device whose registry is empty says so rather than drawing an
            empty grid"*. It is today's real state on every device: nothing populates the staff
            registry (`01-F47` admits devices, not people), and an empty box reads as a broken
            screen rather than as a device nothing has reached.
          */
          <p
            style={{
              fontFamily: typography["text-body"].fontFamily,
              fontSize: typography["text-body"].fontSize,
              color: color["fgColor-muted"],
              textAlign: "center",
              margin: 0,
              maxWidth: 640,
            }}
          >
            Nobody has reached this screen yet, so there is nothing to sign in as. The queue behind
            keeps working; the kitchen just cannot record who marked a ticket.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: space["space-4"],
            }}
          >
            {roster.map((member) => (
              <PersonTile
                key={member.user_id}
                name={member.display_name}
                onPress={() => {
                  setChosen(member);
                  setPin("");
                  setRefused(null);
                }}
              />
            ))}
          </div>
        )}
        {/*
          `01-F17` and `03-F53`'s second clause: whatever the door covers, a cook can put it away
          without a credential and the queue is exactly as it was. A mis-tapped DONE must not hide
          the kitchen's work behind a pad.
        */}
        <Tile posture="kitchen" label="Cancel" onPress={onDismiss} />
      </>,
    );
  }

  const submit = () => {
    const entered = pin;
    setPin("");
    // `01-F1` — the PIN is dropped the moment it is handed over. Nothing is appended from the
    // renderer and nothing here keeps a credential; `01-F5`'s `audit.login` is main's to write.
    void onUnlock(chosen.user_id, entered)
      .then((r) => setRefused(r.ok ? null : r.reason))
      .catch(() => setRefused("bad_pin"));
  };

  return step(
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: targetFor("kitchen"),
      }}
    >
      {/*
        `alignItems: flex-start`, and it was found by LOOKING rather than by reading. A flex column
        stretches its children by default, so `Not you?` and `Cancel` came out as two full-width
        slabs beside a name — `27-F25` puts the payload at the top of the ladder and two enormous
        secondary controls take that away from it. They are `27-F8` targets at their own size now.
      */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: space["space-4"],
        }}
      >
        <Readout caption="SIGNING IN AS">
          <p style={NAME}>{chosen.display_name}</p>
        </Readout>
        {/*
          `alignSelf: stretch` so the field spans the column the name sets the width of. Without it
          the shrink-wrapped column collapses an empty entry box to a sliver, which reads as a stray
          mark rather than as the field the keys write into (`27-F66` — a neutral state takes a
          boundary, and a boundary around nothing is not a boundary). Also found by looking.
        */}
        <div style={{ alignSelf: "stretch" }}>
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
        </div>
        {/*
          Back to step one, and `01-F61` requires that it cost NOTHING: re-choosing sends nothing to
          main and drops the entry rather than submitting it. `27-F9` — it sits on the identity side,
          a column away from the pad, because it is the one control here whose mis-tap costs the
          cook her entry and a wet hand reaching for `Clear` must not find it.
        */}
        <Tile
          posture="kitchen"
          label="Not you?"
          onPress={() => {
            setChosen(null);
            setPin("");
            setRefused(null);
          }}
        />
        <Tile posture="kitchen" label="Cancel" onPress={onDismiss} />
        {refused === null ? null : (
          /*
            `00 §5.7` — a refusal with no feedback is indistinguishable from a stuck app, so the
            cook re-enters blindly and walks into `01-F61`'s lockout without ever being told why.
            `27-F14` — red is the fault slot and a refused credential is a fault; it is the only
            colour this surface spends. Cleared on the next keystroke rather than latching.
          */
          <p
            style={{
              fontFamily: typography["text-body"].fontFamily,
              fontSize: typography["text-body"].fontSize,
              color: color["fgColor-status-fault"],
              margin: 0,
              maxWidth: 520,
            }}
          >
            {refusalText(refused)}
          </p>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, max-content)",
          gap: space["space-2"],
        }}
      >
        {DIGITS.map((d) => (
          <Tile
            key={d}
            posture="keypad"
            label={d}
            onPress={() => {
              setRefused(null);
              setPin(pin + d);
            }}
          />
        ))}
        {/*
          A correction key, and it is not a convenience: without it a mistyped digit forces a failed
          attempt, and `01-F61` counts failed attempts toward a lockout that would then stop this
          screen recording anything on a fat finger — with gloves on, which is this surface's normal
          state (`27-F9`'s measured 21.34% wet-hand gesture error).
        */}
        <Tile posture="keypad" label="Clear" onPress={() => setPin("")} />
        <Tile
          posture="keypad"
          label="0"
          onPress={() => {
            setRefused(null);
            setPin(`${pin}0`);
          }}
        />
        {/*
          `01-F26` fixes no PIN length, so entry cannot know when it is done and a confirming act
          has to exist. Bottom-right of the pad, which is where `NumericKeypad` puts its own twelfth
          key and where the counter puts `Unlock`: two pads in one product that disagree about which
          cell closes an entry is the muscle-memory break `27-F4` exists to prevent.
        */}
        <Tile posture="keypad" label="Unlock" onPress={submit} />
      </div>
    </div>,
  );
};
