import { newId } from "@restos/domain";
import type { DeviceStore, UnlockRefusal, UnlockResult } from "@restos/sync-client";
import { z } from "zod";
import type { KitchenState, MenuItem, OpenOrder } from "../shared/ipc";
import type { TerminalAuthorization } from "./authorize";
import type { Gateway, VerifiedAddLine, VerifiedAppend } from "./gateway";

/**
 * # `04-F21` — the order pad's half of the till, with no socket in it
 *
 * A waiter's tablet is a **remote renderer of this device** (`04-F21`): it holds no store, no
 * device identity and no credential beyond an opaque handle, and every act it performs travels
 * here as an *intent* which this module verifies, authorizes and appends. `05-F28` measured why
 * it cannot be anything else — a browser cannot stamp `01-F62`'s branch-scoped envelope — and
 * `transport-ws.ts`'s mutual-TLS listener measures why it cannot join the LAN mesh either.
 *
 * **This file is the trust boundary. `terminal-server.ts` is only the wire.** The split is the
 * point: every property below is asserted by driving THIS module directly, so no test of the
 * security model depends on a socket, and a future transport (a different port, a different
 * framing) cannot quietly acquire different rules.
 *
 * ## The one thing that must never happen here
 *
 * `gateway.ts`'s verified-append header names the trap in the renderer's direction: *"a compromised
 * renderer could name its own actor. `18 §9` makes main the trusted side precisely so this cannot
 * be expressed."* A tablet on the shop Wi-Fi is further from trusted than the renderer, so
 * **`user_id` never arrives from the tablet at all**. It is minted here, at sign-in, after this
 * module has verified a PIN against `01-F28`'s synced Argon2id hashes, and it is handed out only
 * as an unguessable handle. `resolve()` is the one place a handle becomes an identity, and
 * `authorizeTerminal` and `appendAs` are reached with that resolved id and with nothing else.
 *
 * ## What it deliberately does not hold
 *
 * No session it can move. `deps.verifyWaiter` is a function seam over a SECOND `createPinSession`,
 * exactly as `authorizeEscalation.verifyApprover` is — because `unlock()` MOVES the till's session,
 * and a waiter signing in at a tablet must not sign the cashier out of the counter. `02-F41` wants
 * two identities on one device, not one that keeps changing hands (`01-F1` makes a mis-attribution
 * permanent).
 */

/** `02-F1` — both axes at creation, and NEITHER is the tablet's to choose. */
const TERMINAL_CHANNEL = "counter";
/**
 * `04-F21` — a waiter standing at a table in the restaurant is originating an in-restaurant
 * dine-in order, by construction. There is no other kind of order this surface can take, so
 * `02-F1`'s two axes are FIXED HERE rather than offered — which is also what stops a compromised
 * tablet ringing an order at another channel's prices (`01-F60`: the channel is the price key).
 * `27-F4`'s no-default ruling is about a COUNTER operator choosing between four channels; a pad
 * with one possible answer is not choosing.
 */
const TERMINAL_ORDER_TYPE = "dine_in";

/**
 * `01-F26`'s idle auto-lock, applied to a handle rather than to a process-local session.
 *
 * A tablet is put down on a table and walked away from far more readily than a till is, and
 * `04-F2` already inherits the auto-lock for shared handhelds. The number is the device layer's
 * (`00 §7` layer 3) and is passed in, never defaulted here — a timeout living inside this module
 * is the optional-means-skip hole one layer up.
 */
