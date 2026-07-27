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
  actor: z.string(),
  deviceLabel: z.string(),
  businessDay: z.string(),
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
});
export type DeviceState = z.infer<typeof DeviceStateSchema>;

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

export const AppendResultSchema = z.object({ id: z.string() });
export type AppendResult = z.infer<typeof AppendResultSchema>;

/** Channel names. Kept in one place so the preload bridge and main cannot drift apart. */
export const CHANNELS = {
  deviceState: "restos:device-state",
  openOrders: "restos:open-orders",
  kitchenQueue: "restos:kitchen-queue",
  append: "restos:append",
  /** Push: main tells the renderer the folds moved. Carries no data — the renderer re-reads. */
  changed: "restos:changed",
} as const;

/** The shape the preload bridge exposes as `window.restos`. */
export type RestosBridge = {
  deviceState: () => Promise<DeviceState>;
  openOrders: () => Promise<OpenOrder[]>;
  kitchenQueue: () => Promise<KitchenTicket[]>;
  append: (req: AppendRequest) => Promise<AppendResult>;
  /** Subscribe to fold changes. Returns an unsubscribe. */
  onChanged: (fn: () => void) => () => void;
};
