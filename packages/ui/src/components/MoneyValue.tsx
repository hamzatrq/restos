import { type Paisa, rupeesFromPaisa } from "@restos/domain";
import { useColor } from "../theme";
import { money, type TypeName, typography } from "../tokens/index";

/**
 * 27-F23 — `Rs`, symbol-first; Western 3-digit grouping; NO decimals on operational
 * screens. 27-F24 — the system computes, staff read.
 *
 * The component takes **paisa** (the kernel's integer money unit, 00 §6) and there is
 * deliberately no way to hand it a formatted string, a float, or a partial value. That is
 * the point: ~60% of rural Class 1 recognise numbers against 9.5% who can do any
 * arithmetic (ASER 2023, n=272,370), so any number that reaches an operator must already
 * be finished. A component that accepted a pre-formatted string would let a caller ship an
 * unfinished one.
 */
export type MoneyValueProps = {
  /**
   * Integer paisa, NON-NEGATIVE — and **branded**, so all three of those words are enforced
   * by the compiler rather than by a runtime throw. Never a float (floats in ledgers never,
   * 00 §6) and never signed: money has no sign in this kernel. An append-only ledger cannot
   * subtract from history, so a refund or a short drawer is a positive amount carrying a
   * direction, and `domain`'s `directedPaisa` is where that direction comes from.
   *
   * The brand is load-bearing rather than decorative. While this was a plain `number`, the
   * only thing standing between a bad value and the counter was `asPaisaInt`'s `RangeError`
   * — thrown **during render**, which in React 19 unmounts the root and blanks the till. A
   * blank region on a counter screen is indistinguishable from a hung app, and `01-F17` says
   * a sale is never blocked. Refusing the value at the type boundary is the fix; an
   * ErrorBoundary would only decorate the failure.
   */
  paisa: Paisa;
  /**
   * 27-F12 — direction is a WORD, never a minus sign and never a colour alone. A lone `-`
   * is one glyph wide, is the first thing lost at 1–2 m or on a scratched panel, and means
   * nothing to a non-reader. The word is also what a cashier repeats back to a customer.
   */
  direction?: "refund" | "short" | "over" | "change";
  /**
   * `display` is one step above `hero` and is spent on ROOM, never on distance: `27-F25` makes
   * the payload *"the largest element in their region"*, and `27-F11c` makes a physically wider
   * panel a larger region — so a figure pinned at one size stops being the largest thing in it
   * the moment the surface grows. `useSurfaceMode`'s `wide` is the only caller, and 48 dp
   * already clears `27-F27`'s 20–22 arcmin at arm's length, so this buys hierarchy and not
   * legibility. Said plainly because the two are easy to conflate and only one is measured.
   */
  size?: "display" | "hero" | "primary" | "body";
  /**
   * 27-F16 — money is NEVER coloured by default. Colour on a number means *this number is
   * abnormal*, and colouring the commonest number on screen spends the whole preattentive
   * channel on the base case. Opting in is possible, but it is an explicit act.
   */
  abnormal?: boolean;
};

const SIZES: Record<"display" | "hero" | "primary" | "body", TypeName> = {
  display: "text-numeric-display",
  hero: "text-numeric-hero",
  primary: "text-numeric-primary",
  body: "text-body",
};

/**
 * Western 3-digit grouping. Pakistan does NOT inherit lakh grouping (CLDR gives ur and
 * en-PK the `#,##0.###` pattern). The paisa→rupee divide is `domain`'s, not ours —
 * DEC-MONEY-005 bans raw arithmetic on money in every package, formatters included.
 */
export const formatPaisa = (value: Paisa): string => {
  const { rupees } = rupeesFromPaisa(value);
  return `${money["money-symbol"]} ${rupees.toLocaleString("en-US")}`;
};

export const MoneyValue = ({
  paisa,
  size = "body",
  abnormal = false,
  direction,
}: MoneyValueProps) => {
  const color = useColor();
  const t = typography[SIZES[size]];
  return (
    <span
      style={{
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        lineHeight: `${t.lineHeight}px`,
        fontWeight: t.fontWeight,
        // 27-F26: IBM Plex Sans ships tabular digits with no feature flag needed, but a
        // fallback face may not — bind it so columns of money never jitter.
        fontVariantNumeric: "tabular-nums",
        color: abnormal ? color["fgColor-status-fault"] : color["fgColor-default"],
      }}
    >
      {direction ? `${direction.toUpperCase()} ` : ""}
      {formatPaisa(paisa)}
    </span>
  );
};
