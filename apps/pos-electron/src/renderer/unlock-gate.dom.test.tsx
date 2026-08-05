// ACCEPTANCE TESTS — S-0c, renderer half: `C1`, the unlock surface.
//
// PROVENANCE (24 §3 step 2): RE-AUTHORED August 2026 from spec text, by a session that has seen
// no implementation of the identification step and did not write the plan. Sources: `01-F61`
// (the August amendment), `01-F26`, `01-F28`, `02-F18`, `02-F41`, `01-F1`, `27-F4`, `27-F6`,
// `27-F8`, `21 §5`, `18 §6`/`18 §9`, `plans/wave-1/screen-map.md §3.1`. Committed RED.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// ⚠ WHY THIS FILE WAS RE-AUTHORED RATHER THAN EXTENDED.
//
// Its previous form was **8/8 GREEN and encoded a SUPERSEDED contract**: a bare PIN pad,
// `unlock(pin)`, and ten digit keys asserted on the first paint of a locked device. `01-F61`
// was then amended, and that exact shape is the one the FR now names as tempting-and-wrong. A
// green test defending an overruled rule **fails the correct implementation** — AGENTS.md's
// `01-F60` worked example is the same failure, and it took ~3 weeks to surface. Five green
// assertions are replaced here; everything the amendment does not touch is carried across
// unchanged and marked PRESERVED.
//
// WHAT `01-F61` RULES, quoted because the reasoning is the contract:
//
//   "**The unlock surface IDENTIFIES THE USER FIRST, then takes the PIN.** … A bare PIN pad
//    that matches the entry against every staff hash on the device is the tempting shape and it
//    breaks both: a failed attempt belongs to **no** user, so the per-(device, user) counter
//    cannot be keyed at all and collapses to the device-wide counter this FR just refused; and
//    two staff sharing a 4-digit PIN become **indistinguishable**, which under `02-F41`
//    ('attribution is whoever's PIN is in') writes the wrong cashier into an append-only ledger
//    `01-F1` forbids correcting in place. **The identification step must not be a text list** —
//    `27-F6` forbids requiring typing and the cashier is plausibly a non-reader (`21 §5`), so
//    it is a fixed grid of staff tiles whose **positions never move** (`27-F4`)."
//
// Both halves of that are tested as *behaviour*, not as shape: the per-user counter shows up
// here as "`unlock` carries the identity the operator chose", and the shared-PIN hazard shows
// up as two roster members who **share one PIN** and must still unlock as themselves.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE CONTRACT THESE TESTS DEFINE:
//
//   src/renderer/App.tsx  →  export const App
//
//     The app root that `main.tsx` mounts, and where the `01-F26` lock lives. It is OVER the
//     whole app rather than inside `Counter`, for two reasons that agree: the screen map calls
//     it "a lock surface over the whole app", and `counter.dom.test.tsx` is the counter
//     surface's oracle and renders `<Counter />` directly — a gate inside `Counter` turns that
//     entire suite red without a single one of its assertions being wrong.
//
//   window.restos.staff() => Promise<Session[]>        ← NEW READ
//
//     `01-F61`'s identification step needs a roster, and the fixture cannot invent one. This is
//     **a new bridge channel, not a new field on `DeviceState`**, and the choice is argued
//     rather than assumed:
//
//       - PRECEDENT. The device staff registry (`sync-client/src/staff.ts`) is versioned
//         reference data on the sync channel, modelled on `catalog.ts` down to its refusal
//         vocabulary. The catalog's read on this bridge is its own channel (`menu()`), for
//         `01-F52`'s reason — reference data is not a fold. Staff is the same kind of thing and
//         takes the same shape.
//       - COST. `DeviceState` is re-read on **every** `changed` push, which main fires on every
//         append — every line added, every order confirmed. A roster that changes when someone
//         is hired would ride the hottest read on the device.
//       - `02-F45`. `DeviceState.user` is the SESSION — one fact, one field. "Who is signed in"
//         and "who could sign in" are different facts, and `01-F27` is the FR that exists
//         because identity axes get conflated when they share a home.
//
//     **The ORDER of the array is part of the contract** (`27-F4`): main supplies a stable
//     order and the renderer renders it, unsorted. A renderer-side sort cannot be stable —
//     it re-ranks the grid the moment a name is added, which `27-F4` makes a breaking change.
//
//   window.restos.unlock(user_id: string, pin: string) => Promise<{ unlocked: boolean }>
//
//     REPLACES `unlock(pin)`. Positional and in this order, matching the seam that already
//     ships: `sync-client/src/pin-session.ts` exposes `unlock(user_id, pin)` and refuses with
//     `device_not_registered | locked_out | unknown_user | bad_pin`. `01-F28` verification is
//     on-device and belongs to main (S-0b); the renderer hands over an identity and digits and
//     is told yes or no. It is NOT an append: `01-F1` makes a PIN written into an event
//     permanent and unredactable.
//
//   DeviceState.user: { user_id, display_name } | null   —  null is LOCKED.
//
//     The single source for lock state, so that a lock decided ANYWHERE (idle timer, shift
//     end, a manual lock) reaches the screen through the seam the app already re-reads on.
//
//   The unlock control is labelled "Unlock" (`00 §5.6` English-only UI).
//
//     THE ONE INVENTED STRING IN THIS FILE, named here because no FR fixes it. A confirming
//     act has to exist — `01-F26` fixes no PIN length, so entry cannot know when it is done.
//
//   `packages/ui`'s `NumericKeypad` MAY NOT be used. Its own header says why, and one of the
//   two reasons is asserted below: `acceptKeystroke` suppresses a leading zero, which makes a
//   PIN beginning `0` unenterable. One roster member here has exactly that PIN.
//
// OUT OF SCOPE, deliberately: how the PIN is hashed or compared (`domain/src/pin.ts` and
// `sync-client/src/pin-session.ts` carry their own suites), what `audit.login` carries (S-0b,
// `01-F5`), the lockout counter's arithmetic (`01-F61`'s first three decisions, tested in
// `sync-client/src/__acceptance__/pin-attempt-persistence.test.ts`), the permission matrix
// (S-0a). Nothing here asserts any of them.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { targetFor } from "@restos/ui";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
  RestosBridge,
  Session,
} from "../shared/ipc";
import { App } from "./App";

