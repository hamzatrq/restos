import { Tile } from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import type { DeviceState, Session } from "../shared/ipc";
import { Counter } from "./Counter";

/**
 * `C1` — the app root, and the `01-F26` lock that sits OVER every surface.
 *
 * `02-F18` is the rule this file exists to hold: *"No anonymous mode exists; a locked device
 * shows only the unlock screen."* Not greyed — ABSENT. `27-F4`'s disable-in-place governs
 * controls *inside* a surface; this is a different surface, and a locked till still rendering
 * the grid is one mis-tap away from an event attributed to nobody (`02-F41`).
 *
 * **Why the gate is here and not inside `Counter`.** `plans/wave-1/screen-map.md §3.1` records
 * `C1` as deliberately absent from the rail — *"it is not a tab: it gates every surface 20–60x a
 * shift, so it is a lock surface over the whole app"*. `27-F4` makes adding a sixth operational
 * item a breaking change for every operator who learned five, so the unlock surface must never
 * become one.
 *
 * **Lock state has exactly ONE source: `deviceState().user`.** Not a local boolean set from
 * `unlock`'s answer — `01-F26`'s idle auto-lock happens in main with no unlock call and no tap,
 * and a renderer holding its own flag would stay open all night on an empty counter while
 * `02-F41` attributed whatever happened next to whoever walked away.
 *
 * **`01-F61` — the surface IDENTIFIES THE USER FIRST, then takes the PIN.** A bare pad matched
 * against every hash on the device leaves a failed attempt belonging to *no* user, so the
 * per-(device, user) counter cannot be keyed and collapses into the device-wide one that FR
 * refuses; and it makes two staff who share a 4-digit PIN — ordinary at ~13 bits — permanently
 * indistinguishable, writing the wrong cashier into a ledger `01-F1` forbids correcting in
 * place. The one tap this costs, 20–60× a shift, is `01-F61`'s own stated cost.
 */

/** `27-F6` — no operational role types non-numeric text on a critical path, and this is the
 * most critical one: it gates every other. Laid out as the pad an operator's hand already
 * knows, 1–9 then 0, with the correction key beside it. */
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/**
 * **`packages/ui`'s `NumericKeypad` is not used here, and that is a rule rather than an
 * oversight** — its own header says why. `acceptKeystroke` computes
 * `current === "0" ? key : current + key`, which is right for rupees and makes a PIN beginning
 * `0` **impossible to enter**: a silent permanent lockout of roughly a tenth of enrolled staff.
 * It also bounds entry by magnitude (`27-F29`), which is a money rule with no meaning for a
 * secret. So entry is plain concatenation, and the digits are composed from `Tile` —
 * commandment 6 is satisfied by the vocabulary, not by the money component.
 */

