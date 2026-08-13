import { paisa } from "@restos/domain";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { color } from "../tokens/index";
import { AppShell } from "./AppShell";
import { Cart } from "./Cart";
import { ItemGrid } from "./ItemGrid";
import { TicketCard } from "./TicketCard";

/**
 * **The whole counter screen, assembled.** This is what `plans/wave-1/screen-map.md` §3.1
 * describes, built only from the closed vocabulary — no raw primitives, no arbitrary values.
 *
 * It exists to prove the vocabulary composes into a real screen at the founder's reference
 * hardware (15.6″ counter terminal), and to be the thing shown to actual staff when
 * `27-F35`'s comprehension gate runs.
 */
const meta: Meta<typeof AppShell> = { title: "Shell/AppShell", component: AppShell };
export default meta;
type Story = StoryObj<typeof AppShell>;

const TABS = [
  { id: "order", label: "Order" },
  { id: "orders", label: "Orders" },
  { id: "pay", label: "Pay" },
  { id: "cash", label: "Cash" },
  { id: "me", label: "Me" },
];

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
].map((label, i) => ({ id: `d${i}`, label }));

const CART = [
  { id: "1", quantity: 2, name: "Chicken Karahi", modifiers: ["Medium spice"] },
  { id: "2", quantity: 4, name: "Naan" },
];

const BASE = {
  actor: "Ayesha",
  deviceLabel: "Counter 1",
  businessDay: "2026-07-25",
  lan: "ok" as const,
  hub: "ok" as const,
  cloud: "down" as const,
  alarms: [],
  onAcknowledgeAlarm: () => {},
  tabs: TABS,
  activeTabId: "order",
  onSelectTab: () => {},
};

const CounterScreen = ({ training = false }: { training?: boolean }) => {
  const [tab, setTab] = useState("order");
  return (
    <div style={{ width: 1366, height: 768, border: `1px solid ${color["borderColor-default"]}` }}>
      <AppShell
        {...BASE}
        activeTabId={tab}
        onSelectTab={setTab}
        training={training}
        onExitTraining={training ? () => {} : undefined}
      >
        <div style={{ display: "flex", gap: 16, height: "100%" }}>
          <ItemGrid
            items={DISHES}
            posture="counter"
            widthMm={158.5}
            heightMm={93.7}
            ppi={141}
            tileMm={19.5}
            page={0}
            onPageChange={() => {}}
            onSelect={() => {}}
          />
          {/* 27-F5 — the cart is ALWAYS here, never collapsed, never a separate screen. It is
              the cashier's working memory on a counter where she is interrupted by design. */}
          <Cart
            lines={CART}
            totalPaisa={paisa(248000)}
            onRemove={() => {}}
            page={0}
            onPageChange={() => {}}
          />
        </div>
      </AppShell>
    </div>
  );
};

/**
 * The default surface at 1366×768 — the resolution a 15.6″ counter terminal actually ships
 * at in this market. Note what the chrome does NOT contain: no breadcrumb, no back button,
 * no hamburger, no settings gear. Depth is one, so there is nowhere to be lost.
 */
export const CounterTerminal: Story = { args: BASE, render: () => <CounterScreen /> };

/**
 * `27-F63` / `DEC-TRAIN-001`. **The most expensive chrome in the system, on purpose.**
 *
 * A badge would not be enough. The failure this prevents is a member of staff forgetting
 * which mode they are in — rehearsing an order that never gets cooked, or treating a real
 * order as practice. Both are worse than having no training mode at all, which is why the
 * band states the consequence in words rather than just naming the mode.
 *
 * It is achromatic: the `27-F14` budget has no training slot, and inventing one would blunt
 * amber and red on every other screen. The tint lives on the SHELL, so it cannot be
 * navigated away from — and under `01-F49` this state is not a flag at all but a device
 * bound to a training branch, so the screen cannot lie about it.
 */
export const TrainingMode: Story = { args: BASE, render: () => <CounterScreen training /> };

/**
 * `27-F11d` in situ. The band appears, the cart underneath **stays visible and usable**, and
 * the cashier can still take this payment. `01-F17` says a sale is never blocked; `03-F5`
 * says a print failure must not be silent. Both hold at once only because it is a band.
 */
export const WithS1Alarm: Story = {
  args: BASE,
  render: () => {
    const [tab, setTab] = useState("order");
    return (
      <div
        style={{ width: 1366, height: 768, border: `1px solid ${color["borderColor-default"]}` }}
      >
        <AppShell
          {...BASE}
          activeTabId={tab}
          onSelectTab={setTab}
          alarms={[
            {
              id: "1",
              message: "Kitchen printer is not responding",
              subject: "Order #412 · Grill",
            },
          ]}
        >
          <div style={{ display: "flex", gap: 16 }}>
            <ItemGrid
              items={DISHES}
              posture="counter"
              widthMm={158.5}
              heightMm={79.3}
              ppi={141}
              tileMm={19.5}
              page={0}
              onPageChange={() => {}}
              onSelect={() => {}}
            />
            <Cart
              lines={CART}
              totalPaisa={paisa(248000)}
              onRemove={() => {}}
              page={0}
              onPageChange={() => {}}
            />
          </div>
        </AppShell>
      </div>
    );
  },
};

/**
 * The 22″ pass panel (`27-F11f`), for contrast with the counter. **One surface, so the rail
 * holds a single tab** — a cook glancing for one second cannot navigate. Page 1 always holds
 * the oldest ticket (`03-F46`), so the work is always here.
 *
 * And for most deployments this screen does not exist at all: `27-F11e` makes paper primary.
 */
export const PassPanel: Story = {
  args: BASE,
  render: () => {
    const lines = [
      { id: "1", quantity: 2, name: "Chicken Karahi", modifiers: ["Medium spice"] },
      { id: "2", quantity: 1, name: "Beef Burger", removals: ["ONION"] },
    ];
    return (
      <div
        style={{ width: 1366, height: 768, border: `1px solid ${color["borderColor-default"]}` }}
      >
        <AppShell
          {...BASE}
          actor="Kitchen"
          deviceLabel="Pass · 22″"
          tabs={[{ id: "queue", label: "Queue" }]}
          activeTabId="queue"
        >
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <TicketCard
              reference="#398"
              minutes={27}
              amberAt={10}
              redAt={20}
              lines={lines}
              onBump={() => {}}
            />
            <TicketCard
              reference="#405"
              minutes={13}
              amberAt={10}
              redAt={20}
              lines={lines}
              onBump={() => {}}
            />
            <TicketCard
              reference="#412"
              minutes={3}
              amberAt={10}
              redAt={20}
              lines={lines}
              onBump={() => {}}
            />
          </div>
        </AppShell>
      </div>
    );
  },
};