afterEach(cleanup);

/** happy-dom has no layout, so the grid would never measure. See `counter.dom.test.tsx`. */
const REFERENCE_PANEL = { width: 1366, height: 768 };
class StubResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: REFERENCE_PANEL as DOMRectReadOnly } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

/**
 * The staff this device has synced (`01-F28` reference data, `staff.ts`).
 *
 * **The order is deliberately neither alphabetical nor sorted by id** — alphabetical would be
 * Ayesha, Bilal, Hina, Zoya, and so would `user_id` order. `27-F4` bans reordering an
 * operational grid, and a fixture whose supplied order happens to equal a sort cannot tell a
 * renderer that preserves the order from one that re-derives it.
 */
const ZOYA: Session = { user_id: "user-zoya", display_name: "Zoya" };
const AYESHA: Session = { user_id: "user-ayesha", display_name: "Ayesha" };
const BILAL: Session = { user_id: "user-bilal", display_name: "Bilal" };
const HINA: Session = { user_id: "user-hina", display_name: "Hina" };
const ROSTER: Session[] = [ZOYA, AYESHA, BILAL, HINA];
const ROSTER_NAMES = ROSTER.map((m) => m.display_name);

/**
 * `01-F61`'s second reason made concrete: **ZOYA and AYESHA share this PIN.** Two staff sharing
 * a 4-digit PIN is ordinary at ~13 bits of entropy, and under a bare pad they are
 * indistinguishable — which `02-F41` then writes into a ledger `01-F1` forbids correcting.
 */
