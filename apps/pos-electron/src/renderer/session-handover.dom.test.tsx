// ACCEPTANCE TESTS — `02-F54`: a cashier ENDS her own session, and a handover stops writing
// the outgoing cashier's name into an append-only ledger.
//
// PROVENANCE (`24 §3` step 2): authored from spec text by the test-authoring session for the
// August 2026 dress rehearsal. **Committed RED**, against a counter on which no sign-out or lock
// control exists anywhere. The FRs read for this file, and nothing else:
//
//   02-F54  a cashier ends her own session with one visible control; it is a control and not a
//           surface and not an event; reachable from the shipped rail with `27-F4` untouched;
//           it is NOT a shift close and does not imply one; it never blocks and never asks a
//           question. (Written for this defect — see this file's §0 for the measurement.)
//   02-F18  per-user PIN login on every device; idle auto-lock (device-layer timeout). **No
//           anonymous mode exists; a locked device shows only the unlock screen.**
//   02-F41  attribution is whoever's PIN is in, with no "acting for" concept.
//   01-F1   append-only; corrections are new linked events. A wrong `actor_user_id` is
//           PERMANENT and is not correctable in place.
//   01-F26  PIN unlock on shared devices; **idle** auto-lock as a device-layer setting.
//   01-F61  the unlock surface identifies the user first, then takes the PIN; `C1` runs 20–60×
//           a shift.
//   02-F11  open orders are BRANCH-wide, so nothing operational is owned by a session.
//   02-F51  (a) recall is how a terminal chooses an order it is not already on.
//   01-F17  a sale is never blocked.
//   27-F4   the rail is positional memory — adding a tab is a breaking change.
//   27-F5   every action has a persistent, visible, labelled target.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// §0 — THE MEASUREMENT THIS FILE EXISTS FOR (observed on a running till, August 2026)
//
// A dress rehearsal drove the shipped counter over CDP and looked for the control a cashier
// uses at a handover. There is none: `Counter.tsx` renders no sign-out, no lock and no
// end-of-session control on any of its six surfaces, and `01-F26`'s idle auto-lock is the only
// exit — at ten minutes. `02-F41` then does exactly what it says: every `order.created`,
// `payment.recorded` and `cash.paid_out` the ARRIVING cashier makes in that window carries the
// LEAVING cashier's `actor_user_id`, and `01-F1` makes each one permanent.
//
// 4375 green tests could not see it. Nothing in this repo asserted that a session can be ended
// on purpose, because the seam that ends it (`DeviceState.user` going null) already existed and
// was already tested — from the idle timer's side. That is this wave's named defect wearing a
// UI costume: a correct subsystem with no way for the product to enter the state that uses it.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE PINS THAT THE FRs DO NOT — declared, not discovered
//
// A screen test cannot be written without naming a seam and some words. Three things below are
// this oracle's choice, each with the reason it is not arbitrary. If the implementer needs any
// of them different, that is a FINDING FOR THIS SESSION — not an edit to this file (`24 §3`
// step 2, `.claude/rules/tests-and-conformance.md`).
//
//  1. **One new bridge write: `window.restos.lock(): Promise<void>`.** Symmetric with the
//     `unlock(user_id, pin)` that already ships, and named for the state `shared/ipc.ts` already
//     documents (`DeviceState.user` — *"`null` is LOCKED"*). It is NOT an append: `02-F54`
//     forbids a new `01 §4` type, and `01-F5`'s `audit.login` is main's to write against a
//     store-owned chain. Main ends the session and pushes `changed`; the renderer learns nothing
//     from the call but that it returned.
//  2. **The control is found by a PERMISSIVE vocabulary, never by one word.** No FR fixes the
//     label, and `00 §5.6` fixes only that it is English. A test pinning "Sign out" would block a
//     correct implementation that shipped "Lock". What is asserted is that SOME persistent,
//     visible, labelled control on the shipped rail ends the session (`27-F5`).
//  3. **The rail is asserted by its six known labels in order.** `27-F4` makes a seventh tab a
//     breaking change, and "add a Sign out tab" is the tempting shape this pins against.
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// EVERY SECTION IS AIMED AT A PLAUSIBLE WRONG IMPLEMENTATION (the round-3 law). The mutants:
//
//   §A  no control at all — the shipped state.
//   §B  a control that renders and calls nothing; a control that sets a RENDERER flag instead of
//       moving the seam (defeated here because lock state is read from `deviceState()` only).
//   §C  **THE DANGEROUS CASE, and the only one that costs money.** A full handover: Ayesha signs
//       out, Bilal unlocks, Bilal rings and settles. Every envelope of Bilal's run must carry
//       Bilal. §H is its CONTROL — with no sign-out the same run carries Ayesha — so a green §C
//       cannot be an accident of the fixture.
//   §D  a sign-out that appends something (a new event type, commandment 2).
//   §E  a sign-out that closes the shift, or one refused until the shift is closed.
//   §F  a sign-out that blocks on an open order, discards it, or asks a question first.
//   §G  a sign-out shipped as a seventh tab (`27-F4`).

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AddLineRequest,
  AppendRequest,
  DeviceState,
  MenuItem,
  OpenOrder,
  RosterMember,
} from "../shared/ipc";
import { App } from "./App";

