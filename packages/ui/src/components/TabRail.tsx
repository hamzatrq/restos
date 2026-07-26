import { color, space, targetFor, typography } from "../tokens/index";

/**
 * `27-F1` layout depth ONE, as a shell.
 *
 * Three laws are enforced here structurally rather than by convention, because each has a
 * tempting violation:
 *
 * 1. **Tabs are lateral, not depth.** A fixed rail costs nothing against the depth budget.
 *    What *would* cost is a tab whose contents need another navigation act to reach a
 *    primary action — that is depth two, and no prop here can express it.
 * 2. **A conditional tab is DISABLED IN PLACE, never absent** (`27-F4`). The rail is
 *    positional memory. A tab that appears only when a condition holds destroys the muscle
 *    memory of every operator who learned the layout without it, and adding, removing or
 *    reordering an operational surface is a breaking change requiring PR justification.
 *    So `tabs` is a fixed list and unavailability is a property of a tab, not its absence.
 * 3. **Nothing lives behind a menu.** There is no overflow, no "More", no hamburger. An
 *    operator who cannot read cannot discover a labelled menu at all, and `27-F2`'s finding
 *    — nearly half of field subjects did not know content existed below the fold — applies
 *    to hidden navigation with more force than to hidden content.
 *
 * If a surface will not fit in the rail, that is a signal the app has too many surfaces, not
 * a signal to add an overflow.
 */
export type Tab = {
  id: string;
  label: string;
  /** A count worth interrupting for — unaccepted cloud orders, open approvals (27-F25). */
  badge?: number;
  /** Disabled in place, with the reason shown. Never removed from the rail. */
  unavailable?: boolean;
  unavailableReason?: string;
};

export type TabRailProps = {
  tabs: readonly Tab[];
  activeId: string;
  onSelect: (id: string) => void;
};

export const TabRail = ({ tabs, activeId, onSelect }: TabRailProps) => {
  const t = typography["text-label"];
  return (
    <nav
      aria-label="Main"
      style={{
        display: "flex",
        gap: space["space-1"],
        padding: space["space-1"],
        background: color["bgColor-surface-sunken"],
        borderBottom: `1px solid ${color["borderColor-default"]}`,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            disabled={tab.unavailable}
            onClick={() => onSelect(tab.id)}
            style={{
              // Counter posture: the rail is touched at a fixed terminal, standing (27-F8).
              minHeight: targetFor("counter"),
              minWidth: targetFor("counter"),
              padding: `${space["space-2"]}px ${space["space-4"]}px`,
              display: "flex",
              alignItems: "center",
              gap: space["space-2"],
              fontFamily: t.fontFamily,
              fontSize: t.fontSize,
              fontWeight: active ? 600 : t.fontWeight,
              // 27-F13: the active tab is marked by FILL and weight, not by hue. The
              // interactive accent is reserved for controls the operator may press — every
              // tab is pressable, so spending it here would say nothing.
              background: tab.unavailable
                ? color["bgColor-surface-sunken"]
                : active
                  ? color["bgColor-surface-raised"]
                  : "transparent",
              // No opacity wash — see Tile: it makes the reason unreadable (1.97:1) and the
              // reason is the only thing that makes disabling-in-place useful.
              color: tab.unavailable ? color["fgColor-disabled"] : color["fgColor-default"],
              border: "none",
              borderBottom: active
                ? `3px solid ${color["bgColor-interactive"]}`
                : "3px solid transparent",
              cursor: tab.unavailable ? "not-allowed" : "pointer",
            }}
          >
            <span>{tab.label}</span>
            {tab.badge ? (
              <span
                style={{
                  minWidth: 28,
                  padding: `0 ${space["space-1"]}px`,
                  borderRadius: 4,
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 600,
                  // Abnormal, not fault: a queue of unaccepted orders needs attention, it is
                  // not a breakage. Fault is reserved so that when it appears it means it.
                  background: color["bgColor-status-abnormal"],
                  color: color["fgColor-on-status-abnormal"],
                }}
              >
                {tab.badge}
              </span>
            ) : null}
            {tab.unavailable && tab.unavailableReason ? (
              <span style={{ color: color["fgColor-disabled"] }}>{tab.unavailableReason}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
};
