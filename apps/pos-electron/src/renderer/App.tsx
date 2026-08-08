import { PanelRoot, space, Tile, typography, useColor } from "@restos/ui";
import { type ReactNode, useCallback, useEffect, useState } from "react";
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
 * The lock surface's layout, found by looking (August 2026).
 *
 * What was here: the roster as three 76 dp tiles wrapped into the TOP-LEFT CORNER of an
 * otherwise blank white page, and the pad as one centred column of `Tile`s with a `maxWidth`
 * that produced three columns by accident of wrapping. On the `27 §1a` reference counter
 * (1366x768) that column ran **780 px** before "Unlock" — so the confirming act of the one
 * surface that gates every other sat below the fold, on a body with `overflow: hidden`, where
 * `27-F2` says no primary action may be. It was not reachable by scrolling either.
 *
 * The fix is a two-column composition — identity on the left, pad on the right — because the
 * pad's own height (4 rows x 126 dp = 536 px) is the tallest fixed thing on the surface and
 * everything else fits BESIDE it instead of under it. Nothing is below the fold at 768.
 */
const GATE: React.CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space["space-8"],
  padding: space["space-5"],
};

/** The identity half: who this is about, and what has been keyed so far. */
const IDENTITY: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space["space-4"],
  minWidth: 320,
};

/**
 * The pad. An EXPLICIT 3-column grid rather than a wrapping row: `27-F4` calls the keypad the
 * most position-dependent surface in the product, and a layout that derives its column count
 * from how the browser happens to wrap is a layout that can silently re-rank on a different
 * panel. Twelve cells, no hole — 1-9, then Clear, 0, Unlock.
 */
const PAD: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, min-content)",
  alignContent: "center",
};

const STEP: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space["space-5"],
};

/** `27-F42` — composite type tokens, taken whole. Never an assembled size/line-height pairing. */
const PROMPT: React.CSSProperties = {
  fontFamily: typography["text-label"].fontFamily,
  fontSize: typography["text-label"].fontSize,
  fontWeight: typography["text-label"].fontWeight,
  letterSpacing: typography["text-label"].letterSpacing,
  margin: 0,
};

/**
 * The identified cashier. `27-F25` puts the operational payload at the top of the size ladder,
 * and on this surface the payload is WHO the ledger is about to name (`02-F41`) — the one fact
 * a mis-tap makes wrong and the one an operator must catch before submitting.
 */
const NAME: React.CSSProperties = {
  fontFamily: typography["text-numeric-primary"].fontFamily,
  fontSize: typography["text-numeric-primary"].fontSize,
  fontWeight: typography["text-numeric-primary"].fontWeight,
  margin: 0,
};

/**
 * The entry marks, in a box that holds its height at zero characters. Sunken and bounded
 * (`27-F66` — a neutral state takes a boundary, never a fill step) so it reads as a field the
 * keys write into rather than as a stray line of dots.
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

/** A wrapping row of roster tiles, bounded so a large roster pages down rather than sideways. */
const ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: space["space-2"],
  maxWidth: 720,
};

/**
 * **`packages/ui`'s `NumericKeypad` is not used here, and that is a rule rather than an
 * oversight** — its own header says why. `acceptKeystroke` computes
 * `current === "0" ? key : current + key`, which is right for rupees and makes a PIN beginning
 * `0` **impossible to enter**: a silent permanent lockout of roughly a tenth of enrolled staff.
 * It also bounds entry by magnitude (`27-F29`), which is a money rule with no meaning for a
 * secret. So entry is plain concatenation, and the digits are composed from `Tile` —
 * commandment 6 is satisfied by the vocabulary, not by the money component.
 */

/**
 * `27 §1a`'s counter panel, used ONLY when the seam supplied no density.
 *
 * `00 §7` makes `panel_ppi` a measurement with a config correction, and main resolves it — so
 * reaching this line means the shipped preload stopped supplying it, which is exactly this
 * wave's recurring defect (a correct conversion with no seam to the product). It is a stated
 * fallback rather than a silent one for that reason: it is the panel the counter ships on, it
 * is named here, and `main/__acceptance__/panel-density.test.ts` §B is the hand-written
 * assertion that the product does not actually take this path. It is deliberately **not**
 * `dp ≡ CSS px`: falling back to the identity `27-F68` overturned would restore the defect
 * under a different name.
 */
const REFERENCE_COUNTER_PPI = Math.hypot(1366, 768) / 15.6;

