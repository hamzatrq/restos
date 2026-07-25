// Business-day boundary (01-F46, T-01-17 / DEC-TIME-001).
//
// Two rules, both ratified:
//   * The zone is Asia/Karachi, ALWAYS — irrespective of cloud region or device
//     locale. This is platform law (01 §7), not configuration: the day a sale belongs
//     to is a property of the business, never of where a server happens to run.
//   * The day STARTS at a configurable cutover hour, default 05:00 (layer-2 org
//     setting, 00 §7). A business day therefore runs 05:00 → 05:00 local, so a sale
//     rung at 01:30 belongs to the night it was actually served. Midnight would split
//     a late-closing restaurant's takings across two days' reports, and every daily
//     total, shift report and cash reconciliation would inherit the error.
//
// Implemented on `Intl` rather than a date library: `@date-fns/tz` is a declared
// dependency elsewhere but not in `domain`, and ICU already carries the zone data —
// adding a dependency for arithmetic the platform ships would violate 18 §15 rule 1.
// ICU also gets Pakistan's real history right, including the 2008–2009 DST summers,
// which a hard-coded UTC+5 would silently mis-bucket.
//
// NOTE ON CLOCKS: this module is a pure function of the instant it is given. It never
// reads a clock itself (18 §4 — the clock is injected), and the instant handed to it
// must already be a trustworthy one (01-F44), never a raw device clock (01-F45).

/** The business-day zone. Platform law — NOT configurable (01-F46, 01 §7). */
export const BUSINESS_TIMEZONE = "Asia/Karachi";

/** Default cutover hour for the layer-2 org setting (01-F46 / 00 §7). */
export const BUSINESS_DAY_CUTOVER_HOUR_DEFAULT = 5;

const DAY_MS = 86_400_000;

const FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type CivilTime = { y: number; m: number; d: number; h: number; min: number; s: number };

const civilInKarachi = (at_ms: number): CivilTime => {
  const p = Object.fromEntries(FORMATTER.formatToParts(at_ms).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    // Some ICU builds render midnight as hour "24" under hour12:false.
    h: Number(p.hour) % 24,
    min: Number(p.minute),
    s: Number(p.second),
  };
};

/** Karachi's UTC offset (ms) at a given instant, derived from ICU rather than assumed. */
const offsetAt = (at_ms: number): number => {
  const c = civilInKarachi(at_ms);
  // Re-read the local wall time AS IF it were UTC; the difference is the zone offset.
  // Truncating to whole seconds on both sides keeps this exact.
  const asUtc = Date.UTC(c.y, c.m - 1, c.d, c.h, c.min, c.s);
  return asUtc - Math.floor(at_ms / 1000) * 1000;
};

/**
 * The instant at which a given Karachi wall-clock time occurs. Solved by iteration
 * because the offset itself depends on the instant: guess with the offset that applies
 * near the target, then correct. Two passes converge for every real transition —
 * the first lands within an hour of the truth, the second uses the offset that actually
 * applies there. Relevant for Pakistan's 2008/2009 DST, not merely theoretical.
 */
const instantOfKarachiWall = (y: number, m: number, d: number, hour: number): number => {
  const wallAsUtc = Date.UTC(y, m - 1, d, hour);
  let t = wallAsUtc - offsetAt(wallAsUtc);
  t = wallAsUtc - offsetAt(t);
  return t;
};

const assertCutover = (cutover_hour: number): void => {
  if (!Number.isInteger(cutover_hour) || cutover_hour < 0 || cutover_hour > 23) {
    throw new RangeError(
      `business-day cutover hour must be an integer 0-23, got ${cutover_hour} (01-F46)`,
    );
  }
};

const iso = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Shift a civil date by whole days using UTC arithmetic — no zone involved, so it is exact. */
const shiftDate = (y: number, m: number, d: number, days: number): [number, number, number] => {
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
};

/**
 * The business date (`YYYY-MM-DD`) whose day contains the instant — the calendar date,
 * in Asia/Karachi, on which that business day STARTED (01-F46).
 *
 * An instant before the cutover belongs to the PREVIOUS calendar date: 01:30 on
 * Saturday is still Friday's business day, which is the entire point of the rule.
 */
export const businessDate = (
  at_ms: number,
  cutover_hour: number = BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
): string => {
  assertCutover(cutover_hour);
  const c = civilInKarachi(at_ms);
  if (c.h >= cutover_hour) return iso(c.y, c.m, c.d);
  const [y, m, d] = shiftDate(c.y, c.m, c.d, -1);
  return iso(y, m, d);
};

/**
 * Half-open `[start_ms, end_ms)` of the Karachi business day containing the instant:
 * from the most recent local cutover to the next one (01-F46).
 *
 * Half-open by construction so consecutive days TILE — every instant lands in exactly
 * one business day, with no gap and no double-count. A closed upper bound would put the
 * cutover instant itself in two days at once, and double-count a sale rung exactly on it.
 */
export const businessDayBounds = (
  at_ms: number,
  cutover_hour: number = BUSINESS_DAY_CUTOVER_HOUR_DEFAULT,
): { start_ms: number; end_ms: number } => {
  assertCutover(cutover_hour);
  const date = businessDate(at_ms, cutover_hour);
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const start_ms = instantOfKarachiWall(y, m, d, cutover_hour);
  const [ny, nm, nd] = shiftDate(y, m, d, 1);
  const end_ms = instantOfKarachiWall(ny, nm, nd, cutover_hour);
  return { start_ms, end_ms };
};