export type TerminalDeps = {
  /**
   * `01-F28`/`01-F61` — verify a PIN for this user WITHOUT moving any session. The host builds it
   * from `createPinSession` over the same registry and the same DURABLE attempt store the counter
   * uses, so a waiter's failures at the pad and at the till count against ONE per-(device, user)
   * counter and survive a relaunch.
   */
  verifyWaiter: (user_id: string, pin: string) => Promise<UnlockResult>;
  /** `04-F23`'s two gates. Built in `authorize.ts` so the matrix is read in exactly one place. */
  authorize: TerminalAuthorization;
  /** `04-F22` (c) — appends naming an explicitly verified actor. Neither reads a session. */
  appendAs: VerifiedAppend;
  addLineAs: VerifiedAddLine;
  /**
   * `04-F27` — **what a COMPLETED append causes on this till, and it is the host's own function
   * rather than this module's list.**
   *
   * A confirm rung at the counter reaches the kitchen because `main/index.ts` hangs the KOT
   * handoff, `02-F31`'s line advance and the renderer's re-read off the completed append. A
   * confirm rung on a tablet reached NONE of them: every consequence lived inside the renderer's
   * IPC handler, so `04-F24`'s one load-bearing ack — *"a KOT that has not reached the spooler is
   * food that is not being cooked"* — was false on this surface from the first order.
   *
   * It is REQUIRED, so a host that forgets it is a typecheck error, and it takes the request this
   * module just appended rather than an intent: the consequences are keyed on `01 §4` event types
   * and a second vocabulary here would be a fork of the host's own reading (`02-F45`).
   *
   * ── `04-F27` (c) — it also carries WHO, and that half was missing ────────────────────────────
   *
   * Handing the pad the host's consequence function handed it appends that read the till's live
   * SESSION, so a waiter's SEND wrote an `order.line_state_changed` naming the CASHIER standing
   * at the counter — or nobody, if the till was locked. The actor of the append this module just
   * made travels WITH it: it is the resolved waiter, never a session, and never anything the
   * tablet sent (`04-F22` (c)).
   */
  onAppended: (
    req: { type: string; payload: Record<string, unknown> },
    actor_user_id: string,
  ) => void;
  /** The till's own converged projections. The pad renders these and holds none of them. */
  reads: Pick<Gateway, "menu" | "openOrders">;
  /** `01-F61`'s identification grid — `active` members only, in the roster's own order. */
  store: Pick<DeviceStore, "staff">;
  idle_lock_ms: number;
  now: () => number;
  /** Unguessable handle bytes. Injected so a test can drive collisions; never defaulted. */
  newHandle: () => string;
};

export type TerminalRoster = { readonly user_id: string; readonly display_name: string }[];

export type SignInResult =
  | { readonly ok: true; readonly handle: string; readonly display_name: string }
  | { readonly ok: false; readonly reason: UnlockRefusal | "malformed" };

/**
 * What the pad renders, in one read.
 *
 * **`user_id` is absent on purpose and its absence is a security property, not a tidiness one.**
 * The tablet is shown a NAME (`02-F19`: attribution is never anonymous) and never the identifier
 * the ledger is keyed by. `04-F22` (c).
 *
 * ⚠ **THE CLAIM HERE USED TO BE WIDER THAN THE PROPERTY, AND THE PROPERTY IS THE INTERESTING ONE.**
 * It said there was nothing *"on the glass — or in the response body, or in the browser's
 * storage"* for a compromised pad to put in an actor field. That is true of THIS shape and false
 * of the wire: `roster()` returns every active member's `user_id` to any enrolled terminal BEFORE
 * any sign-in, because that is how a person is named at sign-in, and `Pad.tsx` sends one back.
 * What actually holds — and what `04-F22` (c) is really about — is that **an actor is never taken
 * from anything the tablet sends**: it is resolved from the handle in `resolve()`, and
 * `authorizeTerminal` and `appendAs` are reached with that resolved id and with nothing else. A
 * pad that posted a colleague's `user_id` in every field of every request would change no
 * envelope. *Stated precisely because a prose claim retires the assertion the next session would
 * have written (`AGENTS.md` `L11`) — and a security claim that overstates is the direction that
 * invites someone to "harden" a path that was never the weak one.*
 */
export type TerminalView = {
  readonly waiter: string;
  readonly menu: MenuItem[];
  readonly tables: TerminalTable[];
};

/**
 * One OPEN ORDER that names at least one table.
 *
 * ⚠ **`table_ids` is a SET, and the design this was built from assumed a scalar.** `01-F19` lets
 * two devices open one physical table while partitioned and rules that **both orders stand**;
 * `order.table_assigned` carries a supersedes DAG whose divergent case `merge.ts` refuses to
 * resolve, and it writes `table_conflict` for exactly that. So an order can legitimately name two
 * tables, and a pad that rendered `table_ids[0]` would be picking a winner a fold declined to pick
 * (`01-F31`). It is rendered as what it is and badged (`04-F12`: the badge shows on EVERY surface
 * that shows the table, not only on the devices involved).
 */