const SHARED_PIN = "846201";
/**
 * BILAL's begins with `0`. `packages/ui`'s `NumericKeypad.acceptKeystroke` collapses
 * `current === "0" ? key : current + key`, which is right for rupees and makes this PIN
 * **impossible to enter** — a silent permanent lockout of roughly a tenth of enrolled staff.
 */
const LEADING_ZERO_PIN = "046201";
const HINA_PIN = "372845";
/** Distinctive on purpose: no member's PIN, so it is a refusal for anyone. */
const WRONG_PIN = "111111";

const PINS: Record<string, string> = {
  [ZOYA.user_id]: SHARED_PIN,
  [AYESHA.user_id]: SHARED_PIN,
  [BILAL.user_id]: LEADING_ZERO_PIN,
  [HINA.user_id]: HINA_PIN,
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

const ORDERS: OpenOrder[] = [];

const baseDevice = (user: DeviceState["user"]): DeviceState => ({
  actor: "Counter 1",
  deviceLabel: "Counter 1",
  businessDay: "2026-08-04",
  training: false,
  lan: "ok",
  hub: "ok",
  cloud: "down",
  blocked: null,
  user,
});

let appended: AppendRequest[];
let lines: AddLineRequest[];
let unlockCalls: { user_id: string; pin: string }[];

/**
 * The bridge, with main's half of the session modelled honestly: `unlock` verifies, SETS the
 * session, and pushes `changed` — which is what `main/index.ts` already does around every other
 * write ("the push carries no data — main says the folds moved and the renderer re-reads").
 *
 * **`unlock` is modelled on `createPinSession.unlock`, not on a PIN comparison**, and that is
 * what makes the bare-pad implementation fail here rather than merely look wrong: the identity
 * is looked up in the registry FIRST (`01-F28`), an unknown id is refused before any PIN is
 * examined (`unknown_user`), and the PIN is then checked against **that member's** credential.
 * A renderer that hands over a PIN alone therefore fails with a real refusal, on the real
 * reason, exactly as `main/index.ts` will once `DEV_PIN` is gone.
 *
 * Written so that BOTH plausible renderer designs pass: one that re-reads `deviceState()` when
 * `unlock` resolves, and one that waits for the `changed` push. What neither may do is decide
 * lock state from `unlock`'s return alone and keep it — `01-F26`'s idle auto-lock happens with
 * no unlock call in sight, and the last test in this file is where that shows.
 */
const mountWith = (start: DeviceState["user"], roster: Session[] = ROSTER) => {
  appended = [];
  lines = [];
  unlockCalls = [];
  let user = start;
  const listeners = new Set<() => void>();
  const push = () => {
    for (const fn of listeners) fn();
  };
  const bridge = {
    deviceState: vi.fn(async () => baseDevice(user)),
    openOrders: vi.fn(async () => ORDERS),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    /** `01-F28` reference data, in the order main supplies it (`27-F4`). */
    staff: vi.fn(async () => roster),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      return { id: `evt-line-${lines.length}` };
    }),
    unlock: vi.fn(async (user_id: string, pin: string) => {
      unlockCalls.push({ user_id, pin });
      const member = roster.find((m) => m.user_id === user_id) ?? null;
      // `unknown_user` before `bad_pin`, as `pin-session.ts` orders them.
      const ok = member !== null && PINS[member.user_id] === pin;
      if (ok) {
        user = member;
        push();
      }
      return { unlocked: ok };
    }),
    onChanged: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    // `satisfies` rather than a cast: the contract above is then enforced by `pnpm typecheck`
    // as well as by these assertions, so a bridge missing `staff` — or still carrying
    // `unlock(pin)` — is a compile error and not merely a red test.
  } satisfies RestosBridge;
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return {
    bridge,
    /** What main does on an idle auto-lock (`01-F26`): end the session and push. */
    lockFromMain: () => {
      user = null;
      push();
    },
    /** An ordinary `changed` push — the folds moved, nothing about the session did. */
    pushFromMain: push,
  };
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/** Type the PIN on the surface's own keys and confirm it. Identification is a separate step. */
const enterPin = async (pin: string) => {
  for (const digit of pin) {
    fireEvent.click(await screen.findByRole("button", { name: digit }));
  }
  fireEvent.click(await screen.findByRole("button", { name: /^unlock$/i }));
};

