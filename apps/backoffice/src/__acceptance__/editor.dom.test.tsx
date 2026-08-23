/**
 * **THE SEAM TESTS — ADJUDICATED AND PARTLY RETIRED, 16 August 2026 (`24 §3`, `24-F5`).**
 *
 * Everything here asserts what the SHIPPED editor sends, not what a helper returns — because this
 * wave's recurring defect is a correct module the application never reaches, and
 * `price-grid.test.ts` passing proves nothing about whether `EntryEditor` calls it. That premise
 * is unchanged and is why the file survives at all.
 *
 * ---------------------------------------------------------------------------------------------
 * THE RETIREMENT, AND WHAT IT DOES NOT COVER
 * ---------------------------------------------------------------------------------------------
 *
 * *What changed:* `14-F32`..`14-F38` (`specs/14-backoffice.md`, August 2026) reshaped this
 * surface after the founder's own review — *"this is so hard to use. I cant understand a single
 * thing."* Creating an entry now begins with a **task** named in the owner's vocabulary
 * (`14-F32`), the kind discriminator is gone, the identifier is generated rather than typed
 * (`14-F33`), and the timing choice moved into the commit region (`14-F36`). Fifteen tests in
 * this file drove the old form — `getByLabelText("Type")`, `getByLabelText("ID")`, a grid present
 * on mount — and every one of them failed at the FIRST `getByLabelText`, before it reached its
 * own assertion. **They failed as DRIVERS, not as claims**, which is the distinction that decides
 * each verdict below: a driver that no longer fits is retired only where the claim it carried is
 * held somewhere else, and re-pointed at the new surface where it is not.
 *
 * *Which FR decides it:* `14-F32` (the task chooser), `14-F33` (no id control), `14-F36` (timing
 * in the commit region). None of them amends `14-F28`, `14-F29`, `01-F60` or `03-F50` — the
 * behaviour is identical; only the way an owner reaches it moved.
 *
 * **RETIRED HERE, because `__acceptance__/task-editor.dom.test.tsx` — the oracle written from
 * `14-F32`..`14-F38` (35 tests, 30 mutants, 0 survivors) — now carries the same claim:**
 *
 * | retired test | who holds the claim now |
 * |---|---|
 * | renders a cell for every enabled (branch, channel) pair | its `cell(branch, channel)` throws by name, on ~15 tests |
 * | does not send a save when an enabled pair is unpriced | *14-F37/14-F29 — pressing commit names EVERY missing pair and sends nothing* |
 * | names the branch and the channel it refused for | the same test, strengthened: EVERY missing pair, measured on the INSERTED text |
 * | sends the save once every cell is priced | *14-F29/Commandment 3 — a typed 450 reaches the wire as 45000 integer paisa* |
 * | sends 45000 paisa for a typed 450 | the same test |
 * | defaults to day end · sends day_end when the owner changes nothing | *14-F36 — apply-now is never pre-selected, and a save that changes nothing lands at day end* |
 * | states BOTH consequences on the control | *14-F36 — apply-now's consequence is rendered BEFORE it can be chosen* + *the resting state states the default outcome* |
 * | sends now only when the owner explicitly chooses it | *14-F36 — apply-now is not remembered between edits* (asserts `now` on the wire, then `day_end` on the next edit) |
 * | sends null for a blank station | *03-F50 — a station the owner never touched is sent as null* |
 *
 * **NOT RETIRED — re-pointed at the new surface below, because the new oracle does not hold
 * them.** This was measured, not assumed, and it is the reason this file was not retired whole:
 *
 * - **fill-across, and an override typed on top of it** (`14-F29`: *"one number fills the grid and
 *   overrides are typed on top"*). `task-editor.dom.test.tsx` prices every pair BY HAND on purpose
 *   — *"so setup never depends on the fill-across control"* — which is correct for that oracle and
 *   leaves the control itself unasserted at the seam. The old mutation matrix's **M9** (fill-across
 *   fills only the first channel column) would survive it.
 * - **a menu section sends NO `prices` key on the wire** (`01-F60`). The new oracle asserts the
 *   section form draws no grid; that a grid is absent and that the request omits the field are two
 *   claims, and `prices: []` satisfies the first while failing the second.
 * - **a free add-on sends an explicit `0` on every pair** (`01-F60`). The new oracle asserts the
 *   `14-F37` READOUT reads complete for a zero-priced item; the wire claim — 25 zeros, never an
 *   omission — is the old **M2**, and a mutant that drops zero cells from the request passes a
 *   readout assertion.
 * - **a typed station reaches the wire** (`03-F50`). The new oracle holds only the blank case, so
 *   an implementation that always sends `null` passes it.
 *
 * Nothing was deleted silently. The four tests that never failed — the price prefill and `14-F7`'s
 * three archive tests — are untouched below.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EntryEditor } from "../components/entry-editor";
import type { CatalogEntry } from "../lib/catalog-types";
import type { EnabledPairs } from "../lib/price-grid";
import { strings } from "../lib/strings";
import { type CallLog, Harness } from "./harness";

afterEach(cleanup);

const FIVE: EnabledPairs = {
  branches: ["gulberg", "dha", "johar", "model", "cantt"],
  channels: ["counter", "phone", "storefront", "whatsapp", "foodpanda"],
};

const receipt = {
  edit_id: "e1",
  apply_when: "day_end",
  lands_at: 1_800_000_000_000,
  version: null,
};

/**
 * `01-F69` — the branch directory this screen resolves its row axis through (`21-F15`).
 *
 * **`cantt` is deliberately absent from it.** Four of the five enabled branches are named and the
 * fifth is not, so both halves of the law are on screen at once: a suite that named every branch
 * could not tell a correct implementation from one that renders whatever the directory happens to
 * hold, and a suite that named none could not tell it from one that always renders the treatment.
 */
