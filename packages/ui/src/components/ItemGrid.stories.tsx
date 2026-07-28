import type { Meta, StoryObj } from "@storybook/react-vite";
import { ItemGrid } from "./ItemGrid";

/**
 * **What a non-reader must be able to do with this:** find a dish by where it lives, not by
 * reading its name — and reach every dish without scrolling and without typing.
 *
 * Two laws collide here and both must hold. `27-F2` bans scrolling to reach a primary
 * action, and `27-F6` bans *requiring* non-numeric typing. Together they mean **the grid
 * must be complete**: search is an escape hatch (`21 §5`), and an escape hatch is only
 * optional if everything sellable is reachable by tile.
 */
const meta: Meta<typeof ItemGrid> = { title: "Composites/ItemGrid", component: ItemGrid };
export default meta;
type Story = StoryObj<typeof ItemGrid>;

const DISHES = [
  "Chicken Karahi",
  "Mutton Karahi",
  "Chicken Handi",
  "Seekh Kebab",
  "Chapli Kebab",
  "Malai Boti",
  "Chicken Tikka",
  "Beef Nihari",
  "Haleem",
  "Chicken Biryani",
  "Beef Biryani",
  "Mutton Pulao",
  "Daal Chawal",
  "Naan",
  "Roghni Naan",
  "Garlic Naan",
  "Tandoori Roti",
  "Paratha",
  "Raita",
  "Salad",
  "Kheer",
  "Gulab Jamun",
  "Soft Drink",
  "Mineral Water",
  "Green Tea",
].map((label, i) => ({ id: `d${i}`, label }));

/**
 * The 15.6″ counter. `27-F11a` puts ~88 tiles on this surface — the founder's hardware
 * answer is what dissolved conflict C8, where this project had transplanted a **phone**
 * finding ("6 items per page") onto every screen in the product.
 */
export const CounterTerminal: Story = {
  args: {
    items: DISHES,
    posture: "counter",
    widthMm: 212.6,
    heightMm: 111.7,
    ppi: 141,
    tileMm: 19.5,
    page: 0,
    onPageChange: () => {},
    onSelect: () => {},
  },
};

/**
 * The same 25 dishes on a waiter's phone. **The item list did not change; the page size
 * did.** That is what "capacity is derived from the surface" means, and it is why there is
 * no `itemsPerPage` prop for a caller to hardcode.
 */
export const WaiterPhone: Story = {
  args: {
    items: DISHES,
    posture: "handheld",
    widthMm: 64.9,
    heightMm: 93.7,
    ppi: 141,
    tileMm: 19.5,
    page: 0,
    onPageChange: () => {},
    onSelect: () => {},
  },
};

/**
 * 27-F4 — an 86'd item stays in its slot, greyed, with the reason. It does NOT vanish: the
 * grid is positional memory and a hole that closes up moves every dish after it.
 *
 * `02-F7`/`01-F22` own the availability state; this is only how it renders.
 */
export const WithUnavailableItems: Story = {
  args: {
    items: DISHES.map((d, i) =>
      i === 1 || i === 7 ? { ...d, unavailable: true, unavailableReason: "86'd" } : d,
    ),
    posture: "counter",
    widthMm: 212.6,
    heightMm: 111.7,
    ppi: 141,
    tileMm: 19.5,
    page: 0,
    onPageChange: () => {},
    onSelect: () => {},
  },
};

/**
 * A 300-item menu, which is the real T3 case. Note what is NOT here: no scrollbar, no
 * category drill-down, no "More" menu. Pages are lateral movement and cost nothing against
 * `27-F1`'s depth budget — and a page number is somewhere an operator can learn a dish lives
 * ("chapli kebab is on page 3"), which a scroll position never is.
 */
export const LargeMenu: Story = {
  args: {
    items: Array.from({ length: 300 }, (_, i) => ({ id: `x${i}`, label: `Item ${i + 1}` })),
    posture: "counter",
    widthMm: 212.6,
    heightMm: 111.7,
    ppi: 141,
    tileMm: 19.5,
    page: 0,
    onPageChange: () => {},
    onSelect: () => {},
  },
};
