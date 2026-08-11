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
  /**
   * **⚠ THE LIST ABOVE STOPPED HERE, AND THAT MADE THE PAGER UNMEASURABLE ON SHIPPING GLASS.**
   *
   * 24 items fit on ONE page of every shipping panel in `PANELS`, so `ItemGrid` never drew a
   * pager on any of them and the gate had never measured one. That is the fixture boundary this
   * rail's own blind-spot list names — *"it only sees the states its fixture produces"* — and it
   * cost something concrete: `ItemGrid`'s pager-overlap defect sliced five tiles at 1024×600 and
   * was **reported rather than fatal**, because the only panel that paged was a `ships: false`
   * probe whose FIT verdicts are downgraded by design.
   *
   * The extra rows below take the menu past one page on `laptop-1280`, the smallest SHIPPING
   * panel, so a pager regression now reddens the gate for real. They are not padding: `02-N2`
   * specifies a 300-item catalogue and `27-F11a` sizes a tab at ~25 items, so a 24-item fixture
   * was **smaller than the product's own design case** and a paging grid is the ordinary state of
   * this surface, not an edge one.
   */
  "Beef Pulao",
  "Chicken Handi",
  "Mutton Handi",
  "Chapli Kebab",
  "Bihari Boti",
  "Reshmi Kebab",
  "Fish Fry",
  "Prawn Karahi",
  "Aloo Gosht",
  "Bhindi Masala",
  "Daal Chawal",
  "Chicken Corn Soup",
  "Hot & Sour Soup",
  "Russian Salad",
  "Sheermal",
  "Paratha",
  "Lassi Sweet",
  "Lassi Salted",
  "Kashmiri Chai",
  "Gulab Jamun",
  "Ras Malai",
  "Falooda",
].map((label, i) => ({
  id: `item-${i}`,
  label,
  /**
   * **`02-F7`'s two 86 states, produced by the FIXTURE — which is this gate's real coverage
   * boundary** (`main.ts`'s own blind-spot list: *"it only sees the states its fixture
   * produces"*). A Sold-out grid of plain tiles would measure nothing that the Order grid does
   * not already measure, and the geometry that can actually clip is the tile carrying a REASON:
   * `unavailableReason` adds a line of text inside a fixed-height tile, and `Sold out —
   * disputed` (`01-F58`) is the longest string this surface can render.
   *
   * **Indices `0` and `1`, and that is not arbitrary — it is what the tripwire caught.** They
   * were `3`/`11`/`29` first, and `probe-below-floor` (202 × 118 mm) draws a grid small enough
   * that page one held neither, so the EMPTY MATCH fired on that panel alone. A fixture state
   * that only exists on large glass is a fixture state the tightest panels are not covered by,
   * which is this gate's whole recorded lesson. The first two tiles are on page one of ANY grid
   * that draws two tiles at all; `29` is kept so a paging grid still shows one further in.
   */
  ...(i === 0 || i === 1 || i === 29 ? { sold_out: true } : {}),
  ...(i === 1 ? { contested: true } : {}),
}));

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
 * **A SECOND OPEN ORDER AND AN UNACCEPTED CLOUD ONE — because with one order and an empty inbox
 * the Orders tab had two states nobody had ever measured.**
 *
 * `02-F9`'s Accept tile lives on an inbox row, so a fixture whose inbox is always empty means
 * `OrderList`'s `action` had **never been laid out by this gate at all** — and an accept tile
 * overflowing its row is one of the two defects `apps/pos-electron/CLAUDE.md` records as found by
 * launching rather than by any suite. `03-F46`'s ordering note is likewise only drawn when there
 * is more than one row to order, so a one-row list could not show it.
 *
 * `confirmed_at` is the branch-consensus confirm anchor (`01-F43`) and the second open order is
 * given a LATER one than `A-014`, so `byOldestConfirmFirst` has something to actually sort.
 */
