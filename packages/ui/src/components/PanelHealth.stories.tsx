import type { Meta, StoryObj } from "@storybook/react-vite";
import { PanelHealth } from "./PanelHealth";

/**
 * **What a non-reader must be able to do with this:** notice that something on the strip has gone
 * amber, see that it is about the SCREEN rather than about the network or the menu, and hand the
 * till to somebody who reads. A cashier cannot make a screen bigger; the act this surface exists
 * to produce is *tell the owner the till is on the wrong laptop*.
 *
 * So the measurement is the payload. `221 × 130 mm` against the layout's `215 × 134 mm` is the one
 * fact that tells whoever is called what to buy, and it is a fact nothing else on the device
 * reports.
 *
 * **This chip is the price of a founder ruling.** RestOS is bring-your-own-hardware, so the
 * counter window's floor stopped refusing an undersized screen and started clamping to it — the
 * till opens on a laptop the counter layout does not fit. That is the right trade and it is only
 * honest if the shortfall is said out loud (`00 §5.7`). Delete this component and the product
 * silently loses controls off the edges of its surfaces instead.
 *
 * `27-F16` is why `Healthy` renders nothing at all rather than a green tick — see below.
 */
const meta: Meta<typeof PanelHealth> = {
  title: "Shell/PanelHealth",
  component: PanelHealth,
};
export default meta;
type Story = StoryObj<typeof PanelHealth>;

/**
 * **The measured shortfall.** 1024×600 on 10.1″ glass — a real netbook, and a real thing a
 * restaurant already owns. Measured in a real Blink layout: two surfaces clip, and on Cash under
 * `03-F5`'s band the `COUNTED Rs 0` echo goes off the bottom, so a cashier counts the drawer
 * blind.
 *
 * Nothing here is broken in the ledger sense, which is why it is amber and not red (`27-F14`'s
 * claimant list is closed and a small screen is not on it): `01-F17` says the sale is never
 * blocked, and `01-F53` captured the price into the event at line-add, so the till still bills
 * correctly on every tile it can show.
 */
export const TooSmall: Story = {
  args: {
    notice: {
      reason: "too_small",
      glass: "221 × 130 mm",
      message:
        "this screen is shorter than the counter layout needs — it measures 221 × 130 mm of " +
        "glass and the layout needs 215 × 134 mm. Controls at the edge of a surface are cut " +
        "off. Prices and the ledger are unaffected; a bigger screen is the fix.",
    },
  },
};

/**
 * **The worse of the two, and the one a green screen hides.** The OS reported no physical size, so
 * `27 §1a`'s 15.6″ counter is assumed — on a 10.1″ tablet that is ~100 PPI against ~224 of real
 * glass, and every `27-F8` target renders at about **45% of its ergonomic size while nothing looks
 * wrong.** A 20 mm keypad key at 9 mm is a mis-tap on the highest-consequence entry surface in the
 * product.
 *
 * It **outranks** `TooSmall` deliberately: a floor verdict computed from a guessed density is
 * itself a guess, and reporting "4 mm too short" as a measurement when the millimetre was assumed
 * is `00 §5.7` broken by the mechanism built to satisfy it.
 */
export const Unmeasured: Story = {
  args: {
    notice: {
      reason: "unmeasured",
      glass: "not measured",
      message:
        "this till could not read its own screen size from the operating system, so every touch " +
        "target on it is drawn from an assumption — 27 §1a's 15.6\" counter panel. Set panel_ppi " +
        "for this device to correct it.",
    },
  },
};

/**
 * **`27-F16` — colour on the base case spends the whole preattentive channel on the thing that is
 * always true.** Nearly every till in the fleet is on a screen that fits, every shift, so a
 * clearing panel gets **no chip** — not a green one, not a muted one. A permanent `Screen OK` is
 * what would make the amber one invisible.
 *
 * This story renders empty on purpose. `ConnectionFacts` learned the same lesson the expensive
 * way: two permanent red blocks across the top of every screen, all shift.
 */
export const Healthy: Story = { args: { notice: null } };

/**
 * `27-F13` — **if it is unreadable in greyscale it is broken.** The word `TOO SMALL`, the
 * millimetre figure and the soft-cornered silhouette carry the entire state with the hue removed,
 * which is `27-F18`'s answer too: on our panels colour is the THIRD channel, after position and
 * text, never the first.
 */
export const Greyscale: Story = {
  args: {
    notice: {
      reason: "too_small",
      glass: "221 × 130 mm",
      message: "this screen is shorter than the counter layout needs — a bigger screen is the fix.",
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
