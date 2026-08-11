import { newId, paisa } from "@restos/domain";
import {
  AppShell,
  Cart,
  formatPaisa,
  ItemGrid,
  Readout,
  space,
  type Tab,
  TenderPanel,
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
  MenuItem,
  OpenOrder,
  RosterMember,
} from "../shared/ipc";
import { CashSurface, MeSurface, openShiftOf } from "./CashSurfaces";
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
 * that is the point rather than a duplication: `gateway.ts` projects `total_paisa` from the
 * engine's own `billedEffectiveFromJsonLines` and `paid_paisa` from the fold's `pay_total`, so
 * this reads the guard's two inputs after one lossless mapping. The refusal is decided in main
 * (Commandment 8's side of `18 §9`); this decides only what the cashier is TOLD, and a screen that
 * used a different rule would offer a `TAKE CASH` the ledger then refuses.
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

const ORDER_TYPES: readonly { id: string; label: string }[] = [
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
 * **It is THREE of `02-F42`'s five, and the narrowing is an INTERPRETATION — stated, not
 * silent.** `storefront` and `whatsapp` are absent because no FR has a counter operator keying
 * one in: `02-F9` puts cloud orders from docs 06/07 in an INBOX pane where they are *accepted*,
 * and `08-F8` auto-confirms aggregator API orders on ingest. A counter-created `storefront`
 * order would be fabricated provenance in the channel-economics axis (docs 12/13) that `02-F42`
 * closed the set to protect. The three that remain each have an FR that puts them here:
 * `counter` (`02-F1`), `phone` (`02-F27`/`02-F28`), `foodpanda` (`02-F30`).
 *
 * **The simpler alternative, named rather than dismissed:** offer all five. Widening is additive
 * and costs one line; the wrong guess the other way writes a channel into an append-only ledger
 * that no report can ever attribute. `counter-channel-row.dom.test.tsx` §A is the tripwire so
 * this cannot widen or narrow by accident.
 *
 * **There is NO DEFAULT, extending `C4`'s founder ruling one axis over.** `ORDER_TYPES` below
 * records why order type has none: pre-selecting *"would save one tap on ~75 orders a shift and
 * would silently corrupt the axis"*. Every word of that applies harder here, because
 * `order_type` is a reporting axis and `channel` is MONEY — a phone order rung on a
 * pre-selected `counter` chip bills at counter prices, and `01-F53` freezes the mistake. Cost,
 * stated: one extra tap on the counter's second-most-frequent act. **Flagged for founder review
 * as a pinned interpretation, not a transcription** — the ruling was made about `order_type`.
 */
const ORDER_CHANNELS_AT_COUNTER: readonly { id: string; label: string }[] = [
  { id: "counter", label: "Counter" },
  { id: "phone", label: "Phone" },
  { id: "foodpanda", label: "Foodpanda" },
];

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
   * **`null` falls back to `orders[0]`, which is deliberate and is the whole of the compatibility
   * story.** A till that has started nothing this session — a fresh launch, or one whose order has
   * just settled out of the projection — behaves exactly as it did. What changes is that the
   * moment this till starts an order, THAT order is its cart, whatever else the branch has open.
   *
   * **Owed, and named rather than left to look intentional:** an order started on this till and
   * then abandoned to a relaunch is reachable only through `orders[0]`. `02-F10`'s recall is the
   * FR that closes it and the Orders tab is its surface, but `orders-tab.dom.test.tsx` §E is an
   * oracle asserting that an open-order row carries **no control at all** — so putting a recall
   * action there is a change for that file's test owner to make, not for this session (`24 §3`).
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
  const current = orders.find((o) => o.order_id === cartOrderId) ?? orders[0];
  const menuChannel = current?.channel ?? pendingChannel ?? GRID_PREVIEW_CHANNEL;

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
  }, [pendingChannel, dialled]);

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
   * **What is deliberately NOT here: a visible alarm.** `03-F5`'s S1 band is the surface a
   * refusal should reach, and `AppShell` already takes `alarms` — but nothing constructs one yet,
   * and inventing a local error banner would put a second, competing error surface on the screen
   * that the alarm model is meant to own. Recorded rather than improvised.
   */
  const write = (op: Promise<unknown>) => {
    void op.catch(() => {}).then(reload);
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
    void window.restos
      .append(req)
      .then(() => null)
      .catch(() => window.restos.escalationFor?.(req)?.catch(() => null) ?? null)
      .then(async (offer) => {
        setApprovalRefusal(null);
        if (!offer) {
          setPending(null);
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
   * `02-F27` — *"unknown number → inline customer creation"*, as one tap.
   *
   * **No name and no address cross this call, and that is `27-F6` rather than a shortcut.** *"No
   * operational role is ever required to type non-numeric text to complete a CRITICAL-PATH task …
   * of 27 field subjects, 24 could not type a single word."* That FR blesses `02-F27`'s customer
   * name as an **optional** escape hatch, and optional is the whole of it: this control files the
   * caller with `name: null` — `06-F11`'s *"created on first sight from a checkout that captured
   * only a number"*, which `registry.ts` declares the payload nullable to express — so an operator
   * who cannot type still completes the flow.
   *
   * **OWED, and named rather than left to look intentional:** the typed name and `06-F9`'s
   * free-text address have no surface here at all, so a delivery order taken from a new caller
   * still has nowhere to send the food. The blocker is not this screen — `packages/ui` ships no
   * text-entry component at all, and `21-F2` bans raw interactive primitives in app code
   * (`closed-vocabulary.test.ts` is the guard, and it correctly refuses the shortcut) — so the
   * escape hatch `27-F6` permits cannot be built until `packages/ui` gains that component, which
   * `21-F5` makes a design-owner review rather than this session's call.
   * `gateway.recordCustomer` already carries both fields.
   *
   * `01-F1` is why this is an explicit act and not something the screen does on her behalf: a
   * created identity is permanent, and an automatic file-on-resolve would record every wrong
   * number and every hang-up for ever — the same argument `gateway.lookupCustomer` makes for
   * appending nothing at all.
   */
  const recordCaller = () => {
    const op = window.restos.recordCustomer?.({ dialled, name: null });
    if (op !== undefined) write(op);
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
  const sendToKitchen = (order_id: string) => {
    write(window.restos.append({ type: "order.confirmed", payload: { order_id }, refs: [] }));
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
      <div style={{ ...CALLER_PAD, flexShrink: 0 }}>
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
            <Tile posture="counter" label="Save caller" onPress={recordCaller} />
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
      <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
        No order to settle — start one on Order.
      </p>
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
    write(window.restos.append({ type: "order.confirmed", payload: { order_id }, refs: [] }));
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
      <MeSurface cash={cash} />
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
      tabs={tabs}
      activeTabId={activeTab}
      onSelectTab={setActiveTab}
      training={device.training}
    >
      {/*
        `02-F20` — the local manager-PIN path, in the WORK AREA and never over the chrome.
        `27-F11d`'s ruling is that the band and the strip stay put while a work surface changes,
        and this is a work surface: the cashier is mid-act, an approval is the next step of that
        act, and `27-F1` caps the depth at the one level this is.

        It is raised only when MAIN said the matrix escalates the refused write (`escalationFor`),
        so it can never appear over a `deny` — a pad that cannot succeed is worse than a refusal.
      */}
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
            style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
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
            style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}
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
              <Tile
                posture="counter"
                label="Send to kitchen"
                onPress={current === undefined ? undefined : () => sendToKitchen(current.order_id)}
                unavailable={current === undefined}
                {...(current === undefined ? { unavailableReason: "no order started" } : {})}
              />
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
              <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
                {current === undefined
                  ? "Choose an order type first"
                  : "Order in progress — a type starts another order"}
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
                  ? `Selling at ${
                      ORDER_CHANNELS_AT_COUNTER.find((c) => c.id === pendingChannel)?.label ??
                      pendingChannel
                    } prices`
                  : current !== undefined
                    ? `This order is ${current.channel ?? "counter"} — its prices are fixed`
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
        */}
          <Cart
            lines={(current?.lines ?? []).map((l) => ({
              id: l.line_id,
              name: l.name,
              quantity: l.quantity,
              modifiers: l.modifiers,
              removals: l.removals,
              ...(l.note === null ? {} : { note: l.note }),
            }))}
            // The total is the ENGINE's own derivation, carried across the IPC seam as branded
            // integer paisa and never re-summed here (00 §6, 26 §8).
            totalPaisa={paisa(current?.total_paisa ?? 0)}
          />
        </div>
      )}
    </AppShell>
  );
};
