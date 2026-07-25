import type { Meta, StoryObj } from "@storybook/react-vite";
import { TicketCard } from "./TicketCard";

/**
 * **What a non-reader must be able to do with this:** know which order this is, how late it
 * is, and how many of what to cook — then hit DONE.
 *
 * **For most deployments this screen does not exist.** `27-F11e` makes paper the primary
 * kitchen interface and the pass screen optional; the printed KOT (`03-F30..F45`, `27 §2b`)
 * is the deliverable that matters more. This card is built from the same `QuantityItemLine`
 * the ticket renderer uses, so a cook who works from paper on Monday and glass on Tuesday
 * reads the same arrangement.
 */
const meta: Meta<typeof TicketCard> = { title: "Composites/TicketCard", component: TicketCard };
export default meta;
type Story = StoryObj<typeof TicketCard>;

const LINES = [
  { id: "1", quantity: 2, name: "Chicken Karahi", modifiers: ["Medium spice"] },
  { id: "2", quantity: 1, name: "Beef Burger", removals: ["ONION"] },
  { id: "3", quantity: 4, name: "Naan" },
];

export const OnTime: Story = {
  args: { reference: "#412", minutes: 4, amberAt: 10, redAt: 20, lines: LINES, onBump: () => {} },
};

export const Overdue: Story = {
  args: { reference: "#398", minutes: 27, amberAt: 10, redAt: 20, lines: LINES, onBump: () => {} },
};

/** 03-F3/03-F37 — reprints are marked. They are a named fraud vector, on paper and on glass. */
export const Reprint: Story = {
  args: {
    reference: "#412",
    minutes: 12,
    amberAt: 10,
    redAt: 20,
    lines: LINES,
    reprint: true,
    onBump: () => {},
  },
};

/**
 * A note that changes what the cook does. `03-F3` emphasises notes on the ticket; the
 * emphasis is weight and position, never a fourth hue — `27-F14`'s budget has no "note" slot
 * and inventing one would blunt amber and red for everything else.
 */
export const WithNote: Story = {
  args: {
    reference: "#420",
    minutes: 6,
    amberAt: 10,
    redAt: 20,
    lines: [{ id: "1", quantity: 3, name: "Seekh Kebab", note: "Customer waiting at counter" }],
    onBump: () => {},
  },
};

/**
 * The 22″ pass panel showing three tickets (`27-F11f`: the smallest size that does, at 1.5 m
 * — 10″ ≈ 1.5 tickets, 15.6″ ≈ 2). **Page 1 always holds the oldest** (`03-F46`), so the work
 * is always here and reaching it is never a navigation act.
 *
 * `03-F23`, the strongest anti-scope statement in the corpus: there is no priority marker,
 * no reordering and no "cook this next". Sequencing is visibility only — **the chef decides.**
 */
export const PassPanel: Story = {
  args: { reference: "#1", minutes: 1, amberAt: 10, redAt: 20, lines: LINES, onBump: () => {} },
  decorators: [
    () => (
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <TicketCard
          reference="#398"
          minutes={27}
          amberAt={10}
          redAt={20}
          lines={LINES}
          onBump={() => {}}
        />
        <TicketCard
          reference="#405"
          minutes={13}
          amberAt={10}
          redAt={20}
          lines={LINES.slice(0, 2)}
          onBump={() => {}}
        />
        <TicketCard
          reference="#412"
          minutes={3}
          amberAt={10}
          redAt={20}
          lines={LINES.slice(1)}
          onBump={() => {}}
        />
      </div>
    ),
  ],
};
