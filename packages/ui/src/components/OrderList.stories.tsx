import { paisa } from "@restos/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrderList, type OrderRow } from "./OrderList";

/**
 * **What a non-reader must be able to do with this:** point at the order the customer is
 * asking about, and — where the list carries an action — accept the one at the top without
 * being told which one is oldest.
 *
 * The claim rests on three things a non-reader can use: the reference is the largest thing in
 * the row and is the number the customer quotes back; the list is strictly oldest-first, so
 * "the top one" is always the answer to "which is next"; and the action, when present, is one
 * tile in one fixed position on every row. `27-F35`'s >=85% comprehension gate is what will
 * falsify this on real staff — it is reasoned, not measured (`27 §2b`).
 */
const meta: Meta<typeof OrderList> = { title: "Counter/OrderList", component: OrderList };
export default meta;
type Story = StoryObj<typeof OrderList>;

const row = (over: Partial<OrderRow> & { order_id: string }): OrderRow => ({
  reference: over.order_id.slice(0, 8),
  channel: "counter",
  orderType: "dine_in",
  totalPaisa: paisa(125_000),
  lineCount: 3,
  ...over,
});

/** A counter's ordinary open list — read-only recall (`02-F10`). No action on the rows. */
export const OpenOrders: Story = {
  args: {
    orders: [
      row({ order_id: "a1b2c3d4", totalPaisa: paisa(48_000), lineCount: 2 }),
      row({ order_id: "e5f6a7b8", orderType: "takeaway", totalPaisa: paisa(129_500) }),
      row({ order_id: "c9d0e1f2", orderType: "delivery", channel: "phone", lineCount: 7 }),
    ],
    heightMm: 120,
    page: 0,
    onPageChange: () => {},
    empty: "No open orders.",
  },
};

/**
 * `02-F9`'s cloud inbox — the one surface on this list that carries an action, and it is
 * **one tap** exactly as that FR states. Never a modal: `27-F11d` forbids interrupting a
 * half-built cart, so this is reachable on the Orders tab and announced by a badge.
 */
export const CloudInbox: Story = {
  args: {
    orders: [
      row({ order_id: "11112222", channel: "storefront", orderType: "delivery" }),
      row({ order_id: "33334444", channel: "whatsapp", orderType: "takeaway" }),
    ],
    heightMm: 120,
    page: 0,
    onPageChange: () => {},
    action: { label: "Accept", onAct: () => {} },
    empty: "No new orders from the website or WhatsApp.",
  },
};

/**
 * **The resting state, and it is a first-class story** (`00 §5.7`). An empty list that drew
 * nothing would be indistinguishable from one that failed to load. The tab stays in the rail
 * holding this sentence rather than disappearing, which is `27-F4`.
 */
export const Empty: Story = {
  args: {
    orders: [],
    heightMm: 120,
    page: 0,
    onPageChange: () => {},
    empty: "No open orders.",
  },
};

/**
 * `03-F46` — the list PAGES, it never scrolls, and **page 1 always holds the oldest**. Later
 * pages exist for situational awareness (how much is queued), never to reach work. Paging
 * inside one flat list is lateral and spends nothing from `27-F1`'s depth budget.
 */
export const Paged: Story = {
  args: {
    orders: Array.from({ length: 9 }, (_, i) =>
      row({ order_id: `order-${String(i).padStart(4, "0")}`, totalPaisa: paisa(10_000 * (i + 1)) }),
    ),
    heightMm: 60,
    page: 0,
    onPageChange: () => {},
    empty: "No open orders.",
  },
};
