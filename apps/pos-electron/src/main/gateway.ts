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
  type CustomerLookup,
  type DeviceState,
  DeviceStateSchema,
  type KitchenTicket,
  KitchenTicketSchema,
  MenuChannelSchema,
  type MenuItem,
  type OpenOrder,
  OpenOrderSchema,
  type RecordCustomerRequest,
  RecordCustomerRequestSchema,
  type Session,
  type ToggleAvailabilityRequest,
  ToggleAvailabilityRequestSchema,
} from "../shared/ipc";
import { normalizeDialledPhone } from "./customer-phone";
import type { PanelFit } from "./window-options";

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
  /** The grid, greyed for ONE channel — see the `menu` implementation and `RestosBridge.menu`. */
  menu: (channel: unknown) => MenuItem[];
  /** `02-F23`/`02-F37`/`02-F43` — the `shift_cash` fold, for the Cash and Me surfaces. */
  cashState: () => CashState;
  append: (req: unknown) => AppendResult;
  /** `C5` — `01-F60`'s resolution and `01-F53`'s capture, both on the trusted side. */
  addLine: (req: unknown) => AppendResult;
  /** `02-F7` — the 86, with `01-F57`'s supersedes link built here from the fold's own heads. */
  toggleAvailability: (req: unknown) => AppendResult;
  /** `02-F27` — the caller's file, keyed by `01-F23`'s normalized number. A READ; appends nothing. */
  lookupCustomer: (dialled: unknown) => CustomerLookup;
  /** `02-F27` — file an unknown caller. One act, one or two events, one normalization rule. */
  recordCustomer: (req: unknown) => AppendResult;
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
  /**
   * `01-F56` / `DEC-SYNC-011` — the catalog refusal the cloud session is holding, or `null`.
   *
   * **REQUIRED, and the requirement is the point.** `seams:check` Rule B exists because an
   * *optional* member of an options bag that no call site passes is half this wave's named defect
   * by count — so this is declared required and a host that forgets it is a typecheck error
   * rather than a silent no-op. That still leaves the shape the rail *cannot* see (`AGENTS.md`:
   * "a port supplied with a STUB"): `catalogRefusal: () => null` compiles, satisfies the type,
   * keeps `seams:check` clean and takes the whole surface off the counter. That case is held by
   * `__acceptance__/catalog-health-seam.test.ts` and by nothing else.
   *
   * A GETTER for the same reason `blockedCursor` is one: the refusal lives on the CLOUD SESSION,
   * arrives and clears while the process runs, and a device with no cloud session (LAN-only,
   * `DEC-SYNC-009`) simply reports `null`.
   */
  catalogRefusal: () => { reason: string; have_version: number } | null;
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
  /**
   * `27-F11c` / `00 §5.7` — the glass this device is on measured against the layout's physical
   * floor, or `null` when it clears (`27-F16`).
   *
   * **This dep exists because the window's floor stopped refusing.** `minWidth: 1366` used to
   * make an undersized panel unreachable; under bring-your-own-hardware it clamps to the glass
   * instead (`window-options.ts`), so the till now STARTS on a screen the counter does not fit —
   * and a degradation nobody is told about is the dishonesty `00 §5.7` forbids, not a feature.
   *
   * REQUIRED and a GETTER, on `catalogRefusal`'s reasoning exactly: required so a host that
   * forgets it is a typecheck error rather than a silent no-op, a getter because a till moved to
   * another display changes this answer while the process runs.
   */
  panelFit: () => PanelFit | null;
  /**
   * `03-F14` / `03-F47` / `00 §7` layer 2 — the two threshold minutes for one order's TYPE.
   *
   * > 03-F47 … Thresholds stay org-configurable per order type (defaults: dine-in 10/20,
   * > delivery 15/25).
   *
   * This is `AgingPolicy.thresholdsFor` from `apps/pass-kds/src/main/aging.ts`, imported **across
   * the app boundary on purpose**. `03-F14` describes ONE org policy and `05-F1` alarms the
   * manager off *"the red aging threshold (03-F14)"*, so a counter reading neutral while the pass
   * reads red and the console alarms is not a cosmetic divergence — it is three surfaces
   * disagreeing about whether the food is late. A copy would also duplicate a **judgement call**
   * the FRs do not state (that module's pinned reading for takeaway, pickup and an absent type),
   * which is the one thing worst suited to living in two places. `apps/pass-kds` already imports
   * two pure `00 §7` resolvers out of this directory for exactly this reason and records the
   * shared-module refactor as OWED; this joins that debt rather than creating a second kind.
   *
   * **REQUIRED, on `catalogRefusal`'s and `panelFit`'s precedent in this same type:** an optional
   * member of an options bag that no call site passes is `seams:check` Rule B's shape and half
   * this wave's named defect by count, so a host that forgets this is a typecheck error rather
   * than a till silently ageing every order against a constant. What that still cannot see is a
   * host supplying a LITERAL pair — a stub is a supply — which is why
   * `__acceptance__/orders-aging.test.ts` §E reads the shipped call site.
   */
  aging: (order_type: string | null) => { amberAt: number; redAt: number };
};

