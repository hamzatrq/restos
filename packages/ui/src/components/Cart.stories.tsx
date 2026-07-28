import { paisa } from "@restos/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Cart } from "./Cart";

/**
 * **What a non-reader must be able to do with this:** see what they have added, and read one
 * finished total.
 *
 * The cart is the cashier's working memory and it is **always visible, never collapsed**. A
 * collapsing cart is `27-F5`'s banned context-dependent control in a different costume: it
 * removes the thing she is reasoning about at the exact moment she is interrupted — and on
 * this counter she is interrupted continuously, by design.
 */
const meta: Meta<typeof Cart> = { title: "Composites/Cart", component: Cart };
export default meta;
type Story = StoryObj<typeof Cart>;

const LINES = [
  { id: "1", quantity: 2, name: "Chicken Karahi", modifiers: ["Medium spice"] },
  { id: "2", quantity: 4, name: "Naan" },
  { id: "3", quantity: 1, name: "Beef Burger", removals: ["ONION"] },
];

export const WithItems: Story = {
  args: { lines: LINES, totalPaisa: paisa(248000), onRemove: () => {} },
};

/**
 * The empty state says what to do next in four words. It does not explain the app, and it
 * does not show an illustration — `27-F11` makes density a professional-tool decision, and
 * an operator on their four-hundredth order of the week does not need onboarding in the cart.
 */
export const Empty: Story = { args: { lines: [], totalPaisa: paisa(0), onRemove: () => {} } };

/**
 * `27-F24` — the total arrives **finished**. There is no subtotal, no tax line to add up and
 * nothing the operator is expected to compute: ~60% of this population recognise numbers
 * against **9.5%** who can do any arithmetic (ASER 2023, n=272,370).
 *
 * `27-F16` — and it is **not coloured**. Colour on a number means *this number is abnormal*;
 * the total is the commonest number on the screen, so colouring it would spend the entire
 * preattentive channel on the base case.
 */
export const LargeOrder: Story = {
  args: {
    lines: [
      ...LINES,
      { id: "4", quantity: 12, name: "Seekh Kebab", note: "Party order — table 9" },
      { id: "5", quantity: 6, name: "Mutton Pulao" },
    ],
    totalPaisa: paisa(1875000),
    onRemove: () => {},
  },
};

/**
 * Read-only — a parked order, or a cart being reviewed on a manager's screen. Removing an
 * item post-KOT is not a "remove" at all: `01 §4` makes it a `void.recorded` with an
 * approver, which is a different control on a different surface.
 */
export const ReadOnly: Story = { args: { lines: LINES, totalPaisa: paisa(248000) } };
