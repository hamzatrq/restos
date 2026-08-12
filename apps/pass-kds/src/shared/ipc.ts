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
  /** `03-F52` — would a handover press on THIS ticket do anything? Decided in main, never here. */
  handoverable: z.boolean(),
});
export type PassTicketWire = z.infer<typeof PassTicketSchema>;

export const FactSchema = z.enum(["ok", "degraded", "down"]);

export const PanelNoticeSchema = z.object({
  reason: z.enum(["too_small", "unmeasured"]),
  message: z.string(),
  glass: z.string(),
});

/**
 * `01-F61`'s identification tile, and the WHOLE of what a roster row is on this side of the plane.
 *
 * `01-F28` puts PIN verification in MAIN, so the untrusted end has no use for a credential and is
 * given none — a hash here would be a secret shipped across a bridge for no purpose. There is no
 * role either: `03-F53` rules that *"signing in at the pass grants no authority; it supplies
 * attribution"*, so a role on this wire would be a claim the renderer could not act on and a
 * reviewer could mistake for one it could.
 */
export const PassRosterMemberSchema = z.object({
  user_id: z.string(),
  /** `01-F54` — main degrades to the identifier rather than sending a blank tile. */
  display_name: z.string(),
});
export type PassRosterMemberWire = z.infer<typeof PassRosterMemberSchema>;

/**
 * `03-F53` — *"A refusal says WHICH refusal."* The reason crosses the plane here (and does not on
 * the counter), because being locked out must be distinguishable on the glass from a PIN that was
 * simply wrong: *"a cook who cannot tell those apart re-keys instead of fetching a colleague, and
 * that is the one behaviour that turns a five-minute cooldown into a stopped pass."*
 *
 * `reason` is `z.string()` and not an enum on purpose: `pin-session.ts` owns that closed set
 * (`UnlockRefusal`) and a second copy of it here is a second declaration that can fall out of step
 * — the shape `01-F60`'s enabled-set drift already cost this product once.
 */
export const PassUnlockResultSchema = z.union([
  z.object({ ok: z.literal(true), user_id: z.string() }),
  z.object({ ok: z.literal(false), reason: z.string() }),
]);
export type PassUnlockResultWire = z.infer<typeof PassUnlockResultSchema>;

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
  /**
   * `01-F27` — the DEVICE's own name, and it never becomes a person. `02-F19` says attribution is
   * never anonymous and `01-F27` forbids a device identity standing in for a user identity, so
   * the two axes are two fields. See `PASS_ACTOR` in `main/index.ts`.
   */
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
  /** `03-F52` — may this surface hand over, or is it read-only for `served`? Decided in main. */
  mayHandOver: z.boolean(),
  /** `03-F52`'s owner, so a screen without the assignment can say WHOSE the act is. */
  serveSignalOwner: z.string(),
  /**
   * `03-F53`/`01-F26` — whoever's PIN is in, or `null` for nobody. **The SESSION, not the device.**
   *
   * It rides `passState` rather than a channel of its own, which is the opposite of the choice
   * `apps/pos-electron` made for its roster, and the difference is argued rather than copied: the
   * session is decided in MAIN (idle auto-lock fires with no tap and no unlock call in sight), and
   * `main/uplink.ts` already pushes `changed` every second so `03-F14`'s colours move. So a lock
   * main decides reaches the glass on the read the screen is already making. The ROSTER keeps its
   * own channel for the counter's reason unchanged: it is reference data (`01-F21`), it changes
   * when somebody is hired, and it has no business on the hottest read on the device.
   */
  user: PassRosterMemberSchema.nullable(),
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
    /** `03-F53` — `no_session`: nobody is signed in, so there is no edge and the door goes up. */
    reason: z.enum(["not_the_owner", "no_session", "nothing_to_mark"]),
    owner: z.string().optional(),
  }),
]);
export type MarkReadyResult = z.infer<typeof MarkReadyResultSchema>;

/**
 * `03-F52` — the handover. **Order-level and nothing else on the wire**: the FR makes one press
 * mark every remaining `ready` line at once, so there is no `line_ids` here to be wrong about, and
 * which lines move is `serve-mark.ts`'s decision from the projection main just read.
 */
export const HandOverRequestSchema = z.object({ order_id: z.string().min(1) });
export type HandOverRequest = z.infer<typeof HandOverRequestSchema>;

export const HandOverResultSchema = z.union([
  z.object({ ok: z.literal(true), lines: z.number().int() }),
  z.object({
    ok: z.literal(false),
    /** `03-F53` — `no_session` on the TERMINAL act most of all: no session, no edge, no bypass. */
    reason: z.enum(["not_the_owner", "no_session", "nothing_to_hand_over"]),
    owner: z.string().optional(),
  }),
]);
export type HandOverResult = z.infer<typeof HandOverResultSchema>;

export const CHANNELS = {
  passState: "restos:pass-state",
  queue: "restos:pass-queue",
  /** `01-F61` — the identification grid's rows. Reference data (`01-F21`), read once. */
  roster: "restos:pass-roster",
  /** `01-F26`/`01-F28` — the identity and the digits go to main; a yes/no comes back. */
  unlock: "restos:pass-unlock",
  markReady: "restos:pass-mark-ready",
  handOver: "restos:pass-hand-over",
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
  /** `01-F61` — the tiles of the identification step, in MAIN's order and never re-sorted. */
  roster: () => Promise<PassRosterMemberWire[]>;
  /**
   * `01-F26`/`01-F28` — POSITIONAL and in this order, matching `createPinSession.unlock(user_id,
   * pin)` and the counter's own bridge. Swapping them is a lookup miss and an `unknown_user`.
   */
  unlock: (user_id: string, pin: string) => Promise<PassUnlockResultWire>;
  markReady: (req: MarkReadyRequest) => Promise<MarkReadyResult>;
  /** `03-F52` — the second, explicit act. Separate from `markReady` because the FR is that. */
  handOver: (req: HandOverRequest) => Promise<HandOverResult>;
  onChanged: (fn: () => void) => () => void;
};