/** `01-F61`'s two steps, in the order the FR fixes: identify the user, THEN take the PIN. */
const identifyAndEnterPin = async (who: Session, pin: string) => {
  fireEvent.click(await screen.findByRole("button", { name: who.display_name }));
  await enterPin(pin);
};

/**
 * A second attempt by the SAME cashier after a refusal.
 *
 * Tolerant of both plausible surfaces on purpose — `01-F61` does not say whether a refusal
 * returns to the grid or holds the identified user — so the tile is re-tapped only if it is
 * offered. Asserting one of those two designs would be inventing policy (commandment 2).
 */
const retryPin = async (who: Session, pin: string) => {
  const tile = screen.queryByRole("button", { name: who.display_name });
  if (tile !== null) fireEvent.click(tile);
  await enterPin(pin);
};

/** The staff controls, in DOM order, so a re-sort anywhere is visible. */
const staffOrderOnScreen = (): string[] =>
  screen
    .queryAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "")
    .filter((name) => ROSTER_NAMES.includes(name));

/** The counter's operational controls, by the names `counter.dom.test.tsx` already pins. */
const COUNTER_CONTROLS = [/^Dine-in$/i, /^Takeaway$/i, /^Delivery$/i, /Send to kitchen/i];

describe("01-F26 / 02-F18 — a locked device shows the unlock surface and NOTHING operational", () => {
  it("no order can be started, sent or added to while the device is locked", async () => {
    mountWith(null);
    render(<App />);

    // The surface itself is up — a locked till that renders nothing is indistinguishable from
    // a crashed one to an operator who has seen one.
    //
    // RE-POINTED, and it is the only line of this test the amendment touches: the first paint
    // of a locked device is now `01-F61`'s identification step, so the probe is a staff tile
    // rather than the confirm key. Every assertion under it is carried across unchanged.
    expect(await screen.findByRole("button", { name: ZOYA.display_name })).toBeTruthy();

    // And the counter is not behind it. Not "greyed": ABSENT. `27-F4`'s disable-in-place rule
    // governs controls inside a surface; this is a different surface, and a locked device that
    // still renders the grid is one mis-tap away from an event attributed to nobody (`02-F41`).
    for (const name of COUNTER_CONTROLS) {
      expect(
        screen.queryByRole("button", { name }),
        `${name} is reachable while locked`,
      ).toBeNull();
    }
    expect(appended).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });
});

