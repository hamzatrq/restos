// ACCEPTANCE TESTS — `04-F28`, `04-F29`, `04-F30`: what SEND owes the kitchen, what a tap may
// capture, and the way out.
//
// PROVENANCE (`24 §3` step 2): written in the session that fixed the adversarial review of
// `04-F21`..`04-F26`, so `20 §4.3`'s author/implementer separation is NOT satisfied. The
// mitigation is the round-3 law alone: every assertion below was measured against a mutant that
// restores the defect it claims to own, and those numbers are in the session report.
//
// THE THREE DEFECTS, all reproduced on this harness before they were fixed:
//
//   1. `04-F29` — A DROPPED CONFIRM RE-RANG EVERY LINE. The SEND loop cleared its captured rows
//      only when the confirm answered, so two naan captured, SEND pressed, both `add_line`s
//      landed, confirm response lost, SEND pressed again (the kitchen has no ticket) produced
//      `{"appended":[naan×2, naan×2],"confirms":2}` — four naan on the ledger and on the KOT,
//      permanent under `01-F1`.
//   2. `04-F28` — THE PAD BLOCKED A SALE `01-F59` REQUIRES IT TO ALLOW. Two taps on a sold-out
//      tile captured NOTHING, while the till accepts the identical `add_line` for that item
//      (`terminal-write-path.test.ts` §E is the till's half of this claim).
//   3. `04-F30` — NO SIGN-OUT. `Terminal.signOut` and the wire's `sign_out` op both existed and
//      this app called neither: a tablet handed on inside `01-F26`'s ten-minute idle window
//      attributed the next waiter's orders to the last one, permanently (`02-F41` + `01-F1`).
//
// ⚠ WHAT THIS SUITE CANNOT SEE. happy-dom performs NO LAYOUT: every assertion is about what is in
// the document and none is about whether a waiter can reach it. This surface still has no
// `layout:check` row.

import { ThemeProvider } from "@restos/ui";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pad } from "./Pad";
import { STRINGS } from "./strings";
import type { TerminalClient } from "./terminal-client";

afterEach(cleanup);

const WAITER = "00000000-0000-7000-8000-0000000000a1";
const NAAN = "item-naan";
const KARAHI = "item-karahi";
const UNPRICED = "item-unpriced";

type Intent = { kind: string; order_id?: string; item_id?: string; qty?: number };
type Call = { op?: string; intent?: Intent; handle?: unknown };

/**
 * A till that keeps the state the pad reads back, because the whole of `04-F29` is about the pad
 * re-reading rather than guessing: a fixture that answered a fixed `view` could not tell a
 * resumable confirm from a re-ring.
 *
 * The menu is the till's OWN shape (`shared/ipc.ts`'s `MenuItem`): `unavailable` is the display
 * verdict and `sold_out` is the availability fold's separate fact. `terminal-write-path.test.ts`
 * §E1 asserts the real terminal produces exactly this pair, so this is not an invented wire.
 */
type Row = {
  id: string;
  label: string;
  unavailable?: boolean;
  unavailableReason?: string;
  sold_out?: boolean;
};

/** The three menu rows this suite uses, in the till's own `MenuItem` shape. */
const MENU: Record<string, Row> = {
  [NAAN]: { id: NAAN, label: "Naan" },
  // 86'd: greyed, and still deliberately SELLABLE (`01-F59`).
  [KARAHI]: {
    id: KARAHI,
    label: "Karahi",
    unavailable: true,
    unavailableReason: "Sold out",
    sold_out: true,
  },
  // Unpriced: greyed for the OPPOSITE disposition, and the till would refuse it (`01-F60`).
  [UNPRICED]: {
    id: UNPRICED,
    label: "Unpriced",
    unavailable: true,
    unavailableReason: "no price set",
  },
};

/**
 * ⚠ **THE MENU IS PER TEST BECAUSE `ItemGrid` PAGES AT ONE TILE HERE.** happy-dom lays nothing
 * out, so `usePhysicalSize` measures a 0 × 0 box and `pageGrid`'s `Math.max(1, …)` floor puts
 * exactly ONE tile on a page. A three-item fixture therefore renders one tile and a pager, and a
 * test that pressed a tile it never drew would fail as "the item is missing" while measuring the
 * harness. `T11` is the standing version of this: nothing in this file is evidence that a waiter
 * can reach a control.
 */
