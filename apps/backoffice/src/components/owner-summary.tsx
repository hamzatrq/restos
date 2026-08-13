"use client";

/**
 * `14-F31` — **the nightly owner summary as a READ-ONLY DESK VIEW**, and the whole of the FR's
 * "what the desk view delivers" list: `12-F10`'s sales-by-channel, cash expected-vs-counted per
 * cashier, top items and hourly curve; the summary's own `omissions` and honesty block as CONTENT;
 * `12-F11`'s margin omission; `12-F13`'s browse-by-date; `12-F22`'s roll-up with per-branch
 * drill-in; and `12-F8`'s data age **stated by the server**, never computed here.
 *
 * **This screen is a route inside the back office and not `apps/owner`, which is a founder ruling
 * rather than a convenience.** `12 §8` names React Native (Expo) for the owner app and gives its
 * reason; `14-F31` leaves that untouched and ships the PULL half here, on `14 §1`'s "desk-sized
 * report views" clause and `14-F24`'s "desk mirror of doc 12". `12-F21` binds the two together:
 * the desk view and the phone app read the same semantic-layer metrics, which is why every figure
 * below is the server's own and nothing on this screen re-derives one.
 *
 * ── THE FOUR THINGS THAT WOULD MAKE THIS SCREEN LIE ──────────────────────────────────────────
 *
 *  1. **A client-side re-sum.** `12-F21` is "one number, everywhere" — the analyst citing a metric
 *     must return what an owner read. So `sales.total_paisa` is RENDERED, never recomputed from
 *     `by_channel`: on a truncated day the two genuinely differ, and the browser's answer would be
 *     the one no brief could cite.
 *  2. **A client clock.** `12-F8` puts the age in the SERVER's words. The server sends two instants
 *     and no age; this file reads neither `Date.now()` nor a bare `new Date()` — asserted by
 *     `owner-summary-discipline.test.ts`, because a `Date.now()` age looks right on the day it is
 *     written and is wrong on a laptop with a bad clock, which is the failure `01-F43` exists for.
 *  3. **A zero where there is no measurement.** An open shift has no expected figure, no count, no
 *     variance and — when its `shift.opened` is outside the window — no cashier. Four nulls, and
 *     coalescing them to `0` renders "counted nothing, all square" about the one number in this
 *     report that costs a cashier their job. Commandment 2.
 *  4. **Colour on the base case.** `27-F16`: money is never coloured by default; colour on a
 *     number means *this number is abnormal*. On this screen exactly one figure qualifies — a
 *     closed shift whose carried `variance_paisa` is non-zero (`12-F10`: "with over/short
 *     highlighted"). The day's total is the biggest number here and takes the default ink.
 *
 * **Commandment 5, and it is satisfied by doc 12 itself rather than by this file's discipline.**
 * `12 §8` puts the owner app on the cloud plane, `18 §6` lists it there, and `12-F26` makes every
 * screen in the module read-only. So: tRPC + TanStack Query, one query, no mutation of any kind,
 * and no `sync-client` anywhere near it.
 *
 * ⚠ **This is the first `packages/ui` COMPONENT import in `apps/backoffice`**, and it is a
 * deliberate architectural first rather than an oversight. `18 §9` specifies that package as an
 * "RN component kit + design tokens (web consumes tokens only)" and this app has honoured that —
 * `theme-css.ts` and `lib/money.ts` take tokens. `14-F31` records that the repo built the INVERSE
 * of `18 §9` (every component renders React DOM), and money here goes through `MoneyValue` because
 * that component is where `27-F23`'s symbol-first grouping, `27-F26`'s tabular figures, `27-F12`'s
 * direction WORD and `27-F16`'s abnormal opt-in are decided ONCE. A hand-rolled string would have
 * to get four rules right four times, and carries no colour for the fourth to spend.
 */

import { directedPaisa, paisa } from "@restos/domain";
import { MoneyValue } from "@restos/ui";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { strings } from "../lib/strings";
import { refusalMessage, useTRPC } from "../lib/trpc";
import { Field, Input } from "./ui/field";
import { Caption, Card, CardBody, CardHeader, CardTitle, Note } from "./ui/surface";

