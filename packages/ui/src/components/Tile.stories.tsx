import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tile } from "./Tile";

/**
 * **What a non-reader must be able to do with this:** hit it. Every time, with a wet hand,
 * without hitting its neighbour.
 *
 * The posture is the whole design. There is no `size` prop and adding one would end the
 * closed vocabulary — see TOKENS.md.
 */
const meta: Meta<typeof Tile> = { title: "Primitives/Tile", component: Tile };
export default meta;
type Story = StoryObj<typeof Tile>;

/** 76 dp — standing at a fixed terminal (Colle & Hiszem, Ergonomics 2004). */
export const Counter: Story = { args: { posture: "counter", label: "Chicken Karahi" } };

/** 96 dp — the kitchen row, deliberately ABOVE the counter's. This is the surface where the
 * 21.34% wet-hand gesture error was measured (against 0.00% dry), read at 1–2 m. */
export const Kitchen: Story = { args: { posture: "kitchen", label: "READY" } };

/** 64 dp — one-handed thumb. Measured error at 9.6 mm is 2.8% and there is no significant
 * accuracy gain above it: past ~10 mm you are buying speed, not accuracy. */
export const Handheld: Story = { args: { posture: "handheld", label: "Table 6" } };

/**
 * 27-F4 — **a conditional surface is disabled IN PLACE, never absent.** An item that
 * vanishes when 86'd destroys the positional memory of every operator who learned the grid
 * with it there. Adding, removing or reordering a grid item is a breaking change.
 */
export const Unavailable: Story = {
  args: {
    posture: "counter",
    label: "Mutton Karahi",
    unavailable: true,
    unavailableReason: "86'd",
  },
};

/**
 * 27-F9 — destructive actions are never adjacent to high-frequency ones on any surface a wet
 * hand touches. Water becomes a hindrance within ~20 s and the sensed touch point physically
 * migrates toward the moisture, so proximity is not a stylistic concern here.
 */
export const Destructive: Story = {
  args: { posture: "counter", label: "VOID", destructive: true },
};

/** All postures together — the ladder is the point, not any single number. */
export const PostureLadder: Story = {
  args: { posture: "floor", label: "x" },
  decorators: [
    () => (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Tile posture="keypad" label="7" />
        <Tile posture="kitchen" label="READY" />
        <Tile posture="counter" label="Karahi" />
        <Tile posture="handheld" label="T6" />
        <Tile posture="floor" label="min" />
      </div>
    ),
  ],
};
