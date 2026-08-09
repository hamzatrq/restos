import { contextBridge } from "electron";
import type {
  Alarm,
  CashState,
  MenuItem,
  OpenOrder,
  RestosBridge,
  RosterMember,
  Session,
} from "../shared/ipc";

/**
 * **The layout gate's bridge — a scripted `window.restos`, so the REAL renderer mounts with no
 * SQLite, no `sync-client`, no printer and no native module.**
 *
 * This is what keeps the gate cheap enough to run on every `pnpm verify`: `main/index.ts` opens
 * a `better-sqlite3` store, and `better-sqlite3` is a native addon that must be rebuilt for
 * Electron's ABI (`pnpm rebuild:native`, see this app's CLAUDE.md). Requiring that of a layout
 * check would make the rail cost a native rebuild to run. The renderer needs none of it — it is
 * a plain React app whose only contact with main is this bridge (`18 §9`) — so the gate serves
 * the bridge and the renderer never knows the difference.
 *
 * **⚠ WHAT THIS COSTS, stated rather than left to be discovered.** The renderer is real and
 * main is NOT. This gate therefore proves nothing about main, about IPC, about Zod validation at
 * the plane boundary, or about whether the shipped preload serves the same channels — those are
 * `main/__acceptance__/`'s job and it already holds them. What it proves is exactly one thing:
 * **given data of this shape, the shipped renderer lays out reachably at `27 §1a`'s panel.**
 *
 * ## The fixture is a WORST REALISTIC CASE, and that choice is load-bearing
 *
 * A layout defect is a function of content, so a fixture with an empty cart and no alarm would
 * have missed two of the three defects this gate exists for:
 *
 * - **`alarms()` returns one S1.** Defect 1 (the 1418 px band) is only reachable when the band
 *   is drawn. With no alarm, `AlarmBand` renders nothing and removing `box-sizing` is invisible.
 * - **`openOrders()` returns a settleable order.** Defect 2 (`TAKE CASH` at y=929) is only
 *   reachable when `TenderPanel` is drawn, and `Counter.tsx`'s Pay surface renders a "no order
 *   to settle" line instead when there is none.
 * - **`deviceState().catalog` returns a REFUSAL.** `01-F56`'s catalog-health chip renders
 *   `null` when the menu is current (`27-F16` — colour is spent on the abnormal only), so a
 *   fixture with a healthy catalog measures a strip that does not contain it. Chrome is the
 *   scarcest budget on this device — `DEC-UI-001`'s ruling turned on `51 + 85 + 102 + 528 = 766`
 *   in a 768 px panel — so a strip element that appears only in an abnormal state is exactly the
 *   kind of thing that fits in every state anyone measured and clips in the one nobody did.
 *   This is blind spot 2 in `main.ts` ("it only sees the states the fixture produces") being
 *   paid up front instead of after the defect.
 *
 * Sizes are kept to what `27 §1a` actually specifies rather than inflated: `27-F11a` computes
 * ~88 tiles per page and ~25 items per category tab, so a 24-item menu is the spec's own page
 * and not a stress test. Overflowing a surface by handing it 300 tiles would be the gate
 * inventing a requirement doc 27 does not make.
 */

/**
 * `01-F26`'s roles are on the roster, and the mix is the shipped dev seed's: two cashiers and one
 * branch manager. Not decoration — `PersonTile` renders the role beneath the name, so a fixture
 * without one measures a card that is a line shorter than the one every real till draws, and the
 * lock surface's vertical budget is measured against the card.
 *
 * `branch_manager` is deliberately the longest role string this product has (`domain`'s `ROLES`),
 * for the same reason the menu below carries `Chicken Karahi (Half)`: a fixture of short values
 * measures a layout nobody has.
 */
const STAFF: RosterMember[] = [
  { user_id: "user-ayesha", display_name: "Ayesha Khan", role: "cashier" },
  { user_id: "user-bilal", display_name: "Bilal Ahmed", role: "cashier" },
  { user_id: "user-hina", display_name: "Hina Raza", role: "branch_manager" },
];

/**
 * 24 items, with the longest names the seed catalogue actually carries. Two-word and three-word
 * names are deliberate: the Order surface's regression was a grid narrow enough to wrap
 * "Chicken Karahi (Half)" onto three lines, and a fixture of short labels would not have shown
 * it.
 */
