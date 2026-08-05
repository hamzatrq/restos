import { Tile } from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import type { DeviceState } from "../shared/ipc";
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
 */

/** `27-F6` — no operational role types non-numeric text on a critical path, and this is the
 * most critical one: it gates every other. Laid out as the pad an operator's hand already
 * knows, 1–9 then 0, with the correction key beside it. */
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

export const App = () => {
  /**
   * `undefined` = the seam has not answered yet, and it is a THIRD state on purpose: painting
   * the pad before the first read would demand a PIN from a device that is already unlocked
   * (a renderer reload, a crash restart) — a flash of the lock screen on every launch.
   */
  const [user, setUser] = useState<DeviceState["user"] | undefined>(undefined);
  const [pin, setPin] = useState("");
  const [refused, setRefused] = useState(false);

  const reload = useCallback(async () => {
    setUser((await window.restos.deviceState()).user);
  }, []);

  useEffect(() => {
    void reload();
    // The same push `Counter` listens on: main says the folds moved — or the session did — and
    // the renderer re-reads. This is how a lock decided in main reaches the screen.
    return window.restos.onChanged(() => void reload());
  }, [reload]);

  // `01-F17` — nothing is blocked here, there is simply nothing yet known to draw.
  if (user === undefined) return <p>Starting…</p>;
  if (user !== null) return <Counter />;

  /**
   * `01-F28` — the digits go to main and a yes/no comes back. The answer is deliberately NOT
   * kept: the screen re-reads the seam either way, so a refused PIN leaves the device locked
   * because the seam still says locked, not because this function decided so.
   *
   * `01-F1` — nothing is appended from here. A PIN written into an event can be corrected by
   * another event but never removed, and `01-F5`'s `audit.login` is main's to write.
   */
  const submit = () => {
    const entered = pin;
    setPin("");
    void window.restos
      .unlock(entered)
      .then((r) => setRefused(!r.unlocked))
      .catch(() => setRefused(true))
      .then(reload);
  };

  const press = (digit: string) => {
    setRefused(false);
    setPin(pin + digit);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
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
      <Tile posture="keypad" label="Unlock" onPress={submit} />
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
