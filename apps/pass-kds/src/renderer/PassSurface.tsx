import {
  space,
  TicketCard,
  Tile,
  targetFor,
  typography,
  useColor,
  usePhysicalSize,
} from "@restos/ui";
import { useEffect, useState } from "react";
import type { PassTicketWire } from "../shared/ipc";
import { ticketColumns, ticketsPerPage } from "../shared/ticket-capacity";

/**
 * # THE PASS QUEUE — `03-F13`, `03-F14`, `03-F15`, `03-F16`, `03-F23`, `03-F46`
 *
 * **One surface, no tab rail** (`screen-map §3.2`: *"it has **one surface**, not a tab rail. A
 * cook glancing for one second cannot navigate."*). That is also 85 dp — 13.5 mm — of vertical
 * chrome this screen does not spend, which on a panel whose capacity is measured in tickets is
 * worth about a seventh of a ticket on `27 §1a`'s smallest glass.
 *
 * ## What is deliberately absent, and it is the corpus's strongest anti-scope statement
 *
 * > 03-F23 Sequencing is **visibility only**. The system never dictates cook order: no
 * > auto-prioritization, no reordering of the queue, no "cook this next" prompts — at any tier,
 * > ever. Chronological order + aging color is the entire sequencing UI; the chef decides.
 *
 * So: no priority marker, no sort control, no filter, no "urgent" section, no badge on the
 * reddest ticket. Also absent by their own FRs: **prices** (`03-F32` — the kitchen data model has
 * no money field at all) and **ETAs** (`03 §3` forbids the kitchen displaying one). A reviewer
 * should read any addition to this file against that paragraph first.
 *
 * ## `03-F46` — IT PAGES AND IT NEVER SCROLLS
 *
 * > **The queue pages; it never scrolls — and the oldest ticket is always on page 1.** … page 1
 * > always holds the oldest tickets, bumping one pulls the next up, so **the work is always on
 * > the first page and reaching it is never a navigation act.** Later pages exist for situational
 * > awareness only — how much is queued — never to reach work.
 *
 * Two consequences are load-bearing and are enforced here rather than trusted:
 *
 *  1. **Capacity is measured, never fixed.** `usePhysicalSize` gives the box in millimetres and
 *     `ticketsPerPage` costs a ticket at `27-F28`'s own arithmetic. A hardcoded 3 would be
 *     `27-F2`'s named category error (*"transplanting '6' to a 22-inch counter screen"*), and on
 *     a 10" tablet it would put two tickets off the page.
 *  2. **The pager is subtracted from its own box.** `apps/pos-electron` shipped this defect twice
 *     — in `OrderList` and again in `ItemGrid` — where a page was costed at full height and then
 *     drawn with a pager under it, clipping the last row. On a counter that is an order that
 *     cannot be accepted; here it is a ticket nobody cooks. The re-cost below is that fix applied
 *     before the defect rather than after it.
 */

/** Layout-only. `03-F46` — later pages are for awareness, so the control is small and at the end. */
const PAGER_MM = 12;

export type PassSurfaceProps = {
  tickets: readonly PassTicketWire[];
  /** `03-F24` — `null` where this surface does not own the ready signal (read-only for states). */
  onBump: ((order_id: string) => void) | null;
  /** `03-F52` — `null` where this surface does not own the serve signal (read-only for `served`). */
  onHandOver: ((order_id: string) => void) | null;
  /** The owner the layer-2 assignment names, so a read-only screen can say WHY. */
  readySignalOwner: string;
};

