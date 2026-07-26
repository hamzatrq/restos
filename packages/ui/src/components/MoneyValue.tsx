import { rupeesFromPaisa } from "@restos/domain";
import { color, money, type TypeName, typography } from "../tokens/index";

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
   * Integer paisa, NON-NEGATIVE. Never a float — floats in ledgers never (00 §6) — and
   * never signed: money has no sign in this kernel. An append-only ledger cannot subtract
   * from history, so a refund or a short drawer is a positive amount carrying a direction.
   */
  paisa: number;
  /**
   * 27-F12 — direction is a WORD, never a minus sign and never a colour alone. A lone `-`
   * is one glyph wide, is the first thing lost at 1–2 m or on a scratched panel, and means
   * nothing to a non-reader. The word is also what a cashier repeats back to a customer.
   */
  direction?: "refund" | "short" | "over" | "change";
  size?: "hero" | "primary" | "body";
  /**
   * 27-F16 — money is NEVER coloured by default. Colour on a number means *this number is
   * abnormal*, and colouring the commonest number on screen spends the whole preattentive
   * channel on the base case. Opting in is possible, but it is an explicit act.
   */
  abnormal?: boolean;
};

const SIZES: Record<"hero" | "primary" | "body", TypeName> = {
  hero: "text-numeric-hero",
  primary: "text-numeric-primary",
  body: "text-body",
};

/**
 * Western 3-digit grouping. Pakistan does NOT inherit lakh grouping (CLDR gives ur and
 * en-PK the `#,##0.###` pattern). The paisa→rupee divide is `domain`'s, not ours —
 * DEC-MONEY-005 bans raw arithmetic on money in every package, formatters included.
 */
export const formatPaisa = (value: number): string => {
  const { rupees } = rupeesFromPaisa(value as Parameters<typeof rupeesFromPaisa>[0]);
  return `${money["money-symbol"]} ${rupees.toLocaleString("en-US")}`;
};

export const MoneyValue = ({
  paisa,
  size = "body",
  abnormal = false,
  direction,
}: MoneyValueProps) => {
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
