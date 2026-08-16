import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgeBadge } from "./AgeBadge";

/**
 * **What a non-reader must be able to do with this:** know, at 1–2 m and at a glance,
 * whether a ticket is fine, close, or late — without reading the word.
 *
 * That claim is testable and it is what 27-F35's ≥85% post-training comprehension gate will
 * be run against. It is not yet verified on staff: the whole low-literacy ink/emphasis
 * ladder is a reasoned construction, because ZERO studies exist on how low-literacy adults
 * parse operational tickets (27 §2b).
 */
const meta: Meta<typeof AgeBadge> = {
  title: "Status/AgeBadge",
  component: AgeBadge,
  args: { amberAt: 10, redAt: 20 },
};
export default meta;
type Story = StoryObj<typeof AgeBadge>;

export const OnTime: Story = { args: { minutes: 4 } };
export const DueSoon: Story = { args: { minutes: 12 } };
export const Overdue: Story = { args: { minutes: 27 } };

/**
 * 03-F14 — thresholds are org-configurable PER ORDER TYPE. Delivery defaults 15/25 against
 * dine-in's 10/20, because a delivery order's clock includes the road.
 */
export const DeliveryThresholds: Story = { args: { minutes: 17, amberAt: 15, redAt: 25 } };

/**
 * **27-F13 — design achromatically first: if a screen is unreadable in greyscale it is
 * broken.** This story is the proof. The three levels stay distinguishable with hue removed
 * entirely, because the shape changes (pill → soft → square), the fill lightness steps down
 * a monotonic ladder, and the minutes are always printed.
 *
 * This is also the 27-F17 answer: 1 in 20 male staff is deutan, ~80% of them do not know
 * it, and no palette fixes red/green. The structure does.
 */
export const Greyscale: Story = {
  args: { minutes: 27 },
  decorators: [
    () => (
      <div style={{ filter: "grayscale(1)", display: "flex", gap: 12 }}>
        <AgeBadge minutes={4} amberAt={10} redAt={20} />
        <AgeBadge minutes={12} amberAt={10} redAt={20} />
        <AgeBadge minutes={27} amberAt={10} redAt={20} />
      </div>
    ),
  ],
};

/**
 * The same three, unfiltered, for side-by-side comparison with the greyscale story above.
 * If these two stories carry the same information, the component is correct.
 */
export const AllLevels: Story = {
  args: { minutes: 4 },
  decorators: [
    () => (
      <div style={{ display: "flex", gap: 12 }}>
        <AgeBadge minutes={4} amberAt={10} redAt={20} />
        <AgeBadge minutes={12} amberAt={10} redAt={20} />
        <AgeBadge minutes={27} amberAt={10} redAt={20} />
      </div>
    ),
  ],
};
