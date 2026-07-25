// Acceptance tests — T-01-17, 01-F46 business-day boundary (DEC-TIME-001, accepted).
// Authored from specs/01-kernel-sync.md 01-F46 (AMENDED July 2026, commit c04b838),
// specs/00-platform-overview.md §7 (layer-2 org settings; presets-not-knobs),
// specs/25-fold-performance.md §14 + §10 (T4) and specs/18-engineering-handbook.md §4
// (epoch-ms integers in events and storage; timezone only at the edges) ONLY — never
// from an implementation (24 §3 step 2: read-only to the implementing session).
//
// 01-F46, as amended: the boundary is "anchored to Asia/Karachi regardless of cloud
// region or device locale", and "the day starts at a configurable cutover hour,
// default 05:00 (layer-2 org setting per 00 §7) … A business day therefore runs
// 05:00→05:00 local: a sale rung at 01:30 belongs to the night it was actually
// served, not to the calendar date." The timezone anchor is platform law; the
// cutover is org configuration.
//
// TWO THINGS THE RE-PIN MADE LOAD-BEARING, both asserted below:
//   * The day LABEL is the calendar date of the day's START. A 01:30 sale is
//     therefore labelled with the PREVIOUS calendar date — the whole point of the
//     ruling, and the case a midnight boundary got wrong.
//   * A day is NOT "start + 86_400_000". Asia/Karachi ran DST in 2008–2009, so a
//     day spanning a transition is 23 or 25 hours long. Bounds must be computed on
//     local wall-clock terms; the tiling property (no gap, no overlap) is the
//     invariant, not a fixed length.
//
// The oracle is an INDEPENDENT computation — Intl.DateTimeFormat with an explicit
// `timeZone: "Asia/Karachi"`, plus the cutover rule read straight off 01-F46 —
// never the implementation's own answer. Because the oracle names the zone
// explicitly it is itself immune to the process TZ, which is what lets the
// process-TZ sweep below mean anything.
//
// RED-AWAITING-IMPLEMENTATION: `businessDate` / `businessDayBounds` /
// `BUSINESS_TIMEZONE` / `BUSINESS_DAY_CUTOVER_HOUR_DEFAULT` do not exist yet.
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import * as domain from "../index.js";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** T-01-17 oracle surface (24 §3 step 2): the contract this suite drives, typed
 * standalone so a missing export fails the RED run loudly at runtime instead of
 * blocking `pnpm typecheck` for the whole repo.
 *
 * `cutover_hour` is OPTIONAL and defaults to BUSINESS_DAY_CUTOVER_HOUR_DEFAULT —
 * the layer-2 org setting's default (01-F46 / 00 §7), exported as a named constant
 * so doc 14 wires the org value to exactly one place and no call site carries a
 * magic 5. (Considered and rejected: a REQUIRED cutover argument. It would force
 * every Wave-0 call site to invent a value before any layer-2 distribution exists,
 * and the FR states a default — the honest place for it is the signature, with the
 * constant naming it.) */
type BusinessDayApi = {
  BUSINESS_TIMEZONE?: string;
  BUSINESS_DAY_CUTOVER_HOUR_DEFAULT?: number;
  /** The business date (YYYY-MM-DD) whose day contains the instant — the calendar
   * date, in Asia/Karachi, on which that business day STARTED. */
  businessDate?: (at_ms: number, cutover_hour?: number) => string;
  /** Half-open [start_ms, end_ms) of the Karachi business day containing the
   * instant: from the most recent local cutover to the next one. */
  businessDayBounds?: (
    at_ms: number,
    cutover_hour?: number,
  ) => { start_ms: number; end_ms: number };
};

const api = domain as unknown as BusinessDayApi;

const businessDate = (at_ms: number, cutover_hour?: number): string => {
  if (typeof api.businessDate !== "function")
    throw new Error("domain.businessDate is not implemented yet (T-01-17, 01-F46)");
  return cutover_hour === undefined
    ? api.businessDate(at_ms)
    : api.businessDate(at_ms, cutover_hour);
};

