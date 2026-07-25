import { color, space, typography } from "../tokens/index";
import { type Alarm, AlarmBand } from "./AlarmBand";
import { ConnectionFacts, type Fact } from "./ConnectionFacts";

/**
 * The shell's **honesty surface** — the only chrome that changes (screen-map §1.1).
 *
 * It carries four things and nothing else: who is acting, what the device can reach, what
 * business day it is, and the S1 band. Everything else an operator might "want to know"
 * belongs on a work surface or nowhere — a status strip that accumulates content becomes a
 * dashboard, and a dashboard on an operational screen is read by no one.
 *
 * The alarm sits INSIDE the strip on purpose (`27-F11d`): it is a band, never the screen,
 * and the work underneath stays visible and usable. A half-built cart is never taken away
 * from a cashier with a customer waiting.
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
  alarms,
  onAcknowledgeAlarm,
}: StatusStripProps) => {
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
        <ConnectionFacts lan={lan} hub={hub} cloud={cloud} />
        <span style={{ color: color["fgColor-muted"], fontVariantNumeric: "tabular-nums" }}>
          Day {businessDay}
        </span>
      </div>
      <AlarmBand alarms={alarms} onAcknowledge={onAcknowledgeAlarm} />
    </div>
  );
};
