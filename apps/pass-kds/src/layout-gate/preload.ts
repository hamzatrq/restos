import { contextBridge } from "electron";
import type {
  HandOverResult,
  MarkReadyResult,
  PassBridge,
  PassStateWire,
  PassTicketWire,
} from "../shared/ipc";

/**
 * # THE GATE'S FIXTURE — and the fixture IS the coverage boundary
 *
 * `apps/pos-electron`'s gate records this as its own most expensive lesson, twice: *"it only sees
 * the states the fixture produces … `escalationFor: () => null` meant `ManagerApproval` never
 * rendered, and defect 5 — a manager who cannot approve, in BOTH states — sat unmeasured behind
 * that one line."* So every state this screen can be in is scripted here, and `main.ts` carries a
 * `24-F14` presence check for each one: a fixture line reverted takes the surface out of coverage
 * **loudly** rather than silently.
 *
 * Main is deliberately NOT real. It would drag in `better-sqlite3` and make a layout check cost a
 * native rebuild, and it says nothing about layout. What that costs is stated in `main.ts`.
 */

const params = (): URLSearchParams => new URLSearchParams(window.location.search);

/**
 * The panel's density, DERIVED from the window this preload is actually in rather than typed.
 *
 * `apps/pos-electron`'s gate: *"a gate that typed `100.5` on a dpr-2 machine would render every
 * target at half size and pass."* The diagonal comes over the query string from the panel table;
 * everything else is measured here.
 */
const simulatedPanelPpi = (): number => {
  const diagonalIn = Number(params().get("diagonalIn") ?? "22");
  // ⚠ `window.innerWidth`, **never `window.screen`** — measured 2026-08-10, and it was wrong here
  // for one round. `screen` is the HOST's display, which on a dev machine is one fixed size, so
  // every simulated panel resolved to the same density: the 32" TV and the 10.1" tablet were
  // handed identical PPI, the capacity math read the same millimetres for both, and the `27-F8`
  // target printed an identical 15.24 mm on all seven rows — a number that looked like a passing
  // measurement and was a constant. The window is what `setContentSize` moves; the screen is not.
  const w = window.innerWidth * window.devicePixelRatio;
  const h = window.innerHeight * window.devicePixelRatio;
  return Math.hypot(w, h) / diagonalIn;
};

/** `03-F24` — the read-only state, driven from the query string so both are swept. */
const maySignal = (): boolean => params().get("state") !== "readonly";

/** The empty queue (`00 §5.7` — a kitchen with nothing to cook says so). */
const empty = (): boolean => params().get("state") === "empty";

/**
 * **TWENTY tickets, and the number is load-bearing — it was TWELVE and the gate refused it.**
 *
 * `apps/pos-electron`'s fixture menu had to grow from 24 items to 46 for exactly this reason: at
 * 24 it fitted one page of every shipping panel, so the pager was never drawn and the pager defect
 * was measurable only on a probe.
 *
 * **Measured here 2026-08-10, and the tripwire is what found it.** Twelve was chosen against a
 * single-column capacity model; when the queue became `27-F2`'s paged GRID the 32" TV went to
 * 4 columns × 4 rows = **16 tickets**, so twelve fitted one page and `03-F46`'s pager stopped
 * rendering on the largest panel in the sweep. The gate failed with *"12 tickets and NO pager"*
 * rather than passing quietly over a retired check — which is the whole point of a `24-F14`
 * presence assertion, and is the difference between this and the two rounds where a fixture line
 * silently took a surface out of coverage.
 *
 * Twenty exceeds every panel's capacity here (the largest is 16) and sits inside `03-N4`'s
 * 40-order budget. **If a panel is ever added that holds more than twenty, this number moves with
 * it** — the gate will say so by name.
 *
 * The ages sweep all three `27-F15` rungs (neutral / amber / red) against dine-in's 10/20 and
 * delivery's 15/25, and the line counts run 1..4 so the tallest card is measured rather than the
 * average one. `03-F15`'s assembly count varies, and two tickets are NOT bumpable — one because
 * every line is already `ready`, one because the fold left a line contested (`01-F31`).
 */
const CHANNELS = ["counter", "phone", "storefront", "whatsapp", "foodpanda"] as const;
const TYPES = ["dine_in", "takeaway", "delivery", "dine_in"] as const;

