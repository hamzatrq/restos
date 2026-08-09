import { paisa } from "@restos/domain";
import { OrderList, type OrderRow, space, typography, useColor, usePhysicalSize } from "@restos/ui";
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
 * A section caption, in the treatment `Readout` gives every caption in this product: small,
 * upper-case at the call site, wide-tracked, muted. `27-F25` puts the payload at the top of the
 * ladder and a section name is scaffolding — it was `fgColor-default` at the same weight as the
 * order references beneath it, which is two headlines and no hierarchy.
 */
const HEADING: React.CSSProperties = {
  fontFamily: typography["text-label"].fontFamily,
  fontSize: typography["text-label"].fontSize,
  fontWeight: 600,
  letterSpacing: "0.12em",
  margin: 0,
};

/**
 * **A TRAY — a bounded, sunken region each list lives in, and it is the answer to a real defect
 * rather than decoration.**
 *
 * Measured by the layout gate's composition check on all five panels: this surface reserved a
 * third of its height for the inbox and, with nothing in the inbox, drew **one line of text and
 * then ~480 dp of pure white** before the next heading. Two bare headings floating over a page
 * with one card between them. It FITS and every control is reachable, which is why nothing had
 * ever reported it.
 *
 * The reservation itself is correct and stays: a fixed 1 : 2 split keeps `OPEN ORDERS` at the
 * same y whether the inbox holds nothing or six arrivals, which is `27-F4` positional memory on a
 * surface whose row COUNT changes all day. What was wrong is that an empty allocation was
 * indistinguishable from an empty screen.
 *
 * A bounded sunken region fixes both at once — it is `27-F66`'s idiom (a boundary carries the
 * region, the ~1.1:1 fill step is a legitimate depth cue that is not load-bearing) and it spends
 * **no `27-F14` colour at all**. An empty tray reads as *an empty tray*; a blank rectangle reads
 * as a broken app, and `00 §5.7` cares about the difference.
 *
 * The headings drop to `fgColor-muted` and take the caption treatment the rest of this product
 * uses (`Readout`): a section name is scaffolding, and the payload is the orders.
 */
const TRAY: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space["space-2"],
  minHeight: 0,
  padding: space["space-3"],
  borderRadius: space["space-2"],
};

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
  const color = useColor();
  // `27-F11c` — capacity is a PHYSICAL question, so both lists are costed from a MEASURED
  // surface rather than a named panel. Same rule, and the same hook, the item grid uses.
  const [surfaceRef, sizeMm] = usePhysicalSize();
  const inbox = orders.filter(isCloudInbox);
  const open = [...orders.filter(isOpen)].sort(byOldestConfirmFirst);

  return (
    <div
      ref={surfaceRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
        height: "100%",
        minHeight: 0,
      }}
    >
      {/*
        Nothing is drawn until the first measurement, for the reason `Counter` records at the
        item grid: a default is a guessed panel by another name, and a list costed for the wrong
        surface puts rows off-page where no pager can reach them.
      */}
      {sizeMm === null ? null : (
        <>
          {/*
            THE INBOX IS FIRST, and that position is load-bearing rather than aesthetic.
            `screen-map §2` bans a tab whose contents need another navigation act to reach a
            primary action, and `02-F9`'s accept is this surface's primary action — so it is
            above the fold on arrival, with no filter to change and no segment to select.
          */}
          <div style={{ ...TRAY, flex: 1, background: color["bgColor-surface-sunken"] }}>
            <h2 style={{ ...HEADING, color: color["fgColor-muted"] }}>NEW ORDERS</h2>
            <OrderList
              orders={inbox.map(toRow)}
              // The inbox gets a third of the surface and the open list the rest: `02-F9` puts
              // this at 10–20 arrivals a shift against `02-F10`'s continuous recall, and
              // `27-F2` forbids reaching either by scrolling — so both are paged inside their
              // own measured box rather than sharing one that overflows.
              heightMm={sizeMm.heightMm / 3}
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
          </div>
          <div style={{ ...TRAY, flex: 2, background: color["bgColor-surface-sunken"] }}>
            <h2 style={{ ...HEADING, color: color["fgColor-muted"] }}>OPEN ORDERS</h2>
            {/*
              `02-F10` recall, and `02-F33`'s read-only posture: NO `action` is passed. That is
              the whole of the ready-marking decision expressed in one absent prop — see this
              file's header for why `C32` cannot be drawn, and note that a greyed Ready control
              would still be claiming the act exists, which is the opposite of read-only.
            */}
            <OrderList
              orders={open.map(toRow)}
              heightMm={(sizeMm.heightMm * 2) / 3}
              page={openPage}
              onPageChange={onOpenPageChange}
              empty="No open orders. Start one on the Order tab."
            />
          </div>
        </>
      )}
    </div>
  );
};