/**
 * `01-F56`'s refusal reasons, as the operator hears them.
 *
 * **The model is `services/api`'s `IntegrationError`**, and the three questions it names are the
 * three an operator is actually asking. It says *what* failed (the menu, not the link), *whether
 * this is the till or the world*, and *what the state is* — because a cashier cannot fix a sync
 * fault and the only useful act is to hand the till to somebody who can call someone. That
 * person needs a sentence they can repeat, not a code.
 *
 * **The one distinction every sentence has to preserve** is the one the reachability chips beside
 * it cannot make: *this till reached the cloud and would not take what came back*, as against
 * *this till has not heard from the cloud*. The second is `Cloud OFF`, one element to the left,
 * and is not a fault at all (`00 §5.1` — offline is the normal operating state of a Pakistani
 * restaurant). Every string below therefore says what the TILL or the CLOUD did, never "offline",
 * "disconnected" or "no connection".
 *
 * The reasons are `sync-client`'s own (`catalog.ts`'s `CatalogApplyResult`, plus the session's
 * `no_progress`). `stale` is deliberately absent: `cloud-session.ts` never records one as a
 * refusal, because it means a redelivery of something already held — not a fault, and surfacing
 * it would put an amber chip on a healthy till.
 */
const CATALOG_REFUSAL_WORDS: Record<string, string> = {
  // `01-F56`: "a delta whose base does not match is REFUSED — the device asks for a snapshot
  // instead". The device is the one refusing, and it is refusing correctly — applying it would
  // silently diverge this till's menu from every other till's, which is undetectable here and
  // shows up as a mispriced item days later.
  needs_snapshot:
    "this till refused the update it was sent — it needs a full menu, not a change list",
  // The server stopped paging mid-fetch (`cloud-session.ts` bounds the request loop rather than
  // asking forever). The cloud answered and then stopped; the link is not the problem.
  no_progress: "the cloud stopped sending the menu part-way through",
  // The bytes did not parse. Named as arrival damage rather than as a link failure, because the
  // link delivered something — it was not what it claimed to be. **The cloud is named
  // explicitly**: the first draft read "the menu update did not arrive intact", which is the one
  // sentence of the four that said WHO did nothing at all, and `IntegrationError`'s first
  // property is *what failed*. "Something went wrong with the menu" sends a manager nowhere.
  malformed: "the menu the cloud sent did not arrive intact",
  // `01-F56`'s divergence detection: this device and the sender disagree about what a version
  // MEANS. The most serious of the four and the one most worth escalating, because it says two
  // tills in the same restaurant may be selling different menus under one version number.
  divergent: "this till and the cloud disagree about what this menu version contains",
};

/**
 * The operator's sentence for a refusal, and the fallback is deliberately not silence.
 *
 * An unrecognised reason still raises the chip and still names the code. `00 §5.7` asks a surface
 * to report what is TRUE, and "the till is refusing its menu for a reason this build has no words
 * for" is both true and actionable — where dropping it would hide a stuck catalog behind a
 * `sync-client` change that added a reason and never told this file. That is exactly the drift
 * this repo has been bitten by; a `Record` lookup returning `undefined` is a quiet default.
 */