const tickets = (): PassTicketWire[] => {
  if (empty()) return [];
  return Array.from({ length: 20 }, (_unused, i) => {
    const order_type = TYPES[i % TYPES.length] ?? "dine_in";
    const delivery = order_type === "delivery";
    /**
     * ⚠ **The line-count and ready-count cycles are offset by ONE, and the offset is load-bearing.**
     *
     * They ran `i % 4` and `i % 3`, which made ticket 0 a **single `in_prep` line** — bumpable and
     * with nothing ready. On the three panels that hold ONE ticket (`tablet-10.1`,
     * `netbook-1024`, `probe-phone`) page 1 is ticket 0 and nothing else, so `03-F52`'s handover
     * control was never drawn there at all and its confirm was never opened. **The gate said so
     * by name** on the first run after the checks landed — three EMPTY MATCHes and a
     * *"confirm was opened on 4 of 7 panels"* — which is the `24-F14` tripwire doing exactly the
     * job the twelve-tickets/no-pager round bought it for.
     *
     * The offset rotates the same multiset of shapes rather than adding one, so the sweep still
     * spans 1..4-line cards and the same two non-bumpable rows; it just puts the **mixed** ticket
     * first. Mixed is also the card that matters most here: it is the only arrangement where
     * `27-F9`'s hard rule bites, because it is the only one that draws DONE and HAND OVER at once.
     */
    const lineCount = ((i + 1) % 4) + 1;
    const done = (i + 1) % 3;
    const bumpable = i !== 4 && i !== 9;
    const lines = Array.from({ length: lineCount }, (_u, j) => ({
      line_id: `line-${i}-${j}`,
      // A long name on purpose: `03-F38`'s `kitchen_name` is the fix for these and a fixture of
      // short names would never show the card its own worst case.
      name: j === 0 ? "Chicken Karahi (Full) — extra spicy" : `Roghni Naan ${j}`,
      quantity: j + 1,
      state: j < done ? "ready" : bumpable ? "in_prep" : "ready",
      done: j < done,
    }));
    return {
      order_id: `order-${String(i).padStart(4, "0")}`,
      reference: `A-${String(140 + i).padStart(4, "0")}`,
      channel: CHANNELS[i % CHANNELS.length] ?? "counter",
      order_type,
      // A table on dine-in only, and one contested pair, so `03-F13`'s table row is measured in
      // all three of its states rather than only in the one the happy path produces.
      tables: order_type === "dine_in" ? (i === 3 ? ["4", "5"] : [String(4 + i)]) : [],
      table_conflict: i === 3,
      confirm_at: 1_700_000_000_000 + i * 60_000,
      // 0, 6, 12, 18, 24 … so the sweep crosses amber (10/15) and red (20/25) on both order types.
      minutes: i * 3,
      amberAt: delivery ? 15 : 10,
      redAt: delivery ? 25 : 20,
      lines,
      linesDone: Math.min(done, lineCount),
      linesTotal: lineCount,
      bumpable,
      /**
       * `03-F52` — DERIVED from this ticket's own lines rather than typed, and it is TRUE on a
       * mixed ticket and not only on a finished one.
       *
       * `serve-mark.ts` answers exactly this question in main (`serveEdgesFor(...) !== null`) and
       * a fixture that typed an answer of its own could draw a control the emitter would refuse —
       * the disagreement `pass-queue.ts` computes `handoverable` on the trusted side to prevent.
       * So it is the same two terms: a line already `ready`, and an `order_type` on `01 §4`'s
       * allowlist.
       */
      handoverable: order_type !== "delivery" && lines.some((l) => l.state === "ready"),
    };
  });
};

/**
 * `03-F53`'s roster — the tiles of `01-F61`'s identification step.
 *
 * **THREE, and the names are long on purpose.** `PersonTile` is content-sized and a fixture of
 * three-letter names would never show the row its own worst case; two-word Pakistani names at
 * `text-numeric-hero` are what the panel actually has to hold. The order is neither alphabetical
 * nor by id, matching the renderer oracle's fixture, so a re-sort anywhere is visible.
 */
const ROSTER = [
  { user_id: "0199bbbb-0000-7000-8000-00000000c001", display_name: "Sajid Mehmood" },
  { user_id: "0199bbbb-0000-7000-8000-00000000a001", display_name: "Zubair Ali" },
  { user_id: "0199bbbb-0000-7000-8000-00000000c002", display_name: "Imran Bakhsh" },
] as const;

