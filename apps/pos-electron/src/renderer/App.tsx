import {
  CatalogHealth,
  ConnectionFacts,
  PanelRoot,
  PersonTile,
  Readout,
  space,
  Tile,
  typography,
  useColor,
  WorkSurface,
} from "@restos/ui";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { DeviceState, RosterMember, Session } from "../shared/ipc";
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
 * The lock surface's layout, found by looking (August 2026) and then looked at again.
 *
 * **Round one — the geometry.** What was here: the roster as three 76 dp tiles wrapped into the
 * TOP-LEFT CORNER of an otherwise blank white page, and the pad as one centred column of `Tile`s
 * with a `maxWidth` that produced three columns by accident of wrapping. On the `27 §1a`
 * reference counter (1366x768) that column ran **780 px** before "Unlock" — so the confirming act
 * of the one surface that gates every other sat below the fold, on a body with
 * `overflow: hidden`, where `27-F2` says no primary action may be. The fix was a two-column
 * composition — identity left, pad right — because the pad's own height is the tallest fixed
 * thing on the surface and everything else fits BESIDE it instead of under it.
 *
 * **Round two — and the founder was right about this one too.** With the geometry fixed the
 * screen was still *"a colour-less screen with just 3 names"*. Two separate things were wrong and
 * only one of them is visual:
 *
 * 1. **A touch FLOOR was being spent as a design.** Three `posture="counter"` tiles is three
 *    **12 mm** boxes, which is `27-F8`'s menu-grid minimum, on the one surface an operator meets
 *    20–60× a shift before anything else. `PersonTile` is the vocabulary item that was missing.
 * 2. **The door was withholding facts the device already had.** `deviceState()` has carried
 *    `deviceLabel`, `businessDay` and the three `00 §5.7` reachability facts throughout, and the
 *    lock screen — the one screen with no `AppShell`, so no `StatusStrip` — showed none of them.
 *    A cashier arriving for a shift could not tell which till she was at or whether it could
 *    reach anything. That is not decoration: `00 §5.7` makes reporting what is true a platform
 *    law, and this surface was the single exception to it.
 *
 * **`27-F16` is not a licence to leave a screen undesigned**, and conflating the two is what
 * produced this. That FR reserves *signal* colour for the abnormal, and it is obeyed here
 * absolutely — the door spends **zero** of `27-F14`'s allocation on its resting state. What it
 * spends instead is what a monochrome instrument has always spent: the three neutral surfaces
 * (`-sunken` field, `-raised` cards), the boundary `27-F66` already requires at 3:1, and the type
 * ladder, which this product had built four steps of and was using two.
 */
const GATE: React.CSSProperties = {
  height: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  gap: space["space-6"],
  padding: space["space-6"],
};

/**
 * The room the door opens into: everything below the masthead, centred on BOTH axes.
 *
 * Centring is the whole answer to *"an enormous dead area"*. The content here has a natural size
 * — three cards, or a name and a pad — and a 24″ desktop is larger than it; stretching a PIN pad
 * across 531 mm of glass would be worse than the emptiness. So the room is given back as
 * symmetric field, which reads as composed, where the same room anchored top-left reads as
 * abandoned. `27-F4` is unaffected: a till lives on one panel, so nothing ever moves under an
 * operator's hand.
 */
const ROOM: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: space["space-6"],
};

/**
 * The two-column composition of step two, unchanged in shape and now inside `ROOM`.
 * `27-F4`: the pad's twelfth cell is still `Unlock`, bottom-right, where `NumericKeypad` puts
 * its own — two pads on one device that disagree about which cell closes an entry is the
 * muscle-memory break that FR exists to prevent.
 */
const STEP_TWO: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: space["space-8"],
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
  gap: space["space-6"],
};

