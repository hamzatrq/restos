// ACCEPTANCE TESTS — `03-F53` ON THE SCREEN: the door that does not cover the queue.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author wrote no production code for
// `03-F53`. The shared contract is written out in `../main/__acceptance__/pass-identity.test.ts`;
// what this file adds is the renderer half of it. Committed RED.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FR, quoted, because the reasoning is the contract:
//
//   03-F53  "**The queue itself is never gated, and this is where the pass parts company with the
//           till.** `02-F18`'s *'no anonymous mode exists; a locked device shows only the unlock
//           screen'* is doc 02's rule for the device that holds the drawer. This surface shows no
//           money at all (`03-F32`), no ETA (`03 §3`), and can make no claim but a state one — and
//           its whole purpose is to be READ … Gating that behind a PIN turns a roster this device
//           has not yet synced into a kitchen that cannot see its own tickets — `01-F17`'s stopped
//           till, on the surface where commandment 4 binds hardest. Identification is charged on
//           the act and never on the look."
//
//   03-F53  "A press with nobody signed in raises `01-F61`'s two steps — the fixed grid of staff
//           tiles, then the PIN — and nothing is appended until one succeeds."
//
//   03-F53  "**A refusal says WHICH refusal.** Being locked out is distinguishable on the glass
//           from a PIN that was simply wrong, and a device whose registry is empty says so rather
//           than drawing an empty grid (`00 §5.7`). A cook who cannot tell those apart re-keys
//           instead of fetching a colleague, and that is the one behaviour that turns a
//           five-minute cooldown into a stopped pass."
//
//   01-F61  "**The unlock surface IDENTIFIES THE USER FIRST, then takes the PIN.** A bare PIN pad
//           that matches the entry against every staff hash on the device is the tempting shape …
//           **The identification step must not be a text list** — `27-F6` forbids requiring typing
//           and the cashier is plausibly a non-reader (`21 §5`), so it is a fixed grid of staff
//           tiles whose **positions never move** (`27-F4`)."
//   01-F61  "**Selecting a person is not submitting an attempt.** … tapping a different tile before
//           submit costs nothing."
//   02-F19  "Every action is attributed" — the strip names who is acting, and it is never a
//           stand-in (`01-F27`: a device identity may not stand in for a user identity).
//   01-F17  nothing is blocked: backing out of the door leaves the kitchen exactly as it was.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RENDERER CONTRACT THIS FILE ADDS (the main-side half is in the node oracle):
//
//   PassStateWire.user: { user_id: string; display_name: string } | null      ← NEW. null = OUT.
//
//     A field on `passState` and not a channel of its own, which is the OPPOSITE of the choice
//     `apps/pos-electron` made for `staff()` — and the difference is argued rather than copied.
//     There, the roster rides its own channel because `DeviceState` is re-read on every append.
//     Here the SESSION rides `passState` because `passState` is already re-read on every
//     `changed` push, `main/uplink.ts` fires one **every second** so the age colours move, and a
//     session decided in main (idle auto-lock) must reach the glass on exactly that push. The
//     ROSTER still takes its own channel, for `apps/pos-electron`'s reason unchanged: it is
//     reference data (`01-F21`), it changes when somebody is hired, and it has no business on a
//     one-second read.
//
//     `PassStateWire.actor` is untouched and still names the DEVICE (`01-F27`).
//
//   PassBridge.roster: () => Promise<{ user_id: string; display_name: string }[]>   ← NEW
//   PassBridge.unlock: (user_id: string, pin: string) =>
//                        Promise<{ ok: true; user_id: string } | { ok: false; reason: string }>
//
//     Positional and in this order, matching `createPinSession.unlock(user_id, pin)` and the
//     counter's own bridge. **The refusal REASON crosses the plane here and does not on the
//     counter**, and that is `03-F53`'s "a refusal says which refusal": a cook who cannot tell a
//     lockout from a typo re-keys instead of fetching a colleague. It carries no `pin_hash`
//     (`01-F28` puts verification in main) and no role — the pass authorizes nothing off it.
//
//   MarkReadyResult / HandOverResult gain `reason: "no_session"`.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ HOW THIS FILE AVOIDS PINNING SHAPE. `03-F53` fixes an ORDER (identify, then PIN) and a set of
// OUTCOMES; it fixes no wording, no component and no layout. So nothing below matches a label for
// the door itself, a test id or a class. Refusal honesty is measured by DIFFING the words on the
// glass between two refusals rather than by matching a sentence, which stays green under any
// phrasing and still fails an implementation that says the same thing to both.
//
// ⚠ WHAT IT CANNOT SEE, stated so a clean run is not read as coverage. happy-dom performs NO
// LAYOUT: every `getBoundingClientRect` is zeroes. This file can say "the tile is in the document"
// and never "the tile is on the screen" — `AGENTS.md`'s second recurring defect, nine instances,
// zero of them found by a suite. A PIN pad that renders below the viewport on the 10.1″ panel
// passes every row here. That claim belongs to `pnpm -C apps/pass-kds layout:check`, and its
// FIXTURE is its real coverage boundary — so the gate must be made to OPEN this door, exactly as
// `apps/pos-electron`'s was blind to `ManagerApproval`'s dead controls until its fixture returned
// an offer.