describe("01-F61 — the unlock surface IDENTIFIES the user first, then takes the PIN", () => {
  it("the first paint of a locked device is the staff grid, read from the seam", async () => {
    const h = mountWith(null);
    render(<App />);

    for (const member of ROSTER) {
      expect(
        await screen.findByRole("button", { name: member.display_name }),
        `${member.display_name} cannot be identified — the grid is not the whole roster`,
      ).toBeTruthy();
    }
    // From the SEAM, never a constant in the renderer: the roster is synced reference data
    // (`01-F28`) and a hardcoded list would go stale the day someone is hired or let go
    // (`01-F42` removes the row, and `01-F48` makes that direction fail-closed).
    expect(h.bridge.staff, "the roster was not read from the bridge").toHaveBeenCalled();
  });

  it("offers every digit once a user is identified, so any PIN can be entered", async () => {
    // `27-F6`: no operational role is ever required to type non-numeric text on a critical
    // path, and unlocking is the most critical path there is — it gates every other one.
    //
    // RE-POINTED. Its previous form mounted LOCKED and asserted all ten keys with no
    // interaction at all; under `01-F61` a bare pad on the first paint is now the defect this
    // file exists to catch, not the contract.
    mountWith(null);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: ZOYA.display_name }));
    await screen.findByRole("button", { name: /^unlock$/i });

    for (const digit of "0123456789") {
      expect(
        screen.getByRole("button", { name: digit }),
        `the pad has no ${digit} key`,
      ).toBeTruthy();
    }
  });

  it("no PIN can be submitted while nobody is identified", async () => {
    // THE BARE-PAD TEST, and it is written against the OUTCOME rather than against a shape:
    // `01-F61` fixes the order of the two steps, not whether they share a screen. A surface
    // that shows the grid alone clicks nothing below and passes; a surface that shows both but
    // will not confirm until a tile is tapped also passes; a bare pad calls `unlock` and fails.
    //
    // Not vacuous against an App that renders nothing: the grid is proved up first.
    mountWith(null);
    render(<App />);
    await screen.findByRole("button", { name: ZOYA.display_name });

    for (const digit of SHARED_PIN) {
      const key = screen.queryByRole("button", { name: digit });
      if (key !== null) fireEvent.click(key);
    }
    const confirm = screen.queryByRole("button", { name: /^unlock$/i });
    if (confirm !== null) fireEvent.click(confirm);

    // `01-F61`: a failed attempt that belongs to no user cannot be counted against anyone, so
    // the per-(device, user) lockout collapses into the device-wide one the FR refuses as
    // "a scheduled stopped till". The positive control for this line is the next test.
    expect(unlockCalls, "a PIN reached main with nobody identified").toEqual([]);
  });

  it("hands main BOTH the identified user and the PIN, user first", async () => {
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(HINA, HINA_PIN);

    // The argument ORDER is pinned, matching `createPinSession.unlock(user_id, pin)`. Swapped,
    // the registry lookup misses and `pin-session.ts` refuses `unknown_user` — which is what
    // the fixture models, so the counter below never appears either.
    await waitFor(() => expect(unlockCalls).toEqual([{ user_id: HINA.user_id, pin: HINA_PIN }]));
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();
  });

  it("two staff sharing ONE PIN each unlock as themselves (02-F41, 01-F1)", async () => {
    // `01-F61`'s own second reason. ZOYA and AYESHA share `SHARED_PIN`, which at ~13 bits is an
    // ordinary collision on a four-person roster. Under a pad that matches the entry against
    // every staff hash, one of them is unreachable and the other is credited with her sales —
    // in a ledger `01-F1` forbids correcting in place. No implementation can pass this test
    // from the PIN alone: one input, two required outputs.
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(ZOYA, SHARED_PIN);
    await waitFor(() => expect(unlockCalls).toEqual([{ user_id: ZOYA.user_id, pin: SHARED_PIN }]));

    cleanup();
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(AYESHA, SHARED_PIN);
    await waitFor(() =>
      expect(unlockCalls).toEqual([{ user_id: AYESHA.user_id, pin: SHARED_PIN }]),
    );
  });

  it("a PIN beginning with 0 is enterable — this is not a money keypad", async () => {
    // `packages/ui`'s `NumericKeypad` is BANNED here and this is the assertion that enforces it.
    // `acceptKeystroke` computes `current === "0" ? key : current + key`, so `046201` collapses
    // to `46201`: correct for rupees, and a silent permanent lockout for a credential. Its
    // second money rule (`Number(next) > max`, `27-F29`) fails this line too.
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(BILAL, LEADING_ZERO_PIN);

    await waitFor(() =>
      expect(unlockCalls).toEqual([{ user_id: BILAL.user_id, pin: LEADING_ZERO_PIN }]),
    );
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();
  });
});