export const App = () => {
  /**
   * `undefined` = the seam has not answered yet, and it is a THIRD state on purpose: painting
   * the surface before the first read would demand a PIN from a device that is already unlocked
   * (a renderer reload, a crash restart) — a flash of the lock screen on every launch.
   */
  const [user, setUser] = useState<DeviceState["user"] | undefined>(undefined);
  /**
   * `01-F61`'s roster, read from the seam and rendered **unsorted**. A renderer-side sort
   * cannot be stable: it re-ranks the grid the moment a name is added or edited, which `27-F4`
   * makes a breaking change for every operator who learned a tile by position.
   */
  const [roster, setRoster] = useState<Session[]>([]);
  /**
   * Who the operator has identified as — and `01-F61` is explicit that this is **not** an
   * attempt: *"Identification is revocable until the PIN is submitted: tapping a different tile
   * before submit costs nothing, and the per-(device, user) counter is charged only when a PIN
   * is actually submitted against that user."* So nothing crosses the bridge from here.
   */
  const [chosen, setChosen] = useState<Session | null>(null);
  const [pin, setPin] = useState("");
  const [refused, setRefused] = useState(false);

  const reload = useCallback(async () => {
    const next = (await window.restos.deviceState()).user;
    setUser(next);
    // A session that is IN clears step one, so a lock decided later — idle auto-lock, shift
    // end, a manual lock — returns the device to identification rather than to a pad still
    // holding the last cashier's name. `01-F61` fixes the order of the two steps for every
    // arrival at this surface, not only the first.
    //
    // It also drops the entry buffer: there is no reason for a renderer that is no longer
    // asking for a PIN to still be holding one.
    if (next !== null) {
      setChosen(null);
      setPin("");
      setRefused(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // The same push `Counter` listens on: main says the folds moved — or the session did — and
    // the renderer re-reads. This is how a lock decided in main reaches the screen.
    return window.restos.onChanged(() => void reload());
  }, [reload]);

  useEffect(() => {
    // Read ONCE, and deliberately not on the `changed` push the line above rides: main fires
    // that on every append — every line added, every order confirmed — and a roster that
    // changes when someone is hired has no business on the hottest read on the device.
    void window.restos.staff().then(setRoster);
  }, []);

  // `01-F17` — nothing is blocked here, there is simply nothing yet known to draw.
  if (user === undefined) return <p>Starting…</p>;
  if (user !== null) return <Counter />;

  /**
   * `01-F28` — the identity and the digits go to main and a yes/no comes back. The answer is
   * deliberately NOT kept: the screen re-reads the seam either way, so a refused PIN leaves the
   * device locked because the seam still says locked, not because this function decided so.
   *
   * `01-F1` — nothing is appended from here, and the PIN is dropped the moment it is handed
   * over. A PIN written into an event can be corrected by another event but never removed, and
   * `01-F5`'s `audit.login` is main's to write.
   */
  const submit = (who: Session) => {
    const entered = pin;
    setPin("");
    void window.restos
      .unlock(who.user_id, entered)
      .then((r) => setRefused(!r.unlocked))
      .catch(() => setRefused(true))
      .then(reload);
  };

  const press = (digit: string) => {
    setRefused(false);
    setPin(pin + digit);
  };

  /**
   * Step one: the fixed grid. **Never a text list** — `27-F6` forbids requiring typing on a
   * critical path and `21 §5` puts the cashier at plausibly non-reading, so each member is a
   * `Tile`, which carries `27-F8`'s measured touch target. A row of names carries neither.
   *
   * `posture="counter"` is the standing-counter target this surface is used at; `keypad` below
   * is the tighter one the digits are designed to.
   */
  if (chosen === null) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 720 }}>
        {roster.map((member) => (
          <Tile
            key={member.user_id}
            posture="counter"
            label={member.display_name}
            onPress={() => setChosen(member)}
          />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {/*
        Who the PIN is about to be charged against. `02-F41` makes this the cashier the ledger
        will name, so an operator who mis-tapped has to be able to see it before submitting.
      */}
      <p>{chosen.display_name}</p>
      {/*
        One mark per digit, and the digits themselves are never shown: `01-F61` records that
        shoulder-surfing is the norm on a shared counter. It is feedback, not a readout — an
        operator has to be able to see that a key registered.
      */}
      <p>{"•".repeat(pin.length)}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 420 }}>
        {DIGITS.map((d) => (
          <Tile key={d} posture="keypad" label={d} onPress={() => press(d)} />
        ))}
        {/*
          A correction key, and it is not a convenience: without it a mistyped digit forces a
          failed attempt, and `01-F61` counts failed attempts toward a lockout that would then
          stop the till on a fat finger.
        */}
        <Tile posture="keypad" label="Clear" onPress={() => setPin("")} />
      </div>
      {/*
        `01-F26` fixes no PIN length, so entry cannot know when it is done and a confirming act
        has to exist. "Unlock" is an invented string — no FR names one — and is `00 §5.6`
        English.
      */}
      <Tile posture="keypad" label="Unlock" onPress={() => submit(chosen)} />
      {/*
        Back to step one, and `01-F61` requires that this cost NOTHING: "a mis-tap on a grid
        charges a failed attempt to someone who is not in the building" is the failure it exists
        to prevent, so re-choosing sends nothing to main and clears the entry rather than
        submitting it.
      */}
      <Tile
        posture="keypad"
        label="Not you?"
        onPress={() => {
          setChosen(null);
          setPin("");
          setRefused(false);
        }}
      />
      {/*
        Also invented, and for a reason worth stating: a refusal with no feedback is
        indistinguishable from a stuck app, so the operator re-enters blindly and walks into
        `01-F61`'s lockout without ever being told why. `00 §5.7` — the device reports what is
        true. Cleared on the next keystroke rather than latching.
      */}
      {refused ? <p>That PIN was not accepted.</p> : null}
    </div>
  );
};
