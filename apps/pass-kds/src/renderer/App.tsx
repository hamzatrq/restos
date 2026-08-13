import { PanelRoot, StatusStrip, space, useColor, WorkSurface } from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import type { PassRosterMemberWire, PassStateWire, PassTicketWire } from "../shared/ipc";
import { bridge } from "./bridge";
import { PassSurface } from "./PassSurface";
import { UnlockDoor, type UnlockDoorProps } from "./UnlockDoor";

/**
 * # THE PASS SHELL — and it is deliberately NOT `AppShell`
 *
 * `screen-map §3.2`: *"Where the screen exists, it is a 22″ panel (`27-F11f`) and it has **one
 * surface**, not a tab rail. A cook glancing for one second cannot navigate."*
 *
 * `AppShell` composes a status strip, a **tab rail** and the work surface, and a rail with one tab
 * on it is 85 dp — 13.5 mm — of vertical chrome buying nothing. On a surface whose entire capacity
 * is measured in tickets (`27-F28`), that is real: it is a seventh of a ticket on `27 §1a`'s
 * smallest glass. So this composes `StatusStrip` + `WorkSurface` directly, which is the same thing
 * `apps/pos-electron`'s `02-F18` lock surface does and the reason `WorkSurface` is exported at all.
 *
 * **Nothing about the closed vocabulary is weakened by that** (commandment 6): every component
 * here is `packages/ui`'s, and the two plain `div`s below are a flex column and a padding box —
 * arrangement, not vocabulary. What is NOT done is inventing a second shell component.
 *
 * ## `PanelRoot` at the ROOT, and it is the whole of `27-F68` on this app
 *
 * Everything inside is laid out in dp and the conversion happens once. `apps/pos-electron`'s
 * mutation matrix measured both ways this can silently break — `PanelRoot` applying no zoom (M1)
 * and the app forgetting to wrap its tree (M2) — and both leave every renderer suite green,
 * because happy-dom performs no layout. `layout:check` is what sees them.
 *
 * ## THE READ PATH IS PULL PLUS A DATA-FREE PUSH (commandment 5)
 *
 * `sync-client` reads and writes only; there is no tRPC and no `fetch` anywhere in this renderer.
 * Main sends `changed` with no payload and the renderer re-reads — the same shape the counter
 * uses, and the reason is `01-F17`: a push carrying data is a push that can be stale, and a
 * kitchen screen showing a ticket that has been bumped is worse than one that re-reads.
 *
 * **On this surface the tick is also the age clock.** `03-F14`'s colours move with the minutes
 * even when no event arrives, so `main/uplink.ts` fires `changed` every second whether or not the
 * folds moved. Without that a ticket would sit at `9 min` until the next order was confirmed —
 * the aging timer stopping exactly when the kitchen is quiet enough for it to matter.
 */