export type TerminalTable = {
  readonly table_ids: readonly string[];
  readonly order_id: string;
  readonly lines: number;
  readonly total_paisa: number;
  /** `02-F8` — whether this order has been fired, so the pad can say what SEND will do. */
  readonly confirmed: boolean;
  /** `01-F19` — this order's table assignment is contested and nothing here resolves it. */
  readonly conflict: boolean;
  /**
   * `02-F55`/`04-F34` — **whether the KITCHEN has this order's lines**, projected by main off
   * `03-F4`'s durable spool, and NOT the same question as `confirmed` above.
   *
   * `04-F29` read what SEND owes from *"the till holds lines and has never confirmed"*, which is
   * `confirmed`'s question; `04-F24`'s is *"does any station lack a chit"*. The pad bridged the
   * gap with a local flag, and one table re-selection cleared it — so SEND read *nothing to send*
   * over an order whose own state was `owed`. `02-F55` had already ruled that no client may hold
   * this (*"a renderer flag is defeated by a relaunch and by `02-F11`'s second terminal"*) and
   * this row DROPPED the field it ships on, which is `04-F28`'s defect one field over.
   *
   * **Optional, because the projection is** (`GatewayDeps.kot` is a supplied-or-not seam): absent
   * means *this host did not say*, which `01-F54` degrades to what the pad knew before it, and
   * `"none"` means *said, and the kitchen has not been told*. Both leave SEND live; only one is a
   * claim.
   */
  readonly kitchen?: KitchenState;
};

export type TerminalActResult =
  | { readonly ok: true; readonly order_id: string }
  | { readonly ok: false; readonly reason: TerminalRefusalReason; readonly detail?: string };

export type TerminalRefusalReason =
  /** No handle, an unknown handle, or one `01-F26`'s idle lock has retired. */
  | "not_signed_in"
  /** `04-F23` gate 1 or gate 2 — the surface refused it, or the matrix did. */
  | "not_permitted"
  /** The intent did not parse. Kept distinct so the pad never renders a parse error as a refusal. */
  | "malformed"
  /** The append itself refused — an unpriced item (`01-F60`), an orphan line (`01-F1`). */
  | "refused";

export type Terminal = {
  roster: () => TerminalRoster;
  signIn: (user_id: unknown, pin: unknown) => Promise<SignInResult>;
  signOut: (handle: unknown) => void;
  view: (handle: unknown) => TerminalView | null;
  act: (handle: unknown, intent: unknown) => TerminalActResult;
};

/**
 * `04-F25` — the table label, normalized at the WRITER.
 *
 * The pattern and its argument are `customer-phone.ts`'s: *"a normalizer in a fold is a POLICY in
 * a fold"*, so the writer owns it and the ledger keeps only the form. What is normalized is the
 * minimum that stops one table becoming two rows — surrounding space, and runs of inner space —
 * because `01-F1` freezes whatever lands and `04-F12`'s table view groups by exact match, so
 * `"Roof 3"` and `"Roof  3"` would be two tables in the same room.
 *
 * **Case is deliberately NOT folded.** `04-F25` calls this *the operator's label*, and a label is
 * what the owner wrote: upper-casing `Roof 3` into `ROOF 3` would put a string on the counter's
 * order row and on the KOT that nobody chose. The cost is stated rather than hidden — `roof 3`
 * and `Roof 3` are two tables — and it is the cost the FR's own reading takes, because the
 * alternative changes user content, which commandment 7 makes the one thing we render faithfully.
 *
 * `null` for anything that is not a label: an empty string, or whitespace alone. `01-F1` makes an
 * order against an unnameable table permanent, and `order.created.table_id` is `min(1)` anyway, so
 * refusing here is the same answer arriving before the ledger rather than after.
 */
export const normalizeTableLabel = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const label = raw.trim().replace(/\s+/g, " ");
  return label === "" ? null : label;
};