const MENU: MenuItem[] = [
  "Chicken Biryani",
  "Mutton Biryani",
  "Chicken Karahi (Half)",
  "Chicken Karahi (Full)",
  "Mutton Karahi (Half)",
  "Seekh Kebab (4 pcs)",
  "Chicken Tikka",
  "Malai Boti",
  "Dal Makhani",
  "Palak Paneer",
  "Chana Masala",
  "Butter Chicken",
  "Nihari",
  "Haleem",
  "Paya",
  "Naan",
  "Roghni Naan",
  "Garlic Naan",
  "Tandoori Roti",
  "Raita",
  "Kachumber Salad",
  "Soft Drink 345ml",
  "Mineral Water 1.5L",
  "Kheer",
].map((label, i) => ({ id: `item-${i}`, label }));

const ORDER: OpenOrder = {
  order_id: "order-gate-1",
  reference: "A-014",
  total_paisa: 487_500,
  paid_paisa: 0,
  lines: [
    {
      line_id: "line-1",
      name: "Chicken Karahi (Full)",
      quantity: 1,
      modifiers: ["Extra spicy"],
      removals: [],
      note: null,
    },
    {
      line_id: "line-2",
      name: "Mutton Biryani",
      quantity: 2,
      modifiers: [],
      removals: ["No raita"],
      note: "Table 6",
    },
    {
      line_id: "line-3",
      name: "Garlic Naan",
      quantity: 4,
      modifiers: [],
      removals: [],
      note: null,
    },
  ],
};

/**
 * `03-F5`'s S1 — the one that must be acknowledgeable. `27-F11g` makes this band the ONLY
 * signal that food is not being cooked where paper is the only kitchen channel, so its
 * acknowledgement being reachable is the highest-consequence instance of this whole gate.
 */
let alarms: Alarm[] = [
  {
    id: "alarm-1",
    message: "The kitchen printer did not answer. This ticket has not printed.",
    subject: "TH230 — order A-014",
  },
];

const CASH_STATE: CashState = {
  shifts: [],
  days: [],
  unbound: [],
  unbound_drawer: { no_sale_count: 0, paid_out_paisa: 0, exceptions_json: "[]" },
};

/** `01-F26` — `null` is LOCKED. The gate unlocks by calling `unlock`, like the operator does. */
let session: Session | null = null;
const listeners = new Set<() => void>();

/**
 * `27 §1a`'s two counter panels, and `DEC-UI-001` (e) requires BOTH be measured: *"the layout
 * gate measures one panel at devicePixelRatio 1; `27 §1a`'s second counter panel must enter its
 * fixture with this work, or the ruling ships untested on precisely the case that produced"* the
 * no-pinned-79-px trap.
 *
 * The gate simulates a panel it is not running on, so the density is DERIVED from the window it
 * actually has rather than typed in: the window is `n` CSS pixels across at this host's own
 * `devicePixelRatio`, and if that were a 15.6″ panel it would be
 * `n × devicePixelRatio / widthInches` PPI. That keeps `27-F68`'s arithmetic honest on a Retina
 * Mac — where the same simulation typed as a flat `100.5` would render every target at half its
 * physical size — and it makes the two panels differ in exactly the thing `27-F11c` says must
 * not matter: pixels across the same 15.6 inches.
 */
const COUNTER_DIAGONAL_IN = 15.6;

/**
 * **The panel's diagonal, in inches, from the URL the gate loaded this page with.**
 *
 * It has to arrive before the page runs. `App.tsx` reads `deviceState()` on mount, so a density
 * injected after `loadFile` resolves is a frame late and the surface paints once at the previous
 * panel's physical size — which on a sweep that reloads per panel is a screenshot of the wrong
 * layout. `location.search` is the only channel that exists that early.
 *
 * **The diagonal is the whole input** and the pixel count is not: under `27-F68` a surface's
 * physical size is `diagonalIn × (px / hypot) × 25.4` mm, in which the resolution cancels. That
 * is why the sweep can hold `1920×1080` fixed and still measure a 15.6″ counter and a 24″ desktop
 * as genuinely different surfaces — and why a gate keyed on pixels is blind to the founder's
 * defect by construction.
 *
 * Defaults to `27 §1a`'s counter when absent, so a page opened without the parameter is the panel
 * this app ships on rather than a guess.
 */
const panelDiagonalIn = (): number => {
  const declared = Number(new URLSearchParams(window.location.search).get("diagonalIn"));
  return Number.isFinite(declared) && declared > 0 ? declared : COUNTER_DIAGONAL_IN;
};

const simulatedPanelPpi = (): number => {
  const inches = { w: window.innerWidth, h: window.innerHeight };
  const diagonalPx = Math.hypot(inches.w, inches.h) * window.devicePixelRatio;
  return diagonalPx / panelDiagonalIn();
};

