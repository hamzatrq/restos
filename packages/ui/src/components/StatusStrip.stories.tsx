import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatusStrip } from "./StatusStrip";

/**
 * **What a non-reader must be able to do with this:** nothing, most of the time — and that
 * is the design goal, not a shortfall. The strip earns its place by being quiet.
 *
 * It carries four things and refuses a fifth: who is acting, what the device can reach, which
 * business day it is, and the S1 band. A status strip that accumulates content becomes a
 * dashboard, and a dashboard on an operational screen is read by nobody.
 */
const meta: Meta<typeof StatusStrip> = { title: "Shell/StatusStrip", component: StatusStrip };
export default meta;
type Story = StoryObj<typeof StatusStrip>;

const BASE = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-07-25",
  alarms: [],
  onAcknowledgeAlarm: () => {},
};

/** The ordinary shift: LAN and hub healthy, no WAN, nothing wrong. */
export const Quiet: Story = {
  args: { ...BASE, lan: "ok", hub: "ok", cloud: "down" },
};

/**
 * **The business day is shown because it is not the calendar date.** `01-F46` puts the
 * Asia/Karachi cutover at 05:00, so a cashier closing out at 02:00 is still on the previous
 * day's drawer — and if the strip showed "today" she would reconcile against the wrong one.
 */
export const AfterMidnight: Story = {
  args: { ...BASE, lan: "ok", hub: "ok", cloud: "ok", businessDay: "2026-07-25 (until 05:00)" },
};

/**
 * `27-F11d` in its natural habitat: the band appears **inside the strip**, above the work,
 * and the work stays usable. `03-F5` requires the alert repeat until acknowledged; `01-F17`
 * requires the sale not be blocked. Both hold at once only because it is a band.
 */
export const WithAlarm: Story = {
  args: {
    ...BASE,
    lan: "ok",
    hub: "ok",
    cloud: "down",
    alarms: [
      { id: "1", message: "Kitchen printer is not responding", subject: "Order #412 · Grill" },
    ],
  },
};

/**
 * Gap G13's answer. Six causes at 20:40 is a real Friday, and it was unbounded by both
 * `21 §5` and `05-F4`. One band, oldest first, with a count — because six bands would have
 * become the screen.
 */
export const ManyAlarms: Story = {
  args: {
    ...BASE,
    lan: "degraded",
    hub: "ok",
    cloud: "down",
    alarms: [
      { id: "1", message: "Kitchen printer is not responding", subject: "Order #412 · Grill" },
      { id: "2", message: "Order is very late", subject: "Order #398 · 41 min" },
      { id: "3", message: "Cash drawer is short", subject: "Shift 2 · Rs 1,200" },
    ],
  },
};
