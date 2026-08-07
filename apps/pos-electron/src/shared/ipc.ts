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
 */
export const ESCALATION_REFUSALS = [
  "bad_pin",
  "self_approval",
  "not_permitted",
  "not_escalatable",
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
  /**
   * `01-F61` — who could sign in on this device. **The ORDER is part of the contract**
   * (`27-F4`): main supplies it and the renderer renders it unsorted, because a renderer-side
   * sort cannot be stable — it re-ranks the grid the moment a name changes, and a tile learned
   * by position is what makes this surface usable to a non-reader (`21 §5`).
   *
   * Carries `Session`, so **no `pin_hash` crosses this bridge**. The renderer never verifies
   * anything (`01-F28` puts that in main), so a credential hash on this side would be a
   * secret shipped to the untrusted end of the seam for no purpose at all.
   */
  staff: () => Promise<Session[]>;
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
