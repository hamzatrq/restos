import { paisa } from "@restos/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoneyValue } from "./MoneyValue";
import { Panel } from "./Panel";
import { Readout } from "./Readout";
import { Tile } from "./Tile";

/**
 * **What a non-reader must be able to do with this:** see that the controls inside one boundary
 * belong together, and that the controls outside it do not — before reading a single word.
 *
 * That is the whole claim, and it is the one `27 §2b` warns is a reasoned construction rather
 * than a measured one: the low-literacy corpus this product cites measures TEXT comprehension,
 * not grouping. What it does measure and this leans on is `27-F58`'s finding on paper — *"vertical
 * position encodes urgency; whitespace encodes grouping"* — and `27-F36`'s warning that
 * **2-D tabular semantics are a literacy-dependent skill**, which is exactly why a region is a
 * bounded box with one caption and never a column header over a matrix.
 *
 * Falsifiable on real staff per `27-F35`: show a cashier the Cash tab and ask her to pay a
 * supplier. If she reaches for `Receipt photo` before a reason, or for `Paid out` from outside the
 * region, the grouping did not carry.
 */
const meta: Meta<typeof Panel> = { title: "Primitives/Panel", component: Panel };
export default meta;
type Story = StoryObj<typeof Panel>;

/**
 * The ordinary case: a raised working surface holding controls, on the page's ground.
 *
 * `27-F66` — the boundary carries the region and the ~1.1:1 fill step is depth, not
 * perceivability. That is not a concession: the FR's exhaustive search found **14,196,198**
 * surface triples clearing a mutual 3:1 ladder and **zero** admitting any text colour that clears
 * 4.5:1 on all three, so a fill step that carried the region was never available to be chosen.
 */
export const Group: Story = {
  args: {
    title: "The day",
    children: (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Tile posture="counter" label="Open the day" onPress={() => {}} />
        <Tile posture="counter" label="Close the day" unavailable unavailableReason="no day open" />
      </div>
    ),
  },
};

/**
 * `27-F7` — *"a list's visual order MUST be its work order"*, and the `note` is how the operator
 * gets to SEE the rule rather than take it on trust. `03-F46` decides the rule for a queue
 * ("page 1 always holds the oldest"); this says so on the glass.
 */
export const WithTheOrderingRule: Story = {
  args: {
    title: "Open orders",
    note: "oldest first",
    elevation: "sunken",
    children: (
      <Readout caption="TOTAL">{<MoneyValue paisa={paisa(487500)} size="primary" />}</Readout>
    ),
  },
};

/**
 * `27-F14`'s amber slot — *"abnormal — attention required"* — claimed for a REGION.
 *
 * The fill is on the caption and never on the body, so the money inside is still uncoloured
 * (`27-F16`: colour on a number means *this number* is abnormal, and here it is the bucket that
 * is abnormal, not the rupees in it). The caption carries a WORD, because `27-F12` forbids colour
 * alone, and it carries its own outline, because `27-F64` relieves a status fill of SC 1.4.11
 * *on the outline's account*.
 *
 * The live claimant is `02-F43`'s named failure: petty cash that leaves the drawer "accounted for
 * in no shift, no day, and no anomaly — money vanishing from `02-F23`'s expected cash and
 * `02-F24`'s day close **with nothing to point at**."
 */
export const Abnormal: Story = {
  args: {
    title: "Not accounted for",
    tone: "abnormal",
    children: (
      <Readout caption="PAID OUT WITH NO SHIFT OPEN">
        {<MoneyValue paisa={paisa(15000)} size="hero" />}
      </Readout>
    ),
  },
};