/** `12-F8`'s own threshold: below a minute the branch is live, above it the age is stated. */
const LIVE_WITHIN_MS = 60_000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/** Two days of hours reads worse than "2 days ago" — `27-F24`, the number arrives finished. */
const HOURS_BEFORE_DAYS = 48;

/**
 * `12-F8` — the age, from the server's two instants and nothing else.
 *
 * A ladder rather than a bare minute count, because `27-F24` says the system computes and staff
 * read: a branch offline since Friday is "3 days ago", never "4,320 minutes ago". `null` is the
 * case that must not become a number at all — `00 §5.7`'s "stale data is never presented as live",
 * and an age of zero is the one answer that cannot be true.
 */
const syncSentence = (sync: {
  readonly latest_arrival_ms: number | null;
  readonly server_now_ms: number;
}): string => {
  if (sync.latest_arrival_ms === null) return strings.summary.sync.never;
  const ageMs = sync.server_now_ms - sync.latest_arrival_ms;
  if (ageMs < LIVE_WITHIN_MS) return strings.summary.sync.live;
  const minutes = Math.floor(ageMs / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) {
    return `${strings.summary.sync.lastSynced} ${minutes} ${strings.summary.sync.minutesAgo}`;
  }
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_BEFORE_DAYS) {
    return `${strings.summary.sync.lastSynced} ${hours} ${strings.summary.sync.hoursAgo}`;
  }
  const days = Math.floor(hours / HOURS_PER_DAY);
  return `${strings.summary.sync.lastSynced} ${days} ${strings.summary.sync.daysAgo}`;
};

/** One of `12-F10`'s blocks. The `data-summary-block` name is the region's identity. */
const Block = ({
  name,
  title,
  children,
}: {
  name: string;
  title: string;
  children: ReactNode;
}): ReactNode => (
  <Card data-summary-block={name}>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
    </CardHeader>
    <CardBody>{children}</CardBody>
  </Card>
);

/** The one list shape this screen has: a bounded well with a rule per row, as the device list. */
const Rows = ({ children }: { children: ReactNode }): ReactNode => (
  <ul className="flex flex-col overflow-hidden rounded-md border border-border-strong bg-muted">
    {children}
  </ul>
);

const Row = ({ children, ...rest }: { children: ReactNode }): ReactNode => (
  <li
    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border px-4 py-3 last:border-b-0"
    {...rest}
  >
    {children}
  </li>
);

/**
 * One stated fact in the honesty block — and the `{" "}` is load-bearing rather than decoration.
 *
 * `textContent` concatenates sibling elements with NOTHING between them, so *"…for this day: 143"*
 * followed by *"Events stamped…"* reads as `143Events`: the number stops being a word, and any
 * reader — a screen reader, a copy-paste into a message, a test — sees one token. Flexbox does not
 * render a whitespace-only anonymous item, so the space costs no pixel and buys the separation the
 * layout's `gap` only fakes.
 */
const Fact = ({ children }: { children: ReactNode }): ReactNode => <li>{children} </li>;

/**
 * `02-F23`'s signed variance, rendered as `27-F12` requires: a WORD and a magnitude, never a minus
 * sign. `directedPaisa` returns both halves from one call precisely so a caller cannot render the
 * magnitude and drop the direction, and a variance of exactly zero carries no word — "OVER Rs 0"
 * is not a thing anyone says.
 *
 * ⚠ **`abnormal` here diverges from the till's precedent and the divergence is deliberate.**
 * `apps/pos-electron`'s `CashSurfaces.tsx` renders the same figure with a direction and NO
 * `abnormal`. That surface is a cashier counting her own drawer, where the variance is the subject
 * of the screen and colouring it spends the channel on the thing already in the reader's hand.
 * This is an owner scanning a day: `12-F10` says "with over/short highlighted", and among ~24
 * money figures the two that are not square are exactly what `27-F16` reserves colour for.
 */
