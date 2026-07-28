import { newId } from "@restos/domain";
import type { BlockedCursor, DeviceStore } from "@restos/sync-client";
import { billedEffectiveFromJsonLines, wallClock } from "@restos/sync-client";
import {
  type AppendRequest,
  AppendRequestSchema,
  type AppendResult,
  type DeviceState,
  DeviceStateSchema,
  type KitchenTicket,
  KitchenTicketSchema,
  type MenuItem,
  type OpenOrder,
  OpenOrderSchema,
} from "../shared/ipc";

/**
 * The main-process side of the bridge: the only place that touches the store.
 *
 * Written as a plain object over injected dependencies rather than reaching for `ipcMain`
 * directly, so the whole seam is testable without launching Electron — which matters,
 * because this is where the two-plane law is either upheld or quietly broken, and a seam
 * that can only be exercised by starting a desktop app does not get exercised.
 */
export type Gateway = {
  deviceState: () => DeviceState;
  openOrders: () => OpenOrder[];
  kitchenQueue: () => KitchenTicket[];
  menu: () => MenuItem[];
  append: (req: unknown) => AppendResult;
};

/**
 * Item names and unit prices are CATALOG data (`01-F21`), and the folds deliberately do not
 * carry them: a projected value that embedded a name would depend on catalog state at fold
 * time, which is the `01-F34` break law 1 exists to prevent. The read models carry line ids,
 * quantities and paisa — never words.
 *
 * So the app resolves names itself, from the device catalog (`01-F52`..`01-F56`), keyed by
 * the cell's `item_id`. Injectable rather than reached for directly so the seam tests
 * without a database.
 */
export type CatalogResolver = (item_id: string) => { name: string } | null;

/**
 * The sellable grid, read straight from the device catalog. Injected for the same reason as
 * `CatalogResolver` — so this seam tests without a database — and separate from it because they
 * answer different questions: the resolver names ONE id (including a tombstoned one, so a
 * reprint still renders), while this lists what may be SOLD (which excludes tombstones).
 * `01-F55`'s whole point is that those two sets differ.
 */
export type CatalogList = () => { id: string; name: string }[];

export type GatewayDeps = {
  store: DeviceStore;
  catalog: CatalogResolver;
  menu: CatalogList;
  actor: string;
  /** 02-F19 — attribution is whoever's PIN is in (02-F41); there is no "acting for". */
  actorUserId: string | null;
  deviceLabel: string;
  /** 01-F49 — bound at admission from the branch class, never a UI toggle. */
  training: boolean;
  /** Reachability, supplied by the mesh and cloud sessions. Three facts (00 §5.7). */
  reachability: () => Pick<DeviceState, "lan" | "hub" | "cloud">;
  /**
   * DEC-SYNC-011's blocked cursor lives on the CLOUD SESSION's status, not on the store's
   * — so the honesty UI cannot be built from the store alone. Injected as a getter so a
   * device with no cloud session (LAN-only, DEC-SYNC-009) simply reports null.
   */
  blockedCursor: () => BlockedCursor | null;
  /** 01-F46 — the Asia/Karachi business day with its 05:00 cutover. */
  businessDay: () => string;
};

type LineCell = { item_id: string; qty: number; unit_price_paisa: number; states: string[] };

const linesFrom = (jsonLines: string, catalog: CatalogResolver): OpenOrder["lines"] =>
  Object.entries(JSON.parse(jsonLines) as Record<string, LineCell>).map(([line_id, cell]) => ({
    line_id,
    // 01-F54 — an unsynced or renamed item degrades to its identifier and NEVER blocks. The
    // quantity and the money both come from the EVENT (01-F53), so the cashier can still
    // complete the sale and the only thing lost is a word.
    name: catalog(cell.item_id)?.name ?? cell.item_id,
    quantity: cell.qty,
    // The read models carry no modifier or note detail yet; these arrive with doc 02's
    // event work. Empty is honest, whereas inventing them here would be a fold reimplemented
    // outside the engine (26 §8).
    modifiers: [],
    removals: [],
    note: null,
  }));

/**
 * Parse an outbound payload against its declared schema before it crosses the seam.
 *
 * `shared/ipc.ts` calls `total_paisa`'s `.nonnegative()` *"load-bearing, not decoration"* and
 * rests the decision to have no `ErrorBoundary` on it. It was neither: `z.infer` erases the
 * constraint, no output path ever parsed anything, and `AppendRequestSchema.parse` was the only
 * runtime schema use in the app. The claim was true of the declaration and false of the code —
 * so the guard the renderer's safety was resting on did not exist.
 *
 * It runs on the OUTBOUND side because that is where the claim was made. `MoneyValue` throws a
 * `RangeError` on a negative and React 19 unmounts the root on a render throw, so the whole
 * point is to refuse the value at the plane boundary rather than blank the till (`01-F54`'s
 * remedy is to degrade, and there is nothing to degrade to when the money itself is corrupt).
 */
