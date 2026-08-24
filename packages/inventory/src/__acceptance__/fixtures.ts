/**
 * Shared fixtures for the `packages/inventory` oracles.
 *
 * Everything here builds REAL `ParsedEvent`s through `packages/domain`'s `parseEvent`, never a
 * hand-shaped object literal. That is deliberate: `L10`'s worked example is an oracle that
 * *"declared the interface it existed to deliver, then asserted against a hand-copy — both oracle
 * symbols were dead exports"*. A fixture that bypasses the schema would let this package's suite
 * stay green while `stock.count_recorded`'s `counted: false` refusal was deleted.
 */

import type { ParsedEvent } from "@restos/domain";
import { paisa, parseEvent, sumPaisa } from "@restos/domain";
import type { InventoryItem, ReferenceData } from "../reference.js";

export const ORG = "org-1";
export const BRANCH = "branch-1";
export const LOCATION = "branch-1";

let seq = 0;
export const resetIds = (): void => {
  seq = 0;
};

/** A deterministic, monotonically-increasing envelope id. See `relabel` for why it must not matter. */
export const nextId = (): string => {
  seq += 1;
  return `0193b0f0-0000-7000-8000-${String(seq).padStart(12, "0")}`;
};

export type EventOpts = {
  readonly at: number;
  readonly device?: string;
  readonly actor?: string | null;
  readonly deviceClock?: number;
  readonly lamport?: number;
};

export const event = (type: string, payload: unknown, opts: EventOpts): ParsedEvent =>
  parseEvent({
    id: nextId(),
    org_id: ORG,
    branch_id: BRANCH,
    device_id: opts.device ?? "device-1",
    actor_user_id: opts.actor ?? "user-1",
    lamport_seq: opts.lamport ?? 1,
    // ⚠ Deliberately UNRELATED to `branch_created_at`. `01-F34` bans a fold reading the device
    // clock, and a fixture whose two stamps agree cannot tell an implementation that reads the
    // right one from an implementation that reads the wrong one.
    device_created_at: opts.deviceClock ?? 1_600_000_000_000,
    branch_created_at: opts.at,
    time_basis: "branch",
    server_received_at: null,
    type,
    schema_version: 1,
    payload,
    refs: [],
  });

// ── the events ─────────────────────────────────────────────────────────────────────────────────

export const purchase = (
  purchase_id: string,
  lines: readonly { item_id: string; qty_base: number; line_total_paisa: number }[],
  at: number,
  invoice_total_paisa?: number,
): ParsedEvent =>
  event(
    "stock.purchase_recorded",
    {
      purchase_id,
      supplier_id: "supplier-metro",
      location_id: LOCATION,
      lines: lines.map((line, i) => ({
        line_no: i,
        item_id: line.item_id,
        supplier_item_id: `si-${line.item_id}`,
        qty_base: line.qty_base,
        line_total_paisa: line.line_total_paisa,
      })),
      // Through `sumPaisa` even in a fixture: `DEC-MONEY-005`'s GritQL rule fired on the `reduce`
      // that was here, and a fixture that adds money by hand is how a suite ends up asserting
      // against a total the product would never compute.
      invoice_total_paisa:
        invoice_total_paisa ?? sumPaisa(lines.map((line) => paisa(line.line_total_paisa))),
    },
    { at },
  );

export const wastage = (
  wastage_id: string,
  item_id: string,
  qty_base: number,
  at: number,
  reason = "spoiled",
): ParsedEvent =>
  event(
    "stock.wastage_recorded",
    { wastage_id, location_id: LOCATION, item_id, qty_base, reason },
    { at },
  );

export type LineSpec = {
  readonly item_id: string;
  readonly area_id?: string;
  readonly counted: boolean;
  readonly qty_base?: number;
  readonly basis?: "exact" | "weighed" | "estimated";
};

export const count = (count_id: string, lines: readonly LineSpec[], at: number): ParsedEvent =>
  event(
    "stock.count_recorded",
    {
      count_id,
      location_id: LOCATION,
      lines: lines.map((line) =>
        line.counted
          ? {
              item_id: line.item_id,
              area_id: line.area_id ?? "main",
              counted: true,
              qty_base: line.qty_base ?? 0,
              basis: line.basis ?? "exact",
            }
          : {
              item_id: line.item_id,
              area_id: line.area_id ?? "main",
              counted: false,
              basis: line.basis ?? "exact",
            },
      ),
    },
    { at },
  );

export const sale = (
  order_id: string,
  lines: readonly { line_id: string; sellable_id: string; qty: number }[],
  at: number,
): readonly ParsedEvent[] => [
  event("order.created", { order_id, channel: "counter" }, { at }),
  ...lines.map((line) =>
    event(
      "order.line_added",
      {
        order_id,
        line_id: line.line_id,
        item_id: line.sellable_id,
        qty: line.qty,
        unit_price_paisa: 45_000,
      },
      { at },
    ),
  ),
  event("order.confirmed", { order_id }, { at }),
];

/**
 * `02-F20`'s post-KOT void. It names an ORDER and no LINE — which is what makes `10-F7` fall out of
 * the set difference for free, and what makes `10-F19`'s amended comparison necessary.
 */
export const voidRecorded = (order_id: string, amount_paisa: number, at: number): ParsedEvent =>
  event(
    "void.recorded",
    {
      order_id,
      amount_paisa,
      reason: "sent back",
      approver_user_id: "user-manager",
      adjustment_attempt_id: `adj-${order_id}`,
    },
    { at },
  );

// ── reference data ─────────────────────────────────────────────────────────────────────────────

export const item = (over: Partial<InventoryItem> & { item_id: string }): InventoryItem => ({
  name: over.item_id,
  type: "raw",
  base_unit: "mg",
  is_counted: true,
  is_costed: true,
  count_units: { primary_label: "kg", primary_size_base: 1_000_000, partial: { kind: "none" } },
  reference_cost: null,
  ...over,
});

export const emptyRefs: ReferenceData = { items: [], areas: [], recipes: [], menu_recipes: [] };