afterEach(cleanup);

/** happy-dom performs no layout, so the measured grid would never render. See `counter.dom.test.tsx`. */
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

const AYESHA: RosterMember = { user_id: "user-ayesha", display_name: "Ayesha", role: "cashier" };
const BILAL: RosterMember = { user_id: "user-bilal", display_name: "Bilal", role: "cashier" };
const ROSTER: RosterMember[] = [AYESHA, BILAL];
const PINS: Record<string, string> = {
  [AYESHA.user_id]: "371940",
  [BILAL.user_id]: "512837",
};

const MENU: MenuItem[] = [{ id: "item-karahi", label: "Karahi" }];

/**
 * `27-F4` — the rail this product shipped, in the order it shipped it. A seventh entry here is
 * the breaking change that FR requires a PR justification for, and "put Sign out on the rail" is
 * exactly the shape that would produce one by accident.
 */
const RAIL = ["Order", "Orders", "Pay", "Cash", "Me", "Sold out"];

/**
 * The vocabulary a cashier would recognise for "end my session". Permissive on purpose (see the
 * header): `00 §5.6` fixes English and no FR fixes the word.
 *
 * `\block\b` and not `/lock/`, so `Unlock` — the control on the OTHER side of this gate — can
 * never satisfy it.
 */
const SESSION_END =
  /\bsign[\s-]?out\b|\blog[\s-]?out\b|\block\b|\bend (my )?session\b|\bhand[\s-]?over\b/i;

const nameOf = (el: Element): string =>
  el.getAttribute("aria-label") ?? (el.textContent ?? "").trim();

type Recorded = AppendRequest & { readonly actor_user_id: string | null };

let appended: Recorded[];
let lines: (AddLineRequest & { readonly actor_user_id: string | null })[];
let lockCalls: number;
let unexpectedBridgeCalls: string[];

/**
 * The bridge, with MAIN's half of the session modelled honestly.
 *
 * The one thing that makes §C a real measurement rather than a shape check: every write is
 * stamped with the bridge's OWN live session, exactly as `main/gateway.ts` does
 * (`actor_user_id: deps.session()?.user_id ?? null`, unconditionally, at the append). So a
 * renderer that ends the session correctly produces envelopes naming the arriving cashier, and
 * one that does not produces envelopes naming the cashier who left — which is the defect, and it
 * is measured on the envelope rather than inferred from a control's existence.
 *
 * `lock` is modelled as main would: end the session, then push `changed`. It returns nothing the
 * renderer could use to decide lock state, because `02-F18`/`App.tsx` put that decision in
 * `deviceState()` alone and `01-F26`'s idle timer fires with no call in sight.
 */