const SECOND_ORDER: OpenOrder = {
  order_id: "order-gate-2",
  reference: "A-015",
  channel: "counter",
  order_type: "takeaway",
  confirmed_at: 1_754_000_500_000,
  /**
   * **`03-F25`'S AGING BADGE, AND THIS FIXTURE IS THE ONLY THING THAT PUTS IT IN FRONT OF THE
   * GATE.** *"The fixture is the real coverage boundary, not the assertions"* — measured twice in
   * this app already (the alarm-band defects and `ManagerApproval`'s dead controls were both
   * invisible until the fixture produced the state). The counter's row now carries a SIXTH element
   * beside the reference, the qualifiers, the money and — in the inbox — an Accept tile, and eight
   * of this app's nine recorded layout defects were a control pushed out of a box that was costed
   * before something else was added to it. With no aged order here, `layout:check` measures the
   * row WITHOUT the badge and reports green for a screen that clips it.
   *
   * **Past its own red threshold, and three digits wide, on purpose.** `27-F15`'s fault fill is
   * the widest state the badge renders, and `1 min` and `144 min` are different widths — an order
   * left open across a service is ordinary rather than exotic (`03-F17` only takes it off the
   * queue when every line reaches a terminal service state, and nothing at this tier emits one
   * until settlement). A two-digit fixture would measure the easy case.
   *
   * `A-014` deliberately keeps NO age — it carries no `confirmed_at`, so it is the control for the
   * absent-badge state and the reason `Open orders` draws no `oldest first` note.
   *
   * One badge state is enough for a LAYOUT gate: amber and red differ only in fill colour and
   * `borderRadius`, so their box metrics are identical. Colour-state coverage belongs to
   * `packages/ui`'s dom suite and `AgeBadge.stories.tsx`.
   */
  aging: { minutes: 144, amberAt: 10, redAt: 20 },
  total_paisa: 96_000,
  paid_paisa: 0,
  lines: [
    {
      line_id: "line-4",
      name: "Seekh Kebab",
      quantity: 2,
      modifiers: [],
      removals: [],
      note: null,
    },
  ],
};

