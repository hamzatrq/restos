/**
 * **THE SEAM TESTS.** Everything here asserts what the SHIPPED editor sends, not what a helper
 * returns — because this wave's recurring defect is a correct module the application never reaches,
 * and `price-grid.test.ts` passing proves nothing about whether `EntryEditor` calls it.
 *
 * `14-F29` (the grid + fill-across), `01-F60` (completeness and the free-modifier zero),
 * `14-F28` (the timing default and the explicit apply-now), `03-F50` (station), `14-F7` (archive),
 * Commandment 3 (rupees in, paisa out) — each with the request the screen actually made as the
 * evidence.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EntryEditor } from "../components/entry-editor";
import type { CatalogEntry } from "../lib/catalog-types";
import type { EnabledPairs } from "../lib/price-grid";
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

const mount = (initial: CatalogEntry | null): CallLog => {
  const log: CallLog = [];
  render(
    <Harness
      log={log}
      handlers={{
        "catalog.save": () => receipt,
        "catalog.archive": () => receipt,
        "catalog.history": () => [],
      }}
    >
      <EntryEditor initial={initial} enabled={FIVE} onSaved={() => {}} />
    </Harness>,
  );
  return log;
};

const cell = (branch: string, channel: string): HTMLInputElement =>
  screen.getByLabelText(`${branch} ${channel}`) as HTMLInputElement;

const type = (input: HTMLElement, value: string): void => {
  fireEvent.change(input, { target: { value } });
};

const fillAll = (value: string): void => {
  type(screen.getByLabelText("Price for every cell"), value);
  fireEvent.click(screen.getByRole("button", { name: "Fill across" }));
};

const saved = (log: CallLog): { entry: CatalogEntry; apply_when: string } =>
  (log.find((call) => call.path === "catalog.save")?.input ?? null) as never;

describe("14-F29 — the grid the editor draws", () => {
  it("renders a cell for every enabled (branch, channel) pair", () => {
    mount(null);
    for (const branch of FIVE.branches) {
      for (const channel of FIVE.channels) expect(cell(branch, channel)).toBeTruthy();
    }
  });

  it("fills all 25 cells from one number in one action", () => {
    // The fill-across is *"not a convenience, it is what makes the honest schema usable"*. Without
    // it an owner types 25 numbers per item and routes around the editor instead.
    mount(null);
    fillAll("450");
    for (const branch of FIVE.branches) {
      for (const channel of FIVE.channels) expect(cell(branch, channel).value).toBe("450");
    }
  });

  it("keeps an override typed on top of the fill", () => {
    mount(null);
    fillAll("450");
    type(cell("dha", "foodpanda"), "520");
    expect(cell("dha", "foodpanda").value).toBe("520");
    expect(cell("dha", "counter").value).toBe("450");
  });

  it("prefills from the entry's existing prices", () => {
    const entry = {
      kind: "item",
      id: "tikka",
      name: "Chicken Tikka",
      prices: FIVE.branches.flatMap((branch_id) =>
        FIVE.channels.map((channel) => ({ branch_id, channel, price_paisa: 45000 })),
      ),
    } as CatalogEntry;
    mount(entry);
    expect(cell("gulberg", "counter").value).toBe("450");
    expect(cell("cantt", "foodpanda").value).toBe("450");
  });
});

describe("01-F60 — the editor refuses at the point of the mistake", () => {
  it("does not send a save when an enabled pair is unpriced", async () => {
    // THE assertion this screen exists for. The server refuses this too, and that refusal arrives
    // after a round trip an owner may not be watching — possibly at 05:00, from a scheduler.
    const log = mount(null);
    fillAll("450");
    type(cell("cantt", "foodpanda"), "");
    type(screen.getByLabelText("ID"), "tikka");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText(/cannot be saved yet/)).toBeTruthy());
    expect(log.filter((call) => call.path === "catalog.save")).toHaveLength(0);
  });

  it("names the branch and the channel it refused for", () => {
    mount(null);
    fillAll("450");
    type(cell("cantt", "foodpanda"), "");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const message = screen.getByText(/cannot be saved yet/).textContent ?? "";
    expect(message).toContain("cantt");
    expect(message).toContain("foodpanda");
  });

  it("sends the save once every cell is priced", async () => {
    const log = mount(null);
    fillAll("450");
    type(screen.getByLabelText("ID"), "tikka");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).entry.prices).toHaveLength(25);
  });

  it("sends a free modifier as an explicit 0 on every pair, never as an omission", async () => {
    // `01-F60`'s free add-on. A screen that treated `0` as "nothing entered" would send 25 fewer
    // prices, and "this costs nothing" would arrive indistinguishable from "somebody forgot".
    const log = mount(null);
    type(screen.getByLabelText("Type"), "modifier");
    fillAll("0");
    type(screen.getByLabelText("ID"), "extra-raita");
    type(screen.getByLabelText("Name"), "Extra Raita");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    const prices = saved(log).entry.prices ?? [];
    expect(prices).toHaveLength(25);
    expect(prices.every((price) => price.price_paisa === 0)).toBe(true);
  });

  it("sends no prices for a category, which nothing prices", async () => {
    const log = mount(null);
    type(screen.getByLabelText("Type"), "category");
    type(screen.getByLabelText("ID"), "grill");
    type(screen.getByLabelText("Name"), "From the Grill");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).entry.prices).toBeUndefined();
  });
});

describe("Commandment 3 — rupees in, integer paisa out", () => {
  it("sends 45000 paisa for a typed 450", async () => {
    // The factor of 100, asserted on the WIRE rather than on the helper. A screen that forwarded
    // the typed rupees would publish a menu at one hundredth of its price, frozen by `01-F53`.
    const log = mount(null);
    fillAll("450");
    type(screen.getByLabelText("ID"), "tikka");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).entry.prices?.[0]?.price_paisa).toBe(45000);
  });
});

describe("14-F28 — the timing control", () => {
  it("defaults to day end", () => {
    // `27-F4` makes a moving grid a breaking change against a cashier's muscle memory, so the
    // default is the 05:00 boundary. An apply-now default is a hidden breaking change per edit.
    mount(null);
    expect((screen.getByLabelText("At day end (05:00)") as HTMLInputElement).dataset.state).toBe(
      "checked",
    );
    expect((screen.getByLabelText("Apply now") as HTMLInputElement).dataset.state).toBe(
      "unchecked",
    );
  });

  it("states BOTH consequences on the control, before either is chosen", () => {
    // *"a deliberate act with the consequence stated on the control, not a hidden default"*.
    mount(null);
    expect(screen.getByText(/keep today's menu until 05:00/)).toBeTruthy();
    expect(screen.getByText(/changes as soon as this saves/)).toBeTruthy();
  });

  it("sends day_end when the owner changes nothing", async () => {
    const log = mount(null);
    fillAll("450");
    type(screen.getByLabelText("ID"), "tikka");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).apply_when).toBe("day_end");
  });

  it("sends now only when the owner explicitly chooses it", async () => {
    const log = mount(null);
    fillAll("450");
    type(screen.getByLabelText("ID"), "tikka");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    fireEvent.click(screen.getByLabelText("Apply now"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).apply_when).toBe("now");
  });
});

describe("03-F50 — the station travels with the entry", () => {
  it("sends the typed station", async () => {
    const log = mount(null);
    fillAll("450");
    type(screen.getByLabelText("ID"), "tikka");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    type(screen.getByLabelText("Kitchen station"), "grill");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).entry.station).toBe("grill");
  });

  it("sends null for a blank station, because absence is inheritance", async () => {
    // `03-F50`: an entry with no station takes its parent's through the `01-F21` chain. `""` would
    // be a station NAMED empty string, which resolves to nothing and drops the item off a ticket.
    const log = mount(null);
    fillAll("450");
    type(screen.getByLabelText("ID"), "tikka");
    type(screen.getByLabelText("Name"), "Chicken Tikka");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(log.some((call) => call.path === "catalog.save")).toBe(true));
    expect(saved(log).entry.station).toBeNull();
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
