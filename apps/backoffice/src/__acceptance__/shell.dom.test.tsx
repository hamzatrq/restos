/**
 * B-5's shell, B-7's history and `14-F28`'s pending queue, asserted through the shipped components.
 *
 * The three claims that carry FR weight and would each be silently false if the wiring were wrong:
 *   - a session is the SERVER's answer, so an unauthorised `whoami` shows the sign-in and nothing
 *     else (Commandment 8 seen from the client);
 *   - a pending day-end edit is visible AND cancellable until it lands (`14-F28`);
 *   - the change history is browsable IN PLACE — this entity's records, not the org's log (`14-F3`).
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthGate } from "../components/auth-gate";
import { ChangeHistory } from "../components/change-history";
import { PendingEdits } from "../components/pending-edits";
import { type CallLog, type Handlers, Harness, unauthorized } from "./harness";

afterEach(cleanup);

const mount = (handlers: Handlers, node: React.ReactNode): CallLog => {
  const log: CallLog = [];
  render(
    <Harness log={log} handlers={handlers}>
      {node}
    </Harness>,
  );
  return log;
};

/** 2 Jul 2026, 09:30 in Asia/Karachi — `14-F3`'s own *"2 Jul"*, as an instant. */
const JUL_2_0930_PKT = Date.parse("2026-07-02T09:30:00+05:00");
/**
 * 3 Jul 2026, 02:15 in Asia/Karachi — **before the `01-F46` cutover**, so its BUSINESS day is
 * 2 Jul and its calendar date is 3 Jul. The two answers differ, which is the only reason this
 * fixture exists: see the business-day test below.
 */
const JUL_3_0215_PKT = Date.parse("2026-07-03T02:15:00+05:00");

type PriceChange = {
  branch_id: string;
  channel: "counter" | "storefront";
  before_paisa: number | null;
  after_paisa: number | null;
};

const record = (
  entity: string,
  entity_id: string,
  version: number,
  before_ref: string | null,
  actor_user_id: string | null,
  extra: { server_received_at?: number; price_changes?: readonly PriceChange[] } = {},
) => ({
  type: "catalog.changed" as const,
  org_id: "org-1",
  actor_user_id,
  // `01-F62` — the record's own stored instant, and `01-F18`'s ordering authority for an
  // org-scoped event. Required on `LedgerRecord`, so every fixture carries one.
  server_received_at: extra.server_received_at ?? JUL_2_0930_PKT,
  payload: {
    entity,
    entity_id,
    version,
    before_ref,
    after_ref: `after-${version}`,
    // Required and possibly EMPTY (`services/api`'s `LedgerRecord`): an edit that moved no price
    // is a different fact from an edit whose price movements nobody wrote down.
    price_changes: extra.price_changes ?? [],
  },
});

describe("B-5 — the session gate asks the server, every time", () => {
  it("shows the sign-in form when whoami is refused", async () => {
    mount({ "session.whoami": unauthorized }, <AuthGate>{"the catalog"}</AuthGate>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy());
    // The gated content is ABSENT, not merely hidden — a hidden child still fetched.
    expect(screen.queryByText("the catalog")).toBeNull();
  });

  it("renders the app, and the org the SERVER named, once whoami succeeds", async () => {
    mount(
      {
        "session.whoami": () => ({
          user_id: "u-ali",
          org_id: "org-lahore",
          assignments: [{ role: "owner", branch_id: null }],
        }),
      },
      <AuthGate>{"the catalog"}</AuthGate>,
    );
    await waitFor(() => expect(screen.getByText("the catalog")).toBeTruthy());
    expect(screen.getByText(/org-lahore/)).toBeTruthy();
  });

  it("sends the typed credentials to auth.login and nothing else", async () => {
    const log = mount(
      { "session.whoami": unauthorized, "auth.login": () => ({ token: "t-1" }) },
      <AuthGate>{"the catalog"}</AuthGate>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ali@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(log.some((call) => call.path === "auth.login")).toBe(true));
    expect(log.find((call) => call.path === "auth.login")?.input).toEqual({
      email: "ali@example.com",
      password: "hunter2",
    });
  });

  it("shows one refusal for a bad credential, never which half was wrong", async () => {
    mount(
      {
        "session.whoami": unauthorized,
        "auth.login": () => {
          throw new Error("no such account");
        },
      },
      <AuthGate>{"the catalog"}</AuthGate>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("Invalid email or password.")).toBeTruthy());
    // The server's own words would enumerate accounts; the screen does not repeat them.
    expect(screen.queryByText(/no such account/)).toBeNull();
  });
});