export const PassSurface = ({
  tickets,
  onBump,
  onHandOver,
  readySignalOwner,
}: PassSurfaceProps) => {
  const color = useColor();
  const [box, size] = usePhysicalSize();
  const [page, setPage] = useState(0);
  const label = typography["text-label"];
  /**
   * `03-F52` — the order the operator has pressed HAND OVER on, and has not yet answered for.
   *
   * > The handover press carries a confirm naming the order reference; the ready-mark does not.
   * > … at counter service the pass person calls the number aloud, so reading the reference off
   * > the confirm IS the call. **Naming the reference is required** — a bare *"Are you sure?"* is
   * > the tap people learn to dismiss.
   *
   * It holds the whole TICKET rather than an id, because the confirm has to name the reference and
   * a ticket that leaves the queue while the confirm is up must take its own confirm with it (see
   * the `confirming` resolution below).
   */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirming = tickets.find((t) => t.order_id === confirmingId) ?? null;

  // `27-F11c` — capacity is a physical question and `size` is `null` until the box is measured.
  // `27-F2` — page capacity comes from the surface's usable AREA, so both axes are read. One
  // ticket is the floor, so there is never a page with nothing on it.
  const heightMm = size?.heightMm ?? 0;
  const widthMm = size?.widthMm ?? 0;
  const columns = ticketColumns(widthMm);
  const naive = ticketsPerPage(heightMm, widthMm);
  const overflows = tickets.length > naive;
  // The pager only costs height when it is DRAWN, which is the half `OrderList` got wrong first.
  const perPage = overflows ? ticketsPerPage(Math.max(0, heightMm - PAGER_MM), widthMm) : naive;
  const pages = Math.max(1, Math.ceil(tickets.length / perPage));
  // `03-F46` — bumping a ticket pulls the next one up, so the page index can outrun the queue.
  // Clamping rather than resetting keeps an operator on page 2 while page 2 still exists.
  const current = Math.min(page, pages - 1);
  const shown = tickets.slice(current * perPage, current * perPage + perPage);

  // `03-F46` — the work is always on page 1, so a queue that shrinks past the current page must
  // return there rather than show an empty box. Not a scroll and not a jump between renders: it
  // only fires when the page the operator is on has stopped existing.
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  return (
    <div
      ref={box}
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
      }}
    >
      {/*
        `27-F7` — **a list's visual order MUST be its work order**, said out loud.

        `apps/pos-electron`'s Orders tab recorded the lesson this follows: it drew `oldest first`
        over a list whose second row had no confirm anchor and therefore was not, and *"a caption
        asserting a rule the rows do not follow is worse than no caption"*. Every row here carries
        `confirm_at` — the key `pass-queue.ts` sorts by, required on the wire schema — so the claim
        is one the rows can be checked against, and `pass-surface.dom.test.tsx` checks it.
      */}
      {tickets.length > 1 ? (
        <div
          style={{
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            color: color["fgColor-muted"],
            letterSpacing: "0.06em",
          }}
        >
          OLDEST FIRST · {tickets.length} OPEN
          {onBump === null
            ? ` · READY-MARKING IS ${readySignalOwner.toUpperCase()}'S (03-F24)`
            : ""}
        </div>
      ) : null}

      {/*
        `27-F2`'s flat paged GRID, filled ROW-MAJOR — and the fill order is `27-F7` rather than a
        CSS choice. `03-F13` is strictly chronological and `27-F7` makes the visual order the work
        order, so the oldest ticket must be where a reader starts: top-left, then across, then
        down. A column-major flow (`grid-auto-flow: column`) would put the second-oldest ticket
        BELOW the oldest and the fourth at the top of the next column, which is a different work
        order wearing the same rows.

        `gridTemplateRows` is explicit rather than `auto`, so every card gets an equal share of
        the height the capacity math costed it at — otherwise a one-line ticket and a four-line
        ticket in the same row would leave the page short of the rows it promised.
      */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: "minmax(0, 1fr)",
          gridAutoFlow: "row",
          gap: space["space-3"],
          alignContent: "start",
          // `03-F52`'s confirm is positioned against this box and not the viewport, so it covers
          // the tickets and leaves the pager reachable. See `HandOverConfirm` below.
          position: "relative",
        }}
      >
        {shown.length === 0 ? (
          // `00 §5.7` — a kitchen with nothing to cook says so. An empty box would be
          // indistinguishable from a screen that has stopped receiving, which on this surface is
          // the difference between a quiet Tuesday and a broken uplink.
          <p style={{ fontFamily: label.fontFamily, color: color["fgColor-muted"] }}>
            Nothing to cook. Confirmed orders appear here oldest first.
          </p>
        ) : (
          shown.map((t) => (
            <TicketCard
              key={t.order_id}
              reference={t.reference}
              minutes={t.minutes}
              amberAt={t.amberAt}
              redAt={t.redAt}
              channel={t.channel}
              tables={t.tables}
              assembly={{ done: t.linesDone, total: t.linesTotal }}
              lines={t.lines.map((l) => ({ id: l.line_id, quantity: l.quantity, name: l.name }))}
              // `03-F24` — no control at all where this surface does not own the signal, and none
              // on a ticket with nothing left to advance. `27-F5`: an inert primary target is a
              // context-dependent control wearing a different name.
              //
              // Every control on every card is retired while a confirm is up: the confirm covers
              // this box, and a control under a cover is one `layout:check` reports COVERED and a
              // wet hand cannot reach anyway.
              onBump={
                onBump === null || !t.bumpable || confirming !== null
                  ? null
                  : () => onBump(t.order_id)
              }
              // `03-F52` — the same two axes, and `handoverable` is decided in MAIN by the very
              // function that will build the edges (`serveEdgesFor`), so the control the cook sees
              // and the act main performs cannot disagree.
              onHandOver={
                onHandOver === null || !t.handoverable || confirming !== null
                  ? null
                  : () => setConfirmingId(t.order_id)
              }
            />
          ))
        )}
        {confirming === null || onHandOver === null ? null : (
          <HandOverConfirm
            ticket={confirming}
            onConfirm={() => {
              setConfirmingId(null);
              onHandOver(confirming.order_id);
            }}
            onCancel={() => setConfirmingId(null)}
          />
        )}
      </div>

      {/*
        `27-F3` — back and forward are ADJACENT and differ only by arrow direction. In the study
        where back was understood, it was understood *because* it sat beside the forward control
        already in use.
      */}
      {pages > 1 ? (
        <div style={{ display: "flex", alignItems: "center", gap: space["space-3"] }}>
          {/* `27-F4` — a conditional control is DISABLED IN PLACE, never absent. `Tile` carries
              that law itself (`unavailable`), which is why the pager is two tiles and not two
              hand-rolled buttons: the positional memory of "back is on the left" survives page 1. */}
          <Tile
            posture="kitchen"
            label="◀"
            onPress={() => setPage(Math.max(0, current - 1))}
            unavailable={current === 0}
            unavailableReason="this is the oldest page"
          />
          <Tile
            posture="kitchen"
            label="▶"
            onPress={() => setPage(Math.min(pages - 1, current + 1))}
            unavailable={current === pages - 1}
            unavailableReason="nothing queued behind this"
          />
          <span
            style={{
              fontFamily: label.fontFamily,
              fontSize: label.fontSize,
              color: color["fgColor-muted"],
            }}
          >
            {/* `03-F46` — later pages are situational awareness. The number says how much is
                queued behind the work, and page 1 always holds the work. */}
            PAGE {current + 1} OF {pages}
          </span>
        </div>
      ) : null}
    </div>
  );
};

