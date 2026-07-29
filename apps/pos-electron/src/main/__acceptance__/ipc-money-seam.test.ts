// Acceptance tests — oracle review F3: the IPC money seam must reject what `domain` rejects.
//
// Authored from spec text + the fix-round decision only (24 §3 step 2; read-only to the
// implementing session):
//   00 §6    — money = integer paisas; floats in ledgers never.
//   18 §6    — the two-plane law; this schema IS the plane boundary for the POS app.
//   01-F54   — "A screen that refuses to render because one item was renamed upstream is a
//              stopped till." The line still shows its quantity and its money.
//   01-F17   — a sale is never blocked.
//
// THE FINDING. `MoneyValue` throws during React render on a negative, non-integer, NaN or
// past-2^53 value (measured, via renderToStaticMarkup), and there is no ErrorBoundary
// anywhere in `packages/` or `apps/` — so in React 19 one bad money value unmounts the root
// and blanks the till. The decision taken for this round is to fix the SEAM, not to catch
// the symptom: a render that throws on impossible input is defensible, a seam that admits
// the impossible input is not.
//
// The seam is `OpenOrderSchema.total_paisa`, declared `z.number().int()` (ipc.ts:52) while
// every money field in the domain event catalog is `z.number().int().nonnegative()`
// (registry.ts:33/78/90). That inconsistency is the actual defect. Nothing shipped emits a
// negative today — `billedEffectiveFromJsonLines` (merge.ts:238) returns a non-negative
// bigint-derived total, and the event schemas are guarded — so this is a latent hole being
// closed at the boundary, which is where it belongs.
//
// I agree with the decision and record why, since the review asked: an ErrorBoundary around
// money would convert a wrong number into a blank region, and a blank region on a counter
// screen is indistinguishable from a hung app to the operator. 01-F54's remedy for missing
// data is to DEGRADE (show the identifier, keep the money), not to blank — and there is
// nothing to degrade to when the money itself is the corrupt value. Refusing the value at
// the plane boundary means the fold's own non-negative total is the only thing that can ever
// reach a screen, which is the invariant worth having.
//
// RED/GREEN at authoring time (measured):
//   RED   — the negative cases, and the structural pin on the schema declaration. Zod's
//           `.int()` accepts -1.
//   GREEN — the non-integer, NaN, ±Infinity and past-2^53 cases. Measured: `z.number().int()`
//           already rejects all of them. They are coverage, not bug fixes, and are labelled
//           so rather than dressed up.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { paisa } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { OpenOrderSchema } from "../../shared/ipc";

const HERE = dirname(fileURLToPath(import.meta.url));
const IPC_SOURCE = resolve(HERE, "../../shared/ipc.ts");

const order = (total: number) => ({
  order_id: "order-1234abcd",
  reference: "order-12",
  total_paisa: total,
  // Required since the tender surface landed (02-F12): the fold's keyed sum of what has been
  // paid. Zero here because this file is about the TOTAL's legal range, not about settlement.
  paid_paisa: 0,
  lines: [
    {
      line_id: "line-a",
      name: "Karahi",
      quantity: 2,
      modifiers: [],
      removals: [],
      note: null,
    },
  ],
});

const accepts = (total: number) => OpenOrderSchema.safeParse(order(total)).success;

/** Does the kernel's own money constructor admit this value? */
const domainAccepts = (n: number): boolean => {
  try {
    paisa(n);
    return true;
  } catch {
    return false;
  }
};

describe("F3 — the IPC money seam admits exactly what `domain` admits (00 §6 / 18 §6)", () => {
  it("rejects a NEGATIVE total — the case the seam admits today", () => {
    expect(accepts(-1), "a negative total must never cross the plane boundary").toBe(false);
    expect(accepts(-185_000)).toBe(false);
  });

  it("accepts the legal range", () => {
    expect(accepts(0)).toBe(true);
    expect(accepts(110_000)).toBe(true);
    expect(accepts(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("GREEN COVERAGE: rejects non-integers and unrepresentable magnitudes", () => {
    // Already true of `z.number().int()`; pinned so a future relaxation of the field cannot
    // quietly reopen it alongside the nonnegative fix.
    for (const [what, value] of [
      ["a non-integer", 12.5],
      ["NaN", Number.NaN],
      ["+Infinity", Number.POSITIVE_INFINITY],
      ["-Infinity", Number.NEGATIVE_INFINITY],
      ["2**53", 2 ** 53],
      ["MAX_SAFE_INTEGER + 1", Number.MAX_SAFE_INTEGER + 1],
    ] as [string, number][]) {
      expect.soft(accepts(value), `${what} must be rejected at the seam`).toBe(false);
    }
  });

  it("the seam and the kernel agree on EVERY probe — no value is legal on one side only", () => {
    // The decision, stated as one property rather than a list: the plane boundary rejects
    // what `domain` rejects. This is what makes the render path's throw unreachable in
    // practice instead of merely unlikely.
    const probes = [
      0,
      1,
      -0,
      -1,
      -185_000,
      110_000,
      12.5,
      -12.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      2 ** 53,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
    ];
    for (const n of probes) {
      expect.soft(accepts(n), `seam and domain must agree on ${n}`).toBe(domainAccepts(n));
    }
  });

  it("STRUCTURAL: every money-named field in the IPC contract is declared non-negative", () => {
    // The drift catcher. A list of values cannot cover a field added next month; this reads
    // the contract itself, so the next `*_paisa` field is covered the moment it is written.
    const source = readFileSync(IPC_SOURCE, "utf8");
    const declarations = [...source.matchAll(/^\s*(\w*paisa\w*)\s*:\s*(z\.[^,\n]+)/gm)];
    expect(declarations.length, "no money fields found — has ipc.ts moved?").toBeGreaterThan(0);
    for (const [, field, chain] of declarations) {
      expect
        .soft(chain, `${field} in ${join("shared", "ipc.ts")} must be .int().nonnegative()`)
        .toContain(".nonnegative()");
      expect.soft(chain, `${field} must be an integer field (00 §6)`).toContain(".int()");
    }
  });
});
