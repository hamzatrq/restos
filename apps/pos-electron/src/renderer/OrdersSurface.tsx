import { paisa } from "@restos/domain";
import { OrderList, type OrderRow, Panel, space, usePhysicalSize } from "@restos/ui";
import type { OpenOrder } from "../shared/ipc";

/**
 * The **Orders** tab — `C19` (accept a cloud order) and `C31` (find that order again).
 *
 * `plans/wave-1/screen-map.md §3.1` gives this row four tasks; **two of them cannot be built
 * today and are named here rather than faked**, because a screen that looks complete is how a
 * missing catalog entry stops being visible:
 *
 * - **`C20` — reject a cloud order.** `order.rejected` reached the `01 §4` catalog in July 2026
 *   (the absorption note under the event list names C20 by number), but it has **no payload
 *   schema in `packages/domain/src/registry.ts`** — the registry carries six `order.*` types and
 *   this is not one — and `01-F4` makes producing an unknown type "a build-time and runtime
 *   error". Adding it is a SACRED-path change (`18 §2`, commandment 10) that must also decide
 *   the shape of `06-F20`'s reason list. **No Reject control is drawn**, because a control that
 *   cannot succeed is worse than an absent one (`ManagerApproval`'s own rule, one surface over).
 * - **`C32` — mark that order ready.** Four independent blockers, any one of which is
 *   sufficient; see `apps/pos-electron/CLAUDE.md`. The one that decides it: nothing in this
 *   product advances a line past `placed`, and `LEGAL_NEXT.placed` is
 *   `["confirmed","voided","cancelled"]` — so a `placed → ready` edge is **illegal** and the
 *   fold records `illegal_transition` and refuses to apply it. `02-F33`'s own fallback is what
 *   ships instead, and it is spec-conformant rather than a gap: *"otherwise the panel is
 *   read-only for states."*
 *
 * **The primary action is reachable on arrival**, which `screen-map §2` makes a hard rule: a
 * tab whose contents need another navigation act to reach a primary action is depth two and is
 * banned. So the inbox is the FIRST thing on the surface, not behind a filter, a segmented
 * control or a second tap — and paging inside either list is lateral (`03-F46`) and free.
 *
 * **Never a popup.** `screen-map §5` lists "a cloud-order popup" under what gets no screen at
 * all — *"interrupts a cart, which `27-F11d` forbids"* — so the arrival signal is a count badge
 * on this tab (`TabRail`'s `badge`, set in `Counter`) and the queue is *reachable*, never modal.
 */

/**
 * `02-F9`'s inbox membership, stated once.
 *
 * The FR names its own sources — *"incoming cloud orders (docs 06/07)"* — which are the
 * storefront and WhatsApp channels of `02-F42`'s closed set. The other three are excluded for
 * reasons the same FR gives: `foodpanda` **bypasses the inbox** (*"accepted upstream,
 * auto-confirmed on ingest per 08-F8"*), and `counter`/`phone` are staff-entered at this till
 * (`C4`, `C18`) where the cashier confirms as part of ringing, not as an inbox act.
 */
const CLOUD_CHANNELS: ReadonlySet<string> = new Set(["storefront", "whatsapp"]);

/**
 * `02-F9` — an order that has arrived and has not been accepted.
 *
 * `confirmed_at === null` is deliberately narrower than falsy: `undefined` means this host did
 * not supply the field at all (see `OpenOrderSchema`), and treating "did not say" as "not
 * confirmed" would put an Accept button on an order the screen knows nothing about — and
 * `02-F9` makes accept idempotent precisely because a second confirm must be harmless, not
 * because a wrong one is.
 */
export const isCloudInbox = (o: OpenOrder): boolean =>
  o.channel !== undefined && CLOUD_CHANNELS.has(o.channel) && o.confirmed_at === null;

/** `01-F33` — settled closes the money side; a settled order is recall-only (`02-F10`). */
const isOpen = (o: OpenOrder): boolean => !isCloudInbox(o) && o.settled !== 1;

const toRow = (o: OpenOrder): OrderRow => ({
  order_id: o.order_id,
  reference: o.reference,
  // `01-F54` — degrade to an honest placeholder rather than blocking. A host that did not
  // supply the channel is a host whose orders still have to be findable (`C31`).
  channel: o.channel ?? "unknown",
  orderType: o.order_type ?? null,
  totalPaisa: paisa(o.total_paisa),
  lineCount: o.lines.length,
  /*
    `03-F25` — the age main computed, carried across unchanged.

    **Nothing is decided here and that is deliberate.** The minutes are branch-consensus arithmetic
    (`01-F43`) and the thresholds are `00 §7` layer-2 policy per order type (`03-F14`/`03-F47`);
    both live on the trusted side, and a renderer that recomputed either would be reading the raw
    device clock (`01-F45`) or re-floor an org running 8/16. This is a RESHAPE, and a reshape
    between two correct halves is where this wave's most expensive defect lived — `sync-client`'s
    `catalog-fetch` `toEntry` dropped `prices` and `station` while the gateway served them and the
    store read them, failing 0 of 579 tests.

    `?? null` because `01-F54` separates "did not say" from "said, and there is no age", and both
    render the same honest way: the order is findable, without a timer. **The inbox carries no age
    as a consequence of the DATA, not of a second code path** — `isCloudInbox` requires
    `confirmed_at === null`, and `03-F14`'s basis is `order.confirmed`, so main hands those rows a
    null and there is no branch here to get wrong.
  */
  age: o.aging ?? null,
});