/**
 * **The masthead — `00 §5.7` reaching the one surface it never reached.**
 *
 * Every operational screen carries `StatusStrip`; the lock surface sits OVER the shell (`02-F18`
 * — a locked device shows only the unlock screen, and `App.tsx`'s header records why the gate is
 * here and not inside `Counter`), so it has no strip and had no honesty row at all. A cashier
 * arriving for a shift could not read which till she was standing at, what business day it
 * thought it was, or whether it could reach the LAN, the hub or the cloud.
 *
 * **Every fact here is one `deviceState()` already served while locked** — `App.tsx` calls it on
 * mount precisely to decide lock state — so this costs no new channel, no new schema field and
 * no read a locked device was not already making. It is composition, not capability.
 *
 * `ConnectionFacts` and `CatalogHealth` are reused rather than restated, which is `21-F1`'s point
 * and also the safer half: `ConnectionFacts` carries the correction that `down` is NOT the fault
 * colour (`27-F14` allocates red to acted-on events and lists no connectivity claimant), and a
 * hand-rolled row of dots on this screen would have re-introduced the two permanent red blocks
 * that correction removed. `CatalogHealth` renders `null` when the menu is current (`27-F16`), so
 * a healthy till carries no decoration here at all.
 *
 * **What is NOT here, named rather than left looking intentional: whether the DAY is open and
 * whose shift is running.** It is the single most useful thing this screen could say to an
 * arriving cashier and it is deliberately absent, because it is not a fact a locked device may
 * serve. `main/authorize.ts`'s `authorizeReads` narrows `cashState` through `domain`'s
 * `reportScope` against the asking SUBJECT, and a locked device has no subject — so putting the
 * shift on the door means either widening an authorization boundary or routing around it, and
 * Commandment 8 makes that a spec question and not a session's call. **Owed**, and it wants an
 * FR: `02-F23` scopes the reconciliation to a person, and "what an unauthenticated operator at
 * the glass may see about the day" is a question no FR in doc 02 currently answers.
 */
const MASTHEAD: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: space["space-5"],
  paddingBottom: space["space-4"],
};

/**
 * `01-F46`'s Asia/Karachi business date, read as a person reads a date.
 *
 * The strip renders the raw `YYYY-MM-DD` beside the word "Day", which is right for a dense chrome
 * row an operator glances at mid-service. This is the door, it is read once at the start of a
 * shift, and `21 §5` puts the reader at plausibly non-reading — a written month is the one form
 * of a date that cannot be misread as day-first or month-first. English per `00 §5.6`.
 *
 * `Intl` with an EXPLICIT `en-GB` and an explicit UTC time zone, never the host's locale or the
 * host's clock: the value is already `01-F46`'s branch business day, and re-interpreting it
 * through a machine's own zone is how a date shifts by one at 05:00 Karachi. It degrades to the
 * raw string rather than throwing — `01-F54`, and a blank date on a locked till reads as broken.
 */
