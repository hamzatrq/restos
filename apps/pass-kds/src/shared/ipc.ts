import { z } from "zod";

/**
 * # The ONE plane boundary of this app (`18 §9`, commandment 5)
 *
 * **Commandment 5, the two-plane law: this is an OPERATIONAL screen.** Everything below is served
 * from `packages/sync-client`'s device store and nothing else — no tRPC, no TanStack Query, no
 * HTTP. A pass screen that asked the cloud for its queue would go blank the moment the WAN did,
 * and `00 §5.1` forbids that outright: no in-branch feature may require WAN.
 *
 * The renderer has no Node access and no `ipcRenderer`; it calls `window.restos.*`, which is
 * `preload/index.ts` and nothing else. There is deliberately no generic `invoke` and no channel
 * parameter — a bridge that can be handed an arbitrary channel name is `ipcRenderer` with extra
 * steps, and the ban exists so the set of things this renderer can ask for is auditable by reading
 * one file.
 */

/** `03-F13`'s "line summary", one row per line. */
export const PassLineSchema = z.object({
  line_id: z.string(),
  name: z.string(),
  quantity: z.number().int(),
  /** `01 §4`'s vocabulary, or `null` for an `01-F31` contested line the fold refused to decide. */
  state: z.string().nullable(),
  done: z.boolean(),
});

/**
 * `03-F13`'s card.
 *
 * **What is absent is the point, and it is the corpus's strongest anti-scope statement**
 * (`03-F23`): no priority, no sequence number, no "cook this next". Also absent: **money**
 * (`03-F32` — the kitchen data model has no money field at all) and **ETAs** (`03 §3` forbids the
 * kitchen displaying one). A field added here is a field a screen can draw, so the schema is the
 * place those refusals are cheapest to hold.
 */
export const PassTicketSchema = z.object({
  order_id: z.string(),
  reference: z.string(),
  channel: z.string(),
  order_type: z.string().nullable(),
  tables: z.array(z.string()),
  table_conflict: z.boolean(),
  /** The branch-consensus confirm stamp — the key the list is sorted by (`03-F13`, `27-F7`). */
  confirm_at: z.number().int(),
  minutes: z.number().int().nonnegative(),
  amberAt: z.number().int().positive(),
  redAt: z.number().int().positive(),
  lines: z.array(PassLineSchema),
  linesDone: z.number().int().nonnegative(),
  linesTotal: z.number().int().nonnegative(),
  bumpable: z.boolean(),
});
export type PassTicketWire = z.infer<typeof PassTicketSchema>;

export const FactSchema = z.enum(["ok", "degraded", "down"]);

export const PanelNoticeSchema = z.object({
  reason: z.enum(["too_small", "unmeasured"]),
  message: z.string(),
  glass: z.string(),
});

/**
 * Everything the shell needs that is not the queue.
 *
 * `panelPpi` is `27-F68`'s density and it crosses the plane because `PanelRoot` is in the
 * RENDERER and the display is in MAIN. `apps/pos-electron`'s mutation matrix measured what
 * happens when that field is dropped from the projection — the gate stays GREEN and only a
 * hand-written seam assertion sees it — so `__acceptance__/pass-seam.test.ts` carries one here.
 */
export const PassStateSchema = z.object({
  deviceLabel: z.string(),
  /** `02-F19` — attribution is never anonymous. See `PASS_ACTOR` in `main/index.ts`. */
  actor: z.string(),
  businessDay: z.string(),
  lan: FactSchema,
  hub: FactSchema,
  cloud: FactSchema,
  panelPpi: z.number().positive(),
  panelFit: PanelNoticeSchema.nullable(),
  /** `03-F24` — may this surface mark ready, or is it read-only for states? */
  maySignal: z.boolean(),
  /** The owner the layer-2 assignment names, so the screen can say WHY it is read-only. */
  readySignalOwner: z.string(),
});
export type PassStateWire = z.infer<typeof PassStateSchema>;

/** `03-F16` — per line, or the whole order when `line_ids` is null (`03-F24`'s "all at once"). */
export const MarkReadyRequestSchema = z.object({
  order_id: z.string().min(1),
  line_ids: z.array(z.string().min(1)).nullable(),
});
export type MarkReadyRequest = z.infer<typeof MarkReadyRequestSchema>;

export const MarkReadyResultSchema = z.union([
  z.object({ ok: z.literal(true), events: z.number().int(), lines: z.number().int() }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["not_the_owner", "nothing_to_mark"]),
    owner: z.string().optional(),
  }),
]);
export type MarkReadyResult = z.infer<typeof MarkReadyResultSchema>;

export const CHANNELS = {
  passState: "restos:pass-state",
  queue: "restos:pass-queue",
  markReady: "restos:pass-mark-ready",
  /** Push: main tells the renderer the folds moved. Carries no data — the renderer re-reads. */
  changed: "restos:changed",
} as const;

/**
 * The bridge contract. Every member is REQUIRED — there is no optional read here, because
 * `apps/pos-electron`'s catalog-health round measured what optionality costs: a host that stops
 * supplying an optional member goes quiet with every gate green, and exactly one hand-written test
 * separates that from the shipped wiring.
 */
export type PassBridge = {
  passState: () => Promise<PassStateWire>;
  queue: () => Promise<PassTicketWire[]>;
  markReady: (req: MarkReadyRequest) => Promise<MarkReadyResult>;
  onChanged: (fn: () => void) => () => void;
};
