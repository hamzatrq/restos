// ACCEPTANCE — `02-F51`: the SAME word on both surfaces of one device, compared rather than
// hand-copied.
//
// PROVENANCE: **authored from spec text only** (`24 §3`), by a session that wrote no production
// code on this branch. `02-F51` landed in `specs/02-pos-app.md` in the commit before this one.
//
// ── WHY THIS FILE RUNS THE REAL GATEWAY BEHIND THE REAL SCREEN ──────────────────────────────
//
// The claim `02-F51` makes is a claim about TWO surfaces agreeing, and the two strings are
// written in two different layers: `Counter.tsx`'s Sold-out grid holds its own literal, and the
// Order grid takes whatever `gateway.menu()`'s display join produced. A test that stubbed the
// bridge would be supplying one of the two answers itself — `K-3`'s dead-oracle defect, where an
// oracle declares an interface and then asserts against its own copy of it. So the bridge here is
// the REAL `createGateway` over a REAL `openStore`, the 86 is appended by pressing a tile, the
// availability fold projects it, and the two surfaces are then compared **to each other**.
//
// That is also the only shape that can fail for the right reason. If the vocabulary is fixed in
// the renderer instead of in the join, or in the join instead of the renderer, exactly one
// surface moves and this file reddens — which is the property, not the layer.
//
// ⚠ **This file does not decide WHICH layer owns the word.** `availability-vocabulary.test.ts`
// pins the value at the seam; this one pins the agreement. Both must hold.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAging } from "@restos/device-config";
import { openStore } from "@restos/sync-client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGateway, type Gateway } from "../main/gateway";
import { Counter } from "./Counter";

afterEach(cleanup);

const IDENTITY = { org_id: "org-1", branch_id: "br-1", device_id: "dev-1" } as const;
const KARAHI = "i-karahi";
const NAAN = "i-naan";

/** happy-dom lays nothing out, so `usePhysicalSize` needs a panel or no grid ever renders. */
const REFERENCE_PANEL = { width: 1366, height: 768 };
class StubResizeObserver {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ target, contentRect: REFERENCE_PANEL as DOMRectReadOnly } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** One device: one store, one fold, one gateway, and a bridge that is a thin pass-through. */
const mountRealDevice = (): Gateway => {
  const dir = mkdtempSync(join(tmpdir(), "restos-one-word-"));
  dirs.push(dir);
  const store = openStore({ path: join(dir, "device.db"), identity: IDENTITY });
  const gateway = createGateway({
    store,
    catalog: (id) => ({ name: id }),
    menu: () => [
      { id: KARAHI, name: "Chicken Karahi" },
      { id: NAAN, name: "Naan" },
    ],
    priceOf: () => 45_000,
    actor: "Ayesha",
    session: () => ({ user_id: "u-ayesha", display_name: "Ayesha" }),
    deviceLabel: "Counter 1",
    training: false,
    reachability: () => ({ lan: "ok", hub: "ok", cloud: "down" }),
    blockedCursor: () => null,
    catalogRefusal: () => null,
    businessDay: () => "2026-08-13",
    panelPpi: () => 100.5,
    aging: resolveAging(undefined).thresholdsFor,
    panelFit: () => null,
  });
  const bridge = {
    deviceState: vi.fn(async () => gateway.deviceState()),
    openOrders: vi.fn(async () => gateway.openOrders()),
    kitchenQueue: vi.fn(async () => gateway.kitchenQueue()),
    menu: vi.fn(async (channel: string) => gateway.menu(channel)),
    append: vi.fn(async (req: unknown) => gateway.append(req)),
    addLine: vi.fn(async (req: unknown) => gateway.addLine(req)),
    toggleAvailability: vi.fn(async (req: unknown) => gateway.toggleAvailability(req)),
    onChanged: vi.fn(() => () => {}),
  };
  Object.defineProperty(window, "restos", { value: bridge, configurable: true, writable: true });
  return gateway;
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

const tap = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/**
 * What a cashier reads on one tile. `Tile` folds the reason into the accessible name
 * (`aria-label={`${label} — ${reason}`}`), so this is the whole of what the control says about
 * itself — which is exactly the thing `02-F51` requires the two surfaces to agree about.
 */
const tileName = (label: RegExp): string => {
  const el = screen.getByRole("button", { name: label });
  return el.getAttribute("aria-label") ?? (el.textContent ?? "").trim();
};

describe("02-F51 — the Order grid and the Sold-out grid name one state the same way", () => {
  it("reads the same words for an item this device just 86'd", async () => {
    mountRealDevice();
    render(<Counter />);

    // 86 it the way an operator does: on `02-F7`'s own surface, one tap, through the real
    // gateway and the real fold. Nothing here writes a string.
    await screen.findByText("Sold out", { exact: true });
    tap(/^Sold out$/i);
    tap(/Chicken Karahi/i);

    await waitFor(() => expect(tileName(/Chicken Karahi/i)).toMatch(/—/));
    const onSoldOutTab = tileName(/Chicken Karahi/i);

    // Back to the surface she actually rings on.
    tap(/^Order$/i);
    await waitFor(() => expect(tileName(/Chicken Karahi/i)).toMatch(/—/));
    const onOrderTab = tileName(/Chicken Karahi/i);

    /**
     * THE ASSERTION, and it compares the product to itself. Aimed at the shipped pair —
     * `Chicken Karahi — Sold out` on one tab and `Chicken Karahi — 86` on the other — and it
     * fails for any implementation that fixes one surface and forgets the other, in either
     * direction.
     *
     * `02-F51`: *"an operator who learns one surface cannot read the other."* `27-F4` protects
     * the position of a control; this protects the meaning of what is written on it, which is the
     * same promise on the other axis.
     */
    expect(
      onOrderTab,
      "02-F51 BROKEN: one availability state, two vocabularies, one device. The Sold-out tab " +
        `says "${onSoldOutTab}" and the item grid says "${onOrderTab}" for the same fold row.`,
    ).toBe(onSoldOutTab);

    // And the word that reaches the glass is not the jargon, on EITHER surface. Stated
    // separately because agreement alone is satisfied by both surfaces saying `86`.
    for (const name of [onOrderTab, onSoldOutTab]) {
      expect(
        /\b86\b/.test(name),
        `02-F51 BROKEN: "${name}" puts 02-F40's jargon in front of the cashier. 00 §5.6 is ` +
          "English-only UI and 86 is American restaurant slang with no standing in Pakistan.",
      ).toBe(false);
    }
  });

  it("agrees about an item nobody has touched, too — silence on both surfaces", async () => {
    // The control. Agreement is trivially satisfiable by writing the same wrong thing twice, and
    // it is also breakable in the other direction: a fix that stamped `Sold out` onto every tile
    // would make the two surfaces agree and would tell a cashier the kitchen ran out of
    // everything. `27-F16` — spend the channel on the exception, never on the base case.
    mountRealDevice();
    render(<Counter />);
    await screen.findByText("Sold out", { exact: true });

    tap(/^Sold out$/i);
    const onSoldOutTab = tileName(/^Naan$/i);
    tap(/^Order$/i);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Naan$/i })).toBeTruthy());

    expect(tileName(/^Naan$/i)).toBe(onSoldOutTab);
    expect(onSoldOutTab).not.toMatch(/—/);
  });
});