/**
 * # `03-F52` — THE CONFIRM, AND WHY IT IS NOT FRICTION
 *
 * > **The handover press carries a confirm naming the order reference; the ready-mark does not.**
 * > This is the one control in the kitchen whose mis-tap cannot be taken back — `served` is
 * > terminal, and `03-F17`'s recall strip restores VISIBILITY, never STATE. The confirm is not
 * > friction bolted on for safety: at counter service the pass person calls the number aloud, so
 * > **reading the reference off the confirm IS the call**. **Naming the reference is required** —
 * > a bare *"Are you sure?"* is the tap people learn to dismiss.
 *
 * Three properties, each of which is a decision:
 *
 *  - **The reference is the payload and the largest thing here** (`27-F25` — numbers are the
 *    operational payload and the largest element in their region). It is what the pass person
 *    reads aloud, so it is set at the same hero step `TicketCard` gives it, not at label size
 *    inside a sentence.
 *  - **Exactly one control commits and one backs out.** `01-F17`'s spirit and `27-F5`: `served`
 *    cannot be walked back, so a confirm a wet hand cannot escape is a worse control than no
 *    confirm at all — on the surface where `27-F9`'s 21.34% wet-hand error was measured. They are
 *    at opposite ends of the row for `27-F9`'s reason, exactly as DONE and HAND OVER are on the
 *    card.
 *  - **It covers the tickets and not the pager.** It is positioned against the grid box, so the
 *    cards' own controls (which are retired while it is up) cannot be reached under it and
 *    `03-F46`'s paging is untouched. `00 §5.7` — the queue behind stays visible, so the cook can
 *    still see how much work is waiting while answering.
 */
const HandOverConfirm = ({
  ticket,
  onConfirm,
  onCancel,
}: {
  ticket: PassTicketWire;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  const color = useColor();
  const hero = typography["text-numeric-hero"];
  const body = typography["text-body"];
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: space["space-3"],
        padding: space["space-4"],
        // Opaque: a translucent cover would leave the ticket grid legible under the one number
        // the pass person is about to read aloud, which is how the wrong number gets called.
        background: color["bgColor-surface"],
      }}
    >
      <span
        style={{
          fontFamily: hero.fontFamily,
          fontSize: hero.fontSize,
          fontWeight: hero.fontWeight,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        HAND OVER {ticket.reference}
      </span>
      <span
        style={{
          fontFamily: body.fontFamily,
          fontSize: body.fontSize,
          color: color["fgColor-muted"],
          textAlign: "center",
        }}
      >
        Call {ticket.reference} and give the food to the customer. This cannot be undone.
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          /*
            **One whole target of clear space, and the rule was found by looking.**

            `space-between` was the first attempt and the screenshot rejected it: on the 32" TV it
            put NOT YET and HANDED TO at the extreme edges of 700 mm of glass, a control a cook
            walks to. `27-F9` wants the destructive target away from the safe one; the panel's
            width is not the unit of that. 96 dp is `27-F8`'s kitchen target — the size the FR
            says a wet finger needs — so one target of clear space is the corpus's own unit for
            *"not adjacent"*, and it is the same gap `TicketCard` puts between DONE and HAND OVER.
          */
          gap: targetFor("kitchen"),
        }}
      >
        {/* `27-F4` — the terminal act is on the RIGHT, where HAND OVER sits on the card, and the
            way out is on the LEFT, where DONE sits. One habit for the whole surface: the thing
            you cannot take back is always the right-hand target. */}
        <Tile posture="kitchen" label="NOT YET" onPress={onCancel} />
        <Tile posture="kitchen" label={`HANDED TO ${ticket.reference}`} onPress={onConfirm} />
      </div>
    </div>
  );
};