describe("01-F61 / 27-F4 — identification is a fixed GRID of tiles, never a text list", () => {
  it("every staff control is a touch target at the 27-F8 floor — a row of text is not", async () => {
    // `27-F6`'s test is "whether a non-typing operator can complete the task by another route",
    // so a search box is not banned — it is an explicit escape hatch there. What IS banned is a
    // list: `21 §5` and `role-task-inventories.md §2` put the cashier at plausibly non-reading,
    // and `27-F8` makes a tappable target a measured minimum rather than a style. A `<li>` of
    // names carries neither, which is exactly how the two shapes differ in a DOM with no layout.
    mountWith(null);
    render(<App />);
    await screen.findByRole("button", { name: ZOYA.display_name });

    const floor = targetFor("floor");
    for (const member of ROSTER) {
      const tile = screen.getByRole("button", { name: member.display_name });
      const width = Number.parseFloat(tile.style.minWidth);
      const height = Number.parseFloat(tile.style.minHeight);
      expect(
        width >= floor && height >= floor,
        `${member.display_name} is ${tile.style.minWidth}x${tile.style.minHeight}, under the ` +
          `27-F8 floor of ${floor} dp — a text row, not a tile`,
      ).toBe(true);
    }
  });

  it("positions never move — not on a push, not after a refusal, not by recency", async () => {
    // `27-F4`, verbatim: "**No adaptive, frecency-sorted or personalised ordering anywhere
    // staff-facing** — static menus measurably beat adaptive ones, and 23 of 34 field subjects
    // could not perform a task they knew well on a differently-arranged device." A grid that
    // floats the last cashier to the front is the single most tempting personalisation there
    // is on this surface, and it is the one `01-F61` calls an ASSET when it does not happen:
    // "a tile learned by position is usable without reading it".
    const h = mountWith(null);
    render(<App />);
    await screen.findByRole("button", { name: ZOYA.display_name });
    expect(staffOrderOnScreen(), "the roster was re-sorted on the way to the screen").toEqual(
      ROSTER_NAMES,
    );

    // An ordinary `changed` push. Main fires it on every append, so this is the common case,
    // not an exotic one — and it is where a re-read that re-derives an order would show.
    const readsBefore = h.bridge.deviceState.mock.calls.length;
    h.pushFromMain();
    await waitFor(() =>
      expect(h.bridge.deviceState.mock.calls.length).toBeGreaterThan(readsBefore),
    );
    expect(staffOrderOnScreen(), "the grid reordered on a `changed` push").toEqual(ROSTER_NAMES);

    // HINA is LAST in the roster, so a most-recently-used order puts her first on the way back.
    await identifyAndEnterPin(HINA, HINA_PIN);
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();
    h.lockFromMain();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: ZOYA.display_name })).toBeTruthy(),
    );

    expect(staffOrderOnScreen(), "the last cashier to unlock moved to the front").toEqual(
      ROSTER_NAMES,
    );
  });

  it("the order is the SEAM's, not a rule of the renderer's own", async () => {
    // Vary the input that decides the answer — the K-4 lesson in AGENTS.md, where ~90 renders
    // varied everything except the field under test. The test above pins one roster; if the
    // renderer sorts by anything of its own, a DIFFERENT supplied order exposes it. Positional
    // stability has to live in main, which is the only place that can keep it across a hire.
    const reordered = [HINA, ZOYA, BILAL, AYESHA];
    mountWith(null, reordered);
    render(<App />);
    await screen.findByRole("button", { name: HINA.display_name });

    expect(staffOrderOnScreen(), "the renderer imposed an order of its own").toEqual(
      reordered.map((m) => m.display_name),
    );
  });
});