/**
 * `03-F46` — *"page 1 always holds the oldest"*, so the list is ordered by the confirm anchor.
 *
 * That field is the **delivered** `branch_created_at` of the confirm (`01-F43`), stamped once
 * at the origin's append — never this device's clock and never an envelope-id comparison, which
 * is what would make this the `01-F34` break. It is the same field `kitchenQueue` already ages
 * tickets from, so the counter and the kitchen agree about which order is oldest.
 *
 * Orders with no confirm anchor sort last and keep the seam's own order among themselves. That
 * is a **stated limitation, not a design**: the projection carries no created-at, so an
 * unconfirmed order has no time on this device at all — which is also why `02-F9`'s
 * *"unaccepted past half its confirmation window escalates to S1"* cannot be computed here.
 * Recorded in `apps/pos-electron/CLAUDE.md` as owed.
 */
const byOldestConfirmFirst = (a: OpenOrder, b: OpenOrder): number =>
  (a.confirmed_at ?? Number.POSITIVE_INFINITY) - (b.confirmed_at ?? Number.POSITIVE_INFINITY);

/**
 * **THE TRAY IS `Panel` NOW, and the two things that changed with it are both `27-F7`.**
 *
 * The hand-rolled `TRAY` constant that used to live here was right about its shape and is
 * `packages/ui`'s job — `21-F5` makes an app-local one-off a lint error, and by the time this
 * surface had one, `TenderPanel` had a second and `App.tsx` a third, each with its own padding
 * and caption treatment. What it recorded is worth keeping: this surface reserved a third of its
 * height for the inbox and, with nothing in it, drew **one line of text and then ~480 dp of pure
 * white**. The 1 : 2 reservation is correct and stays — it keeps `Open orders` at the same y
 * whether the inbox holds nothing or six arrivals, which is `27-F4` on a surface whose row COUNT
 * changes all day — and a bounded sunken region is what makes an empty allocation read as *an
 * empty tray* rather than as a broken app (`00 §5.7`, `27-F66`).
 *
 * **Two things `Panel` adds that the tray could not.**
 *
 * 1. **The heading upper-cases without changing its text.** The old comment recorded that it
 *    could not: *"`orders-tab.dom.test.tsx` is an acceptance oracle that finds both lists by
 *    their heading text … Changing five oracle assertions to buy a typographic flourish is not a
 *    trade an implementer gets to make."* `Panel` does the casing in CSS, so `textContent` is
 *    untouched and the oracle keeps matching `New orders`.
 * 2. **`note` says the ORDERING RULE out loud, which is `27-F7` reaching the glass.** That FR —
 *    *"a list's visual order MUST be its work order"* — is satisfied by `03-F46`'s oldest-confirm
 *    -first sort, and an operator had no way to know that: two lists, no stated order, and the
 *    inbox and the open list are sorted by **different rules**. Saying `oldest first` is the
 *    cheapest possible discharge of a law about order.
 */

export type OrdersSurfaceProps = {
  orders: readonly OpenOrder[];
  inboxPage: number;
  onInboxPageChange: (page: number) => void;
  openPage: number;
  onOpenPageChange: (page: number) => void;
  /** `C19` — one tap, `order.confirmed`, idempotent (`02-F9`). */
  onAccept: (orderId: string) => void;
};