describe("14-F28 — pending edits are visible and cancellable until they land", () => {
  const pending = [
    {
      edit_id: "edit-1",
      entity: "item",
      entity_id: "tikka",
      actor_user_id: "u-ali",
      staged_at: 1_800_000_000_000,
      apply_when: "day_end" as const,
      lands_at: 1_800_090_000_000,
    },
    {
      edit_id: "edit-2",
      entity: "item",
      entity_id: "karahi",
      actor_user_id: "u-sana",
      staged_at: 1_800_000_100_000,
      apply_when: "day_end" as const,
      lands_at: 1_800_090_000_000,
    },
  ];

  it("shows every staged edit with who staged it", async () => {
    mount({ "catalog.pending": () => pending }, <PendingEdits />);
    await waitFor(() => expect(screen.getByText("item / tikka")).toBeTruthy());
    expect(screen.getByText("item / karahi")).toBeTruthy();
    expect(screen.getAllByText(/u-ali/)).not.toHaveLength(0);
  });

  it("cancels the edit the owner pointed at, by its own id", async () => {
    // `catalog-transport.md` names a cancelled edit publishing anyway as the failure that decided
    // devices are never shipped an `effective_at`. Cancelling the WRONG one is the same failure.
    const log = mount(
      { "catalog.pending": () => pending, "catalog.cancelPending": () => ({ cancelled: true }) },
      <PendingEdits />,
    );
    await waitFor(() => expect(screen.getByText("item / karahi")).toBeTruthy());
    const buttons = screen.getAllByRole("button", { name: "Cancel this edit" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1] as HTMLElement);

    await waitFor(() =>
      expect(log.some((call) => call.path === "catalog.cancelPending")).toBe(true),
    );
    expect(log.find((call) => call.path === "catalog.cancelPending")?.input).toEqual({
      edit_id: "edit-2",
    });
  });

  it("re-reads the pending set from the server after a cancel", async () => {
    // Never spliced out of the cache by hand: the server decides whether a cancel arrived before
    // the edit landed (`cancelled: false` when it did not), and a locally edited list would show
    // an edit as cancelled that had already published.
    const log = mount(
      { "catalog.pending": () => pending, "catalog.cancelPending": () => ({ cancelled: true }) },
      <PendingEdits />,
    );
    await waitFor(() => expect(screen.getByText("item / tikka")).toBeTruthy());
    const before = log.filter((call) => call.path === "catalog.pending").length;
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel this edit" })[0] as HTMLElement);
    await waitFor(() =>
      expect(log.filter((call) => call.path === "catalog.pending").length).toBeGreaterThan(before),
    );
  });

  it("says so plainly when nothing is waiting", async () => {
    mount({ "catalog.pending": () => [] }, <PendingEdits />);
    await waitFor(() => expect(screen.getByText("Nothing is waiting.")).toBeTruthy());
  });
});

