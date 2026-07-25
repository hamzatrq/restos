import type { Meta, StoryObj } from "@storybook/react-vite";
import { TabRail } from "./TabRail";

/**
 * **What a non-reader must be able to do with this:** find the same surface in the same
 * place, every shift, forever.
 *
 * That is the whole design. The rail is positional memory, so it never reorders and never
 * hides anything behind a menu — an operator who cannot read cannot discover a labelled
 * overflow at all.
 */
const meta: Meta<typeof TabRail> = { title: "Shell/TabRail", component: TabRail };
export default meta;
type Story = StoryObj<typeof TabRail>;

const COUNTER = [
  { id: "order", label: "Order" },
  { id: "orders", label: "Orders" },
  { id: "pay", label: "Pay" },
  { id: "cash", label: "Cash" },
  { id: "me", label: "Me" },
];

/** The counter POS's five fixed surfaces (screen-map §3.1). Five, and never a sixth. */
export const CounterPos: Story = {
  args: { tabs: COUNTER, activeId: "order", onSelect: () => {} },
};

/**
 * An unaccepted cloud-order queue (`02-F9`). The count is the signal — 27-F25 makes numbers
 * the operational payload — and it arrives with an S2 chime rather than a modal, because
 * `27-F11d` will not let anything take the cart.
 */
export const WithPendingWork: Story = {
  args: {
    tabs: COUNTER.map((t) => (t.id === "orders" ? { ...t, badge: 3 } : t)),
    activeId: "order",
    onSelect: () => {},
  },
};

/**
 * **27-F4 — disabled IN PLACE, never absent.** Pay is unreachable with no shift open
 * (`02-F22`), but removing the tab would shift every other tab left and break the positional
 * memory of everyone who learned the rail with it there. Adding, removing or reordering an
 * operational surface is a breaking change, and the shell is where that bites hardest.
 */
export const ConditionalSurfaceDisabled: Story = {
  args: {
    tabs: COUNTER.map((t) =>
      t.id === "pay" ? { ...t, unavailable: true, unavailableReason: "no shift open" } : t,
    ),
    activeId: "order",
    onSelect: () => {},
  },
};

/** The kitchen has ONE surface and therefore no rail at all — shown for contrast. */
export const KitchenHasNoRail: Story = {
  args: { tabs: [{ id: "queue", label: "Queue" }], activeId: "queue", onSelect: () => {} },
};