export const App = () => {
  /**
   * `undefined` = the seam has not answered yet, and it is a THIRD state on purpose: painting
   * the surface before the first read would demand a PIN from a device that is already unlocked
   * (a renderer reload, a crash restart) — a flash of the lock screen on every launch.
   */
  const [user, setUser] = useState<DeviceState["user"] | undefined>(undefined);
  /**
   * `27-F68` — the density of the glass, read through the same seam as every other device fact.
   * It rides `deviceState()` rather than a channel of its own so it arrives on the read the
   * surface already waits for: there is no frame in which real content is painted at the wrong
   * physical size, because nothing but `Starting…` renders before the first answer.
   */
  const [panelPpi, setPanelPpi] = useState<number | undefined>(undefined);
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
  const color = useColor();

  const reload = useCallback(async () => {
    const state = await window.restos.deviceState();
    const next = state.user;
    setUser(next);
    // `27-F68` — re-read on every device-state read, so a panel that changes under a running
    // till resizes its own touch targets rather than keeping the one it booted on.
    setPanelPpi(state.panelPpi);
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

  /**
   * **`27-F68` / `DEC-UI-001` (b) — the conversion is applied ONCE, HERE, and it wraps
   * everything.**
   *
   * Every surface this app draws is inside it: the unlock gate, the counter shell, the status
   * strip, the tab rail, `03-F5`'s band and `ManagerApproval`. That is the ruling's own
   * requirement — *"applied once at the token boundary and to every dp in the layout, chrome
   * included"* — and the reason it is at the app root rather than inside `AppShell` is that
   * `02-F18`'s lock surface sits OVER the shell and would otherwise be the one screen still
   * drawn at the wrong physical size, 20–60× a shift.
   */
  const panel = (children: ReactNode) => (
    <PanelRoot panelPpi={panelPpi ?? REFERENCE_COUNTER_PPI}>{children}</PanelRoot>
  );

  // `01-F17` — nothing is blocked here, there is simply nothing yet known to draw.
  if (user === undefined) return <p>Starting…</p>;
  if (user !== null) return panel(<Counter />);

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
    return panel(
      <div style={GATE}>
        <div style={STEP}>
          {/*
            The surface names its own act. `27-F1` gives the operator nowhere to be lost and no
            back affordance, so the one line of chrome a lock screen gets has to say what this
            step IS — and `01-F61` makes it a step, not the whole thing: identify, THEN the PIN.
            Three unlabelled boxes in the corner of a blank page said neither.
          */}
          <p style={PROMPT}>Who are you?</p>
          <div style={ROW}>
            {roster.map((member) => (
              <Tile
                key={member.user_id}
                posture="counter"
                label={member.display_name}
                onPress={() => setChosen(member)}
              />
            ))}
          </div>
        </div>
      </div>,
    );
  }

  return panel(
    <div style={GATE}>
      <div style={IDENTITY}>
        {/*
          Who the PIN is about to be charged against. `02-F41` makes this the cashier the ledger
          will name, so an operator who mis-tapped has to be able to see it before submitting —
          which is why it is the largest word on the surface and no longer a 16 px serif line.
        */}
        <p style={{ ...PROMPT, color: color["fgColor-muted"] }}>Signing in as</p>
        <p style={NAME}>{chosen.display_name}</p>
        {/*
          One mark per digit, and the digits themselves are never shown: `01-F61` records that
          shoulder-surfing is the norm on a shared counter. It is feedback, not a readout — an
          operator has to be able to see that a key registered.

          It reserves its line whether or not anything is keyed: an element that appears only
          once entry starts moves everything under it on the first keystroke, and `27-F4` is
          about exactly that — the surface must not rearrange under a hand already moving.
        */}
        <p
          style={{
            ...MARKS,
            background: color["bgColor-surface-sunken"],
            border: `1px solid ${color["borderColor-default"]}`,
          }}
        >
          {"•".repeat(pin.length)}
        </p>
        {/*
          Back to step one, and `01-F61` requires that this cost NOTHING: "a mis-tap on a grid
          charges a failed attempt to someone who is not in the building" is the failure it
          exists to prevent, so re-choosing sends nothing to main and clears the entry rather
          than submitting it.

          `27-F9` — it sits on the identity side, a column away from the pad. It is the one
          control here whose mis-tap costs the operator her entry, and a wet hand reaching for
          `Clear` must not find it.
        */}
        <Tile
          posture="counter"
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

          `27-F14` — red is the fault slot, and a refused credential is a fault. It is the only
          colour this surface spends.
        */}
        {refused ? (
          <p style={{ ...PROMPT, color: color["fgColor-status-fault"] }}>
            That PIN was not accepted.
          </p>
        ) : null}
      </div>

      <div style={PAD}>
        {DIGITS.slice(0, 9).map((d) => (
          <Tile key={d} posture="keypad" label={d} onPress={() => press(d)} />
        ))}
        {/*
          A correction key, and it is not a convenience: without it a mistyped digit forces a
          failed attempt, and `01-F61` counts failed attempts toward a lockout that would then
          stop the till on a fat finger.
        */}
        <Tile posture="keypad" label="Clear" onPress={() => setPin("")} />
        <Tile posture="keypad" label="0" onPress={() => press("0")} />
        {/*
          `01-F26` fixes no PIN length, so entry cannot know when it is done and a confirming act
          has to exist. "Unlock" is an invented string — no FR names one — and is `00 §5.6`
          English.

          Bottom-right of the pad, which is where `NumericKeypad` puts its own twelfth key: two
          pads on one device that disagree about which cell closes an entry is the muscle-memory
          break `27-F4` exists to prevent.
        */}
        <Tile posture="keypad" label="Unlock" onPress={() => submit(chosen)} />
      </div>
    </div>,
  );
};