const businessDayBounds = (
  at_ms: number,
  cutover_hour?: number,
): { start_ms: number; end_ms: number } => {
  if (typeof api.businessDayBounds !== "function")
    throw new Error("domain.businessDayBounds is not implemented yet (T-01-17, 01-F46)");
  return cutover_hour === undefined
    ? api.businessDayBounds(at_ms)
    : api.businessDayBounds(at_ms, cutover_hour);
};

// ---------------------------------------------------------------------------
// Independent oracle — ICU for the zone, 01-F46's own sentence for the cutover.
// ---------------------------------------------------------------------------

const KARACHI = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const karachiParts = (at_ms: number): { y: number; m: number; d: number; h: number } => {
  const p = Object.fromEntries(KARACHI.formatToParts(at_ms).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour) % 24, // some ICU builds render midnight as "24"
  };
};

const isoDate = (y: number, m: number, d: number): string =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The Karachi CALENDAR date of an instant — the pre-amendment (midnight) answer. */
const karachiCalendarDate = (at_ms: number): string => {
  const p = karachiParts(at_ms);
  return isoDate(p.y, p.m, p.d);
};

/** 01-F46: before the cutover, the instant still belongs to the PREVIOUS day. */
const oracleBusinessDate = (at_ms: number, cutover = 5): string => {
  const p = karachiParts(at_ms);
  if (p.h >= cutover) return isoDate(p.y, p.m, p.d);
  const prev = new Date(Date.UTC(p.y, p.m - 1, p.d) - DAY_MS);
  return isoDate(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
};

// Fixed instants, pinned as literals AND cross-checked against the ICU oracle so
// neither side can drift silently. The first five are one night's service.
const T_2200_PKT = Date.UTC(2026, 6, 25, 17, 0); // 2026-07-25 22:00 PKT — the rush
const T_MIDNIGHT_PKT = Date.UTC(2026, 6, 25, 19, 0); // 2026-07-26 00:00:00.000 PKT
const T_0130_PKT = Date.UTC(2026, 6, 25, 20, 30); // 2026-07-26 01:30 PKT — the ruling's case
const T_0459_PKT = Date.UTC(2026, 6, 25, 23, 59, 59, 999); // 04:59:59.999 PKT
const T_0500_PKT = Date.UTC(2026, 6, 26, 0, 0, 0, 0); // 05:00:00.000 PKT — the cutover
const T_1000_PKT = Date.UTC(2026, 6, 26, 5, 0); // 2026-07-26 10:00 PKT
const T_NEXT_0500_PKT = Date.UTC(2026, 6, 27, 0, 0); // 2026-07-27 05:00 PKT

/** Every process TZ the sweep runs under, including two that shift under DST. */
const PROCESS_ZONES = ["UTC", "America/Los_Angeles", "Pacific/Auckland", "Asia/Karachi"] as const;

const ORIGINAL_TZ = process.env.TZ;

/** Sets the PROCESS timezone and proves it actually took effect — a vacuous sweep
 * (TZ ignored by the runtime) would make every assertion below meaningless. */
const withProcessTz = (zone: string, body: () => void): void => {
  process.env.TZ = zone;
  const localHour = new Date(T_0130_PKT).getHours();
  const expectedLocalHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hour12: false }).format(
      T_0130_PKT,
    ),
  );
  expect(localHour, `process TZ ${zone} did not take effect`).toBe(expectedLocalHour % 24);
  body();
};

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("01-F46 — the anchor is platform law, the cutover is org configuration (00 §7)", () => {
  it("01-F46: BUSINESS_TIMEZONE is the Asia/Karachi anchor, declared once in domain", () => {
    expect(api.BUSINESS_TIMEZONE).toBe("Asia/Karachi");
  });

  it("01-F46/00 §7: BUSINESS_DAY_CUTOVER_HOUR_DEFAULT is 05:00 — the layer-2 default, named once", () => {
    expect(api.BUSINESS_DAY_CUTOVER_HOUR_DEFAULT).toBe(5);
  });

  it("01-F46/18 §4: the cutover is an integer hour of the day — a fractional or out-of-range value is rejected, never silently coerced", () => {
    // A silently-coerced cutover mislabels a whole night's takings. The bound
    // asserted here is the definitional one (an hour of the day); if 00 §7's
    // "designed bounds" narrow it further, that is doc 14's preset to declare.
    expect(businessDate(T_1000_PKT, 0)).toBe(businessDate(T_1000_PKT, 0)); // anchors the rejections
    for (const bogus of [-1, 24, 5.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => businessDate(T_1000_PKT, bogus), `cutover ${bogus}`).toThrow();
      expect(() => businessDayBounds(T_1000_PKT, bogus), `cutover ${bogus}`).toThrow();
    }
    expect(() => businessDate(T_1000_PKT, 0)).not.toThrow();
    expect(() => businessDate(T_1000_PKT, 23)).not.toThrow();
  });
});