const Variance = ({ signedPaisa }: { signedPaisa: number }): ReactNode => {
  const { magnitudePaisa, sign } = directedPaisa(signedPaisa);
  return (
    <MoneyValue
      paisa={magnitudePaisa}
      abnormal={sign !== 0}
      {...(sign === 1
        ? { direction: "over" as const }
        : sign === -1
          ? { direction: "short" as const }
          : {})}
    />
  );
};

export const OwnerSummary = (): ReactNode => {
  const trpc = useTRPC();
  /**
   * `12-F13` and `12-F22`. Both are INTENTS — what the owner has asked to see — never a copy of
   * server data, which is what `18 §6` forbids. Null means "the server decides": on first load no
   * `business_date` is sent at all, so the day named in the header is the one the server answered
   * for rather than one this browser's calendar picked.
   */
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const [chosenBranch, setChosenBranch] = useState<string | null>(null);

  const summary = useQuery(
    trpc.summary.nightly.queryOptions({
      branch_id: chosenBranch,
      ...(chosenDate === null ? {} : { business_date: chosenDate }),
    }),
  );

  if (summary.isPending) {
    return <p className="text-body text-muted-foreground">{strings.errors.loading}</p>;
  }

  /**
   * `12-F2` — the scope is decided server-side and a refusal is the server's sentence, printed.
   * It already names the action and the reach it resolved to (`summary-router.ts`), which is more
   * than this client could say; and not one figure is rendered behind it, because a report that
   * could not be read has no figures to withhold.
   */
  if (summary.error !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{strings.summary.heading}</CardTitle>
        </CardHeader>
        <CardBody>
          <Note tone="fault">{strings.summary.notAnswered}</Note>
          <p className="text-body text-foreground">{refusalMessage(summary.error)}</p>
          <Caption>{strings.summary.notAnsweredHelp}</Caption>
        </CardBody>
      </Card>
    );
  }

  const answer = summary.data;
  const stale =
    answer.sync.latest_arrival_ms === null
      ? true
      : answer.sync.server_now_ms - answer.sync.latest_arrival_ms >= LIVE_WITHIN_MS;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start gap-5">
          <Field label={strings.summary.businessDay} htmlFor="summary-business-date">
            <Input
              id="summary-business-date"
              data-summary-control="business-date"
              type="date"
              className="sm:w-56"
              value={chosenDate ?? answer.business_date}
              onChange={(event) => setChosenDate(event.target.value)}
            />
          </Field>
          <Field
            label={strings.summary.branch}
            help={strings.summary.branchHelp}
            htmlFor="summary-branch"
          >
            {/*
              `12-F22`'s drill-in, and its options come from the ANSWER's `branch_ids` — never from
              `catalog.enabled`, which is the config plane and knows branches this sign-in may hold
              no assignment at. `12-F2`: the app never widens scope client-side.
            */}
            <select
              id="summary-branch"
              data-summary-control="branch"
              className="h-10 rounded-md border border-input bg-background px-3 text-body sm:w-72"
              value={chosenBranch ?? ""}
              onChange={(event) =>
                setChosenBranch(event.target.value === "" ? null : event.target.value)
              }
            >
              <option value="">{strings.summary.allBranches}</option>
              {answer.branch_ids.map((branch_id) => (
                <option key={branch_id} value={branch_id}>
                  {branch_id}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-body text-foreground">
          {`${strings.summary.dayShown} ${answer.business_date}`}
        </p>
        {/* `12-F12` — see `strings.summary.noNarrative`. The statement is the CLIENT's to make:
            the server's omission list covers blocks of numbers, and this absence is prose. */}
        <Note tone="neutral">{strings.summary.noNarrative}</Note>
      </header>

      <Block name="sync" title={strings.summary.sync.heading}>
        {/* `00 §5.7` — an offline branch is visually distinct, and the distinction is a fill, a
            glyph and a different SENTENCE, never colour alone (`27-F12`). */}
        {stale ? (
          <Note tone="abnormal">{syncSentence(answer.sync)}</Note>
        ) : (
          <p className="text-body text-foreground">{syncSentence(answer.sync)}</p>
        )}
      </Block>

      <Block name="sales" title={strings.summary.sales.heading}>
        {/* Every `{" "}` on this screen is there for the reason `Fact` states: sibling elements
            concatenate with nothing between them, and a figure fused to the next word is no
            longer a figure. Flexbox renders none of them. */}
        <div className="flex flex-col gap-1">
          <Caption>{strings.summary.sales.total}</Caption>{" "}
          {/* The SERVER's total (`12-F21`), not a sum of the rows below it. */}
          <MoneyValue paisa={paisa(answer.sales.total_paisa)} size="primary" />{" "}
          <Caption>{`${answer.sales.orders} ${strings.summary.sales.orders}`}</Caption>
        </div>
        {answer.sales.by_channel.length === 0 ? (
          <p className="text-body text-muted-foreground">{strings.summary.sales.empty}</p>
        ) : (
          <Rows>
            {answer.sales.by_channel.map((channel) => (
              <Row key={channel.channel} data-channel={channel.channel}>
                <span className="text-body text-foreground">{channel.channel}</span>{" "}
                <span className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground">
                    {`${channel.orders} ${strings.summary.sales.orders}`}
                  </span>{" "}
                  {/* A channel that took orders and no money is a FACT about the restaurant, so
                      the row stays and carries its zero. Dropping falsy totals hides the case an
                      owner most needs: four orders opened and nothing rung. */}
                  <MoneyValue paisa={paisa(channel.billed_paisa)} />
                </span>
              </Row>
            ))}
          </Rows>
        )}
      </Block>

      <Block name="cash" title={strings.summary.cash.heading}>
        <Caption>{strings.summary.cash.help}</Caption>
        {answer.cash.length === 0 ? (
          <p className="text-body text-muted-foreground">{strings.summary.cash.empty}</p>
        ) : (
          <Rows>
            {answer.cash.map((shift) => (
              <Row key={shift.shift_id} data-shift={shift.shift_id}>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate text-body text-foreground">{shift.shift_id}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {shift.cashier_user_id ?? strings.summary.cash.cashierNotRecorded}
                  </span>
                </span>{" "}
                {/*
                  All three figures are null together — there is no expected figure before a shift
                  closes, and no count either. So the row states the absence in words and renders
                  no money at all, rather than three placeholders that read as a balanced drawer.
                */}
                {shift.expected_cash_paisa === null ||
                shift.counted_cash_paisa === null ||
                shift.variance_paisa === null ? (
                  <span className="text-body text-muted-foreground">
                    {strings.summary.cash.notCounted}
                  </span>
                ) : (
                  <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="text-xs text-muted-foreground">
                      {strings.summary.cash.expected}
                    </span>{" "}
                    <MoneyValue paisa={paisa(shift.expected_cash_paisa)} />{" "}
                    <span className="text-xs text-muted-foreground">
                      {strings.summary.cash.counted}
                    </span>{" "}
                    <MoneyValue paisa={paisa(shift.counted_cash_paisa)} />{" "}
                    <span className="text-xs text-muted-foreground">
                      {strings.summary.cash.variance}
                    </span>{" "}
                    <Variance signedPaisa={shift.variance_paisa} />
                  </span>
                )}
              </Row>
            ))}
          </Rows>
        )}
      </Block>

      <Block name="top-items" title={strings.summary.items.heading}>
        {answer.top_items.length === 0 ? (
          <p className="text-body text-muted-foreground">{strings.summary.items.empty}</p>
        ) : (
          <Rows>
            {/* The server's ranking, rendered in the order it arrived. Re-sorting here would put a
                different order on the screen from the one a cited metric returns (`12-F21`). */}
            {answer.top_items.map((item) => (
              <Row key={item.item_id} data-item={item.item_id}>
                <span className="truncate text-body text-foreground">{item.item_id}</span>{" "}
                <span className="flex items-baseline gap-4">
                  <span className="text-xs text-muted-foreground">
                    {`${item.qty} ${strings.summary.items.sold}`}
                  </span>{" "}
                  <MoneyValue paisa={paisa(item.revenue_paisa)} />
                </span>
              </Row>
            ))}
          </Rows>
        )}
      </Block>

      <Block name="hourly" title={strings.summary.hourly.heading}>
        <Caption>{strings.summary.hourly.help}</Caption>
        {answer.hourly.length === 0 ? (
          <p className="text-body text-muted-foreground">{strings.summary.hourly.empty}</p>
        ) : (
          <Rows>
            {/* An hour that sold nothing is a MEASURED zero and stays: the shape of the curve is
                the only thing the curve is for. The axis is the server's WALL hour — the offset is
                a cutover-relative index and would put the lunch peak at 07:00 (`01-F46`). */}
            {answer.hourly.map((bucket) => (
              <Row key={bucket.offset} data-hour={bucket.offset}>
                <span className="text-body text-foreground">{`${bucket.wall_hour}:00`}</span>{" "}
                <MoneyValue paisa={paisa(bucket.billed_paisa)} />
              </Row>
            ))}
          </Rows>
        )}
      </Block>

      <Block name="honesty" title={strings.summary.honesty.heading}>
        {/*
          Every line is the server's own field. This block is CONTENT and not an error state: with
          the window truncated, a day unclosed, a shift open and two anomalies raised, the figures
          above are still rendered — a report that hides its numbers whenever it has a caveat is a
          report nobody can use on the one night it matters.
        */}
        <ul className="flex flex-col gap-2 text-body text-foreground">
          <Fact>{`${strings.summary.honesty.events} ${answer.honesty.events}`}</Fact>
          <Fact>
            {`${strings.summary.honesty.deviceClock} ${answer.honesty.provisional_stamp_events}`}
          </Fact>
          <Fact>{`${strings.summary.honesty.openShifts} ${answer.honesty.open_shifts}`}</Fact>
          <Fact>
            {answer.honesty.every_day_closed
              ? strings.summary.honesty.allDaysClosed
              : strings.summary.honesty.dayOpen}
          </Fact>
          <Fact>
            {answer.honesty.truncated
              ? strings.summary.honesty.truncated
              : strings.summary.honesty.whole}
          </Fact>
          {/* `01-F31`/`02-F37`/`02-F43` fold facts, named. They are NOT alerts and are not labelled
              as any: `13-F14a`'s classes cannot fire, and the server's omission list says why. */}
          <Fact>
            {answer.honesty.anomalies.length === 0
              ? strings.summary.honesty.noAnomalies
              : `${strings.summary.honesty.anomalies} ${answer.honesty.anomalies.join(", ")}`}
          </Fact>
        </ul>
      </Block>

      <Block name="omissions" title={strings.summary.omissions.heading}>
        <Caption>{strings.summary.omissions.help}</Caption>
        {/*
          **The list is DATA.** It travels with the answer so a block cannot quietly go missing and
          be read as a zero — an owner who does not know that voids are unmeasured reads their
          absence as "no voids". Holding a copy here would render today's list forever and drop the
          eighth entry the day the server adds one, silently.
        */}
        {answer.omissions.length === 0 ? (
          <p className="text-body text-muted-foreground">{strings.summary.omissions.none}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {answer.omissions.map((omission) => (
              <li
                key={omission.block}
                data-omission={omission.block}
                className="flex flex-col gap-1 rounded-md border border-border bg-muted px-4 py-3"
              >
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-body text-foreground">{omission.block}</span>{" "}
                  <span className="text-xs text-muted-foreground">{omission.fr}</span>
                </span>
                {/* The server's reason, verbatim. `12-F11`'s margin and doc 17's loyalty are absent
                    for completely different reasons, and an owner deciding what to trust needs the
                    difference — a house sentence would erase it. */}
                <p className="text-xs leading-relaxed text-muted-foreground">{omission.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
};
