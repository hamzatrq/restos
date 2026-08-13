/**
 * `03-F55` / `02-F6` — **THE ITEM NOTE REACHES THE PAPER, not just the queue and the renderer.**
 *
 * ⚠ **THIS IS A TRIPWIRE WRITTEN BY THE IMPLEMENTING SESSION, NOT AN ACCEPTANCE ORACLE**, and it
 * exists because a **SEAM MUTATION SURVIVED**. The `24 §3` oracles for this track cover the two
 * ends and not the middle:
 *
 *   · `packages/escpos/src/__acceptance__/kot-note.test.ts` proves `render()` puts a note on the
 *     chit, given a `KotData` that carries one;
 *   · `main/__acceptance__/line-correction-seam.test.ts` §D proves `gateway.kitchenQueue()` serves
 *     the note to the SCREEN;
 *   · and `main/printing.ts` — the only thing in this product that builds the `KotData` a printer
 *     is actually handed — sat between them, uncovered.
 *
 * **Measured 2026-08-13.** Deleting the note from `printing.ts`'s `KotData` line — one spread —
 * failed **0 of 981** tests in this package. The fold carried the note, the wire carried it, the
 * renderer knew how to draw it, the cart showed it to the cashier, and the cook's ticket did not
 * have it. That is `catalog-fetch.ts`'s `toEntry` defect exactly (a reshape that drops a field its
 * source carried), and it is why `AGENTS.md` says to mutate the SEAM rather than the logic.
 *
 * ## NO PRINTER IS INVOLVED. This asserts bytes handed to an object.
 *
 * `03-F10`'s rig is owed in full (K-8) and `27-F35`'s ≥85% comprehension gate on real staff is
 * what would decide whether a cook reads this note. Nothing here is evidence about paper.
 */

import { createSpooler, printerCapability, type SpoolerTransport } from "@restos/escpos";
import type { DeviceStore } from "@restos/sync-client";
import { describe, expect, it, vi } from "vitest";
import { createKotPrinter, type KotPrinterDeps } from "../printing";

const ORDER_ID = "0199aaaa-0000-7000-8000-00000000abcd";
const KARAHI = "i-karahi";
const NOTE = "less spicy";
const SECOND_NOTE = "no onions";

/**
 * One `open_orders` row whose cell carries `02-F6`'s notes exactly as the merge fold projects
 * them (`26 §7` M2 — a text-sorted array, absent on a line with none). Built here rather than
 * imported from a fixture so this file states the shape it depends on.
 */
const storeWith = (notes: readonly string[] | undefined) =>
  ({
    openOrders: () => [
      {
        order_id: ORDER_ID,
        channel: "counter",
        table_ids_json: "[]",
        json_lines: JSON.stringify({
          "line-a": {
            item_id: KARAHI,
            qty: 2,
            unit_price_paisa: 45_000,
            states: ["confirmed"],
            ...(notes === undefined ? {} : { notes }),
          },
        }),
        pay_total: 0,
      },
    ],
    kitchenQueue: () => [{ order_id: ORDER_ID, age_basis: 1_754_300_000_000, channel: "counter" }],
  }) as unknown as Pick<DeviceStore, "openOrders" | "kitchenQueue">;

/** Everything the transport was handed, as text. ESC/POS keeps Latin runs as plain bytes. */
const paperText = async (notes: readonly string[] | undefined): Promise<string> => {
  const sent: Uint8Array[] = [];
  const transport: SpoolerTransport = {
    send: vi.fn(async (document: Uint8Array) => {
      sent.push(document);
      return { ok: true } as const;
    }),
    status: vi.fn(async () => ({ paper_out: false, near_end: "unsupported" as const })),
  };
  const spooler = createSpooler({ transport });
  const deps: KotPrinterDeps = {
    spooler,
    store: storeWith(notes),
    catalog: () => ({ name: "Chicken Karahi" }),
    station: () => "GRILL",
    capability: printerCapability("TH230"),
    append: () => {},
  };
  const printer = createKotPrinter(deps);
  printer.confirmed(ORDER_ID);
  await printer.pump();
  const decoder = new TextDecoder("latin1");
  return sent.map((bytes) => decoder.decode(bytes)).join("");
};

describe("03-F55 — the note travels fold → KotData → bytes", () => {
  it("the note the fold projected is in the bytes the printer is handed", async () => {
    // ⚠ THE MUTANT THIS KILLS: `printing.ts` building its `KotData` line without the note.
    // 0 of 981 tests noticed before this file existed.
    expect(
      await paperText([NOTE]),
      "02-F6 requires the note 'printed prominently on the KOT' — the cart shows it, the queue " +
        "serves it, and the paper does not have it",
    ).toContain(NOTE);
  });

  it("02-F50: BOTH quick tags reach the paper, not just the first", async () => {
    // The seam has to collapse a SET into `KotLine.note`'s one string. Taking `notes[0]` is the
    // natural way to do that and it silently drops an instruction — `27-F59` calls a missed
    // removal an allergen incident, and "no onions" is the same class of fact.
    const text = await paperText([NOTE, SECOND_NOTE]);
    expect(text).toContain(NOTE);
    expect(text).toContain(SECOND_NOTE);
  });

  it("CONTROL — a line with no notes prints no note, and still prints its dish", async () => {
    // Without this, a seam that hardcoded a note onto every line would pass both tests above,
    // and `00 §5.7` forbids a row that says nothing. The dish assertion is what keeps this from
    // passing against a printer that renders nothing at all.
    const text = await paperText(undefined);
    expect(text).toContain("Chicken Karahi");
    expect(text).not.toContain(NOTE);
  });
});