describe("14-F3 — the change history, in place", () => {
  const history = [
    record("item", "tikka", 4, null, "u-ali"),
    record("item", "karahi", 5, "before-4", "u-sana"),
    record("item", "tikka", 6, "before-5", "u-ali"),
  ];

  it("shows only the open entity's records", async () => {
    // "in place" is the FR's word. A screen listing every change in the org is the hidden log this
    // FR exists to replace.
    mount({ "catalog.history": () => history }, <ChangeHistory entity="item" entity_id="tikka" />);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.queryByText(/u-sana/)).toBeNull();
  });

  it("distinguishes a creation from a change by the absence of a before-ref", async () => {
    mount({ "catalog.history": () => history }, <ChangeHistory entity="item" entity_id="tikka" />);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    const rendered = screen.getAllByRole("listitem").map((node) => node.textContent ?? "");
    expect(rendered.some((text) => text.startsWith("created"))).toBe(true);
    expect(rendered.some((text) => text.startsWith("changed"))).toBe(true);
  });

  it("names the actor, and renders an absent actor as absent", async () => {
    // `LedgerRecord.actor_user_id` is `string | null` on purpose — "appended with no actor" has to
    // be constructible or no test can prove it does not happen. `14-F3` renders "by ???" the day
    // it does, so the screen shows the gap rather than an empty space.
    mount(
      { "catalog.history": () => [record("item", "tikka", 7, "before-6", null)] },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByRole("listitem").textContent).toContain("by —");
  });

  it("says so plainly when an entity has no recorded changes", async () => {
    mount({ "catalog.history": () => history }, <ChangeHistory entity="item" entity_id="naan" />);
    await waitFor(() =>
      expect(screen.getByText("No recorded changes for this item yet.")).toBeTruthy(),
    );
  });
});

/**
 * `14-F3`'s literal sentence, which this screen could not render when B-7 shipped and can now.
 *
 * ⚠ **These tests replace one that asserted the opposite.** `shell.dom.test.tsx` used to pin the
 * screen's standing apology — *"the date and the before/after values are not on this record yet"* —
 * and that assertion was correct on the day it was written. `01-F62` gave `catalog.changed` a
 * `server_received_at` and `services/api`'s publish path gave it `payload.price_changes`, at which
 * point a GREEN test was defending a claim the contract had retired: the same shape as
 * `catalog-pricing.test.ts:394` defending the overruled `SELLABLE_KINDS` rule for three weeks. The
 * footnote assertion below is deliberately a *negative* one, so the apology cannot come back
 * unnoticed.
 */