describe("01-F46 — the business day runs 05:00 → 05:00 (the amended ruling)", () => {
  it("01-F46: a sale rung at 01:30 belongs to the PREVIOUS calendar date — the night it was actually served", () => {
    // This is the ruling. A midnight boundary answers 2026-07-26 and splits one
    // night's takings across two days' reports; 01-F46 answers 2026-07-25.
    expect(karachiCalendarDate(T_0130_PKT)).toBe("2026-07-26"); // oracle self-check
    expect(businessDate(T_0130_PKT)).toBe("2026-07-25");
    expect(businessDate(T_0130_PKT)).not.toBe(karachiCalendarDate(T_0130_PKT));
    // …and the 22:00 rush that preceded it is the SAME business day.
    expect(businessDate(T_2200_PKT)).toBe("2026-07-25");
    expect(businessDate(T_MIDNIGHT_PKT)).toBe("2026-07-25"); // midnight is mid-service
    expect(businessDayBounds(T_2200_PKT)).toEqual(businessDayBounds(T_0130_PKT));
  });

  it("01-F46: 04:59:59.999 and 05:00:00.000 PKT fall on opposite sides of the boundary — exact to the millisecond", () => {
    expect(T_0500_PKT - T_0459_PKT).toBe(1);
    expect(businessDate(T_0459_PKT)).toBe("2026-07-25");
    expect(businessDate(T_0500_PKT)).toBe("2026-07-26");
    expect(businessDayBounds(T_0459_PKT).end_ms).toBe(T_0500_PKT); // exclusive end
    expect(businessDayBounds(T_0500_PKT).start_ms).toBe(T_0500_PKT); // inclusive start
  });

  it("01-F46: businessDayBounds is the half-open [cutover, next cutover) window, in epoch ms (18 §4)", () => {
    const bounds = businessDayBounds(T_1000_PKT);
    expect(bounds.start_ms).toBe(T_0500_PKT); // 2026-07-26 05:00 PKT
    expect(bounds.end_ms).toBe(T_NEXT_0500_PKT); // 2026-07-27 05:00 PKT
    expect(Number.isInteger(bounds.start_ms) && Number.isInteger(bounds.end_ms)).toBe(true);
    expect(bounds.end_ms - bounds.start_ms).toBe(DAY_MS); // no Karachi DST in 2026
    expect(businessDate(bounds.start_ms)).toBe("2026-07-26");
    expect(businessDate(bounds.end_ms - 1)).toBe("2026-07-26");
    expect(businessDate(bounds.end_ms)).toBe("2026-07-27");
    expect(businessDate(bounds.start_ms - 1)).toBe("2026-07-25");
  });

  it("01-F46: consecutive business days TILE — the end of one is exactly the start of the next, with no gap and no overlap", () => {
    let cursor = businessDayBounds(T_2200_PKT);
    for (let i = 0; i < 5; i++) {
      const next = businessDayBounds(cursor.end_ms);
      expect(next.start_ms).toBe(cursor.end_ms); // no gap, no overlap
      expect(businessDate(cursor.end_ms - 1)).not.toBe(businessDate(next.start_ms));
      cursor = next;
    }
    // …and backwards from the same seam.
    const first = businessDayBounds(T_2200_PKT);
    expect(businessDayBounds(first.start_ms - 1).end_ms).toBe(first.start_ms);
  });
});