/** `02-F9`'s inbox row: a storefront order that has arrived and has not been accepted. */
const CLOUD_ORDER: OpenOrder = {
  order_id: "order-gate-3",
  reference: "W-207",
  channel: "storefront",
  order_type: "delivery",
  confirmed_at: null,
  total_paisa: 132_500,
  paid_paisa: 0,
  lines: [
    {
      line_id: "line-5",
      name: "Chapli Kebab",
      quantity: 3,
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

/**
 * **A MID-SERVICE DRAWER, and this fixture was `{ shifts: [], days: [] }` — which is why nobody
 * had ever measured the Cash or Me tabs doing their actual job.**
 *
 * `main.ts`'s own blind-spot list names this state by hand: *"the states still NOT scripted are
 * the ones to worry about — **an open shift with a counted drawer**, a 300-item catalogue …"*. It
 * matters more here than the phrasing suggests, because both surfaces are almost entirely
 * CONDITIONAL on it: with no shift open, Cash draws two tiles and no reconciliation at all, and
 * `MeSurface` draws one sentence. The gate was measuring the empty case on five panels and
 * reporting 65 green surfaces, and `02-F23`'s five-row expected-by-method statement, the
 * over/short figure, the opening float and `02-F43`'s unbound bucket had **never been laid out by
 * anything but happy-dom**, which lays nothing out.
 *
 * Every value below is a shape the `shift_cash` fold really produces (`FOLDS.md`): `expected_json`
 * carries only the methods actually tendered, a closed shift carries its `expected_at_close_json`
 * snapshot and a signed `variance_paisa`, and the unbound bucket is `02-F37`/`02-F43`'s.
 */
const CASH_STATE: CashState = {
  shifts: [
    {
      shift_id: "shift-open",
      cashier: "user-hina",
      prev_shift_id: "shift-earlier",
      open_at: 1_754_000_000_000,
      expected_json: JSON.stringify({ cash: 1_284_500, card: 340_000, raast: 96_000 }),
      paid_out_paisa: 30_000,
      no_sale_count: 2,
      closed: 0,
      counted_cash_paisa: null,
      expected_at_close_json: null,
      variance_paisa: null,
      exceptions_json: "[]",
    },
    {
      shift_id: "shift-earlier",
      cashier: "user-hina",
      prev_shift_id: null,
      open_at: 1_753_900_000_000,
      expected_json: JSON.stringify({ cash: 872_000, card: 155_000 }),
      paid_out_paisa: 0,
      no_sale_count: 0,
      closed: 1,
      counted_cash_paisa: 877_500,
      expected_at_close_json: JSON.stringify({ cash: 872_000, card: 155_000 }),
      variance_paisa: 5_500,
      exceptions_json: "[]",
    },
  ],
  days: [
    {
      day_id: "day-open",
      business_date: "2026-08-07",
      prev_day_id: null,
      opening_float_paisa: 500_000,
      deposit_paisa: 0,
      closed: 0,
      counted_cash_paisa: null,
      exceptions_json: "[]",
    },
  ],
  unbound: [
    {
      settlement_attempt_id: "attempt-unbound",
      order_id: "order-9",
      method: "cash",
      amount_paisa: 45_000,
      anomaly: "unbound_settlement",
    },
  ],
  unbound_drawer: { no_sale_count: 3, paid_out_paisa: 12_000, exceptions_json: "[]" },
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
      /**
       * **`27-F11c` / `00 §5.7` — the panel-fit notice, raised for the whole sweep, and raised
       * for the same reason the catalog refusal above is.**
       *
       * The healthy state is the strictly SMALLER layout — `PanelHealth` renders nothing at all
       * (`27-F16`) — so measuring the raised one measures the worst case, which is what a fixture
       * is for. Left `null`, this whole element would be absent from every strip the gate ever
       * looks at, and the surface would be retired from coverage silently: exactly what
       * `escalationFor: () => null` did to `ManagerApproval` for weeks and what
       * `catalog: null` would do one chip to the left. `main.ts` carries a `24-F14` presence
       * check for it on that precedent.
       *
       * `unmeasured` rather than `too_small`, chosen on the same "faithful, not convenient" rule
       * as the catalog message: it is the **longer** of the two sentences main formats, and this
       * chip sits in a `space-between` row that already carries the actor, three link chips, a
       * catalog notice and the business day. It is also the state a dev machine genuinely is in
       * — macOS reports no physical size, so `panel-density.ts` returns `assumed` on every host
       * this gate has ever run on.
       */
      panelFit: {
        reason: "unmeasured" as const,
        glass: "not measured",
        message:
          "this till could not read its own screen size from the operating system, so every " +
          "touch target on it is drawn from an assumption — 27 §1a's 15.6\" counter panel.",
      },
      user: session,
    }),
  openOrders: () => Promise.resolve([ORDER, SECOND_ORDER, CLOUD_ORDER]),
  kitchenQueue: () => Promise.resolve([]),
  // The channel argument is ignored HERE on purpose: the gate measures geometry, and greying an
  // item for `01-F60`'s unpriced case renders the same box as greying it for an 86. What the
  // fixture must vary is the tile CONTENT (see `MENU`'s reason strings), not the channel.
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
  // `02-F7`. Supplied so the Sold-out grid's tiles are real controls rather than inert boxes —
  // `measureSurface` walks `button`s, and a tile with no handler is still a button, but a
  // fixture that omitted this would be measuring a surface the app cannot actually drive.
  toggleAvailability: () => Promise.resolve({ id: "evt-gate-86" }),
  /**
   * **`02-F27` — A KNOWN CALLER, WITH A REAL ADDRESS, RAISED FOR EVERY LOOKUP.**
   *
   * The fixture is the coverage boundary, and this is the LARGER of the two states the caller
   * strip has: an unknown number renders one short line and a tile, a known one renders a name
   * plus every saved address. `escalationFor: () => null` is what happens when a fixture serves
   * the smaller state — `ManagerApproval` laid out 1162 px in a 632 px box for weeks and every
   * gate was green, because the surface never rendered.
   *
   * The address is long on purpose and faithful rather than convenient: `06-F9` calls it free
   * text, a Pakistani delivery address is a house, a street, a block and a city, and this strip
   * shares a row with a readout, ten digit tiles and a Clear key. A fixture with `"Lahore"` in it
   * would measure a strip no phone order has ever produced.
   *
   * It answers for ANY number, including one digit, so the state is reachable from the first
   * keystroke the gate presses — the real seam answers `known: null` until eleven digits resolve,
   * and driving eleven taps per panel to reach the bigger box would make the sweep's own
   * measurement depend on a normalization rule that is not what this rail is about.
   */
  lookupCustomer: () =>
    Promise.resolve({
      phone_e164: "+923001234567",
      known: {
        name: "Fatima Bibi",
        addresses: [
          { address_id: "addr-1", address_text: "House 12, Street 4, Gulberg III, Lahore" },
        ],
      },
    }),
  recordCustomer: () => Promise.resolve({ id: "evt-gate-customer" }),
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
