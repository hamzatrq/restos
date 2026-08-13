import { useSurfaceMode } from "../surface-mode";
import { useColor } from "../theme";
import { space, targetFor, typography } from "../tokens/index";

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

/**
 * # THE RAIL TURNS ON ITS SIDE ON SHORT GLASS, AND IT IS THE SINGLE BIGGEST HEIGHT LEVER THERE IS
 *
 * A horizontal rail costs **85 dp — 13.5 mm — of vertical chrome on every surface at once**, and
 * on a 126 mm panel that is more than a tenth of the entire glass. Measured against the height
 * budget, it is the difference between the counter fitting `27 §1a`'s 10.1″ tablet class and not:
 * with `03-F5`'s band up, the Pay tab (holding `27-F8`'s untouchable 528 dp keypad) needs 816 dp
 * = 130 mm with the rail on top and **715 dp = 113.5 mm** with it at the side.
 *
 * **It spends the axis that has room to buy the axis that does not**, which is the whole
 * technique of this mode. A 10.1″ panel is 223 mm across and 126 mm down; the counter surfaces
 * are height-bound on it and nothing is width-bound except Cash — and Cash's width demand is
 * itself a *function of the height it is given*, because its groups column-wrap. So moving the
 * rail sideways buys Cash height, Cash needs fewer columns, and Cash gets **narrower**. The two
 * effects compound rather than cancelling, which is not obvious and is why it was measured.
 *
 * ## What this is NOT, because each is a law it would break
 *
 * - **Not an overflow, a "More", or a hamburger.** The rail still holds every tab, all five, all
 *   visible, all labelled — `27-F5`'s *"persistent, visible, labelled target"* and rule 3 above.
 *   Nothing moved behind anything.
 * - **Not a reorder.** Top-to-bottom is the same sequence left-to-right was, in the same DOM
 *   order. `27-F4` makes reordering an operational surface a breaking change; changing which
 *   EDGE a fixed list runs along is the "where" that `surface-mode.tsx`'s contract permits and
 *   the "what / in what order" it forbids is untouched.
 * - **Not a depth change.** `27-F2a`: a persistent tab strip plus lateral paging is depth ONE,
 *   and a strip is no less persistent for being vertical.
 * - **Not a smaller target.** Every tab keeps `targetFor("counter")` on both axes. `27-F68` (b)
 *   forbids trimming millimetres to make a layout fit and nothing here is trimmed — the rail
 *   occupies the same area, turned through 90°.
 *
 * ## The mode is read here rather than passed in
 *
 * An `orientation` prop would be a prop a caller can get wrong, and `packages/ui/CLAUDE.md`'s
 * standing test is *"a component that can be configured into violating a law is not a closed
 * vocabulary"*. `TenderPanel` and `PersonTile` already read `useSurfaceMode()` directly for the
 * same reason; the rail is a third instance of the same pattern, not a new one.
 */
export const TabRail = ({ tabs, activeId, onSelect }: TabRailProps) => {
  const color = useColor();
  const t = typography["text-label"];
  const vertical = useSurfaceMode() === "compact";
  return (
    <nav
      aria-label="Main"
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        // 27-F8 requires >= 8 dp between adjacent touch targets, and every tab here is a
        // 76 dp target. This was `space-1` (4 px) — half the floor, on the one container in
        // the package whose children are all full-size targets side by side. Nothing in the
        // package had ever checked a gap.
        gap: space["space-2"],
        padding: space["space-1"],
        background: color["bgColor-surface-sunken"],
        // The rule sits on the edge the rail actually divides. A bottom rule under a vertical
        // rail would draw a line across nothing.
        ...(vertical
          ? { borderRight: `1px solid ${color["borderColor-default"]}` }
          : { borderBottom: `1px solid ${color["borderColor-default"]}` }),
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
              // The vertical rail spends its horizontal padding one token step tighter. Every dp
              // of rail width comes straight out of the work area's, and Cash is the one surface
              // in the product that is width-bound. The TARGET is untouched — `minWidth` still
              // holds `targetFor("counter")` on both axes, so this narrows the label's inset and
              // never the thing a finger lands on (`27-F68` (b)).
              padding: `${space["space-2"]}px ${vertical ? space["space-2"] : space["space-4"]}px`,
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
              // No opacity wash — see Tile: it makes the reason unreadable (1.89:1) and the
              // reason is the only thing that makes disabling-in-place useful.
              color: tab.unavailable ? color["fgColor-disabled"] : color["fgColor-default"],
              border: "none",
              /*
                The 3 dp accent marks the active tab on the edge the WORK AREA is on, so it
                points at the surface it selects in both arrangements — under the tab when the
                rail is on top, beside it when the rail is at the side. Kept as a reserved
                transparent edge on the inactive tabs so selecting one moves no text: that is
                27-F4 at the smallest scale it operates on.
              */
              ...(vertical
                ? {
                    borderRight: active
                      ? `3px solid ${color["bgColor-interactive"]}`
                      : "3px solid transparent",
                    // The tabs fill the rail's width so the active FILL reads as a selected
                    // block rather than as a ragged chip — 27-F13 marks the active tab by fill
                    // and weight, and a fill only says so if its edge is the region's edge.
                    justifyContent: "flex-start",
                    width: "100%",
                  }
                : {
                    borderBottom: active
                      ? `3px solid ${color["bgColor-interactive"]}`
                      : "3px solid transparent",
                  }),
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
                  // 27-F64 — the OUTLINE carries SC 1.4.11, and this badge was relieved of the
                  // fill requirement without ever rendering one. Measured at 2.91:1 against the
                  // rail, i.e. below the 3:1 floor with nothing else carrying it: the relief was
                  // granted on account of a boundary that did not exist.
                  border: `1px solid ${color["outlineColor-status-abnormal"]}`,
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