const checked = <T>(schema: { parse: (v: unknown) => T }, value: unknown, what: string): T => {
  try {
    return schema.parse(value);
  } catch (cause) {
    // Named loudly rather than swallowed: a fold producing a negative total is a kernel bug,
    // and a till that quietly rendered nothing would hide it until a shift reconciliation.
    throw new Error(`${what} failed its IPC contract before reaching the renderer`, { cause });
  }
};

export const createGateway = (deps: GatewayDeps): Gateway => ({
  deviceState: () => {
    const b = deps.blockedCursor();
    return checked(
      DeviceStateSchema,
      {
        actor: deps.actor,
        deviceLabel: deps.deviceLabel,
        businessDay: deps.businessDay(),
        training: deps.training,
        ...deps.reachability(),
        blocked: b
          ? { global_seq: b.global_seq, event_type: b.event_type, reason: b.reason }
          : null,
      },
      "device state",
    );
  },

  openOrders: () =>
    deps.store.openOrders().map((row) =>
      checked(
        OpenOrderSchema,
        {
          order_id: row.order_id,
          reference: row.order_id.slice(0, 8),
          // The ENGINE's own billed derivation — never reimplemented here. 26 §8 and the T-01-11
          // ruling: fold logic lives in one module, and the Auditor's mirror of it was deleted
          // precisely because two implementations of one sum is how a money anomaly becomes a
          // false conservation finding.
          total_paisa: billedEffectiveFromJsonLines(row.json_lines),
          lines: linesFrom(row.json_lines, deps.catalog),
        },
        `open order ${row.order_id}`,
      ),
    ),

  kitchenQueue: () => {
    // The queue projection is 6 pinned keys and carries NO line detail, so the ticket body
    // is joined from the order projection by id rather than duplicated into the queue fold.
    const orders = new Map(deps.store.openOrders().map((o) => [o.order_id, o]));
    // Branch time = this device's clock plus the measured branch offset (01-F43). Reading
    // it here rather than trusting the raw device clock is the whole point of the time layer.
    const now = wallClock.now() + deps.store.branchTimeStatus().offset_ms;
    return deps.store.kitchenQueue().map((row) => {
      const order = orders.get(row.order_id);
      return checked(
        KitchenTicketSchema,
        {
          order_id: row.order_id,
          reference: row.order_id.slice(0, 8),
          // Elapsed minutes are DERIVED here from branch-consensus time on both ends
          // (01-F43/F45): `age_basis` was stamped at APPEND from `branch_created_at`, and
          // `now` is branch time, so the offset cancels in the difference. This is display
          // arithmetic in the host app, never a fold reading a clock — that would be 01-F34.
          minutes: Math.max(0, Math.floor((now - row.age_basis) / 60_000)),
          lines: order ? linesFrom(order.json_lines, deps.catalog) : [],
        },
        `kitchen ticket ${row.order_id}`,
      );
    });
  },

  menu: () => {
    // 01-F22 — availability is an OPERATIONAL toggle held by a fold, and the catalog knows
    // nothing about it. Joining them here rather than in either one is what keeps 01-F52 true:
    // the fold never reads a name, the catalog never reads an event, and the only place the two
    // meet is this host app, at display time.
    const availability = new Map(
      deps.store.availability().map((row) => [row.item_id, row] as const),
    );
    return deps.menu().map((entry) => {
      const state = availability.get(entry.id);
      // `available` is 0/1 — SQLite STRICT has no boolean. An item the fold has never seen is
      // SELLABLE: 01-F22's 86 is an explicit act, so absence of a toggle means available, and
      // defaulting the other way would silently empty the grid of every item nobody has ever
      // toggled — which is all of them, on day one.
      const off = state !== undefined && state.available === 0;
      // 01-F58 — CONTESTED is its own state, not a synonym for unavailable: two devices
      // disagree about this item and neither claim supersedes the other. It is surfaced as a
      // reason rather than hidden, because the operator is the one who can resolve it.
      const contested = state !== undefined && state.contested === 1;
      // 27-F4 — an unavailable item is DISABLED IN PLACE with its reason, never removed from
      // the grid. Removing it would move every tile after it and destroy the positional memory
      // an operator who cannot read depends on entirely.
      return {
        id: entry.id,
        label: entry.name,
        ...(off ? { unavailable: true } : {}),
        ...(off ? { unavailableReason: contested ? "86 — disputed" : "86" } : {}),
      };
    });
  },

  append: (req: unknown): AppendResult => {
    // Validated HERE, on the trusted side. The renderer is the untrusted end of this bridge
    // even though we ship it: a buggy or compromised renderer must not be able to hand the
    // store a shape it did not expect.
    const parsed: AppendRequest = AppendRequestSchema.parse(req);
    const identity = deps.store.identity;
    const envelope = deps.store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      actor_user_id: deps.actorUserId,
      // An untrusted forensic hint with exactly one sanctioned reader (01-F45, 01-N2 skew
      // detection). The store stamps the authoritative `branch_created_at` itself.
      device_created_at: wallClock.now(),
      type: parsed.type,
      schema_version: 1,
      payload: parsed.payload,
      refs: parsed.refs,
    });
    return { id: envelope.id };
  },
});