describe("01-F46/00 §7 — the cutover is configurable, and its value changes the answer", () => {
  it("01-F46: a 03:00 cutover still puts 01:30 on the previous day but moves 04:00 onto the new one", () => {
    const T_0400_PKT = Date.UTC(2026, 6, 25, 23, 0); // 2026-07-26 04:00 PKT
    expect(businessDate(T_0130_PKT, 3)).toBe("2026-07-25"); // 01:30 < 03:00
    expect(businessDate(T_0400_PKT, 3)).toBe("2026-07-26"); // 04:00 ≥ 03:00
    expect(businessDate(T_0400_PKT)).toBe("2026-07-25"); // …but 04:00 < the 05:00 default
    expect(businessDayBounds(T_0400_PKT, 3).start_ms).toBe(Date.UTC(2026, 6, 25, 22, 0));
  });

  it("01-F46: a 00:00 cutover degenerates to the plain Karachi CALENDAR date — the pre-amendment behaviour, now one setting among many", () => {
    for (const at of [T_2200_PKT, T_MIDNIGHT_PKT, T_0130_PKT, T_0459_PKT, T_0500_PKT, T_1000_PKT]) {
      expect(businessDate(at, 0), String(at)).toBe(karachiCalendarDate(at));
    }
    expect(businessDayBounds(T_1000_PKT, 0).start_ms).toBe(T_MIDNIGHT_PKT);
  });

  it("01-F46: a 23:00 cutover puts a 23:30 sale on the day that has just STARTED — the label always follows the day's start", () => {
    const T_2330_PKT = Date.UTC(2026, 6, 25, 18, 30); // 2026-07-25 23:30 PKT
    expect(businessDate(T_2200_PKT, 23)).toBe("2026-07-24"); // 22:00 < 23:00
    expect(businessDate(T_2330_PKT, 23)).toBe("2026-07-25"); // 23:30 ≥ 23:00
    expect(businessDate(T_0130_PKT, 23)).toBe("2026-07-25"); // 01:30 the next morning
    expect(businessDayBounds(T_0130_PKT, 23).start_ms).toBe(Date.UTC(2026, 6, 25, 18, 0));
  });
});

