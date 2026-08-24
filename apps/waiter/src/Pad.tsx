import {
  ConnectionFacts,
  type GridItem,
  ItemGrid,
  MoneyValue,
  Panel,
  PersonTile,
  QuantityItemLine,
  type Tab,
  TabRail,
  TextEntry,
  Tile,
  usePhysicalSize,
  WorkSurface,
} from "@restos/ui";
import { useCallback, useEffect, useState } from "react";
import { STRINGS } from "./strings";
import type { TerminalClient } from "./terminal-client";

/**
 * # `04-F6`'s capture loop on a landscape tablet (`04-F26`)
 *
 * Three screens and nothing more: identify → pick a table → ring and SEND. `04-F20`'s own-day view
 * is DELIBERATELY ABSENT from build 1 and named in the session report rather than half-built — it
 * is a protection surface, and a protection surface showing the wrong day is worse than an honestly
 * missing one.
 *
 * ## Commandment 6, and what it cost to honour
 *
 * Every control here is a `packages/ui` component, which is only possible because `04-F21` made the
 * pad a BROWSER — `05-F31` deleted the manager's Expo host partly because *"zero `packages/ui`
 * components exist for RN"*, and a native waiter app would have inherited exactly that.
 *
 * ⚠ **The design assumed the counter's composition drops in and it does NOT, measured here.**
 * `AppShell` takes the counter's whole world (`actor`, `businessDay`, `alarms`,
 * `onAcknowledgeAlarm`, its own tab list) and owns `03-F5`'s band, which belongs to the till and
 * not to a terminal; `NumericKeypad` is a MONEY pad (`value` in rupees, a `max`), not a PIN pad —
 * the counter composes its PIN pad out of `Tile`s in `App.tsx`, and so does this; and `Cart` wants
 * branded `Paisa` and a billed-line shape this surface has no business projecting (`04-F9`:
 * settlement is not on the handheld). So the pad composes `Panel` + `Tile` + `QuantityItemLine` +
 * `MoneyValue` directly. **The closed vocabulary held; the assumption that a screen could be
 * copied did not.**
 *
 * ## `04-F24`/`04-F29` — what the pad does when it cannot reach the till
 *
 * Lines rung while the till is unreachable are held HERE and rendered as **not sent**, and SEND
 * **refuses in place**, with its reason, while it stays unreachable (`27-F5` — an inert primary
 * control is that FR's own named failure). `01-F2`'s durable point is the till, so a line on this
 * glass is not yet a fact; a KOT that has not reached the spooler is food that is not being cooked
 * and no screen may imply otherwise.
 *
 * ⚠ **THE PAD DOES NOT RETRY, AND FOR ONE ROUND THAT SENTENCE HID A DUPLICATE-ORDER DEFECT.** The
 * SEND loop cleared its captured rows only when the CONFIRM answered, so a dropped confirm
 * response left every landed line still on the glass — and the waiter, with no ticket in the
 * kitchen, pressed SEND again and rang all of them a second time. Not retrying is what makes an
 * ambiguous failure safe only if what has already LANDED stops being pending: each row is trimmed
 * on its own `ok` now, and the confirm is owed separately (`04-F29`). What survives is a stated
 * residual — a lost answer to a line that did land is sent again on the next press, because
 * `order.line_added` has no idempotency key in `01 §4` the way `01-F31` gives a settlement one.
 *
 * ⚠ **THIS SURFACE HAS NO `layout:check` ROW AND HAS NEVER BEEN MEASURED IN BLINK.** The root
 * script sweeps the two Electron apps, and a browser served from the till has no `BrowserWindow`
 * whose options a gate could import. Nine layout defects in this repo were found by launching and
 * looking and ZERO by the suites, so nothing below may be read as evidence that a waiter can reach
 * these controls. Building that rail is named work, not an assumption.
 */

/** `27-F8` — a tablet held at 40 cm, not a counter panel at arm's length. */
const POSTURE = "handheld";

type Person = { user_id: string; display_name: string };
/**
 * `01-F59`/`01-F60` — **`sold_out` is carried, and it is what stops this pad blocking a sale.**
 *
 * `unavailable` is the till's DISPLAY verdict and it collapses two dispositions `01-F60` calls
 * opposites: an 86'd item (price known, deliberately still sellable) and an unpriced one (no
 * number to sell at). The till has always sent both facts — `menu()` spreads `sold_out` and
 * `contested` beside the display pair for exactly this reason — and this type dropped them, so
 * the pad refused a tap on an 86'd item that the till itself accepts. Measured: two taps on a
 * sold-out tile captured nothing while the identical `add_line` landed at the till.
 */
