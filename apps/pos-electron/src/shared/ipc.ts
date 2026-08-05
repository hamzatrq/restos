import { z } from "zod";

/**
 * The typed IPC contract — the single seam between the renderer and everything real.
 *
 * `18 §9` requires exactly this shape: the main process owns SQLite, `sync-client`, printing
 * and the cash drawer; the renderer is a plain React app with **no Node access**
 * (`contextIsolation: true`, `nodeIntegration: false`), reaching main only through one
 * preload bridge. Free-form `ipcRenderer.send` from feature code is banned.
 *
 * Two laws are enforced by what this contract **cannot express**, which is the point of
 * writing it as a closed schema rather than a set of loose channels:
 *
 * - **The two-plane law (`18 §6`).** There is no query channel, no SQL, no table name. The
 *   renderer can read the three fold-maintained read models and append an event, and that is
 *   the whole surface. `18 §4`: "Apps NEVER run SQL directly."
 * - **The append-only ledger (`01-F1`).** There is no update, no delete, no patch. A
 *   correction is a new linked event, so the absence of a mutation channel is not an
 *   omission to fill in later — it is the law.
 *
 * Every payload is Zod-validated **on the main side**, because a renderer is the untrusted
 * end of this bridge even though we ship it: a compromised or buggy renderer must not be
 * able to hand the store something the store did not expect.
 */

/** What the shell needs to render honestly (`00 §5.7`, `27-F63`). */
export const DeviceStateSchema = z.object({
  actor: z.string().min(1),
  deviceLabel: z.string().min(1),
  /**
   * `01-F46` — the Asia/Karachi business date, `YYYY-MM-DD`. Constrained to the SHAPE rather
   * than left as any string: the strip renders this verbatim next to "Day", and an empty or
   * malformed value there is a device claiming a business day it does not know, which is the
   * kind of quiet dishonesty `00 §5.7` exists to prevent. Cheap to state, and now actually
   * enforced — nothing parsed these schemas at all until the round-2 fix.
   */
  businessDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "business day must be YYYY-MM-DD"),
  /** 01-F49 — set when this device is bound to a training branch. Not a UI toggle. */
  training: z.boolean(),
  /** Three separate facts, never one dot (00 §5.7). */
  lan: z.enum(["ok", "degraded", "down"]),
  hub: z.enum(["ok", "degraded", "down"]),
  cloud: z.enum(["ok", "degraded", "down"]),
  /**
   * DEC-SYNC-011 — a blocked catch-up cursor is OBSERVABLE. Surfaced here so the honesty UI
   * can show a device that is permanently stuck rather than merely idle.
   */
  blocked: z
    .object({ global_seq: z.number(), event_type: z.string(), reason: z.string() })
    .nullable(),
  /**
   * `01-F26` — the PIN session on this device, and **`null` is LOCKED**. Nullable-required
   * rather than optional for the same reason as `blocked` directly above: an absent key would
   * be a third state with no meaning, on the one field that decides whether the counter is
   * reachable at all.
   *
   * `02-F41` — attribution is whoever's PIN is in, so this is the same fact main stamps into
   * every envelope as `actor_user_id`, read through the same seam (`18 §6`). `02-F45`'s
   * argument is why it is one field and not two: a strip naming one cashier over a ledger
   * attributing another is a disagreement with no rule for which wins.
   *
   * `01-F27` — a device identity is never promoted into a user identity, which is why this is
   * separate from `deviceLabel` and stays null on an unattended till.
   */
  user: z.object({ user_id: z.string().min(1), display_name: z.string().min(1) }).nullable(),
});
export type DeviceState = z.infer<typeof DeviceStateSchema>;

/**
 * The `01-F26` PIN session, as both planes see it. Derived from the schema above rather than
 * restated, so main's stamp and the screen's read cannot drift into two shapes of one fact
 * (`02-F45`). `null` — the absence of one of these — is LOCKED.
 */
export type Session = NonNullable<DeviceState["user"]>;

/** One open order, as the fold projects it. The renderer never assembles this itself. */
export const OpenOrderSchema = z.object({
  order_id: z.string(),
  reference: z.string(),
  /**
   * Integer paisa (`00 §6`). Computed by the fold in BigInt; never summed in the renderer.
   *
   * `.nonnegative()` is load-bearing, not decoration. It was missing while every schema in
   * `domain` carries it, so the two planes disagreed about whether money can be negative —
   * and `MoneyValue` throws a `RangeError` on a negative, which in React 19 unmounts the
   * root and blanks the till. Refusing it HERE, at the plane boundary, is the fix rather
   * than an ErrorBoundary around the render: `01-F54`'s remedy for bad data is to *degrade*
   * — show the identifier, keep the money — and there is nothing to degrade to when the
   * money itself is the corrupt value. A blank region on a counter screen is
   * indistinguishable from a hung app.
   */
  total_paisa: z.number().int().nonnegative(),
  /**
   * `01-F30` — what has been TENDERED against this order, from the fold's own keyed sum. The
   * screen never adds payments up: `01-F31`'s attempt keys are what make a double-tap
   * idempotent, and a renderer summing a list would lose that and re-introduce the double-count
   * the keys exist to prevent.
   *
   * Excludes `repays_receivable` (`DEC-MONEY-007`), so a repaid khata tab can never read as
   * overpaid — which is why this is the fold's number and not a sum of everything named
   * "payment".
   */
  paid_paisa: z.number().int().nonnegative(),
  lines: z.array(
    z.object({
      line_id: z.string(),
      name: z.string(),
      quantity: z.number().int(),
      modifiers: z.array(z.string()),
      removals: z.array(z.string()),
      note: z.string().nullable(),
    }),
  ),
});
export type OpenOrder = z.infer<typeof OpenOrderSchema>;

