import type { Meta, StoryObj } from "@storybook/react-vite";
import { QuantityItemLine } from "./QuantityItemLine";

/**
 * **What a non-reader must be able to do with this:** know HOW MANY of WHICH thing.
 *
 * This is the component the low-literacy evidence bears on most directly, and the rule is
 * one line long: the quantity never leaves the item it counts. Readers who *decode* a line
 * at ~71% *execute* it correctly at ~35% — the loss is in the mapping step, not the reading
 * step, so a right-aligned quantity column is not a neutral layout choice. It is the defect.
 *
 * There is no `align` prop and no `columns` prop. Both would be the failure.
 */
const meta: Meta<typeof QuantityItemLine> = {
  title: "Composites/QuantityItemLine",
  component: QuantityItemLine,
};
export default meta;
type Story = StoryObj<typeof QuantityItemLine>;

export const Simple: Story = { args: { quantity: 2, name: "Chicken Karahi" } };

/** 27-F59 — modifiers are indented UNDER the item, never inlined into a wrapping paragraph. */
export const WithModifiers: Story = {
  args: { quantity: 1, name: "Chicken Biryani", modifiers: ["Extra raita", "Medium spice"] },
};

/**
 * 27-F59 — a REMOVAL carries the inverted marker, on glass and on paper alike. The reason is
 * not emphasis-for-its-own-sake: a missed removal is an allergen incident, not a missed
 * preference. On thermal paper this is the single reserved inversion of 27-F56.
 */
export const WithRemoval: Story = {
  args: { quantity: 1, name: "Beef Burger", removals: ["ONION"], modifiers: ["Well done"] },
};

/** 03-F3 — notes are visually emphasised on the KOT. Weight and position, never a 4th hue. */
export const WithNote: Story = {
  args: { quantity: 3, name: "Seekh Kebab", note: "Customer is waiting at counter" },
};

/**
 * A whole ticket. **Read down the left edge:** the quantities form their own column WITHOUT
 * being right-aligned into one, because each sits flush against its item. That is the
 * difference 27-F57 is protecting.
 */
export const TicketBody: Story = {
  args: { quantity: 1, name: "x" },
  decorators: [
    () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 420 }}>
        <QuantityItemLine quantity={2} name="Chicken Karahi" modifiers={["Medium spice"]} />
        <QuantityItemLine quantity={1} name="Beef Burger" removals={["ONION"]} />
        <QuantityItemLine quantity={12} name="Naan" />
        <QuantityItemLine quantity={3} name="Seekh Kebab" note="Table is waiting" />
      </div>
    ),
  ],
};
