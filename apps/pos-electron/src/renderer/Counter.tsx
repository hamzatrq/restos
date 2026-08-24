import { newId, paisa } from "@restos/domain";
import {
  AppShell,
  Cart,
  formatPaisa,
  type IconName,
  ItemGrid,
  Readout,
  space,
  type Tab,
  TenderPanel,
  TextEntry,
  Tile,
  typography,
  useColor,
  usePhysicalSize,
} from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import type {
  Alarm,
  AppendRequest,
  CashState,
  CustomerLookup,
  DeviceState,
  EscalationOffer,
  EscalationRefusal,
  KitchenState,
  LoyaltyStatus,
  MenuItem,
  OpenOrder,
  RosterMember,
} from "../shared/ipc";
import { CashSurface, MeSurface, openShiftOf } from "./CashSurfaces";
import {
  CORRECTION_EVENT_TYPES,
  LineCorrection,
  type LineCorrectionSubmit,
} from "./LineCorrection";
import { ManagerApproval } from "./ManagerApproval";
import { isCloudInbox, OrdersSurface } from "./OrdersSurface";

/**
 * The counter screen — the first RestOS surface that renders on a device.
 *
 * Composed entirely from `packages/ui`'s closed vocabulary (Commandment 6): there is not a
 * raw primitive or a colour in this file. That is the test of whether the vocabulary is
 * actually complete, and it is why this screen was built before the catalog transport — a
 * component set that has never composed a real screen has never been checked against one.
 *
 * `18 §6` two-plane law: every read here goes through `window.restos`, which is the preload
 * bridge over the main-process gateway. There is no query channel and no SQL, because
 * `shared/ipc.ts` cannot express one.
 */

/**
 * `27-F4` — the rail is POSITIONAL MEMORY, so it is a fixed list and a surface that is not
 * ready is DISABLED IN PLACE with its reason, never absent. Every tab past the first is
 * unbuilt, and saying so is more honest than a rail that grows as the product does and
 * destroys the muscle memory of everyone who learned it early.
 *
 * **These are `screen-map §3.1`'s FIVE surfaces, corrected July 2026.** The rail shipped with
 * four, under three different names, and with **`Me` missing entirely** — and that is not a
 * cosmetic drift: `27-F4` makes adding, removing or reordering an operational item a BREAKING
 * CHANGE, so a tab added after the pilot costs every operator who learned the layout without it.
 * Free to fix now, expensive the day after go-live. Each earns its place in the map:
 *
 *   Order   the default surface — grid + cart, ~150–300 visits a shift
 *   Orders  open and parked orders, and the cloud queue (chronological, paged, `03-F46`)
 *   Pay     separate because `27-F8` puts numeric entry at 126 dp and it cannot share a
 *           layout with 76 dp tiles
 *   Cash    drawer, paid-outs, shift open/close — isolated so a mis-tap on Order can never
 *           reach it. Low frequency, high consequence.
 *   Me      `02-F23`'s "I'm clean" — the cashier's own reconciliation. A PROTECTION surface,
 *           not an admin one, which is why it is a peer tab and not buried in Cash.
 */
const TABS: readonly Tab[] = [
  { id: "order", label: "Order" },
  // `C19`/`C31`. This SHIPS now, and `27-F4` means building it changed exactly one thing:
  // `unavailable` went away. Nothing was added, removed or reordered. `C20` (reject) and `C32`
  // (mark ready) are the two tasks on this row that could NOT be built — both blocked in the
  // kernel rather than here — and `OrdersSurface`'s header names each blocker by FR.
  { id: "orders", label: "Orders" },
  // `C11`–`C14`. This SHIPS now, and `27-F4` means building it changed exactly one thing:
  // `unavailable` went away. Nothing was added, removed or reordered.
  { id: "pay", label: "Pay" },
  // `S-3`/`S-4`/`S-5` — these two SHIP. `27-F4` makes the rail positional memory, so building
  // them changes exactly one thing each: `unavailable` goes away. Nothing is added, removed or
  // reordered, which is what that FR calls a breaking change.
  { id: "cash", label: "Cash" },
  { id: "me", label: "Me" },
  /**
   * `02-F7` — the 86, and a **`27-F4` BREAKING CHANGE requiring PR justification. Here it is,
   * and a reviewer should accept or reject it explicitly.**
   *
   * 1. **It is APPENDED, so no existing tab moves.** `01-F61` reached the same answer for the
   *    other grid a cashier learns by position — *"new members append"* — because ordering by
   *    any key that can re-sort destroys the muscle memory `27-F4` protects. Every one of the
   *    five tabs above keeps its index and its position; a sixth appears to the right of `Me`.
   * 2. **Why a TAB and not a control on the Order screen.** `02-F7` says the toggle is reachable
   *    *"from any POS screen"*, and the tab rail is the only chrome `27-F1` guarantees is on
   *    every screen — so one tab is one tap from everywhere, where a per-screen control would be
   *    five `27-F4` breaking changes instead of one.
   * 3. **Why not a mode on the existing item grid.** That is the tempting shape and `27-F5`
   *    forbids it by name: *"no soft keys"*. A grid tile whose meaning depends on a mode is a
   *    soft key, and here the two meanings are "sell one" (~300×/shift) and "stop the whole
   *    organisation selling it" (`01-F22` fast-paths it to every device and channel driver).
   *    Those must not share a target. On this surface a tile means exactly one thing, always.
   *
   * **The label is `Sold out` and not `86`.** The jargon is what `02-F40` and the FRs use, but
   * `00 §5.6` is English-only UI and 86 is American restaurant slang with no standing in
   * Pakistan; `21 §5` puts the operator at plausibly non-reading, and two digits she has to be
   * TAUGHT are worse than two words she may already know. The tile state still reads `86` — that
   * word is on the tile because `gateway.menu()` writes it, and changing the fold's vocabulary
   * is not this surface's call.
   */
  { id: "soldout", label: "Sold out" },
];

/**
 * `C4` — the three order types `02-F1` names, and **there is no default** (founder ruling,
 * `plans/wave-1/channel-pricing-and-the-counter-loop.md §3.6`).
 *
 * `02-F1` requires `order_type` at creation and forbids inferring it later, so the tap that
 * starts an order has to carry one. Pre-selecting a type would save one tap on ~75 orders a
 * shift and would silently corrupt the axis: a takeaway recorded as dine-in because nobody
 * looked at a pre-selected chip is wrong in a ledger `01-F1` allows no edits to, and
 * `order_type` feeds tax posture (doc 16) and channel economics (doc 12).
 *
 * **`order_type` is still an open string in the registry**, unlike `channel` which `02-F42`
 * just closed. That asymmetry is now the *only* one left on this event, and it is exactly the
 * confusion that let `dine_in` sit in the `channel` field since Wave 0. Closing it is a
 * `domain` change needing its own FR, so it is named here and not done here.
 */
/**
 * The order surface's one-line state, beside the controls that change it. See the comment at
 * its render site for why this exists and what it replaced (a reason stamped onto 30 tiles).
 *
 * `text-label` on purpose: it is a QUALIFIER on the row, and `27-F25` reserves the top of the
 * size ladder for the operational payload — which on this surface is the money and the item
 * names, never the chrome explaining why a control is inert.
 */
const STATE_LINE: React.CSSProperties = {
  fontFamily: typography["text-label"].fontFamily,
  fontSize: typography["text-label"].fontSize,
  fontWeight: typography["text-label"].fontWeight,
  letterSpacing: typography["text-label"].letterSpacing,
  marginLeft: space["space-2"],
};

/**
 * `DEC-MONEY-009` — **is this order already tendered for in full, on THIS device's own fold?**
 *
 * Exported so a suite can drive the predicate directly rather than only through a render, and so
 * the Pay surface below cannot drift from what a test asserts.
 *
 * **It is the SAME comparison `main/settlement-guard.ts` makes, on the same two numbers**, and
 * that is the point rather than a duplication: `gateway.ts` projects `total_paisa` through
 * `billedTotalPaisa` — the guard's own door, at the guard's own cell and step — and `paid_paisa`
 * from the fold's `pay_total`, so this reads the guard's two inputs after one lossless mapping. The
 * refusal is decided in main (Commandment 8's side of `18 §9`); this decides only what the cashier
 * is TOLD, and a screen that used a different rule would offer a `TAKE CASH` the ledger then
 * refuses.
 *
 * ⚠ **THE PROJECTION USED TO BE `billedEffectiveFromJsonLines` AND THE SENTENCE ABOVE STILL SAID
 * "the same two numbers" — it was true until `02-F63` and false after it** (adversarial review of
 * `8ef7cf1`). That helper is tax-blind and unrounded; before R70 it agreed with the guard by
 * construction under `16-F1`'s default cell, and R70's rounding broke the agreement under **every**
 * posture. The measured cost was not this predicate but `TenderPanel`'s `dueP`: at
 * `charge_rounding_paisa = 1000` the screen offered Rs 405 on a bill the guard priced at Rs 410,
 * the cashier keyed exactly what she was shown, and the sale silently did not settle. Fixed at the
 * projection, because the fix belongs where the one source is.
 *
 * **`total_paisa > 0` is the same narrowing and for the same reason** — `0 >= 0` would make every
 * empty order read as settled, and refusing a sale that has not happened is the `01-F17` break
 * this design exists to avoid. It also leaves the OPEN Rs 0-tender defect exactly where it is.
 *
 * **Law 1 (`01-F34`) is not at risk here:** both fields are fold projections (a set derivation and
 * a `26 §7` unique-keyed sum), and this reads them without consulting delivery order, an envelope
 * id, a clock or anything about the reading device.
 */
export const isAlreadySettled = (order: Pick<OpenOrder, "total_paisa" | "paid_paisa">): boolean =>
  order.total_paisa > 0 && order.paid_paisa >= order.total_paisa;

/**
 * `02-F55` — **the three states the kitchen handoff has, and the separating fact is MAIN's.**
 *
 * `none` nothing has been told · `sent` the kitchen has it and owes nothing · `owed` it has
 * been told once and lines have landed since (`03-F55`'s addendum).
 *
 * ⚠ **This was a PRIVATE copy of the union until August 2026 and is now imported** from
 * `shared/ipc.ts`, where `OpenOrderSchema` declares the field it types. One fact with two
 * declarations is `03-F40`'s two sensor bit layouts — the corpus's own worked example — and the
 * hazard here was concrete: this copy and the producer could drift a state apart with every gate
 * green, because the renderer's cast (below, now gone) would have silently accepted a value this
 * union did not list.
 */

/**
 * The projected kitchen state for an order, degrading to `none`.
 *
 * ── WHY THE CAST, AND WHY IT IS NOT A RENDERER DERIVATION ───────────────────────────────────
 *
 * `02-F55` fixes the separating fact as *"lines this device has not yet committed to paper for
 * this order"*, says `printing.ts` already computes it off `03-F4`'s durable spool, and forbids
 * the renderer re-deriving it: a renderer flag is defeated by a relaunch and by `02-F11`'s second
 * terminal, and `01-F53`/`03-F14` keep the confirm anchor a fold fact. So this reads a field and
 * never computes one.
 *
 * **`confirmed_at` is NOT that field and cannot stand in for it**, which is `03-F55`'s whole
 * finding: an order can be confirmed AND still owe the kitchen a chit. Keying on the anchor —
 * the tempting shape, since it already crosses the bridge — passes every idempotence case and
 * silently loses the naan.
 *
 * ✅ **THE HOST SUPPLIES THIS FIELD AS OF AUGUST 2026, and this note used to say it did not.**
 * `main/printing.ts`'s `kitchenFor` computes it from the same `owedChits` walk `confirmed()`
 * sends from — so the state reads `sent` exactly when a press would enqueue nothing — and
 * `main/gateway.ts` projects it onto this row. The cast that used to sit here is gone: the field
 * is declared on `OpenOrderSchema` and parsed at the plane boundary like every other.
 *
 * **The `?? "none"` is NOT dead code and must not be tidied away.** `02-F55` fixes the degrade
 * direction for a host that supplies no projector — *"degrades to state (ii) — pressable —
 * because `01-F54` says degrade to what you know and a duplicate row is a smaller harm than a
 * naan nobody cooks"* — and the gateway omits the key rather than sending `"none"`, precisely so
 * this branch carries that meaning. It is also what an older host's row hits (`01-F54`).
 */
const kitchenOf = (order: OpenOrder): KitchenState => order.kitchen ?? "none";

/**
 * `02-F51` — **WHICH of the branch's open orders this terminal is working on.**
 *
 * Two arms, and the whole FR is in the difference between them.
 *
 * **Chosen (`02-F51` (a)/(c)).** This terminal started an order or recalled one, so the answer is
 * that order and nothing else. When its money side closes it is RELEASED and this returns
 * `undefined` — the surface goes back to its resting state and a tile tap adds a line nowhere.
 * **There is no `?? orders[0]` on this arm and that absence is the assertion**: `orders` is
 * BRANCH-wide (`02-F11`), so falling through would silently re-point the cart at whatever another
 * terminal has open and the next tap would ring a dish onto a stranger's bill — at a price
 * `01-F53` freezes into an append-only ledger `01-F1` forbids correcting. Nothing on the glass
 * would move while it happened.
 *
 * **Never chosen (`02-F51` (d)).** A fresh launch still shows the branch's first open order, which
 * is the `01-F17` compatibility path `DEC-MONEY-009` left behind and which `double-settlement.dom
 * .test.tsx` §A depends on: a till that has claimed nothing must still be able to READ a settled
 * bill and be told so, rather than showing a blank Pay surface to a customer asking about it.
 * Retiring that arm is a ruling with a measured blast radius across suites this FR does not own.
 *
 * **The release test is `isAlreadySettled` — the reading `main/settlement-guard.ts` already
 * makes — and never "some money has arrived".** `02-F13` splits a settlement across methods, so a
 * partial tender must leave the cart exactly where it was: a cashier halfway through a split who
 * lost her order would ring the rest of the split onto nothing.
 *
 * **DERIVED, not stored.** The alternative is an effect that clears `cartOrderId` when the fold
 * says settled; that adds a second writer of this fact and a window in which the two disagree,
 * and it is the window a `changed` push lands in. Reading it out of the projection each render
 * cannot drift.
 */
const cartOrder = (
  orders: readonly OpenOrder[],
  cartOrderId: string | null,
): OpenOrder | undefined => {
  if (cartOrderId === null) return orders[0];
  const chosen = orders.find((o) => o.order_id === cartOrderId);
  return chosen === undefined || isAlreadySettled(chosen) ? undefined : chosen;
};

/**
 * `27 §5` — **`id` is typed `IconName`, so the compiler asks the question `27-F34` asks.**
 *
 * These three tiles are co-displayed and are chosen ~75x a shift by an operator `21 §5` puts at
 * plausibly non-reading, which is exactly the population `27-F31` measured (locally drawn
 * pictograms 20 of 23, imported ones 11 of 23). A fourth row added here with an id outside the
 * vocabulary would be a tile with no symbol standing beside three that have one — the row nobody
 * can identify — and that is now a type error rather than something to notice on a screenshot.
 *
 * The word is unchanged and still rendered: `27-F35`'s comprehension gate has not been run, so
 * the symbol accompanies `Dine-in`, it does not replace it.
 */
const ORDER_TYPES: readonly { id: IconName; label: string }[] = [
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" },
];

/**
 * `02-F1`/`02-F42` — **the channels a counter operator may ORIGINATE an order on**, and this
 * row is a price key rather than a label: it selects which of the catalog's per-channel prices
 * every line of the order snapshots (`01-F60`), frozen by `01-F53` in a ledger `01-F1` forbids
 * correcting in place. `restaurant-os.md` §8 names this item and gives it its reason — *"plus
 * POS quick-entry for phone and foodpanda orders (channel-tagged, ≤30 s — so the 'one queue,
 * all channels' law holds from the first pilot day)"*. Until August 2026 this file pinned
 * `counter` and `02-F28`/`02-F30` had no surface at all.
 *
 * **It is FOUR of `02-F42`'s five, by FOUNDER RULING — this is a transcription now, not an
 * interpretation.** ⚠ *Until August 2026 this list was three and its comment argued the narrowing
 * as a pinned interpretation, naming "offer all five" as the simpler alternative it had declined.
 * The founder ruled the middle answer: the channels a cashier may originate on are* in-restaurant,
 * foodpanda, WhatsApp and call. *`whatsapp` moved from declined to ruled-in; the reasoning below
 * for keeping `storefront` out is unchanged and still load-bearing.*
 *
 * `storefront` is the one that stays absent, because no FR has a counter operator keying one in:
 * `02-F9` puts cloud orders from docs 06/07 in an INBOX pane where they are *accepted*, and
 * `08-F8` auto-confirms aggregator API orders on ingest. A counter-created `storefront` order
 * would be fabricated provenance in the channel-economics axis (docs 12/13) that `02-F42` closed
 * the set to protect. The four that remain each have an FR that puts them here: `counter`
 * (`02-F1`), `phone` (`02-F27`/`02-F28`), `foodpanda` (`02-F30`), `whatsapp` (`02-F42`'s closed
 * set — a channel this restaurant answers on its own number).
 *
 * ⚠ **THE LABEL IS ENGLISH AND THE ID IS PERMANENT — DO NOT "TIDY" THE TWO INTO AGREEMENT.** Two
 * of these rows deliberately read differently from what they store: `counter` is labelled *In
 * restaurant* and `phone` is labelled *Call*. Renaming the ids to match typechecks (this list is
 * `{ id: string }`) and reads beautifully, and it would put an `01-F4` refusal between a cashier
 * and every sale on the busiest channel in the shop — `02-F42` closed the set to these five
 * spellings, `01-F53` snapshots the value into `order.created`, `01-F1` forbids rewriting it, and
 * `01-F60` keys every catalog price by it. Every order this till has ever rung already carries
 * `counter`. The tripwires are `channel-ruling.dom.test.tsx` §C (the label→id pair, per tile) and
 * `main/__acceptance__/channel-ruling.test.ts` §A (the trusted append refuses `in_restaurant` and
 * `call`).
 *
 * **The kernel needed NO diff for this ruling and must not get one:** `ORDER_CHANNELS` in
 * `packages/domain` — a protected path (commandment 10) — already contains `whatsapp`. What was
 * missing was this list, and the dev seed's price column for it (`main/catalog.ts`'s
 * `devPricesFor`): `01-F60` has no fallback, so a channel on this row that the catalog does not
 * price greys **every tile** `no price set`. That is not hypothetical — it is what shipped when
 * this row grew from one channel to three. `channel-ruling.test.ts` §E asserts the two lists agree.
 *
 * The scope tripwire is `channel-ruling.dom.test.tsx` §A (four, discovered from the DOM, never
 * `storefront`) so this cannot widen or narrow by accident. ⚠ *The line here used to name
 * `counter-channel-row.dom.test.tsx`, which has never existed in this repo — a comment promising a
 * protection is worse than no comment, because it retires the assertion someone would otherwise
 * write. The promise was in fact served by `channel-and-soldout.dom.test.tsx` §A, which still
 * guards the no-default rule below.*
 *
 * **There is NO DEFAULT, extending `C4`'s founder ruling one axis over.** `ORDER_TYPES` below
 * records why order type has none: pre-selecting *"would save one tap on ~75 orders a shift and
 * would silently corrupt the axis"*. Every word of that applies harder here, because
 * `order_type` is a reporting axis and `channel` is MONEY — a phone order rung on a
 * pre-selected `counter` chip bills at counter prices, and `01-F53` freezes the mistake. Cost,
 * stated: one extra tap on the counter's second-most-frequent act. **Flagged for founder review
 * as a pinned interpretation, not a transcription** — the ruling was made about `order_type`.
 */