const DIRECTORY = {
  org: { org_id: "org-zaiqa", display_name: "Karachi Biryani House", status: "active" },
  branches: (
    [
      ["gulberg", "Gulberg"],
      ["dha", "DHA Phase 5"],
      ["johar", "Johar Town"],
      ["model", "Model Town"],
    ] as const
  ).map(([branch_id, display_name]) => ({
    branch_id,
    display_name,
    branch_type: "branch",
    branch_class: "production",
  })),
};

/** What a price cell's accessible name reads as, given the directory above. */
const placeName = (branch: string): string => {
  const found = DIRECTORY.branches.find((b) => b.branch_id === branch);
  return found === undefined
    ? `${strings.names.branchUnnamed} · ${strings.names.branchReference} ${branch}`
    : found.display_name;
};

const mount = (initial: CatalogEntry | null): CallLog => {
  const log: CallLog = [];
  render(
    <Harness
      log={log}
      handlers={{
        // `14-F33`'s section chooser and `14-F35`'s resolved station read the published menu; an
        // empty one is the honest fixture for a creation with no parent chosen.
        "catalog.published": () => ({ version: 7, entries: [] }),
        "catalog.pending": () => [],
        "catalog.save": () => receipt,
        "catalog.archive": () => receipt,
        "catalog.history": () => [],
        "tenancy.directory": () => DIRECTORY,
      }}
    >
      <EntryEditor initial={initial} enabled={FIVE} onSaved={() => {}} />
    </Harness>,
  );
  return log;
};

const cell = (branch: string, channel: string): HTMLInputElement =>
  screen.getByLabelText(`${placeName(branch)} ${channel}`) as HTMLInputElement;

/**
 * Waits for `tenancy.directory` to land, because a cell's accessible name is its BRANCH's name
 * (`21-F15`) and that arrives on its own query. Waiting on the NAMED label is what makes this a
 * real wait: the unnamed treatment is on screen from the first paint, so waiting on `cantt` would
 * return immediately and prove nothing.
 */
const namesResolved = async (): Promise<void> => {
  await screen.findByLabelText(`${placeName("gulberg")} counter`);
};

const type = (input: HTMLElement, value: string): void => {
  fireEvent.change(input, { target: { value } });
};

/**
 * `14-F32` — a creation starts at the task chooser, so every create-path test states which JOB it
 * is doing before it can touch a field. The task is named in the owner's vocabulary; the internal
 * kind string is deliberately not reachable from here, which is the FR working.
 */
const startTask = async (task: string): Promise<void> => {
  await waitFor(() => screen.getByRole("button", { name: task }));
  fireEvent.click(screen.getByRole("button", { name: task }));
  await waitFor(() => screen.getByLabelText("Name"));
};

const fillAll = (value: string): void => {
  type(screen.getByLabelText("Price for every cell"), value);
  fireEvent.click(screen.getByRole("button", { name: "Fill across" }));
};

/** `14-F32`'s two commit controls on a creation; *finish* is the one that closes the form. */
const commit = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Save and finish" }));
};

const saved = (log: CallLog): { entry: CatalogEntry; apply_when: string } =>
  (log.find((call) => call.path === "catalog.save")?.input ?? null) as never;

