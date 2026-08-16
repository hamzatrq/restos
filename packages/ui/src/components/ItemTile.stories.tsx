import { paisa } from "@restos/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ItemTile } from "./ItemTile";

/**
 * **What a non-reader must be able to do with this:** pick the right dish and know what it costs,
 * without reading the dish's name — from the photograph where one exists, from the category tint
 * and the initial where it does not, and from the price in every case.
 *
 * That claim is testable and it is what `27-F35`'s ≥85% post-training comprehension gate will be
 * run against. It is **not yet verified on staff**, and the price half is the part most likely to
 * fail it: `27-F24` measures ~60% of rural Class 1 recognising numbers against 9.5% who can do any
 * arithmetic, so a cashier may read `Rs 450` and still not compare it to `Rs 550`. The tile's job
 * is to present the finished number, never to require one to be worked out.
 *
 * **The defect these stories exist to prevent is documented:** the shipped counter rendered 36
 * tiles with no price on any of them for the whole of Wave 1, and it passed every suite in the
 * package, because nothing asserted a price that was never there. `27-F69` is the FR that closed
 * it and every story below carries one.
 */
const meta: Meta<typeof ItemTile> = {
  title: "Counter/ItemTile",
  component: ItemTile,
  args: { posture: "counter", name: "Mutton Biryani", paisa: paisa(55000), category: "rice" },
};
export default meta;
type Story = StoryObj<typeof ItemTile>;

/** `27-F70` (a) — the restaurant photographed this dish. */
export const Photographed: Story = {
  args: { photo: "https://example.invalid/biryani.jpg", coverage: "full" },
};

/**
 * `27-F70` (b) — no photograph, so the plate is tinted by category and carries the item's own
 * initial. **Never an empty box and never a stock photograph of another kitchen's food**: an owner
 * proud of his biryani reads a generic one as cheap, and it is a claim about a dish that is false.
 */
export const Lettered: Story = { args: { coverage: "partial" } };

/**
 * `27-F70` (c) — a menu with no photography at all. The plate goes **entirely**, the row collapses,
 * and the category rule down the left edge is the only identity signal left. A menu with nothing
 * to show shows more menu: this is what lets `27-F72` raise the density.
 */
export const NoPhotography: Story = { args: { coverage: "none" } };

/**
 * `27-F75` + `02-F52` — the slot is `abnormal` and the word is **`Sold out`**, never `86`. The
 * weight comes from a solid fill, because a soft tint is exactly what made amber read as weak on
 * the screen this replaces.
 *
 * **It still sells.** `01-F17` forbids the platform withholding a sale on availability and
 * `01-F59` says the counter may sell it deliberately, so there is no `disabled` attribute here —
 * the tile is flagged and struck and the decision stays with the cashier.
 */
export const SoldOut: Story = { args: { soldOut: true, coverage: "partial" } };

/** The case an implementation forgets: sold out **and** photographed, which must still sell. */
export const SoldOutPhotographed: Story = {
  args: { soldOut: true, photo: "https://example.invalid/biryani.jpg", coverage: "full" },
};

/**
 * `27-F69` / `01-F60` — an unknown price is **stated as unknown** and the tile refuses the sale.
 * It is never rendered blank and never as zero, because selling at a guessed number is worse than
 * not selling and there is no fallback house price to fall back to.
 */
export const PriceUnknown: Story = { args: { paisa: null, coverage: "partial" } };

/**
 * …and the case that must stay distinguishable from it: a genuinely **free** item, which renders
 * `Rs 0` and sells. `01-F60` requires a free modifier to carry an explicit zero, and any rule that
 * collapses null and zero lets an unpriced entry through as free.
 */
export const Free: Story = { args: { paisa: paisa(0), name: "Extra Raita", category: "sides" } };

/**
 * `27-F8` — the floor is a POSTURE, and the same tile on a kitchen surface is larger because the
 * hands are wet and the reading distance is longer. There is deliberately no `size` prop: the
 * number moves when the evidence does.
 */
export const KitchenPosture: Story = { args: { posture: "kitchen", coverage: "partial" } };

/**
 * `27-F13` — design achromatically first: if a screen is unreadable in greyscale it is broken.
 * This story is the proof for the identity palette specifically, and it is the one most likely to
 * expose a real defect, because `27-F74` spends hue on wayfinding and hue is the first thing to go.
 * The tile must still resolve: the initial, the category **word** and the price all survive
 * desaturation, which is exactly why `27-F74` (b) requires the word.
 */
export const Achromatic: Story = {
  args: { coverage: "partial" },
  decorators: [
    (Story) => (
      <div style={{ filter: "grayscale(1)" }}>
        <Story />
      </div>
    ),
  ],
};
