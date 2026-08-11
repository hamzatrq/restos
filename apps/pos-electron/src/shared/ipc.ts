import { ORDER_CHANNELS } from "@restos/domain";
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
   * `01-F56` / `DEC-SYNC-011` — **a catalog version this device REFUSED.** `null` is healthy.
   *
   * The sibling of `blocked` directly above, and it exists for the same reason on the same
   * authority. `01-F56` makes a refusal *"observable in device health (`15`) like any other
   * blocked cursor (`DEC-SYNC-011`)"*, and `DEC-SYNC-011` (a) names both destinations for that
   * observability — *"surfaced to fleet health (doc 15) **and the honesty UI**"*. `blocked`
   * carried its half from the start; this half stopped at `Uplink.catalogRefusal` with **no
   * consumer**, so a till could sit refusing every menu update it was sent while the strip showed
   * nothing and the grid drew a stale catalogue as if it were current — `00 §5.7` (*"stale is
   * never presented as live"*) inverted on the surface a cashier stands at.
   *
   * **This is a SHAPE change in code and not a new state (Commandment 2).** No `01 §4` event type
   * and no order state is added or touched; the fact already existed on `CloudSessionStatus` and
   * simply had nowhere to go.
   *
   * **The wording is formatted in MAIN**, on `AlarmSchema`'s precedent lower in this file: *"a
   * band assembled in the renderer from a reason code would put the operator-facing wording on
   * the untrusted side of `18 §9`'s bridge, one copy per screen."* The sentence has to separate
   * *"this till refused the menu it was sent"* from *"this till has not heard from the cloud"* —
   * the second is what the three reachability facts above report — and those are one careless
   * word apart if each screen writes its own.
   *
   * **OPTIONAL, for the reason `panelPpi` below records and with the same stated cost.** Nine
   * files in this app build a `DeviceState` by hand and a required key is a compile error in
   * oracle suites this session may not edit (`24 §3` step 2). The price is that an absent value
   * means "healthy" — which is this wave's recurring defect in miniature, a host that supplies
   * nothing and green tests — so it is held by a hand-written seam assertion
   * (`__acceptance__/catalog-health-seam.test.ts`) and by the layout gate's fixture, exactly as
   * `panelPpi` is. **Required is where it belongs once those harnesses catch up.**
   */
  catalog: z
    .object({
      /** What is wrong, in the operator's words — never a reason code (`00 §5.7`). */
      message: z.string().min(1),
      /**
       * `01-F56`'s monotonic version, as this device actually holds it. `27-F12` requires a
       * status to carry a NUMBER as well as a colour, and this is the number that tells whoever
       * is called whether the till is one menu behind or forty.
       */
      version: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
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
  /**
   * `27-F68` / `00 §7` layer 3 — the density of the glass, in device pixels per physical inch.
   * A dp is 1/160 inch of PHYSICAL size, so this is what turns `27-F8`'s 126 dp keypad into the
   * 79 px it is on `27 §1a`'s 1366×768 counter and the 111 px it is on its 1920×1080 one.
   * `main/panel-density.ts` resolves it — measured from the display, `panel_ppi` only to correct
   * a panel that reports nothing or reports wrong.
   *
   * **Optional, and the optionality is a real cost that is bounded rather than denied.** Every
   * fixture in this app's renderer suites builds a `DeviceState` by hand, and a required field
   * would rewrite eight acceptance files this change has no business touching. The price is that
   * an absent value has to mean something, and what it means is `App.tsx`'s stated fallback to
   * `27 §1a`'s reference counter panel — which is *the* shape of this wave's recurring defect (a
   * host that supplies nothing, and green tests). So it is held by a hand-written seam assertion
   * (`__acceptance__/panel-density.test.ts` §B) and by the layout gate, which measures the pixel
   * sizes that only appear if a real density arrived.
   */
  panelPpi: z.number().positive().optional(),
  /**
   * `27-F11c` / `00 §5.7` — the glass this device is on, measured against the counter layout's
   * physical floor, or `null` when it clears.
   *
   * **This field is the price of the founder's bring-your-own-hardware ruling.** The window used
   * to declare `minWidth: 1366, minHeight: 768` and Electron *prevented* the resize; that floor
   * refused a 1280×800 @13.3″ laptop which renders the whole counter with **zero** violations and
   * admitted a 1366×768 @10.1″ tablet which **clips two surfaces**, because a pixel count is not
   * a size (`27-F11c`). The floor is millimetres now and it clamps to the glass rather than
   * refusing — so the till starts on hardware the layout does not fit, and **this is the only
   * thing that says so on the surface a cashier stands at.**
   *
   * **Optional, on the identical trade `panelPpi` and `catalog` above record**, and with the
   * identical cost stated rather than denied: every fixture in this app's renderer suites builds
   * a `DeviceState` by hand, and a required key is a compile error in oracle files this session
   * may not edit (`24 §3` step 2). The price is that an absent value means "the panel is fine",
   * which is this wave's recurring defect in miniature — a host that supplies nothing and green
   * tests — so it is held by a hand-written seam assertion
   * (`__acceptance__/panel-fit-seam.test.ts`) and by the layout gate's fixture, exactly as the
   * other two are. **Required is where it belongs once those harnesses catch up.**
   */
  panelFit: z
    .object({
      /** Closed set: a measured shortfall, or an admission that nothing was measured. */
      reason: z.enum(["too_small", "unmeasured"]),
      /** The operator's sentence, formatted in main (`18 §9`) — never a reason code. */
      message: z.string().min(1),
      /** `27-F12`'s NUMBER: the glass as this device believes it, or that it does not know. */
      glass: z.string().min(1),
    })
    .nullable()
    .optional(),
});
export type DeviceState = z.infer<typeof DeviceStateSchema>;

/**
 * The `01-F26` PIN session, as both planes see it. Derived from the schema above rather than
 * restated, so main's stamp and the screen's read cannot drift into two shapes of one fact
 * (`02-F45`). `null` — the absence of one of these — is LOCKED.
 */
export type Session = NonNullable<DeviceState["user"]>;

/**
 * One row of `01-F61`'s identification roster: a `Session` plus **the role that user holds at
 * this branch**.
 *
 * `01-F26` makes a role a per-(user, location) assignment and it is already in `store.staff`,
 * already read by `main/authorize.ts` to answer Commandment 8 — it was simply never projected to
 * the one screen where the operator could use it. What that cost is small and real: `02-F22`'s
 * role guard means **a cashier cannot open the day**, so on a dev till Ayesha's day-open is
 * refused in main and the only place she learns why is the refusal. The door now says it before
 * she taps.
 *
 * **It authorizes NOTHING, and it must not be read as though it does** (Commandment 8, `18 §5`).
 * This is the same posture as `EscalationOffer.satisfied_by` above: a display fact, projected by
 * main, that a renderer forging would gain exactly nothing by — every write is still gated by
 * `main/authorize.ts` against the registry, never against anything that crossed this bridge.
 *
 * **`null` is a real and expected value, not a defect.** `main/authorize.ts`'s `roleOf` narrows a
 * registry string to a matrix column and returns nothing for a row naming a role `domain` does
 * not carry — reference data arrives over the sync chain and can name anything. A tile for such a
 * user still renders, with no role line: `01-F54`'s degrade-to-what-you-know, and the alternative
 * (guessing "cashier") would put a false claim about a person's authority on the glass.
 *
 * A separate type from `Session` on purpose. `Session` is `DeviceState["user"]` — who is signed
 * IN — and `01-F27` exists because that axis and "who COULD sign in" get conflated the moment
 * they share a shape.
 *
 * ## Why `role` is OPTIONAL and not required, and what that costs
 *
 * Required is where a field like this belongs — a host that forgot it would be a typecheck error
 * rather than a silent absence, which is the whole posture this wave's recurring defect argues
 * for. It is optional for one reason: **`unlock-gate.dom.test.tsx` is an S-0c acceptance oracle,
 * authored from spec text by a session that saw no implementation, and its declared contract is
 * `staff() => Promise<Session[]>`.** Widening the return type to a required field turns that
 * harness red, and an implementer editing the oracle that governs the surface he is implementing
 * is exactly what `24 §3` step 2 forbids — so the contract bends and the test does not.
 *
 * This is the same trade `panelPpi` above records, made for the same reason and with the same
 * remedy: the price of an optional field is that **absent has to mean something**, and what it
 * means here is a card with no role line — indistinguishable from a user with no assignment at
 * this branch. So it is held by a hand-written seam assertion,
 * `main/__acceptance__/roster-role.test.ts`, which is what `seams:check` structurally cannot
 * express (a field on a mapping is neither an unreached export nor an unsupplied optional).
 */
export const RosterMemberSchema = z.object({
  user_id: z.string().min(1),
  display_name: z.string().min(1),
  role: z.string().min(1).nullable().optional(),
});
export type RosterMember = z.infer<typeof RosterMemberSchema>;

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
  /**
   * `C19`/`C31` — the four projected facts the **Orders** tab reads, and the reason they are
   * `.optional()` rather than required.
   *
   * They come straight off `OpenOrderRow`, which has carried all four since T-01-15; nothing
   * in the fold changed to expose them. What stops them being REQUIRED is the same constraint
   * `RestosBridge.cashState` records below: `counter.dom.test.tsx` and
   * `unbound-settlement.dom.test.tsx` each build fixtures through
   * `(over: Partial<OpenOrder> = {}): OpenOrder => ({ … })`, so a new required key is a
   * **compile error in two oracle files this session may not edit** (`24 §3` step 2) — for a
   * surface neither of them exercises.
   *
   * The degrade is honest and is what `01-F54`/`01-F17` ask for: a host that does not supply
   * these serves an EMPTY cloud inbox rather than a wrong one. `undefined` means "this host
   * did not say", which is deliberately **not** the same as `confirmed_at: null` ("said, and
   * it is unconfirmed") — a screen that conflated the two would accept-button an order it
   * knows nothing about. `orders-tab.dom.test.tsx` §D is what pins that distinction, and the
   * shipped gateway supplies all four (`main/gateway.ts`), with
   * `__acceptance__/orders-seam.test.ts` failing if it stops. **Required is where these belong
   * once those two harnesses catch up.**
   */
  channel: z.enum(ORDER_CHANNELS).optional(),
  /** `02-F1`'s other axis. Still an open string in the registry — the asymmetry `Counter` names. */
  order_type: z.string().nullable().optional(),
  /**
   * `02-F8`/`02-F9` — the confirm anchor as branch-consensus milliseconds (`01-F43`), or `null`
   * for an order that has not been accepted. This is the field the cloud inbox is keyed on and
   * the field `03-F46`'s chronological ordering is taken from.
   */
  confirmed_at: z.number().int().nullable().optional(),
  /** `01-F33` — 0/1, matching the fold's column. A settled order is recall-only (`02-F10`). */
  settled: z.number().int().optional(),
  /**
   * `03-F25`'s aging timer for THIS order — whole minutes since the confirm anchor, plus
   * `03-F14`'s two threshold minutes for this order's TYPE.
   *
   * > 03-F25 timers from `order.confirmed` on every queue surface (pass, KDS, **POS T1 panel**,
   * > manager console).
   *
   * **Computed in MAIN, never in the renderer, and that is a standing-law question rather than a
   * taste one.** An age is `now − confirmed_at`; `confirmed_at` is branch-consensus time stamped
   * at append (`01-F43`), so `now` must be branch time too — `wallClock.now() +
   * branchTimeStatus().offset_ms` — and `18 §9` gives the renderer no channel to
   * `branchTimeStatus()`. A renderer subtracting `Date.now()` would be reading the RAW device
   * clock on the untrusted side of the plane boundary, which is the quantity `01-F45` demotes to
   * a forensic hint. `01-F43` permits the difference by name: *"All durations — kitchen age, ETA,
   * service intervals (doc 03) — are differences evaluated in branch time, so a uniform offset
   * cancels."*
   *
   * **`null` means this order has no confirm anchor**, which is `02-F9`'s entire inbox and is a
   * resting state rather than an edge. It is deliberately not `{ minutes: 0 }`: `03-F14`'s timer
   * basis is `order.confirmed`, and a zero on a clock is the number `00 §5.7` forbids.
   * `.optional()` for the same reason the four fields above it are — the fixture factories in
   * `counter.dom.test.tsx` and `unbound-settlement.dom.test.tsx` are oracles this session may not
   * edit — and `undefined` degrades identically: the order is findable, un-aged (`01-F54`).
   *
   * The wire carries the THRESHOLDS, never a level and never a colour. `packages/ui`'s standing
   * rule is that `AgeBadge` takes *"minutes and thresholds, never a colour"* (`03-F47`, `27-F12`,
   * commandment 6), so the plane boundary must not be where that is quietly resolved.
   */
  aging: z
    .object({
      minutes: z.number().int().nonnegative(),
      amberAt: z.number().int().positive(),
      redAt: z.number().int().positive(),
    })
    .nullable()
    .optional(),
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
/**
 * Which channel's prices the grid is greyed against (`RestosBridge.menu`).
 *
 * `z.enum(ORDER_CHANNELS)` and not `z.string()`, because `02-F42` closed this set and an unknown
 * value is an `01-F4` error at emit. Refusing it HERE, on a display read, is what stops the two
 * ends drifting: a channel the grid can grey against but no order can carry would show a cashier
 * a sellable tile for a channel that cannot exist.
 */
export const MenuChannelSchema = z.enum(ORDER_CHANNELS);

export const MenuItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** `01-F22` — an operational 86, projected by the availability fold and joined here. */
  unavailable: z.boolean().optional(),
  unavailableReason: z.string().optional(),
  /**
   * `01-F22` / `01-F58` — the availability fold's own two facts, carried SEPARATELY from the
   * rendered `unavailable` pair above, and that separation is the point rather than duplication.
   *
   * `unavailable` is a DISPLAY verdict on the Order tab that collapses two different dispositions
   * `01-F60` insists are opposites: an 86'd item (price known, deliberately still sellable —
   * `01-F59`) and an unpriced one (nothing to sell at, refused). One boolean cannot carry both,
   * and `02-F7`'s own surface has to render the first without inheriting the second — a Sold-out
   * grid that greyed unpriced items would be telling the operator they are 86'd when nobody has
   * touched them.
   *
   * `contested` is `01-F58`: two devices disagree and the fold refused to pick a winner. It is a
   * distinct state from `sold_out`, not an intensifier of it, because the act that clears it is
   * different — one toggle supersedes ALL heads at once (`01-F57`), which is why main builds the
   * supersedes link and this shape carries no head ids (see `ToggleAvailabilityRequestSchema`).
   *
   * **Both are OPTIONAL, and absence is a MEANING rather than a gap.** `merge.ts` rules that
   * *"an item the fold has never seen is SELLABLE"* — `01-F22`'s 86 is an explicit act, so no
   * toggle means available and uncontested. A falsy read is therefore the fold's own answer for
   * an untoggled item, not a default standing in for one. (It is also what keeps the ten oracle
   * harnesses that predate this field compiling, which is the reason `cashState` and `alarms`
   * above record for their own optionality — but it is not the reason here, and would not have
   * been sufficient on its own: a required field whose absence meant something ELSE would have
   * had to red those suites instead.)
   */
  sold_out: z.boolean().optional(),
  contested: z.boolean().optional(),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

/**
 * `S-3`/`S-4`/`S-5` — the `shift_cash` fold, as the Cash and Me surfaces read it.
 *
 * ONE read for the whole surface, carrying the fold's own four projections
 * (`sync-client/src/folds/shift-cash.ts`) under their own row names. Not four channels and not a
 * reshaped composite: `26 §8` puts fold logic in one module, and a renderer assembling a fifth
 * shape out of four reads would be that logic reimplemented outside the engine.
 *
 * Every money field is `.int()` and — except the signed variance — `.nonnegative()`, for the
 * reason `OpenOrderSchema.total_paisa` states above: `MoneyValue` throws a `RangeError` on a
 * negative and React 19 unmounts the root on a render throw, so a corrupt figure has to be
 * refused at the plane boundary rather than blank a counter mid-service.
 */
export const CashShiftSchema = z.object({
  shift_id: z.string().min(1),
  /** `02-F45` — PROJECTED from the envelope's `actor_user_id`, never a payload field. */
  cashier: z.string().nullable(),
  /** `26 §7`'s carried causal link. `null` is the branch's first shift ever. */
  prev_shift_id: z.string().nullable(),
  open_at: z.number().int(),
  /** `02-F23` "system-expected cash (by method)" — canonical JSON of the methods tendered. */
  expected_json: z.string(),
  paid_out_paisa: z.number().int().nonnegative(),
  no_sale_count: z.number().int().nonnegative(),
  /** 0/1 — SQLite STRICT has no boolean, and the projection matches the table. */
  closed: z.number().int(),
  counted_cash_paisa: z.number().int().nonnegative().nullable(),
  expected_at_close_json: z.string().nullable(),
  /**
   * `02-F23`'s over/short, SIGNED and therefore NOT `.nonnegative()`: "over/short" is two
   * directions, and a magnitude-only field records an over but not a short — the half that
   * costs a cashier her job. `27-F12` turns the sign into a WORD at the screen.
   */
  variance_paisa: z.number().int().nullable(),
  exceptions_json: z.string(),
});
export type CashShift = z.infer<typeof CashShiftSchema>;

export const CashDaySchema = z.object({
  day_id: z.string().min(1),
  /** `01-F46` — Asia/Karachi, 05:00 cutover, derived by the fold through `businessDate`. */
  business_date: z.string(),
  prev_day_id: z.string().nullable(),
  opening_float_paisa: z.number().int().nonnegative(),
  deposit_paisa: z.number().int().nonnegative(),
  closed: z.number().int(),
  counted_cash_paisa: z.number().int().nonnegative().nullable(),
  exceptions_json: z.string(),
});
export type CashDay = z.infer<typeof CashDaySchema>;

/** `02-F37` — a settlement taken with no shift open. Recorded, never refused. */
export const UnboundSettlementSchema = z.object({
  settlement_attempt_id: z.string().min(1),
  /** Null when the attempt key is DISPUTED (`01-F31`): a fold never picks a winner. */
  order_id: z.string().nullable(),
  method: z.string().nullable(),
  amount_paisa: z.number().int().nonnegative(),
  anomaly: z.string(),
});
export type UnboundSettlement = z.infer<typeof UnboundSettlementSchema>;

export const CashStateSchema = z.object({
  shifts: z.array(CashShiftSchema),
  days: z.array(CashDaySchema),
  unbound: z.array(UnboundSettlementSchema),
  /** `02-F43` — the drawer activity that named no shift, COUNTED rather than dropped. */
  unbound_drawer: z.object({
    no_sale_count: z.number().int().nonnegative(),
    paid_out_paisa: z.number().int().nonnegative(),
    exceptions_json: z.string(),
  }),
});
export type CashState = z.infer<typeof CashStateSchema>;

/**
 * `03-F5`'s S1, as it crosses to the screen — the shape `packages/ui`'s `AlarmBand` takes, and
 * deliberately the SAME three fields rather than a richer main-side record projected down.
 *
 * `03-F5` requires the alert to name "the printer and order"; `27-F11d` renders the head and
 * counts the tail. So the two nouns are already inside `message`/`subject` when they cross, and
 * the renderer formats nothing: a band assembled in the renderer from a reason code would put
 * the operator-facing wording on the untrusted side of `18 §9`'s bridge, one copy per screen.
 *
 * `27-F11g` is why this channel exists at all: where paper is the only kitchen channel, this
 * band is the ONLY signal that food is not being cooked.
 */
export const AlarmSchema = z.object({
  id: z.string().min(1),
  /** What is wrong, in the operator's words — not an error code. */
  message: z.string().min(1),
  /** Who or what it concerns: the printer, the order. */
  subject: z.string().min(1),
});
export type Alarm = z.infer<typeof AlarmSchema>;

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

/**
 * `02-F7` — 86 an item, or put it back. **Carries no `supersedes` link**, and that absence is
 * this shape's whole design, exactly as `AddLineRequest` carries no money.
 *
 * `01-F57` makes `availability.changed` converge on a carried causal link: each toggle names the
 * toggles it replaces, and the fold takes the maximal un-superseded set. The heads come from the
 * fold's own `AvailabilityRow.head_ids_json`, which `merge.ts` exports for precisely this purpose
 * — *"so an operator surface can build a correct superseding toggle WITHOUT re-deriving the
 * supersedes-DAG"*.
 *
 * That surface is main, not the renderer. A renderer echoing head ids back over the bridge could
 * echo a stale set, and superseding only the head your screen happened to show leaves the other
 * head standing — the item stays 86'd for ever, which is the failure `merge.ts`'s own comment
 * names. So the renderer says WHICH item and WHICH way, and main reads the heads at append time
 * from the store it alone holds. Same split as identity, event id and `unit_price_paisa`.
 */
export const ToggleAvailabilityRequestSchema = z.object({
  item_id: z.string().min(1),
  /** The state to move TO, never a flip: a toggle read from a stale screen would invert twice. */
  available: z.boolean(),
});
export type ToggleAvailabilityRequest = z.infer<typeof ToggleAvailabilityRequestSchema>;

/**
 * `02-F27` — file the caller. **It carries the DIALLED digits, not `01-F23`'s key**, and that is
 * this shape's whole design exactly as `AddLineRequest` carries no money and
 * `ToggleAvailabilityRequest` carries no supersedes link.
 *
 * `registry.ts` puts normalization *"at the WRITER, upstream of `parseEvent`"* and gives the
 * reason: two normalizers key one number two ways, and one customer becomes two identities in a
 * ledger `01-F1` forbids correcting in place. `18 §9` makes main the trusted side, so a renderer
 * that normalized would be a SECOND writer of that key — sitting on the untrusted end of the
 * bridge, where a stale or compromised build reaches it. So the renderer says WHICH number was
 * dialled and main decides which identity that is.
 *
 * `name` is **required and nullable**, mirroring `customer.created`'s payload for the reason
 * `registry.ts` states there: `null` is a stated fact (`06-F11` creates a customer on first sight
 * from a checkout that captured only a number) and `undefined` is a writer who forgot. `""` is
 * refused because `null` already says *"no name stated"*.
 *
 * `address_text` is optional because `02-F27`'s two events are one act with an optional half — a
 * caller may be filed before she has said where she is. **Nothing in this app supplies it today**
 * and that is a named gap, not an oversight: `06-F9` calls the address free text, `packages/ui`
 * ships no text-entry component, and commandment 6 forbids a raw `<input>` in app code.
 */
export const RecordCustomerRequestSchema = z.object({
  /** The digits as pressed. Unvalidated shape on purpose — main decides if it is a number. */
  dialled: z.string(),
  name: z.union([z.string().min(1), z.null()]),
  address_text: z.string().min(1).optional(),
});
export type RecordCustomerRequest = z.infer<typeof RecordCustomerRequestSchema>;

/**
 * `02-F27`'s lookup answer — *"customer file lookup by normalized phone → name, saved
 * addresses"*.
 *
 * `phone_e164` is `01-F23`'s key **as the trusted side resolved it**: the screen shows WHICH
 * identity it is about to touch, and `null` says the digits so far are not a phone number at all.
 * That is a STATE and never an error — `02-F27` puts the operator mid-call with a caller waiting,
 * so a half-typed number is the normal condition of this field and must be a value the screen can
 * render (`01-F17`: nothing about the customer file blocks the sale).
 *
 * `known: null` is `02-F27`'s *"unknown number"* — a number that resolves fine and has no file
 * yet, which is the branch that leads to inline creation.
 *
 * **`02-F27`'s ORDER HISTORY and "repeat last order" are deliberately absent.** They are
 * unbuildable today: `order.created`'s payload declares `order_id`, `channel`, `order_type?` and
 * `table_id?` and nothing else, and `01 §4`'s order family has no `order.customer_linked` — so no
 * event in the corpus can say which customer an order is for. `02-F10` (*"open orders searchable
 * by … customer phone"*) and `02-F14` (*"khata requires a linked customer"*) are the FRs that
 * would authorise the field; adding it is a `packages/domain` change and a protected-path review.
 */
export type CustomerLookup = {
  readonly phone_e164: string | null;
  readonly known: {
    readonly name: string | null;
    readonly addresses: readonly { readonly address_id: string; readonly address_text: string }[];
  } | null;
};

export const AppendResultSchema = z.object({ id: z.string() });
export type AppendResult = z.infer<typeof AppendResultSchema>;

/**
 * `02-F20`'s LOCAL path, as the two planes see it.
 *
 * The FR gives escalation *"two equivalent authorization paths — local manager PIN on the POS;
 * remote approval via manager console (doc 05)"*. Only the first is Wave 1, and until it existed
 * `can()`'s third outcome was a flat refusal at the seam: an above-threshold paid-out (`05-F19`)
 * could not be performed at all, by anyone, on a device with no console attached.
 *
 * **What crosses on this schema is an OFFER, never a verdict.** `escalationFor` answers "would a
 * manager credential close this gap, and whose?" — read off the matrix (`can().satisfied_by`),
 * never hardcoded in a screen (`18 §5` bans the inline role check, and a screen that listed
 * "manager" would be that check relocated into UI). It authorizes nothing: the write is still
 * refused by `main/authorize.ts` and still authorized by `escalate`, so a renderer that lied
 * about this answer would gain exactly nothing (Commandment 8).
 */
export type EscalationOffer = {
  /**
   * `02-F20` — the roles whose credential satisfies it, straight off `can().satisfied_by`, which
   * derives them from the matrix row. Never empty on an offer: a gap no role can close is not an
   * escalation, and offering a pad for one would be a control that cannot succeed.
   */
  readonly satisfied_by: readonly string[];
};

/**
 * Why a manager-PIN approval was refused. FOUR causes, kept apart because the operator's next
 * act differs for each, and a single "no" would send her to re-key a PIN that was already right.
 *
 * - `bad_pin` — `01-F28`/`01-F61`: the PIN did not verify, or this (device, user) pair is locked
 *   out. Collapsed on purpose: the pad must not report which, or it becomes an oracle for how far
 *   through a lockout an attacker is.
 * - `self_approval` — `02-F38`: *"a requester never sees an approve control for their own
 *   request … refused server-side by the `domain` permission matrix"*.
 * - `not_permitted` — the credential verified and the matrix still says no. `02-F20`'s approver
 *   must actually HOLD the permission, and "a manager PIN was entered" is not that fact.
 * - `not_escalatable` — the underlying write was never an `escalate` in the first place. A
 *   manager PIN does not launder a `deny`, and it does not manufacture an approver for an act
 *   that needed none.
 * - `no_reason` — a DENIAL with no stated reason (August 2026, with `05-F6`'s deny half).
 *   `approval.denied.reason` is `z.string().min(1)` in `packages/domain` and `05 §4` reads it back
 *   at the counter (*"the paid-out stays pending at the POS with the denial reason"*), so a denial
 *   that states none is not expressible. Refused rather than defaulted: a sentence supplied by
 *   this app would be words no FR gives (commandment 2). It cannot arise from the shipped pad,
 *   which requires a reason before the control is live — it is the trusted side enforcing a
 *   precondition the UI also enforces, per `18 §9`, never instead of it.
 */
export const ESCALATION_REFUSALS = [
  "bad_pin",
  "self_approval",
  "not_permitted",
  "not_escalatable",
  "no_reason",
] as const;
export type EscalationRefusal = (typeof ESCALATION_REFUSALS)[number];

/**
 * A STRUCTURED result rather than a thrown error, and that is the one place this channel differs
 * from `append`.
 *
 * A refusal thrown across `ipcMain.handle` reaches the renderer as a rejected promise carrying a
 * stringified message and none of its properties, which is why `Counter.tsx`'s `write` can only
 * swallow and re-read. That is survivable for an unpriced item; it is not survivable here, where
 * a manager is standing at the till and the operator must be told whether to re-key the PIN or
 * fetch somebody else.
 */
export type EscalationResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly refused: EscalationRefusal };