export const App = () => {
  const [state, setState] = useState<PassStateWire | null>(null);
  const [tickets, setTickets] = useState<readonly PassTicketWire[]>([]);
  /**
   * `01-F61`'s roster, read ONCE and deliberately not on the `changed` push below: main fires that
   * every second so `03-F14`'s colours move, and reference data that changes when somebody is
   * hired (`01-F21`) has no business on the hottest read on the device.
   */
  const [roster, setRoster] = useState<readonly PassRosterMemberWire[]>([]);
  /**
   * `03-F53` — is the door up? **Raised by an ACT and never by the state of the session**, which is
   * the whole difference between this surface and `02-F18`'s lock screen: a pass whose roster has
   * not synced must still show the kitchen its work, so nothing here keys off `state.user` to
   * decide what to draw.
   */
  const [door, setDoor] = useState(false);

  const reload = useCallback(async () => {
    const [s, q] = await Promise.all([bridge().passState(), bridge().queue()]);
    setState(s);
    setTickets(q);
    // A session that is IN closes the door: an unlock that succeeded has nothing left to ask for,
    // and a lock decided later in main (idle auto-lock) leaves the door exactly as the cook left
    // it — down — rather than raising one nobody pressed for.
    if (s.user !== null) setDoor(false);
  }, []);

  useEffect(() => {
    void reload();
    return bridge().onChanged(() => void reload());
  }, [reload]);

  useEffect(() => {
    void bridge().roster().then(setRoster);
  }, []);

  /**
   * `03-F53` — *"A press with nobody signed in raises `01-F61`'s two steps."*
   *
   * **This is a DISPLAY decision, not the gate**, and the difference is the whole of `02-F45`'s
   * lesson. The gate is in `ready-mark.ts` and `serve-mark.ts`, in MAIN, where one read of the
   * session decides both whether the act happens and whose name is on it; nothing here can let an
   * edge through, and a renderer that forged either call would still be refused. What this decides
   * is only WHICH SURFACE to draw — the same kind of decision `maySignal` and `mayHandOver` already
   * are, and main is the source of it (`state.user`), not this component.
   *
   * The door goes up **at the press** rather than after a round trip. A cook with wet hands
   * pressing DONE must see the grid immediately; an IPC round trip first would put a blank beat
   * between the tap and the response on the one surface `27-F9`'s 21.34% wet-hand error was
   * measured on. It also means nothing is sent to main that main can only refuse.
   */
  const raiseDoor = useCallback((): boolean => {
    if (state?.user != null) return false;
    setDoor(true);
    return true;
  }, [state]);

  const bump = useCallback(
    (order_id: string) => {
      if (raiseDoor()) return;
      // `03-F16` — one tap, whole order (`line_ids: null`). `03-F24`: *"an owner's 'order ready'
      // mark simply marks all remaining lines at once"*, so this is not a second act — it is the
      // same act with a wider selection, and MAIN decides which lines are legally eligible.
      //
      // `01-F17`'s spirit: the result is not awaited into a modal and a refusal does not block
      // anything. `changed` brings the truth back, and a bump that moved nothing leaves the ticket
      // exactly where it was, which is the honest outcome and the visible one.
      void bridge()
        .markReady({ order_id, line_ids: null })
        .then((r) => {
          // The authoritative answer, and it is what closes the window this renderer's own copy of
          // `user` leaves open: main's session can have expired since the last read, in which case
          // the emitter appended nothing and the door goes up a beat later instead.
          if (!r.ok && r.reason === "no_session") setDoor(true);
          return reload();
        });
    },
    [raiseDoor, reload],
  );

  const handOver = useCallback(
    (order_id: string) => {
      // `03-F53` — the confirm has already been answered, so the plate is on the counter and the
      // number has been called (`03-F52`: reading the reference off the confirm IS the call). What
      // waits is the RECORD, which is the FR's own disposition: *"A cook who cannot sign in still
      // puts the plate on the counter … What waits is the RECORD."*
      if (raiseDoor()) return;
      // `03-F52` — the SECOND act, and a separate call rather than a flag on `markReady`, because
      // the separation is the FR: *"One press of DONE emits `ready` and only `ready`."*
      //
      // MAIN still decides everything that matters — whether this surface owns the assignment,
      // whether the order type is one `01 §4` sends to `served`, and which lines are `ready` — so
      // a renderer that forged this call gains nothing it could not reach by pressing the button.
      void bridge()
        .handOver({ order_id })
        .then((r) => {
          // `03-F53`, and it bites hardest here: `served` is terminal, so an unattributable
          // handover is a permanent claim `01-F1` cannot correct. Nothing was written.
          if (!r.ok && r.reason === "no_session") setDoor(true);
          return reload();
        });
    },
    [raiseDoor, reload],
  );

  // The first frame before the bridge answers. `usePhysicalSize`'s own note applies: rendering
  // nothing until measured would blank the surface, but rendering a SHELL with no density would
  // draw every target at the wrong physical size for a frame — so the shell waits for the one
  // fact it cannot guess (`27-F68`) and nothing else.
  if (state === null) return null;

  return (
    <PanelRoot panelPpi={state.panelPpi}>
      <Shell
        state={state}
        tickets={tickets}
        onBump={bump}
        onHandOver={handOver}
        door={door}
        roster={roster}
        onUnlock={(user_id, pin) => bridge().unlock(user_id, pin)}
        onDismiss={() => setDoor(false)}
      />
    </PanelRoot>
  );
};

