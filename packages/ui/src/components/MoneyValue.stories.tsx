import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoneyValue } from "./MoneyValue";

/**
 * **What a non-reader must be able to do with this:** read the number. That is all, and it
 * is enough — numeral recognition is the one literacy finding confirmed twice independently.
 *
 * 27-F24: ~60% of rural Class 1 recognise numbers against **9.5% who can do any
 * arithmetic**. So every amount arrives finished. The component takes integer paisa and
 * cannot be handed a pre-formatted string, which is what stops an unfinished number
 * reaching a counter.
 */
const meta: Meta<typeof MoneyValue> = { title: "Primitives/MoneyValue", component: MoneyValue };
export default meta;
type Story = StoryObj<typeof MoneyValue>;

/** 27-F23 — `Rs`, symbol-first. Not ₨, not PKR in staff UI. */
export const Body: Story = { args: { paisa: 125000 } };

/** 27-F25 — numbers are the operational payload and the largest element in their region. */
export const Hero: Story = { args: { paisa: 348500, size: "hero" } };

/**
 * **Pakistan does NOT inherit lakh grouping.** CLDR gives `ur` and `en-PK` the `#,##0.###`
 * pattern, so 1,250,000 — never 12,50,000. This story is the regression guard for it.
 */
export const LargeAmount: Story = { args: { paisa: 125000000, size: "primary" } };

/** Refunds and negative variances. The sign leads; it is never conveyed by colour alone. */
export const Negative: Story = { args: { paisa: -45000, size: "primary" } };

/**
 * 27-F16 — **money is never coloured by default.** Colour on a number means *this number is
 * abnormal*, and colouring the commonest number on screen would spend the whole preattentive
 * channel on the base case. Opting in is an explicit act, used for a cash variance past
 * threshold and almost nothing else.
 */
export const AbnormalOptIn: Story = { args: { paisa: -45000, size: "primary", abnormal: true } };

/** A column of amounts — tabular figures must not jitter (27-F26 chose the face for this). */
export const TabularColumn: Story = {
  args: { paisa: 0 },
  decorators: [
    () => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {[125000, 9900, 348500, 1200, 125000000].map((p) => (
          <MoneyValue key={p} paisa={p} size="primary" />
        ))}
      </div>
    ),
  ],
};