type MenuRow = {
  id: string;
  label: string;
  unavailable?: boolean;
  unavailableReason?: string;
  sold_out?: boolean;
};
/**
 * `04-F34` — **`kitchen` is carried, and it is what stops SEND going quiet over food nobody is
 * cooking.**
 *
 * `confirmed` answers *has this order ever been fired*; `02-F55`'s three-state `kitchen` answers
 * *does any station still lack a chit*, which is the question `04-F24` asks. The pad bridged the
 * gap with a local flag and one table re-selection cleared it, so SEND read *nothing new to send*
 * over an order the till itself called `owed`. The till has always projected the fact — main
 * computes it off `03-F4`'s durable spool — and this type, and the terminal row it comes from,
 * dropped it.
 */
type Table = {
  table_ids: readonly string[];
  order_id: string;
  lines: number;
  total_paisa: number;
  confirmed: boolean;
  conflict: boolean;
  kitchen?: "none" | "sent" | "owed";
};
type View = { waiter: string; menu: MenuRow[]; tables: Table[] };

/** A line the waiter has rung that the till has NOT been told about yet (`04-F24`). */
type Unsent = { item_id: string; label: string; qty: number };

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export const Pad = ({ client }: { client: TerminalClient }): React.JSX.Element => {
  const [reachable, setReachable] = useState(true);
  const [roster, setRoster] = useState<Person[]>([]);
  const [chosen, setChosen] = useState<Person | null>(null);
  const [pin, setPin] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState("tables");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [page, setPage] = useState(0);
  const [unsent, setUnsent] = useState<Unsent[]>([]);
  /**
   * ⚠ **`owedConfirm` LIVED HERE AND IS DELETED (`04-F34`).** It held *"the lines landed and this
   * pad never had its confirm acknowledged"*, which is a real fact and the wrong instrument: it
   * was cleared on every table re-selection, on a browser reload, on a sign-out and on a second
   * pad, so SEND went quiet over an unticketed addendum after one ordinary gesture — `04-F24`'s
   * named failure, measured on this pad's own harness. `02-F55` had already ruled that this
   * cannot be a client-side flag and already projects the answer on the order row, so SEND reads
   * `table.kitchen` and this pad holds nothing.
   */
  /**
   * `00 §5.7` — the last thing the till REFUSED, in this pad's own words.
   *
   * The till's sentence is not rendered: it carries FR ids (`14-F38` bans them from glass) and it
   * is written for a counter, where `02-F49`'s way out — a manager's approval — is two steps away.
   * A waiter holding a tablet can act on one thing, so that is what it says.
   */
  const [refused, setRefused] = useState(false);
  // `27-F11c` — the grid's capacity is a PHYSICAL question, so the box is MEASURED rather than
  // assumed. The ref goes on the element `ItemGrid` fills; until it resolves the grid draws
  // nothing, which is the honest state of a surface nobody has measured yet.
  const [measure, panel] = usePhysicalSize();

  /**
   * Every call goes through here, so ONE place decides what "the till is reachable" means and one
   * place clears it. Two would let the honesty strip and the SEND control disagree about one fact
   * (`02-F45`), and that disagreement is precisely how a waiter comes to believe food is cooking.
   */
  const call = useCallback(
    async (body: unknown): Promise<Record<string, unknown> | null> => {
      try {
        const result = (await client.call(body)) as Record<string, unknown>;
        setReachable(true);
        return result;
      } catch {
        setReachable(false);
        return null;
      }
    },
    [client],
  );

  useEffect(() => {
    void call({ op: "roster" }).then((r) => {
      if (r !== null) setRoster((r.roster as Person[] | undefined) ?? []);
    });
  }, [call]);

  const refresh = useCallback(async () => {
    if (handle === null) return;
    const r = await call({ op: "view", handle });
    if (r?.ok === true) setView(r.view as View);
    // `01-F26` — the till retired the handle. The pad returns to the identification grid rather
    // than showing a screen whose every control will now be refused.
    if (r?.ok === false) setHandle(null);
  }, [call, handle]);

  useEffect(() => {
    void refresh();
    // `04-F7`'s live availability and `04-F13`'s line progress both arrive by re-reading the till's
    // own converged fold. A poll, because build 1 adds no second transport and a pad that pushed
    // would need one.
    const timer = setInterval(() => void refresh(), 2_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // `00 §5.7` — the honesty strip. `04-F21`'s stated cost, on the glass: the pad's availability IS
  // the till's, and `lan`/`hub`/`cloud` are the TILL's business, not a terminal's.
  const strip = <ConnectionFacts lan={reachable ? "ok" : "down"} hub="down" cloud="down" />;

  /**
   * ⚠ **THE CHIP ALONE IS NOT THE HONESTY REQUIREMENT, and shipping only the chip was a real defect
   * this suite caught.** `ConnectionFacts` renders a link state; `00 §5.7` asks the surface to say
   * what is TRUE of the work, and "a link is down" is not "the food you just rang is not being
   * cooked". A waiter reading a grey chip mid-service has been told nothing she can act on.
   *
   * It rides the panel's own `note` — where this surface already puts `01-F61`'s refusals — so no
   * control moves when it appears (`27-F4`) and the words sit next to the work they are about.
   */
  const offline = reachable ? undefined : STRINGS.padOffline;
  const tone = reachable ? "neutral" : "abnormal";

  if (handle === null) {
    return (
      <WorkSurface>
        {strip}
        {chosen === null ? (
          <Panel title={STRINGS.whoAreYou}>
            {roster.map((person) => (
              <PersonTile
                key={person.user_id}
                name={person.display_name}
                onPress={() => {
                  setChosen(person);
                  setRefusal(null);
                  setPin("");
                }}
              />
            ))}
          </Panel>
        ) : (
          <Panel
            title={chosen.display_name}
            note={refusal ?? undefined}
            tone={refusal === null ? "neutral" : "abnormal"}
          >
            {/*
              A PIN pad composed from `Tile`s, at `keypad` posture, in `App.tsx`'s own arrangement:
              1–9, then Clear bottom-left and the confirming act bottom-right. `27-F4` — two pads on
              one estate that disagree about which cell closes an entry is the muscle-memory break
              that FR exists to prevent, and the counter's is the one a waiter may also meet.
            */}
            {PIN_KEYS.map((digit) => (
              <Tile
                key={digit}
                posture="keypad"
                label={digit}
                onPress={() => setPin((value) => value + digit)}
              />
            ))}
            <Tile posture="keypad" label={STRINGS.clear} onPress={() => setPin("")} />
            <Tile posture="keypad" label="0" onPress={() => setPin((value) => `${value}0`)} />
            <Tile
              posture="keypad"
              label={STRINGS.unlock}
              onPress={async () => {
                const r = await call({ op: "sign_in", user_id: chosen.user_id, pin });
                setPin("");
                if (r === null) return setRefusal(STRINGS.cannotReachTill);
                if (r.ok === true) {
                  setHandle(r.handle as string);
                  setRefusal(null);
                  return;
                }
                setRefusal(REFUSALS[String(r.reason)] ?? STRINGS.notRecognised);
              }}
            />
            <Tile posture="counter" label={STRINGS.notYou} onPress={() => setChosen(null)} />
          </Panel>
        )}
      </WorkSurface>
    );
  }

  const table = view?.tables.find((t) => t.order_id === orderId) ?? null;
  /**
   * `04-F29`/`04-F34` — **what SEND still owes the kitchen, read from the TILL and not from a
   * local guess — INCLUDING the half that used to be a local guess.**
   *
   * Two ways an order can owe the kitchen a ticket: rows captured here and not yet sent, and —
   * the case only the till can answer — lines it holds that no station has a chit for. `01-F2`
   * puts the durable point at the till, so its own converged view is the authority for the
   * second, and `02-F55` projects it as `kitchen` off `03-F4`'s durable spool: `owed` is
   * `03-F55`'s addendum, `none` is an order the kitchen has never been told about, and `sent` is
   * the only state in which SEND has nothing to do.
   *
   * **The degrade is `01-F54`'s and it is the till's silence, not a guess about the kitchen:** a
   * host that supplies no projector omits the field, and this falls back to `04-F29`'s third
   * fact — lines held, never confirmed — which is exactly what this pad knew before `04-F34`.
   */
  const kitchenOwes =
    table !== null &&
    table.lines > 0 &&
    (table.kitchen === undefined ? !table.confirmed : table.kitchen !== "sent");
  const sendable = orderId !== null && (unsent.length > 0 || kitchenOwes);
  const tabs: Tab[] = [
    { id: "tables", label: STRINGS.tables },
    { id: "order", label: STRINGS.order },
  ];

  const items: GridItem[] = (view?.menu ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    unavailable: row.unavailable ?? false,
    unavailableReason: row.unavailableReason,
  }));

  return (
    <WorkSurface>
      {strip}
      <TabRail tabs={tabs} activeId={tab} onSelect={setTab} />
      {tab === "tables" ? (
        <Panel title={STRINGS.tables} note={offline ?? `${view?.tables.length ?? 0}`} tone={tone}>
          {(view?.tables ?? []).map((row) => (
            <Tile
              key={row.order_id}
              posture={POSTURE}
              // `01-F19`/`04-F12` — a contested assignment renders as what it is on EVERY surface
              // that shows the table, and nothing here resolves it.
              label={`${row.table_ids.join(" / ")}${row.conflict ? ` ${STRINGS.contested}` : ""}`}
              onPress={() => {
                setOrderId(row.order_id);
                setUnsent([]);
                // `04-F29` — the flag belongs to the order that was open, not to the pad.
                setRefused(false);
                setTab("order");
              }}
            />
          ))}
          <TextEntry
            posture={POSTURE}
            caption={STRINGS.newTable}
            value={label}
            onChange={setLabel}
          />
          {/*
            `04-F30`/`02-F41` — **the way out, and it was missing entirely.**

            `Terminal.signOut` and the wire's `sign_out` op both existed and this app called
            neither: the only exit was `01-F26`'s ten-minute idle lock, so a tablet handed from
            Sana to Ayesha inside that window attributed Ayesha's orders to Sana — permanently
            (`01-F1`), on the surface `02-F41` exists to keep honest.

            It sits at the END of this panel, so no control an operator has learned moves
            (`27-F4`), and it is on the TABLES screen rather than the order screen because signing
            out mid-capture would discard lines a waiter has typed and not sent.
          */}
          <Tile
            posture={POSTURE}
            label={STRINGS.signOut}
            onPress={async () => {
              // The till is TOLD, so the handle dies with the act rather than at the idle lock —
              // but the local state goes either way. A pad that could not reach the till and
              // therefore stayed signed in as the last waiter is the mis-attribution this control
              // exists to prevent; the till's own `01-F26` lock retires the handle regardless.
              await call({ op: "sign_out", handle });
              setHandle(null);
              setChosen(null);
              setView(null);
              setOrderId(null);
              // Captured-but-unsent lines are the previous waiter's work and are NOT carried into
              // the next session: sending them later would append them under her successor's id.
              setUnsent([]);
              setRefused(false);
              setPin("");
            }}
          />
          <Tile
            posture={POSTURE}
            label={STRINGS.openTable}
            onPress={async () => {
              const r = await call({
                op: "act",
                handle,
                intent: { kind: "open", table_id: label },
              });
              setLabel("");
              if (r?.ok === true) {
                setOrderId(r.order_id as string);
                setUnsent([]);
                setRefused(false);
                setTab("order");
                await refresh();
              }
            }}
          />
        </Panel>
      ) : (
        <>
          <div ref={measure} style={{ flex: 1, minHeight: 0 }}>
            <ItemGrid
              items={items}
              posture={POSTURE}
              widthMm={panel?.widthMm ?? 0}
              heightMm={panel?.heightMm ?? 0}
              page={page}
              onPageChange={setPage}
              onSelect={(id) => {
                const row = view?.menu.find((m) => m.id === id);
                if (row === undefined) return;
                /**
                 * `01-F59`/`04-F28` — **an 86'd item is CAPTURED; only the unpriced one is not.**
                 *
                 * This read `row.unavailable === true` and refused both, which is the one thing
                 * `01-F17` says a platform must never do: withhold a sale on availability state.
                 * `01-F59` keeps an 86'd item deliberately sellable and `02-F31` owns the oversell
                 * path; the counter's own grid fires `onPress` on a greyed tile for that reason
                 * and `Tile` never sets `disabled`.
                 *
                 * The unpriced case is the opposite disposition and stays refused: `01-F60` gives
                 * it no number, so the till would decline the append and offering it would be the
                 * grid lying about what is sellable.
                 *
                 * The predicate is `unavailable && !sold_out` — greyed for a reason that is not
                 * the 86 — and the direction of any future error is toward OFFERING, where the
                 * till refuses with its own sentence, rather than toward a silent client-side no.
                 */
                if (row.unavailable === true && row.sold_out !== true) return;
                setUnsent((rows) => {
                  const at = rows.findIndex((r) => r.item_id === id);
                  if (at === -1) return [...rows, { item_id: id, label: row.label, qty: 1 }];
                  return rows.map((r, i) => (i === at ? { ...r, qty: r.qty + 1 } : r));
                });
              }}
            />
          </div>
          <Panel
            title={STRINGS.order}
            note={
              offline ??
              (refused
                ? STRINGS.tillRefused
                : table === null
                  ? undefined
                  : table.table_ids.join(" / "))
            }
            tone={refused ? "abnormal" : tone}
          >
            {table === null ? null : (
              <QuantityItemLine quantity={table.lines} name={STRINGS.onTheTill} />
            )}
            {unsent.map((row) => (
              // `04-F24` — visibly NOT a fact yet. The words carry it, because a colour alone is a
              // claim a waiter under service pressure will not read.
              <QuantityItemLine
                key={row.item_id}
                quantity={row.qty}
                name={row.label}
                note={STRINGS.notSent}
              />
            ))}
            {/* The ENGINE's own number for what the till holds — never a sum of the lines here. */}
            <MoneyValue paisa={(table?.total_paisa ?? 0) as never} />
            <Tile
              posture={POSTURE}
              label={STRINGS.send}
              // `04-F24` — it REFUSES IN PLACE while the till is unreachable and while the till
              // owes the kitchen nothing. `27-F5` keeps it visible and at the same rect; what
              // changes is that it states why and appends nothing.
              unavailable={!reachable || !sendable}
              unavailableReason={reachable ? STRINGS.nothingToSend : STRINGS.padOffline}
              onPress={async () => {
                if (orderId === null || !reachable || !sendable) return;
                setRefused(false);
                /**
                 * `04-F29` — **each row is trimmed on its OWN `ok`, and that is the whole fix.**
                 *
                 * This loop used to clear `unsent` only after the confirm answered, so a dropped
                 * confirm response left every landed line still on the glass: the waiter, seeing
                 * no ticket in the kitchen, pressed SEND again and rang all of them a SECOND time.
                 * Measured on this pad's own harness — two naan captured, one press, a lost
                 * confirm, one more press — `{"appended":[naan×2, naan×2],"confirms":2}`. Four
                 * naan on the ledger and on the KOT, permanent under `01-F1`.
                 *
                 * It still does not RETRY: a row whose answer never arrives stays on the glass and
                 * the loop stops, because the till may have appended it and `01-F1` makes a
                 * duplicate permanent. ⚠ **The residual is stated rather than closed** — a lost
                 * response to a line that DID land will be sent again on the next press, and
                 * nothing in `01 §4` gives `order.line_added` an idempotency key the way `01-F31`
                 * gives a settlement one. What the pad can do is show the till's own count of what
                 * it holds, which the panel above does (`04-F24` — re-read, never guess).
                 */
                for (const row of [...unsent]) {
                  const r = await call({
                    op: "act",
                    handle,
                    intent: {
                      kind: "add_line",
                      order_id: orderId,
                      item_id: row.item_id,
                      qty: row.qty,
                    },
                  });
                  if (r === null || r.ok !== true) {
                    if (r !== null) setRefused(true);
                    await refresh();
                    return;
                  }
                  setUnsent((rows) => rows.filter((held) => held.item_id !== row.item_id));
                }
                const confirmed = await call({
                  op: "act",
                  handle,
                  intent: { kind: "confirm", order_id: orderId },
                });
                // `04-F34` — nothing is remembered about the confirm. Whether the kitchen still
                // owes a chit is the TILL's answer and it arrives on the next `refresh()` below,
                // so a lost response, a reload and a second pad all reach the same conclusion.
                if (confirmed !== null && confirmed.ok !== true) setRefused(true);
                await refresh();
              }}
            />
          </Panel>
        </>
      )}
    </WorkSurface>
  );
};

/**
 * `01-F61`'s refusals, kept DISTINCT on the glass for the reason `pin-session.ts` gives: telling a
 * waiter to re-key a PIN that was already right, on a device that will never accept it, hides the
 * real state behind a typo message.
 */
const REFUSALS: Readonly<Record<string, string>> = {
  bad_pin: STRINGS.wrongPin,
  locked_out: STRINGS.lockedOut,
  unknown_user: STRINGS.notRecognised,
  not_active: STRINGS.notRecognised,
  device_not_registered: STRINGS.tillNotPaired,
  malformed: STRINGS.wrongPin,
};
