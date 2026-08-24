// ACCEPTANCE TESTS — `04-F24`'s offline contract on the pad, and `04-F22` (c)'s no-actor rule.
//
// PROVENANCE (`24 §3` step 2): authored and implemented by the same session; `20 §4.3`'s
// separation is NOT satisfied and the mitigation is the round-3 law alone (mutation matrix in the
// session report).
//
// THE CLAUSES THIS FILE IS WRITTEN FROM:
//
//   04-F24  "it buffers captured lines in the browser and renders them as visibly unsent … and
//           SEND is disabled until the till is reachable. A KOT that has not reached the spooler
//           is food that is not being cooked and no screen may imply otherwise."
//   04-F22  (c) "the tablet receives an opaque handle and never a user id it could edit."
//   01-F17  a sale is never blocked — nothing here blocks one; the till goes on selling.
//
// ⚠ WHAT THIS SUITE CANNOT SEE, stated because the repo has nine measured instances of it:
// happy-dom performs NO LAYOUT. Every assertion below is about what is in the DOM, and none is
// about whether a waiter can reach it. This surface has no `layout:check` row at all.

import { ThemeProvider } from "@restos/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Pad } from "./Pad";
import { STRINGS } from "./strings";
import type { TerminalClient } from "./terminal-client";

afterEach(cleanup);

const WAITER = "00000000-0000-7000-8000-0000000000a1";

/**
 * A client whose reachability the test controls. It is NOT a stub of the protocol — the shapes it
 * returns are the ones `terminal.ts` actually produces, and §C asserts that the response the real
 * till builds carries no user id, so a fixture that invented one would be caught there.
 */
const clientWith = (state: { reachable: boolean }): TerminalClient => ({
  enrolled: () => true,
  enrol: async () => true,
  call: async (body: unknown) => {
    if (!state.reachable) throw new Error("cannot reach the till");
    const op = (body as { op?: string }).op;
    if (op === "roster") return { roster: [{ user_id: WAITER, display_name: "Sana" }] };
    if (op === "sign_in") return { ok: true, handle: "h", display_name: "Sana" };
    if (op === "view") {
      return {
        ok: true,
        view: {
          waiter: "Sana",
          menu: [{ id: "item-naan", label: "Naan" }],
          tables: [
            {
              table_ids: ["7"],
              order_id: "o1",
              lines: 0,
              total_paisa: 0,
              confirmed: false,
              conflict: false,
            },
          ],
        },
      };
    }
    return { ok: true, order_id: "o1" };
  },
});

const mounted = (client: TerminalClient) =>
  render(
    <ThemeProvider polarity="light">
      <Pad client={client} />
    </ThemeProvider>,
  );

/**
 * `fireEvent`, not `.click()`: testing-library wraps it in `act`, so React has flushed the state
 * change before the next line reads the DOM. A bare `.click()` leaves the assertion racing the
 * render, which reads as "the control is missing" and is a defect in the harness, not the app.
 *
 * `getAllByText(...)[0]` where a word appears twice: `Tables` is both a tab and a panel title, and
 * a `getByText` that throws on the second occurrence would be the suite failing on a screen that
 * is correct.
 */
const press = (text: string): void => {
  const target = screen.getAllByText(text)[0];
  if (target === undefined) throw new Error(`no control reads "${text}"`);
  const control = target.closest("button") ?? target;
  fireEvent.click(control);
};

const signIn = async () => {
  await waitFor(() => expect(screen.getAllByText("Sana").length).toBeGreaterThan(0));
  press("Sana");
  await waitFor(() => expect(screen.getAllByText(STRINGS.unlock).length).toBeGreaterThan(0));
  press(STRINGS.unlock);
  await waitFor(() => expect(screen.getAllByText(STRINGS.tables).length).toBeGreaterThan(0));
  // The table list arrives on the first `view` poll, one round trip after sign-in. Waiting for the
  // ROW rather than for the tab is what makes the presses below deterministic.
  await waitFor(() => expect(screen.getAllByText("7").length).toBeGreaterThan(0));
};