const catalogRefusalWords = (reason: string): string =>
  CATALOG_REFUSAL_WORDS[reason] ?? `this till refused the menu it was sent (${reason})`;

type LineCell = { item_id: string; qty: number; unit_price_paisa: number; states: string[] };

/**
 * One saved address as the `customer_file` fold projects it into `addresses_json` (`02-F27`'s
 * *"saved addresses"*, `06-F9`'s capture, `09-F10`'s rider). Declared here for the same reason
 * `LineCell` above is: the store hands this side canonical JSON, and naming the shape at the
 * parse is what stops an `any` walking into the IPC payload.
 */
type SavedAddress = { address_id: string; address_text: string };

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
    // `01-F56` / `DEC-SYNC-011` — read on EVERY `deviceState()`, beside the blocked cursor it is
    // the sibling of. Both are cloud-session facts that arrive and clear under a running process,
    // so neither may be captured when the gateway is built.
    const stuck = deps.catalogRefusal();
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
        /**
         * `27-F11c` / `00 §5.7` — crosses whole, sentence included, for `CatalogRefusal`'s
         * reason: the operator-facing wording is formatted on the TRUSTED side of `18 §9`'s
         * bridge, never assembled in the renderer from a code, one copy per screen.
         *
         * `reason` crosses as well as `message` because the two states are not degrees of one
         * thing — *"this screen is too small"* is a measurement and *"this till cannot measure
         * its screen"* is an admission that the measurement does not exist — and `PanelHealth`
         * needs the distinction to pick `27-F12`'s WORD.
         */
        panelFit: deps.panelFit(),
        deviceLabel: deps.deviceLabel,
        businessDay: deps.businessDay(),
        training: deps.training,
        ...deps.reachability(),
        blocked: b
          ? { global_seq: b.global_seq, event_type: b.event_type, reason: b.reason }
          : null,
        /**
         * `01-F56` / `DEC-SYNC-011` (a) — the honesty UI's half of "a refusal is observable".
         *
         * The reason code becomes an operator sentence HERE, on the trusted side, and the version
         * crosses as a number. `AlarmSchema`'s header states the rule this follows: the
         * operator-facing wording never gets assembled in the renderer, because that puts it on
         * the untrusted end of `18 §9`'s bridge with one copy per screen.
         *
         * `have_version` is renamed to `version` on the way across on purpose — it is `27-F12`'s
         * NUMBER for the screen ("the menu this till is actually selling from"), and the wire
         * name asks a device-internal question the cashier is not being told to answer.
         */
        catalog: stuck
          ? { message: catalogRefusalWords(stuck.reason), version: stuck.have_version }
          : null,
        // `18 §6` — the lock surface reads the session through THIS seam and no other, and it
        // is the same read the envelope is stamped from below. A strip naming one cashier over
        // a ledger attributing another is `02-F45`'s disagreement with no rule for which wins.
        user,
      },
      "device state",
    );
  },

  openOrders: () => {
    /**
     * `03-F25`'s clock, read **once per call and never at construction** — this is a timer, and a
     * `now` captured when the gateway was built renders a perfect first frame and then freezes
     * for the rest of the shift.
     *
     * Branch time on both ends (`01-F43`/`01-F45`), exactly as `kitchenQueue()` below already
     * does one projection over: `confirmed_at` is the confirm anchor's `branch_created_at`,
     * stamped at APPEND by the confirming device, and this is that same basis plus the measured
     * offset — so the offset cancels in the difference and `DEC-TIME-001` (a)'s *"durations need
     * a consistent clock, not a correct one"* is what makes it legal. Reading `wallClock.now()`
     * alone would be the raw device clock, which is the value `01-F45` bans from a timing read
     * model. This is display arithmetic in the host app, never a fold reading a clock — that
     * would be `01-F34`.
     */
    const now = wallClock.now() + deps.store.branchTimeStatus().offset_ms;
    return deps.store.openOrders().map((row) =>
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
          /*
            `03-F25` — the aging timer, derived HERE because both of its inputs live on this side
            of the plane (`shared/ipc.ts`'s `aging` field says why at length).

            `typeof … === "number"` and not a truthiness test: `03-F14`'s basis is
            `order.confirmed`, so an order with no confirm anchor has **no age**, and the two
            answers an `??` reaches for are both lies — `?? 0` renders a fifty-six-year age and
            `?? now` renders `0 min` on an order that arrived forty minutes ago (`00 §5.7`). It
            also catches a row from a fold that predates the column, where the key is absent
            rather than null (`01-F54` — degrade, never drop: the order stays findable).

            The threshold table is consulted per ROW and with THAT row's own type, because
            `03-F47` puts X and Y per order type and one counter list holds mixed types all day.
            It is not consulted at all for an order with no age: thresholds without minutes are a
            status with no state for `27-F12` to render.

            Floored at 0 for `pass-queue.ts`'s stated reason — a `branch_provisional` clock
            (`01-F44`, offset 0) can legitimately sit behind a delivered confirm anchor, and a
            negative age teaches an operator to distrust the row. Floored to whole MINUTES rather
            than rounded, because 59 seconds is not a minute and rounding would tip a ticket into
            amber before the org's configured minute — `03-F47`'s *"colour that lies about how
            late the food is"* wearing the other sign.
          */
          aging:
            typeof row.confirmed_at === "number"
              ? {
                  minutes: Math.max(0, Math.floor((now - row.confirmed_at) / 60_000)),
                  ...deps.aging(row.order_type),
                }
              : null,
        },
        `open order ${row.order_id}`,
      ),
    );
  },

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

  menu: (channelArg: unknown) => {
    // Validated HERE, on the trusted side, like every other renderer-supplied value. It decides
    // GREYING only — `addLine` reads the ORDER's channel for the price (`01-F60`) — but an
    // unvalidated string would reach `priceOf` and quietly grey the whole grid for a typo.
    const channel = MenuChannelSchema.parse(channelArg);
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
      // `01-F60`, and the channel is the ORDER's, not this device's. A foodpanda order prices
      // from foodpanda's column, so the grid must ask the same question `addLine` will ask —
      // otherwise it offers a tile that the append then refuses, which is the grid lying about
      // what is sellable. This argument used to be pinned to `counter`, which was correct only
      // for as long as `Counter.tsx` could not start any other kind of order.
      const unpriced = deps.priceOf(entry.id, channel) === null;
      const reason = off ? (contested ? "86 — disputed" : "86") : unpriced ? "no price set" : null;
      return {
        id: entry.id,
        label: entry.name,
        ...(reason === null ? {} : { unavailable: true, unavailableReason: reason }),
        // `02-F7`'s own surface reads these two rather than `unavailable`, which is a DISPLAY
        // verdict collapsing the 86 and the unpriced case that `01-F60` calls opposites.
        //
        // Spread conditionally, on the SAME convention as `unavailable` directly above and for
        // the same reason: absence is the fold's own answer for an item it has never seen
        // (`merge.ts` — "an item the fold has never seen is SELLABLE"), so a tile with nothing
        // to say carries nothing rather than two false flags.
        ...(off ? { sold_out: true } : {}),
        ...(contested ? { contested: true } : {}),
      };
    });
  },

  /**
   * `02-F7` — the 86, and the only production emitter of `availability.changed` in the product.
   *
   * The fold, its lattice, the store table and the join above have all shipped since July 2026
   * and **nothing has ever appended one**, so a restaurant that ran out of a dish could not stop
   * RestOS selling it. This is the seam, and everything convergence-bearing is decided here.
   *
   * ── `01-F57`'s link, built from the store and never from the caller ──────────────────────────
   *
   * The FR makes this event converge on a carried `supersedes` array: the fold takes the maximal
   * un-superseded set and *"reads nothing else"* — no clock (`01-F45`), no id comparison
   * (`01-F34`). So a toggle that names the wrong heads does not fail loudly, it fails as a
   * PERMANENT contest: `01-F58` resolves a disagreement to unavailable, and an item whose other
   * head was never superseded stays 86'd for ever with no act that clears it. `merge.ts` exports
   * `head_ids_json` to prevent exactly that — *"superseding only the head your screen happened to
   * show leaves the other head standing"* — and this reads it fresh at append time.
   *
   * **Superseding ALL heads is what makes `01-F58`'s contest clearable in one operator act**, and
   * it is why the request carries a target state rather than a flip: a flip read off a stale
   * screen inverts twice, and a contested item has no single state to flip from.
   *
   * ── What it is NOT ──────────────────────────────────────────────────────────────────────────
   *
   * Not a catalog edit (`01-F22`, `14 §1`: availability is operational and the back office
   * explicitly does not host it). Not an `01-F17` block either — `01-F59` keeps an 86'd item
   * deliberately sellable and `02-F31` owns the oversell path, so nothing here refuses a sale.
   */
  toggleAvailability: (req: unknown): AppendResult => {
    const parsed: ToggleAvailabilityRequest = ToggleAvailabilityRequestSchema.parse(req);
    // The item must EXIST. `01-F55` keeps a tombstoned entry resolvable for display, so `lookup`
    // is deliberately not the test — 86-ing a deleted item would append a toggle nothing can ever
    // see or clear, permanently (`01-F1`), against a row the grid does not draw.
    const known = deps.menu().some((entry) => entry.id === parsed.item_id);
    if (!known) {
      throw new Error(
        `toggleAvailability: ${parsed.item_id} is not a live catalog item (01-F55) — ` +
          `a toggle against it could never be seen or cleared`,
      );
    }
    // Read at APPEND, from the store this side alone holds. `projectItemKey`'s row is the fold's
    // own answer for one item; an item never toggled has no row and supersedes nothing, which is
    // the correct empty link rather than a special case.
    const heads = deps.store.availability().find((row) => row.item_id === parsed.item_id);
    const supersedes: string[] = heads === undefined ? [] : JSON.parse(heads.head_ids_json);
    const identity = deps.store.identity;
    const envelope = deps.store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      // `02-F19` names "availability toggle" among the attributed actions in terms, and `02-F41`
      // makes that whoever's PIN is in. Read at append like the other two write sites.
      actor_user_id: deps.session()?.user_id ?? null,
      device_created_at: wallClock.now(),
      type: "availability.changed",
      schema_version: 1,
      payload: { item_id: parsed.item_id, available: parsed.available, supersedes },
      refs: [],
    });
    return { id: envelope.id };
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

  /**
   * `02-F27`'s lookup — *"customer file lookup by normalized phone → name, saved addresses"* —
   * and the first thing in this product to reach the `customer_file` fold.
   *
   * That fold, its convergence rules and its store table all shipped in August 2026 and
   * `device-store.ts`'s own comment on `customers()` said what was left: *"the seam STOPS HERE …
   * no app calls this method and no shipping code emits either `customer.*` type"*. This is the
   * call, and `recordCustomer` below is the emitter.
   *
   * ── It APPENDS NOTHING, and that is a rule rather than an implementation detail ─────────────
   *
   * `02-F27` puts creation AFTER the lookup, as the operator's own act (*"unknown number → inline
   * customer creation"*). A lookup that upserted would file every wrong number, every hang-up and
   * every half-typed digit string as a permanent identity `01-F1` forbids correcting in place.
   *
   * ── A number that is not yet a number is a STATE ────────────────────────────────────────────
   *
   * `phone_e164: null` for anything `normalizeDialledPhone` cannot key. The operator is mid-call
   * and still typing, so this is the field's NORMAL condition — it must be a value the screen can
   * render, never an exception it has to catch (`01-F17`, `27-F29`).
   */
  lookupCustomer: (dialled: unknown): CustomerLookup => {
    const phone_e164 = normalizeDialledPhone(dialled);
    if (phone_e164 === null) return { phone_e164: null, known: null };
    // The fold's own projection, read fresh. `01-F23` keys the identity BY this number, so the
    // find is on a payload VALUE and reads no ordering metadata (`01-F34`).
    const row = deps.store.customers().find((r) => r.phone_e164 === phone_e164);
    if (row === undefined) return { phone_e164, known: null };
    return {
      phone_e164,
      known: {
        // `null` here is TWO facts the fold deliberately does not separate for this screen:
        // no name was ever stated (`06-F11`), or two devices stated different ones and
        // `01-F31` refuses to pick a winner. Both render as "no name", which is honest; the
        // resolver `DEC-CUST-001` will eventually name is the surface that tells them apart,
        // and inventing one here would be implementing against a `proposed` decision.
        name: row.name,
        // Sorted by `address_id` by the fold, and passed through in that order — a re-sort here
        // would be the projection's own ordering decided twice (`26 §8`).
        addresses: JSON.parse(row.addresses_json) as SavedAddress[],
      },
    };
  },

  /**
   * `02-F27` — *"unknown number → inline customer creation (`customer.created`,
   * `customer.address_added`)"*. ONE operator act, one or two events, and the only production
   * emitter of either type in this product.
   *
   * ── `01-F23`'s key is derived HERE, never accepted from the renderer ────────────────────────
   *
   * `registry.ts`: *"Normalization belongs at the WRITER, upstream of `parseEvent`."* The request
   * carries the digits she pressed; `normalizeDialledPhone` is the one rule that turns them into
   * an identity, and it is the SAME rule `lookupCustomer` applies directly above. That sharing is
   * the whole point — two normalizers that are each self-consistent and disagree with each other
   * make `02-F28`'s repeat customer invisible to the screen built to find her, and every unit test
   * of either half passes.
   *
   * ── A refusal here refuses NOTHING else (`01-F17`) ─────────────────────────────────────────
   *
   * An unusable number throws rather than inventing a key by padding, truncating or writing the
   * raw digits — a `customer.created` under a key no lookup will ever produce is permanent
   * (`01-F1`). It is not an `01-F17` block: `registry.ts` says so in terms (*"a refused customer
   * record does not refuse a sale: `08-F2` has aggregator orders reach settlement while writing no
   * customer file at all"*), and the order, its lines and its confirm are untouched by this call.
   *
   * ── Two events, one key ────────────────────────────────────────────────────────────────────
   *
   * The address carries the SAME `phone_e164` as the create rather than a handle to it (`26 §4`'s
   * late-resolving-entity trap; `registry.ts` declares the field for exactly this reason), and its
   * `address_id` is a MINTED business key (`26 §8`) so a re-emitted address is one entry and not
   * two. Written after the create so a partial failure leaves the identity rather than an orphan
   * address — though neither can be rolled back, which is why the key is validated before either.
   */
  recordCustomer: (req: unknown): AppendResult => {
    const parsed: RecordCustomerRequest = RecordCustomerRequestSchema.parse(req);
    const phone_e164 = normalizeDialledPhone(parsed.dialled);
    if (phone_e164 === null) {
      throw new Error(
        `recordCustomer: ${JSON.stringify(parsed.dialled)} is not a phone number this device ` +
          "can key (01-F23) — recording it would file a customer under a number no lookup will " +
          "ever produce, permanently (01-F1). NOT an 01-F17 block: the order is unaffected",
      );
    }
    const identity = deps.store.identity;
    const envelope = deps.store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      // The fourth append site, and it takes the same read as the other three: `02-F41` makes
      // attribution whoever's PIN is in, read at APPEND rather than cached.
      actor_user_id: deps.session()?.user_id ?? null,
      device_created_at: wallClock.now(),
      type: "customer.created",
      schema_version: 1,
      // `name` is required-and-nullable on the payload and required-and-nullable on the request,
      // so a stated absence (`06-F11`) travels as itself and is never coerced into `""`.
      payload: { phone_e164, name: parsed.name },
      refs: [],
    });
    if (parsed.address_text !== undefined) {
      deps.store.append({
        id: newId(),
        org_id: identity.org_id,
        branch_id: identity.branch_id,
        device_id: identity.device_id,
        actor_user_id: deps.session()?.user_id ?? null,
        device_created_at: wallClock.now(),
        type: "customer.address_added",
        schema_version: 1,
        payload: { phone_e164, address_id: newId(), address_text: parsed.address_text },
        refs: [],
      });
    }
    // The CREATE's envelope id. One act has one result, and the create is the event that brings
    // `01-F23`'s identity into existence — the address is a fact about an identity that now exists.
    return { id: envelope.id };
  },
});