/** Channel names. Kept in one place so the preload bridge and main cannot drift apart. */
export const CHANNELS = {
  deviceState: "restos:device-state",
  openOrders: "restos:open-orders",
  kitchenQueue: "restos:kitchen-queue",
  menu: "restos:menu",
  /**
   * `01-F61` — the roster the identification grid is drawn from, and **a channel of its own**
   * rather than a field on `DeviceState`. `DeviceState` is re-read on every `changed` push
   * (every line added, every order confirmed), and a list that changes when someone is hired
   * has no business riding the hottest read on the device. It is also a different FACT:
   * `DeviceState.user` is who is signed IN, this is who COULD sign in, and `01-F27` exists
   * because those two axes get conflated when they share a home.
   *
   * The same shape and the same reason as `menu` directly above: reference data (`01-F21`),
   * not a fold (`01-F52`).
   */
  staff: "restos:staff",
  /**
   * `02-F23`/`02-F43` — the `shift_cash` fold, for the Cash and Me surfaces. A read like the
   * three above it: the renderer is told what the fold projects and never asks a question of
   * its own (`18 §6`).
   */
  cashState: "restos:cash-state",
  /**
   * `03-F5` — the unacknowledged S1s on this device. **A channel of its own, not a field on
   * `DeviceState`**, on the same argument `staff` records above it and with the opposite cost
   * profile stated honestly: `DeviceState` is re-read on every `changed` push, so riding on it
   * would be free to deliver and would also make a required field on a schema three read-only
   * harnesses construct by hand. The push is what carries it instead — main appends
   * `kot.print_failed` and notifies, and the renderer re-reads both.
   *
   * It is also a different FACT. `DeviceState` is what the shell KNOWS about itself; an alarm is
   * something that HAPPENED and stays until a human acknowledges it.
   */
  alarms: "restos:alarms",
  /**
   * `03-F5`: the alert repeats "until acknowledged". Acknowledgement is main's to record because
   * the alarm lives beside the spooler, not in the renderer — a screen that dismissed its own
   * copy would leave the band on every other surface reading the same device.
   */
  acknowledgeAlarm: "restos:acknowledge-alarm",
  append: "restos:append",
  addLine: "restos:add-line",
  /**
   * `02-F7` — the 86. **A write channel of its own rather than an `append` payload**, for
   * `addLine`'s reason exactly: the event needs a field the renderer must not supply. `01-F57`'s
   * `supersedes` link is read from the fold in main (see `ToggleAvailabilityRequestSchema`), so a
   * generic `append` would put the one convergence-bearing field on the untrusted side of the
   * bridge, where a stale set silently strands an item 86'd for ever.
   *
   * **It was called `setAvailability` for an hour, and `01-F1`'s own tripwire caught it.**
   * `unbound-settlement.dom.test.tsx` filters `CHANNELS` for `/update|patch|delete|amend|bind|
   * rewrite|set[A-Z]/` and asserts the list is empty — *"a `bindShift`/`setShift`/`amend` channel
   * added when shifts land, which is exactly how retro-binding would arrive"*. This channel
   * MUTATES nothing; it appends. But the guard is a check on the NAME, deliberately, because a
   * name is what a future reader goes by — and the fix for a misfiring name-guard is a better
   * name, never a narrower regex. `02-F7` and `01-F22` both call the operator's act a *toggle*,
   * so the vocabulary was already there. **The regex was not weakened.**
   */
  toggleAvailability: "restos:toggle-availability",
  /**
   * `02-F27`/`02-F28` — the caller's file, by the number she is calling from. A READ: nothing is
   * appended and nothing is authorized on this channel.
   *
   * **A channel of its own rather than a field on any existing read**, on `staff`'s argument: this
   * is a different FACT with a different rhythm. `deviceState` and `openOrders` are re-read on
   * every `changed` push, and a lookup answers a question about ONE number that only exists while
   * an operator is typing it — `02-F28` measures thirty seconds from that keystroke, so it must be
   * askable per keystroke and must ride nothing that fans out to the whole shell.
   *
   * It takes an ARGUMENT, which `menu` above already establishes is still a closed vocabulary: it
   * names no table, accepts no filter, and answers one fixed question about the value it is given.
   */
  lookupCustomer: "restos:lookup-customer",
  /**
   * `02-F27` — *"unknown number → inline customer creation (`customer.created`,
   * `customer.address_added`)"*, as ONE act.
   *
   * **A write channel of its own rather than an `append` payload**, for `addLine`'s and
   * `toggleAvailability`'s reason exactly: the events need a field the renderer must not supply.
   * Here it is `01-F23`'s KEY — `registry.ts` puts normalization at the writer because two
   * normalizers make one customer two identities, permanently (`01-F1`) — so a generic `append`
   * would put the identity itself on the untrusted side of the bridge. Exactly `addLine`'s
   * argument with an identity in place of a price.
   *
   * It is also why the two events are one call: `02-F27` names them in one clause, and a screen
   * that could append the create and lose the address would leave a delivery order with a customer
   * and nowhere to send the food (`09-F10` reads that text off the assigned order).
   */
  recordCustomer: "restos:record-customer",
  /**
   * `02-F20` — "would a manager credential close this?", asked of the matrix and answered for
   * display only. A READ: nothing is appended and nothing is authorized on this channel.
   *
   * It exists because the refusal itself cannot cross the bridge. `main/authorize.ts` throws a
   * `WriteRefusedError` carrying `outcome` and `satisfied_by` precisely so *"the screen that
   * eventually asks for a manager PIN reads them off the matrix instead of hardcoding a role"* —
   * and `ipcMain.handle` serializes a thrown error to its message, dropping both. So the screen
   * asks the same guard the same question through the same `decide()`, which is why the offer
   * cannot drift from the refusal.
   */
  escalationFor: "restos:escalation-for",
  /**
   * `02-F20`'s local manager-PIN path. The one channel that carries a credential besides
   * `unlock`, and it takes the SAME one: `01-F28`'s Argon2id verification against the synced
   * registry, keyed by `01-F61`'s durable per-(device, user) counter. A second PIN comparison
   * anywhere in this app would be a second credential surface with its own lockout to forget.
   *
   * `01-F1` is why nothing about the PIN is appended: what lands in the ledger is the approver's
   * IDENTITY on the event (`02-F20` — "the recorded event carries actor + approver either way"),
   * never the digits that proved it.
   */
  escalate: "restos:escalate",
  /**
   * `05-F6`'s other half — *"one-tap approve/**deny**"* — and it is a WRITE, not the absence of
   * one: `registry.ts` makes `approval.denied` a record, because under `01-F1` a decision that
   * left no row cannot later be told apart from a request nobody ever saw.
   *
   * A channel of its own rather than a flag on `escalate`, for the reason `toggleAvailability`
   * records above: the two acts carry different arguments (a denial states a reason and appends no
   * escalated write) and a boolean deciding which of two ledger effects a credential produces is
   * the kind of parameter that gets passed wrong once. It takes the same credential and the same
   * `01-F61` durable counter — `authorize.ts` decides both from ONE reading of `02-F20`'s four
   * refusals, so a denial can never pass a gate a grant would not.
   */
  denyEscalation: "restos:deny-escalation",
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
  /**
   * The grid. **The `channel` argument decides GREYING ONLY and never a price** — say that
   * plainly, because `02-F42` makes channel a price key and this is the one place it crosses the
   * bridge from the untrusted side.
   *
   * `01-F60` gives an unpriced item a disposition opposite to an 86'd one: it cannot be added at
   * all, and is *"rendered disabled in place with its reason"*. Whether an item is unpriced is a
   * question about a `(branch, channel)` pair, so the grid cannot answer it without knowing which
   * channel the operator is working in — and a grid that answered it for `counter` while a
   * foodpanda order was open would grey the wrong tiles and, worse, offer tiles that `addLine`
   * then refuses. That is the grid lying about what is sellable.
   *
   * **No money is at risk in getting this wrong.** `gateway.addLine` resolves `unit_price_paisa`
   * from the ORDER's own channel, read out of the store on the trusted side (`01-F60`, `02-F1`:
   * set at creation, never inferred later). A renderer that passed a wrong channel here mis-greys
   * its own grid and cannot mis-price a line. The two reads are deliberately not shared.
   */
  menu: (channel: string) => Promise<MenuItem[]>;
  /**
   * `01-F61` — who could sign in on this device. **The ORDER is part of the contract**
   * (`27-F4`): main supplies it and the renderer renders it unsorted, because a renderer-side
   * sort cannot be stable — it re-ranks the grid the moment a name changes, and a tile learned
   * by position is what makes this surface usable to a non-reader (`21 §5`).
   *
   * Carries `RosterMember`, so **no `pin_hash` crosses this bridge**. The renderer never verifies
   * anything (`01-F28` puts that in main), so a credential hash on this side would be a
   * secret shipped to the untrusted end of the seam for no purpose at all.
   *
   * It carries the `01-F26` ROLE, which `RosterMember` explains: a display fact that authorizes
   * nothing, projected because the one screen that could use it was the one screen without it.
   * A `RosterMember` is a `Session` plus that field, so every existing consumer still typechecks.
   */
  staff: () => Promise<RosterMember[]>;
  /**
   * `02-F23`/`02-F37`/`02-F43` — the `shift_cash` projection behind the Cash and Me surfaces.
   *
   * **OPTIONAL, and it is the only optional member on this contract.** That asymmetry is
   * deliberate and it is not a design preference — it is what the existing acceptance suites
   * already pin. `unlock-gate.dom.test.tsx` closes its harness with `satisfies RestosBridge`
   * *"so a bridge missing `staff` … is a compile error"*, and `counter.dom.test.tsx` /
   * `unbound-settlement.dom.test.tsx` stub the bridge as plain objects. All three are oracles
   * this session may not edit (`24 §3` step 2), and all three were written before this channel
   * existed — so a REQUIRED member here reds a typecheck and three suites at once, for a
   * surface none of them exercises.
   *
   * It is also the honest shape while that is true: `01-F17` and `01-F54` both say the same
   * thing about a read the host cannot serve — DEGRADE, never block. The counter keeps
   * selling; the Cash and Me surfaces show nothing rather than taking the till down. Reported
   * as a finding, because "required" is where this belongs once those harnesses catch up.
   */
  cashState?: () => Promise<CashState>;
  /**
   * `03-F5`'s S1s, and `03-F5`'s acknowledgement.
   *
   * **OPTIONAL, for exactly the reason `cashState` above is, and it is a WORSE fit here — which
   * is why it is reported rather than quietly accepted.** `unlock-gate.dom.test.tsx` closes its
   * harness with `satisfies RestosBridge`, and `counter.dom.test.tsx` /
   * `unbound-settlement.dom.test.tsx` stub the bridge as plain objects; all three are oracles
   * this session may not edit (`24 §3` step 2) and all three predate this channel, so a REQUIRED
   * member reds a typecheck and three suites for a surface none of them exercises.
   *
   * The cost is real and named: `03-F5` forbids a silent KOT failure, and an optional channel
   * means a host that does not serve it shows no band at all. The shipped preload DOES serve it
   * (`preload/index.ts`), and `main/__acceptance__/kot-printing.test.ts` fails if it stops — that
   * assertion is what stands in for the type, until those harnesses catch up.
   */
  alarms?: () => Promise<Alarm[]>;
  acknowledgeAlarm?: (alarm_id: string) => Promise<void>;
  append: (req: AppendRequest) => Promise<AppendResult>;
  /** `C5`/`01-F60` — main resolves the price; no money crosses this call. */
  addLine: (req: AddLineRequest) => Promise<AppendResult>;
  /**
   * `02-F7` — 86 an item, or put it back. **OPTIONAL for the reason `cashState` and `alarms`
   * above record**: three oracle suites this session may not edit stub the bridge and close it
   * with `satisfies RestosBridge`, and all three predate this channel.
   *
   * The cost is the same shape and is named rather than accepted quietly: a host that forgets it
   * shows a Sold-out grid whose taps do nothing. `main/__acceptance__/availability-seam.test.ts`
   * is the assertion that stands in for the type until those harnesses catch up.
   */
  toggleAvailability?: (req: ToggleAvailabilityRequest) => Promise<AppendResult>;
  /**
   * `02-F27`/`02-F28` — the caller's file, and the act that files an unknown one. **Both are
   * OPTIONAL for the reason `cashState`, `alarms` and `toggleAvailability` above record**: three
   * oracle suites this session may not edit stub the bridge and close it with
   * `satisfies RestosBridge`, and all three predate these channels.
   *
   * The cost is the same shape and is named rather than accepted quietly: a host that does not
   * serve them shows a phone surface that takes the number and never answers, and a Save control
   * that does nothing — which is strictly `01-F17`/`01-F54`'s degrade (the order is still created
   * on the `phone` channel, lined and confirmed; the loss is a name). The shipped preload serves
   * both (`preload/index.ts`), and `main/__acceptance__/phone-entry-seam.test.ts` is the assertion
   * that stands in for the type until those harnesses catch up.
   *
   * `lookupCustomer` takes the DIALLED string — see `CustomerLookup` and
   * `RecordCustomerRequestSchema` for why the renderer never normalizes.
   */
  lookupCustomer?: (dialled: string) => Promise<CustomerLookup>;
  recordCustomer?: (req: RecordCustomerRequest) => Promise<AppendResult>;
  /**
   * `02-F20`'s local path, and both members are **OPTIONAL for the reason `cashState` and
   * `alarms` above record**: `unlock-gate.dom.test.tsx` closes its harness with
   * `satisfies RestosBridge` and `counter.dom.test.tsx` / `unbound-settlement.dom.test.tsx` stub
   * the bridge as plain objects. All three are oracles this session may not edit (`24 §3` step 2)
   * and all three predate this channel, so a REQUIRED member reds a typecheck and three suites
   * for a surface none of them exercises.
   *
   * The cost is the same shape and is named rather than accepted quietly: a host that does not
   * serve these shows no approval pad, so an above-threshold act stays refused — which is
   * strictly the behaviour that existed before this path, never a silent success. The shipped
   * preload DOES serve both (`preload/index.ts`), and `__acceptance__/escalation.test.ts` §A
   * fails if it stops.
   */
  escalationFor?: (req: AppendRequest) => Promise<EscalationOffer | null>;
  /**
   * `02-F20`/`02-F38`/`01-F28` — the manager identifies herself, types her PIN, and main decides.
   * Positional and in this order, matching `unlock(user_id, pin)`, because it is the same
   * credential and the same `01-F61` counter behind it.
   */
  escalate?: (
    req: AppendRequest,
    approver_user_id: string,
    pin: string,
  ) => Promise<EscalationResult>;
  /**
   * `05-F6`'s deny half. Same credential, same order of arguments, plus the stated reason
   * `approval.denied` requires — see `CHANNELS.denyEscalation`. OPTIONAL for the reason the two
   * members above record: three oracle harnesses this session may not edit close with
   * `satisfies RestosBridge` and all three predate this channel. The shipped preload serves it and
   * `__acceptance__/approval-record.test.ts` §A fails if it stops.
   */
  denyEscalation?: (
    req: AppendRequest,
    approver_user_id: string,
    pin: string,
    reason: string,
  ) => Promise<EscalationResult>;
  /**
   * `C1`/`01-F28` — hand main **an identity and** the typed digits, and be told whether the
   * device is now unlocked. The boolean is a RESULT, never the lock state: `01-F26`'s idle
   * auto-lock happens with no call in sight, so the screen reads `deviceState().user` for that
   * and this answers only "did that attempt work".
   *
   * `01-F61` is why `user_id` is here and not derived by main from the PIN alone: a pad that
   * matched the entry against every hash on the device would leave a failed attempt belonging
   * to **no** user — so the per-(device, user) counter could not be keyed and would collapse
   * into the device-wide one that FR refuses — and would make two staff who share a 4-digit
   * PIN indistinguishable, writing the wrong cashier into a ledger `01-F1` forbids correcting
   * in place. Positional and in this order, matching `createPinSession.unlock(user_id, pin)`.
   */
  unlock: (user_id: string, pin: string) => Promise<{ unlocked: boolean }>;
  /** Subscribe to fold changes. Returns an unsubscribe. */
  onChanged: (fn: () => void) => () => void;
};