const ORDER_CHANNELS_AT_COUNTER: readonly { id: IconName; label: string }[] = [
  // `27-F4` decides the ORDER, because the ruling's sentence lists a set. The three learned tiles
  // keep the positions a finger already reaches for and the new one is APPENDED — inserting
  // WhatsApp anywhere else moves `Foodpanda`, and reading the sentence positionally would move
  // `Call` past two tiles. Reordering an operational item is a breaking change.
  //
  // ⚠ `id` is typed `IconName`, not `string`, and that is load-bearing rather than tidy: it makes
  // a channel with no drawing a COMPILE error. The icons track's adversarial pass predicted this
  // exact merge — its report says applying the channels hunk over the icons leaves `typecheck`
  // at exit 0 while the symbols vanish, and of the tests that then fail, ZERO mention an icon.
  // The stored ids stay `counter`/`phone` (`01-F53` snapshots the channel and `01-F1` forbids
  // rewriting history); only the LABELS read "In restaurant" and "Call".
  { id: "counter", label: "In restaurant" },
  { id: "phone", label: "Call" },
  { id: "foodpanda", label: "Foodpanda" },
  { id: "whatsapp", label: "WhatsApp" },
];

/**
 * The word a cashier reads for a stored channel id — the one direction of the ruling's mapping
 * that a *display* needs (`00 §5.6`: the screen speaks the product's words, never the ledger's
 * keys).
 *
 * It degrades to the id rather than to a guess, which is `01-F54`'s house rule: an open order on a
 * channel this row cannot originate — `storefront`, arriving through `02-F9`'s inbox — is rare,
 * honest and readable, where a fabricated label would not be.
 *
 * ⚠ **`packages/escpos` has its OWN `CHANNEL_LABELS` and it still reads `Counter`/`Phone`,** so a
 * document printed today disagrees with this screen. That is a real gap, deliberately NOT closed
 * here: `escpos` is a protected path (commandment 10) and whether the ruling reaches paper is a
 * founder question, not an implementer's. Reported, not decided.
 */
const channelLabel = (id: string): string =>
  ORDER_CHANNELS_AT_COUNTER.find((c) => c.id === id)?.label ?? id;

/**
 * Which channel the GRID is greyed against before any order exists.
 *
 * `01-F60` makes "unpriced" a question about a `(branch, channel)` pair, so the grid must name
 * one even when there is nothing to sell into yet. This is a DISPLAY choice and touches no
 * money: `gateway.addLine` resolves the price from the ORDER's own channel on the trusted side.
 * `counter` because that is the column an untagged till would sell on, and because the tiles it
 * greys are inert anyway until a channel and a type are chosen.
 */
const GRID_PREVIEW_CHANNEL = "counter";

/**
 * `02-F30`/`02-F42` — the one channel whose orders are **aggregator-collected**, and therefore the
 * one the Pay surface offers no tender for.
 *
 * `01-F32` scopes its receivable to *"aggregator-collected orders"* and `02-F42` closed `channel`
 * to five values of which `foodpanda` is the only aggregator, so this literal is the whole of that
 * clause as this product can express it. It is a SEPARATE constant from
 * `ORDER_CHANNELS_AT_COUNTER`'s row above on purpose: that list answers *"what may a cashier
 * originate?"* and this answers *"what may she settle?"*, and the two questions have different
 * answers for exactly this value — which is `02-F30` itself.
 *
 * The DECISION is main's (`main/aggregator-settlement.ts` writes the receivable); this decides only
 * what the cashier is TOLD, and a screen that used a different rule would offer a `TAKE CASH` for
 * money nobody will ever hand over.
 */
const AGGREGATOR_CHANNEL = "foodpanda";

/**
 * `02-F27`/`02-F28` — the channel whose flow **begins with a number**, and the only one that
 * raises the caller strip below. A separate constant from `ORDER_CHANNELS_AT_COUNTER` for
 * `AGGREGATOR_CHANNEL`'s reason directly above: that list answers *"what may a cashier
 * originate?"* and this answers *"which one starts with a phone call?"*.
 */
const PHONE_CHANNEL = "phone";

/**
 * `02-F27`'s number pad — ten digits, in the order a keypad has them.
 *
 * ⚠ **IT IS NOT `NumericKeypad`, AND THAT IS THE POINT RATHER THAN A STYLE CHOICE.** That
 * component's own header warns *"THIS IS A MONEY KEYPAD. DO NOT USE IT FOR A PIN"* and gives the
 * leading zero as the first reason; a Pakistani phone number is the SECOND instance of the same
 * trap and nothing in the product said so. `acceptKeystroke` opens
 * `current === "0" ? key : current + key`, which is exactly right for money (`07` is not a rupee
 * amount anyone types) and makes `03001234567` — the form `registry.ts` names as what an operator
 * actually types, and the prefix of every mobile number in this country — **impossible to enter**.
 * Typing `0` then `3` yields `3`, and `3001234567` is a DIFFERENT `01-F23` identity: it misses the
 * repeat customer `02-F28` exists to find, and files a second permanent row for one human in a
 * ledger `01-F1` forbids correcting in place. Its second default, `maxDigits = 7`, truncates the
 * same number at seven.
 *
 * So this composes from `Tile` instead, which is what that header prescribes for a PIN pad and
 * for the same reason — same `27-F8` target, none of the money semantics.
 *
 * `Clear` and not a backspace, copying `App.tsx`'s PIN pad exactly: `27-F4` is positional memory,
 * and two pads on one device that disagree about which cell corrects an entry teach two habits.
 */
const PHONE_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/**
 * **SIX COLUMNS, AND THE NUMBER IS A MEASUREMENT — not a preference and not a copy.**
 *
 * `27-F8` puts numeric entry at **126 dp = 20 mm of glass**, and `27-F68` (b) forbids shrinking
 * the millimetres to make a layout fit: *"the minimum IS the millimetre"*. `pnpm layout:check`
 * enforces it per panel from each panel's own declared geometry, and the first draft of this pad
 * used `posture="counter"` (76 dp = 12.1 mm) — **110 fatal verdicts, ten keys on every one of the
 * eleven panels.** The rail was right: a mis-keyed digit here does not cost a rupee, it files a
 * SECOND permanent identity for one human (`01-F23`, `01-F1`), which is `27-F8`'s "standing,
 * high-consequence entry" exactly.
 *
 * At 20 mm the arithmetic decides the shape. The binding panel is `tablet-10.1` — 1366×768 on
 * 10.1″ glass, 155 PPI, so one key is **122 px** and the work area under `03-F5`'s band is
 * **567 px** (measured: the Cash tab holds 570 px there and is the repo's one known-red verdict).
 * A 3×4 telephone pad is 522 px tall and would leave 45 px for the order-type row, the channel
 * row, the readout and the customer card — so it fits only by taking the whole work area, which
 * moves both learned rows and hides the cart. **6×2 is 260 px**, and the surface keeps every
 * control exactly where it already was (`27-F4`).
 *
 * ⚠ **THE COST IS REAL AND IS A FINDING FOR THE DESIGN OWNER, NOT A SETTLED CALL:** every
 * telephone on earth is 3×4, so a 6×2 pad spends universal muscle memory that this one control
 * could otherwise have had for free. No FR fixes a column count — `27-F8` fixes millimetres,
 * `27-F2` fixes *flat and paged*, `27-F4` fixes *does not move* — and this arrangement satisfies
 * all three. The alternative that keeps 3×4 needs the caller surface to own the whole work area
 * (`paySurface`'s shape), which is a `27-F4` breaking change on two rows and a `screen-map §3.1`
 * question about the cart. Recorded rather than decided by this session (`24 §3b`).
 */
const CALLER_PAD: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, min-content)",
  alignContent: "center",
};

/**
 * The dialled number as the operator reads it back.
 *
 * `text-numeric-primary` because `27-F25` makes numbers the operational payload and the largest
 * element in their region, and on this strip the number IS the payload — `21 §5` puts the operator
 * at plausibly non-reading, so the digits are the one thing here she can certainly use.
 */
const CALLER_NUMBER: React.CSSProperties = {
  fontFamily: typography["text-numeric-primary"].fontFamily,
  fontSize: typography["text-numeric-primary"].fontSize,
  fontWeight: typography["text-numeric-primary"].fontWeight,
  fontVariantNumeric: "tabular-nums",
};

/**
 * `01 §4`'s two EXIT states as the word the cart puts on the row, and `undefined` for a line that
 * is still on the bill.
 *
 * ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────────────────────
 *
 * Measured on a real till in August 2026: after a void, the cart row was **byte-identical to the
 * three live rows beside it** — same name, same quantity, same `✕ NO`, no marker of any kind — and
 * the only evidence anything had happened was the total moving 1,059 → 989. A cashier who voided
 * the wrong dish could not see that she had, and `01-F1` makes the mistake permanent. `27-F12` is
 * what decides the remedy: the state is carried by a **word**, because *"a lone `-` is one glyph
 * wide, is the first thing lost at 1–2 m or on a scratched panel, and means nothing to a
 * non-reader"* — and a strike-through and a grey fill are the same argument in different marks.
 *
 * ── THE PREDICATE IS THE FOLD'S OWN, DELIBERATELY ────────────────────────────────────────────
 *
 * `merge.ts`'s `billedCellPaisa` zeroes a cell on exactly `states.length === 1 && EXITED.has(...)`.
 * This function tests the SAME shape, so the word and the `Rs 0` printed beside it are two
 * renderings of one decision and cannot disagree — which is the whole reason the money is the
 * engine's `billed_paisa` carried across the seam (`26 §8`) and never re-derived here.
 *
 * **`length === 1` is `01-F31` and not a convenience.** A CONTESTED line arrives as its whole
 * terminal MVR set because *a fold never picks a winner*; `CONTESTED_LINE_BILLABLE` is RATIFIED
 * TRUE, so such a line is still BILLED at full value. Saying `VOIDED` over a line the customer is
 * being charged for would be the cart lying about money, and collapsing the set to pick `voided`
 * out of it is the move `line-advance.ts` refuses by name. It therefore renders as an ordinary
 * live row, which is what its money says it is.
 *
 * ⚠ **`served` and `delivered` are terminal and are NOT exits.** They bill in full, so they are
 * absent from this table on purpose — `correctionUnavailable` one file over lists all four because
 * it answers a different question (*can this line still be corrected*), and reading its `TERMINAL`
 * set as this one's would put `VOIDED`'s treatment on every dish that reached a customer.
 *
 * ⚠ **There is no `comp` and no `discount` row here, and there cannot be one today.**
 * `merge.ts`'s `comp.recorded` / `discount.recorded` arms are projection-inert — `DEC-MONEY-010`
 * gate (iii) wants an oracle-pinned merge rule in `26 §7` and `26 §7` records that it is still
 * owed — so the fold projects no per-line comp and no per-line discount at all and this device has
 * nothing to read. `Cart`'s own header states what the cart therefore shows for them and why
 * inventing a device-local marker is refused.
 */
const OFF_BILL_WORDS: Readonly<Record<string, string>> = {
  voided: "VOIDED",
  cancelled: "CANCELLED",
};

/**
 * Exported for the same reason `correctionUnavailable` is: this is the whole of the cart's
 * off-bill policy, so it must be a value an oracle can assert rather than a branch buried in JSX.
 */
export const offBillWord = (states: readonly string[] | undefined): string | undefined =>
  states === undefined || states.length !== 1 ? undefined : OFF_BILL_WORDS[states[0] as string];

