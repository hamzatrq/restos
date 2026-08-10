import { PanelRoot, StatusStrip, space, useColor, WorkSurface } from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import type { PassStateWire, PassTicketWire } from "../shared/ipc";
import { bridge } from "./bridge";
import { PassSurface } from "./PassSurface";

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

  const reload = useCallback(async () => {
    const [s, q] = await Promise.all([bridge().passState(), bridge().queue()]);
    setState(s);
    setTickets(q);
  }, []);

  useEffect(() => {
    void reload();
    return bridge().onChanged(() => void reload());
  }, [reload]);

  const bump = useCallback(
    (order_id: string) => {
      // `03-F16` — one tap, whole order (`line_ids: null`). `03-F24`: *"an owner's 'order ready'
      // mark simply marks all remaining lines at once"*, so this is not a second act — it is the
      // same act with a wider selection, and MAIN decides which lines are legally eligible.
      //
      // `01-F17`'s spirit: the result is not awaited into a modal and a refusal does not block
      // anything. `changed` brings the truth back, and a bump that moved nothing leaves the ticket
      // exactly where it was, which is the honest outcome and the visible one.
      void bridge()
        .markReady({ order_id, line_ids: null })
        .then(() => reload());
    },
    [reload],
  );

  // The first frame before the bridge answers. `usePhysicalSize`'s own note applies: rendering
  // nothing until measured would blank the surface, but rendering a SHELL with no density would
  // draw every target at the wrong physical size for a frame — so the shell waits for the one
  // fact it cannot guess (`27-F68`) and nothing else.
  if (state === null) return null;

  return (
    <PanelRoot panelPpi={state.panelPpi}>
      <Shell state={state} tickets={tickets} onBump={bump} />
    </PanelRoot>
  );
};

const Shell = ({
  state,
  tickets,
  onBump,
}: {
  state: PassStateWire;
  tickets: readonly PassTicketWire[];
  onBump: (order_id: string) => void;
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
        actor={state.actor}
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
          <PassSurface
            tickets={tickets}
            onBump={state.maySignal ? onBump : null}
            readySignalOwner={state.readySignalOwner}
          />
        </WorkSurface>
      </main>
    </div>
  );
};