export const OrdersSurface = ({
  orders,
  inboxPage,
  onInboxPageChange,
  openPage,
  onOpenPageChange,
  onAccept,
}: OrdersSurfaceProps) => {
  /**
   * `27-F11c` — capacity is a PHYSICAL question, so each list is costed from a MEASURED surface
   * rather than a named panel. Same rule, and the same hook, the item grid uses.
   *
   * **Each list measures ITS OWN box now, and that is a fix rather than a refactor.** This used
   * to measure the whole surface once and hand each list `heightMm / 3` and `× 2 / 3` — an
   * estimate that silently ignored the tray's padding and its heading, so both lists were costed
   * for a box ~10 mm taller than the one they were given. That is the shape of the pager defect
   * this surface already recorded (*"capacity costed against the full height put two rows and a
   * pager into a box that holds two rows, and the surplus went behind `overflow: hidden`"*), and
   * a `Panel`'s caption and padding would have widened the gap. Measuring the box the list
   * actually gets cannot drift, whatever chrome grows around it.
   */
  const [inboxRef, inboxMm] = usePhysicalSize();
  const [openRef, openMm] = usePhysicalSize();
  const inbox = orders.filter(isCloudInbox);
  const open = [...orders.filter(isOpen)].sort(byOldestConfirmFirst);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
        height: "100%",
        minHeight: 0,
      }}
    >
      {/*
        THE INBOX IS FIRST, and that position is load-bearing rather than aesthetic.
        `screen-map §2` bans a tab whose contents need another navigation act to reach a
        primary action, and `02-F9`'s accept is this surface's primary action — so it is
        above the fold on arrival, with no filter to change and no segment to select.

        **The note is a COUNT, and it is deliberately not an ordering rule.** `27-F7` wants a
        list's visual order to be its work order, and the inbox's work order is arrival order —
        which **this device cannot know**. The `open_orders` projection carries only
        `confirmed_at`, and every row in this list is by definition unconfirmed, so the inbox
        renders in the seam's own array order and nothing on the glass may claim otherwise.
        Saying `oldest first` here would be the placeholder-that-looks-like-data commandment 2
        forbids. **Owed at the fold, not here** — the same missing field that makes `02-F9`'s
        *"unaccepted past half its confirmation window escalates to S1"* uncomputable on this
        device, recorded in `apps/pos-electron/CLAUDE.md`.
      */}
      <Panel
        title="New orders"
        elevation="sunken"
        grow={1}
        {...(inbox.length === 0 ? {} : { note: `${inbox.length} waiting` })}
      >
        <div ref={inboxRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/*
            Nothing is drawn until the first measurement, for the reason `Counter` records at
            the item grid: a default is a guessed panel by another name, and a list costed for
            the wrong surface puts rows off-page where no pager can reach them.
          */}
          {inboxMm === null ? null : (
            <OrderList
              orders={inbox.map(toRow)}
              // The inbox gets a third of the surface and the open list the rest: `02-F9` puts
              // this at 10–20 arrivals a shift against `02-F10`'s continuous recall, and
              // `27-F2` forbids reaching either by scrolling — so both are paged inside their
              // own measured box rather than sharing one that overflows.
              heightMm={inboxMm.heightMm}
              page={inboxPage}
              onPageChange={onInboxPageChange}
              action={{ label: "Accept", onAct: onAccept }}
              /*
                `00 §5.7` — the honest resting state, and it says WHY it is empty rather than
                just that it is. Nothing publishes cloud orders yet (docs 06/07 are unbuilt), so
                on a launched device this is what the surface always says, and it should read as
                "none have arrived" and never as "this screen is broken".
              */
              empty="No new orders from the website or WhatsApp."
            />
          )}
        </div>
      </Panel>
      {/*
        `27-F7` ON THE LIST THAT CAN ANSWER IT. `03-F46` fixes the order — *"page 1 always holds
        the oldest"* — and `byOldestConfirmFirst` implements it against the confirm anchor. The
        note is that rule, said on the glass.

        ⚠ **AND THE CONDITION ON IT IS A DEFECT THIS NOTE CAUGHT ON ITS FIRST RENDER.** The first
        draft showed `oldest first` whenever the list held more than one row, and the layout
        gate's own fixture immediately drew it over `A-015` above `A-014` — because
        `byOldestConfirmFirst` sends a row with **no** confirm anchor to the end (`01-F54`: a host
        that did not supply the field is not a host that said null), so a list containing one is
        only partly ordered. A caption asserting a rule the rows do not follow is worse than no
        caption: `27-F7` calls a list whose visual order is not its work order a defect, and this
        would have made the screen *claim* to be the thing the FR asks for.
        So the rule is stated only when **every** row on the list actually carries the key it is
        sorted by, and a mixed list says nothing rather than something false (`00 §5.7`).
      */}
      <Panel
        title="Open orders"
        elevation="sunken"
        grow={2}
        {...(open.length > 1 &&
        open.every((o) => o.confirmed_at !== null && o.confirmed_at !== undefined)
          ? { note: "oldest first" }
          : {})}
      >
        <div ref={openRef} style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/*
            `02-F10` recall, and `02-F33`'s read-only posture: NO `action` is passed. That is
            the whole of the ready-marking decision expressed in one absent prop — see this
            file's header for why `C32` cannot be drawn, and note that a greyed Ready control
            would still be claiming the act exists, which is the opposite of read-only.
          */}
          {openMm === null ? null : (
            <OrderList
              orders={open.map(toRow)}
              heightMm={openMm.heightMm}
              page={openPage}
              onPageChange={onOpenPageChange}
              empty="No open orders. Start one on the Order tab."
            />
          )}
        </div>
      </Panel>
    </div>
  );
};
