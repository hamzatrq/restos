import type { Meta, StoryObj } from "@storybook/react-vite";
import { CatalogHealth } from "./CatalogHealth";

/**
 * **What a non-reader must be able to do with this:** notice that the shape and colour beside the
 * link chips have changed, and hand the till to somebody who reads. That is the whole job. A
 * cashier cannot fix a sync fault; the act this surface is designed to produce is *fetch a
 * manager*, and the manager's act is *read this line down a phone*.
 *
 * So the number is the payload. `still showing v4` is the one fact that tells whoever is called
 * whether the till is one menu behind or forty, and it is the fact nothing else on the device
 * reports.
 *
 * `27-F16` is why `Healthy` renders nothing at all rather than a green tick — see below.
 */
const meta: Meta<typeof CatalogHealth> = {
  title: "Shell/CatalogHealth",
  component: CatalogHealth,
};
export default meta;
type Story = StoryObj<typeof CatalogHealth>;

/**
 * **The state that justifies the component**, and the one a reachability indicator gets exactly
 * backwards: the cloud is reachable, the till is talking to it, and the menu it was sent has been
 * REFUSED (`01-F56` — a delta whose base does not match). Every link chip on this strip is
 * healthy while the grid is frozen.
 */
export const RefusedDelta: Story = {
  args: {
    refusal: {
      version: 4,
      message: "this till refused the update it was sent — it needs a full menu, not a change list",
    },
  },
};

/**
 * The server stopped paging part-way through a fetch (`no_progress`). Different cause, different
 * sentence, same severity — and the version still says which menu is being sold from.
 */
export const StoppedPartWay: Story = {
  args: {
    refusal: {
      version: 12,
      message: "the cloud stopped sending the menu part-way through",
    },
  },
};

/**
 * **`27-F16` — money is never coloured by default, and neither is the base case.** *"Colour on a
 * number means this number is abnormal. Colouring the commonest number on screen spends the whole
 * preattentive channel on the base case."* A healthy catalog is the commonest state on every till
 * in the fleet, every shift, so it gets **no chip** — not a green one, not a muted one.
 *
 * This story renders empty on purpose. `ConnectionFacts` learned the same lesson the expensive
 * way: two permanent red blocks across the top of every screen, all shift, until `27-F14`'s
 * allocation was read as the closed list it is.
 */
export const Healthy: Story = { args: { refusal: null } };

/**
 * `27-F13` — **if it is unreadable in greyscale it is broken.** The word `NOT UPDATING`, the
 * version number and the soft-cornered silhouette carry the entire state with the hue removed,
 * which is `27-F18`'s answer too: on our panels colour is the THIRD channel, after position and
 * text, never the first.
 */
export const Greyscale: Story = {
  args: {
    refusal: {
      version: 4,
      message: "this till refused the update it was sent — it needs a full menu, not a change list",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ filter: "grayscale(1)" }}>
        <Story />
      </div>
    ),
  ],
};