describe("14-F3 — 'price changed by Ali, 2 Jul, 450 → 480'", () => {
  const priced = (
    price_changes: readonly PriceChange[],
    actor: string | null = "u-ali",
    server_received_at: number = JUL_2_0930_PKT,
  ) => [record("item", "tikka", 9, "before-8", actor, { server_received_at, price_changes })];

  const row = async (): Promise<string> => {
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    return screen.getByRole("listitem").textContent ?? "";
  };

  it("renders the FR's own example in one row: the actor, the date and the two numbers", async () => {
    mount(
      {
        "catalog.history": () =>
          priced([
            {
              branch_id: "branch-main",
              channel: "counter",
              before_paisa: 45_000,
              after_paisa: 48_000,
            },
          ]),
      },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    const text = await row();
    expect(text).toContain("by u-ali");
    expect(text).toContain("2 Jul 2026");
    expect(text).toContain("Rs 450 → Rs 480");
  });

  it("renders RUPEES, never the paisa integer it stores", async () => {
    // `01-F53` freezes paisa into every line the price is read for, and a history that printed the
    // stored integer would report a hundredfold price rise that never happened. `lib/money.ts` is
    // the one converter; a second one here is how the two drift.
    mount(
      {
        "catalog.history": () =>
          priced([
            {
              branch_id: "branch-main",
              channel: "counter",
              before_paisa: 45_000,
              after_paisa: 48_000,
            },
          ]),
      },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    const text = await row();
    expect(text).toContain("Rs 450");
    expect(text).not.toContain("45000");
    expect(text).not.toContain("45,000");
  });

  it("names the (branch, channel) each movement belongs to, and renders every one of them", async () => {
    // `01-F60` prices per (branch, channel) with no fallback, so a bare "450 → 480" is ambiguous
    // across the whole grid — and a screen showing only the first cell hides the other four
    // branches' price rises behind one that looks complete.
    mount(
      {
        "catalog.history": () =>
          priced([
            {
              branch_id: "branch-main",
              channel: "counter",
              before_paisa: 45_000,
              after_paisa: 48_000,
            },
            {
              branch_id: "branch-main",
              channel: "storefront",
              before_paisa: 50_000,
              after_paisa: 55_000,
            },
          ]),
      },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    const text = await row();
    expect(text).toContain("branch-main · counter Rs 450 → Rs 480");
    expect(text).toContain("branch-main · storefront Rs 500 → Rs 550");
  });

  it("renders a cell that did not exist as ABSENT, never as free", async () => {
    // `CatalogPriceChange` allows `null` on either side and both are real: a newly enabled channel
    // has no before, a dropped one has no after. Collapsing either to `0` prints "free" where the
    // truth is "absent" — the confusion `01-F60`'s explicit zero exists to prevent, and a zero on
    // an audit line is a price an owner would believe.
    mount(
      {
        "catalog.history": () =>
          priced([
            {
              branch_id: "branch-main",
              channel: "storefront",
              before_paisa: null,
              after_paisa: 48_000,
            },
            {
              branch_id: "branch-main",
              channel: "counter",
              before_paisa: 45_000,
              after_paisa: null,
            },
          ]),
      },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    const text = await row();
    expect(text).toContain("— → Rs 480");
    expect(text).toContain("Rs 450 → —");
    expect(text).not.toContain("Rs 0");
  });

  it("attributes a price movement to nobody when the record names nobody", async () => {
    // The dangerous case is not a missing name, it is a WRONG one: a row carrying two real
    // numbers and an invented actor is a false accusation an audit trail exists to prevent.
    mount(
      {
        "catalog.history": () =>
          priced(
            [
              {
                branch_id: "branch-main",
                channel: "counter",
                before_paisa: 45_000,
                after_paisa: 48_000,
              },
            ],
            null,
          ),
      },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    const text = await row();
    expect(text).toContain("by —");
    expect(text).toContain("Rs 450 → Rs 480");
    expect(text).not.toMatch(/by\s*[A-Za-z0-9]/);
  });

  it("renders the CALENDAR date of the record, not its 01-F46 business day", async () => {
    // 02:15 is before the 05:00 cutover, so this edit's business day is 2 Jul while the instant
    // recorded is 3 Jul. `01-F46` decides which trading day an OPERATIONAL figure counts against —
    // a sale, a shift, a cash count. An audit line is none of those: it answers "when did Ali
    // change this", and answering with the previous date restates a recorded instant.
    // `domain`'s `businessDate()` is deliberately not called here.
    mount(
      {
        "catalog.history": () =>
          priced(
            [
              {
                branch_id: "branch-main",
                channel: "counter",
                before_paisa: 45_000,
                after_paisa: 48_000,
              },
            ],
            "u-ali",
            JUL_3_0215_PKT,
          ),
      },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    const text = await row();
    expect(text).toContain("3 Jul 2026");
    expect(text).not.toContain("2 Jul 2026");
  });

  it("shows an edit that moved no price as a change with no numbers, not as a price of nothing", async () => {
    mount(
      { "catalog.history": () => priced([]) },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    const text = await row();
    expect(text).toContain("2 Jul 2026");
    expect(text).not.toContain("→");
    expect(text).not.toContain("Rs");
  });

  it("no longer claims the date and the values are missing, and says what IS still missing", async () => {
    // The retired apology, asserted as an absence: a screen claiming a gap it no longer has
    // misleads the next reader exactly as badly as one hiding a gap it does have.
    mount(
      { "catalog.history": () => priced([]) },
      <ChangeHistory entity="item" entity_id="tikka" />,
    );
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.queryByText(/not on this record yet/)).toBeNull();
    expect(screen.getByText(/recorded as a catalog version only/)).toBeTruthy();
  });
});
