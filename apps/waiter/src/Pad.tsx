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
 * ## `04-F24` — what the pad does when it cannot reach the till
 *
 * Lines rung while the till is unreachable are held HERE and rendered as **not sent**, and **SEND
 * is disabled** while it stays unreachable. `01-F2`'s durable point is the till, so a line on this
 * glass is not yet a fact; a KOT that has not reached the spooler is food that is not being cooked
 * and no screen may imply otherwise. The pad never retries a write on its own — a lost response is
 * ambiguous and `01-F1` makes a duplicated line permanent — it re-reads what the till holds.
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
type MenuRow = { id: string; label: string; unavailable?: boolean; unavailableReason?: string };
type Table = {
  table_ids: readonly string[];
  order_id: string;
  lines: number;
  total_paisa: number;
  confirmed: boolean;
  conflict: boolean;
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
                // `01-F60` — the till would refuse an unpriced item anyway; refusing here means the
                // grid does not offer a tile the append will decline (`menu()`'s own rule).
                if (row === undefined || row.unavailable === true) return;
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
            note={offline ?? (table === null ? undefined : table.table_ids.join(" / "))}
            tone={tone}
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
              // `04-F24` — DISABLED while the till is unreachable and while there is nothing to
              // send. `27-F5` keeps it visible and in place; what changes is that it refuses,
              // with its reason on the strip above.
              unavailable={!reachable || unsent.length === 0 || orderId === null}
              unavailableReason={reachable ? STRINGS.nothingToSend : STRINGS.padOffline}
              onPress={async () => {
                if (orderId === null || !reachable || unsent.length === 0) return;
                for (const row of unsent) {
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
                  // No retry, and the loop STOPS: `01-F1` makes a duplicated line permanent, so an
                  // ambiguous failure is re-read rather than guessed at.
                  if (r === null || r.ok !== true) {
                    await refresh();
                    return;
                  }
                }
                const confirmed = await call({
                  op: "act",
                  handle,
                  intent: { kind: "confirm", order_id: orderId },
                });
                // Cleared ONLY on a confirmed round trip. Clearing optimistically is `01-F66`'s
                // recorded disaster with a guest sitting at the table.
                if (confirmed?.ok === true) setUnsent([]);
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