describe("14-F29 — one number fills the grid, and overrides are typed on top", () => {
  it("fills all 25 cells from one number in one action", async () => {
    // The fill-across is *"not a convenience, it is what makes the honest schema usable"*. Without
    // it an owner types 25 numbers per item and routes around the editor instead. Held HERE and
    // nowhere else: the `14-F32` oracle prices every pair by hand so that its own setup does not
    // depend on this control.
    mount(null);
    await startTask("Add a dish");
    await namesResolved();
    fillAll("450");
    for (const branch of FIVE.branches) {
      for (const channel of FIVE.channels) expect(cell(branch, channel).value).toBe("450");
    }
  });

  it("keeps an override typed on top of the fill", async () => {
    mount(null);
    await startTask("Add a dish");
    await namesResolved();
    fillAll("450");
    type(cell("dha", "foodpanda"), "520");
    expect(cell("dha", "foodpanda").value).toBe("520");
    expect(cell("dha", "counter").value).toBe("450");
  });

  it("prefills from the entry's existing prices", async () => {
    const entry = {
      kind: "item",
      id: "tikka",
      name: "Chicken Tikka",
      prices: FIVE.branches.flatMap((branch_id) =>
        FIVE.channels.map((channel) => ({ branch_id, channel, price_paisa: 45000 })),
      ),
    } as CatalogEntry;
    mount(entry);
    await namesResolved();
    // `gulberg` is named by the directory and `cantt` is not, so one cell is found by a NAME and
    // the other by `21-F15`'s treatment — both halves of the law, in the assertion that already
    // existed for a different reason.
    expect(cell("gulberg", "counter").value).toBe("450");
    expect(cell("cantt", "foodpanda").value).toBe("450");
  });
});

describe("01-F60 — what the WIRE carries, which is a different claim from what the screen draws", () => {
  it("sends a free add-on as an explicit 0 on every pair, never as an omission", async () => {
    // `01-F60`'s free add-on. A screen that treated `0` as "nothing entered" would send 25 fewer
    // prices, and "this costs nothing" would arrive indistinguishable from "somebody forgot".
    // `14-F32` renamed the task — the kind `modifier` is vendor vocabulary under `14-F38` and is
    // no longer a control — but the wire still carries `modifier`, and that is what is asserted.
    const log = mount(null);
    await startTask("Add an add-on");
    fillAll("0");
    type(screen.getByLabelText("Name"), "Extra Raita");
    commit();

    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    const prices = saved(log).entry.prices ?? [];
    expect(saved(log).entry.kind).toBe("modifier");
    expect(prices).toHaveLength(25);
    expect(prices.every((price) => price.price_paisa === 0)).toBe(true);
  });

  it("sends no prices for a menu section, which nothing prices", async () => {
    // The section form draws no grid, which `task-editor.dom.test.tsx` asserts. This is the other
    // half: the REQUEST omits the field. `prices: []` would satisfy the render claim and publish a
    // priced kind with an empty price set.
    const log = mount(null);
    await startTask("Add a menu section");
    type(screen.getByLabelText("Name"), "From the Grill");
    commit();
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).entry.prices).toBeUndefined();
  });
});

describe("03-F50 — the station travels with the entry", () => {
  it("sends the typed station", async () => {
    // The POSITIVE case, held here because the `14-F32` oracle asserts only the blank one — and an
    // implementation that always sends `null` passes that. `14-F35` puts this field in a collapsed
    // group; happy-dom performs no layout, so an owner's act of opening it is not reproducible
    // here and is not what this test claims. What it claims is that a typed value reaches the wire.
    const log = mount(null);
    await startTask("Add a dish");
    fillAll("450");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    type(screen.getByLabelText("Kitchen station"), "grill");
    commit();
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).entry.station).toBe("grill");
  });
});

describe("14-F7 — archive, never delete", () => {
  it("offers archive on a published entry and no delete anywhere", () => {
    const entry = { kind: "item", id: "tikka", name: "Chicken Tikka" } as CatalogEntry;
    mount(entry);
    expect(screen.getByRole("button", { name: "Archive" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
  });

  it("sends the archive with the entry's identity and the chosen timing", async () => {
    const entry = { kind: "item", id: "tikka", name: "Chicken Tikka" } as CatalogEntry;
    const log = mount(entry);
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.archive")).toBe(true));
    expect(log.find((call) => call.path === "catalog.archive")?.input).toEqual({
      kind: "item",
      id: "tikka",
      apply_when: "day_end",
    });
  });

  it("offers no archive on an entry that is already a tombstone", () => {
    const entry = {
      kind: "item",
      id: "tikka",
      name: "Chicken Tikka",
      deleted: true,
    } as CatalogEntry;
    mount(entry);
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
  });
});