export const KitchenTicketSchema = z.object({
  order_id: z.string(),
  reference: z.string(),
  /** Branch-consensus minutes (01-F43); never derived from the reading device's clock. */
  minutes: z.number().int(),
  lines: OpenOrderSchema.shape.lines,
});
export type KitchenTicket = z.infer<typeof KitchenTicketSchema>;

/**
 * The sellable grid (`01-F52`, `27-F2`).
 *
 * A FOURTH read, and it is deliberately not a fourth fold: the catalog is REFERENCE DATA, not
 * ledger, and `01-F52` is explicit that no fold may read it — a projected value that embedded a
 * name would depend on catalog sync state at fold time, which is the `01-F34` break law 1
 * exists to prevent. So this channel reads the device catalog directly and the folds stay
 * ignorant of words, which is why the other three channels carry line ids and paisa and never
 * names.
 *
 * Note what is absent: **no price.** `01-F53` snapshots `unit_price_paisa` into the event at
 * line-add, so the grid never needs one and a stale catalog costs a word rather than a rupee.
 * A price here would be a second source of truth for money, and the wrong one.
 */
export const MenuItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** `01-F22` — an operational 86, projected by the availability fold and joined here. */
  unavailable: z.boolean().optional(),
  unavailableReason: z.string().optional(),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

/**
 * The append surface, and note how little of it the renderer controls: it supplies a type,
 * a payload and refs. **Identity, event id, lamport sequence and every timestamp are stamped
 * in main** — `01-F43`'s branch-consensus time is stamped at APPEND, and a renderer that
 * could set its own `branch_created_at` would be a renderer that could forge the clock.
 *
 * `type` is a plain string here and is validated against the `01 §4` catalog in `domain` at
 * append time: `01-F4` makes an unknown type a build-time AND runtime error, and that check
 * belongs where the ledger is, not at an IPC edge a renderer could be persuaded to skip.
 */
export const AppendRequestSchema = z.object({
  /** `01 §4` catalog type. Named `type` because that is what the envelope calls it. */
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  /** 01-F1 — a correction is a new LINKED event, so refs is how a correction points home. */
  refs: z.array(z.string()).default([]),
});
export type AppendRequest = z.infer<typeof AppendRequestSchema>;

/**
 * `C5` — add a line. **Carries no money**, and that absence is the whole design.
 *
 * `01-F53` captures `unit_price_paisa` into the event at line-add, and `01-F60` resolves it from
 * the device's branch and the order's channel. Both of those live in main. A renderer that
 * supplied the price could supply `0` — and this file's own header calls the renderer "the
 * untrusted end of this bridge even though we ship it", a threat model `fc2f69f` made concrete
 * when a remote origin held this exact bridge.
 *
 * So the renderer names WHAT to add and main decides what it costs — the same split that already
 * governs identity, event id and `branch_created_at`.
 */
export const AddLineRequestSchema = z.object({
  order_id: z.string().min(1),
  item_id: z.string().min(1),
  /** Integer units (`00 §6`). Positive: removing a line is `order.line_removed`, not a qty of 0. */
  qty: z.number().int().positive(),
});
export type AddLineRequest = z.infer<typeof AddLineRequestSchema>;

export const AppendResultSchema = z.object({ id: z.string() });
export type AppendResult = z.infer<typeof AppendResultSchema>;

/** Channel names. Kept in one place so the preload bridge and main cannot drift apart. */
export const CHANNELS = {
  deviceState: "restos:device-state",
  openOrders: "restos:open-orders",
  kitchenQueue: "restos:kitchen-queue",
  menu: "restos:menu",
  append: "restos:append",
  addLine: "restos:add-line",
  /**
   * `01-F28` — the PIN is verified ON DEVICE, in main, and the renderer is told yes or no.
   *
   * Note what does NOT happen on this channel: no append. `01-F1` makes a PIN written into an
   * event permanent and unredactable, and `01-F5`'s `audit.login` is main's to write against a
   * store-owned chain. The renderer hands over digits and learns nothing else — not a user id,
   * not a role. It re-reads `deviceState` for that, so lock state has ONE source (`02-F45`).
   */
  unlock: "restos:unlock",
  /** Push: main tells the renderer the folds moved. Carries no data — the renderer re-reads. */
  changed: "restos:changed",
} as const;

/** The shape the preload bridge exposes as `window.restos`. */
export type RestosBridge = {
  deviceState: () => Promise<DeviceState>;
  openOrders: () => Promise<OpenOrder[]>;
  kitchenQueue: () => Promise<KitchenTicket[]>;
  menu: () => Promise<MenuItem[]>;
  append: (req: AppendRequest) => Promise<AppendResult>;
  /** `C5`/`01-F60` — main resolves the price; no money crosses this call. */
  addLine: (req: AddLineRequest) => Promise<AppendResult>;
  /**
   * `C1`/`01-F28` — hand main the typed digits and be told whether the device is now unlocked.
   * The boolean is a RESULT, never the lock state: `01-F26`'s idle auto-lock happens with no
   * call in sight, so the screen reads `deviceState().user` for that and this answers only
   * "did that attempt work".
   */
  unlock: (pin: string) => Promise<{ unlocked: boolean }>;
  /** Subscribe to fold changes. Returns an unsubscribe. */
  onChanged: (fn: () => void) => () => void;
};
