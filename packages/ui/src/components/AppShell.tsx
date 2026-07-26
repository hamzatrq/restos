import type { ReactNode } from "react";
import { color, space } from "../tokens/index";
import type { Alarm } from "./AlarmBand";
import type { Fact } from "./ConnectionFacts";
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
 * persistent band plus a tinted surface on every screen. The failure it prevents is a member
 * of staff forgetting which mode they are in — either rehearsing an order that never gets
 * cooked, or treating a real one as practice. Both are worse than having no training mode.
 * It is achromatic, because `27-F14`'s budget has no training slot and inventing one would
 * blunt amber and red everywhere else (`DEC-TRAIN-001`).
 */
export type AppShellProps = {
  actor: string;
  deviceLabel: string;
  businessDay: string;
  lan: Fact;
  hub: Fact;
  cloud: Fact;
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
  alarms,
  onAcknowledgeAlarm,
  tabs,
  activeTabId,
  onSelectTab,
  training = false,
  onExitTraining,
  children,
}: AppShellProps) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      // The training tint is on the SHELL, not on a screen, so it cannot be navigated away
      // from — there is nowhere to navigate to (27-F1), which is what makes it reliable.
      background: training ? color["bgColor-surface-sunken"] : color["bgColor-surface"],
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
      alarms={alarms}
      onAcknowledgeAlarm={onAcknowledgeAlarm}
    />
    <TabRail tabs={tabs} activeId={activeTabId} onSelect={onSelectTab} />

    {/* The work surface. The shell never scrolls it — 27-F2 pages instead — so a child that
        overflows is a layout bug to see, not to hide behind a scrollbar. */}
    <main style={{ flex: 1, padding: space["space-4"], overflow: "hidden" }}>{children}</main>
  </div>
);
