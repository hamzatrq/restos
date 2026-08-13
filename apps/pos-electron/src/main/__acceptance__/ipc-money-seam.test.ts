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
// ⚠ AMENDED, August 2026 — THE PREMISE OF THE PARAGRAPH BELOW IS NO LONGER TRUE, and the
// amendment is recorded rather than the paragraph rewritten, because the reasoning still holds
// for every field it was written about.
//
// "every money field in the domain event catalog is nonnegative" was true when this file was
// written and is now false by design: `shift.closed.variance_paisa` is declared
// `z.number().int()` — SIGNED — because `02-F23`'s over/short is two directions and a
// magnitude-only field records an over but not a short, the half that costs a cashier their
// job. `CashStateSchema` mirrors that fold row, so the seam is signed there too.
//
// That does NOT reopen the hole this file closed. The property was never "money is
// non-negative"; it was the title's property — **the seam admits exactly what `domain`
// admits** — and non-negativity was simply what `domain` said everywhere at the time. So the
// structural guard below now DERIVES the signed set from `registry.ts` instead of asserting a
// blanket rule, and the render-blanking hazard is asserted separately, where it actually lives:
// `MoneyValue` still takes a magnitude only, and a signed field reaches it through
// `directedPaisa`.
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

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { directedPaisa, paisa } from "@restos/domain";
import { describe, expect, it } from "vitest";
import { CashShiftSchema, OpenOrderSchema } from "../../shared/ipc";

const HERE = dirname(fileURLToPath(import.meta.url));
const IPC_SOURCE = resolve(HERE, "../../shared/ipc.ts");
/**
 * `18 §2` — the event schemas are declared ONCE, here. The seam's sign rule is DERIVED from
 * this file rather than restated, so the two cannot drift apart in silence: hardcoding
 * "`variance_paisa` may be signed" would have made this guard agree with a `domain` that had
 * since changed its mind, which is the exact failure the August 2026 `01-F60` round is a
 * worked example of.
 */
const DOMAIN_REGISTRY = resolve(HERE, "../../../../../packages/domain/src/registry.ts");
/** Where a signed money value could reach a React render, and therefore `MoneyValue`. */
const RENDERER_DIR = resolve(HERE, "../../renderer");

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

/**
 * Every money-named field in a Zod schema source, paired with its WHOLE declaration.
 *
 * Bracket-balanced, and that is not tidiness — the previous version of this helper was a regex
 * that stopped at the first comma, and two shapes walked straight through it:
 *
 *   `z.union([z.number().int().nonnegative(), z.number().int().negative()])`
 *      read as `z.union([z.number().int().nonnegative()` — contains `.nonnegative()`, passes,
 *      and admits every negative there is.
 *   a named constant (`paid_paisa: NonNegPaisa`)
 *      contains neither `.int()` nor `.nonnegative()`, and under a `.toContain()` check that is
 *      a failure — but under any check phrased as "does the chain mention it" the declaration's
 *      real content is one indirection away and invisible.
 *
 * Both were found by the session implementing against this guard, which reported them rather
 * than using them. A drift catcher that can be beaten by formatting catches formatting.
 *
 * Whitespace is stripped so a chain broken across lines reads the same as an inline one, and
 * comments are stripped so a `.nonnegative()` in prose cannot stand in for one in code.
 */
const moneyFields = (source: string): { field: string; decl: string }[] => {
  const out: { field: string; decl: string }[] = [];
  for (const m of source.matchAll(/^[ \t]*(\w*paisa\w*)\s*:\s*/gm)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let i = start;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) break;
    }
    out.push({
      field: m[1] ?? "",
      decl: source
        .slice(start, i)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\s+/g, ""),
    });
  }
  return out;
};

