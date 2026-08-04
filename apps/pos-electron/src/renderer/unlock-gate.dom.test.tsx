// ACCEPTANCE TESTS — S-0c, renderer half: `C1`, the unlock surface.
//
// PROVENANCE (24 §3 step 2): written from spec text by a session that has seen no
// implementation of these FRs and did not write the plan. Sources: `01-F26` (PIN unlock on
// shared devices, idle auto-lock), `01-F28` (verification is on-device), `02-F41` (attribution
// is whoever's PIN is in), `01-F1` (the ledger is permanent), `18 §6`/`18 §9` (the renderer
// reads through one bridge), `27-F4` (positional memory), `plans/wave-1/screen-map.md §3.1`.
// Committed RED.
//
// WHY `C1` HAS NO HOME: the screen map records it explicitly — *"`C1` (unlock with PIN) is
// deliberately absent from the rail. It is not a tab: it gates every surface 20-60x a shift, so
// it is a lock surface over the whole app. No screen in this map owns it yet."* A surface that
// is entered dozens of times a shift and owns no screen is the one most likely to be built as a
// sixth tab, which `27-F4` makes a breaking change to every operator who already learned five.
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
//   window.restos.unlock(pin: string) => Promise<{ unlocked: boolean }>
//
//     `01-F28` verification is on-device and belongs to main (S-0b); the renderer hands over
//     digits and is told yes or no. It is NOT an append: `01-F1` makes a PIN written into an
//     event permanent and unredactable.
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
// OUT OF SCOPE, deliberately: how the PIN is hashed or compared (S-0b), what `audit.login`
// carries (S-0b, `01-F5`), the permission matrix (S-0a). Nothing here asserts any of them.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
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

const AYESHA = { user_id: "user-ayesha", display_name: "Ayesha" };

/** Distinctive on purpose: every assertion below searches for these digits by value. */
const PIN = "846201";
const WRONG_PIN = "111111";

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
let unlockCalls: string[];

/**
 * The bridge, with main's half of the session modelled honestly: `unlock` verifies, SETS the
 * session, and pushes `changed` — which is what `main/index.ts` already does around every other
 * write ("the push carries no data — main says the folds moved and the renderer re-reads").
 *
 * Written so that BOTH plausible renderer designs pass: one that re-reads `deviceState()` when
 * `unlock` resolves, and one that waits for the `changed` push. What neither may do is decide
 * lock state from `unlock`'s return alone and keep it — `01-F26`'s idle auto-lock happens with
 * no unlock call in sight, and the last test in this file is where that shows.
 */