const till = (options: { dropConfirm?: boolean; failAddLine?: number; menu?: string[] } = {}) => {
  const calls: Call[] = [];
  const state = { reachable: true, lines: 0, confirmed: false, adds: 0 };
  const client: TerminalClient = {
    enrolled: () => true,
    enrol: async () => true,
    call: async (body: unknown) => {
      const call = body as Call;
      calls.push(call);
      if (!state.reachable) throw new Error("cannot reach the till");
      if (call.op === "roster") return { roster: [{ user_id: WAITER, display_name: "Sana" }] };
      if (call.op === "sign_in") return { ok: true, handle: "h", display_name: "Sana" };
      if (call.op === "sign_out") return { ok: true };
      if (call.op === "view") {
        return {
          ok: true,
          view: {
            waiter: "Sana",
            menu: (options.menu ?? [NAAN]).map((id) => MENU[id] as Row),
            tables: [
              {
                table_ids: ["7"],
                order_id: "o1",
                lines: state.lines,
                total_paisa: state.lines * 6_000,
                confirmed: state.confirmed,
                conflict: false,
              },
            ],
          },
        };
      }
      if (call.op === "act" && call.intent?.kind === "add_line") {
        state.adds += 1;
        if (options.failAddLine === state.adds) return { ok: false, reason: "refused" };
        state.lines += 1;
        return { ok: true, order_id: "o1" };
      }
      if (call.op === "act" && call.intent?.kind === "confirm") {
        // THE CASE THIS SUITE IS ABOUT: the till appends, and the ANSWER is lost. `01-F1` makes
        // whatever landed permanent, so the pad cannot know which happened.
        if (options.dropConfirm === true) throw new Error("the response never came back");
        state.confirmed = true;
        return { ok: true, order_id: "o1" };
      }
      return { ok: true, order_id: "o1" };
    },
  };
  return { client, calls, state };
};

const mounted = (client: TerminalClient) =>
  render(
    <ThemeProvider polarity="light">
      <Pad client={client} />
    </ThemeProvider>,
  );

/** `fireEvent`, not `.click()`: testing-library wraps it in `act`, so the render has flushed. */
const press = (text: string): void => {
  const target = screen.getAllByText(text)[0];
  if (target === undefined) throw new Error(`no control reads "${text}"`);
  fireEvent.click(target.closest("button") ?? target);
};

/**
 * `ItemGrid`'s pager, pressed by ROLE rather than by text: a captured line renders its quantity as
 * a bare number, so a text match for "2" can find a cart row instead of a page button.
 */
const pressPage = (n: number): void => {
  const button = screen.getAllByRole("button").find((element) => element.textContent === String(n));
  if (button === undefined) throw new Error(`no page ${n} control`);
  fireEvent.click(button);
};

const signIn = async () => {
  await waitFor(() => expect(screen.getAllByText("Sana").length).toBeGreaterThan(0));
  press("Sana");
  await waitFor(() => expect(screen.getAllByText(STRINGS.unlock).length).toBeGreaterThan(0));
  press(STRINGS.unlock);
  // ⚠ THE TAB RAIL FIRST, AND THE ORDER IS LOAD-BEARING. `01-F61`'s PIN pad carries a key labelled
  // `7` and so does the table this fixture serves, so waiting on `7` alone matches the PIN key
  // that is still on screen while sign-in is in flight — and by the time the next line presses it,
  // the pad has moved on and the table row has not arrived. The rail exists only after sign-in, so
  // this is the state and not a delay (`offline.dom.test.tsx` waits in the same order for the same
  // reason). Measured as nine red tests wearing "the table is missing".
  await waitFor(() => expect(screen.getAllByText(STRINGS.tables).length).toBeGreaterThan(0));
  await waitFor(() => expect(screen.getAllByText("7").length).toBeGreaterThan(0));
};

const addLines = (calls: Call[]): Intent[] =>
  calls
    .filter((c) => c.op === "act" && c.intent?.kind === "add_line")
    .map((c) => c.intent as Intent);

const confirms = (calls: Call[]): Intent[] =>
  calls
    .filter((c) => c.op === "act" && c.intent?.kind === "confirm")
    .map((c) => c.intent as Intent);