const OpenIntent = z.object({ kind: z.literal("open"), table_id: z.string() });
const AddLineIntent = z.object({
  kind: z.literal("add_line"),
  order_id: z.string().min(1),
  item_id: z.string().min(1),
  qty: z.number().int().positive(),
});
const RemoveLineIntent = z.object({
  kind: z.literal("remove_line"),
  order_id: z.string().min(1),
  line_id: z.string().min(1),
});
const ConfirmIntent = z.object({ kind: z.literal("confirm"), order_id: z.string().min(1) });

/**
 * `04-F23`'s surface, stated as a CLOSED union rather than as a free `AppendRequest`.
 *
 * The renderer's bridge takes an `AppendRequest` and guards it; a terminal does not, and the
 * difference is deliberate. An intent names an ACT the pad can perform, so the event type is a
 * property of the intent and never a field the tablet fills in — which means gate 1 cannot be
 * approached by a request that merely *claims* to be a line-add. `authorizeTerminal` still asks
 * the question for every one of them, because a closed union in TypeScript is not a runtime gate
 * and the matrix must refuse the person as well as the surface.
 */
const TerminalIntent = z.discriminatedUnion("kind", [
  OpenIntent,
  AddLineIntent,
  RemoveLineIntent,
  ConfirmIntent,
]);

type Intent = z.infer<typeof TerminalIntent>;

/** Which `01 §4` type each intent causes. The ONE place an intent becomes an event type. */
const EVENT_TYPE_OF: Readonly<Record<Intent["kind"], string>> = {
  open: "order.created",
  add_line: "order.line_added",
  remove_line: "order.line_removed",
  confirm: "order.confirmed",
};

type Session = { user_id: string; display_name: string; last_seen: number };