/** A field `domain` declares as plain signed integer money — `z.number().int()` and nothing more. */
const SIGNED_DECL = "z.number().int()";
/**
 * The seam's closed vocabulary for a money declaration. Anything outside it — a union, a named
 * constant, a `.negative()`, a coercion — is a widening that has to be argued for here first,
 * on the same terms as the gateway's operation list. Substring containment could not say that.
 */
const SEAM_GRAMMAR = /^z\.number\(\)\.int\(\)(\.nonnegative\(\))?(\.nullable\(\))?$/;

/**
 * The money field names `domain` declares SIGNED — derived, never listed.
 *
 * A name qualifies only if EVERY declaration of it in the registry is signed. `counted_cash_paisa`
 * appears on two events; a name that is a magnitude on one of them cannot be smuggled through by
 * being signed on the other.
 *
 * Note the failure direction if this ever stops parsing: an empty set means the seam is held to
 * "everything non-negative", which reds the guard loudly instead of quietly excusing a field.
 */
const signedInDomain = (): Set<string> => {
  const decls = moneyFields(readFileSync(DOMAIN_REGISTRY, "utf8"));
  const byName = new Map<string, string[]>();
  for (const { field, decl } of decls) byName.set(field, [...(byName.get(field) ?? []), decl]);
  return new Set(
    [...byName].filter(([, ds]) => ds.every((d) => d === SIGNED_DECL)).map(([name]) => name),
  );
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

  it("STRUCTURAL: every money field is declared as `domain` declares it, SIGN INCLUDED", () => {
    // The drift catcher. A list of values cannot cover a field added next month; this reads
    // the contract itself, so the next `*_paisa` field is covered the moment it is written.
    //
    // What changed in August 2026 is only WHERE the sign rule comes from. It used to be stated
    // here ("must be .nonnegative()"), and a stated rule cannot follow `domain` when `domain`
    // moves — `shift.closed.variance_paisa` went signed for `02-F23`'s reason and this guard
    // would have gone on demanding a magnitude, blocking a correct seam indefinitely. So the
    // set is derived from `registry.ts`, and the assertion is the file's own title: the seam
    // admits exactly what `domain` admits.
    //
    // BOTH directions are checked, and the second is the one that is easy to forget. A seam
    // that declared `variance_paisa` non-negative while `domain` declares it signed does not
    // fail safe: it refuses a SHORT shift at the plane boundary, so the one drawer count a
    // cashier most needs to see is the one that takes the surface down.
    const signed = signedInDomain();
    const seam = moneyFields(readFileSync(IPC_SOURCE, "utf8"));
    expect(seam.length, "no money fields found — has ipc.ts moved?").toBeGreaterThan(0);
    for (const { field, decl } of seam) {
      const where = `${field} in ${join("shared", "ipc.ts")}`;
      // Closes both evasions at once, because it is a grammar and not a substring: a union
      // hides a `.negative()` branch past the first comma, and a named constant hides the whole
      // declaration behind an identifier. Neither one matches.
      expect
        .soft(
          decl,
          `${where}: money is declared inline as z.number().int()[.nonnegative()][.nullable()]. ` +
            "A union, a named schema constant or any other form is a widening of the seam's " +
            "money vocabulary — argue for it here first (00 §6).",
        )
        .toMatch(SEAM_GRAMMAR);
      expect
        .soft(
          decl.includes(".nonnegative()"),
          signed.has(field)
            ? `${where} must be SIGNED — domain/registry.ts declares it signed, and a seam that ` +
                "refuses a negative here refuses a SHORT drawer (02-F23)"
            : `${where} must be .nonnegative() — domain/registry.ts declares it a magnitude`,
        )
        .toBe(!signed.has(field));
    }
  });

  it("a SHORT shift crosses the seam, and a negative magnitude still does not", () => {
    // The sign question in behaviour rather than in source text, so the structural guard above
    // cannot be the only thing holding it. `02-F23`'s over/short is two directions: a seam that
    // admitted only the over would make the half that costs a cashier their job unrenderable.
    const shift = (over: Partial<Record<string, unknown>> = {}) => ({
      shift_id: "shift-1",
      cashier: null,
      prev_shift_id: null,
      open_at: 1,
      expected_json: "{}",
      paid_out_paisa: 0,
      no_sale_count: 0,
      closed: 1,
      counted_cash_paisa: 100_000,
      expected_at_close_json: "{}",
      variance_paisa: 0,
      exceptions_json: "[]",
      ...over,
    });
    expect(CashShiftSchema.safeParse(shift({ variance_paisa: -10_000 })).success).toBe(true);
    expect(CashShiftSchema.safeParse(shift({ variance_paisa: 10_000 })).success).toBe(true);
    // …and the carve-out is exactly one field wide. `02-F44`: a negative `paid_out` is a deposit
    // in disguise, and direction on that event comes from the type, never from a sign.
    expect(CashShiftSchema.safeParse(shift({ paid_out_paisa: -1 })).success).toBe(false);
    expect(CashShiftSchema.safeParse(shift({ counted_cash_paisa: -1 })).success).toBe(false);
    expect(CashShiftSchema.safeParse(shift({ variance_paisa: 1.5 })).success).toBe(false);
  });

  it("a signed field reaches the screen as a MAGNITUDE — the blanking hazard stays closed", () => {
    // Asserted SEPARATELY from the sign question, because they are two claims and the seam only
    // makes the first one. `MoneyValue` takes non-negative branded `Paisa` and throws a
    // `RangeError` otherwise; React 19 unmounts the root on a render throw; there is still no
    // ErrorBoundary. Admitting a signed value at the boundary therefore only stays safe while
    // the conversion to a magnitude is TOTAL over everything the boundary admits.
    //
    // `directedPaisa` is that conversion, and it hands back both halves from one call so a
    // caller cannot render the magnitude and silently drop the direction (`27-F12`).
    for (const v of [-Number.MAX_SAFE_INTEGER, -250_000, -1, 0, 1, 250_000]) {
      const { magnitudePaisa, sign } = directedPaisa(v);
      expect
        .soft(domainAccepts(magnitudePaisa), `directedPaisa(${v}) is not renderable money`)
        .toBe(true);
      expect
        .soft(sign, `directedPaisa(${v}) lost the direction 27-F12 renders as a word`)
        .toBe(Math.sign(v));
    }

    // And the narrow net over the one form that reproduces the hazard directly: a signed field
    // handed to a `paisa=` prop. The general case is held by the type — `MoneyValue.paisa` is
    // branded, so a raw `number` there is a typecheck error — but `paisa(shift.variance_paisa)`
    // type-checks fine and throws on every short drawer that ever happens.
    // Non-vacuity tripwire, and it is deliberate that it BLOCKS rather than skips: an empty set
    // makes the loop below assert nothing at all, which is the "tripwire that stayed vacuous
    // after its blocker cleared" this repo has now shipped twice. If `domain` legitimately stops
    // declaring any money signed, the seam's whole signed carve-out goes with it — delete both
    // together, and this line is where that conversation starts.
    const signed = [...signedInDomain()];
    expect(
      signed.length,
      "domain declares no signed money field — either registry.ts moved, or the seam's signed " +
        "carve-out is now dead and should be removed with it",
    ).toBeGreaterThan(0);
    for (const file of readdirSync(RENDERER_DIR).filter(
      (f) => f.endsWith(".tsx") && !f.includes(".test."),
    )) {
      const source = readFileSync(join(RENDERER_DIR, file), "utf8");
      for (const field of signed) {
        expect
          .soft(
            source,
            `${file} passes the signed ${field} straight to a money prop — it must go through ` +
              "directedPaisa, or a short drawer blanks the till (01-F54)",
          )
          .not.toMatch(new RegExp(`paisa=\\{[^}]*\\b${field}\\b`));
      }
    }
  });
});
