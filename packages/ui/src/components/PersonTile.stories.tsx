import type { Meta, StoryObj } from "@storybook/react-vite";
import { PersonTile } from "./PersonTile";

/**
 * **What a non-reader must be able to do with this:** find their own card, by shape and position,
 * and hit it without aiming.
 *
 * `01-F61` makes identification a first-class act performed 20–60× a shift, and it had no
 * vocabulary item: the unlock gate drew it as `Tile posture="counter"`, which is `27-F8`'s **12
 * mm** menu-grid MINIMUM being spent as the design for the screen that gates every other. A
 * founder looked at the result and asked *"why a colour-less screen with just 3 names?"* — the
 * greyscale was never the problem (`27-F13`, `27-F16`), a floor being used as a layout was.
 *
 * The role beneath the name is real data with a real consequence: `02-F22` means a cashier cannot
 * open the day, and until this shipped the only way to learn that was to be refused. It
 * **authorizes nothing** (`18 §5`) — every write is gated in main against the registry.
 */
const meta: Meta<typeof PersonTile> = { title: "Primitives/PersonTile", component: PersonTile };
export default meta;
type Story = StoryObj<typeof PersonTile>;

/** The ordinary case: a cashier on `27 §1a`'s counter panel. */
export const Cashier: Story = { args: { name: "Ayesha Khan", staffRole: "cashier" } };

/**
 * **The registry string is formatted HERE, not by the host** — `branch_manager` is not a word,
 * and two hosts formatting it (the unlock door and `02-F20`'s approver grid) is two hosts that
 * can format it differently. A transform rather than a lookup table, so a role `domain` gains
 * later degrades honestly instead of rendering nothing (`01-F54`).
 */
export const BranchManager: Story = { args: { name: "Hina Raza", staffRole: "branch_manager" } };

/**
 * **No role renders no role line — never a guess and never a placeholder.**
 *
 * `main/authorize.ts` narrows a registry string to a matrix column and returns nothing for a role
 * this product does not carry; reference data (`01-F21`) may legitimately name anything. A
 * guessed "Cashier" here would be a false claim about a person's authority, and commandment 2
 * says a placeholder that looks like data is worse than an absence.
 */
export const NoRole: Story = { args: { name: "Bilal Ahmed" } };

/**
 * **A name that wraps, which is the case that decided the alignment.**
 *
 * The first draft was bottom-aligned to put the names on a common baseline; it does the opposite
 * the moment one name takes two lines, pushing that card's role caption 51 dp out of line with
 * its siblings'. A name is Unicode user content of unbounded length (`00 §5.6`), so a layout that
 * only aligns while nothing wraps aligns by luck. Top-aligned, and the row's own `stretch`
 * equalises the heights.
 */
export const LongName: Story = {
  args: { name: "Muhammad Abdul Rehman Qureshi", staffRole: "branch_manager" },
};

/**
 * `00 §5.6` — the UI is English and the user content is Unicode, rendered faithfully. The name is
 * never transformed; only the role string is, and only because it is an identifier this product
 * minted rather than a person's name.
 */
export const UnicodeName: Story = { args: { name: "عائشة خان", staffRole: "cashier" } };
