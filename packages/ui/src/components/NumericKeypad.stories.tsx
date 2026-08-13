import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { typography } from "../tokens/index";
import { NumericKeypad } from "./NumericKeypad";

/**
 * **What a non-reader must be able to do with this:** type a number they already know, and
 * be physically unable to type one that is impossible.
 *
 * These are the biggest targets in the system — 126 dp (20 mm) — because `27-F8` puts
 * standing high-consequence numeric entry in the kiosk condition. And `27-F29` blocks
 * impossible values at the keystroke rather than warning afterwards, which roughly halves
 * out-by-10 errors.
 *
 * **There is no decimal key.** No sub-rupee unit circulates in Pakistan, `27-F23` puts no
 * decimals on operational screens, and the decimal point is the highest-consequence
 * keystroke there is — so the key could only ever be a mistake.
 */
const meta: Meta<typeof NumericKeypad> = {
  title: "Primitives/NumericKeypad",
  component: NumericKeypad,
};
export default meta;
type Story = StoryObj<typeof NumericKeypad>;

const Interactive = ({ max, maxDigits }: { max: number; maxDigits?: number }) => {
  const [value, setValue] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <output
        style={{
          fontSize: 48,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          minHeight: typography["text-numeric-hero"].lineHeight,
        }}
      >
        Rs {value === "" ? "0" : Number(value).toLocaleString("en-US")}
      </output>
      <NumericKeypad value={value} onChange={setValue} max={max} maxDigits={maxDigits ?? 7} />
      <small>Maximum {max.toLocaleString("en-US")} — keys past it go dead, they do not warn.</small>
    </div>
  );
};

/** A cash tender. Try to type past the limit: the keys disable rather than complaining. */
export const CashTender: Story = {
  args: { value: "", onChange: () => {}, max: 100000 },
  render: () => <Interactive max={100000} />,
};

/**
 * A drawer float, where a plausible-but-wrong figure is the dangerous one. The digit cap is
 * the out-by-10 guard: an operator who means 5,000 and types 50,000 is stopped by the
 * keypad, not by a reconciliation three hours later.
 */
export const OpeningFloat: Story = {
  args: { value: "", onChange: () => {}, max: 50000 },
  render: () => <Interactive max={50000} maxDigits={5} />,
};

/**
 * 27-F4 — blocked keys are **disabled in place, never hidden or relocated.** The keypad is
 * the most position-dependent surface in the product; a "7" that moves is a mis-entry
 * waiting to happen. Clear and backspace always stay live, because a blocked state the
 * operator cannot escape is worse than the entry it prevented.
 */
export const AtTheLimit: Story = {
  args: { value: "999", onChange: () => {}, max: 999 },
};
