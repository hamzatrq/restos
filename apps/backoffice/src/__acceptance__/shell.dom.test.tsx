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

const record = (
  entity: string,
  entity_id: string,
  version: number,
  before_ref: string | null,
  actor_user_id: string | null,
) => ({
  type: "catalog.changed" as const,
  org_id: "org-1",
  actor_user_id,
  payload: { entity, entity_id, version, before_ref, after_ref: `after-${version}` },
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

  it("states that the date and the before/after values are not on the record", async () => {
    // ⚠ `14-F3`'s own example is "price changed by Ali, 2 Jul, 450 → 480". The contract carries
    // neither the date nor the values, and the screen says so rather than inventing them — an
    // audit trail may not guess the one thing it exists to record.
    mount({ "catalog.history": () => history }, <ChangeHistory entity="item" entity_id="tikka" />);
    await waitFor(() => expect(screen.getByText(/not on this record yet/)).toBeTruthy());
  });

  it("says so plainly when an entity has no recorded changes", async () => {
    mount({ "catalog.history": () => history }, <ChangeHistory entity="item" entity_id="naan" />);
    await waitFor(() =>
      expect(screen.getByText("No recorded changes for this item yet.")).toBeTruthy(),
    );
  });
});
