/**
 * **The app's one date format.** There were three.
 *
 * `14-F3`'s history rendered *"2 Jul 2026, 05:00"* — `en-GB`, pinned to `BUSINESS_TIMEZONE`, with
 * a reasoned `h23` clock. The `14-F28` pending queue and the save receipt each called a bare
 * `toLocaleString("en-US", { hour12: false })` instead, so the same screen showed an owner
 * *"Lands 8/8/2026, 05:00:00"* directly above *"2 Aug 2026, 05:00"*: two orderings, two
 * separators, two precisions, one page. `en-US` month-first is also simply the wrong reading
 * order for this market, and `8/8` hides that — `9/8` would have been read as the wrong day.
 *
 * The format is `change-history.tsx`'s, unchanged, moved here so there is one of it. Its reasons,
 * which are the reasons this function is shaped the way it is:
 *
 *   - **`en-GB`** for the day-before-month order `14-F3`'s own example is written in. `27-F22` is
 *     satisfied either way — every `en-*` locale is CLDR `latn`, so no Eastern digit can reach
 *     the string.
 *   - **The zone is pinned to `01-F46`'s `BUSINESS_TIMEZONE`**, so a rendered instant is a
 *     property of the record rather than of the reader's laptop.
 *   - **`hourCycle: "h23"` stated, never `hour12: false`** — the h23/h24 mapping has historically
 *     differed between engines, and h24 renders midnight as "24:05".
 *
 * ⚠ **This is a calendar instant, never the `01-F46` BUSINESS day**, and `domain`'s
 * `businessDate()` is deliberately not called. The 05:00 cutover decides which trading day an
 * *operational* figure counts against — a sale, a shift, a cash count. Neither an audit line nor
 * a "this lands at" is one of those, and bucketing a 02:00 instant into the previous calendar
 * date restates a recorded fact, which is what commandment 1 forbids of a history.
 */

import { BUSINESS_TIMEZONE } from "@restos/domain";

export const formatInstant = (epoch_ms: number): string =>
  new Date(epoch_ms).toLocaleString("en-GB", {
    timeZone: BUSINESS_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
