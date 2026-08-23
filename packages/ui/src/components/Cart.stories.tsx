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

/**
 * Every row carries its own money (`27-F24`: *"Every total, change amount, LINE TOTAL and elapsed
 * minute arrives as a finished number"*), because a cashier who cannot read a line total cannot
 * check the one figure she is accountable for — and 9.5% of this population can do the arithmetic
 * that would otherwise be required of her.
 */
const LINES = [
  {
    id: "1",
    quantity: 2,
    name: "Chicken Karahi",
    modifiers: ["Medium spice"],
    billedPaisa: paisa(90000),
  },
  { id: "2", quantity: 4, name: "Naan", billedPaisa: paisa(24000) },
  { id: "3", quantity: 1, name: "Beef Burger", removals: ["ONION"], billedPaisa: paisa(45000) },
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
      {
        id: "4",
        quantity: 12,
        name: "Seekh Kebab",
        note: "Party order — table 9",
        billedPaisa: paisa(960000),
      },
      { id: "5", quantity: 6, name: "Mutton Pulao", billedPaisa: paisa(756000) },
    ],
    totalPaisa: paisa(1875000),
    onRemove: () => {},
  },
};

/**
 * **What a non-reader must be able to do with this: see that one dish is no longer being charged
 * for, without reading a word.**
 *
 * The void is the state this component shipped without for the whole of Wave 1 — a voided row was
 * byte-identical to a live one and the only evidence was the total moving. `27-F12` decides the
 * remedy: the **word** carries it and the fill is the preattentive half, because a lone mark is
 * the first thing lost at 1–2 m or on a scratched panel. The number beside the word is the fold's
 * own `Rs 0`, so the row and the total below it are two renderings of one decision.
 *
 * A **comped** and a **discounted** line are deliberately absent from this file: `merge.ts`
 * projects neither, so the cart has nothing to read and renders them as the full-price live lines
 * the customer is in fact still being charged for. `Cart`'s header carries the argument.
 */
export const WithVoidedLine: Story = {
  args: {
    lines: [
      LINES[0] as (typeof LINES)[number],
      { id: "2", quantity: 4, name: "Naan", billedPaisa: paisa(0), offBill: "VOIDED" },
      LINES[2] as (typeof LINES)[number],
    ],
    totalPaisa: paisa(135000),
    onRemove: () => {},
  },
};

/**
 * Read-only — a parked order, or a cart being reviewed on a manager's screen. Removing an
 * item post-KOT is not a "remove" at all: `01 §4` makes it a `void.recorded` with an
 * approver, which is a different control on a different surface.
 */
export const ReadOnly: Story = { args: { lines: LINES, totalPaisa: paisa(248000) } };
