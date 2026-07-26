import { color, space, targetFor, typography } from "../tokens/index";
import { MoneyValue } from "./MoneyValue";
import { QuantityItemLine, type QuantityItemLineProps } from "./QuantityItemLine";

/**
 * The cashier's working memory. Screen-map §3.1: **always visible, never a separate screen,
 * never collapsed.**
 *
 * `27-F5` forbids controls that change with context, and a cart that collapses is the same
 * failure in a different costume — the operator loses the thing she is reasoning about at the
 * moment she is interrupted, which on this counter is continuously (a queue, a ringing
 * phone, a beeping aggregator tablet, a waiter shouting a change).
 *
 * `27-F24` governs the total: it arrives **finished**. There is no subtotal the operator is
 * expected to add anything to, because ~60% of this population recognise numbers against
 * 9.5% who can do any arithmetic.
 */
export type CartProps = {
  lines: readonly (QuantityItemLineProps & { id: string })[];
  /** Already computed, in integer paisa. The screen never does money arithmetic. */
  totalPaisa: number;
  onRemove?: ((id: string) => void) | undefined;
};

export const Cart = ({ lines, totalPaisa, onRemove }: CartProps) => {
  const label = typography["text-label"];
  return (
    <section
      aria-label="Current order"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: space["space-3"],
        padding: space["space-4"],
        background: color["bgColor-surface-raised"],
        border: `1px solid ${color["borderColor-default"]}`,
        borderRadius: space["space-2"],
        minWidth: 320,
      }}
    >
      {lines.length === 0 ? (
        <span style={{ color: color["fgColor-muted"], fontFamily: label.fontFamily }}>
          Nothing added yet
        </span>
      ) : (
        lines.map(({ id, ...line }) => (
          <div
            key={id}
            style={{ display: "flex", alignItems: "flex-start", gap: space["space-2"] }}
          >
            <div style={{ flex: 1 }}>
              <QuantityItemLine {...line} />
            </div>
            {onRemove ? (
              <button
                type="button"
                aria-label={`Remove ${line.name}`}
                onClick={() => onRemove(id)}
                style={{
                  // 27-F9 — destructive, so it is visually separated from the item body and
                  // never sits where a wet hand lands while scanning the list. Removal
                  // pre-KOT is a plain event; post-KOT it must be a void with an approver
                  // (01 §4), which is a different control on a different surface entirely.
                  // Was a raw 44 — BELOW the 48 dp absolute floor, on a destructive control.
                  // Caught by the adversarial pass; a raw pixel number here is exactly what
                  // TOKENS.md bans, and it is why the ban exists.
                  minWidth: targetFor("floor"),
                  minHeight: targetFor("floor"),
                  marginLeft: space["space-4"],
                  background: "transparent",
                  // fgColor-, not bgColor- — the role prefix exists to say which property a
                  // token belongs to, and using a fill as a foreground silently breaks that.
                  color: color["fgColor-status-fault"],
                  border: `1px solid ${color["fgColor-status-fault"]}`,
                  borderRadius: space["space-1"],
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))
      )}

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingTop: space["space-3"],
          borderTop: `1px solid ${color["borderColor-default"]}`,
        }}
      >
        <span style={{ fontFamily: label.fontFamily, fontSize: label.fontSize }}>TOTAL</span>
        {/* 27-F16: not coloured. Colour on a number means "this number is abnormal", and the
            total is the commonest number on the screen — colouring it would spend the whole
            preattentive channel on the base case. */}
        <MoneyValue paisa={totalPaisa} size="hero" />
      </div>
    </section>
  );
};