export const createTerminal = (deps: TerminalDeps): Terminal => {
  /**
   * Handles live in this process and nowhere else — no file, no store table, no cookie the till
   * would honour after a relaunch. `04-F22`'s open question 3 is answered by that absence: a till
   * that restarts mid-service comes back with every pad signed out, and the waiter re-enters her
   * PIN. That is the same answer `01-F26` gives the counter (a relaunch is a locked till), and the
   * alternative — a handle that survives a restart — is a bearer credential with a longer life
   * than the process that issued it, which is what `01-F72` (a) refuses.
   */
  const sessions = new Map<string, Session>();

  /**
   * `01-F26`'s idle lock, evaluated on READ rather than on a timer, exactly as `createPinSession`
   * does. A timer would have to be cancelled on every act and would go on holding a session alive
   * inside a till nobody is using.
   */
  const resolve = (handle: unknown): Session | null => {
    if (typeof handle !== "string" || handle === "") return null;
    const session = sessions.get(handle);
    if (session === undefined) return null;
    const now = deps.now();
    if (now - session.last_seen >= deps.idle_lock_ms) {
      sessions.delete(handle);
      return null;
    }
    session.last_seen = now;
    return session;
  };

  const refuse = (reason: TerminalRefusalReason, detail?: string): TerminalActResult =>
    detail === undefined ? { ok: false, reason } : { ok: false, reason, detail };

  /**
   * `04-F12`/`04-F33` — **the orders this surface can see, in ONE place.**
   *
   * `view()` renders this list and `act()` refuses anything outside it, from the same read: two
   * readings of one scope can disagree, and the disagreement that matters is the permissive one
   * (`02-F45`).
   */
  const visibleOrders = (): TerminalTable[] =>
    deps.reads.openOrders().filter(hasTable).map(tableOf);

  return {
    roster: () =>
      deps.store.staff.list().map((member) => ({
        user_id: member.user_id,
        // `01-F54` — degrade to the identifier rather than render nothing. A roster row with no
        // name is still a person who must be able to sign in.
        display_name: member.display_name ?? member.user_id,
      })),

    signIn: async (user_id: unknown, pin: unknown): Promise<SignInResult> => {
      // Shape first, and refused as `malformed` rather than as a PIN failure: charging `01-F61`'s
      // durable counter for a request that never named a user would let anyone lock out a waiter
      // by posting nonsense.
      if (typeof user_id !== "string" || user_id === "") return { ok: false, reason: "malformed" };
      if (typeof pin !== "string" || pin === "") return { ok: false, reason: "malformed" };
      const verified = await deps.verifyWaiter(user_id, pin);
      if (!verified.ok) return { ok: false, reason: verified.reason };
      const handle = deps.newHandle();
      const member = deps.store.staff.lookup(user_id);
      sessions.set(handle, {
        user_id,
        display_name: member?.display_name ?? user_id,
        last_seen: deps.now(),
      });
      return { ok: true, handle, display_name: member?.display_name ?? user_id };
    },

    signOut: (handle: unknown): void => {
      if (typeof handle === "string") sessions.delete(handle);
    },

    view: (handle: unknown): TerminalView | null => {
      const session = resolve(handle);
      if (session === null) return null;
      return {
        waiter: session.display_name,
        // The channel is the TERMINAL's, not a parameter, so the grid greys exactly what
        // `addLineAs` will refuse (`01-F60`) — the same identity `menu()`'s own note requires
        // between what a surface offers and what its append accepts.
        menu: deps.reads.menu(TERMINAL_CHANNEL),
        tables: visibleOrders(),
      };
    },

    act: (handle: unknown, intent: unknown): TerminalActResult => {
      const session = resolve(handle);
      // Resolved BEFORE the intent is parsed: a request with no valid handle must not be able to
      // learn anything about which shapes this till accepts.
      if (session === null) return refuse("not_signed_in");
      const parsed = TerminalIntent.safeParse(intent);
      if (!parsed.success) return refuse("malformed");
      const act = parsed.data;

      // `04-F23` — both gates, for every intent, against the resolved id. Asked BEFORE anything is
      // appended and before the table label is even normalized, so a refusal costs nothing and
      // leaves nothing behind (`01-F1`).
      const verdict = deps.authorize(session.user_id, EVENT_TYPE_OF[act.kind]);
      if (!verdict.ok) return refuse("not_permitted");

      /**
       * `04-F33` — **the pad may act only on an order its own view lists**, and this was missing
       * entirely: `04-F23` bounds this surface by EVENT TYPE, and every intent but `open` carries
       * an order id nothing checked.
       *
       * Measured with `view()` listing NO tables at all: the pad removed a Rs 450 line off a
       * COUNTER order (total 45000 → 0, permanent under `01-F1`) and confirmed a `foodpanda`
       * order, whose `08-F17` receivable then landed as a `payment.recorded` — the very type
       * gate 1 refuses by name, arriving as a CONSEQUENCE rather than as an act.
       *
       * **Not an `01-F17` block:** an order this pad opened names a table by construction, so it
       * is in this list; an order that is not is one no waiter standing at a table is ringing.
       * Refused BEFORE anything is appended, so nothing is left behind (`01-F1`).
       */
      if (act.kind !== "open" && !visibleOrders().some((row) => row.order_id === act.order_id)) {
        return refuse("not_permitted");
      }

      try {
        switch (act.kind) {
          case "open": {
            const table_id = normalizeTableLabel(act.table_id);
            if (table_id === null) return refuse("malformed");
            const order_id = newId();
            // `02-F1`'s two axes, supplied by this module and never by the tablet.
            const payload = {
              order_id,
              channel: TERMINAL_CHANNEL,
              order_type: TERMINAL_ORDER_TYPE,
              table_id,
            };
            deps.appendAs(session.user_id, { type: "order.created", payload, refs: [] });
            // `04-F27` — AFTER the append, never before and never instead: the ledger is the
            // durable point (`01-F2`) and a consequence that ran first would be a screen telling
            // a kitchen about food no store holds.
            deps.onAppended({ type: "order.created", payload }, session.user_id);
            return { ok: true, order_id };
          }
          case "add_line": {
            deps.addLineAs(session.user_id, {
              order_id: act.order_id,
              item_id: act.item_id,
              qty: act.qty,
            });
            /**
             * `04-F27`, and the payload here is deliberately NOT the appended one.
             *
             * `addLineAs` resolves the price itself (`01-F60`, `01-F53`) and hands back an id, so
             * this module never holds the money-bearing payload — and re-stating one would be a
             * second source for a figure the ledger already owns (`02-F45`). The TYPE and the
             * ORDER ID are the whole of what a consequence reads, and the counter's own
             * `CHANNELS.addLine` handler reaches exactly one of them (the re-read) for the same
             * reason: no `01 §4` consequence hangs off a line-add.
             */
            deps.onAppended(
              {
                type: "order.line_added",
                payload: { order_id: act.order_id },
              },
              session.user_id,
            );
            return { ok: true, order_id: act.order_id };
          }
          case "remove_line": {
            /**
             * `02-F49`'s confirm boundary is not re-implemented here — and until August 2026 that
             * sentence stood beside an append that **did not reach it at all**.
             *
             * ⚠ **The claim was true of `Gateway.append` and false of `appendAs`.** The guard had
             * exactly one call site, inside the RENDERER's method, and `createVerifiedAppend`
             * built its own envelope beside it — so a tablet removed a line off a confirmed,
             * cooking order that the counter refuses by name, permanently (`01-F1`) and with no
             * `01-F30` term to reconcile it. `04-F27` moved every rule onto one road
             * (`gateway.ts`'s `checkedAppend`), so this comment is now a description of where the
             * boundary IS rather than a promise about where it might be.
             *
             * The refusal arrives here as a throw and leaves as `refused` with the till's own
             * sentence, which is what carries `02-F49`'s way out — a `void.recorded` with an
             * approver at the counter — to the waiter holding the tablet.
             */
            const payload = { order_id: act.order_id, line_id: act.line_id };
            deps.appendAs(session.user_id, { type: "order.line_removed", payload, refs: [] });
            deps.onAppended({ type: "order.line_removed", payload }, session.user_id);
            return { ok: true, order_id: act.order_id };
          }
          case "confirm": {
            const payload = { order_id: act.order_id };
            deps.appendAs(session.user_id, { type: "order.confirmed", payload, refs: [] });
            // `04-F27`/`03-F2` — **THE KITCHEN HANDOFF, and it is the reason this seam exists.**
            // The confirm is already in the ledger by the line above; only then does paper get
            // involved (`01-F17` — a sale is never blocked by a printer). Without this call the
            // pad's SEND is a screen that says the food is on the till while no station has been
            // told, which is exactly what `04-F24` forbids.
            deps.onAppended({ type: "order.confirmed", payload }, session.user_id);
            return { ok: true, order_id: act.order_id };
          }
        }
      } catch (cause) {
        // `01-F17` — the till is not stopped by a pad's bad request. An unpriced item, an orphan
        // line or a schema refusal is THIS act failing, and the message is the till's own so the
        // pad can say what happened rather than inventing a reason.
        return refuse("refused", cause instanceof Error ? cause.message : String(cause));
      }
    },
  };
};

