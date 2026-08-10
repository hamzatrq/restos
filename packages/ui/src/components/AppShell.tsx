import type { ReactNode } from "react";
import { WorkSurface } from "../surface-mode";
import { inverse, ThemeProvider, useColor, usePolarity } from "../theme";
import { space } from "../tokens/index";
import type { Alarm } from "./AlarmBand";
import type { CatalogRefusal } from "./CatalogHealth";
import type { Fact } from "./ConnectionFacts";
import type { PanelNotice } from "./PanelHealth";
import { StatusStrip } from "./StatusStrip";
import { type Tab, TabRail } from "./TabRail";

/**
 * The shell, and the whole of it: **a status strip, a fixed tab rail, and the work surface.**
 * Nothing else is chrome (screen-map §1).
 *
 * `27-F1` caps layout depth at ONE, which as a shell means every operational app is a fixed
 * set of peer surfaces reachable in one act from chrome that never moves. The three
 * consequences are all enforced by what this component *cannot* express:
 *
 * - There is **no breadcrumb**, because there is nowhere to be lost.
 * - There is **no back affordance**, because nothing is behind anything.
 * - There is **no overflow menu**, because an operator who cannot read cannot discover one.
 *
 * `training` is `27-F63`, and it is deliberately the most expensive chrome in the system: a
 * persistent band plus a visibly different surface on every screen. The failure it prevents
 * is a member of staff forgetting which mode they are in — either rehearsing an order that
 * never gets cooked, or treating a real one as practice. Both are worse than having no
 * training mode. It is achromatic, because `27-F14`'s budget has no training slot and
 * inventing one would blunt amber and red everywhere else (`DEC-TRAIN-001`).
 *
 * **`27-F67` — the "visibly different surface" is the OPPOSITE POLARITY, not a tint.** The
 * tint this component used to apply measured **1.08:1** against the production surface, and
 * 27-F65 is explicit that is not visibly different by any reading. It could not be pushed
 * harder: the binding foreground is `fgColor-status-abnormal`, which clears AA on the light
 * page with no headroom, so any tint keeping it above 4.5:1 sits at most 1.08:1 away.
 * Inverting instead gives **14.31:1** between the two base surfaces and costs nothing,
 * because both polarities are already independently gated for every `27-F21` pairing and
 * every SC 1.4.11 separation. The inversion carries the unmissability; **the band still
 * carries the meaning**, because an inverted shell on its own could read as a display fault.
 */
export type AppShellProps = {
  actor: string;
  deviceLabel: string;
  businessDay: string;
  lan: Fact;
  hub: Fact;
  cloud: Fact;
  /**
   * `01-F56` / `DEC-SYNC-011` — a catalog version this device REFUSED, or `null` when the menu
   * it is selling from is current. Passed straight through to `StatusStrip`, which is where the
   * honesty surface lives; see `CatalogHealth` for why it is not a fourth `ConnectionFacts` chip
   * and not an `03-F5` band.
   */
  catalog?: CatalogRefusal | null | undefined;
  /**
   * `27-F11c` / `00 §5.7` — the glass this device is on, when it is under the counter layout's
   * physical floor or when the device could not measure it. Passed straight through to
   * `StatusStrip`; see `PanelHealth` for why the honesty surface is where it belongs.
   */
  panelFit?: PanelNotice | null | undefined;
  alarms: readonly Alarm[];
  onAcknowledgeAlarm: (id: string) => void;
  tabs: readonly Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  /** 27-F63 / 01-F49 — set when this device is bound to a training branch. */
  training?: boolean | undefined;
  onExitTraining?: (() => void) | undefined;
  children: ReactNode;
};

export const AppShell = ({
  actor,
  deviceLabel,
  businessDay,
  lan,
  hub,
  cloud,
  catalog = null,
  panelFit = null,
  alarms,
  onAcknowledgeAlarm,
  tabs,
  activeTabId,
  onSelectTab,
  training = false,
  onExitTraining,
  children,
}: AppShellProps) => {
  // The inversion is applied on the SHELL, so it reaches every descendant and cannot be
  // navigated away from — there is nowhere to navigate to (27-F1), which is what makes it
  // reliable. Read from context rather than assumed, so a KDS that has opted into dark
  // (27-F19) inverts to light and gets the same 14.31:1 step in the other direction.
  const normal = usePolarity();
  return (
    <ThemeProvider polarity={training ? inverse(normal) : normal}>
      <Shell
        training={training}
        onExitTraining={onExitTraining}
        actor={actor}
        deviceLabel={deviceLabel}
        businessDay={businessDay}
        lan={lan}
        hub={hub}
        cloud={cloud}
        catalog={catalog}
        panelFit={panelFit}
        alarms={alarms}
        onAcknowledgeAlarm={onAcknowledgeAlarm}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
      >
        {children}
      </Shell>
    </ThemeProvider>
  );
};

/**
 * The shell body, split out for one reason: it must read the colour record from INSIDE the
 * provider above. A component cannot consume a context it renders itself.
 */
const Shell = ({
  actor,
  deviceLabel,
  businessDay,
  lan,
  hub,
  cloud,
  catalog,
  panelFit,
  alarms,
  onAcknowledgeAlarm,
  tabs,
  activeTabId,
  onSelectTab,
  training,
  onExitTraining,
  children,
}: AppShellProps) => {
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
      {training ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space["space-4"],
            padding: space["space-3"],
            // An inverted surface, not a text token used backwards — inverting is a LOUDNESS
            // channel and it gets its own pair, so its contrast is verified like any other.
            background: color["bgColor-inverse"],
            color: color["fgColor-on-inverse"],
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          <span>TRAINING — nothing here is real, no food will be cooked</span>
          {onExitTraining ? (
            <button
              type="button"
              onClick={onExitTraining}
              style={{
                padding: space["space-2"],
                // A raised surface sitting on the inverted band — not the band's own tokens
                // used backwards. Inside dark chrome a light chip IS a raised surface, and
                // naming it that keeps the role prefixes honest in both directions.
                background: color["bgColor-surface-raised"],
                color: color["fgColor-default"],
                border: "none",
                borderRadius: space["space-1"],
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              LEAVE TRAINING
            </button>
          ) : null}
        </div>
      ) : null}

      <StatusStrip
        actor={actor}
        deviceLabel={deviceLabel}
        lan={lan}
        hub={hub}
        cloud={cloud}
        businessDay={businessDay}
        catalog={catalog}
        panelFit={panelFit}
        alarms={alarms}
        onAcknowledgeAlarm={onAcknowledgeAlarm}
      />
      <TabRail tabs={tabs} activeId={activeTabId} onSelect={onSelectTab} />

      {/* The work surface. The shell never scrolls it — 27-F2 pages instead — so a child that
        overflows is a layout bug to see, not to hide behind a scrollbar.

        ⚠ This comment used to say `WorkSurface` "measures it ONCE and tells every surface inside
        what size of glass it is on". It does not any more, and the distinction is the point: the
        box below is the WORK AREA, which `03-F5`'s band shortens by 102 dp and a vertical tab
        rail narrows — so a MODE read from it would change under a cashier the moment a printer
        stopped answering. The mode comes from `PanelRoot`'s measurement of the GLASS now
        (`usePanelSize`), which is the thing that does not move. `WorkSurface` is the box; the
        panel is the mode. Capacity still measures the box, in `ItemGrid` and `OrderList`. */}
      <main style={{ flex: 1, minHeight: 0, padding: space["space-4"], overflow: "hidden" }}>
        <WorkSurface>{children}</WorkSurface>
      </main>
    </div>
  );
};