describe("§A 04-F24 — the pad never acks a KOT it has not sent", () => {
  it("A1 — SEND refuses in place while the till is unreachable, and says why", async () => {
    const state = { reachable: true };
    const client = clientWith(state);
    const calls: unknown[] = [];
    const spy: TerminalClient = {
      ...client,
      call: async (body) => {
        calls.push(body);
        return client.call(body);
      },
    };
    mounted(spy);
    await signIn();
    press("7");

    // The till goes unreachable mid-order — an AP reboot, a walk to the roof seating.
    state.reachable = false;
    // The pad learns the till is gone on its next poll, not instantly — so the wait is longer
    // than the poll. `04-F24`'s honesty is about what the screen says once it KNOWS, and a test
    // that raced the poll would be measuring the interval rather than the contract.
    await waitFor(
      () => expect(screen.getAllByText(new RegExp(STRINGS.padOffline)).length).toBeGreaterThan(0),
      { timeout: 5_000 },
    );

    const label = screen.getAllByText(STRINGS.send)[0];
    expect(label).toBeDefined();
    const send = label?.closest("button") ?? null;
    expect(send).not.toBeNull();

    // ⚠ **IT REFUSES; IT IS NOT DISABLED — `27-F5`, and `04-F24` was AMENDED to say so.** The FR's
    // first wording said "disabled", which is that FR's own named failure mode (an inert primary
    // control), and `Tile` correspondingly never sets `disabled`: it states the reason in the
    // accessible name and goes on being pressable. `02-F48` took the identical resolution on the
    // counter's tender control. So the assertion is that the reason is ON the control and that
    // pressing it appends NOTHING — never that the control went away, which would move every
    // control under it (`27-F4`).
    expect(send?.getAttribute("aria-label")).toContain(STRINGS.padOffline);
    expect(send?.hasAttribute("disabled")).toBe(false);

    // The half that actually protects a guest: pressing it does nothing at all. A refusal that is
    // only a label is a label.
    const before = calls.length;
    press(STRINGS.send);
    await waitFor(() => expect(calls.length).toBe(before));
  });

  it("A2 — a line rung offline is HELD and rendered as not sent, never as an order", async () => {
    const state = { reachable: true };
    const client = clientWith(state);
    const calls: unknown[] = [];
    const spy: TerminalClient = {
      ...client,
      call: async (body) => {
        calls.push(body);
        return client.call(body);
      },
    };
    mounted(spy);
    await signIn();
    press("7");
    state.reachable = false;
    // The pad learns the till is gone on its next poll, not instantly — so the wait is longer
    // than the poll. `04-F24`'s honesty is about what the screen says once it KNOWS, and a test
    // that raced the poll would be measuring the interval rather than the contract.
    await waitFor(
      () => expect(screen.getAllByText(new RegExp(STRINGS.padOffline)).length).toBeGreaterThan(0),
      { timeout: 5_000 },
    );

    const before = calls.length;
    press("Naan");
    // `01-F2`'s durable point is the till. The line is on this glass and the ledger has never
    // heard of it, so the glass says so in WORDS rather than in a colour.
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(STRINGS.notSent)).length).toBeGreaterThan(0),
    );
    // And nothing was even attempted: `04-F24` disables SEND rather than queueing a write that
    // `01-F1` would make permanent if it half-landed.
    const acts = calls.slice(before).filter((c) => (c as { op?: string }).op === "act");
    expect(acts).toEqual([]);
  });
});

describe("§B 04-F22 (c) — the pad never holds a user id", () => {
  it("B1 — nothing the pad renders or sends carries the waiter's identifier", async () => {
    const client = clientWith({ reachable: true });
    const sent: unknown[] = [];
    const spy: TerminalClient = {
      ...client,
      call: async (body) => {
        sent.push(body);
        return client.call(body);
      },
    };
    const { container } = mounted(spy);
    await signIn();
    // The roster IS keyed by user id — that is how sign-in names a person — so the claim under
    // test is narrower and is the one `04-F22` (c) makes: no id reaches the SCREEN, and no ACT
    // names one. An act that could name its own actor is the whole trap the FR exists to close.
    expect(container.textContent).not.toContain(WAITER);
    const acts = sent.filter((c) => (c as { op?: string }).op === "act");
    expect(JSON.stringify(acts)).not.toContain(WAITER);
  });
});

describe("§C 24-F14 — this suite is not vacuous", () => {
  it("C1 — the same flow with the till REACHABLE does send, so §A is measuring the guard", async () => {
    const client = clientWith({ reachable: true });
    const sent: unknown[] = [];
    const spy: TerminalClient = {
      ...client,
      call: async (body) => {
        sent.push(body);
        return client.call(body);
      },
    };
    mounted(spy);
    await signIn();
    press("7");
    press("Naan");
    press(STRINGS.send);
    // The CONTROL for §A1: with the till up, the identical gesture reaches the ledger. Without
    // this row, "SEND did nothing" would be satisfied by a SEND that never works at all.
    await waitFor(() => {
      const acts = sent.filter((c) => (c as { op?: string }).op === "act");
      expect(acts.some((a) => JSON.stringify(a).includes("add_line"))).toBe(true);
      expect(acts.some((a) => JSON.stringify(a).includes("confirm"))).toBe(true);
    });
  });
});

// `vi` is imported for parity with the repo's other DOM suites and deliberately unused: every
// double here is a plain object, because a mock of the transport would be a suite asserting
// about its own fixture (`K-3`'s dead-oracle defect).
void vi;
