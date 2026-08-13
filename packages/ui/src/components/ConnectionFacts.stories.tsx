import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionFacts } from "./ConnectionFacts";

/**
 * **What a non-reader must be able to do with this:** ideally, ignore it. It should be quiet
 * in the normal case and only ever draw the eye when something the operator can act on has
 * actually broken.
 *
 * That is why there are three facts and not one dot — see `Normal` below, which is the state
 * a single indicator gets wrong.
 */
const meta: Meta<typeof ConnectionFacts> = {
  title: "Shell/ConnectionFacts",
  component: ConnectionFacts,
};
export default meta;
type Story = StoryObj<typeof ConnectionFacts>;

/**
 * **The state that justifies the whole component.** LAN up, hub healthy, no WAN — a
 * Pakistani restaurant on a bad day, which is most days. `00 §5.1` says no in-branch feature
 * may require WAN and `01-F17` says a sale is never blocked, so nothing here is wrong.
 *
 * A single "online" dot would have to render this either green (a lie about the cloud) or
 * red (an alarm about a condition the operator can neither fix nor needs to). Both teach
 * staff to ignore the indicator, and an indicator staff ignore is worse than none.
 */
export const Normal: Story = { args: { lan: "ok", hub: "ok", cloud: "down" } };

/** Everything reachable — worth showing so the muted cloud chip above reads as deliberate. */
export const FullyConnected: Story = { args: { lan: "ok", hub: "ok", cloud: "ok" } };

/**
 * The hub is unreachable — this one IS a fault. The branch has lost its ordering authority,
 * so a re-election is in progress (01-F13) and the operator should expect a pause.
 */
export const HubLost: Story = { args: { lan: "ok", hub: "down", cloud: "ok" } };

/** A congested LAN. Abnormal, not fault: work continues, it is just slower than 01-F15 wants. */
export const Degraded: Story = { args: { lan: "degraded", hub: "ok", cloud: "down" } };

/**
 * 27-F13 — **if it is unreadable in greyscale it is broken.** The words OK/SLOW/OFF and the
 * chip silhouettes carry the whole state, which is also the 27-F18 answer: colour is the
 * THIRD channel on our hardware, after position and text, never the first. Uncalibrated
 * panels run 41–282 cd/m² against a nominal 80, and ambient contrast falls 86:1 → 1.3:1 at
 * 500 lux.
 */
export const Greyscale: Story = {
  args: { lan: "ok", hub: "down", cloud: "down" },
  decorators: [
    (Story) => (
      <div style={{ filter: "grayscale(1)" }}>
        <Story />
      </div>
    ),
  ],
};
