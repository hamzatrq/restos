import { color, space, typography } from "../tokens/index";

/**
 * 27-F57 — the quantity is NEVER separated from the item it counts.
 *
 * This is the single most load-bearing low-literacy rule in the product, and it is the one
 * most likely to be undone by a well-meaning "align the numbers in a column" refactor. The
 * mapping step — pairing a number to the thing it quantifies — is where comprehension
 * collapses: readers who *decode* a line at ~71% *execute* it correctly at ~35%.
 *
 * Therefore the quantity sits immediately LEFT of the name, on the SAME line, at the SAME
 * size. There is no `align` prop and no `columns` prop, because both are the failure.
 *
 * The same component serves glass and paper (27-F55 §2b): the KOT renderer consumes this
 * shape so the cook sees the same arrangement on the ticket as on the pass screen.
 */
export type QuantityItemLineProps = {
  quantity: number;
  name: string;
  /** 27-F59 — modifiers are indented UNDER their item, never inlined. */
  modifiers?: readonly string[];
  /** A removal, not a preference. 27-F59: a missed removal is an allergen incident. */
  removals?: readonly string[];
  note?: string;
};

export const QuantityItemLine = ({
  quantity,
  name,
  modifiers = [],
  removals = [],
  note,
}: QuantityItemLineProps) => {
  const t = typography["text-numeric-primary"];
  const label = typography["text-label"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space["space-1"] }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: space["space-2"] }}>
        <span
          style={{
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: t.fontWeight,
            fontVariantNumeric: "tabular-nums",
            // No fixed width: a right-aligned column is exactly what 27-F57 forbids, because
            // it puts whitespace between the number and the thing it counts.
          }}
        >
          {quantity}
        </span>
        <span
          style={{
            fontFamily: t.fontFamily,
            // SAME size as the quantity — a smaller name re-creates the separation in
            // visual weight that the layout rule just removed.
            fontSize: t.fontSize,
            fontWeight: t.fontWeight,
          }}
        >
          {name}
        </span>
      </div>

      {modifiers.map((m) => (
        <div
          key={m}
          style={{
            // 27-F59: indented under its item. An inlined modifier turns one scannable line
            // into a wrapped paragraph, and wrapping destroys the vertical alignment that
            // 27-F57 and 27-F58 both depend on.
            paddingLeft: space["space-6"],
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            color: color["fgColor-muted"],
          }}
        >
          {m}
        </div>
      ))}

      {removals.map((r) => (
        <div
          key={r}
          style={{
            paddingLeft: space["space-6"],
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            fontWeight: 600,
            // 27-F56 — a removal carries the inverted marker: on paper this is the single
            // reserved inversion, and on glass it is the fault fill. Same reasoning either
            // way: a missed removal is an allergen incident, not a missed preference.
            //
            // It shares the fault fill with AgeBadge, which would otherwise make red mean two
            // things on one ticket — "late" and "allergen" — and put red on a HEALTHY ticket
            // whenever a line has a removal, diluting the one colour 27-F14 reserves. The
            // glyph is what separates them (founder ruling): shape carries the distinction,
            // not a fifth colour. It leads rather than follows because a non-reader gets the
            // meaning from the mark, and it survives the 80 mm thermal path (27-F55 §2b)
            // where a clip-path or a radius would not.
            background: color["bgColor-status-fault"],
            color: color["fgColor-on-status-fault"],
            padding: `${space["space-1"]}px ${space["space-2"]}px`,
            alignSelf: "flex-start",
            marginLeft: space["space-6"],
          }}
        >
          <span aria-hidden="true">{"\u2715"}</span> NO {r}
        </div>
      ))}

      {note ? (
        <div
          style={{
            paddingLeft: space["space-6"],
            fontFamily: label.fontFamily,
            fontSize: label.fontSize,
            // 03-F3: notes are visually emphasised on the KOT. Emphasis here is weight and
            // position, not a fourth colour — the 27-F14 budget has no slot for "note".
            fontWeight: 600,
          }}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
};
