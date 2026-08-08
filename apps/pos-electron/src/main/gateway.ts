import { newId } from "@restos/domain";
import type { BlockedCursor, DeviceStore } from "@restos/sync-client";
import { billedEffectiveFromJsonLines, wallClock } from "@restos/sync-client";
import {
  type AddLineRequest,
  AddLineRequestSchema,
  type AppendRequest,
  AppendRequestSchema,
  type AppendResult,
  type CashState,
  CashStateSchema,
  type DeviceState,
  DeviceStateSchema,
  type KitchenTicket,
  KitchenTicketSchema,
  type MenuItem,
  type OpenOrder,
  OpenOrderSchema,
  type Session,
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
  /** `02-F23`/`02-F37`/`02-F43` — the `shift_cash` fold, for the Cash and Me surfaces. */
  cashState: () => CashState;
  append: (req: unknown) => AppendResult;
  /** `C5` — `01-F60`'s resolution and `01-F53`'s capture, both on the trusted side. */
  addLine: (req: unknown) => AppendResult;
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

/**
 * `01-F60` — the price this device would snapshot for `channel`, or `null` if the item carries
 * none for this device's branch on that channel.
 *
 * Injected for the same reason as the two seams above, and separate from them because it answers
 * a third question: `catalog` NAMES an id (tombstones included, so a reprint renders), `menu`
 * lists what may be SOLD, and this says what it COSTS. `01-F55` and `01-F60` make those three
 * sets genuinely different.
 */
export type PriceResolver = (item_id: string, channel: string) => number | null;

/** The counter app is the `counter` channel (`02-F1`, `02-F42`). */
const COUNTER_CHANNEL = "counter";

export type GatewayDeps = {
  store: DeviceStore;
  catalog: CatalogResolver;
  menu: CatalogList;
  priceOf: PriceResolver;
  /**
   * What `DeviceState.actor` reads when NOBODY is signed in — not the operator's name.
   *
   * `deviceState()` derives the operator's name from `session` below (`02-F19`/`02-F45`), so this
   * is reached only on a locked device, where `02-F18` draws no strip at all. It exists because
   * `DeviceStateSchema.actor` is a required non-empty string and the unlock gate parses the whole
   * object on every read.
   *
   * **`01-F27` binds what may go here:** a device identity is never promoted into a user
   * identity, so it must not be a person's name.
   */
  actor: string;
  /**
   * `02-F41` — attribution is whoever's PIN is in, and there is no "acting for".
   *
   * A GETTER, not a value: this identity changes 20–60× a shift (`01-F26`'s unlock/auto-lock
   * cycle) while ONE gateway instance serves the whole process life — `ipcMain.handle` admits
   * a single handler per channel, so the handlers are bound once and must read the session at
   * each append rather than close over whoever was in when the app booted. `null` is LOCKED,
   * and a locked device attributes to NOBODY (`01-F27` — a device identity is never promoted
   * into a user identity).
   *
   * ONE dep rather than an id plus a display name, on `02-F45`'s own argument: two sources for
   * one fact can disagree, and an append-only ledger has no rule for which wins.
   */
  session: () => Session | null;
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
  /**
   * `27-F68` / `00 §7` layer 3 — the density of the glass, resolved by `panel-density.ts`.
   *
   * A GETTER for the same reason `session` is one: the panel can change under a running process
   * (a till moved to an external display, a dock), and the whole product's touch-target sizes
   * are computed from it. Required, not optional — this is the seam the ruling exists to create,
   * and an optional dep with no supplier is `seams:check` Rule B's own defect (instances 2 and 5
   * in `AGENTS.md`) reproduced on the one field that decides whether `27-F8` holds.
   */
  panelPpi: () => number;
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
    // ONE read, used twice below. Two `deps.session()` calls could straddle an `01-F26` auto-lock
    // and hand the renderer a strip naming Ayesha over a `user` that is already null — the same
    // disagreement `02-F45` forbids, arrived at through timing rather than through a second field.
    const user = deps.session();
    return checked(
      DeviceStateSchema,
      {
        /**
         * `02-F19` — *"every action is attributed"*, and `StatusStrip` renders THIS as the
         * operator's name (*"attribution is never anonymous. The name is shown, not just a
         * role"*). So it is the SESSION's name, derived from the same read that stamps
         * `actor_user_id` into every envelope below.
         *
         * It was `deps.actor` — a construction-time string, and `index.ts` passed the literal
         * `"dev"`. That is `02-F45`'s two-sources-for-one-fact defect on the screen instead of
         * in the payload: this field shipped with the first launch commit, the envelope gained
         * the real identity later with S-0c, and the strip was never moved over — so the ledger
         * recorded Ayesha while the chrome said `dev`, permanently
         * (`01-F1`). A value fixed when the gateway is built cannot follow an identity that moves
         * 20–60× a shift, which is the same argument that made `session` a getter.
         *
         * `deps.actor` survives as the LOCKED value only. It is never drawn: `02-F18` gives a
         * locked device the unlock screen alone, and `App.tsx` reads `user` to decide that. It is
         * still reached — `deviceState()` is parsed on every locked read — so it cannot be
         * dropped for a schema that requires a non-empty string.
         */
        actor: user?.display_name ?? deps.actor,
        // `27-F68` — read on EVERY `deviceState()`, which is what makes it follow a panel that
        // changes rather than one that was true when the process booted.
        panelPpi: deps.panelPpi(),
        deviceLabel: deps.deviceLabel,
        businessDay: deps.businessDay(),
        training: deps.training,
        ...deps.reachability(),
        blocked: b
          ? { global_seq: b.global_seq, event_type: b.event_type, reason: b.reason }
          : null,
        // `18 §6` — the lock surface reads the session through THIS seam and no other, and it
        // is the same read the envelope is stamped from below. A strip naming one cashier over
        // a ledger attributing another is `02-F45`'s disagreement with no rule for which wins.
        user,
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
          // The fold's keyed sum (01-F30/01-F31), never re-derived here — same rule as the
          // billed total directly above, and for the same reason.
          paid_paisa: row.pay_total,
          lines: linesFrom(row.json_lines, deps.catalog),
          /*
            `C19`/`C31` — the Orders tab's four facts, passed through from the SAME fold row
            this function already reads. Nothing is derived, joined or decided here: which
            channel counts as a "cloud" order is `02-F9`'s policy and lives on the screen that
            asks the question, because a gateway that pre-classified them would put policy on
            the wrong side of the seam and hide it from the renderer's own tests.

            `channel` is narrowed by `OpenOrderSchema`'s `z.enum(ORDER_CHANNELS)` on the way
            out (`02-F42` closed the set), so a row carrying a value outside it fails `checked`
            loudly here rather than silently mis-sorting an order into or out of the inbox —
            which, since `01-F60` makes channel a PRICE KEY, is a class of error worth the noise.
          */
          channel: row.channel,
          order_type: row.order_type,
          confirmed_at: row.confirmed_at,
          settled: row.settled,
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
      // 01-F60 — an UNPRICED item is not an 86'd item, and the two must not be conflated. An
      // 86'd item stays deliberately sellable (01-F59): its price is known and 02-F31 owns the
      // oversell path. An unpriced one has no number to sell at, and inventing one is worse than
      // refusing — so it is greyed for a DIFFERENT reason and the counter cannot add it.
      const unpriced = deps.priceOf(entry.id, COUNTER_CHANNEL) === null;
      const reason = off ? (contested ? "86 — disputed" : "86") : unpriced ? "no price set" : null;
      return {
        id: entry.id,
        label: entry.name,
        ...(reason === null ? {} : { unavailable: true, unavailableReason: reason }),
      };
    });
  },

  /**
   * `02-F23`'s reconciliation, `02-F37`'s unbound settlements and `02-F43`'s unbound drawer
   * activity, as the store's own `shift_cash` projection already holds them.
   *
   * FOUR store reads assembled into one payload and nothing else — no filtering, no sum, no
   * join. `26 §8` puts fold logic in one module, and the shape below is the fold's own four
   * projections under their own names.
   *
   * **It does NOT scope the shifts to the asking cashier, and that is not a gap — it is a
   * layer.** `02-F23` ("cashiers see only their own shifts") is enforced by `authorizeReads` in
   * `main/authorize.ts`, which wraps this method and narrows `shifts` to `reportScope`'s reach.
   * Commandment 8 puts the filter on the trusted side, never in the renderer; putting it in the
   * WRAPPER rather than here keeps the raw gateway available to the KOT printer, which performs
   * no person's act.
   *
   * **This comment used to say the scoping was owed because the fold's `cashier` column was
   * always `null`, and that is no longer true (`02-F45` names this file among the stale ones).**
   * `shift-cash.ts` projects `cashier` from the envelope's `actor_user_id`, and the envelope
   * gets it from the PIN session — so the narrowing bites. Measured on the shipped app, one
   * store, one `shift.opened` by Hina: signed in as Hina (branch_manager, `own_branch`) the
   * seam serves that row; signed in as Ayesha (cashier, `own_shift`) it serves `[]`.
   */
  cashState: () =>
    checked(
      CashStateSchema,
      {
        shifts: deps.store.shifts(),
        days: deps.store.days(),
        unbound: deps.store.unboundSettlements(),
        unbound_drawer: deps.store.unboundDrawer(),
      },
      "cash state",
    ),

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
      // 02-F41/02-F45 — read at APPEND from the session, never from the payload and never
      // cached: a device that auto-locked (01-F26) must attribute to nobody rather than to
      // whoever walked away, and 01-F1 makes a false attribution permanent.
      actor_user_id: deps.session()?.user_id ?? null,
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

  /**
   * `C5` — the counter's highest-frequency act (~300×/shift), and the one place a price enters
   * the ledger.
   *
   * Everything money-bearing is decided HERE: the channel comes from the ORDER (`02-F1`, fixed at
   * creation and never inferred), the branch from this device's own identity (`01-F60`), and the
   * price from the catalog those two key into. The renderer supplied none of it.
   */
  addLine: (req: unknown): AppendResult => {
    const parsed: AddLineRequest = AddLineRequestSchema.parse(req);
    const order = deps.store.openOrders().find((row) => row.order_id === parsed.order_id);
    if (order === undefined) {
      // An orphan line is unremovable under 01-F1, so this refuses rather than appending against
      // an order id nothing holds.
      throw new Error(
        `addLine: no open order ${parsed.order_id} (01-F1 — a line cannot be orphaned)`,
      );
    }
    const unit_price_paisa = deps.priceOf(parsed.item_id, order.channel);
    if (unit_price_paisa === null) {
      // 01-F60: selling requires a number and inventing one is worse than refusing. NOT an
      // 01-F17 violation — the sale is not blocked, this one item is, and the rest of the order
      // completes normally. `menu()` has already greyed it with this reason.
      throw new Error(
        `addLine: ${parsed.item_id} has no price for channel ${order.channel} on this branch ` +
          `(01-F60) — it cannot be sold until the menu prices it`,
      );
    }
    const identity = deps.store.identity;
    const envelope = deps.store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      // The SECOND append site, and it needs the same read as the first: `02-F19` names "line
      // added" an attributed action, and it is the counter's highest-frequency one (~300×/shift).
      actor_user_id: deps.session()?.user_id ?? null,
      device_created_at: wallClock.now(),
      type: "order.line_added",
      schema_version: 1,
      payload: {
        order_id: parsed.order_id,
        line_id: newId(),
        item_id: parsed.item_id,
        qty: parsed.qty,
        // 01-F53 — captured at line-add and never re-read. A later price edit cannot retro-price
        // this order, which is what 14-F6 promises the owner as "open orders keep their price".
        unit_price_paisa,
      },
      refs: [],
    });
    return { id: envelope.id };
  },
});
