import { paisa } from "@restos/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoneyValue } from "./MoneyValue";
import { Readout } from "./Readout";

/**
 * **What a non-reader must be able to do with this:** pair the number with the thing it is
 * about, without reading either. The caption and the payload are vertically adjacent at a fixed
 * distance, so the pairing is carried by POSITION — which is the channel `21 §5` says the
 * operator actually has, and which survives a scratched or sun-washed panel (`27-F18`).
 *
 * This is the compositional idiom the product is meant to be recognised by. It exists because
 * every fact on the counter was being drawn as a `space-between` row, which put the word naming a
 * number as far from the number as the container was wide — `DUE` sat **70 mm** from its own
 * figure on the reference panel. `27-F57` measures that exact step on paper and finds where
 * comprehension collapses: readers who decode a line at ~71% execute it correctly at ~35%.
 */
const meta: Meta<typeof Readout> = { title: "Primitives/Readout", component: Readout };
export default meta;
type Story = StoryObj<typeof Readout>;

/**
 * The money case, and the reason the component exists. `27-F25` — the payload is the largest
 * element in its region; the caption is scaffolding and is `text-label`, muted, permanently.
 */
export const Due: Story = {
  args: {
    caption: "DUE",
    children: <MoneyValue paisa={paisa(487500)} size="primary" />,
  },
};

/**
 * **`27-F12` — the direction is carried by the CAPTION here, and by nothing else.**
 *
 * `TenderPanel` printed this word twice for a while: the label said `CHANGE` and the same call
 * also passed `direction: "change"` to `MoneyValue`, which renders it as a prefix — `CHANGE
 * CHANGE Rs 0`, on a founder's screen. Exactly one mechanism may own the word. Where a readout
 * names the fact, the caption owns it; where a figure stands alone (`CashSurfaces`' variance),
 * `MoneyValue.direction` does.
 */
export const Change: Story = {
  args: {
    caption: "CHANGE",
    children: <MoneyValue paisa={paisa(12500)} size="hero" />,
  },
};

/**
 * The same control's other arm, and the asymmetry that decided which mechanism owns the word:
 * `REMAINING` is **not** a member of `MoneyValue`'s `direction` union, so a design where the
 * prefix owned it would take one arm's word from a prefix and the other's from a label.
 */
export const Remaining: Story = {
  args: {
    caption: "REMAINING",
    children: <MoneyValue paisa={paisa(200000)} size="hero" />,
  },
};

/**
 * **The payload does not have to be money**, and the caption's treatment does not change when it
 * is not. `01-F61`'s unlock surface uses this for the identity a PIN is about to be charged
 * against — the fact `02-F41` makes the ledger carry, and the one a mis-tap gets wrong.
 */
export const Identity: Story = {
  args: { caption: "SIGNING IN AS", children: <span>Hina Raza</span> },
};

/**
 * A long caption, because a wrapped one would put the payload in a different place on one surface
 * than on another. The component pins `whiteSpace: nowrap` for that reason; this story is where a
 * regression in it becomes visible.
 */
export const LongCaption: Story = {
  args: {
    caption: "EXPECTED CASH AT CLOSE",
    children: <MoneyValue paisa={paisa(1250000)} size="primary" />,
  },
};