/**
 * An append whose actor is **STATED** rather than read from the live session.
 *
 * `05-F29` (a) — *"only (a) puts the verified credential and the ledger write in the same
 * process"* — and its prerequisite clause names this seam by name: *"an append accepting an
 * explicitly verified actor rather than the session's"*.
 *
 * ── Why the three appends above cannot serve `approval.granted` ──────────────────────────────
 *
 * They stamp `actor_user_id: deps.session()?.user_id ?? null` unconditionally, which is exactly
 * right for `02-F41`: attribution is whoever's PIN is in. But `registry.ts` requires the envelope
 * of a grant to name the **APPROVER** — *"a grant whose envelope named the cashier would be the
 * local path's defect committed on the remote one: the session moved, one identity where there
 * must be two"* — and `verifyApprover` deliberately does NOT move the session, because moving it
 * would sign the cashier out and re-attribute her next twenty orders to whoever authorised one
 * paid-out, permanently (`02-F41` + `01-F1`). So the till could verify a manager and had no way to
 * write down that she was the one who decided.
 *
 * ── The three alternatives, refused ──────────────────────────────────────────────────────────
 *
 * 1. **Move the PIN session for the duration.** The defect above with a shorter window: every
 *    concurrent append in the process — `kot.printed`, a line-advance edge, another tab's
 *    line-add — is attributed to the manager for the width of an `await`.
 * 2. **An optional `actor_user_id` on `AppendRequest`.** That field crosses the IPC bridge, so a
 *    compromised renderer could name its own actor. `18 §9` makes main the trusted side precisely
 *    so this cannot be expressed, which is why the actor is a SEPARATE POSITIONAL ARGUMENT here
 *    and `AppendRequestSchema` must never gain the field.
 * 3. **A `Gateway` member.** `gateway.test.ts` frames that type as *"the renderer's whole
 *    surface"* and pins its member count. An append that names an arbitrary actor has no business
 *    on the renderer's surface at all, so this is declared BESIDE it and reaches no IPC channel.
 *
 * ── What it does not do ──────────────────────────────────────────────────────────────────────
 *
 * It takes no `session` dep, so it cannot read, move or refresh one — the property is structural
 * rather than a promise. And it never coerces an unusable actor: `actor_user_id` is written
 * verbatim, so an empty string is refused by `envelope.ts`'s `z.string().min(1).nullable()` one
 * layer down and nothing partial is left behind (`01-F1`). Writing `actor || null` here would
 * append an UNATTRIBUTED event claiming an approval, which is worse than the throw.
 */
export type VerifiedAppend = (actor_user_id: string, req: unknown) => AppendResult;

export type VerifiedAppendDeps = {
  /** The store alone. No session, and that absence is the safety property — see above. */
  store: Pick<DeviceStore, "identity" | "append">;
};

export const createVerifiedAppend =
  (deps: VerifiedAppendDeps): VerifiedAppend =>
  (actor_user_id: string, req: unknown): AppendResult => {
    // The SAME schema and the SAME envelope construction as `append` above, so the fields
    // `01-F43` stamps at append cannot be lost by a second, hand-written envelope beside it —
    // `02-F45`'s "two sources for one fact", arrived at through duplication.
    const parsed: AppendRequest = AppendRequestSchema.parse(req);
    const identity = deps.store.identity;
    const envelope = deps.store.append({
      id: newId(),
      org_id: identity.org_id,
      branch_id: identity.branch_id,
      device_id: identity.device_id,
      actor_user_id,
      device_created_at: wallClock.now(),
      type: parsed.type,
      schema_version: 1,
      payload: parsed.payload,
      refs: parsed.refs,
    });
    return { id: envelope.id };
  };