describe("C1 is NOT a tab (screen-map §3.1, 27-F4)", () => {
  it("unlocking reveals the counter with its FIVE surfaces — not six", async () => {
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(ZOYA, SHARED_PIN);

    // The counter is now reachable. This is also the positive control for the locked-state
    // assertions above: they would pass against an App that renders nothing, ever.
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();

    // `27-F4` makes adding an operational item a BREAKING CHANGE, so the rail is pinned from
    // the C1 side: the unlock surface must not have become the sixth tab. The rail is
    // `TabRail`'s `<nav aria-label="Main">`, which is the only place a tab can be.
    //
    // PRESERVED VERBATIM. The staff-tile step is still not a tab, and adding one would be the
    // same breaking change under the amendment as it was before it.
    const rail = await screen.findByRole("navigation", { name: "Main" });
    const tabs = within(rail).getAllByRole("button");
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) {
      expect(
        /unlock|sign ?in|log ?in|pin|switch user|staff/i.test(tab.textContent ?? ""),
        `the rail carries an unlock tab: "${tab.textContent}"`,
      ).toBe(false);
    }
  });
});

describe("01-F28 / 01-F1 — the PIN goes to main, and NEVER to the ledger", () => {
  it("hands the typed digits to the unlock channel, once", async () => {
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(ZOYA, SHARED_PIN);

    await waitFor(() => expect(unlockCalls).toEqual([{ user_id: ZOYA.user_id, pin: SHARED_PIN }]));
  });

  it("appends nothing carrying the PIN — a ledger entry cannot be redacted later", async () => {
    // TRIPWIRE, and named as one: with the counter unreachable there is nothing on screen that
    // appends, so this passes today by having nothing to catch. It exists because the plausible
    // wrong move is to log the unlock from the renderer — `01-F5`'s `audit.login` is real and
    // it is main's to write (the chain is store-owned). `01-F1` then makes a PIN in that payload
    // permanent: it can be corrected by another event, never removed.
    //
    // Still a tripwire under the amendment, and now it covers a second string: the identified
    // `user_id` is fine in a ledger (it is `02-F41`'s attribution) but the PIN never is.
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(ZOYA, SHARED_PIN);
    await waitFor(() => expect(unlockCalls).toHaveLength(1));

    const written = JSON.stringify({ appended, lines });
    expect(written.includes(SHARED_PIN), "the PIN reached an append").toBe(false);
  });

  it("a REFUSED PIN leaves the device locked, and the till still works", async () => {
    // The security half, and it can fail: an implementation that flips to unlocked on submit
    // and only afterwards checks the answer passes every other test in this file.
    mountWith(null);
    render(<App />);
    await identifyAndEnterPin(ZOYA, WRONG_PIN);
    await waitFor(() => expect(unlockCalls).toEqual([{ user_id: ZOYA.user_id, pin: WRONG_PIN }]));

    for (const name of COUNTER_CONTROLS) {
      expect(
        screen.queryByRole("button", { name }),
        `${name} reachable after a wrong PIN`,
      ).toBeNull();
    }

    // And the refusal did not brick the surface (`01-F17`): the same cashier tries again and
    // gets in. Without this the assertions above are also satisfied by a screen that died.
    await retryPin(ZOYA, SHARED_PIN);
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();
  });
});

describe("01-F26 — idle auto-lock re-gates every surface", () => {
  it("opens straight onto the counter when a session is already in", async () => {
    // The seam is read on the first paint too — a device unlocked before this window mounted
    // (a renderer reload, a crash restart) must not demand the PIN again.
    mountWith(AYESHA);
    render(<App />);
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^unlock$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: ZOYA.display_name })).toBeNull();
  });

  it("a lock decided in main takes the counter off the screen — AFTER a real unlock", async () => {
    // "PIN (Argon2id) unlock on shared devices; idle auto-lock (device-layer setting)" — the
    // lock is a DEVICE-layer fact, so it happens with no unlock call and no tap. A renderer that
    // held its own boolean from `unlock`'s return would stay open all night on an empty counter,
    // and `02-F41` would keep attributing whatever happened next to whoever walked away.
    //
    // THE UNLOCK IS DONE THROUGH THE SURFACE FIRST, and that is the whole test. Mounting an
    // already-unlocked device and then locking it is passed by the very implementation this
    // exists to catch: a local flag that starts `false` agrees with the seam until someone
    // actually unlocks, and only then stops following it. Mutation-checked — an App holding
    // `localUnlocked` alongside the seam survived this test in its first form.
    const h = mountWith(null);
    render(<App />);
    await identifyAndEnterPin(ZOYA, SHARED_PIN);
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();

    h.lockFromMain();

    // Back to identification, not to a pad: the lock returns the device to `01-F61`'s step one.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: ZOYA.display_name })).toBeTruthy(),
    );
    for (const name of COUNTER_CONTROLS) {
      expect(screen.queryByRole("button", { name }), `${name} survived the lock`).toBeNull();
    }
  });
});

