import { newId, paisa } from "@restos/domain";
import {
  AppShell,
  Cart,
  ItemGrid,
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

const ORDER_TYPES: readonly { id: string; label: string }[] = [
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "delivery", label: "Delivery" },
];

/**
 * `02-F1` — the counter app is the `counter` channel, always. Written as a named constant
 * rather than inline because `02-F42` makes this a **price key**: it selects which of the
 * catalog's per-channel prices a line snapshots (`01-F60`), so it is a money-bearing value
 * and not a label. A phone order taken at this till is `phone` and is `C18`, not this path.
 */
const COUNTER_CHANNEL = "counter";

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

  const reload = useCallback(async () => {
    // Three reads, never a join in the renderer: the folds already hold these projections and
    // assembling a fourth shape here would be fold logic reimplemented outside the engine
    // (26 §8). The gateway does the one join the queue genuinely needs.
    const [d, o, m, c, a] = await Promise.all([
      window.restos.deviceState(),
      window.restos.openOrders(),
      window.restos.menu(),
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
  }, []);

  useEffect(() => {
    void reload();
    // The push carries no data — main says "the folds moved" and the renderer re-reads. A
    // push that carried rows would be a second source of truth for what the folds already own.
    return window.restos.onChanged(() => void reload());
  }, [reload]);

  // `01-F17` — a sale is never blocked. A shell that has not loaded its device state yet is
  // the one case where there is genuinely nothing to draw, so it says so in a word rather
  // than rendering an empty counter that looks like a working one with no orders.
  if (!device) return <p>Starting…</p>;

  const current = orders[0];

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
   * `C4` — start an order. One append, and every field it carries is a decision made HERE and
   * never inferred later (`02-F1`).
   *
   * `order_id` is minted in the renderer, which looks like it contradicts the seam's rule that
   * main stamps identity — it does not. `01-F1`'s stamped identity is the ENVELOPE's (`id`,
   * `device_id`, `branch_created_at`), all of which main still owns. An `order_id` is a payload
   * key, and it has to be minted by whoever will reference it in the same breath.
   */
  const startOrder = (order_type: string) => {
    write(
      window.restos.append({
        type: "order.created",
        payload: { order_id: newId(), channel: COUNTER_CHANNEL, order_type },
        refs: [],
      }),
    );
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
  const centred = (children: React.ReactNode) => (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
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
    ) : (
      <TenderPanel
        dueP={paisa(current.total_paisa)}
        takenP={paisa(current.paid_paisa)}
        onTender={({ amountP, method }) => {
          void window.restos
            .append({
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
            })
            .then(reload);
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
                  onPress={current === undefined ? () => startOrder(t.id) : undefined}
                  unavailable={current !== undefined}
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
              <p style={{ ...STATE_LINE, color: color["fgColor-muted"] }}>
                {current === undefined ? "Choose an order type first" : "Order in progress"}
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
              {gridMm === null ? null : (
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