export const Counter = () => {
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [orders, setOrders] = useState<readonly OpenOrder[]>([]);
  const [items, setItems] = useState<readonly MenuItem[]>([]);
  /**
   * The `shift_cash` projection behind the Cash and Me surfaces (`02-F23`, `02-F37`, `02-F43`).
   * `null` until the seam answers — and it stays null against a host that does not serve this
   * channel, which is the degrade `01-F54`/`01-F17` require of a read that fails: the counter
   * keeps selling and the two surfaces show nothing, rather than the till going blank.
   */
  const [cash, setCash] = useState<CashState | null>(null);
  /**
   * `03-F5`'s S1s (`27-F11d`: a BAND, never the screen).
   *
   * Empty — not `null` — until the seam answers, and that asymmetry with `cash` above is
   * deliberate: an unread reconciliation must say "reading the day…" because a blank one reads
   * as a clean one, whereas an unread alarm list has nothing to draw either way. A host that
   * does not serve the channel leaves this empty and the counter keeps selling (`01-F17`).
   */
  const [alarms, setAlarms] = useState<readonly Alarm[]>([]);
  /**
   * `02-F20`'s local path, mid-flight: the refused request, and the roles main says would close
   * it. `null` is the ordinary state — a pad is raised only after MAIN has said the matrix
   * escalates this act, never because a screen guessed that it might.
   */
  /**
   * `02-F20`/`02-F61` — is the correction surface open? Renderer state only, appending nothing:
   * choosing to look at a screen is not a ledger fact (`02-F51` (b) makes the identical argument
   * for which order this terminal is on).
   */
  const [correcting, setCorrecting] = useState(false);

  const [pending, setPending] = useState<{ req: AppendRequest; offer: EscalationOffer } | null>(
    null,
  );
  const [approvalRefusal, setApprovalRefusal] = useState<EscalationRefusal | null>(null);
  /**
   * `01-F61` — the roster the approval grid is drawn from, fetched ONLY when an approval is
   * actually raised, and not on mount.
   *
   * Not a performance choice: `cash-tab.dom.test.tsx` and `me-tab.dom.test.tsx` both assert that
   * those surfaces reach for no bridge member outside their own list, and reading the roster on
   * mount reddens both — correctly, because the Cash and Me surfaces have no business asking who
   * could sign in. It is also the honest read for this pad: an approver grid is a per-approval
   * surface with no positional memory to preserve (`27-F4`), so a list that is a moment old is a
   * list that is right.
   */
  const [roster, setRoster] = useState<readonly RosterMember[]>([]);
  const [page, setPage] = useState(0);
  /**
   * `03-F46` — the Orders tab's two lists page independently, and the page numbers live HERE
   * rather than inside `OrdersSurface` for the reason `page` above does: a component that held
   * its own page would reset to page 1 on every `changed` push, i.e. every line any terminal
   * adds, snatching the list out from under a cashier reading page 3.
   */
  const [inboxPage, setInboxPage] = useState(0);
  const [openPage, setOpenPage] = useState(0);
  const [activeTab, setActiveTab] = useState(TABS[0]?.id ?? "order");
  /**
   * Read through the hook, never off the static light record: `27-F67` inverts this surface's
   * polarity for a training branch inside `AppShell`, so a colour baked at module scope would
   * put light-theme text on the dark training shell — the one place `27-F21`'s AA gate is
   * hardest to notice, because everything AROUND it inverted correctly.
   */
  const color = useColor();
  /**
   * `27-F11c` — capacity is a PHYSICAL question, so the grid's surface is MEASURED.
   *
   * This used to be two hardcoded constants naming the `27 §1a` reference panel. On that panel
   * they are right; on a resized window, a 10.1" tablet or the 22" pass display they compute a
   * layout for a screen that is not there — which is what put the cart off the right edge and
   * left two thirds of the window dead.
   */
  const [surfaceRef, gridMm] = usePhysicalSize();
  /**
   * `02-F1`/`02-F42` — the channel the NEXT order will be created on. `null` until chosen, and
   * that is `ORDER_CHANNELS_AT_COUNTER`'s no-default ruling: there is no pre-selected chip
   * behind which a phone order could be rung at counter prices.
   *
   * Renderer state and not a fold read, deliberately. Nothing is appended until `startOrder`, so
   * re-tapping costs nothing and commits nothing — the property `01-F61` requires of the staff
   * grid, where *"selecting a person is not submitting an attempt"*. Once the order exists the
   * LEDGER holds its channel and this stops being the authority (`02-F1`: set at creation, never
   * inferred later), which is why `menuChannel` below reads the order first.
   */
  const [pendingChannel, setPendingChannel] = useState<string | null>(null);
  /**
   * `02-F27` — *"operator types the caller's number"*, exactly as pressed. **The raw digits**, not
   * `01-F23`'s key: `registry.ts` puts normalization at the WRITER and `18 §9` makes main the
   * trusted side, so a renderer that normalized would be a second writer of the identity key —
   * two rules, and one customer becomes two rows. This state's only job is to carry what she
   * pressed to the seam without editing it (see `PHONE_DIGITS` for what "without editing it"
   * cost the one keypad this product already owned).
   */
  const [dialled, setDialled] = useState("");
  /**
   * The customer file's last answer, or `null` for *"nothing has been asked yet, or the ask
   * failed"*. Renderer state and not a fold read: this is the reply to ONE question about ONE
   * number, and it exists only while she is on the call.
   *
   * `null` on a failed lookup is `00 §5.7`'s honesty rule rather than a convenience — a stale
   * answer left on screen would name a customer the file was never asked about. `01-F17` is the
   * other half: none of this gates the order (see the effect below).
   */
  const [caller, setCaller] = useState<CustomerLookup | null>(null);
  /**
   * `02-F27`'s *"inline customer creation"* — the name and `06-F9`'s free-text address, as typed.
   *
   * **Raw, and never trimmed here.** The edit belongs at the ONE place the request is built
   * (`recordCaller`), because a field that rewrote its own value as she typed would eat the space
   * between `Block` and `C` the moment she pressed it. `00 §5.6` forbids rewriting user content at
   * all; the leading/trailing trim at the seam is the operator's slip, not her address.
   *
   * Renderer state and not a fold read, for `dialled`'s reason directly above: nothing is appended
   * until she taps `Save caller`, so these exist only while she is on the call.
   */
  const [callerName, setCallerName] = useState("");
  const [callerAddress, setCallerAddress] = useState("");
  /**
   * `00 §5.7` — **the caller was NOT filed, said out loud.**
   *
   * `true` from the moment a `recordCustomer` is refused until the next attempt or the end of the
   * call. It is a STATE and not an event, which is the whole of why it takes `CatalogHealth`'s
   * shape rather than `AlarmBand`'s: what is true after the refusal is *this caller is not on
   * file*, and it stays true until she is filed or the call ends. An acknowledgement control would
   * take a still-true condition off the screen, which `00 §5.7` forbids in terms.
   *
   * `01-F17` is the other half and it is structural here: this flag reaches nothing but a
   * sentence. The order-type row reads `pendingChannel` alone, so a refused customer record
   * cannot gate the sale — `02-F47` says so outright (*"a denied verdict here costs a name and an
   * address and nothing else"*).
   */
  const [callerRefused, setCallerRefused] = useState(false);
  /**
   * `02-F57` — **THE LAST WRITE THIS SURFACE ORIGINATED WAS REFUSED, said out loud.**
   *
   * `true` from the moment any append through either write helper is rejected until the next
   * attempt. A BOOLEAN and not a message: the refusal's wording is this file's (`00 §5.6` binds
   * it and nothing else fixes it), and carrying main's thrown string would put a developer
   * sentence — or a raw `01 §4` event type — on a counter screen. `02-F57` leaves open whether a
   * refusal names the permission or only the act, and naming the act would need a words table
   * for event types that no FR supplies (commandment 2, and `ManagerApproval`'s owed item is the
   * same gap one surface over). So this says the true thing it can say.
   *
   * It is a STATE about the last attempt and not an event, which is why it takes `02-F47`'s
   * shape — `role="status"`, no acknowledgement control — rather than `03-F5`'s band. See
   * `write` for the three FRs that make the band positively forbidden here.
   */
  const [writeRefusal, setWriteRefusal] = useState(false);
  /**
   * `02-F55` — **the order this surface has already sent, and the kitchen state it was in when
   * it was sent.**
   *
   * The measured defect is a triple-tap: three presses of *Send to kitchen* inside one breath,
   * before any read returns, wrote **three permanent `order.confirmed` rows** (`01-F1`). The
   * projection cannot save that case — the fold has not moved between the presses — so the
   * surface has to remember its own act.
   *
   * **The kitchen state is remembered WITH the id, and that pairing is the whole design.**
   * Keying on the order alone would refuse `03-F55`'s addendum: ring → send → the customer asks
   * for one more naan → send again is a press that MUST reach the kitchen, and a renderer that
   * remembered "I already confirmed this order" would close one silent loss by re-opening the
   * worse one. Remembering the state means the guard expires exactly when the projected fact
   * moves — which is when something new is genuinely owed.
   */
  const [lastSent, setLastSent] = useState<{ order_id: string; kitchen: KitchenState } | null>(
    null,
  );
  /**
   * **The lookup's re-ask counter, and it exists because a SUCCESS was as silent as a failure.**
   *
   * The effect below keys on `[pendingChannel, dialled, callerRevision]`. Without the third the
   * strip goes on saying *"New caller"* about a customer it has just created — main pushes
   * `notifyChanged()` after the record (`main/index.ts`, asserted by
   * `__acceptance__/phone-entry-host.test.ts` §B) and `reload` re-reads the device state, the
   * orders and the menu, but the caller lookup is not one of those three reads. So the wire was
   * there and the consumer was not listening, and the operator taps `Save` again: a second
   * permanent row for one human, which `01-F1` forbids correcting in place.
   *
   * Bumped on the record's own resolution rather than on every `onChanged` push. `01-F24` makes
   * customer data the kind of thing not to read for no reason, and every line-add in the branch
   * moves the folds — this asks again exactly when the answer can have changed.
   */
  const [callerRevision, setCallerRevision] = useState(0);
  /**
   * `17-F17` — *"phone lookup → reward visible → apply"*, first half.
   *
   * **A RENDER and never a cache, which is why it is asked beside the lookup rather than derived
   * from anything held here.** `17-F23` puts the division by `17-F14`'s `N` at read time because
   * `01-F87` forbids a fold reading configuration; a renderer that held this across a campaign
   * change would be showing a reward computed under a rule that no longer applies. It is re-asked
   * on exactly the signals the lookup is.
   *
   * `null` covers every ordinary reason there is nothing to say — no campaign artifact on this
   * device, no active `account_loyalty` programme, a programme scoped to another branch, or a
   * number that is not yet a number. None of them is an error and none reaches the sale
   * (`01-F17`).
   */
  const [loyalty, setLoyalty] = useState<LoyaltyStatus | null>(null);
  /**
   * `02-F6`/`02-F50` — the org's kitchen quick-tags, and in Wave 1 `C7`'s ONLY input.
   *
   * **Read ONCE, in its own effect, and deliberately NOT inside `reload()`.** Measured: putting it
   * in the counter's reload spends an IPC round trip per ledger event — every line, every payment,
   * every peer's event — for a `00 §7` layer-2 value that only moves when an owner edits it and
   * for which there is no `changed` push at all. That is also why `CHANNELS.quickTags` is its own
   * channel rather than a field on `DeviceState` (`shared/ipc.ts` records the same argument from
   * the other end).
   *
   * `[]` on a host that does not serve the member, which is the same rendered absence as an org
   * that has configured none: no tag row, and `C7` unavailable rather than broken (`01-F17` —
   * nothing about a note blocks a sale).
   */
  const [quickTags, setQuickTags] = useState<readonly string[]>([]);
  /**
   * `02-F1` / `01 §4` / `02-F11` — **WHICH open order this till is working on.**
   *
   * ⚠ **This was `orders[0]`, and it was the contributing defect behind `DEC-MONEY-009`.** Two
   * cashiers on two tills serving two customers both got the FIRST row of a branch-wide list —
   * `02-F11` makes an order started on one terminal visible on every other — so they rang two
   * customers into **one bill**, and the double settlement that follows was trivial to trigger
   * rather than exotic. The other half of the same defect was that the order-type row was greyed
   * whenever anything was open (`current !== undefined`), so **there was no way to start a second
   * order at all**: the array was the cart and the array was not this till's.
   *
   * `01 §4` puts an order in play from `order.created` until its money side closes and nothing in
   * `02-F1` limits a branch — or a terminal — to one at a time, so several concurrently open
   * orders is ordinary, specified behaviour. What was missing is only the renderer's answer to
   * *which one am I on*, and that is **screen state and not a ledger fact**: `02-F4`'s
   * `order.parked`/`order.unparked` are the ledger-visible, branch-wide version of the question
   * and they have **no payload schema in `packages/domain`**, so `01-F4` makes them unemittable
   * and C10 stays owed. Nothing here emits anything.
   *
   * **`null` means this terminal has CHOSEN nothing, and that arm alone falls back to `orders[0]`**
   * — see `cartOrder`, which is where both arms and `02-F51` (c)'s release are written down. A
   * non-null value naming a settled order is a RELEASE and never a fallback.
   *
   * **⚠ `setCartOrderId` had ONE call site for a round, and the second one is `02-F51`.** Until
   * August 2026 it was set from `startOrder` alone, so an order started here and then left — for a
   * relaunch, or for the walk to the Orders tab — was reachable only through `orders[0]`: no
   * further lines and **no settlement**. `recallOrder` is that second call site and it discharges
   * `02-F10`'s *"open orders … recallable"*. The comment that stood here filed the gap as blocked
   * on `orders-tab.dom.test.tsx` §E (*"an open-order row carries no control at all"*), which was
   * correct at the time: that file's own test owner rewrote §E for `02-F51` before this landed
   * (`24 §3`), and the assertion it replaced it with — one control per row, and no line-STATE
   * control — is what this must keep satisfying.
   */
  const [cartOrderId, setCartOrderId] = useState<string | null>(null);
  /**
   * `02-F7`'s grid measures its OWN box. A second `usePhysicalSize` rather than sharing the Order
   * tab's, because only one of the two is mounted at a time and a shared ref would hold the
   * measurement of whichever surface rendered last — a grid costed for a box it is not in is how
   * tiles land off-page with no pager to reach them (`ItemGrid`'s own recorded hazard).
   */
  const [soldOutSurfaceRef, soldOutMm] = usePhysicalSize();
  const [soldOutPage, setSoldOutPage] = useState(0);

  /**
   * Which channel the GRID is greyed against — the open order's own, else the pending choice,
   * else `counter`.
   *
   * **The open order wins, and that precedence is the point.** `01-F60` resolves a line's price
   * from the ORDER's channel, so the grid must ask the question `addLine` will ask. Greying
   * against `pendingChannel` while a foodpanda order is open would offer tiles the append then
   * refuses — the grid lying about what is sellable.
   *
   * Declared HERE, above the early return, because hooks may not sit below it and `menuChannel`
   * feeds `reload`'s dependency list. It is the same row the render below draws.
   */
  const current = cartOrder(orders, cartOrderId);
  const menuChannel = current?.channel ?? pendingChannel ?? GRID_PREVIEW_CHANNEL;
  /**
   * `02-F6`'s note target — the LAST line in the cart, which is the last row drawn and therefore
   * the row the tag tiles sit directly under. See `addNote` for why this line and not a selected
   * one, and for the alternative that was refused.
   *
   * The cart's order is the fold's: `json_lines` is canonical (keys sorted) and a `line_id` is a
   * UUIDv7 minted at the add, so the last key IS the last dish rung. That is a DISPLAY reading of
   * an id and not a fold one — no projected value depends on it (`01-F34`), and if it were ever
   * wrong the consequence is a note on the wrong row of a list the operator is looking at, which
   * she can see. `undefined` on an empty cart: there is no dish to qualify, and `02-F6` is an
   * ITEM note.
   */
  const lastLine = current?.lines[current.lines.length - 1];

  const reload = useCallback(async () => {
    // Three reads, never a join in the renderer: the folds already hold these projections and
    // assembling a fourth shape here would be fold logic reimplemented outside the engine
    // (26 §8). The gateway does the one join the queue genuinely needs.
    const [d, o, m, c, a] = await Promise.all([
      window.restos.deviceState(),
      window.restos.openOrders(),
      // `01-F60` — the grid is greyed against ONE channel and this is it. DISPLAY only: the
      // price a line snapshots is resolved in main from the ORDER's channel, never from here.
      window.restos.menu(menuChannel),
      // A FOURTH read, and optional-chained because the member is optional on the contract —
      // see `RestosBridge.cashState` for why that asymmetry exists and what it owes.
      window.restos.cashState?.(),
      // A FIFTH — `03-F5`'s print-failure band. Optional-chained for the same recorded reason,
      // and it is the read where that optionality costs the most: `27-F11g` makes this band the
      // ONLY signal that food is not being cooked. See `RestosBridge.alarms`.
      window.restos.alarms?.(),
    ]);
    setDevice(d);
    setOrders(o);
    setItems(m);
    setCash(c ?? null);
    setAlarms(a ?? []);
    // `menuChannel` is a real dependency and not a lint appeasement: the grid's greying answers
    // an `01-F60` question about a `(branch, channel)` pair, so switching channel MUST re-ask it.
    // The effect below re-subscribes when this identity changes, which is what re-fetches the
    // menu the moment a channel is chosen or an order opens. It converges — once `orders`
    // settles, `orders[0]?.channel` is stable — and the cost of the extra fetch is one IPC read.
  }, [menuChannel]);

  useEffect(() => {
    void reload();
    // The push carries no data — main says "the folds moved" and the renderer re-reads. A
    // push that carried rows would be a second source of truth for what the folds already own.
    return window.restos.onChanged(() => void reload());
  }, [reload]);

  /**
   * `02-F6`'s tag list, asked ONCE. An empty dependency list is the whole point — see `quickTags`
   * above for the measurement. A host that does not serve the member leaves the state at `[]`.
   */
  useEffect(() => {
    void (window.restos.quickTags?.().catch(() => []) ?? Promise.resolve([])).then(setQuickTags);
  }, []);

  /**
   * `02-F27`'s lookup — *"customer file lookup by normalized phone"* — asked **per keystroke**.
   *
   * `02-F28` is a stopwatch: *"a repeat customer's order entered and confirmed in ≤ 30 s FROM
   * NUMBER ENTRY"*. Waiting for a Search tap would spend the budget the FR exists to protect, and
   * `27-F6` would have added a control where a keystroke already says everything. The digits she
   * has pressed so far are the whole question, so every keystroke is a new one.
   *
   * ── `01-F17`: NOTHING HERE GATES THE ORDER ──────────────────────────────────────────────────
   *
   * The order-type row is rendered from `pendingChannel` and nothing else, so a lookup that is
   * slow, unreachable, rejecting or never settling changes exactly one thing on this screen: what
   * the caller strip says. *"A sale is never blocked — not by inventory math, sync, or approval
   * timeouts"*, and a lookup is none of those three, which is precisely why it is the one an
   * implementation forgets. `01-F54` is the same disposition one layer down: the loss is a WORD.
   *
   * ── Why the channel condition, and why `live` ──────────────────────────────────────────────
   *
   * The channel condition is `21 §5`'s: a customer lookup performed for a walk-in sale is work
   * with no task behind it, and `01-F24` makes customer data the kind of thing not to read for no
   * reason. `live` is the out-of-order guard — answers to `0300` and `03001` race, and without it
   * the shorter one can land last and show the operator a file for a number she has moved past.
   *
   * Optional-chained for the reason `RestosBridge.lookupCustomer` records: a host that does not
   * serve the channel leaves the strip saying nothing, and the phone order still rings.
   */
  // `callerRevision` is a RE-ASK signal rather than a value this effect reads, which is the
  // standard React idiom for *the answer changed underneath the same question*. It is what makes
  // a successful `Save caller` visible: main pushes after a record and `reload` re-reads the
  // device state, the orders and the menu — none of which is the customer lookup — so without it
  // the strip goes on offering to file a customer it has just filed and the operator taps again,
  // a second permanent row for one human (`01-F1`). The alternative the lint rule would accept is
  // a SECOND caller of `lookupCustomer` inside `recordCaller`, which puts the `live` out-of-order
  // guard on one path and not the other.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a re-ask signal — see just above.
  useEffect(() => {
    if (pendingChannel !== PHONE_CHANNEL) return;
    if (dialled === "") {
      setCaller(null);
      return;
    }
    const answer = window.restos.lookupCustomer?.(dialled);
    if (answer === undefined) return;
    let live = true;
    void answer
      .then((a) => {
        if (live) setCaller(a);
      })
      .catch(() => {
        // `00 §5.7` — a surface that cannot answer says so, and says it by showing nothing rather
        // than by keeping the last caller's name on the glass.
        if (live) setCaller(null);
      });
    return () => {
      live = false;
    };
    // `callerRevision` is a real dependency and not a lint appeasement — see its declaration.
    // A record that succeeded changed the answer to this exact question, and nothing else in the
    // renderer re-asks it.
  }, [pendingChannel, dialled, callerRevision]);

  /**
   * `17-F17`'s reward, asked of MAIN for the number the trusted side resolved.
   *
   * ── IT KEYS ON `caller?.phone_e164`, NOT ON `dialled` — and that is the load-bearing part ────
   *
   * `dialled` is the digits as pressed; `caller.phone_e164` is `01-F23`'s key as
   * `normalizeDialledPhone` resolved it. Asking with the raw digits would put a second
   * normalization on the untrusted side of the bridge, and two normalizers that each look correct
   * key one number two ways — the defect `registry.ts` spends a paragraph on, arriving through a
   * reward line. It also means this asks once per resolved identity rather than once per keystroke.
   *
   * `orders` is a dependency for the reason `callerRevision` is one on the lookup: this reads a
   * FOLD (`02-F64`'s links and `17-F23`'s redemptions), and the fold moves when the order this
   * caller is on settles, and `reload` replaces `orders` on every one of main's `changed`
   * pushes. Without it the strip would go on saying *"1 more order"* after the order that
   * completed the tenth one was paid.
   */
  // `orders` is a RE-ASK signal rather than a value this effect reads — the same idiom, and the
  // same lint exemption, as `callerRevision` on the lookup directly above. Biome sees a dependency
  // the body never touches; what it is is *the answer to this question changed underneath it*.
  // Dropping it is the change that reads as tidying and silently makes the reward line stale for
  // the rest of the call.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a re-ask signal — see just above.
  useEffect(() => {
    const phone = caller?.phone_e164 ?? null;
    if (phone === null) {
      setLoyalty(null);
      return;
    }
    const answer = window.restos.loyaltyFor?.(phone);
    if (answer === undefined) return;
    let live = true;
    void answer
      .then((a) => {
        if (live) setLoyalty(a);
      })
      .catch(() => {
        // `00 §5.7` / `01-F17` — a surface that cannot answer shows nothing rather than a stale
        // reward. Offering a free coffee this till can no longer justify is the harmful direction.
        if (live) setLoyalty(null);
      });
    return () => {
      live = false;
    };
  }, [caller?.phone_e164, orders]);

  // `01-F17` — a sale is never blocked. A shell that has not loaded its device state yet is
  // the one case where there is genuinely nothing to draw, so it says so in a word rather
  // than rendering an empty counter that looks like a working one with no orders.
  if (!device) return <p>Starting…</p>;

  /**
   * `02-F22` — the shift a settlement binds to, read from the SAME projection and through the
   * SAME helper the drawer writes in `CashSurfaces.tsx` use. One definition, so the money path
   * and the drawer path cannot drift apart; see `openShiftOf` for what it cost when they had.
   *
   * `null` here is a fact about the branch, never a gate: `02-F37` and `01-F17` make settling
   * with no shift open succeed. The tender handler below records the null and does not refuse.
   */
  const openShift = cash === null ? null : openShiftOf(cash);

  /**
   * `02-F11` / `02-F51` — **the branch's bills that still owe money**, which is a different fact
   * from *this terminal's cart* and is the one the Pay surface's empty state was getting wrong.
   * Derived, never stored: see `cartOrder` for why a second writer of "which order" is the defect
   * this file already paid for once.
   */
  const unsettledInBranch = orders.filter((o) => !isAlreadySettled(o));

  /**
   * Every write goes through here, and the `catch` is the point.
   *
   * `void promise.then(reload)` leaves a REJECTION UNHANDLED, which in a renderer is not a tidy
   * -up matter: main legitimately refuses things (`01-F60`'s unpriced item, `01-F1`'s orphan
   * line, any schema violation at the seam), and an unhandled rejection in Electron surfaces as a
   * process-level error rather than as anything the cashier can act on. A test caught this
   * exactly once, by passing while vitest reported the escape — the shape of a false positive.
   *
   * `reload()` runs either way, so the screen re-reads what is actually true after a refusal
   * rather than holding whatever it optimistically assumed. `01-F17`: the sale is never blocked,
   * so one refused item must leave the rest of the counter working.
   *
   * ⚠ **THIS HEADER USED TO SAY *"What is deliberately NOT here: a visible alarm … Recorded
   * rather than improvised"* — AND `02-F57` IS THE FR THAT ANSWERS IT (August 2026).**
   *
   * The recorded cost was paid for real on a live till: a cashier holding no `day.open_close`
   * pressed **Open the day** and *nothing whatever happened*. The surface after the refusal was
   * byte-identical to the surface before the press, so *"you may not do this"*, *"this device is
   * offline"* and *"this till is broken"* were one picture, and the only way to tell them apart
   * was to fetch somebody.
   *
   * The old note was right about the ALARM and wrong to stop there. `27-F14` allocates red to a
   * closed list this is not on, `21 §5` reserves alarm severities to itself (*"no module invents
   * its own alarm behavior"*), and `27-F11g` makes `03-F5`'s band the only signal that food is
   * not being cooked — so a band here is forbidden, exactly as recorded. What `02-F57` requires
   * instead is `02-F47`'s shape, which this file already ships one surface over for the refused
   * caller record: a **word**, announced (`role="status"`), non-interrupting (`02-F37` — nothing
   * goes between the cashier and the customer), in the work area where the act was taken.
   *
   * **Cleared at the ATTEMPT and set on the rejection**, which is `recordCaller`'s own idiom: a
   * retry that fails again must read as a fresh refusal rather than as the previous one still
   * standing, and a stale refusal over an act that has since succeeded is `00 §5.7` inverted.
   *
   * `reload()` still runs either way — `01-F17`, the sale is never blocked, and the act stays
   * retryable IN PLACE so a manager can put a PIN in and press the same control again.
   */
  const write = (op: Promise<unknown>) => {
    setWriteRefusal(false);
    void op.catch(() => setWriteRefusal(true)).then(reload);
  };

  /**
   * Put the caller strip back to nothing — both facts together, because they are one fact in two
   * pieces and clearing the number while keeping the answer would render a file for digits that
   * are no longer on the screen (`00 §5.7`).
   *
   * Called from the two places the call ENDS: the order is started (`startOrder`), or a different
   * channel is latched (the channel row). Not from the lookup effect: a reset that lived there
   * would fight the keystrokes it is supposed to follow.
   */
  const clearCaller = () => {
    setDialled("");
    setCaller(null);
    // **The two capture fields go with the number, and this is the highest-consequence line on
    // the strip.** A stale number renders as digits that are visibly not the ones she just
    // pressed; a stale ADDRESS renders as a plausible address for the wrong customer, and
    // `09-F10` reads that text off the assigned order — a real rider at a real door. `01-F1`
    // makes the row permanent once `Save caller` files it.
    setCallerName("");
    setCallerAddress("");
    // And the refusal is a fact about a call that is now over (`00 §5.7`).
    setCallerRefused(false);
  };

  /**
   * `02-F20` — a write that main may refuse with `escalate`, and the local path that follows.
   *
   * The refusal itself cannot cross the bridge: `ipcMain.handle` serializes a thrown error to its
   * message and drops the `refusal` object `main/authorize.ts` attaches. So on a rejection this
   * asks the SAME guard the same question through `escalationFor`, which returns an offer only
   * when the matrix says `escalate` — never on a plain `deny`, and never when the write was
   * allowed. A pad raised on every refusal would offer a manager PIN for an unpriced item.
   *
   * Used only where `02-F20`/`05-F19` actually reach: the Cash surface. `startOrder`,
   * `sendToKitchen` and `addLine` keep the plain `write` above, because `order.create` has no
   * `escalate` cell and a pad there would be a control that can never succeed.
   */
  const escalatableWrite = (req: AppendRequest) => {
    setWriteRefusal(false);
    void window.restos
      .append(req)
      .then(() => ({ offer: null as EscalationOffer | null, refused: false }))
      .catch(async () => ({
        offer: (await (window.restos.escalationFor?.(req)?.catch(() => null) ?? null)) ?? null,
        refused: true,
      }))
      .then(async ({ offer, refused }) => {
        setApprovalRefusal(null);
        if (!offer) {
          setPending(null);
          /*
            `02-F57` — **THE HALF THAT MADE SCOPING THIS TO ONE HELPER A DEFECT.** An act the
            matrix escalates raises `02-F20`'s manager pad and needs no word; an act it plainly
            DENIES has no offer, so before this line it fell straight through to silence — which
            is exactly what a cashier pressing `Open the day` met. A pad cannot be the answer to a
            plain denial, because it offers a route that can never succeed; a word can.
          */
          setWriteRefusal(refused);
          return;
        }
        // `01-F61` — who could approve, read at the moment the pad is raised. Main supplies the
        // ORDER and it is rendered unsorted (`27-F4`); a renderer-side sort re-ranks the grid
        // the moment a name is edited.
        setRoster((await window.restos.staff?.().catch(() => [])) ?? []);
        setPending({ req, offer });
      })
      .then(reload);
  };

  /**
   * `02-F20`'s local manager PIN, submitted. Main decides everything — that the act escalates at
   * all, that the PIN verifies (`01-F28`), that the approver is not the requester (`02-F38`) and
   * that she holds the permission. This only carries the answer back to the pad.
   */
  const approve = (approver_user_id: string, pin: string) => {
    const req = pending?.req;
    if (req === undefined) return;
    const call = window.restos.escalate?.(req, approver_user_id, pin);
    if (call === undefined) return;
    void call
      .then((result) => {
        if (result.ok) {
          setPending(null);
          setApprovalRefusal(null);
          return;
        }
        // The pad STAYS: a manager who mis-keyed re-keys, and one who may not approve is told so
        // while the cashier still has the request in hand (`01-F17` — nothing is lost either way).
        setApprovalRefusal(result.refused);
      })
      .catch(() => {})
      .then(reload);
  };

  /**
   * `05-F6`'s other half — *"one-tap approve/**deny**"*, and a denial is a RECORD rather than the
   * absence of one (`packages/domain`'s `approval.denied`, `05 §4`).
   *
   * The same shape as `approve` above and the same three decisions in main; the reason is the
   * extra argument because `approval.denied.reason` is required and `05 §4` reads it back at the
   * counter. On success the pad closes exactly as a grant closes it: the act did not happen, and
   * `01-F17` means the cashier's counter is untouched underneath either way.
   */
  const deny = (approver_user_id: string, pin: string, reason: string) => {
    const req = pending?.req;
    if (req === undefined) return;
    const call = window.restos.denyEscalation?.(req, approver_user_id, pin, reason);
    if (call === undefined) return;
    void call
      .then((result) => {
        if (result.ok) {
          setPending(null);
          setApprovalRefusal(null);
          return;
        }
        setApprovalRefusal(result.refused);
      })
      .catch(() => {})
      .then(reload);
  };

  /**
   * `C4` — start an order. One append, and every field it carries is a decision made HERE and
   * never inferred later (`02-F1`).
   *
   * `order_id` is minted in the renderer, which looks like it contradicts the seam's rule that
   * main stamps identity — it does not. `01-F1`'s stamped identity is the ENVELOPE's (`id`,
   * `device_id`, `branch_created_at`), all of which main still owns. An `order_id` is a payload
   * key, and it has to be minted by whoever will reference it in the same breath.
   *
   * **The channel is the latched choice and there is no fallback here.** `?? "counter"` would
   * be the no-default ruling undone in one operator, silently: a type tapped before a channel
   * would ring at counter prices and look like it worked. The type row is greyed until a channel
   * is latched, and this refusal is the same guard on the trusted-ish side of that greying —
   * `27-F5` keeps the tiles tappable-looking, so the greying alone cannot refuse a tap.
   */
  const startOrder = (order_type: string) => {
    if (pendingChannel === null) return;
    const order_id = newId();
    write(
      window.restos.append({
        type: "order.created",
        payload: { order_id, channel: pendingChannel, order_type },
        refs: [],
      }),
    );
    /**
     * `02-F64` — **THE LINK, and it is the field four features waited on.**
     *
     * Emitted here because this is the one moment the renderer holds both halves: the `order_id`
     * it just minted, and the caller it is about to clear. `clearCaller()` three lines below is
     * what used to throw the identity away — the hole `shared/ipc.ts` recorded in a comment for
     * the life of the gap.
     *
     * ── IT IS SENT *AFTER* `order.created` AND THAT NEEDS NO ORDERING GUARANTEE ─────────────────
     *
     * `02-F64` carries `01-F23`'s key ON the link rather than a handle to anything, so a link that
     * merges before its order is not parked and not lost (`01-F10`, `26 §4`). Nothing here depends
     * on the two arriving in order — which is the whole reason the FR refused the cheaper shape.
     *
     * ── AND IT CANNOT BLOCK THE SALE (`01-F17`, Commandment 4) ──────────────────────────────────
     *
     * `write` swallows the rejection into `02-F57`'s refusal state, the order is already appended
     * by the call above, and `setCartOrderId` below runs unconditionally. A refused link costs a
     * loyalty counter, a phone search and a khata — never an order.
     *
     * ⚠ **The digits are sent, not `caller.phone_e164`.** Main normalizes, because
     * `registry.ts` puts normalization at the WRITER: a renderer that sent a key it had resolved
     * itself would be the second normalizer that makes one human two identities, permanently.
     */
    if (pendingChannel === PHONE_CHANNEL && caller?.phone_e164 != null && dialled !== "") {
      const link = window.restos.linkCustomer?.({ order_id, dialled });
      if (link !== undefined) write(link);
    }
    // **THE ORDER THIS TILL JUST STARTED IS NOW ITS CART** — see `cartOrderId`. Set from the id
    // minted two lines above rather than from the reload that follows, because `orders` is a
    // BRANCH-wide list (`02-F11`) with no "mine" in it: picking the new row out of the refreshed
    // array would need a rule about which of several open orders is this terminal's, which is the
    // question that produced the defect. The id is the only unambiguous answer and it is in hand.
    //
    // Set unconditionally, before the append resolves. `01-F17` — the append is not gated on
    // anything and neither is this: if the write is refused, `orders` never gains the row, `find`
    // misses and the cart falls back exactly as it did before the tap.
    setCartOrderId(order_id);
    // `02-F1` — the ledger owns the channel from here. Clearing it means the NEXT order starts
    // from no default again rather than inheriting this one's, which is the same ruling applied
    // to the second order of the shift as to the first.
    setPendingChannel(null);
    // And the caller goes with it, for the same reason: this call is over. Leaving her number
    // latched would carry one caller's identity into the next order on the row that starts it.
    clearCaller();
  };

  /**
   * A typed field as the SEAM wants it — the operator's slip trimmed off, and nothing else.
   *
   * `RecordCustomerRequestSchema` declares both fields `z.string().min(1)`, and `.min(1)` counts a
   * space: `"   "` is a valid request and a permanent row for a human whose name nobody knows
   * (`01-F1`), or an address `09-F10` sends a rider to. The schema cannot express this and the
   * surface has to.
   *
   * **Ends only.** `00 §5.6` — *"user content is never transliterated"* — and an implementation
   * that collapsed interior whitespace would rewrite `Flat 4,  Street 12` while passing every
   * blank-field test. Leading and trailing space is the slip; the spacing inside is the address.
   */
  const stated = (text: string): string | null => (text.trim() === "" ? null : text.trim());

  /**
   * `02-F27` — *"unknown number → inline customer creation (`customer.created`,
   * `customer.address_added`)"*, as ONE tap.
   *
   * ── THIS IS `customer.address_added`'s ONLY PRODUCER IN THE PRODUCT ─────────────────────────
   *
   * The type had a payload schema, a `WRITE_ACTIONS` row, an authorization guard, a fold, a store
   * table and a seam test — and until this line **no shipping code ever sent an `address_text`**.
   * `gateway.recordCustomer` writes the second event iff the request carries one, so the whole
   * chain was reachable from tests and from nothing else: `AGENTS.md`'s named defect in the exact
   * shape its CI rail says it cannot see (*"a key in an object literal is not an export"*).
   *
   * ── `27-F6` — BOTH FIELDS ARE OPTIONAL AND THE CONTROL NEVER WAITS FOR THEM ─────────────────
   *
   * *"No operational role is ever required to type non-numeric text to complete a CRITICAL-PATH
   * task … of 27 field subjects, 24 could not type a single word."* That FR blesses `02-F27`'s
   * customer name as an **optional escape hatch**, and optional is the whole of it: with both
   * fields untouched this files the caller with `name: null` exactly as it did before — `06-F11`'s
   * *"created on first sight from a checkout that captured only a number"*. `Save caller` is never
   * disabled and never appears late; a literacy requirement inside `02-F28`'s 30-second budget, in
   * the branch `27-F11e` says has no manager, is the failure this FR exists to prevent.
   *
   * ── `null` vs ABSENT, and the two are different on purpose ──────────────────────────────────
   *
   * `name` is required-and-nullable (`registry.ts`: *"`null` is a stated fact and `undefined` is a
   * writer who forgot"*), so an untyped name travels as `null`. `address_text` is OPTIONAL and is
   * OMITTED rather than sent empty — `z.string().min(1).optional()` refuses `""` at the seam, and
   * a Zod refusal there loses the whole record, the name with it.
   *
   * ── The refusal (`00 §5.7`) ─────────────────────────────────────────────────────────────────
   *
   * Deliberately NOT the shared `write` helper, whose `catch(() => {})` is what made a refused
   * record indistinguishable from a successful one. Main can refuse this for three stated reasons
   * — the matrix (`02-F47` gives a storekeeper `—`), `01-F23`'s key rule, or a store error — and
   * before this the operator saw nothing at all. `reload()` still runs either way, so the screen
   * re-reads what is actually true rather than holding an optimistic guess.
   *
   * `01-F1` is why this is an explicit act and not something the screen does on her behalf: a
   * created identity is permanent, and an automatic file-on-resolve would record every wrong
   * number and every hang-up for ever — the same argument `gateway.lookupCustomer` makes for
   * appending nothing at all.
   */
  const recordCaller = () => {
    const address_text = stated(callerAddress);
    const op = window.restos.recordCustomer?.({
      // The RAW digits (see `dialled`) — `01-F23`'s key is derived at the writer, never here.
      dialled,
      name: stated(callerName),
      // Spread, so an absent address is an ABSENT KEY and never `undefined` on the wire.
      ...(address_text === null ? {} : { address_text }),
    });
    if (op === undefined) return;
    // Cleared at the ATTEMPT and not only at the answer: `27-F5` keeps the control persistent, so
    // a retry that failed again must read as a fresh refusal rather than as the previous one still
    // standing — and a stale "not filed" over a record that has since succeeded is `00 §5.7`
    // inverted.
    setCallerRefused(false);
    void op
      .then(() => {
        // The lookup is asked again from here — see `callerRevision`. Until this existed the
        // strip went on offering to file a customer it had just filed (`01-F1`).
        setCallerRevision((n) => n + 1);
      })
      .catch(() => setCallerRefused(true))
      .then(reload);
  };

  /**
   * `C8` / `02-F8` — take one line off the order, ~10–25× a shift.
   *
   * **Over the generic `append`, not a channel of its own.** `addLine`, `toggleAvailability` and
   * `recordCustomer` each earned a dedicated channel for ONE stated reason: the event needs a
   * field the renderer must not supply (a price, a `01-F57` supersedes head, a `01-F23` key). A
   * removal needs none — `{order_id, line_id}` are both facts this screen already holds and the
   * fold already published, and there is nothing a compromised renderer could gain by naming a
   * different line than it could by tapping a different row. So it rides `append`, which is where
   * `main/authorize.ts` gates it (commandment 8) and where `02-F49`'s confirm guard sits.
   *
   * **Plain `write` and not `escalatableWrite`.** `02-F8` calls the pre-confirm removal a plain
   * event and `02-F49` maps it to `order.create`, which has no `escalate` cell — a pad here could
   * never succeed. The POST-confirm refusal is a different act (`void.recorded`) and `02-F49`
   * requires the escalation to remain reachable for it; that path is owed with the surface that
   * offers a void, and until then the refusal reaches the operator as the counter re-reading and
   * showing the line still there. Named rather than left to look intentional.
   *
   * No confirmation step, deliberately: `02-F37` keeps anything from coming between the cashier
   * and the customer, `27-F10` wants the act complete inside the perceptual threshold, and
   * `02-F49` rules that the remedy for a mis-tap is re-adding the item — one tap of the surface's
   * most practised gesture. A modal on a 10–25× act is the friction that teaches an operator to
   * work around the control.
   */
  const removeLine = (line_id: string) => {
    if (current === undefined) return;
    write(
      window.restos.append({
        type: "order.line_removed",
        // `02-F8`'s *plain* event: no money and no approver. A screen that sent an `amount_paisa`
        // would be pricing a correction on the untrusted side of `18 §9`'s bridge; one that sent
        // an `approver_user_id` would be asserting an approval nobody gave.
        payload: { order_id: current.order_id, line_id },
        refs: [],
      }),
    );
  };

  /**
   * `C26` / `02-F20` / `02-F61` — **VOID, COMP AND DISCOUNT A LINE.** The producer for three of
   * `01 §4`'s six correctives, which had payload schemas, matrix rows, an approval path and
   * **nothing anywhere that constructed one**.
   *
   * **`escalatableWrite` and not `write`, and that is the whole difference from `removeLine`
   * above.** All three carry an `escalate` cell for a cashier — `order.void_after_kot`,
   * `order.comp_item`, `order.discount_above_threshold` — so the plain append is REFUSED and
   * `02-F20`'s local manager PIN is what completes it. `02-F49` requires exactly that: *"the
   * refusal must hand the operator the escalation for the SAME line in the same gesture"*, and
   * the comment on `removeLine` that called this path *"owed with the surface that offers a
   * void"* is what this closes.
   *
   * ── `01-F83`'S ATTEMPT KEY IS MINTED HERE, AND *HERE* IS LOAD-BEARING ────────────────────────
   *
   * *"Minted at the UI, at `02-F20`'s approval path, before the append, and reused by a retry of
   * the same act."* One `newId()` per act, inside the request object — and `escalatableWrite`
   * stores that OBJECT as `pending.req`, which `approve` re-sends verbatim. So the cashier's
   * refused attempt and the manager-approved retry carry **one key**, which is the entire point:
   * `01-F8`'s event-id dedupe already covers transport duplicates, and the case this key exists
   * for is a **double-tapped approval** — two genuine events with two envelope ids that must sum
   * once. Minting inside `approve`, or deriving it from the envelope, breaks that in a way no
   * test of a single append can see, and `01-F1` makes a double-subtracted void permanent.
   *
   * **The field is `adjustment_attempt_id` and never `settlement_attempt_id`.** They share one
   * uniqueness space and carry two names deliberately: the name is what stops a fold summing both
   * sides of `01-F30`'s equation into one Σ — settlements on the left, correctives on the right.
   *
   * **`approver_user_id: null` at emit, and `null` is a value here rather than a hedge.**
   * `registry.ts` makes it required-and-nullable: `null` means *no approval was involved*, which
   * is the truth for a manager acting unsupervised, and `authorize.ts`'s escalation path merges
   * the real approver into the payload when a PIN closes the gap (`payload: { ...payload,
   * approver_user_id }`). A screen that guessed an approver would be asserting an approval nobody
   * gave.
   *
   * **The line rides `refs`, not the payload** — `registry.ts` declares no `line_id` on these
   * three on purpose (*"a payload line key would be a second place to say what an act touches and
   * two can disagree"*) and `00 §6` puts soft references on the envelope. `main/line-void.ts`
   * reads `refs` to build the void's line exit and refuses anything that does not name exactly
   * one line, which is what keeps `DEC-MONEY-010` (2)'s double-count unreachable.
   *
   * **No amount is computed on this side.** `amount_paisa` is the ENGINE's own `billed_paisa` for
   * that line, carried across the seam (`26 §8`); the one number this surface originates is a
   * discount the operator typed, which is an intent and not a derivation.
   */
  const correctLine = (correction: LineCorrectionSubmit) => {
    if (current === undefined) return;
    setCorrecting(false);
    escalatableWrite({
      type: CORRECTION_EVENT_TYPES[correction.act] as string,
      payload: {
        order_id: current.order_id,
        amount_paisa: correction.amount_paisa,
        reason: correction.reason,
        approver_user_id: null,
        adjustment_attempt_id: newId(),
      },
      refs: [correction.line_id],
    });
  };

  /**
   * `C7` / `02-F6` / `02-F50` — send the kitchen an instruction about a dish, ~10–40× a shift.
   *
   * **TAPPED, never typed.** `27-F6`'s test is *"whether a non-typing operator can complete the
   * task by another route"* and 24 of 27 field subjects could not type a single word, so the pick
   * list is the primary surface rather than a fallback. `02-F50` defers `02-F6`'s free-text half
   * entirely with `03-F8`'s reason: a typed Urdu note makes the encoder refuse the whole ticket,
   * the sale completes and the food is never cooked.
   *
   * **The note lands on the LAST line in the cart, which is the row immediately above this row.**
   * No FR decides which line a tapped tag qualifies, and the alternative — select a cart line
   * first — is genuinely defensible; it is refused because it adds a tap to a 10–40× act
   * (`02-F2`: *"≤ 2 taps from grid to confirm"*) and a selection state to the surface `27-F5` is
   * strictest about. The last line rung is where the conversation is: a customer says *"less
   * spicy"* about the dish just named back to her. **Position is what carries it** (`00 §5.6`):
   * the tag row is drawn under the cart's last item and indented like a modifier, which is the
   * same visual grammar `QuantityItemLine` already uses for *"this belongs to the dish above"*.
   *
   * Tags ACCUMULATE — two taps are two `order.note_added` events and the fold keeps both
   * (`26 §7` M2). A pick list whose second tap erased the first would silently discard an
   * instruction, and `27-F59`'s reasoning about removals (*"an allergen incident, not a
   * preference miss"*) applies with full force to *"no peanuts"*.
   */
  const addNote = (line_id: string, note: string) => {
    if (current === undefined) return;
    write(
      window.restos.append({
        type: "order.note_added",
        payload: { order_id: current.order_id, line_id, note },
        refs: [],
      }),
    );
  };

  /**
   * `02-F7` — 86 an item, or put it back.
   *
   * One call, and it carries neither the `01-F57` supersedes link nor any price: main reads the
   * fold's own heads at append time (`ToggleAvailabilityRequestSchema` says why). The renderer names
   * WHICH item and WHICH way, exactly as `addLine` names what to add and never what it costs.
   *
   * `available` is a target state rather than a flip. A flip computed from a screen that has not
   * re-read yet inverts twice under a concurrent toggle from the pass or the manager console
   * (`01-F22` puts the control on all three), and a CONTESTED item (`01-F58`) has no single
   * state to flip from at all.
   */
  const toggleAvailability = (item_id: string, available: boolean) => {
    // Optional on the contract (`RestosBridge.toggleAvailability` records why), so a host that does
    // not serve it degrades to a grid whose taps do nothing rather than throwing on the counter
    // — `01-F17`/`01-F54`'s rule for a read the host cannot serve, applied to a write. The
    // shipped preload always serves it, and `__acceptance__/availability-seam.test.ts` is what
    // stands in for the type until the three oracle harnesses can carry a required member.
    const op = window.restos.toggleAvailability?.({ item_id, available });
    if (op !== undefined) write(op);
  };

  /**
   * `C9` — send it to the kitchen. `02-F8`/`03-F2`: confirming is what makes the order real to
   * everyone downstream, and in the fold it is what makes the queue row EXIST at all (the
   * projection's own rule is "row exists iff confirmed"). So this one append is the whole
   * handoff — there is no "send to kitchen" message, and `screen-map §4` is explicit that
   * screens observe the same ledger rather than navigating to each other.
   *
   * The KOT print that `03-F5` hangs off this is NOT here: `packages/escpos` is a stub, and a
   * confirm that silently failed to print would be worse than one that never claimed to.
   */
  /**
   * `02-F55` / `02-F9` — **at most one `order.confirmed` per order id, decided AT ORIGINATION.**
   *
   * `02-F9` has fixed this property for the cloud inbox since Wave 1 opened — *"idempotent — at
   * most one confirm per order id"* — and `02-F8`'s counter confirm is the same act on the same
   * event reached from another surface. No clause ever said so and the till never checked: the
   * rehearsal pressed three times and three permanent rows landed.
   *
   * **It is `02-F49`'s pattern exactly**: a local, synchronous decision against this device's own
   * converged fold and its own memory of what it just did — no peer, no clock, no network. It is
   * not a schema tightening (`01-F31`'s keys cover money and `01-F8`'s dedupe covers transport
   * duplicates; neither can see two genuinely distinct envelopes carrying one intent), and a
   * device whose own ledger already holds two must go on folding both (`01-F37`, `01-F17`).
   *
   * Two refusals, and they answer different questions:
   *   `kitchen === "sent"` — the FOLD says the kitchen owes nothing. State (iii).
   *   `lastSent` matches — I pressed this, in this state, and nothing has moved since. The
   *      triple-tap, which no projection can catch.
   *
   * **`owed` is deliberately NOT refused.** `02-F55`: what is forbidden is the second EVENT in
   * the state where nothing is owed, never the second CHIT. One is a permanent false record; the
   * other is a dish somebody is waiting for.
   */
  const kitchenIsOwedNothing = (order: OpenOrder): boolean => kitchenOf(order) === "sent";

  const sendToKitchen = (order_id: string) => {
    const order = orders.find((o) => o.order_id === order_id);
    if (order === undefined) return;
    const kitchen = kitchenOf(order);
    if (kitchen === "sent") return;
    if (lastSent !== null && lastSent.order_id === order_id && lastSent.kitchen === kitchen) return;
    setLastSent({ order_id, kitchen });
    write(
      window.restos
        .append({ type: "order.confirmed", payload: { order_id }, refs: [] })
        .catch((refusal: unknown) => {
          /*
            `02-F57` × `02-F55` — **A REFUSED CONFIRM IS NOT A CONFIRM, and forgetting that would
            have closed one defect by opening another.**

            Found by running the two acceptance suites together: `02-F57` requires a refused act
            to stay retryable IN PLACE (`01-F17`, `27-F5` — an inert primary control is that FR's
            own failure mode, and `02-F22`'s first attempt is legitimately a cashier's with the
            manager's PIN arriving afterwards), while the guard above remembers the press. A
            rejection put NOTHING in the append-only ledger, so there is no permanent row to
            protect and nothing is owed-nothing — the memory has to go with it, or a cashier
            refused once could never send that order to the kitchen again without restarting the
            till.

            Re-thrown, so `write` still announces the refusal: this handler corrects the guard's
            bookkeeping and decides nothing about the glass.
          */
          setLastSent(null);
          throw refusal;
        }),
    );
  };

  /**
   * `S-3`/`S-4` (Cash) and `S-5` (Me), both fed by the one `shift_cash` read.
   *
   * Every write goes through `write` above, so a refusal is caught and the screen re-reads what
   * is actually true rather than holding what it assumed — which is the whole of `02-F37`'s
   * "succeed and lie" applied to a day that did not open.
   */
  /**
   * `C11`–`C14` — **the Pay surface, and why settling is no longer beside the cart.**
   *
   * `screen-map §3.1` gives tender its own tab and states the reason as a measurement:
   * *"Separate surface because `27-F8` puts numeric entry at 126 dp — it cannot share a layout
   * with 76 dp tiles."* That was written before either surface existed, and launching the app
   * proved it exactly right in both directions:
   *
   * 1. **The tender panel could not be completed.** Its 918 px against the Order surface's
   *    568 px left `TAKE CASH`, the change figure and the correction keys below a fold that
   *    `AppShell` clips and `27-F2` forbids scrolling to — the cashier could not settle at all.
   * 2. **The grid could not be read.** The pad's 456 px of width came out of the item grid, so
   *    a surface `27-F11a` sizes at **~88 tiles** was rendering **six**, in a column narrow
   *    enough to wrap two-word item names onto three lines.
   *
   * Moving it fixes the second on its own; the first needed `TenderPanel` to stop stacking
   * vertically as well, because **the Pay tab's work area is the same 568 px** — see that
   * component's own note. Both were required, and neither is sufficient.
   *
   * **The tab is not conditional** (`27-F4`): it is present, enabled and in the same position
   * whether or not there is an order, because a rail that grows and shrinks destroys the
   * positional memory of every operator who learned it. With nothing to settle the surface says
   * so — `00 §5.7`, the device reports what is true — rather than vanishing or greying the tab.
   *
   * **The cart deliberately does NOT move here.** `screen-map §3.1` requires it *"always
   * visible, never a separate screen, never collapsed"* on the Order surface, and `DUE` already
   * carries the only number this surface needs (`27-F24` — the system computes, staff read).
   */
  /**
   * **THE ROOM AROUND THE PANEL, and it is the half a founder saw before he saw anything else.**
   *
   * Opened on a window much wider than `27 §1a`'s panel, this surface put the tender panel in the
   * **top-left** at its `fit-content` size: keypad stranded up and right, `TAKE CASH` mid-left,
   * roughly the bottom third of the window empty. His verdict was *"this user interface is
   * unusable for a human"*, and every gate was green — `layout:check` asks whether a thing FITS
   * and a thing anchored in a corner of an ocean fits perfectly.
   *
   * **Centring is the fix, and it is a decision about the leftover room rather than an absence of
   * one.** The content here has a natural maximum: the pad is fixed at `27-F8`'s 20 mm keys (a
   * floor, and `27-F8` also records no accuracy gain above ~10 mm, so a bigger key buys nothing),
   * the method row is a closed set of five (`02-F12`), and the two figures already sit at the top
   * of the type ladder. There is nothing on this surface that a 24″ desktop's extra 190 mm should
   * be spent on, and stretching `TAKE CASH` across it — which is what filling the width does, and
   * what this panel used to do before `width: fit-content` — is worse than the emptiness.
   *
   * So the room is given back as **symmetric field**. That is not a euphemism: asymmetric dead
   * space on two sides reads as a layout that failed, and the same quantity of space distributed
   * evenly around a composed panel reads as deliberate. What the wide surface DOES earn is the
   * money figure — `TenderPanel` steps `CHANGE` to `text-numeric-display` on `wide`, because
   * `27-F25`'s "largest element in their region" is relative and `27-F11c` makes a larger panel a
   * larger region.
   *
   * `27-F4` is untouched: a till lives on one panel for its service life, so no operator ever
   * watches this reflow. And under `03-F5`'s band a centred panel moves by HALF the band's height
   * where a top-anchored one moved by all of it.
   */
  /**
   * **`safe center`, not `center` — and the keyword is the whole difference between losing the
   * bottom of a surface and losing both ends of it.**
   *
   * Measured August 2026 on glass below the current size floor: with the work area shorter than
   * the content, a plain `center` overflows in BOTH directions, so the top row of the Cash
   * keypad rendered at `y = -33` and the surface was cut at the top *and* the bottom. The layout
   * gate's own summary of that state — *"the cut is split top and bottom, which is why no
   * control is reported lost even though content is being lost"* — is the reason it survived: a
   * centred overflow hides half of itself above the viewport, where nothing looks for it.
   *
   * `safe` makes the alignment fall back to `start` exactly when the item would otherwise
   * overflow, and changes nothing at all when it fits. It does not make a short panel fit —
   * `27-F2` still forbids scrolling to a primary action and the gate still reddens — but it
   * makes the failure a bottom edge, which is where an operator and a screenshot both look.
   */
  const centred = (children: React.ReactNode) => (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "safe center",
        justifyContent: "safe center",
      }}
    >
      {children}
    </div>
  );

  /**
   * `C18` — **THE CALLER SURFACE** (`02-F27`, `02-F28`, `restaurant-os.md` §8 item 7).
   *
   * ── WHERE IT GOES, AND THE PLACEMENT IS A MEASUREMENT ──────────────────────────────────────
   *
   * It occupies the **item grid's own box**, under the order-type and channel rows, while the
   * phone channel is latched. Both learned rows keep their exact positions and the cart keeps
   * its column, so `27-F4` is untouched: nothing is added above anything, nothing moves.
   *
   * **It replaces the grid rather than sitting beside it, and that was forced by the gate rather
   * than chosen.** The first draft put this in a fourth row and `pnpm layout:check` measured the
   * result on `tablet-10.1` (1366×768 on 10.1″ glass): **772 px of content in a 567 px work
   * area**, the grid box squeezed to 0 px, and **fifteen controls off the bottom of the screen**
   * — five menu tiles and the whole pager. `27-F8`'s 20 mm keys are not negotiable (`27-F68` (b):
   * *"the minimum IS the millimetre"*), so the room has to come from somewhere, and the only
   * honest place is the surface the operator is not using: she cannot ring a line onto an order
   * that does not exist yet, and `02-F27`'s flow puts the number BEFORE the order.
   *
   * **The cost, named rather than left to be discovered:** if an order is already open and she
   * latches Phone for the NEXT one, the grid is hidden until she starts it or picks another
   * channel. The cart — her working memory (`screen-map §3.1`) — stays visible throughout, which
   * is the part that would actually hurt to lose.
   *
   * ── WHY IT IS RAISED BY THE PHONE CHANNEL AND BY NOTHING ELSE ───────────────────────────────
   *
   * An INTERPRETATION, stated rather than silent. `27-F5` bans context-dependent controls and can
   * be read as pushing the other way — an always-present caller field is arguably the less
   * conditional design. It is refused because this surface is eleven 20 mm keys and a customer
   * card, and a permanent one would take the item grid's room on every walk-in sale (~75% of
   * orders). `21 §5` calls a control with no task behind it feature tourism in terms. **The
   * simpler alternative is one condition's change**, and `phone-entry.dom.test.tsx` §A is
   * deliberately written so either design passes: it asserts the LOOKUP does not fire for a
   * counter order, never that the field is absent.
   *
   * **The order-type row is NOT gated on any of this** — see the lookup effect. `01-F17`: a
   * caller the file cannot answer about still gets her food.
   */
  /**
   * `02-F27`'s *"unknown number"* — a resolvable number with no file behind it, which is the ONE
   * branch inline customer creation lives in.
   *
   * Hoisted out of the card's own branch below because the capture group it gates now sits in the
   * other column (see the group's own note for the measurement that put it there). The three
   * states are the card's: nothing asked yet, unknown, on file — and this names the middle one
   * once so the two columns cannot disagree about which one the strip is in.
   */
  const unknownCaller = caller !== null && caller.phone_e164 !== null && caller.known === null;

  const callerSurface = (
    /*
      **NO `flexWrap`, AND THAT IS THE SECOND THING THE GATE DECIDED HERE.** With it, the card
      column wrapped BELOW the pad on `tablet-10.1` and `netbook-1024` — 708 px of content in a
      567 px box, 141 px clipped away. Without it the card shrinks instead (`minWidth: 0`, its
      text rewraps) and the surface's height is the pad's, which fits every shipping panel with
      room to spare. Wrapping trades width for height, and height is the scarce axis here.
    */
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      {/*
        THE PAD, AND ITS SHAPE IS A MEASUREMENT RATHER THAN A TASTE — see `CALLER_PAD`.

        `flexShrink: 0` is load-bearing rather than tidy: a flex row that ran out of width would
        otherwise take it from these keys, and `27-F68` (b) forbids shrinking `27-F8`'s 20 mm to
        make a layout fit. The card gives up width; the target never does.
      */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <div style={CALLER_PAD}>
          {PHONE_DIGITS.map((d) => (
            <Tile
              key={d}
              posture="keypad"
              label={d}
              // The whole of the entry rule: what she pressed, appended. No leading-zero
              // suppression and no digit cap — see `PHONE_DIGITS` for what both cost.
              onPress={() => setDialled((current) => current + d)}
            />
          ))}
          {/*
            `App.tsx`'s PIN pad has `Clear` and no backspace, and this copies it rather than
            improving on it: `27-F4` is positional memory, and a device whose pads correct an entry
            differently teaches two habits. The number alone is cleared, never the channel — she is
            still on the same call.
          */}
          <Tile posture="keypad" label="Clear" onPress={() => setDialled("")} />
        </div>
        {unknownCaller ? (
          /*
            `02-F27`'s *"inline customer creation"* — the capture group that gives
            `customer.address_added` its first production producer, and `06-F9`'s free-text
            address with it.

            ── **IT IS UNDER THE PAD BECAUSE THAT IS WHERE THE WIDTH IS, AND THE FIRST DRAFT PUT
               IT IN THE CARD COLUMN AND `pnpm layout:check` REFUSED IT.** ─────────────────────

            Measured, not argued: stacked in the card column the surface held **644 px of content
            in `tablet-10.1`'s 567 px work area**, and `Save caller` was **UNREACHABLE** — 71 px
            below the viewport with a centre that does not hit-test — on `tablet-10.1` AND
            `netbook-1024`. The card column is only ~137 px wide on that panel (the pad takes 756
            of ~1040), so putting two free-text fields in it is asking the narrowest column on the
            screen to carry the widest content; side-by-side there would have been ~65 px each.

            The room was already on the glass and empty: the pad is 6 × 2 keys, so the space
            **beneath** it is the pad's full width, and nothing was in it. The row costs the
            surface one field's height instead of three controls' — measured back down to
            **548 px** on the same panel.

            ── The group stays together, which is the part not to lose ─────────────────────────

            `27-F57`'s mapping step — pairing a thing to what it names — is where comprehension
            collapses, so the two fields and the act they feed sit in one row rather than the
            fields here and the control over there. Order is name, address, then the save:
            `02-F27`'s own order, and a control above the fields it acts on reads as acting on
            nothing.

            `alignItems: "flex-end"` because a `Readout` is a caption ABOVE its payload and a
            `Tile` is not — bottom-aligning puts the tile's face level with the two inputs rather
            than level with their captions.

            The address gets twice the name's share (`flex: 2` against `flex: 1`): `06-F9` calls it
            free text and a Pakistani address is a house, a street, a block and a city, where a
            name is two words. `minWidth: 0` on both is what lets them give up width to the pad
            rather than pushing the pad out of the row (`27-F68` (b) — the 20 mm target never
            shrinks).

            `posture="counter"` and not `keypad`: `27-F8` puts 20 mm on *"standing,
            high-consequence NUMERIC entry"*, which is the pad above. These are the OPTIONAL half
            of the act (`27-F6`), and spending 20 mm of the tightest vertical budget on the screen
            on them is what pushed the pad off the glass in the first draft.
          */
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <TextEntry
                posture="counter"
                caption="CALLER NAME"
                value={callerName}
                onChange={setCallerName}
              />
            </div>
            <div style={{ flex: 2, minWidth: 0 }}>
              <TextEntry
                posture="counter"
                caption="ADDRESS"
                value={callerAddress}
                onChange={setCallerAddress}
              />
            </div>
            <Tile posture="counter" label="Save caller" onPress={recordCaller} />
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        {/*
          `Readout` rather than a loose label beside a loose number: it is the same
          caption-above-fact idiom the unlock screen uses for `PIN`, and `27-F57`'s mapping step —
          pairing a number to the thing it quantifies — is where comprehension collapses. `27-F29`
          blocks impossible values AT ENTRY and the only way an operator can act on that is to SEE
          what she entered, digit for digit.
        */}
        <Readout caption="CALLER">
          <p style={{ ...CALLER_NUMBER, color: color["fgColor-default"] }}>
            {dialled === "" ? "—" : dialled}
          </p>
        </Readout>
        {caller === null || caller.phone_e164 === null ? (
          <p style={{ ...STATE_LINE, color: color["fgColor-muted"], marginLeft: 0 }}>
            Key the caller's number — it finds her file
          </p>
        ) : caller.known === null ? (
          <>
            {/*
              `02-F27`'s *"unknown number"* — a STATE with its own branch, not an error and not an
              empty answer. The number is named back in `01-F23`'s form so she can see WHICH
              identity the tile beside it would create.
            */}
            <p style={{ ...STATE_LINE, color: color["fgColor-muted"], marginLeft: 0 }}>
              New caller — {caller.phone_e164}
            </p>
            {callerRefused ? (
              /*
                `00 §5.7` — **THE TILL REPORTS WHAT IS TRUE**, and before this line a refused
                `Save caller` looked exactly like a successful one.

                ── WHY IT IS A WORD HERE AND NOT `03-F5`'s BAND ────────────────────────────────

                A refusal is a **STATE**: what is true afterwards is *this caller is not on file*,
                and it stays true until she is filed or the call ends. That is `CatalogHealth`'s
                shape and not `AlarmBand`'s, on that component's own structural argument — the
                band clears on an attributed acknowledgement, which is right for an EVENT that
                already happened and wrong for a condition that is still happening.

                Three FRs make the band positively FORBIDDEN rather than merely unnecessary:
                `27-F14` allocates red to a CLOSED list (*"ticket overdue, print failure, cash
                variance past threshold, void & refund actions, revoked device"*) and adds that
                *"adding a colour requires an amendment here, not a local decision"*; `21 §5`
                closes its interrupt-priority law with *"no module invents its own alarm behavior —
                new signal types are assigned a severity here"*, which makes assigning one a spec
                change (commandment 2); and `27-F11g` makes that band the ONLY signal that food is
                not being cooked, so a second claimant is how it stops being the loudest thing on
                the glass.

                So: a WORD, in the position the strip already owns. `role="status"` and not
                `role="alert"` — the same choice `CatalogHealth`, `PanelHealth`, `ConnectionFacts`
                and `AgeBadge` all made for `27-F11d`'s stated reason (*"the work underneath a
                cashier's hands stays usable"*). No acknowledgement control, because acknowledging
                a condition that is still true hides it. No colour: `27-F16`'s argument is that
                colour on a number means *this number is abnormal*, and the three status hues are
                spent — the word and its position carry this (`27-F12`'s non-colour channels), so
                it is `fgColor-default` against the muted lines around it and legible in greyscale
                (`27-F13`).

                **The remedy on offer is `Save caller` itself**, unchanged and one column to the
                left — `27-F5`'s persistent target. It changes the fact; an `I SAW THIS` would only
                change the report of it. It is reported HERE, on the card, because the card is
                where this caller's state is already read: *"New caller — +92…"* directly above says
                she is not on file, and *"Not filed"* says the attempt to change that did not take.
              */
              <p
                role="status"
                style={{ ...STATE_LINE, color: color["fgColor-default"], marginLeft: 0 }}
              >
                Not filed — this caller is not on file. Tap Save caller to try again.
              </p>
            ) : null}
          </>
        ) : (
          /*
            `02-F27`: *"→ name, saved addresses"*. BOTH, because a rider cannot deliver to a name
            and `09-F10` reads this very text off the assigned order — a surface that rendered the
            name alone would look complete and leave the food with nowhere to go. A file with no
            stated name renders as that, rather than as blank: `null` is `06-F11`'s first sight or
            `01-F31`'s contested name, and both are facts.
          */
          <Readout caption="ON FILE">
            <p style={{ ...STATE_LINE, color: color["fgColor-default"], marginLeft: 0 }}>
              {caller.known.name ?? "No name on file"}
            </p>
            {caller.known.addresses.map((a) => (
              <p
                key={a.address_id}
                style={{ ...STATE_LINE, color: color["fgColor-muted"], marginLeft: 0 }}
              >
                {a.address_text}
              </p>
            ))}
            {/*
              `17-F17`'s *"reward visible"* and `17-F16`'s *"2 more orders to your free deal"*,
              as ONE line with two arms.

              **It is a WORD and a NUMBER and carries no control** — `27-F12`, and the same shape
              `02-F47`'s *"Not filed"* line above takes. Applying the reward is a money act on the
              Pay surface and belongs with the discount, not on a caller card; a tappable reward
              here would put a `discount.recorded` behind a control the cashier meets before the
              bill exists.

              **Nothing renders when there is nothing to say** (`27-F16`): no campaign, no
              programme, another branch's programme, or an unresolved number all read as `null`,
              and a permanent `No rewards` line is the base-case spend that made two blocks on the
              status strip meaningless.

              ⚠ **`orders_to_next` is `0` exactly when `available` is positive**, so the two arms
              cannot both be true and neither can be silently wrong: `loyaltyOrdersToNextReward`
              returns 0 in that case precisely so this surface has to choose the reward sentence.
            */}
            {loyalty === null ? null : loyalty.available > 0 ? (
              <p style={{ ...STATE_LINE, color: color["fgColor-default"], marginLeft: 0 }}>
                {loyalty.available === 1
                  ? "1 reward to claim"
                  : `${loyalty.available} rewards to claim`}
              </p>
            ) : (
              <p style={{ ...STATE_LINE, color: color["fgColor-muted"], marginLeft: 0 }}>
                {loyalty.orders_to_next === 1
                  ? "1 more order to a reward"
                  : `${loyalty.orders_to_next} more orders to a reward`}
              </p>
            )}
          </Readout>
        )}
      </div>
    </div>
  );

  const paySurface =
    current === undefined ? (
      // The empty state is centred too. A single muted sentence in the top-left corner of a
      // 531 mm panel is the same defect at a smaller scale, and `00 §5.7` makes this line the
      // device honestly reporting that there is nothing to settle — a fact worth composing.
      /*
        ⚠ **`No order to settle — start one on Order.` WAS SHOWN OVER AN UNSETTLED OPEN BILL, and
        the remedy it named was the wrong one (August 2026, `02-F51`, `02-F11`, `00 §5.7`).**

        This is the failure mode created by making two open orders possible — `02-F51` (c)
        releases the cart when the money side closes, correctly — and the sentence was true about
        the TERMINAL and false about the BRANCH. `02-F11` makes `orders` branch-wide, so *"this
        till has nothing and neither does the branch"* and *"this till has nothing but A-001 is
        still unpaid"* are DIFFERENT facts, and one sentence reported them identically: it is
        wrong in one of the two cases whichever wording it picks.

        Naming the wrong remedy is the sharper half. `01-F33` does not reopen an order, so
        starting a new one leaves the open bill exactly where it was — the act this cashier needs
        is `02-F51` (a)'s RECALL, on the Orders tab, and the surface was sending her to the
        control that cannot reach it.

        **The unsettled test is `isAlreadySettled` — the reading `main/settlement-guard.ts` and
        the branch below both already make** — so this surface cannot disagree with itself about
        what "still owes money" means. `02-F13`'s partial tender still counts as open, which is
        right: a split halfway through is a bill somebody has to come back to.

        The resting sentence is UNCHANGED for the state it was always true of, so nothing a
        cashier learned about an empty counter moved (`27-F4`).
      */
      unsettledInBranch.length === 0 ? (
        <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
          No order to settle — start one on Order.
        </p>
      ) : (
        <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
          {`Nothing on this till — ${unsettledInBranch.length === 1 ? "one bill is" : `${unsettledInBranch.length} bills are`} still open in this branch. Recall it on Orders to settle it.`}
        </p>
      )
    ) : current.channel === AGGREGATOR_CHANNEL ? (
      /*
        `02-F30` — **THERE IS NO SETTLEMENT STEP, AND THE SURFACE SAYS SO.**

        The FR's words are *"no settlement step (aggregator-collected; economics handled by doc
        08)"*, and `08-F5` gives the operator-facing consequence: *"no cash expected at branch when
        foodpanda's rider delivers"*. Main closes the money side by itself at the confirm
        (`main/aggregator-settlement.ts`, `08-F17`/`01-F32`), so there is nothing for a cashier to
        do here and nothing she may be asked to do.

        **A sentence rather than a greyed `TAKE CASH`**, on this surface's own precedent one branch
        down: `27-F5` bans context-dependent and invisible controls, and an inert primary control is
        that FR's own failure mode. It also costs the highest-consequence position on the panel to
        say nothing.

        **This branch is ABOVE `isAlreadySettled` and that placement is the whole assertion.** The
        `01-F32` receivable makes `paid_paisa >= total_paisa` true, so without it the
        `DEC-MONEY-009` branch fires and tells the cashier *"Rs 570 **taken on this bill**"* — at a
        counter where nothing was taken and nothing ever will be. That is a false statement about
        money under `00 §5.7`, and it is the one a do-nothing implementation ships.

        **It is keyed on the CHANNEL, not on the money**, for the same reason: `02-F30` says "no
        settlement step" about the channel, unconditionally. An aggregator order whose receivable
        has not landed yet — the entry is mid-flight, this device is catching up — must still offer
        no tender, or a cashier takes cash for a foodpanda order into `02-F23`'s Cash bucket and it
        goes missing at close. An order with no channel at all is NOT this branch: `01-F54`/`01-F17`
        make an unstated value degrade to the ordinary path, never to a till that cannot take money.

        **`27-F12` — a WORD and a NUMBER.** `Foodpanda` is the word (`02-F30`'s own vocabulary, and
        the reason this bill is closed), the bill is the number, and nothing here is carried by
        colour: the muted foreground is the one the two sibling branches use.

        **The number is the BILL and not what has been paid**, because this sentence is about what
        the aggregator collects rather than about what has reached the ledger — and on an order the
        receivable has not yet closed, `paid_paisa` is 0 and would state the opposite of the fact.
      */
      <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
        {`Foodpanda collects this order — ${formatPaisa(paisa(current.total_paisa))}. No payment is taken at this counter.`}
      </p>
    ) : isAlreadySettled(current) ? (
      /*
        `DEC-MONEY-009` — **THE REFUSAL, SAID ON THE GLASS.**

        `00 §5.7`: a surface reports what is true. Main refuses the second settlement
        (`main/settlement-guard.ts`) and a refusal a cashier cannot see is a dead button she keys
        Rs 2,240 into — so this surface says the bill is covered BEFORE she reaches for the pad,
        off the same two projected numbers the guard reads. The screen and the guard therefore
        cannot disagree about whether the bill is covered; they are one comparison, made twice.

        **A sentence rather than a greyed `TAKE CASH`.** `27-F5` bans context-dependent and
        invisible controls, and an inert primary control is that FR's own failure mode — this
        package's guide says so in terms about the neighbouring Rs 0-tender defect. The Pay
        surface already answers "there is nothing to settle" with exactly this shape one branch
        up, so a second fact of the same kind gets the same treatment rather than a new idiom.

        **`27-F12` — the state is carried by a WORD and a NUMBER, never by colour.** `Already
        settled` is the word, the rupee figure is the number, and the muted foreground here is the
        same one the empty state uses: nothing on this branch is colour-coded, so there is no
        status hue to mis-read (`27-F14`'s allocation is untouched).

        **It cannot say WHO settled it, and that silence is deliberate.** `02-F45` puts attribution
        on the envelope's `actor_user_id`; `OpenOrderRow` — the fold's pinned projection — carries
        the money and not the actor, so "settled by Ayesha on Counter 2" is **owed at the fold**
        and inventing it here would be commandment 2. What is on the glass is what this device
        actually knows.
      */
      <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
        {`Already settled — ${formatPaisa(paisa(current.paid_paisa))} taken on this bill. Nothing more is due.`}
      </p>
    ) : (
      <TenderPanel
        dueP={paisa(current.total_paisa)}
        takenP={paisa(current.paid_paisa)}
        onTender={({ amountP, method }) => {
          /*
            `DEC-MONEY-009` — through `write`, not a bare `void … .then(reload)`.

            Main can now REFUSE this append (a duplicate settlement), and this call site was the
            one write on the surface that handled no rejection: `write`'s own header records that
            an unhandled rejection in a renderer surfaces as a process-level error rather than as
            anything a cashier can act on. `write` catches, then `reload`s — so a refused tender
            re-reads the projection and the surface flips to the branch directly above, which is
            how the refusal becomes visible when the screen was a moment stale.
          */
          write(
            window.restos.append({
              type: "payment.recorded",
              payload: {
                order_id: current.order_id,
                amount_paisa: amountP,
                method,
                // 01-F31 — the attempt key is what makes a double-tap idempotent. Minted
                // per TENDER, not per order: 02-F13's split is several payments against one
                // order, and sharing a key would collapse them into one.
                settlement_attempt_id: newId(),
                // DEC-MONEY-007 — this settles the order. A khata REPAYMENT later carries
                // `repays_receivable`, and without the discriminator the two double-count
                // under full observation.
                purpose: "settles_order",
                // 26 §7 — the shift this settlement buckets to is CARRIED, never resolved
                // at fold time from the reading device's state (01-F34). That is why the
                // renderer reads it HERE, at append time, and writes the answer down.
                //
                // ⚠ This was a literal `null`, under a comment claiming "the POS has no shift
                // concept yet". It had one — this component reads `cashState()` — and the
                // three sibling call sites in `CashSurfaces.tsx` resolved it correctly while
                // the money path did not. The cost was total, not partial: `02-F22` binds
                // settlements to a shift, `shift-cash.ts` buckets by this key into `02-F23`'s
                // "system-expected cash (by method)", and a constant null meant NO sale ever
                // reached a shift's expected map — a cashier closed her shift and read Rs 0
                // expected from sales, with every settlement in the unbound bucket raising
                // `unbound_settlement`. `02-F37`'s anomaly is for the exceptional case; firing
                // on 100% of settlements it is noise, and it hid the defect it was reporting.
                //
                // `?? null` is NOT a fallback to tidy away — it is `02-F37` itself, and the
                // reason this resolution can never gate the append: settling with no shift
                // open SUCCEEDS, records the null reference, and is "never a modal, never a
                // block" because `01-F17` forbids stopping a sale with a customer standing
                // there. Bind when there is a shift; record the truth when there is not.
                //
                // `02-F45` governs the OTHER identity on this event and is deliberately not
                // touched: attribution rides the envelope's `actor_user_id`, stamped in main
                // from the PIN session. The shift is a payload key (a bucket, carried under
                // `26 §7`); the cashier is not (a second source for one fact). Adding a
                // `cashier` here would be the duplication that FR forbids by name.
                shift_id: openShift?.shift_id ?? null,
              },
              refs: [],
            }),
          );
        }}
      />
    );

  /**
   * `C19` — accept a cloud order. `02-F9`: **one tap**, `order.confirmed`, and *idempotent*
   * ("at most one confirm per order id; KOT jobs created exactly once, after confirm, never
   * before"). The idempotency is the KERNEL's, not this button's: `order.confirmed` folds as a
   * monotone OR over the confirm set (`sync-client/src/folds/merge.ts`), so a double-tap on a
   * counter with wet hands converges to one confirm rather than two tickets.
   *
   * The same append `sendToKitchen` makes, and deliberately the same one: `screen-map §4` is
   * explicit that screens do not hand off to each other, they append to one ledger — so
   * accepting a website order and sending a counter order to the kitchen are the same act
   * reached from two surfaces, not two mechanisms that must be kept in step.
   *
   * `write` (not `escalatableWrite`): `order.confirmed` has no `escalate` cell in the matrix,
   * and a manager-PIN pad on a control that can never need one is a pad that can never succeed.
   */
  const acceptCloudOrder = (order_id: string) => {
    // `02-F55` — the SAME act and therefore the same guard. `screen-map §4`: screens do not hand
    // off to each other, they append to one ledger, so a guard living on one tile is a guard the
    // other surface walks around. This is `sendToKitchen` reached from the inbox.
    sendToKitchen(order_id);
  };

  /**
   * `C31` / `02-F10` / `02-F51` (a) — **RECALL: the pressed order becomes this terminal's cart.**
   *
   * The one act on this surface that appends NOTHING (`02-F51` (b)). `02-F4`'s `order.parked` /
   * `order.unparked` are the branch-wide, ledger-visible form of this question and carry no
   * `01-F4` payload schema, so an emit is unbuildable — and a recall that wrote would file a
   * permanent row (`01-F1`) every time a cashier glanced at her own queue. **Which order a
   * TERMINAL is on is terminal state; which orders a BRANCH has open is the ledger's**, and
   * `02-F11` already publishes that. The stated cost: a recall here is invisible to every other
   * terminal, so two tills may hold one order — the state `02-F11` describes and
   * `DEC-MONEY-009`'s guard already refuses at settlement.
   *
   * **It also leaves the tab it was pressed on**, because the act is not finished on this surface:
   * the cart, the grid and `02-F8`'s confirm are all one tab over, and a cashier left staring at
   * the queue would have to know to navigate — a second act for one intent, which is what
   * `21 §4`'s tap budget and `screen-map §2`'s depth rule both spend. `27-F4` is untouched: the
   * rail is the same tabs in the same positions, and this moves the selection, not a control.
   */
  const recallOrder = (order_id: string) => {
    setCartOrderId(order_id);
    setActiveTab("order");
  };

  /**
   * `screen-map §5` — **"a cloud-order popup" gets no screen at all**: it *"interrupts a cart,
   * which `27-F11d` forbids"*, and the ruled alternative is *"S2 chime + count badge on the
   * Orders tab"*. This is the badge half.
   *
   * `27-F4` is satisfied by construction: the rail is still the same five tabs in the same
   * order, and a badge is a COUNT ON an existing tab rather than a sixth surface. `TabRail`
   * renders it only when non-zero, so a quiet counter carries no decoration.
   *
   * **The chime half is NOT built, and is owed rather than quietly dropped.** `21 §5` requires
   * "one sound vocabulary platform-wide", and this device has no audio at all — `03-F5`'s S1
   * "repeating distinct sound" is unbuilt too. Shipping an S2 chime alone would make a *new
   * website order* audible on a till where a *failed kitchen ticket* is silent, inverting the
   * severity ladder that FR exists to fix. Recorded in `apps/pos-electron/CLAUDE.md`.
   */
  const tabs = TABS.map((t) =>
    t.id === "orders" ? { ...t, badge: orders.filter(isCloudInbox).length } : t,
  );

  const cashSurface =
    cash === null ? (
      // `00 §5.7` — the device reports what it knows. An empty reconciliation drawn before the
      // seam answered is indistinguishable from a clean one, which on this surface is the
      // single most expensive thing to get wrong.
      <p>Reading the day…</p>
    ) : activeTab === "cash" ? (
      // `02-F20`/`05-F19` — the surface where the third outcome actually happens: a paid-out
      // above the org threshold is `escalate`, not `deny`, and this is the write that offers
      // the local manager-PIN path when main says the matrix escalates it.
      <CashSurface cash={cash} onAppend={escalatableWrite} />
    ) : (
      /*
        `02-F54` — the session-end seam, and it is a CALL rather than an append.

        Main ends the session and pushes `changed`; this renderer learns nothing from the call but
        that it returned, because `02-F18`/`App.tsx` put the lock decision in `deviceState()`
        alone — `01-F26`'s idle auto-lock fires with no call in sight, and a screen that flipped a
        local flag would leave main holding the session while looking right. `02-F41` would then
        go on stamping the departed cashier into every envelope the next one produces, which is
        the whole defect with a convincing screen in front of it.

        Optional-chained for the reason every other write member on this bridge records: a host
        that does not serve it leaves the control inert rather than throwing on the counter. The
        shipped preload always serves it.

        ⚠ **THE `catch` IS NOT TIDINESS, AND MUTATION FOUND IT — measured on the built binary,
        not reasoned.** Delete main's `ipcMain.handle(CHANNELS.lock, …)` and:

          · **all 329 renderer tests stay green** — every one of them injects its own bridge, so
            no suite in this app can see the main half of this channel at all;
          · the preload still exposes the member, so the optional chain saves nothing and the call
            REJECTS — driven on a live till: *"Error invoking remote method 'restos:lock': Error:
            No handler registered for 'restos:lock'"*;
          · the session therefore does **not** end. Verified by pressing the control on that build
            and reading the DOM back: `session ended? false`.

        Without this arm that rejection is unhandled, which `write`'s own header records as a
        process-level error in Electron rather than anything a cashier can act on — so she presses
        `Sign out`, keeps her session, and sees **nothing at all**: the exact silence `02-F57`
        exists to kill, landing on the one control that protects attribution (`02-F41`). With it,
        the same build puts one line in the work area — *"Not done — nothing has changed…"* — and
        that is the measured difference between the two. A lock that did not happen is a lock she
        must be able to see did not happen (`00 §5.7`), and it takes the announced word the
        refused writes already use rather than a second, competing surface.

        **The seam itself is guarded by nothing and that is REPORTED, not hidden.** `main/index.ts`
        builds an Electron app at module scope so no suite here can import it; the repo's
        instrument for exactly this is a source read in `main/__acceptance__/*-seam.test.ts`
        (`line-advance-seam.test.ts` §A). Writing one is the test-owning session's job under
        `24 §3` step 2 — this session implemented the FR and is disqualified from asserting it.
      */
      <MeSurface
        cash={cash}
        onLock={() => {
          setWriteRefusal(false);
          void window.restos
            .lock?.()
            .catch(() => setWriteRefusal(true))
            .then(reload);
        }}
      />
    );

  return (
    <AppShell
      actor={device.actor}
      deviceLabel={device.deviceLabel}
      businessDay={device.businessDay}
      lan={device.lan}
      hub={device.hub}
      cloud={device.cloud}
      /*
        `01-F56`/`DEC-SYNC-011` (a) — catalog health, straight through. It rides the same
        `deviceState()` read as the three reachability facts above and re-arrives on every
        `changed` push, so a refusal that clears leaves the strip without anything here polling.

        Passed WHOLE rather than destructured into props: the message is main's (it is the
        operator-facing wording `AlarmSchema` keeps on the trusted side) and the version is the
        till's, and a renderer that took them apart would be a renderer that could reassemble
        them differently on the next surface.
      */
      catalog={device.catalog}
      /*
        `27-F11c` / `00 §5.7` — the GLASS, and the price of the founder's bring-your-own-hardware
        ruling. The window's floor stopped refusing and started clamping, so this till now runs on
        screens the counter layout does not fit; `PanelHealth` on the strip is the only thing that
        tells the cashier so. Passed WHOLE for `catalog`'s reason directly above — the sentence is
        main's, formatted on the trusted side of `18 §9`, and a renderer that took it apart could
        reassemble it differently on the next surface.
      */
      panelFit={device.panelFit ?? null}
      /*
        `03-F5`/`27-F11d` — the print-failure band, and it is REAL now. This was `[]` with a
        recorded reason ("nothing constructs one yet"), which was honest then and would be the
        silent KOT failure the FR forbids now that K-7's spooler does construct them.

        Note where it renders: `AppShell` puts the band in the chrome, above a work area that
        does not move. That is `27-F11d`'s whole ruling — a half-built cart is never taken away
        from a cashier with a customer waiting, so everything below stays visible and usable.
      */
      alarms={alarms}
      onAcknowledgeAlarm={(id) => {
        // `03-F5`: acknowledgement is main's to record — the alarm lives beside the spooler, and
        // a screen that dismissed only its own copy would leave the band on every other surface
        // reading this device. `reload` follows so the band goes when main says it went.
        void window.restos.acknowledgeAlarm?.(id).then(reload);
      }}
      /*
        `03-F6`/`03-F48` — the RECOVERY beside the dismissal, and it is the whole point of this
        prop existing: until August 2026 a cashier whose kitchen ticket had exhausted `03-F4`'s
        retry budget could acknowledge that the food was not being cooked and nothing else, while
        pressing *Send to kitchen* again appended a second `order.confirmed` and printed nothing
        (`03-F55`'s coverage guard, working correctly on a job that never reached paper).

        The control renders only when the band CARRIES an action, which is main's decision and not
        this screen's — a renderer that decided would be a renderer that could offer a resend for
        a chit the kitchen already holds. Nothing is worded here either: the label rides on the
        alarm and the refusal comes back as the band's own subject (`AlarmSchema`, `18 §9`).
      */
      onAlarmAction={(id) => {
        void window.restos.resendAlarm?.(id).then(reload);
      }}
      tabs={tabs}
      activeTabId={activeTab}
      onSelectTab={setActiveTab}
      training={device.training}
    >
      {/*
        `02-F57` — **A REFUSED WRITE IS VISIBLE, and it is visible HERE.**

        `role="status"` and not `role="alert"`: this is the same choice `CatalogHealth`,
        `PanelHealth`, `ConnectionFacts`, `AgeBadge` and this file's own caller strip all made,
        and `write`'s header carries the three FRs that make `03-F5`'s band positively forbidden
        rather than merely unnecessary. No modal (`02-F37` — nothing goes between the cashier and
        the customer), and no acknowledgement control: the fact clears when the next attempt is
        made, which is the act that changes it.

        **In the work area rather than on the strip**, because `02-F57` puts the word *"where the
        act was taken"* — the strip is chrome about the DEVICE (who is on it, what it can reach,
        which day it is) and this is about the press she just made. It sits above the surface so
        it is in the same field of view as the control, and it is one `text-label` line so a
        surface at the hardware floor loses nothing structural to it.

        **No colour**, `27-F12`: the word carries it. `27-F14`'s three status hues are allocated
        to a closed list this is not on, and `fgColor-default` against the muted lines around it
        is legible in greyscale (`27-F13`).

        **The wording names no permission and no event type**, which `02-F57` explicitly leaves
        open — see `writeRefusal` for why naming the act would need a vocabulary no FR supplies.
        What it must do is separate three states, and it does: untried (nothing here), refused
        (this line), done (nothing here, and the surface below has moved).

        ⚠ *It read "this till would not record that" until the session-end control started using
        this same line.* A `02-F54` lock records nothing even when it SUCCEEDS, so that clause was
        false on one of the two acts it now serves — the `AMOUNT`/`COUNTED` caption defect in
        `CashSurfaces.tsx` is the same mistake one surface over. **What is true of both is that
        the act did not happen and nothing moved**, and that is what it says.
      */}
      {writeRefusal ? (
        <p role="status" style={{ ...STATE_LINE, color: color["fgColor-default"], marginLeft: 0 }}>
          Not done — nothing has changed. Try again, or ask a manager.
        </p>
      ) : null}
      {/*
        `02-F20` — the local manager-PIN path, in the WORK AREA and never over the chrome.
        `27-F11d`'s ruling is that the band and the strip stay put while a work surface changes,
        and this is a work surface: the cashier is mid-act, an approval is the next step of that
        act, and `27-F1` caps the depth at the one level this is.

        It is raised only when MAIN said the matrix escalates the refused write (`escalationFor`),
        so it can never appear over a `deny` — a pad that cannot succeed is worse than a refusal.
      */}
      {/*
        `02-F57` — **THE BOX THE SURFACES GET, so the refusal line above cannot cost one a
        control.**

        `WorkSurface` is a flex COLUMN and every surface below claims `height: 100%`, so a sibling
        line above them would push their full height past the box and `AppShell`'s `overflow:
        hidden` would silently eat the bottom of whichever surface was mounted — which on Cash is
        the drawer controls and on Pay is `TAKE CASH`. This wrapper takes the leftover instead:
        with no refusal it is the whole box and nothing about any surface changes, and with one it
        is the box minus a `text-label` line. `27-F2` forbids reaching a primary action by
        scrolling, so the cost has to land somewhere it can be measured, and a `flex: 1` box is
        where `layout:check` already looks.
      */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {pending !== null ? (
          <ManagerApproval
            satisfiedBy={pending.offer.satisfied_by}
            roster={roster}
            // `02-F38` — whose request this is, so her tile is not drawn on the approver grid.
            // `device.user` is `02-F41`'s attribution read through the same seam main appends
            // from, never a second copy of the identity (`02-F45`).
            requesterId={device.user?.user_id ?? ""}
            refusal={approvalRefusal}
            onSubmit={approve}
            // `05-F6` — the pad answers both ways, and only one of them lets the write through.
            onDeny={deny}
            onCancel={() => {
              setPending(null);
              setApprovalRefusal(null);
            }}
          />
        ) : correcting && current !== undefined ? (
          /*
            `C26`/`02-F20`/`02-F61` — the correction surface takes the whole work area, on
            `ManagerApproval`'s precedent directly above and for its reason: a 0–5×-a-shift act
            with three picks does not fit beside the grid, and `27-F2` forbids reaching a primary
            action by scrolling.

            **AFTER `pending`, deliberately.** A correction that has been refused and is waiting on
            a manager's PIN must show the PAD, not the surface that raised it — `correctLine`
            closes this arm as it fires, so the two can never both be up, and the ordering is what
            makes that true even if a later edit forgets.
          */
          <LineCorrection
            lines={current.lines}
            onSubmit={correctLine}
            onCancel={() => setCorrecting(false)}
          />
        ) : activeTab === "orders" ? (
          /*
          `C19`/`C31`. It takes the whole `orders` read — the same array the Order tab draws
          `current` from — because `02-F11` makes an order started on one terminal visible on
          every other, and a second, narrower read for this tab would be a second answer to
          "what is open" that could disagree with the cart.
        */
          <OrdersSurface
            orders={orders}
            inboxPage={inboxPage}
            onInboxPageChange={setInboxPage}
            openPage={openPage}
            onOpenPageChange={setOpenPage}
            onAccept={acceptCloudOrder}
            // `02-F51` (a) — a SECOND action, on the other list. `OrderList` takes exactly one each
            // (`27-F9`), so these are two props rather than one shared handler: passing the recall to
            // both would silently replace `02-F9`'s Accept and a website order could no longer be
            // taken at all.
            onRecall={recallOrder}
          />
        ) : activeTab === "soldout" ? (
          /*
          `02-F7` — THE 86, and the first surface in the product that can emit
          `availability.changed`. The fold, the lattice, the store table and `menu()`'s join have
          all shipped since July 2026 with no producer, so until now a restaurant that ran out of
          a dish could not stop RestOS selling it.

          **The same `ItemGrid`, in the same order, at the same positions as the Order tab.**
          `27-F4` protects a tile learned by position, and an operator who reaches for the karahi
          on one surface must find it in the same cell on the other — so this draws `items`
          unmodified rather than, say, the 86'd ones first. A "sold out at the top" grid would
          re-rank itself on every toggle, which is `27-F4`'s adaptive-ordering ban exactly.

          **A tap here means ONE thing, always** — that is why this is a tab and not a mode on
          the Order grid (`27-F5`: "no soft keys"). Nothing on this surface adds a line, so a
          mis-tap costs a re-tap and never a wrong sale.

          **`unavailable` here means 86'd and NOTHING else.** `menu()`'s `unavailable` also
          covers `01-F60`'s unpriced case, and that FR calls the two dispositions opposites — an
          86'd item has a known price and stays deliberately sellable (`01-F59`), an unpriced one
          has nothing to sell at. Greying an unpriced item on THIS grid would tell the operator
          the kitchen has run out of something nobody has touched. So it reads `sold_out`, the
          fold's own fact, and an unpriced item is togglable here like any other.
        */
          /*
          **CENTRED, and the layout gate is what decided it.** On `desktop-24` and `ultrawide-32`
          this surface first laid 332 dp of grid into a 944 dp work area and left 595 dp of slack
          at the bottom — the gate's `ANCHORED y` verdict, at 61% asymmetry against a 25% budget.
          Its wording states the choice: *"either the composition should fill the room, or it has
          a natural maximum and the surface should CENTRE it — both are decisions; this is
          neither."*

          This grid HAS a natural maximum. `ItemGrid`'s tiles are sized in millimetres of glass
          (`tileMm`, `27-F8`), so filling a 24" panel would mean growing targets past their
          ergonomic size — which is `27-F68` (b)'s ban read backwards, and just as wrong. So the
          room is given back symmetrically, exactly as Pay and Cash already do through `centred`.
        */
          <div style={{ display: "flex", gap: 16, height: "100%", minHeight: 0 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/*
              **THE BOX THE GRID IS COSTED AGAINST MUST BE THE BOX THE GRID GETS. Three gate
              runs taught that, and the third one cost this surface its instruction line.**

              1. `safe center` on the OUTER row makes this box content-height. `usePhysicalSize`
                 then reports a one-row box, `ItemGrid` costs one row of capacity, and the content
                 is one row — a self-consistent feedback loop that turned a 40-item grid into
                 FIVE pages of eleven tiles on a 1366×768 counter. **The gate PASSED on it**,
                 because one centred row is perfectly composed; only the screenshot showed it.
              2. Centring the grid alone failed `ANCHORED y` at 30% on `desktop-24` and
                 `ultrawide-32`: an instruction line pinned to the top of the work area while the
                 grid floated in the middle, and the composition check measures the UNION.
              3. Putting the line inside the centred group fixed that and broke something worse.
                 The grid was still handed the whole box as `heightMm`, so it costed ~17 px of
                 capacity it did not have, drew one row too many, and pushed its own pager off the
                 bottom — **`tablet-11.6` reported pager buttons `1` and `2` genuinely
                 UNREACHABLE**, centre not hit-testing. That is `27-F2`'s "no primary action
                 reached by scrolling" broken by a caption.

              **So there is no instruction line.** The alternatives were worse against resolving
              FRs rather than against taste: shrinking `tileMm` to buy the caption back is
              `27-F8`'s floor (`27-F68` (b) bans it by name), and subtracting a guessed caption
              height from `heightMm` re-introduces the assumed-panel arithmetic `27-F11c` exists
              to forbid. What the operator has instead is the tab's own label, the `Sold out`
              word on every 86'd tile, and the fact that a tap toggles — `21 §5` puts this
              operator at plausibly non-reading anyway, so a sentence was never the channel this
              surface should have leaned on. **Named as a real loss:** "tap it again to put it
              back" is now learned rather than read, and that is a training note, not a screen.

              Why CENTRE rather than fill: this composition has a natural maximum. `ItemGrid`
              sizes tiles in millimetres of glass (`tileMm`, `27-F8`), so filling a 24" panel
              would mean growing targets past their ergonomic size — `27-F68` (b) read backwards.
            */}
              <div
                ref={soldOutSurfaceRef}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "safe center",
                }}
              >
                {soldOutMm === null ? null : (
                  <ItemGrid
                    items={items.map((i) => ({
                      id: i.id,
                      label: i.label,
                      // `01-F58` — CONTESTED is its own state and not an intensifier: two devices
                      // disagree and the fold refused to pick a winner (`01-F31`). It resolves to
                      // unavailable, and one tap here supersedes ALL heads at once, which is what
                      // makes it clearable in a single operator act.
                      ...(i.sold_out === true
                        ? {
                            unavailable: true,
                            unavailableReason:
                              i.contested === true ? "Sold out — disputed" : "Sold out",
                          }
                        : {}),
                    }))}
                    posture="counter"
                    widthMm={soldOutMm.widthMm}
                    heightMm={soldOutMm.heightMm}
                    tileMm={28}
                    page={soldOutPage}
                    onPageChange={setSoldOutPage}
                    /*
                    `Tile` fires `onPress` even when unavailable (`01-F59`'s requirement on the
                    Order tab), which is exactly what this surface needs: the greyed tiles are
                    the ones that must be tappable to be put BACK. So the target state is
                    computed from the fold's fact, never from the tile's appearance.
                  */
                    onSelect={(item_id) => {
                      const item = items.find((i) => i.id === item_id);
                      if (item === undefined) return;
                      toggleAvailability(item_id, item.sold_out === true);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        ) : activeTab === "pay" ? (
          centred(paySurface)
        ) : activeTab === "cash" || activeTab === "me" ? (
          centred(cashSurface)
        ) : (
          <div style={{ display: "flex", gap: 16, height: "100%", minHeight: 0 }}>
            {/*
          The measured surface. The grid renders INSIDE this box, so what is measured and what
          is filled are the same element — a grid sized from one box and placed in another is
          how the cart got pushed off screen.
        */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/*
            C4 — the order-type row. It holds this position ALWAYS (`27-F4` positional memory,
            `27-F5` no controls that change with context): when an order is open the three
            choices are greyed in place with the reason, never removed and never replaced by
            something else. A row that vanished once work started would move the grid under a
            cashier mid-order, which is the one thing `27-F4` calls a breaking change.
          */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {ORDER_TYPES.map((t) => (
                  <Tile
                    key={t.id}
                    posture="counter"
                    label={t.label}
                    icon={t.id}
                    /*
                    `DEC-MONEY-009`'s contributing defect, and this is the half that made the
                    double settlement easy to reach. These three tiles were greyed by
                    `current !== undefined`, so **once anything in the branch was open this till
                    could not start an order at all** — and `02-F11` puts every terminal's open
                    orders in one list, so a second cashier's only cart was the first cashier's
                    bill. Two customers, one bill, and then two settlements against it.

                    Nothing in `02-F1` or `01 §4` limits a terminal to one open order; the tiles
                    were greyed because the cart was `orders[0]` and had nowhere else to point.
                    With `cartOrderId` there is somewhere, so a type tap always starts a NEW
                    order and that order becomes this till's cart.

                    `27-F4` is untouched: no tile is added, removed or moved. A greying is
                    lifted, which is precisely what that FR calls a non-breaking change.
                  */
                    onPress={() => startOrder(t.id)}
                    // Greyed while no channel is latched, because `02-F1` requires BOTH axes at
                    // creation and `startOrder` refuses without one. `27-F4`: disabled IN PLACE
                    // with the reason on the surface's state line — never removed, never moved.
                    unavailable={pendingChannel === null}
                  />
                ))}
                {/*
              C9 — one tap, and it is the whole kitchen handoff (`21 §4`'s 2-tap law counts
              grid → confirm). Greyed with its reason until there is an order to send, rather
              than absent, for the same positional reason as the row above.
            */}
                {/*
                `02-F55` — **THE GLASS NOW SAYS WHETHER THE KITCHEN HAS IT, and the third state
                is the one that did not exist.**

                Measured August 2026: the tile read `Send to kitchen` before the first press and
                after it, so nothing on the surface separated *sent* from *not sent* — and the
                second press is the reasonable act of somebody who cannot see the first one
                worked. `03-F55` had already filed this surface question as OWED from the
                kitchen's side; this is that half.

                Three states, `27-F4`'s "disabled IN PLACE with its reason" throughout — the
                control never moves, is never removed and never loses its label:

                  (i)   no order          greyed · `no order started`   (unchanged, preserved)
                  (ii)  not told          live, claiming nothing
                  (iii) told, owes nothing greyed · `the kitchen has this order`

                `Tile` never sets `disabled` (`01-F59`'s recorded reason), so the greying alone
                cannot refuse a press — the refusal is in `sendToKitchen`, where it can tell state
                (iii) from `03-F55`'s addendum. That is the same division of labour the item grid
                already uses one box down.
              */}
                <Tile
                  posture="counter"
                  label="Send to kitchen"
                  onPress={
                    current === undefined ? undefined : () => sendToKitchen(current.order_id)
                  }
                  unavailable={current === undefined || kitchenIsOwedNothing(current)}
                  {...(current === undefined
                    ? { unavailableReason: "no order started" }
                    : kitchenIsOwedNothing(current)
                      ? { unavailableReason: "the kitchen has this order" }
                      : {})}
                />
                {/*
                `02-F55` / `03-F55` — **the addendum state, and it needs a sentence of its own.**

                An order that has been confirmed AND has gained lines since is the case `03-F55`
                exists for: the dish is on the bill, `01-F53` captured its price, and nobody in
                the kitchen has been told. The tile alone cannot carry it — a live `Send to
                kitchen` looks identical to the ordinary not-yet-sent state — so the one state
                whose whole point is "something changed since you last sent" says so.

                Rendered only in that state, which is `27-F16`'s rule applied to words rather than
                to colour: spend the channel on the exception, never on the base case. The two
                ordinary states (nothing sent yet; kitchen has everything) are carried by the tile
                itself, so this line costs the row nothing in the states a cashier is in all day.
              */}
                {current !== undefined && kitchenOf(current) === "owed" ? (
                  <p style={{ ...STATE_LINE, color: color["fgColor-default"] }}>
                    New lines — the kitchen has not been told about them
                  </p>
                ) : null}
                {/*
                THE SURFACE'S STATE, SAID ONCE.

                Found by looking, August 2026. `27-F4` requires an unready surface to be
                "disabled IN PLACE with its reason", and this screen was discharging that by
                stamping the SAME sentence onto every tile it applied to: "order in progress"
                three times across the type row, and "choose an order type first" **27 times**
                across the item grid — where it outweighed the item names themselves, since the
                reason ran to three lines against the label's one or two.

                That inverts what the grid is for. `21 §5` and `27-F31` put the operator at
                plausibly non-reading and make the grid a RECOGNITION surface at fixed
                positions; a wall of identical English boilerplate is the worst channel
                available to her, and it buried the only thing on the tile she can actually use.
                `27-F16` makes the same argument about colour — spend the channel on the
                exception, never on the base case — and repetition is a channel.

                So a reason that is identical for every tile is a property of the SURFACE and is
                stated here, once, beside the controls that resolve it. A reason that differs
                per tile stays on the tile, because there it carries information: `01-F59`'s
                86'd item still reads "86'd" on its own tile, and "no order started" stays on
                Send-to-kitchen, which is the only control it describes.

                The tiles keep the greyed fill, their labels and their positions — nothing
                moves, which is the half of `27-F4` that actually protects muscle memory.
              */}
                {/*
                Unchanged wording, deliberately. Each row now states ITS OWN precondition — this
                line is about the type row, the channel row below has its own — so the sentence a
                cashier learned for this row still describes this row. Which row is actionable is
                said by the greying, not by re-writing a line about a different control.
              */}
                {/*
                ⚠ The second half of this sentence changed with `DEC-MONEY-009`, because the
                control it describes changed. It read `Order in progress` beside three tiles that
                were inert, which was true of both. The tiles are live now — a type tap starts
                ANOTHER order — so a line that only named the current order would leave a cashier
                with no way to know that, and `27-F5` requires an action to have a visible,
                labelled target. The first branch is untouched, so the sentence a cashier learned
                for an empty counter is the one she still reads there.
              */}
                {/*
                ⚠ **THE SECOND BRANCH NAMED A TAP IT WOULD SILENTLY IGNORE — corrected August
                2026 (`27-F4`, `27-F5`, `02-F1`).**

                It read *"Order in progress — a type starts another order"*, which is an
                INSTRUCTION, and the tap it instructs does nothing: `startOrder` returns
                immediately when no channel is latched. `27-F5` gives every action a persistent,
                visible, labelled target; here the target was visible, labelled and inert, with
                the surface's own state line — the one place `27-F4` puts the reason — spent
                asserting the opposite of what happens.

                **The refusal is CORRECT and is not what changed.** `02-F1` requires both axes at
                creation and forbids inferring either later, so a type tap with no channel must
                refuse; defaulting the channel would ring a phone order at counter prices into a
                ledger `01-F1` forbids correcting. What was wrong was the sentence.

                The resting state already had this right — *"Choose a channel first — it sets the
                price"* sits on the row below — so the fix is to give the in-progress branch the
                same two-step honesty rather than to invent a new idiom: the goal, and the
                precondition the tap is actually waiting for, both on the glass. The promise
                `27-F5` needs is kept and the condition is stated in the same breath.
              */}
                <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
                  {current === undefined
                    ? "Choose an order type first"
                    : "Order in progress — a type starts another order once a channel is chosen"}
                </p>
              </div>
              {/*
              `C18`/`C21` — THE CHANNEL ROW (`02-F1`, `02-F28`, `02-F30`, `restaurant-os.md` §8).

              **`27-F4` BREAKING CHANGE, justified: this row is ADDED BELOW the `C4` row and
              NOTHING that exists moves.** Above would read in work order (channel, then type)
              and would push the three type tiles and `Send to kitchen` down by a row — moving
              the most-used controls on the surface. Keeping a learned control where a finger
              already goes is the stronger half of `27-F4`; the reading order is the cost, and it
              is paid by the state line above, which names the sequence in words.

              **A pick-list of tiles, not a dropdown or a typed field** (`27-F6`: 24 of 27 field
              subjects could not type a word; `27-F2`: flat, not hierarchical). Every channel is
              visible and labelled at all times, so there is no context-dependent control here
              (`27-F5`) — a selector that collapsed to the chosen value would be exactly that.

              **The tiles never disappear once an order is open.** ⚠ *They used to grey once one
              was, and that greying is LIFTED (`DEC-MONEY-009`).* It was the other half of "there
              is no way to start a second order": `startOrder` refuses without a latched channel
              (`02-F1` wants both axes at creation), so a greyed channel row made the ungreyed
              type row above unusable. This row has always meant *the channel the NEXT order will
              be created on* — its own state declares that in those words — and that meaning does
              not change because one order happens to be open. `02-F1` still fixes a channel at
              creation and never infers it later: nothing here touches the open order, and the
              state line below says which channel that order is on until a new one is latched.
            */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {ORDER_CHANNELS_AT_COUNTER.map((c) => (
                  <Tile
                    key={c.id}
                    posture="counter"
                    label={c.label}
                    icon={c.id}
                    selected={pendingChannel === c.id}
                    onPress={() => {
                      setPendingChannel(c.id);
                      // Latching a different channel ends the call: this order is not a phone order
                      // any more, so the caller it was for is not a fact about it (`02-F1` — the
                      // channel is set at creation, and so is who it is for).
                      if (c.id !== PHONE_CHANNEL) clearCaller();
                    }}
                  />
                ))}
                {/*
                `Tile.selected` is explicit that a selection is *"never by colour alone, so a
                caller marking a tile selected still says so in words"* (`27-F66`). This line is
                those words, and it names the PRICE consequence rather than the tag — which is
                what `01-F60` makes the choice actually mean to a cashier.

                ⚠ **The branches are the same three sentences; only their ORDER changed.** A
                latched channel now wins over an open order, because with the row live the pending
                choice is the newer fact and it is the one that decides the next `order.created`.
                With nothing latched an open order still reports its own fixed channel, so the
                sentence a cashier reads mid-order is unchanged from before this ruling.
              */}
                <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
                  {pendingChannel !== null
                    ? `Selling at ${channelLabel(pendingChannel)} prices`
                    : current !== undefined
                      ? /*
                        ⚠ **This branch interpolated the RAW STORED ID until the channel ruling
                        landed**, which was invisible while the id and the label were the same
                        word. They are not any more: a cashier who pressed `In restaurant` would
                        read *"This order is counter"* one line below the tile she pressed — two
                        names for one channel, on the surface `00 §5.6` says is navigated by
                        memorised position by people who read little English.
                      */
                        `This order is ${channelLabel(current.channel ?? "counter")} — its prices are fixed`
                      : "Choose a channel first — it sets the price"}
                </p>
              </div>
              {/*
            The measured surface. The grid renders INSIDE this box, so what is measured and what
            is filled are the same element — a grid sized from one box and placed in another is
            how the cart got pushed off screen.
          */}
              <div ref={surfaceRef} style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}>
                {/*
              Nothing is drawn until the first measurement. `usePhysicalSize` deliberately returns
              null rather than a default, because a default is a guessed panel by another name and
              a grid costed for the wrong surface puts tiles off-page where no pager can reach
              them — on a counter, an item that cannot be sold.
            */}
                {/*
                `02-F27` — the caller surface takes this box while the phone channel is latched.
                See `callerSurface` for the measurement that put it HERE rather than in a row of
                its own, and for what that costs.
              */}
                {pendingChannel === PHONE_CHANNEL ? (
                  callerSurface
                ) : gridMm === null ? null : (
                  <ItemGrid
                    items={
                      /*
                    The grid is DISABLED IN PLACE until an order exists (founder ruling, §3.6) —
                    greyed with the reason, never emptied, so the tile an operator reaches for by
                    position is still where they learned it.

                    Note what this is NOT: `01-F59`'s 86 uses the same visual and stays
                    deliberately SELLABLE, so `Tile` fires `onPress` even when unavailable and
                    the two cases cannot be told apart by the flag alone. The refusal therefore
                    lives in `onSelect` below, where it can distinguish them — a `disabled`
                    attribute here would break `01-F59` for the 86 case, which is the exact
                    defect `8b28a72` removed.
                  */
                      current === undefined
                        ? items.map((i) => ({
                            ...i,
                            unavailable: true,
                          }))
                        : items
                    }
                    posture="counter"
                    widthMm={gridMm.widthMm}
                    heightMm={gridMm.heightMm}
                    tileMm={28}
                    page={page}
                    onPageChange={setPage}
                    /*
                  C5 — the counter's highest-frequency act, ~300x a shift, and now one tap.

                  THE GUARD IS REAL NOW, and it has to be here rather than in the greying above:
                  `Tile` fires `onPress` even when unavailable, because `01-F59` rules that an
                  86'd item stays deliberately sellable and `8b28a72` removed the `disabled`
                  attribute for exactly that reason. So "greyed" cannot refuse a tap, and without
                  this line a tap with no order open would append an `order.line_added` naming an
                  `order_id` that does not exist — unremovable under `01-F1`.

                  No price crosses this call. `addLine` names an order, an item and a quantity;
                  main resolves the price from this device's branch and the ORDER's channel
                  (`01-F60`) and captures it into the event (`01-F53`).
                */
                    onSelect={(item_id) => {
                      if (current === undefined) return;
                      write(window.restos.addLine({ order_id: current.order_id, item_id, qty: 1 }));
                    }}
                  />
                )}
              </div>
            </div>
            {/*
          The cart stays here and only here — `screen-map §3.1` requires it "always visible,
          never a separate screen, never collapsed", because it is the operator's working
          memory while she is ringing. Settling moved to the Pay tab; see `paySurface` above
          for the measurement that forced it.

          ⚠ **THE COLUMN AROUND IT IS NOT DECORATION AND WAS ADDED BY LOOKING.** `C7`'s tag row
          was first written as a sibling of the cart, which made it a THIRD child of this row —
          so it rendered in the empty space to the RIGHT of the cart, 260 px from the dish it
          qualifies, and widened the row enough to clip `netbook-1024` by 5 px. Every one of the
          981 renderer tests passed: happy-dom performs no layout, so "the tag button is in the
          document" was all any of them could say. Caught on the gate's first screenshot, which
          is this repo's ninth layout defect found by looking and its tenth overall.
        */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: space["space-2"],
                minHeight: 0,
              }}
            >
              {/*
              ⚠ **THE `flex: 1` ROW BOX AROUND THE CART IS LOAD-BEARING AND WAS ADDED BY
              MEASURING.** The cart used to be a direct child of the surface's flex ROW, so it
              stretched to the full working height; wrapping it in a COLUMN to hang the tag row
              off made it size to its own content instead, and the whole Order surface became
              top-anchored. That is not cosmetic — `layout:check`'s composition axis went from 1
              violation to 14, every one an `ANCHORED y` on the `caller` surfaces where the left
              column is short and the cart was the only thing holding the vertical axis open
              (`desktop-24 caller`: 248 px of content with 684 dp of slack under it, 72% of the
              axis). A row-direction box with the default `alignItems: stretch` gives the cart its
              height back, and `flex: 1` + `minHeight: 0` is what lets it yield exactly the tag
              row's height rather than pushing it off the glass.
            */}
              <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                <Cart
                  lines={(current?.lines ?? []).map((l) => ({
                    id: l.line_id,
                    name: l.name,
                    quantity: l.quantity,
                    modifiers: l.modifiers,
                    removals: l.removals,
                    ...(l.note === null ? {} : { note: l.note }),
                    /*
                      `27-F24` — *"Every total, change amount, LINE TOTAL and elapsed minute
                      arrives as a finished number."* This prop is the second thing on this
                      surface the whole track turned on, and it is the `onRemove` defect below in
                      its purest form: `OpenOrderSchema.lines[].billed_paisa` has been REQUIRED at
                      this seam since `02-F20`'s correctives landed, `LineCorrection`'s picker
                      renders it, and the cart — the surface a cashier actually watches — dropped
                      it on the floor, so a real till showed `1 Chicken Biryani ✕ NO` and one
                      figure at the bottom. It is the ENGINE's `billedLinePaisa` (`26 §8`) and is
                      never re-derived here; `paisa()` only puts `00 §6`'s brand back on a number
                      the IPC schema has already narrowed to a non-negative integer.
                    */
                    billedPaisa: paisa(l.billed_paisa),
                    ...(offBillWord(l.states) === undefined
                      ? {}
                      : { offBill: offBillWord(l.states) }),
                  }))}
                  // The total is the ENGINE's own derivation, carried across the IPC seam as
                  // branded integer paisa and never re-summed here (00 §6, 26 §8).
                  totalPaisa={paisa(current?.total_paisa ?? 0)}
                  /*
                    ⚠ **THE ROWS AND THE TOTAL WERE TWO DIFFERENT QUANTITIES AND NOTHING SAID SO.**
                    The money column above is `billedLinePaisa`; `totalPaisa` is `01-F82`'s
                    `billed_total`, tax included and rounded. Measured on a real till under
                    `exclusive` 16 %: rows **Rs 853** under **`TOTAL Rs 989`**, and no `Subtotal`
                    or `Tax` anywhere on the counter — the shape `receipt-document.ts` refuses on
                    paper (*"a receipt whose lines do not add up to its total is worse than one
                    that asks the reader to multiply"*), moved onto the glass.

                    **Both props are a PASS-THROUGH and this file decides nothing.** Presence is
                    `main/gateway.ts`'s call, because whether the per-line figures already contain
                    the tax is a fact about the projection it produced, and `16-F2`'s posture is
                    kernel vocabulary that `18 §6` keeps off this plane. `paisa()` only restores
                    `00 §6`'s brand to numbers `OpenOrderSchema` has already narrowed to
                    non-negative integers — the identical move `billedPaisa` above makes.
                  */
                  {...(current?.charge_tax === undefined
                    ? {}
                    : {
                        tax: {
                          subtotalPaisa: paisa(current.charge_tax.subtotal_paisa),
                          taxPaisa: paisa(current.charge_tax.tax_total_paisa),
                        },
                      })}
                  {...(current?.charge_rounding === undefined
                    ? {}
                    : {
                        rounding: {
                          magnitudePaisa: paisa(current.charge_rounding.magnitude_paisa),
                          direction: current.charge_rounding.direction,
                        },
                      })}
                  /*
                  `C8`/`02-F8` — **this prop is what the whole track turned on.** `Cart` has
                  declared `onRemove` since it was written and this line never passed it, so the
                  component rendered no control at all: a prop, a `27-F9` comment about where a
                  destructive target may sit, styling, and no way for a cashier to reach any of
                  it. The wave's named recurring defect at its smallest — one argument.
                */
                  onRemove={removeLine}
                />
              </div>
              {/*
              `C7`/`02-F6`/`02-F50` — the quick-tag pick list, drawn directly under the cart.

              `27-F5`'s persistence is honoured the way it can be here: the row is present whenever
              there is a dish to qualify and the org has configured tags, and its ABSENCE is the
              absence of the whole row rather than a row of inert controls — a tag tile that did
              nothing would be the "control that appears and disappears" failure wearing the other
              costume, and `01-F17` means nothing about a note may reach the sale.

              The tag lands on `lastLine` — see `addNote` for why the last line rung and not a
              selected one. **What makes that readable without a sentence is the FEEDBACK, not a
              label**: the note appears under its dish in the cart immediately above, in
              `QuantityItemLine`'s own note row, so the operator sees where it went (`21 §5`:
              icons + numbers dominant, minimal words; `00 §5.6`: memorized position).
            */}
              {/*
              ⚠ **THE CONDITION CHANGED IN AUGUST 2026 AND THE OLD ONE IS WORTH READING.** It was
              `lastLine === undefined || quickTags.length === 0`, i.e. the whole row was absent
              unless the org had configured tags — and the note below explains that absence for
              TAGS, which is still exactly right: an inert tag tile is `27-F5`'s failure mode
              wearing the other costume.

              `C26`'s correction control is not inert and is not org-configured, so it hangs on
              `lastLine` alone. The row is folded rather than given a box of its own **for a
              measured reason**: this column's height is what the panel floor rests on
              (`window-options.ts`, `PANEL_FLOOR_MM`), a second `counter`-posture row costs ~76 dp
              of the tightest vertical budget in the product, and `flexWrap` means one more tile in
              an existing row costs nothing in every state a shift actually spends its time in.
              The one state that gains a row is *an order with lines and no tags configured*.
            */}
              {lastLine === undefined ? null : (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    // `27-F59`'s indent, the same one `QuantityItemLine` gives a modifier: this row
                    // belongs to the cart above it and reads as subordinate to it.
                    paddingLeft: space["space-6"],
                  }}
                >
                  {/*
                    `C26` — the way IN to void, comp and discount. `27-F5`: present whenever there
                    is a dish to correct, never disabled and never moved. It is deliberately NOT a
                    second per-row control on `Cart`: `27-F9` keeps a destructive target away from
                    a high-frequency one on a surface a wet hand touches, and the row's existing
                    `NO` is `02-F8`'s pre-confirm removal — a DIFFERENT act with a different
                    permission cell. Two destructive controls one thumb apart, one of which needs a
                    manager, is the confusion that FR exists to prevent.
                  */}
                  <Tile
                    posture="counter"
                    label="Correct a line"
                    destructive
                    onPress={() => setCorrecting(true)}
                  />
                  {quickTags.map((tag) => (
                    <Tile
                      key={tag}
                      // `27-F8`'s standing-counter minimum. NOT `keypad`: that row is
                      // "high-consequence NUMERIC entry" and spending 20 mm of the tightest
                      // vertical budget on the screen here is what pushes the pad off the glass.
                      posture="counter"
                      label={tag}
                      onPress={() => addNote(lastLine.line_id, tag)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
};