const mountWith = (start: DeviceState["user"]) => {
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
    append: vi.fn(async (req: AppendRequest) => {
      appended.push(req);
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push(req);
      return { id: `evt-line-${lines.length}` };
    }),
    unlock: vi.fn(async (pin: string) => {
      unlockCalls.push(pin);
      const ok = pin === PIN;
      if (ok) {
        user = AYESHA;
        push();
      }
      return { unlocked: ok };
    }),
    onChanged: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return {
    bridge,
    /** What main does on an idle auto-lock (`01-F26`): end the session and push. */
    lockFromMain: () => {
      user = null;
      push();
    },
  };
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

/** Type the PIN on the surface's own keys and confirm it. */
const enterPin = async (pin: string) => {
  for (const digit of pin) {
    fireEvent.click(await screen.findByRole("button", { name: digit }));
  }
  fireEvent.click(await screen.findByRole("button", { name: /^unlock$/i }));
};

/** The counter's operational controls, by the names `counter.dom.test.tsx` already pins. */
const COUNTER_CONTROLS = [/^Dine-in$/i, /^Takeaway$/i, /^Delivery$/i, /Send to kitchen/i];

describe("01-F26 — a locked device shows the unlock surface and NOTHING operational", () => {
  it("no order can be started, sent or added to while the device is locked", async () => {
    mountWith(null);
    render(<App />);

    // The surface itself is up — a locked till that renders nothing is indistinguishable from
    // a crashed one to an operator who has seen one.
    expect(await screen.findByRole("button", { name: /^unlock$/i })).toBeTruthy();

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

  it("offers a numeric pad — every digit, so any PIN can be entered", async () => {
    // `27-F6`: no operational role is ever required to type non-numeric text on a critical
    // path, and unlocking is the most critical path there is — it gates every other one.
    mountWith(null);
    render(<App />);
    await screen.findByRole("button", { name: /^unlock$/i });

    for (const digit of "0123456789") {
      expect(
        screen.getByRole("button", { name: digit }),
        `the pad has no ${digit} key`,
      ).toBeTruthy();
    }
  });
});

describe("C1 is NOT a tab (screen-map §3.1, 27-F4)", () => {
  it("unlocking reveals the counter with its FIVE surfaces — not six", async () => {
    mountWith(null);
    render(<App />);
    await enterPin(PIN);

    // The counter is now reachable. This is also the positive control for the locked-state
    // assertions above: they would pass against an App that renders nothing, ever.
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();

    // `27-F4` makes adding an operational item a BREAKING CHANGE, so the rail is pinned from
    // the C1 side: the unlock surface must not have become the sixth tab. The rail is
    // `TabRail`'s `<nav aria-label="Main">`, which is the only place a tab can be.
    const rail = await screen.findByRole("navigation", { name: "Main" });
    const tabs = within(rail).getAllByRole("button");
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) {
      expect(
        /unlock|sign ?in|log ?in|pin|switch user/i.test(tab.textContent ?? ""),
        `the rail carries an unlock tab: "${tab.textContent}"`,
      ).toBe(false);
    }
  });
});

describe("01-F28 / 01-F1 — the PIN goes to main, and NEVER to the ledger", () => {
  it("hands the typed digits to the unlock channel, once", async () => {
    mountWith(null);
    render(<App />);
    await enterPin(PIN);

    await waitFor(() => expect(unlockCalls).toEqual([PIN]));
  });

  it("appends nothing carrying the PIN — a ledger entry cannot be redacted later", async () => {
    // TRIPWIRE, and named as one: with the counter unreachable there is nothing on screen that
    // appends, so this passes today by having nothing to catch. It exists because the plausible
    // wrong move is to log the unlock from the renderer — `01-F5`'s `audit.login` is real and
    // it is main's to write (the chain is store-owned). `01-F1` then makes a PIN in that payload
    // permanent: it can be corrected by another event, never removed.
    mountWith(null);
    render(<App />);
    await enterPin(PIN);
    await waitFor(() => expect(unlockCalls).toHaveLength(1));

    const written = JSON.stringify({ appended, lines });
    expect(written.includes(PIN), "the PIN reached an append").toBe(false);
  });

  it("a REFUSED PIN leaves the device locked", async () => {
    // The security half, and it can fail: an implementation that flips to unlocked on submit
    // and only afterwards checks the answer passes every other test in this file.
    mountWith(null);
    render(<App />);
    await enterPin(WRONG_PIN);
    await waitFor(() => expect(unlockCalls).toEqual([WRONG_PIN]));

    expect(await screen.findByRole("button", { name: /^unlock$/i })).toBeTruthy();
    for (const name of COUNTER_CONTROLS) {
      expect(
        screen.queryByRole("button", { name }),
        `${name} reachable after a wrong PIN`,
      ).toBeNull();
    }
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
    await enterPin(PIN);
    expect(await screen.findByRole("button", { name: /^Takeaway$/i })).toBeTruthy();

    h.lockFromMain();

    await waitFor(() => expect(screen.getByRole("button", { name: /^unlock$/i })).toBeTruthy());
    for (const name of COUNTER_CONTROLS) {
      expect(screen.queryByRole("button", { name }), `${name} survived the lock`).toBeNull();
    }
  });
});
