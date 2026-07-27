import type { Meta, StoryObj } from "@storybook/react-vite";
import { color } from "../tokens/index";
import { AlarmBand } from "./AlarmBand";

/**
 * **What a non-reader must be able to do with this:** notice it, and understand that
 * pressing the light-coloured block is what makes it stop. The words are secondary; the
 * band's full-width dark fill and its single large control carry the meaning.
 *
 * 27-F11g is why this matters more than it looks: where paper is the only kitchen channel
 * there is no screen fallback, so a failed KOT means food is genuinely not being cooked and
 * NOBODY KNOWS. This band is the only signal in the building.
 */
const meta: Meta<typeof AlarmBand> = {
  title: "Shell/AlarmBand",
  component: AlarmBand,
  args: { onAcknowledge: () => {} },
};
export default meta;
type Story = StoryObj<typeof AlarmBand>;

/** The canonical case: 03-F5 print-retry exhaustion, raised on the HOST device. */
export const PrintFailure: Story = {
  args: {
    alarms: [
      { id: "1", message: "Kitchen printer is not responding", subject: "Order #412 · Grill" },
    ],
  },
};

/**
 * **Gap G13 closed here.** Six distinct S1 causes on one counter screen at 20:40 was
 * unbounded by both 21 §5 and 05-F4. One band shows — the oldest unacknowledged — and the
 * rest are a count, because a band that fills the screen has BECOME the screen, which is
 * exactly what 27-F11d forbids.
 */
export const ManyAtOnce: Story = {
  args: {
    alarms: [
      { id: "1", message: "Kitchen printer is not responding", subject: "Order #412 · Grill" },
      { id: "2", message: "Order is very late", subject: "Order #398 · 41 min" },
      { id: "3", message: "Cash drawer is short", subject: "Shift 2 · Rs 1,200" },
      { id: "4", message: "Receipt printer is out of paper", subject: "Counter 1" },
    ],
  },
};

/**
 * The band never takes the screen. 27-F11d, founder ruling: a half-built cart is never taken
 * away from a cashier with a customer waiting. 01-F17 says a sale is never blocked, and an
 * alarm that interrupts a transaction teaches staff to fear the screen — which is how
 * workarounds start. Deferring to a "safe moment" was also rejected: food is not being
 * cooked, so the delay IS the harm.
 */
export const OverTheWorkSurface: Story = {
  args: {
    alarms: [{ id: "1", message: "Kitchen printer is not responding", subject: "Order #412" }],
  },
  decorators: [
    (Story) => (
      <div style={{ border: `1px dashed ${color["borderColor-default"]}`, minHeight: 320 }}>
        <Story />
        <div style={{ padding: 16 }}>
          <p>
            <strong>The cart underneath stays visible and usable.</strong>
          </p>
          <p>2 × Chicken Karahi</p>
          <p>1 × Naan</p>
          <p>The cashier can still take this payment while the alarm repeats.</p>
        </div>
      </div>
    ),
  ],
};