/**
 * The one guard in this file that reads source rather than a screen, and it is here because the
 * defect it catches is invisible from the renderer.
 *
 * `main/index.ts` today is `const unlocked = typeof pin === "string" && pin === DEV_PIN` against
 * `DEV_PIN = "1234"` — a device-wide secret that belongs to no user. Every behavioural
 * assertion above is satisfied by that handler as long as the renderer sends the right shape,
 * because the renderer cannot see what main does with it. `01-F61` makes the constant
 * unsurvivable in principle (a PIN that identifies nobody cannot key the per-user counter) and
 * `01-F28` names the replacement: verification against the synced credential hashes.
 *
 * SCOPE, stated so the exemption is visible: this asserts that the dev seed is GONE and that a
 * sanctioned verifier is reached. It does not assert how — `pin-session.ts` and `domain/pin.ts`
 * carry their own suites for the algorithm, the cost floor and the lockout.
 */
/**
 * Resolved from the working directory rather than from `import.meta.url`: this file runs in the
 * happy-dom project, where vitest rewrites `import.meta.url` to a served URL and its `pathname`
 * is `/src/renderer/` — a real directory at the filesystem root on nobody's machine. Both
 * sanctioned invocations (`pnpm -C apps/pos-electron test` and turbo) run in the package
 * directory; the second candidate covers a run from the repo root.
 */
const MAIN_DIR = [
  join(process.cwd(), "src/main"),
  join(process.cwd(), "apps/pos-electron/src/main"),
].find((candidate) => existsSync(candidate));

const walkTs = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walkTs(full);
    return extname(full) === ".ts" && !/\.test\.ts$/.test(full) ? [full] : [];
  });

const mainSource = (): string => {
  // A guard, not a convenience: if the directory cannot be found this guard is VACUOUS, and a
  // vacuous guard is the failure AGENTS.md §C names three times over.
  if (MAIN_DIR === undefined) throw new Error(`src/main not found from ${process.cwd()}`);
  return walkTs(MAIN_DIR)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
};

describe("01-F61 / 01-F28 — no PIN constant survives on the device", () => {
  it("src/main holds no dev PIN seed", () => {
    const source = mainSource();
    // Both the named symbol and the shape, so a rename does not evade it. Nothing legitimate
    // under `src/main` quotes four or more consecutive digits — checked at the time of writing,
    // where `DEV_PIN = "1234"` was the only match in the whole directory.
    expect(/\bDEV_PIN\b/.test(source), "DEV_PIN is still on the device").toBe(false);
    expect(
      /["'`]\d{4,}["'`]/.test(source),
      "a quoted digit literal survives under src/main — a device-wide PIN belongs to no user, " +
        "so 01-F61's per-(device, user) lockout cannot be keyed at all",
    ).toBe(false);
  });

  it("the unlock path reaches the on-device verifier", () => {
    // A disjunction on purpose: `createPinSession` (which owns `01-F61`'s lockout) and
    // `verifyPin` (which owns the Argon2id comparison) are the two shipped ways to satisfy
    // `01-F28`, and the whole of `src/main` is scanned so splitting the wiring into its own
    // module is not penalised.
    expect(
      /\b(createPinSession|verifyPin)\b/.test(mainSource()),
      "no on-device PIN verifier is reached from src/main — `01-F28` puts verification against " +
        "the synced credential hashes, not against a constant",
    ).toBe(true);
  });
});
