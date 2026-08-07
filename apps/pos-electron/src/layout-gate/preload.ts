import { contextBridge } from "electron";
import type { Alarm, CashState, MenuItem, OpenOrder, RestosBridge, Session } from "../shared/ipc";

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
 *
 * Sizes are kept to what `27 §1a` actually specifies rather than inflated: `27-F11a` computes
 * ~88 tiles per page and ~25 items per category tab, so a 24-item menu is the spec's own page
 * and not a stress test. Overflowing a surface by handing it 300 tiles would be the gate
 * inventing a requirement doc 27 does not make.
 */

const STAFF: Session[] = [
  { user_id: "user-ayesha", display_name: "Ayesha Khan" },
  { user_id: "user-bilal", display_name: "Bilal Ahmed" },
  { user_id: "user-hina", display_name: "Hina Raza" },
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

const bridge: RestosBridge = {
  deviceState: () =>
    Promise.resolve({
      actor: session?.display_name ?? "Counter 1",
      deviceLabel: "Counter 1",
      businessDay: "2026-08-07",
      training: false,
      // `00 §5.7` — three separate facts. `down` is what a gate host honestly is.
      lan: "down" as const,
      hub: "down" as const,
      cloud: "down" as const,
      blocked: null,
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
  append: () => Promise.resolve({ id: "evt-gate" }),
  addLine: () => Promise.resolve({ id: "evt-gate" }),
  escalationFor: () => Promise.resolve(null),
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