/**
 * A counter order names no table at all, so the pad's list is the subset that does. The field is
 * optional at the plane boundary, and `undefined` here is a fixture or a build predating it —
 * both are "no table", neither is an error (`01-F54`).
 */
const hasTable = (order: OpenOrder): boolean => (order.table_ids ?? []).length > 0;

const tableOf = (order: OpenOrder): TerminalTable => ({
  table_ids: order.table_ids ?? [],
  order_id: order.order_id,
  lines: order.lines.length,
  // The ENGINE's own derivation, carried through untouched (`26 §8`). A pad that summed the lines
  // itself would be a second implementation of a money figure the receipt also renders.
  total_paisa: order.total_paisa,
  // `null` is "confirmed and said so"; `undefined` is "this projection did not say" — the
  // distinction `shared/ipc.ts` draws on this very field. Neither is a confirm.
  confirmed: typeof order.confirmed_at === "number",
  // The fold's own flag, never re-derived from the set's length: `merge.ts` owns what counts as a
  // conflict and a second reading here could disagree with the badge every other surface draws.
  conflict: order.table_conflict === 1,
  // `04-F34` — the till's own `02-F55` fact, carried and never re-derived. The key is OMITTED
  // when the projection omitted it, so `01-F54`'s distinction between "this host did not say" and
  // "said, and the kitchen has not been told" survives the plane boundary intact — writing
  // `"none"` here would turn a silence into a claim.
  ...(order.kitchen === undefined ? {} : { kitchen: order.kitchen }),
});
