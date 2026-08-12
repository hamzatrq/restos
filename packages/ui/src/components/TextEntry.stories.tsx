import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextEntry } from "./TextEntry";

/**
 * **What a non-reader must be able to do with this: nothing, and still finish the task.**
 *
 * That is not a joke about the component — it is `27-F6`'s test verbatim (*"whether a non-typing
 * operator can complete the task by another route, not whether a keyboard appears anywhere"*), and
 * it is the reason this control exists as an **optional escape hatch** rather than as a step.
 * `02-F27`'s caller is filed with her number alone if nobody types a letter; a name and `06-F9`'s
 * free-text address are what the operator adds when she can, and `09-F10` reads that text off the
 * assigned order when a rider needs a door to knock on.
 *
 * The stories below vary the two things the component actually decides — the POSTURE and the
 * SCRIPT — because those are the two an implementation can get wrong while rendering perfectly.
 */
const meta: Meta<typeof TextEntry> = {
  title: "Entry/TextEntry",
  component: TextEntry,
  args: { posture: "counter", caption: "CALLER NAME", value: "", onChange: () => {} },
};
export default meta;
type Story = StoryObj<typeof TextEntry>;

/**
 * The resting state, and the one that has to be a **visible target with nothing in it**
 * (`27-F5`). An empty field carries no ink of its own, so the outline is the whole affordance —
 * which is why there is no placeholder standing in for the caption.
 */
export const Empty: Story = {};

/** A name, at the counter posture — `02-F27`'s *"inline customer creation"*, as typed. */
export const Filled: Story = { args: { value: "Hina Raza" } };

/**
 * `06-F9`'s **free text**, at the length a Pakistani delivery address actually is: a house, a
 * street, a block and a city. Short fixtures are how a field looks fine in a story and truncates
 * on the glass.
 */
export const Address: Story = {
  args: { caption: "ADDRESS", value: "House 12, Block C, Gulberg III, Lahore 54000" },
};

/**
 * **`00 §5.6` — user content is uncontrolled Unicode, and this is the story that proves it.**
 *
 * *"Customer-entered data … may contain Urdu script — every surface renders it faithfully …
 * User content is never transliterated or rejected for its script."* `03-F8` says no ESC/POS code
 * page can print this, which is a fact about PAPER: refusing it here would make the customer
 * unrecordable rather than the ticket unprintable.
 */
export const UrduAddress: Story = {
  args: { caption: "ADDRESS", value: "مکان نمبر ۱۲، گلبرگ، لاہور" },
};

/**
 * The mixed script that is the COMMON case rather than the exotic one — half Latin, half Urdu,
 * with Western digits (`27-F22`).
 */
export const MixedScript: Story = {
  args: { caption: "ADDRESS", value: "House 12, گلبرگ III, Lahore 54000" },
};

/**
 * `27-F8` — the posture is the only thing that sizes this control, so the posture is VARIED. A
 * field that took the prop and sized itself from a literal renders identically to this in every
 * single-posture story, which is `K-4`'s recorded survivor one component over.
 */
export const KitchenPosture: Story = { args: { posture: "kitchen", value: "Hina Raza" } };