describe("01-F46 — the process timezone cannot move the boundary", () => {
  it("01-F46: businessDate is identical under every process TZ, at the default AND at a non-default cutover", () => {
    for (const zone of PROCESS_ZONES) {
      withProcessTz(zone, () => {
        for (const at of [T_2200_PKT, T_MIDNIGHT_PKT, T_0130_PKT, T_0459_PKT, T_0500_PKT]) {
          expect(businessDate(at), `${zone} @ ${at}`).toBe(oracleBusinessDate(at));
          expect(businessDate(at, 3), `${zone} @ ${at} cutover 3`).toBe(oracleBusinessDate(at, 3));
        }
      });
    }
  });

  it("01-F46: businessDayBounds is identical under every process TZ — byte-for-byte the same integers", () => {
    const reference = businessDayBounds(T_0130_PKT);
    const referenceAlt = businessDayBounds(T_0130_PKT, 3);
    for (const zone of PROCESS_ZONES) {
      withProcessTz(zone, () => {
        expect(businessDayBounds(T_0130_PKT), zone).toEqual(reference);
        expect(businessDayBounds(T_0130_PKT, 3), zone).toEqual(referenceAlt);
      });
    }
  });

  it("01-F46: a day boundary evaluated on a DST-SHIFTING process zone is unmoved — the anchor is genuinely Karachi", () => {
    // Both instants sit on US/Pacific DST transition days. A process-local
    // implementation shifts by an hour here; a Karachi-anchored one does not.
    const T_US_SPRING_FORWARD = Date.UTC(2026, 2, 8, 10, 0);
    const T_US_FALL_BACK = Date.UTC(2025, 10, 2, 8, 30);
    for (const at of [T_US_SPRING_FORWARD, T_US_FALL_BACK]) {
      const reference = { date: oracleBusinessDate(at), bounds: businessDayBounds(at) };
      for (const zone of PROCESS_ZONES) {
        withProcessTz(zone, () => {
          expect(businessDate(at), `${zone} @ ${at}`).toBe(reference.date);
          expect(businessDayBounds(at), `${zone} @ ${at}`).toEqual(reference.bounds);
        });
      }
      expect(reference.bounds.end_ms - reference.bounds.start_ms).toBe(DAY_MS);
    }
  });

  it("01-F46: the anchor is the Karachi ZONE, not a hard-coded +05:00 — the 2008 DST business day is 23 hours long and still tiles", () => {
    // Asia/Karachi ran at UTC+06:00 from 2008-06-01 to 2008-11-01. The business day
    // that starts 2008-05-31 05:00 (+05:00) ends 2008-06-01 05:00 (+06:00) — 23
    // hours. A fixed-offset shortcut, and any `start + 86_400_000` bound, passes
    // every present-day case above and fails here.
    const duringTheLostHourDay = Date.UTC(2008, 4, 31, 20, 0); // 2008-06-01 01:00 PKT
    expect(businessDate(duringTheLostHourDay)).toBe(oracleBusinessDate(duringTheLostHourDay));
    expect(businessDate(duringTheLostHourDay)).toBe("2008-05-31"); // before the cutover
    const bounds = businessDayBounds(duringTheLostHourDay);
    expect(bounds.end_ms - bounds.start_ms).toBe(23 * HOUR_MS);
    expect(bounds.end_ms - bounds.start_ms).not.toBe(DAY_MS);
    expect(businessDate(bounds.start_ms)).toBe("2008-05-31");
    expect(businessDate(bounds.end_ms - 1)).toBe("2008-05-31");
    expect(businessDate(bounds.end_ms)).toBe("2008-06-01");
    expect(businessDayBounds(bounds.end_ms).start_ms).toBe(bounds.end_ms); // still tiles
  });
});

describe("01-F46 — properties over arbitrary instants and cutovers", () => {
  /** ±5 years around the corpus epoch, in whole milliseconds (18 §4). */
  const instant = fc.integer({
    min: 1752800000000 - 5 * 365 * DAY_MS,
    max: 1752800000000 + 5 * 365 * DAY_MS,
  });
  const cutover = fc.integer({ min: 0, max: 23 });

  it("01-F46: for any instant and any cutover, businessDate agrees with the independent Karachi oracle", () => {
    fc.assert(
      fc.property(instant, cutover, (at, h) => {
        expect(businessDate(at, h)).toBe(oracleBusinessDate(at, h));
      }),
      { numRuns: 300 },
    );
  });

  it("01-F46: bounds are half-open and label-consistent — start ≤ t < end, and only [start, end) carries the day's label", () => {
    fc.assert(
      fc.property(instant, cutover, (at, h) => {
        const { start_ms, end_ms } = businessDayBounds(at, h);
        expect(start_ms).toBeLessThanOrEqual(at);
        expect(end_ms).toBeGreaterThan(at);
        expect(businessDate(start_ms, h)).toBe(businessDate(at, h));
        expect(businessDate(end_ms - 1, h)).toBe(businessDate(at, h));
        expect(businessDate(end_ms, h)).not.toBe(businessDate(at, h));
        expect(businessDate(start_ms - 1, h)).not.toBe(businessDate(at, h));
      }),
      { numRuns: 300 },
    );
  });

  it("01-F46: consecutive days TILE the timeline — no instant belongs to two business days, and none to none", () => {
    fc.assert(
      fc.property(instant, cutover, (at, h) => {
        const day = businessDayBounds(at, h);
        expect(businessDayBounds(day.end_ms, h).start_ms).toBe(day.end_ms); // forward seam
        expect(businessDayBounds(day.start_ms - 1, h).end_ms).toBe(day.start_ms); // backward seam
        expect(businessDayBounds(day.start_ms, h)).toEqual(day); // idempotent
        expect(businessDayBounds(day.end_ms - 1, h)).toEqual(day);
      }),
      { numRuns: 300 },
    );
  });
});