const bridge: RestosBridge = {
  deviceState: () =>
    Promise.resolve({
      actor: session?.display_name ?? "Counter 1",
      // `27-F68` — read fresh on every call, so the gate's resize to the second panel is
      // followed by the renderer without a reload.
      panelPpi: simulatedPanelPpi(),
      deviceLabel: "Counter 1",
      businessDay: "2026-08-07",
      training: false,
      // `00 §5.7` — three separate facts. `down` is what a gate host honestly is.
      lan: "down" as const,
      hub: "down" as const,
      cloud: "down" as const,
      blocked: null,
      /**
       * **`01-F56` — a REFUSED catalog, raised for the whole sweep.**
       *
       * Raised rather than toggled, because unlike `03-F5`'s band this has no acknowledgement to
       * drive it with: a catalog refusal is a STATE that clears when the catalog un-sticks, and
       * `CatalogHealth` deliberately offers no control (see its header). The healthy state is the
       * strictly SMALLER layout — the chip renders nothing at all — so measuring the raised one
       * measures the worst case, which is what a fixture is for.
       *
       * The message is the real one `main/gateway.ts` formats for `needs_snapshot`, not a short
       * stand-in: it is the longest of the four and this element sits in a `space-between` row
       * with the actor, three link chips and the business day. A fixture with `"stuck"` in it
       * would measure a strip that does not exist on any till.
       */
      catalog: {
        version: 4,
        message:
          "this till refused the update it was sent — it needs a full menu, not a change list",
      },
      user: session,
    }),
  openOrders: () => Promise.resolve([ORDER]),
  kitchenQueue: () => Promise.resolve([]),
  menu: () => Promise.resolve(MENU),
  staff: () => Promise.resolve(STAFF),
  cashState: () => Promise.resolve(CASH_STATE),
  alarms: () => Promise.resolve(alarms),
  /**
   * `03-F5` — the alert repeats "until acknowledged", so acknowledging it CLEARS it. That is
   * faithful to main, and it is also how the gate reaches the device's second layout state
   * without an env var or a second fixture: it measures every surface with the band up, then
   * acknowledges the way an operator does, then measures every surface again with it down.
   * Both are real states of this device and they have different vertical budgets.
   */
  acknowledgeAlarm: (alarm_id: string) => {
    alarms = alarms.filter((a) => a.id !== alarm_id);
    for (const fn of listeners) fn();
    return Promise.resolve();
  },
  /**
   * **`05-F19` — AN OVER-THRESHOLD PAID-OUT IS REFUSED, AND THAT IS WHAT RAISES THE PAD.**
   *
   * `escalationFor: () => null` used to sit here and it cost a real, worse defect than any this
   * gate has caught: `ManagerApproval` never rendered, so a surface that laid out **1162 px in a
   * 632 px box in BOTH device states** — `Approve`, `Not them?` and `Cancel` entirely below the
   * viewport — was measured by nothing. That is blind spot 2 in `main.ts` ("it only sees the
   * states the fixture produces") in its most expensive form: `02-F20`'s local manager PIN is the
   * only escalation route that exists, so the one built path out of an `escalate` verdict was
   * dead on arrival at every till and every gate was green.
   *
   * The shape is faithful rather than convenient. `main/authorize.ts` refuses a `cash.paid_out`
   * above `PAID_OUT_APPROVAL_THRESHOLD_PAISA` with `outcome: "escalate"` and the roles that would
   * satisfy it, and `Counter.tsx`'s `escalatableWrite` re-asks the same guard through
   * `escalationFor` on the rejection — so a rejecting `append` plus an offer is exactly the
   * sequence a real till performs. Every other append still succeeds, because a fixture that
   * refused everything would measure a counter nobody can use.
   */
  append: (req) =>
    (req as { type?: string }).type === "cash.paid_out"
      ? Promise.reject(new Error("cash.paid_out above the org threshold (05-F19)"))
      : Promise.resolve({ id: "evt-gate" }),
  addLine: () => Promise.resolve({ id: "evt-gate" }),
  escalationFor: (req) =>
    Promise.resolve(
      (req as { type?: string }).type === "cash.paid_out"
        ? {
            // Read off the matrix by main in the shipped path (`can().satisfied_by`); the two
            // roles `domain` actually returns for this cell, so the prompt line is the real
            // length rather than a short stand-in.
            satisfied_by: ["branch_manager", "owner"],
          }
        : null,
    ),
  escalate: () => Promise.resolve({ ok: true as const, id: "evt-gate" }),
  unlock: (user_id: string) => {
    session = STAFF.find((s) => s.user_id === user_id) ?? null;
    for (const fn of listeners) fn();
    return Promise.resolve({ unlocked: session !== null });
  },
  onChanged: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

contextBridge.exposeInMainWorld("restos", bridge);
