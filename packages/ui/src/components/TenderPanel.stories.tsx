import { paisa } from "@restos/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TenderPanel } from "./TenderPanel";

/**
 * **What a non-reader must be able to do with this:** read the big number and hand back that
 * much cash. That is the whole job, and it is why the change figure is hero-sized and finished.
 *
 * `27-F24` — ~60% of rural Class 1 recognise numbers against 9.5% who can do any arithmetic.
 * A screen that showed the bill and the tender and left the subtraction to the cashier would be
 * asking the 9.5% skill of everyone, at the till, with a queue.
 */
const meta: Meta<typeof TenderPanel> = { title: "Counter/TenderPanel", component: TenderPanel };
export default meta;
type Story = StoryObj<typeof TenderPanel>;

/** The ordinary case: a bill, nothing tendered yet. */
export const Due: Story = {
  args: { dueP: paisa(148_500), onTender: () => {} },
};

/**
 * `02-F13` — a split is not a mode. It is what a partial tender leaves behind, so the panel
 * simply shows what is still owed and the cashier takes the rest on another method.
 */
export const PartiallyPaid: Story = {
  args: { dueP: paisa(148_500), takenP: paisa(100_000), onTender: () => {} },
};

/**
 * Nothing left to pay. `Paisa` has no sign, so an over-tender cannot render as a negative due —
 * the remaining amount floors at zero and the direction is carried by the WORD (`27-F12`).
 */
export const Settled: Story = {
  args: { dueP: paisa(148_500), takenP: paisa(148_500), onTender: () => {} },
};