describe("§A 04-F29 — a lost confirm answer never re-rings a line that landed", () => {
  it("A1 — two naan, SEND, the confirm answer is lost, SEND again: the naan are rung ONCE", async () => {
    const rig = till({ dropConfirm: true });
    mounted(rig.client);
    await signIn();
    press("7");
    press("Naan");
    press("Naan");
    press(STRINGS.send);
    await waitFor(() => expect(confirms(rig.calls).length).toBe(1));

    // The kitchen has no ticket, so the waiter presses SEND again. This is the defect's own
    // gesture, and it must not put the food on the ledger twice.
    await waitFor(() => {
      const send = screen.getAllByText(STRINGS.send)[0]?.closest("button");
      expect(send?.getAttribute("aria-label") ?? "").not.toContain(STRINGS.nothingToSend);
    });
    press(STRINGS.send);
    await waitFor(() => expect(confirms(rig.calls).length).toBe(2));

    const rung = addLines(rig.calls);
    expect(
      rung,
      "a line that already landed was rung again — four naan on the bill and on the KOT (01-F1)",
    ).toHaveLength(1);
    expect(rung[0]?.item_id).toBe(NAAN);
    expect(rung[0]?.qty).toBe(2);
    // The till agrees: one line, and the second press asked only for the confirm.
    expect(rig.state.lines).toBe(1);
  });

  it("A2 — SEND stays live while the confirm is owed, and says nothing about being idle", async () => {
    const rig = till({ dropConfirm: true });
    mounted(rig.client);
    await signIn();
    press("7");
    press("Naan");
    press(STRINGS.send);
    await waitFor(() => expect(confirms(rig.calls).length).toBe(1));
    // `27-F5` — it never goes inert, so what changes is the reason on the control. If the pad
    // thought there was nothing to send, the kitchen would never get this order at all.
    await waitFor(() => {
      const send = screen.getAllByText(STRINGS.send)[0]?.closest("button");
      expect(send?.hasAttribute("disabled")).toBe(false);
      expect(send?.getAttribute("aria-label") ?? "").not.toContain(STRINGS.nothingToSend);
    });
  });

  it("A3 — a REFUSED line stops the loop and keeps only what did not land", async () => {
    // Row 1 lands, row 2 is refused. Row 1 must not be sent again; row 2 must still be on the
    // glass, because `01-F2` says it is not a fact until the till holds it.
    const rig = till({ failAddLine: 2, menu: [NAAN, KARAHI] });
    mounted(rig.client);
    await signIn();
    press("7");
    press("Naan");
    // One tile per page here (see `till`), so the second item is reached the way an operator
    // reaches it: `27-F2` pages, it never scrolls.
    pressPage(2);
    press("Karahi");
    press(STRINGS.send);
    await waitFor(() => expect(addLines(rig.calls).length).toBe(2));
    // No confirm: the capture is incomplete and confirming would fire a partial order.
    expect(confirms(rig.calls)).toHaveLength(0);
    // The refusal is on the glass in the pad's own words rather than the till's FR-bearing one.
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(STRINGS.tillRefused)).length).toBeGreaterThan(0),
    );

    press(STRINGS.send);
    await waitFor(() => expect(addLines(rig.calls).length).toBe(3));
    const rung = addLines(rig.calls);
    expect(rung.map((i) => i.item_id)).toEqual([NAAN, KARAHI, KARAHI]);
  });

  it("A4 — the CONTROL: a clean round trip sends each line once and confirms once", async () => {
    const rig = till();
    mounted(rig.client);
    await signIn();
    press("7");
    press("Naan");
    press(STRINGS.send);
    await waitFor(() => expect(confirms(rig.calls).length).toBe(1));
    expect(addLines(rig.calls)).toHaveLength(1);
    // …and then it goes quiet: the till holds the lines and has been told, so there is nothing
    // owed. Without this row, "SEND stays live" would be satisfied by a SEND that never settles.
    await waitFor(() => {
      const send = screen.getAllByText(STRINGS.send)[0]?.closest("button");
      expect(send?.getAttribute("aria-label") ?? "").toContain(STRINGS.nothingToSend);
    });
    press(STRINGS.send);
    expect(addLines(rig.calls)).toHaveLength(1);
    expect(confirms(rig.calls)).toHaveLength(1);
  });

  it("A5 — an order the TILL holds unconfirmed can be sent, even by a pad that captured nothing", async () => {
    // The third way an order owes the kitchen a ticket, and the only one no local flag can know:
    // lines are on the till and no confirm has ever landed. `01-F2` puts the durable point there,
    // so the till's own view is the authority.
    const rig = till();
    rig.state.lines = 2;
    mounted(rig.client);
    await signIn();
    press("7");
    await waitFor(() => {
      const send = screen.getAllByText(STRINGS.send)[0]?.closest("button");
      expect(send?.getAttribute("aria-label") ?? "").not.toContain(STRINGS.nothingToSend);
    });
    press(STRINGS.send);
    await waitFor(() => expect(confirms(rig.calls).length).toBe(1));
    expect(addLines(rig.calls), "it invented lines the waiter never captured").toHaveLength(0);
  });

  /**
   * ⚠ **THIS ROW EXISTS BECAUSE A MUTANT SURVIVED, and it is the round-3 law landing on the fix
   * rather than on the original code.** Dropping the pad's own owed-confirm flag from SEND's
   * enablement killed **0 of 13** tests: every other case here leaves the till holding lines it
   * has never confirmed, and that third leg covers them. The case only the flag covers is the
   * SECOND round — `04-F8`'s incremental KOT — where the order is already confirmed, so the till's
   * own answer is *"nothing owed"* while a station has no ticket for the lines just sent. That is
   * `03-F55`'s defect (*"a line added after Send to kitchen never reached the kitchen"*) arriving
   * at the pad by a different door, and reading the suite would not have found it.
   */
  it("A6 — a SECOND round on an ALREADY-CONFIRMED order still owes the kitchen its addendum", async () => {
    const rig = till({ dropConfirm: true });
    rig.state.lines = 2;
    rig.state.confirmed = true;
    mounted(rig.client);
    await signIn();
    press("7");
    press("Naan");
    press(STRINGS.send);
    await waitFor(() => expect(addLines(rig.calls).length).toBe(1));
    await waitFor(() => expect(confirms(rig.calls).length).toBe(1));

    // The till says CONFIRMED and holds the new line; only this pad knows the confirm it sent was
    // never acknowledged. SEND must stay live, or the addendum is never fired.
    await waitFor(() => {
      const send = screen.getAllByText(STRINGS.send)[0]?.closest("button");
      expect(
        send?.getAttribute("aria-label") ?? "",
        "SEND went quiet over an addendum the kitchen has no ticket for (04-F8/03-F55)",
      ).not.toContain(STRINGS.nothingToSend);
    });
    press(STRINGS.send);
    await waitFor(() => expect(confirms(rig.calls).length).toBe(2));
    // …and it re-sent the CONFIRM alone. The line that landed is not rung twice.
    expect(addLines(rig.calls)).toHaveLength(1);
  });
});