const Shell = ({
  state,
  tickets,
  onBump,
  onHandOver,
  door,
  roster,
  onUnlock,
  onDismiss,
}: {
  state: PassStateWire;
  tickets: readonly PassTicketWire[];
  onBump: (order_id: string) => void;
  onHandOver: (order_id: string) => void;
  door: boolean;
  roster: readonly PassRosterMemberWire[];
  onUnlock: UnlockDoorProps["onUnlock"];
  onDismiss: () => void;
}) => {
  const color = useColor();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: color["bgColor-surface"],
      }}
    >
      <StatusStrip
        /*
          `02-F19` / `01-F27` — TWO identity axes and never one standing in for the other. The
          device says what it is; `state.user` says who is acting, and `02-F41` makes that the name
          the ledger will carry. A strip that went on saying "nobody signed in" while every edge was
          attributed to Sajid would be `02-F45`'s two-sources-for-one-fact on the glass.
        */
        actor={state.user?.display_name ?? state.actor}
        deviceLabel={state.deviceLabel}
        lan={state.lan}
        hub={state.hub}
        cloud={state.cloud}
        businessDay={state.businessDay}
        panelFit={state.panelFit}
        /*
          `03-F5`'s S1 band belongs to the device that OWNS THE PRINTER, and that is the counter.
          `screen-map §4`: *"the failure lands where the human is … the signal goes where the
          RESPONDER is, never where the fault is"*, and `27-F11g` says the same — in a printer-only
          kitchen nobody in the kitchen has a screen to be told on, and the cashier is the person
          who can act. So this screen raises no print alarms, and the empty array is the claim
          rather than a placeholder: `03-F5` is untouched and lives one app over.
        */
        alarms={[]}
        onAcknowledgeAlarm={() => {}}
      />
      <main
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          padding: space["space-4"],
          overflow: "hidden",
        }}
      >
        <WorkSurface>
          {door ? (
            /*
              `03-F53` — the door REPLACES the work surface while it is up rather than covering it.
              A cover would leave every ticket control under it, which `layout:check` reports as
              COVERED and a wet hand meets as a dead target (`HandOverConfirm` solves the same
              problem one level down by retiring the card controls). It is raised only by a press
              that main refused for want of a session, and `Cancel` puts it away with the queue
              exactly as it was — so the queue is never GATED, which is the ruling's second clause.
            */
            <UnlockDoor roster={roster} onUnlock={onUnlock} onDismiss={onDismiss} />
          ) : (
            <PassSurface
              tickets={tickets}
              onBump={state.maySignal ? onBump : null}
              // `03-F52` — the assignment is main's decision and the screen is TOLD. A renderer
              // that computed this would be a client role claim (commandment 8), and `27-F5` is
              // why it is `null` and not a disabled control: a surface without the assignment
              // renders no handover at all, exactly as `03-F24` already has it render no bump.
              //
              // ⚠ **`state.user` is deliberately NOT a term here.** `03-F53`: the control is what
              // RAISES the door, so retiring it while nobody is signed in would leave a cook with
              // a queue she cannot act on and no route to identify — a feature that ships green
              // and cannot be used.
              onHandOver={state.mayHandOver ? onHandOver : null}
              readySignalOwner={state.readySignalOwner}
            />
          )}
        </WorkSurface>
      </main>
    </div>
  );
};