import { targetFor } from "@restos/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HandOverResult,
  MarkReadyResult,
  PassBridge,
  PassStateWire,
  PassTicketWire,
} from "../shared/ipc";
import { App } from "./App";

const BIG_PANEL = { width: 2000, height: 2000 } as DOMRectReadOnly;

class StubResizeObserver {
  constructor(private cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: BIG_PANEL } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const ORDER = "0199cccc-0000-7000-8000-00000000abcd";
const REFERENCE = ORDER.slice(0, 8);

/**
 * The two cooks.
 *
 * **The supplied order is neither alphabetical nor sorted by id** — `27-F4` bans reordering an
 * operational grid, and a fixture whose order happens to equal a sort cannot tell a renderer that
 * preserves main's order from one that re-derives it. `ZUBAIR` is last alphabetically and first by
 * id; he is supplied in the middle.
 */
const SAJID = { user_id: "0199bbbb-0000-7000-8000-00000000c001", display_name: "Sajid" };
const ZUBAIR = { user_id: "0199bbbb-0000-7000-8000-00000000a001", display_name: "Zubair" };
const IMRAN = { user_id: "0199bbbb-0000-7000-8000-00000000c002", display_name: "Imran" };
const ROSTER = [SAJID, ZUBAIR, IMRAN];
const NAMES = ROSTER.map((m) => m.display_name);

const SAJID_PIN = "846201";
/** Begins with `0` — the digit `packages/ui`'s `NumericKeypad.acceptKeystroke` silently eats. */
const IMRAN_PIN = "046201";
const WRONG_PIN = "111111";
const PINS: Record<string, string> = {
  [SAJID.user_id]: SAJID_PIN,
  [ZUBAIR.user_id]: "372845",
  [IMRAN.user_id]: IMRAN_PIN,
};

const TICKET: PassTicketWire = {
  order_id: ORDER,
  reference: REFERENCE,
  channel: "counter",
  order_type: "dine_in",
  tables: ["4"],
  table_conflict: false,
  confirm_at: 1_754_300_000_000,
  minutes: 4,
  amberAt: 10,
  redAt: 20,
  lines: [{ line_id: "L0", name: "Karahi", quantity: 1, state: "in_prep", done: false }],
  linesDone: 0,
  linesTotal: 1,
  bumpable: true,
  handoverable: true,
};

const baseState = (user: PassStateWire["user"]): PassStateWire => ({
  deviceLabel: "Pass",
  // `01-F27` — the DEVICE's own name. It never becomes a person, signed in or not.
  actor: "Pass",
  businessDay: "2026-08-12",
  lan: "ok",
  hub: "ok",
  cloud: "down",
  panelPpi: 100.5,
  panelFit: null,
  maySignal: true,
  readySignalOwner: "pass",
  mayHandOver: true,
  serveSignalOwner: "pass",
  user,
});

type Options = {
  /** Who is signed in when the screen mounts. */
  user?: PassStateWire["user"];
  roster?: { user_id: string; display_name: string }[];
  /** Force every unlock to this refusal, whatever was keyed — for the lockout row. */
  refuseWith?: string;
  tickets?: PassTicketWire[];
};

let unlockCalls: { user_id: string; pin: string }[];
let markReadyCalls: unknown[];
let handOverCalls: unknown[];

/**
 * The bridge, with MAIN's half modelled honestly against `03-F53` rather than against a guess:
 *
 *  - `markReady` / `handOver` refuse `no_session` while nobody is signed in and append nothing.
 *    This is the emitter's own gate (the node oracle drives the real one), and modelling it here
 *    is what lets the renderer be TOLERANT: an implementation that raises the door without ever
 *    calling main, and one that calls main, reads `no_session` and then raises the door, are both
 *    correct under this FR and both pass every row below.
 *  - a successful `unlock` MOVES the session and pushes `changed`, which is what `main/index.ts`
 *    does around every other write, and is how a lock decided in main reaches the glass.
 */
const mountWith = (o: Options = {}) => {
  unlockCalls = [];
  markReadyCalls = [];
  handOverCalls = [];
  let user = o.user ?? null;
  const roster = o.roster ?? ROSTER;
  const tickets = o.tickets ?? [TICKET];
  const listeners = new Set<() => void>();
  const push = () => {
    for (const fn of listeners) fn();
  };
  const bridge = {
    passState: vi.fn(async () => baseState(user)),
    queue: vi.fn(async () => tickets),
    roster: vi.fn(async () => roster),
    markReady: vi.fn(async (req: unknown): Promise<MarkReadyResult> => {
      if (user === null) return { ok: false, reason: "no_session" };
      markReadyCalls.push(req);
      return { ok: true, events: 1, lines: 1 };
    }),
    handOver: vi.fn(async (req: unknown): Promise<HandOverResult> => {
      if (user === null) return { ok: false, reason: "no_session" };
      handOverCalls.push(req);
      return { ok: true, lines: 1 };
    }),
    unlock: vi.fn(async (user_id: string, pin: string) => {
      unlockCalls.push({ user_id, pin });
      if (o.refuseWith !== undefined) return { ok: false as const, reason: o.refuseWith };
      const member = roster.find((m) => m.user_id === user_id) ?? null;
      // `unknown_user` before `bad_pin`, the order `pin-session.ts` fixes.
      if (member === null) return { ok: false as const, reason: "unknown_user" };
      if (PINS[member.user_id] !== pin) return { ok: false as const, reason: "bad_pin" };
      user = member;
      push();
      return { ok: true as const, user_id };
    }),
    onChanged: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    // `satisfies` rather than a cast, matching `unlock-gate.dom.test.tsx`: the contract at the
    // head of this file is then enforced by `pnpm typecheck` as well as by these assertions, so a
    // bridge missing `roster` or `unlock` is a COMPILE error and not merely a red row. `PassBridge`
    // has no optional member and must not grow one — `shared/ipc.ts` already records why (a host
    // that stops supplying an optional member goes quiet with every gate green).
  } satisfies PassBridge;
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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Every word currently on the glass.
 *
 * ⚠ **JOINED FROM LEAF ELEMENTS, NEVER FROM `document.body.textContent`, and the difference was
 * found by MUTATION rather than by reading.** The first draft of this helper read the body's
 * `textContent`, which concatenates adjacent leaves with no separator — so three staff tiles and a
 * Cancel control came out as the single token `sajidzubairimrancancel`, and the empty-roster render
 * produced a bare `cancel` that the populated render therefore did not "contain". The word-diff
 * below then reported a difference that was an artefact of the tokenizer, and **the mutant that
 * deletes the empty-roster message survived**. That is the round-3 law's exact shape: the mechanism
 * was built correctly and was not measuring the thing it was aimed at, and only breaking the
 * implementation on purpose showed it. Leaves are joined with a space, which is the same idiom
 * `handover-confirm.dom.test.tsx` uses for the same reason.
 */
const words = (): Set<string> =>
  new Set(
    [...document.body.querySelectorAll("*")]
      .filter((el) => el.children.length === 0)
      .map((el) => el.textContent ?? "")
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );

/** The staff controls, in DOM order, so a re-sort anywhere is visible. */
const staffOrderOnScreen = (): string[] =>
  screen
    .queryAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "")
    .map((label) => NAMES.find((n) => label.startsWith(n)) ?? "")
    .filter((n) => n !== "");

const tileFor = (name: string): HTMLElement =>
  (screen
    .getAllByRole("button")
    .find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").startsWith(name)) as
    | HTMLElement
    | undefined) ??
  (() => {
    throw new Error(`no identification control for ${name}`);
  })();

const doneControl = () => screen.queryByRole("button", { name: /^DONE$/ });

/** Key a PIN on whatever pad the door draws, and confirm it. */
const enterPin = async (pin: string) => {
  for (const digit of pin) {
    fireEvent.click(await screen.findByRole("button", { name: digit }));
  }
  const confirm = screen
    .getAllByRole("button")
    .find((b) => /unlock|sign\s*in|enter|ok|confirm/i.test(b.textContent ?? ""));
  if (confirm === undefined) throw new Error("the PIN step draws no confirming control");
  fireEvent.click(confirm);
};

const identifyAndEnterPin = async (who: { display_name: string }, pin: string): Promise<void> => {
  fireEvent.click(tileFor(who.display_name));
  await enterPin(pin);
};

/** Get to the door the way a cook does: press the control on a ticket. */
const pressDone = async (): Promise<void> => {
  const done = await screen.findByRole("button", { name: /^DONE$/ });
  fireEvent.click(done);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE RULING'S SECOND CLAUSE: THE QUEUE IS NEVER GATED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 03-F53 — a pass with nobody signed in still shows the kitchen its work", () => {
  it("the queue is on the glass before anybody identifies", async () => {
    // THE ROW THIS TRACK'S RULING EXISTS FOR, and the one a session copying `apps/pos-electron`
    // breaks: `02-F18`'s lock surface renders over EVERYTHING, and transplanting it here means a
    // device whose roster has not synced is a kitchen that cannot see its own tickets.
    //
    // MUTANT: `if (state.user === null) return door()` at the top of `App`. Caught here alone —
    // every other row in this file reaches the door deliberately and would pass.
    mountWith({ user: null });
    render(<App />);

    expect(await screen.findByText(REFERENCE)).toBeTruthy();
    expect(screen.getByText(/Karahi/)).toBeTruthy();
  });

  it("the DONE control is on the glass while locked — or there is no way in at all", async () => {
    // `27-F5` retires a control a surface does not own, and the tempting move is to reuse that
    // for "nobody is signed in". It is the wrong reading and it is unusable: `03-F53` makes the
    // press the thing that RAISES the door, so a retired control leaves a cook with a queue she
    // cannot act on and no route to identify. That is this round's named defect — a feature that
    // shipped green and could not be USED.
    //
    // MUTANT: `onBump={state.user === null ? null : bump}`. Caught here alone.
    mountWith({ user: null });
    render(<App />);
    await screen.findByText(REFERENCE);

    expect(
      doneControl(),
      "a locked pass draws no control, so nobody can ever sign in",
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /HAND OVER/i })).toBeTruthy();
  });

  it("nothing is written while nobody is signed in", async () => {
    // The security half. `03-F53`: "with no session there is no edge", and the handover most of
    // all — `03-F52` makes it terminal and `01-F1` makes it permanent.
    mountWith({ user: null });
    render(<App />);
    await pressDone();

    await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(0));
    expect(markReadyCalls, "a ready-mark was recorded with nobody signed in").toEqual([]);
    expect(handOverCalls).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — `01-F61`'s TWO STEPS, RAISED BY THE ACT.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F61 — identify first, then the PIN", () => {
  it("pressing DONE with nobody signed in raises the identification grid, read from the seam", async () => {
    const h = mountWith({ user: null });
    render(<App />);
    await pressDone();

    for (const member of ROSTER) {
      expect(
        await screen.findByText(member.display_name),
        `${member.display_name} cannot be identified — the grid is not the whole roster`,
      ).toBeTruthy();
    }
    // From the SEAM, never a constant: the roster is synced reference data (`01-F28`) and a
    // hardcoded list goes stale the day somebody is hired or let go (`01-F42` removes the row).
    expect(h.bridge.roster, "the roster was not read from the bridge").toHaveBeenCalled();
  });

  it("no PIN can be submitted while nobody is identified", async () => {
    // THE BARE-PAD TEST, written against the OUTCOME and not against a shape: a door that shows
    // only the grid clicks nothing below and passes; a door showing both that will not confirm
    // until a tile is tapped also passes; a bare pad calls `unlock` and fails.
    //
    // `01-F61`: a failed attempt belonging to no user cannot be counted against anyone, so the
    // per-(device, user) lockout collapses into the device-wide one that FR refuses.
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await screen.findByText(SAJID.display_name);

    for (const digit of SAJID_PIN) {
      const key = screen.queryByRole("button", { name: digit });
      if (key !== null) fireEvent.click(key);
    }
    const confirm = screen
      .queryAllByRole("button")
      .find((b) => /unlock|sign\s*in|enter|ok|confirm/i.test(b.textContent ?? ""));
    if (confirm !== undefined) fireEvent.click(confirm);

    expect(unlockCalls, "a PIN reached main with nobody identified").toEqual([]);
  });

  it("hands main BOTH the identity and the PIN, user first", async () => {
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await identifyAndEnterPin(SAJID, SAJID_PIN);

    // The argument ORDER is pinned, matching `createPinSession.unlock(user_id, pin)`. Swapped,
    // the registry lookup misses and main refuses `unknown_user` — which the fixture models.
    await waitFor(() => expect(unlockCalls).toEqual([{ user_id: SAJID.user_id, pin: SAJID_PIN }]));
  });

  it("a PIN beginning with 0 is enterable — this is not a money keypad", async () => {
    // `packages/ui`'s `NumericKeypad` is BANNED on a credential pad and this enforces it:
    // `acceptKeystroke` computes `current === "0" ? key : current + key`, so `046201` collapses to
    // `46201` — right for rupees, and a silent permanent lockout of roughly a tenth of a roster.
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await identifyAndEnterPin(IMRAN, IMRAN_PIN);

    await waitFor(() => expect(unlockCalls).toEqual([{ user_id: IMRAN.user_id, pin: IMRAN_PIN }]));
  });

  it("each tile is a touch target, not a row of text (27-F6, 27-F8, 21 §5)", async () => {
    // `21 §5` puts the cook at plausibly non-reading, and `27-F8` makes a tappable target a
    // measured minimum rather than a style. A `<li>` of names carries neither, which is exactly
    // how the two shapes differ in a DOM with no layout.
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await screen.findByText(SAJID.display_name);

    const floor = targetFor("floor");
    for (const member of ROSTER) {
      const tile = tileFor(member.display_name);
      const width = Number.parseFloat(tile.style.minWidth);
      const height = Number.parseFloat(tile.style.minHeight);
      expect(
        width >= floor && height >= floor,
        `${member.display_name} is ${tile.style.minWidth}x${tile.style.minHeight}, under the ` +
          `27-F8 floor of ${floor} dp — a text row, not a tile`,
      ).toBe(true);
    }
  });

  it("27-F4 — the grid order is the SEAM's, never a rule of the renderer's own", async () => {
    // `27-F4`: "No adaptive, frecency-sorted or personalised ordering anywhere staff-facing." The
    // fixture order is deliberately neither alphabetical nor by id, so a renderer that sorts by
    // either is visible. `01-F61` calls the absence of sorting an ASSET: "a tile learned by
    // position is usable without reading it".
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await screen.findByText(SAJID.display_name);
    expect(staffOrderOnScreen()).toEqual(NAMES);

    // …and the fixture really does separate the three candidate orders, or the row is vacuous.
    expect(NAMES).not.toEqual([...NAMES].sort());
    expect(ROSTER.map((m) => m.user_id)).not.toEqual([...ROSTER.map((m) => m.user_id)].sort());
  });

  it("01-F61 — re-tapping a different tile before submit costs nothing", async () => {
    // "a mis-tap on a grid charges a failed attempt to someone WHO IS NOT IN THE BUILDING."
    // Identification is revocable until the PIN is submitted, so choosing and re-choosing sends
    // nothing to main at all.
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await screen.findByText(SAJID.display_name);

    fireEvent.click(tileFor(SAJID.display_name));
    // Back to the grid, then somebody else — tolerant of both plausible surfaces, since the FR
    // fixes only that it costs nothing, never how the way back is drawn.
    const back = screen
      .queryAllByRole("button")
      .find((b) => /not you|back|cancel|change/i.test(b.textContent ?? ""));
    if (back !== undefined) fireEvent.click(back);
    const other = screen
      .queryAllByRole("button")
      .find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").startsWith("Imran"));
    if (other !== undefined) fireEvent.click(other);

    expect(unlockCalls, "identifying somebody was charged as an attempt").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `00 §5.7` / `03-F53`: A REFUSAL SAYS WHICH REFUSAL.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 03-F53 — the glass distinguishes a lockout from a typo, and an empty roster from a bug", () => {
  it("a wrong PIN says something, and a lockout says something DIFFERENT", async () => {
    // Measured as a WORD DIFF rather than as a sentence match, so any phrasing passes and an
    // implementation that shows one message for both fails. `03-F53`'s reason: "A cook who cannot
    // tell those apart re-keys instead of fetching a colleague, and that is the one behaviour
    // that turns a five-minute cooldown into a stopped pass."
    //
    // MUTANT: `setRefused(true)` — one boolean, one message, both refusals. Caught here alone.
    mountWith({ user: null, refuseWith: "bad_pin" });
    render(<App />);
    await pressDone();
    await identifyAndEnterPin(SAJID, WRONG_PIN);
    await waitFor(() => expect(unlockCalls).toHaveLength(1));
    const afterTypo = words();

    cleanup();
    mountWith({ user: null, refuseWith: "locked_out" });
    render(<App />);
    await pressDone();
    await identifyAndEnterPin(SAJID, WRONG_PIN);
    await waitFor(() => expect(unlockCalls).toHaveLength(1));
    const afterLockout = words();

    const onlyOnLockout = [...afterLockout].filter((w) => !afterTypo.has(w));
    expect(
      onlyOnLockout.length,
      "a lockout and a wrong PIN put the same words on the glass — a cook cannot tell that " +
        "re-keying is pointless, which is how a five-minute cooldown becomes a stopped pass",
    ).toBeGreaterThan(0);
  });

  it("a device with an empty registry SAYS so rather than drawing an empty grid", async () => {
    // `00 §5.7`, and it is today's real state on every device: nothing populates `store.staff`
    // (`01-F47` admits devices, not people), so a pass launched without the DEV SEED shows a door
    // with nothing on it — indistinguishable from a rendering failure.
    //
    // Word-diff again: the empty case must put a word on the glass the populated case does not.
    // MUTANT: `roster.map(...)` over an empty array and nothing else. Caught — it adds no words.
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await screen.findByText(SAJID.display_name);
    const populated = words();

    cleanup();
    mountWith({ user: null, roster: [] });
    render(<App />);
    await pressDone();
    await waitFor(() => expect(screen.queryAllByRole("button").length).toBeGreaterThan(0));
    const empty = words();

    const onlyWhenEmpty = [...empty].filter((w) => !populated.has(w));
    expect(
      onlyWhenEmpty.length,
      "a pass whose roster never arrived draws an empty grid and says nothing — 00 §5.7 makes " +
        "reporting what is true a platform law, and an empty box reads as a broken screen",
    ).toBeGreaterThan(0);
  });

  it("01-F17 — a refusal does not brick the surface; the same cook signs in on the next try", async () => {
    // The positive control for both rows above: they are also satisfied by a door that died.
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await identifyAndEnterPin(SAJID, WRONG_PIN);
    await waitFor(() => expect(unlockCalls).toHaveLength(1));

    const tile = screen
      .queryAllByRole("button")
      .find((b) =>
        (b.getAttribute("aria-label") ?? b.textContent ?? "").startsWith(SAJID.display_name),
      );
    if (tile !== undefined) fireEvent.click(tile);
    await enterPin(SAJID_PIN);
    await waitFor(() => expect(unlockCalls).toHaveLength(2));
    expect(await screen.findByText(REFERENCE)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — THE DOOR CLOSES, AND THE ACT WORKS.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 01-F17 / 02-F41 — the way out, the way through, and whose name is on the strip", () => {
  it("the door can be left without signing in, and the queue is still there", async () => {
    // A mis-pressed DONE must not trap a cook at a PIN pad with the kitchen's work hidden behind
    // it. `01-F17`'s spirit and `03-F53`'s "the queue is never gated": whatever the door covers, a
    // cook can put it away without a credential.
    mountWith({ user: null });
    render(<App />);
    await pressDone();
    await screen.findByText(SAJID.display_name);

    const out = screen
      .queryAllByRole("button")
      .find((b) => /cancel|not now|back|close|later|×/i.test(b.textContent ?? ""));
    expect(
      out,
      "the identification step has no way out — a mis-tap hides the queue for good",
    ).toBeTruthy();
    if (out !== undefined) fireEvent.click(out);

    expect(await screen.findByText(REFERENCE)).toBeTruthy();
    expect(unlockCalls).toEqual([]);
    expect(markReadyCalls).toEqual([]);
  });

  it("a device that is already signed in draws no door at all", async () => {
    // The seam is read on the first paint too: a pass whose window reloaded mid-shift must not
    // demand a PIN from a cook who is already in.
    mountWith({ user: SAJID });
    render(<App />);
    await screen.findByText(REFERENCE);

    expect(
      screen.queryByText(ZUBAIR.display_name),
      "the door is up on an unlocked pass",
    ).toBeNull();
    await pressDone();
    await waitFor(() => expect(markReadyCalls).toEqual([{ order_id: ORDER, line_ids: null }]));
  });

  it("02-F19 / 02-F45 — the strip names the person, and never a stand-in", async () => {
    // `01-F27` forbids a device identity standing in for a user identity, which is why
    // `PassStateWire.actor` stays the DEVICE and the session is its own field. What this row
    // catches is the opposite failure: a strip that goes on saying "nobody signed in" while
    // `02-F41` is attributing every edge to Sajid — `02-F45`'s two-sources-for-one-fact, on the
    // glass rather than in the payload.
    //
    // MUTANT: leaving `PASS_ACTOR` as the strip's only source. Caught.
    mountWith({ user: SAJID });
    render(<App />);
    await screen.findByText(REFERENCE);
    expect(
      screen.queryAllByText(new RegExp(SAJID.display_name)).length,
      "the pass is attributing edges to Sajid and telling the kitchen nobody is signed in",
    ).toBeGreaterThan(0);
  });

  it("01-F26 — a lock decided in MAIN returns the pass to identification, without hiding the queue", async () => {
    // Idle auto-lock happens in main with no tap and no unlock call in sight. A renderer holding
    // its own boolean would stay signed in all night, and `02-F41` would go on naming whoever
    // walked away.
    //
    // THE UNLOCK IS DONE THROUGH THE SURFACE FIRST, which is the whole test: mounting an already
    // unlocked pass and then locking it is passed by the very implementation this catches — a
    // local flag that starts `false` agrees with the seam until somebody actually signs in.
    const h = mountWith({ user: null });
    render(<App />);
    await pressDone();
    await identifyAndEnterPin(SAJID, SAJID_PIN);
    await waitFor(() => expect(unlockCalls).toHaveLength(1));
    await screen.findByText(REFERENCE);
    await pressDone();
    await waitFor(() => expect(markReadyCalls).toHaveLength(1));

    h.lockFromMain();

    // The queue survives the lock — that is the whole difference between this surface and the
    // till's — and the next press has to ask again.
    await waitFor(() => expect(screen.queryByText(REFERENCE)).toBeTruthy());
    await pressDone();
    await waitFor(() => expect(screen.queryByText(SAJID.display_name)).toBeTruthy());
    expect(markReadyCalls, "an edge was written after main ended the session").toHaveLength(1);
  });
});