/**
 * **NOBODY IS SIGNED IN, and that is the state that has a DOOR in it.**
 *
 * `03-F53` makes the press with no session the thing that raises `01-F61`'s two steps, so a fixture
 * that typed a signed-in user would render the queue and **never the door** — which is precisely
 * the `escalationFor: () => null` failure this file's header is about, arriving on a new surface.
 * `main.ts` presses DONE and measures both steps, and carries a `24-F14` presence check per step.
 *
 * **This is the line the door's whole coverage rests on, and that is a measurement rather than a
 * claim**: with `user` set to a signed-in member the gate fails with **16 violations**, every one
 * an `EMPTY MATCH — 01-F61's grid drew no identification tile` naming its panel and state. (The
 * `markReady` answer below is NOT that line — see the ⚠ there, which is a correction.)
 */
const passState = (): PassStateWire => ({
  deviceLabel: "Pass",
  // The shipped `PASS_ACTOR` verbatim — a fixture that typed its own word here would measure a
  // string this product never renders, which is one keystroke from a strip nobody has looked at.
  actor: "Nobody signed in",
  user: null,
  businessDay: "2026-08-10",
  lan: "down",
  hub: "down",
  cloud: "ok",
  panelPpi: simulatedPanelPpi(),
  // `00 §5.7` — the honesty notice is raised for the WHOLE sweep, so a chip that is only drawn in
  // the degraded state is still measured. `apps/pos-electron`'s L1 mutation row is why: a surface
  // that renders `null` when healthy is a surface the probe cannot tell is missing.
  panelFit: {
    reason: "unmeasured",
    glass: "not measured",
    message:
      "this screen could not read its own size from the operating system, so the ticket " +
      "capacity below and every touch target on it are drawn from an assumption.",
  },
  maySignal: maySignal(),
  readySignalOwner: maySignal() ? "pass" : "counter",
  // `03-F52` — swept on the same axis as `03-F24`'s, so the read-only state covers BOTH refusals.
  // A fixture that left this `true` in the read-only state would take half the assignment out of
  // coverage, which is the `escalationFor: () => null` failure this file's header is about.
  mayHandOver: maySignal(),
  serveSignalOwner: maySignal() ? "pass" : "settlement",
});

const bridge: PassBridge = {
  passState: () => Promise.resolve(passState()),
  queue: () => Promise.resolve(tickets()),
  // `03-F53` — an EMPTY roster is a scripted state too (`?state=empty-roster`), because
  // *"a device whose registry is empty says so rather than drawing an empty grid"* is a rendered
  // message with a layout of its own, and a fixture that only ever returned three names would
  // leave it unmeasured on every panel.
  roster: () => Promise.resolve(params().get("state") === "empty-roster" ? [] : [...ROSTER]),
  /**
   * `03-F53` — nobody is signed in, so main would refuse. Modelled honestly rather than always-`ok`.
   *
   * ⚠ **THIS PAIR IS NOT WHAT KEEPS THE DOOR IN COVERAGE, AND THE FIRST DRAFT OF THIS COMMENT SAID
   * IT WAS — MEASURED, NOT REASONED.** It read *"an `{ ok: true }` here would mean the gate never
   * sees it"*, and mutating exactly that (both back to `{ ok: true }`, rebuild, re-run) left the
   * gate **PASSED at exit 0 with all 14 identification grids still measured**. The renderer raises
   * the door from `user` at the press and never calls main when it already knows nobody is in
   * (`App.tsx` — one round trip before a wet-handed cook sees the grid is a beat this surface
   * cannot spend), so these two answers are unreached from this gate. **`user: null` above is the
   * line the coverage rests on**: mutating THAT hard-fails with 16 `EMPTY MATCH` verdicts by name.
   *
   * Recorded rather than quietly fixed because `AGENTS.md` is explicit that a comment promising a
   * protection which does not exist is worse than no comment: it retires the assertion somebody
   * would otherwise write. They stay `no_session` because that is what main really answers — a
   * fixture that lied the other way would be modelling a device this product cannot be in.
   */
  markReady: (): Promise<MarkReadyResult> =>
    Promise.resolve({ ok: false, reason: "no_session" as const }),
  handOver: (): Promise<HandOverResult> =>
    Promise.resolve({ ok: false, reason: "no_session" as const }),
  /**
   * Both refusals are scripted, on the same axis, because `03-F53` requires them to be
   * DISTINGUISHABLE on the glass — and the lockout message is the long one, so it is the one whose
   * wrapping can push a control off a 10.1" panel.
   */
  unlock: () =>
    Promise.resolve({
      ok: false as const,
      reason: params().get("state") === "locked-out" ? "locked_out" : "bad_pin",
    }),
  onChanged: () => () => {},
};

contextBridge.exposeInMainWorld("restos", bridge);