const readableDay = (businessDay: string): string => {
  const parsed = new Date(`${businessDay}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return businessDay;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
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
 *
 * **Raised from `text-numeric-primary` to `-hero`**, which is the same step `PersonTile` takes
 * one screen earlier and for the same reason: the two surfaces are the two halves of `01-F61`'s
 * one act, and a name that shrinks between choosing it and confirming it tells the operator the
 * fact got less important exactly as it became irreversible.
 */
const NAME: React.CSSProperties = {
  fontFamily: typography["text-numeric-hero"].fontFamily,
  fontSize: typography["text-numeric-hero"].fontSize,
  lineHeight: `${typography["text-numeric-hero"].lineHeight}px`,
  fontWeight: typography["text-numeric-hero"].fontWeight,
  letterSpacing: typography["text-numeric-hero"].letterSpacing,
  margin: 0,
};

/**
 * The till's own name, in the masthead. `01-F27` — this is the DEVICE identity and it is
 * deliberately not a person: a till says what it is before anyone has said who they are.
 */
const TILL: React.CSSProperties = {
  fontFamily: typography["text-numeric-primary"].fontFamily,
  fontSize: typography["text-numeric-primary"].fontSize,
  lineHeight: `${typography["text-numeric-primary"].lineHeight}px`,
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

/**
 * A wrapping row of roster cards.
 *
 * **No `maxWidth`.** It carried 720 dp, which was a cap chosen for 76 dp tiles and is now the
 * thing that would force a `PersonTile` row to wrap at three cards on a panel with room for four
 * — the responsive defect this work exists to remove, one constant along. The row is centred by
 * `ROOM` and bounded by the surface itself, so a large roster wraps to a second line when the
 * glass genuinely runs out and not before.
 *
 * `27-F2` is satisfied without paging: this is a roster, not a catalogue, and `01-F61`'s
 * identification grid is one branch's staff. If a roster ever outgrows two lines of cards that is
 * a paged surface and a different design — named here so the next reader knows it was considered
 * rather than missed.
 */
const ROW: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: space["space-5"],
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
   * The whole device state, kept so the masthead can render `00 §5.7`'s facts on the one surface
   * that never had them. Same read, same push, no new channel — `user` above stays a separate
   * piece of state because lock state has exactly ONE source and folding it into an object would
   * make "is this device locked" a property lookup on a possibly-stale record.
   */
  const [device, setDevice] = useState<DeviceState | null>(null);
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
  const [roster, setRoster] = useState<RosterMember[]>([]);
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
    setDevice(state);
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

  /**
   * The door, as one composition, so both `01-F61` steps get the same masthead and the same room.
   *
   * **It does NOT apply `PanelRoot` itself, and the separation is deliberate.** `27-F68`'s
   * conversion is one concern (how big is a dp on this glass) and the door's composition is
   * another (masthead, room, the step inside it); folding the first into the second would leave one
   * `panel(` call site in this file where `main/__acceptance__/panel-density.test.ts` §B counts on
   * seeing the conversion applied at every return — and that assertion is the hand-written seam
   * check for the wave's recurring defect, which is not a thing to make harder to see.
   *
   * `WorkSurface` is here for the reason `AppShell` has one: this surface has layout opinions
   * that depend on how much glass there is (`PersonTile`'s card size), and a mode measured
   * separately per component is a mode two components can disagree about. `02-F18`'s lock screen
   * has no `AppShell`, so it takes its own.
   */
  const door = (children: ReactNode) => (
    <>
      <WorkSurface>
        <div style={GATE}>
          <div style={{ ...MASTHEAD, borderBottom: `1px solid ${color["borderColor-default"]}` }}>
            <div>
              {/* `01-F27` — the DEVICE's identity. A till says what it is before anyone has
                  said who they are, and this screen never said it at all. */}
              <p style={TILL}>{device?.deviceLabel ?? ""}</p>
              <p style={{ ...PROMPT, color: color["fgColor-muted"] }}>
                {device === null ? "" : readableDay(device.businessDay)}
              </p>
            </div>
            {/* `00 §5.7` — the three facts, and `01-F56`'s catalog health, reused from the
                vocabulary rather than restated. `CatalogHealth` draws nothing when the menu is
                current (`27-F16`), so a healthy till carries no decoration here. */}
            <div style={{ display: "flex", alignItems: "center", gap: space["space-3"] }}>
              {device === null ? null : (
                <ConnectionFacts lan={device.lan} hub={device.hub} cloud={device.cloud} />
              )}
              <CatalogHealth refusal={device?.catalog ?? null} />
            </div>
          </div>
          <div style={ROOM}>{children}</div>
        </div>
      </WorkSurface>
    </>
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
   * pressable card and never a row of names.
   *
   * **`Tile posture="counter"` is gone from this surface and `PersonTile` replaces it**, which is
   * the single change the founder's *"just 3 names"* actually asks for. A counter posture is
   * `27-F8`'s **12 mm** menu-grid minimum — a floor, being spent as the design for the one screen
   * that gates every other. `PersonTile` carries the name at the top of the type ladder and
   * `01-F26`'s role beneath it, and it is the same component the approver grid will want.
   *
   * `27-F4` is not engaged: nothing is added, removed or reordered — main supplies the roster
   * order and it is still rendered untouched. The card is the same target in the same place, at a
   * size an operator can hit without looking.
   */
  if (chosen === null) {
    return panel(
      door(
        <div style={STEP}>
          {/*
          The surface names its own act. `27-F1` gives the operator nowhere to be lost and no
          back affordance, so the one line of chrome a lock screen gets has to say what this
          step IS — and `01-F61` makes it a step, not the whole thing: identify, THEN the PIN.
          Three unlabelled boxes in the corner of a blank page said neither.
        */}
          <p style={{ ...PROMPT, color: color["fgColor-muted"], letterSpacing: "0.12em" }}>
            WHO ARE YOU?
          </p>
          <div style={ROW}>
            {roster.map((member) => (
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
        </div>,
      ),
    );
  }

  return panel(
    door(
      <div style={STEP_TWO}>
        <div style={IDENTITY}>
          {/*
          Who the PIN is about to be charged against. `02-F41` makes this the cashier the ledger
          will name, so an operator who mis-tapped has to be able to see it before submitting —
          which is why it is the largest word on the surface and no longer a 16 px serif line.

          `Readout` rather than a loose label and a loose name: it is the same caption-above-fact
          pairing the money surfaces use, so the product has ONE way of saying "here is a fact and
          here is what it is called" and this screen is not a second dialect of it.
        */}
          <Readout caption="SIGNING IN AS">
            <p style={NAME}>{chosen.display_name}</p>
          </Readout>
          {/*
          One mark per digit, and the digits themselves are never shown: `01-F61` records that
          shoulder-surfing is the norm on a shared counter. It is feedback, not a readout — an
          operator has to be able to see that a key registered.

          It reserves its line whether or not anything is keyed: an element that appears only
          once entry starts moves everything under it on the first keystroke, and `27-F4` is
          about exactly that — the surface must not rearrange under a hand already moving.
        */}
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
    ),
  );
};