describe("§B 04-F28/01-F59 — the pad captures an 86'd item and refuses only the unpriced one", () => {
  it("B1 — a sold-out tile is captured, because an 86 is not an 01-F17 block", async () => {
    const rig = till({ menu: [KARAHI] });
    mounted(rig.client);
    await signIn();
    press("7");
    press("Karahi");
    // On the glass as a captured, unsent line — `02-F31` owns the oversell path and the decision
    // is the waiter's, exactly as it is the cashier's at the counter.
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(STRINGS.notSent)).length).toBeGreaterThan(0),
    );
    press(STRINGS.send);
    await waitFor(() => expect(addLines(rig.calls).length).toBe(1));
    expect(addLines(rig.calls)[0]?.item_id).toBe(KARAHI);
  });

  it("B2 — an UNPRICED tile is not captured: 01-F60 gives the till no number to sell at", async () => {
    const rig = till({ menu: [UNPRICED] });
    mounted(rig.client);
    await signIn();
    press("7");
    press("Unpriced");
    // Nothing captured, so SEND has nothing to say and nothing is attempted. The till would have
    // refused it, and offering it would be the grid lying about what is sellable.
    expect(screen.queryAllByText(new RegExp(STRINGS.notSent))).toHaveLength(0);
    press(STRINGS.send);
    expect(addLines(rig.calls)).toHaveLength(0);
  });
});

describe("§C 04-F30/02-F41 — the pad has a way out that is not the idle lock", () => {
  it("C1 — sign out tells the till, returns to the grid, and carries nothing into the next session", async () => {
    const rig = till();
    mounted(rig.client);
    await signIn();
    press("7");
    press("Naan");
    await waitFor(() =>
      expect(screen.getAllByText(new RegExp(STRINGS.notSent)).length).toBeGreaterThan(0),
    );

    press(STRINGS.tables);
    press(STRINGS.signOut);

    // The till is told, so the handle dies with the act rather than ten minutes later.
    await waitFor(() => expect(rig.calls.some((c) => c.op === "sign_out")).toBe(true));
    // Back at `01-F61`'s identification grid — the next waiter names herself.
    await waitFor(() => expect(screen.getAllByText(STRINGS.whoAreYou).length).toBeGreaterThan(0));
    // And the previous waiter's captured lines are gone: sending them after a handover would
    // append her work under someone else's id (`02-F41`, permanent under `01-F1`).
    expect(screen.queryAllByText(new RegExp(STRINGS.notSent))).toHaveLength(0);
  });

  it("C2 — the control is on the tables screen, so signing out is never a mid-capture gesture", async () => {
    const rig = till();
    mounted(rig.client);
    await signIn();
    expect(screen.getAllByText(STRINGS.signOut).length).toBeGreaterThan(0);
    press("7");
    // The order screen has no sign-out: `27-F4` keeps controls where they were learned, and a
    // waiter mid-capture must not be one mis-tap from discarding what she has typed.
    expect(screen.queryAllByText(STRINGS.signOut)).toHaveLength(0);
  });
});
