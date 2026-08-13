// ACCEPTANCE — `02-F51`: one state, one word, and the word is `Sold out`.
//
// PROVENANCE: **authored from spec text only** (`24 §3`), by a session that wrote no production
// code on this branch. `02-F51` landed in `specs/02-pos-app.md` in the commit before this one.
//
// ── THE DEFECT, AS MEASURED ─────────────────────────────────────────────────────────────────
//
// `Counter.tsx`'s Sold-out surface renders `Sold out` / `Sold out — disputed`. `gateway.menu()`
// renders `86` / `86 — disputed` for the SAME fold row, and that is what reaches the item grid on
// the Order tab. Two words for one state, on one device, in front of one cashier. The renderer's
// own comment argues the case against the jargon — *"86 is American restaurant slang with no
// standing in Pakistan"* — and then ships it, because the string lives one layer down.
//
// ── WHY THE STORE AND THE FOLD ARE REAL ─────────────────────────────────────────────────────
//
// A stubbed `store.availability()` would let this file assert its own fixture. The claim is about
// what a cashier reads for an item THIS DEVICE actually 86'd, so the toggle is appended through
// the real gateway, projected by the real availability fold, and read back through the real
// display join — the same three steps `availability-seam.test.ts` takes for the same reason.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────
//
// It does not touch `01-F58`'s contested state, `01-F59`'s deliberate sellability or `01-F60`'s
// unpriced tile — §C is the control that proves the vocabulary changed and the STATES did not.
// `02-F51` is explicit that the jargon stays in the spec corpus; nothing here asks the event
// vocabulary, the fold or `02-F40`'s own text to change.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it } from "vitest";
import { createGateway, type Gateway, type GatewayDeps } from "../gateway";

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;

const KARAHI = "i-karahi";
const NAAN = "i-naan";
/** `01-F60`'s opposite disposition: priced on no channel, so it is UNPRICED and never 86'd. */
const NIHARI = "i-nihari";

const PRICES: Record<string, Record<string, number>> = {
  [KARAHI]: { counter: 45_000, foodpanda: 58_000 },
  [NAAN]: { counter: 5_000, foodpanda: 7_000 },
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const harness = (over: Partial<GatewayDeps> = {}): { store: DeviceStore; gateway: Gateway } => {
  const dir = mkdtempSync(join(tmpdir(), "restos-vocabulary-"));
  dirs.push(dir);
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const gateway = createGateway({
    store,
    catalog: (id) => ({ name: id }),
    menu: () => [
      { id: KARAHI, name: "Chicken Karahi" },
      { id: NAAN, name: "Naan" },
      { id: NIHARI, name: "Nihari" },
    ],
    priceOf: (item_id, channel) => PRICES[item_id]?.[channel] ?? null,
    actor: "dev",
    session: () => ({ user_id: "u-ayesha", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-13",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
    ...over,
  });
  return { store, gateway };
};

const tile = (gateway: Gateway, id: string, channel = "counter") =>
  gateway.menu(channel).find((m) => m.id === id);

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — the word a cashier reads on the item grid.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 02-F51 — an 86'd item reads `Sold out` on the grid, never `86`", () => {
  it("names the state in words the operator may already know", () => {
    const { gateway } = harness();
    gateway.toggleAvailability({ item_id: KARAHI, available: false });

    const karahi = tile(gateway, KARAHI);
    /**
     * Aimed at: `gateway.ts`'s `reason = off ? (contested ? "86 — disputed" : "86") : …`.
     *
     * The negative half is stated separately from the positive half on purpose. An
     * implementation that renamed the string to anything else at all — `Unavailable`, `Off`,
     * `Finished` — would satisfy "not 86" and still leave TWO vocabularies on one device, which
     * is the defect `02-F51` actually rules on. So the positive assertion names the Sold-out
     * surface's own existing word, and `one-word-per-state.dom.test.tsx` proves the two surfaces
     * agree by comparing them rather than by comparing each to a constant.
     */
    expect(karahi?.unavailableReason).toBe("Sold out");
    expect(
      /\b86\b/.test(karahi?.unavailableReason ?? ""),
      "02-F51 BROKEN: the jargon reached the glass. `00 §5.6` is English-only UI and `21 §5` " +
        "puts this operator at plausibly non-reading — two digits she must be TAUGHT are worse " +
        "than two words she may already know.",
    ).toBe(false);
  });

  it("keeps `01-F58`'s CONTEST as its own qualifier rather than collapsing it", () => {
    const { store, gateway } = harness();
    // Two heads that disagree and supersede nothing: `01-F58` resolves the pair to unavailable
    // and marks it contested. Appended as envelopes so the REAL fold produces the state, rather
    // than a fixture asserting itself.
    for (const [i, available] of [false, true].entries()) {
      store.append({
        id: `0199dddd-0000-7000-8000-${String(i + 1).padStart(12, "0")}`,
        ...IDENTITY,
        actor_user_id: "u-other",
        device_created_at: 1_754_300_000_000 + i,
        type: "availability.changed",
        schema_version: 1,
        payload: { item_id: KARAHI, available, supersedes: [] },
        refs: [],
      });
    }

    const karahi = tile(gateway, KARAHI);
    expect(karahi?.contested).toBe(true);
    // The qualifier survives the rename. An implementation that mapped both arms onto one string
    // would tell the operator a settled fact where the fold refused to pick a winner (`01-F31`),
    // and she is the one who can resolve it.
    expect(karahi?.unavailableReason).toBe("Sold out — disputed");
    expect(/\b86\b/.test(karahi?.unavailableReason ?? "")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the controls. The vocabulary changed; nothing else did.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F51 — the STATES are untouched", () => {
  it("leaves `01-F60`'s unpriced tile on its own separate reason", () => {
    const { gateway } = harness();
    // `01-F59`/`01-F60` call these two dispositions opposites: an 86'd item has a price and stays
    // deliberately sellable; an unpriced one has no number to sell at. One word for both would be
    // this same defect inverted, and it is the mutation a careless rename produces.
    expect(tile(gateway, NIHARI)?.unavailableReason).toBe("no price set");
    expect(tile(gateway, NIHARI)?.sold_out).toBeUndefined();
  });

  it("leaves the sellable item with no reason at all", () => {
    const { gateway } = harness();
    // The fold has never seen `NAAN`, so it is SELLABLE and carries nothing. A tile with nothing
    // to say must go on saying nothing — `27-F16`'s argument: spend the channel on the exception.
    expect(tile(gateway, NAAN)?.unavailableReason).toBeUndefined();
    expect(tile(gateway, NAAN)?.unavailable).toBeUndefined();
  });

  it("keeps the 86'd item SELLABLE and the flags the Sold-out surface reads (01-F59, 02-F7)", () => {
    const { gateway } = harness();
    gateway.toggleAvailability({ item_id: KARAHI, available: false });

    const karahi = tile(gateway, KARAHI);
    // `01-F59` — availability is not an `01-F17` block, so the display verdict says "greyed" and
    // never "refused". `02-F7`'s own surface reads `sold_out`, not `unavailable`.
    expect(karahi?.sold_out).toBe(true);
    expect(karahi?.unavailable).toBe(true);
    // And the ledger is unchanged by a word: exactly one toggle, of the type the catalog names.
    // A rename that reached the EVENT would be commandment 2 — `02-F51` puts the jargon in the
    // spec corpus and takes it off the glass, and it decides nothing about the event vocabulary.
    expect(gateway.menu("foodpanda").find((m) => m.id === KARAHI)?.unavailableReason).toBe(
      "Sold out",
    );
  });
});
