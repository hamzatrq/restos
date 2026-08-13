import { useColor } from "../theme";
import { space, typography } from "../tokens/index";
import { type Alarm, AlarmBand } from "./AlarmBand";
import { CatalogHealth, type CatalogRefusal } from "./CatalogHealth";
import { ConnectionFacts, type Fact } from "./ConnectionFacts";
import { PanelHealth, type PanelNotice } from "./PanelHealth";

/**
 * The shell's **honesty surface** — the only chrome that changes (screen-map §1.1).
 *
 * It carries five things and nothing else: who is acting, what the device can reach, **whether
 * the menu it is selling from is the current one**, what business day it is, and the S1 band.
 * Everything else an operator might "want to know" belongs on a work surface or nowhere — a
 * status strip that accumulates content becomes a dashboard, and a dashboard on an operational
 * screen is read by no one.
 *
 * The alarm sits INSIDE the strip on purpose (`27-F11d`): it is a band, never the screen,
 * and the work underneath stays visible and usable. A half-built cart is never taken away
 * from a cashier with a customer waiting.
 *
 * **Why catalog health earned the fifth slot** (`01-F56`, `DEC-SYNC-011` (a), `00 §5.7`). This
 * surface is the honesty surface, and it was reporting one kind of truth while a second kind sat
 * unsaid: the device could be REFUSING the menu it was sent and go on drawing the old grid with
 * every chip here reading healthy. `CatalogHealth`'s header carries the full argument for why it
 * is a peer of `ConnectionFacts` rather than a fourth chip inside it — the short version is that
 * `Cloud OK` **with the menu refused** is a real and common state, and a link chip cannot say it.
 * It costs nothing when the catalog is healthy: it renders `null` (`27-F16`).
 */
export type StatusStripProps = {
  /** 02-F19 — attribution is never anonymous. The name is shown, not just a role. */
  actor: string;
  deviceLabel: string;
  lan: Fact;
  hub: Fact;
  cloud: Fact;
  /** 01-F45/F46 — the Asia/Karachi business day, 05:00 cutover. Shown because it is not
   *  the calendar date after midnight, and a cashier closing at 02:00 must not be confused
   *  about which day her drawer belongs to. */
  businessDay: string;
  /**
   * `01-F56` / `DEC-SYNC-011` — the catalog this device has refused, or `null` when it is
   * current. Optional, so a host that has not been taught the fact yet composes unchanged; the
   * cost of that optionality is that a host which stops supplying it goes quiet, which is why
   * `apps/pos-electron` holds it with a hand-written seam assertion rather than with the type.
   */
  catalog?: CatalogRefusal | null | undefined;
  /**
   * `27-F11c` / `00 §5.7` — the GLASS, when it is smaller than the counter layout needs or when
   * the device could not measure it at all. `null` on hardware that clears the floor.
   *
   * Optional for `catalog`'s reason and with the same stated cost: a host that has not been
   * taught the fact composes unchanged, and a host that stops supplying it goes quiet — which is
   * why `apps/pos-electron` holds it with a hand-written seam assertion rather than with the
   * type. See `PanelHealth` for why it is a peer of `ConnectionFacts` and not a fourth chip.
   */
  panelFit?: PanelNotice | null | undefined;
  alarms: readonly Alarm[];
  onAcknowledgeAlarm: (id: string) => void;
};

export const StatusStrip = ({
  actor,
  deviceLabel,
  lan,
  hub,
  cloud,
  businessDay,
  catalog = null,
  panelFit = null,
  alarms,
  onAcknowledgeAlarm,
}: StatusStripProps) => {
  const color = useColor();
  const t = typography["text-label"];
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space["space-4"],
          padding: `${space["space-2"]}px ${space["space-3"]}px`,
          background: color["bgColor-surface-raised"],
          borderBottom: `1px solid ${color["borderColor-default"]}`,
          fontFamily: t.fontFamily,
          fontSize: t.fontSize,
        }}
      >
        <span>
          <strong>{actor}</strong>
          <span style={{ color: color["fgColor-muted"] }}> · {deviceLabel}</span>
        </span>
        {/*
          `27-F12`'s POSITION channel: catalog health sits immediately after the three link facts
          and before the day, always, whether or not it is raised. A fact that moves when it
          appears is a fact an operator has to hunt for, and `27-F4` makes the arrangement of an
          operational surface something staff learn rather than read.
        */}
        <ConnectionFacts lan={lan} hub={hub} cloud={cloud} />
        <CatalogHealth refusal={catalog} />
        {/*
          `27-F12`'s POSITION channel again: panel health sits immediately after catalog health
          and before the day, always, raised or not. The order is the order the facts get further
          from the network and closer to the operator's own hands — link, menu, glass.
        */}
        <PanelHealth notice={panelFit} />
        <span style={{ color: color["fgColor-muted"], fontVariantNumeric: "tabular-nums" }}>
          Day {businessDay}
        </span>
      </div>
      <AlarmBand alarms={alarms} onAcknowledge={onAcknowledgeAlarm} />
    </div>
  );
};