const mountWith = (start: RosterMember | null, initialOrders: readonly OpenOrder[] = []) => {
  appended = [];
  lines = [];
  lockCalls = 0;
  unexpectedBridgeCalls = [];
  let user: RosterMember | null = start;
  let orders: OpenOrder[] = [...initialOrders];
  const listeners = new Set<() => void>();
  const push = () => {
    for (const fn of listeners) fn();
  };
  const known: Record<string, unknown> = {
    deviceState: vi.fn(
      async (): Promise<DeviceState> => ({
        actor: user?.display_name ?? "Counter 1",
        deviceLabel: "Counter 1",
        businessDay: "2026-08-14",
        training: false,
        lan: "ok",
        hub: "ok",
        cloud: "down",
        blocked: null,
        user: user === null ? null : { user_id: user.user_id, display_name: user.display_name },
      }),
    ),
    openOrders: vi.fn(async () => [...orders]),
    kitchenQueue: vi.fn(async () => []),
    menu: vi.fn(async () => MENU),
    staff: vi.fn(async () => ROSTER),
    cashState: vi.fn(async () => ({
      shifts: [],
      days: [],
      unbound: [],
      unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
    })),
    alarms: vi.fn(async () => []),
    quickTags: vi.fn(async () => []),
    append: vi.fn(async (req: AppendRequest) => {
      appended.push({ ...req, actor_user_id: user?.user_id ?? null });
      // Main's fold moves for the two payloads this file drives, so the surface can see its own
      // work. Nothing else is modelled: this is not a fold test.
      const payload = req.payload as Record<string, unknown>;
      if (req.type === "order.created" && typeof payload.order_id === "string") {
        orders = [
          ...orders,
          {
            order_id: payload.order_id,
            reference: payload.order_id,
            total_paisa: 0,
            paid_paisa: 0,
            lines: [],
            channel: payload.channel as OpenOrder["channel"],
            order_type: payload.order_type as string,
            confirmed_at: null,
            settled: 0,
          },
        ];
      }
      push();
      return { id: `evt-${appended.length}` };
    }),
    addLine: vi.fn(async (req: AddLineRequest) => {
      lines.push({ ...req, actor_user_id: user?.user_id ?? null });
      return { id: `evt-line-${lines.length}` };
    }),
    unlock: vi.fn(async (user_id: string, pin: string) => {
      const member = ROSTER.find((m) => m.user_id === user_id) ?? null;
      const ok = member !== null && PINS[member.user_id] === pin;
      if (ok) {
        user = member;
        push();
      }
      return { unlocked: ok };
    }),
    /**
     * THE CHANNEL THIS FILE DEFINES (`02-F54`). Main ends the session and pushes; there is no
     * append, because a session end is not an `01 §4` fact and inventing one would be
     * commandment 2 broken on a gesture that happens 20–60 times a shift.
     */
    lock: vi.fn(async () => {
      lockCalls += 1;
      user = null;
      push();
    }),
    onChanged: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
  };
  // A member the screen reaches for that this harness does not know is RECORDED rather than
  // thrown, so a missing seam is a named finding instead of an unhandled rejection that React 19
  // turns into a blank till. Copied from `cash-tab.dom.test.tsx`, which paid for it.
  const bridge = new Proxy(known, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      unexpectedBridgeCalls.push(prop);
      return async () => undefined;
    },
    has: () => true,
  });
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return {
    /** What main does on `01-F26`'s idle auto-lock: end the session and push. No call involved. */
    idleAutoLock: () => {
      user = null;
      push();
    },
    sessionNow: () => user,
  };
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const railButtons = (): HTMLButtonElement[] => {
  const rail = document.querySelector('nav[aria-label="Main"]');
  return [...(rail?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];
};

const railLabels = (): string[] =>
  railButtons().map((b) => (b.querySelector("span")?.textContent ?? "").trim());

const goToTab = async (label: string) => {
  const tab = railButtons().find(
    (b) => (b.querySelector("span")?.textContent ?? "").trim() === label,
  );
  if (tab === undefined || tab.disabled) return false;
  fireEvent.click(tab);
  await waitFor(() =>
    expect(
      railButtons()
        .find((b) => (b.querySelector("span")?.textContent ?? "").trim() === label)
        ?.getAttribute("aria-current"),
    ).toBe("page"),
  );
  return true;
};

/**
 * Walk the shipped rail looking for the session-end control.
 *
 * The walk starts on `Order` — where a persistent control would be — and covers every surface,
 * because `02-F54` says "reachable from the shipped rail" and does not say from which surface.
 * The rail buttons themselves are excluded: a TAB is what §G forbids.
 */
const findSessionEnd = async (): Promise<{ surface: string; control: HTMLElement } | null> => {
  const rail = new Set<Element>(railButtons());
  for (const surface of RAIL) {
    if (!(await goToTab(surface))) continue;
    const hit = screen
      .queryAllByRole("button")
      .find((b) => !rail.has(b) && SESSION_END.test(nameOf(b)));
    if (hit !== undefined) return { surface, control: hit as HTMLElement };
  }
  return null;
};

const requireSessionEnd = async (): Promise<{ surface: string; control: HTMLElement }> => {
  const found = await findSessionEnd();
  expect(
    found,
    "02-F54 / 27-F5 — no persistent, visible, labelled control on any shipped surface ends the session. " +
      "A handover therefore attributes the arriving cashier's whole run to the cashier who left (02-F41, 01-F1).",
  ).not.toBeNull();
  return found as { surface: string; control: HTMLElement };
};

const endSession = async () => {
  const { control } = await requireSessionEnd();
  fireEvent.click(control);
};

/**
 * `01-F61`'s identification tile, matched by NAME PREFIX.
 *
 * `PersonTile`'s accessible name is `"Ayesha — Cashier"` (the display name plus the `01-F26`
 * role that `RosterMember` projects), so an exact-string query finds nothing at all and the
 * failure reads as a missing tile rather than a differently-labelled one.
 */
const personTile = (who: RosterMember) => new RegExp(`^${who.display_name}\\b`);

/** `01-F61`'s two steps, in the order the FR fixes: identify, then take the PIN. */
const unlockAs = async (who: RosterMember) => {
  fireEvent.click(await screen.findByRole("button", { name: personTile(who) }));
  for (const digit of PINS[who.user_id] as string) {
    fireEvent.click(await screen.findByRole("button", { name: digit }));
  }
  fireEvent.click(await screen.findByRole("button", { name: /^unlock$/i }));
  await screen.findByRole("button", { name: /^Dine-in$/i });
};

/** `C4` — a channel, then a type. `02-F1` requires both axes at creation. */
const startAnOrder = async () => {
  fireEvent.click(await screen.findByRole("button", { name: /^In restaurant$/i }));
  fireEvent.click(await screen.findByRole("button", { name: /^Dine-in$/i }));
  await waitFor(() => expect(appended.some((a) => a.type === "order.created")).toBe(true));
};

const anOpenOrder = (order_id: string): OpenOrder => ({
  order_id,
  reference: order_id,
  total_paisa: 45_000,
  paid_paisa: 0,
  lines: [],
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: null,
  settled: 0,
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE DEFECT, REPRODUCED. Read this section before any other.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F54 — the control exists at all", () => {
  it("some shipped surface carries a persistent, visible, labelled way to end the session", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    await requireSessionEnd();
  });

  it("27-F5 — it is a control on a surface, never a hold, a menu or a gesture", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    const { control } = await requireSessionEnd();
    // `27-F5` bans the invisible control. A `<button>` that is present, has a name, and is not
    // `disabled` is the whole of what that FR asks for at this level.
    expect(control.tagName.toLowerCase()).toBe("button");
    expect(nameOf(control).length, "27-F5 — the target must be LABELLED").toBeGreaterThan(0);
    expect(
      (control as HTMLButtonElement).disabled,
      "27-F5 / 01-F17 — the one control that protects attribution may never be inert",
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — IT ENDS THE SESSION, and the seam is the one the idle timer already moves.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F54 / 02-F18 — pressing it locks the device", () => {
  it("moves the session seam and leaves the unlock surface, with nothing operational behind it", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    await endSession();

    // `02-F18`: "a locked device shows only the unlock screen". Not greyed — ABSENT.
    await screen.findByRole("button", { name: personTile(AYESHA) });
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Dine-in$/i })).toBeNull());
    for (const name of [/^In restaurant$/i, /Send to kitchen/i, /^Karahi$/i]) {
      expect(screen.queryByRole("button", { name }), `${name} reachable while locked`).toBeNull();
    }
  });

  it("ends the session THROUGH THE SEAM, not through a renderer flag", async () => {
    const h = mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    await endSession();
    await screen.findByRole("button", { name: personTile(AYESHA) });

    // The mutant this kills: a control that flips a local `locked` boolean. The screen would look
    // right and `main` would still hold the session — so `gateway.ts` would go on stamping
    // Ayesha into every envelope the next cashier produces, which is the whole defect with a
    // convincing screen in front of it.
    expect(
      lockCalls,
      "02-F54 — the session must END in main; a renderer that only re-renders has changed nothing " +
        "about `actor_user_id` (02-F41, 01-F1)",
    ).toBe(1);
    expect(h.sessionNow()).toBeNull();
  });

  it("does not invent a second seam for a fact `deviceState()` already carries", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });
    await endSession();
    await screen.findByRole("button", { name: personTile(AYESHA) });

    expect(
      unexpectedBridgeCalls,
      "18 §9 — a bridge member this contract does not declare was reached",
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE DANGEROUS CASE. A handover, measured on the envelope. §H is its control.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F41 / 01-F1 — after a handover the ledger names the cashier who is standing there", () => {
  it("Ayesha signs out, Bilal unlocks, and every one of Bilal's writes carries Bilal", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    // Ayesha's shift: one order, so the fixture is not measuring an empty run.
    await startAnOrder();
    const ayeshasWrites = appended.length;
    expect(ayeshasWrites).toBeGreaterThan(0);
    expect(appended.every((a) => a.actor_user_id === AYESHA.user_id)).toBe(true);

    // THE HANDOVER.
    await endSession();
    await screen.findByRole("button", { name: personTile(BILAL) });
    await unlockAs(BILAL);

    // Bilal's run.
    await startAnOrder();
    fireEvent.click(await screen.findByRole("button", { name: /^Karahi$/i }));
    await waitFor(() => expect(lines.length).toBeGreaterThan(0));

    const bilalsWrites = [...appended.slice(ayeshasWrites), ...lines];
    expect(
      bilalsWrites.length,
      "the second cashier must actually have written something",
    ).toBeGreaterThan(1);
    for (const w of bilalsWrites) {
      expect(
        w.actor_user_id,
        `01-F1 — a permanent, uncorrectable envelope attributing Bilal's work to ${w.actor_user_id}`,
      ).toBe(BILAL.user_id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — IT IS NOT AN EVENT (commandment 2, `02-F54`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F54 / commandment 2 — ending a session appends NOTHING", () => {
  it("writes no event of any type, and mints no new one", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });
    const before = appended.length;

    await endSession();
    await screen.findByRole("button", { name: personTile(AYESHA) });

    // `01 §4` is a closed catalog. A `session.ended` — or any other invention — would be a
    // permanent row on a gesture that happens 20–60 times a shift, and `01-F5`'s `audit.login`
    // is main's to write against a store-owned chain, never the renderer's.
    expect(
      appended.slice(before).map((a) => a.type),
      "02-F54 — a session end is not a ledger fact in this product",
    ).toEqual([]);
    expect(lines).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — IT IS NOT A SHIFT CLOSE, in either direction (`02-F54`, `02-F23`, `02-F43`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 02-F54 — ending a session neither closes a shift nor waits for one", () => {
  it("appends no shift.closed and no day.closed", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    await endSession();
    await screen.findByRole("button", { name: personTile(AYESHA) });

    // The mutant: a sign-out that "tidies up" by closing the shift. `02-F23`'s close carries a
    // count, an expectation and a variance — none of which exist when a cashier locks the till
    // to answer the door — so it would file a variance nobody counted (`02-F56`), attributed
    // (`02-F41`) and permanent (`01-F1`).
    expect(appended.map((a) => a.type)).not.toContain("shift.closed");
    expect(appended.map((a) => a.type)).not.toContain("day.closed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — IT NEVER BLOCKS AND NEVER ASKS (`01-F17`, `02-F37`, `02-F11`, `02-F51`).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F17 — an open order does not stop the lock, and the lock does not lose the order", () => {
  it("locks with an unconfirmed order open, and the order is still there for the next cashier", async () => {
    mountWith(AYESHA, [anOpenOrder("order-open-1")]);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    // The control is live WITH work in progress. A sign-out gated on "no open order" is a till
    // that cannot hand over during service, which is the only time a handover happens.
    const { control } = await requireSessionEnd();
    expect(
      (control as HTMLButtonElement).disabled,
      "01-F17 — the session-end control is refused while an order is open",
    ).toBe(false);

    fireEvent.click(control);
    await screen.findByRole("button", { name: personTile(AYESHA) });

    // No confirmation step (`02-F37`): the device is LOCKED now, not asking. If a dialog stood
    // between the press and the lock, the staff grid would not be on screen.
    expect(lockCalls).toBe(1);

    // `02-F11` — the order is the BRANCH's, not the session's. It survives, and `02-F51`'s
    // recall is how the arriving cashier reaches it.
    await unlockAs(BILAL);
    expect((await window.restos.openOrders()).map((o) => o.order_id)).toContain("order-open-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — `27-F4`: the rail does not grow a seventh item to hold this.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 27-F4 — the control is on a surface, not a new tab", () => {
  it("the rail carries exactly the six shipped tabs, in order, before and after the control exists", async () => {
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    expect(
      railLabels(),
      "27-F4 — adding, removing or reordering an operational item is a BREAKING CHANGE; a " +
        "session-end control belongs inside a surface that already exists",
    ).toEqual(RAIL);

    const { surface } = await requireSessionEnd();
    expect(RAIL, `the control was found on "${surface}", which is not a shipped surface`).toContain(
      surface,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §H — THE CONTROL for §C, and the reason §C is not vacuous.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§H the measured cost of NOT ending the session", () => {
  it("without the sign-out, the same handover attributes the incoming work to the outgoing cashier", async () => {
    // One branch different from §C: nobody presses anything: the till is simply handed over.
    // This is the shipped product, and it must go on being true, or §C proves nothing about the
    // control and everything about the fixture.
    mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    await startAnOrder();
    fireEvent.click(await screen.findByRole("button", { name: /^Karahi$/i }));
    await waitFor(() => expect(lines.length).toBeGreaterThan(0));

    expect([...appended, ...lines].every((w) => w.actor_user_id === AYESHA.user_id)).toBe(true);
  });

  it("01-F26's idle auto-lock still works and is still not a substitute for the control", async () => {
    // PRESERVED behaviour: main can end the session with no call and no tap, and the screen must
    // follow. `02-F54` adds a way for the OPERATOR to decide it; it does not replace the timer.
    const h = mountWith(AYESHA);
    render(<App />);
    await screen.findByRole("button", { name: /^Dine-in$/i });

    h.idleAutoLock();
    await screen.findByRole("button", { name: personTile(AYESHA) });
    expect(lockCalls, "the idle path calls nothing — it is main's own decision").toBe(0);
  });
});
