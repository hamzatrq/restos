// ACCEPTANCE TESTS — `DEC-MONEY-010`: `01-F30`'s three missing conservation terms, and the GATE
// that decides when they may be admitted.
//
// **AUTHORED FROM SPEC TEXT ONLY**, by a session acting as `24 §3`'s test author, from the ruling
// quoted below. ⚠ `packages/domain` is a **PROTECTED path** (commandment 10) — this file adds no
// production code and changes no signature, and still wants senior review on that basis.
//
// ── THE RULING ────────────────────────────────────────────────────────────────────────────────
//
//   01-F30        per order, `Σ tendering payments (purpose: settles_order) − Σ refunds =
//                 billed_total − void_value − comp_value − discounts` once settled.
//   DEC-MONEY-010 **RULED (founder, August 2026): NOT YET — and the ruling is a GATE.** A term
//                 enters `01-F30`'s executable form when, and only when, its event type has
//                 **(i)** at least one production emitter, **(ii)** an `01-F31`-class idempotency
//                 key in its payload, and **(iii)** an oracle-pinned merge rule in `26 §7`. Until
//                 all three, the term is **ABSENT — never defaulted to zero behind an optional
//                 parameter**, because an optional zero term is a term with no producer wearing a
//                 signature that says it has one.
//   01-F31        folds dedupe by attempt key; the payload minus its key is the immutable intent.
//   26 §7         `01-F30` needs a **closure** mechanism (the Auditor over the merged log), not a
//                 device fold.
//
// ── WHAT KIND OF TEST THIS IS, stated plainly because it changes how it should be read ─────────
//
// §A is ordinary behaviour: it drives the shipped residual and pins what the ABSENCE of the terms
// costs, in money, on the exact figures `DEC-MONEY-010` is about.
//
// §B is a **TRIPWIRE**, and it is structural on purpose. `AGENTS.md` records that `pnpm
// seams:check` is blind to a **missing PRODUCER for an event type** — *"a key in an object literal
// is not an export, which is how `audit.print_acknowledged` sat in the registry with nothing
// emitting it"* — and that for that blind spot *"the assertion has to be written by hand"*. This
// is that hand-written assertion for the four escalatable types. It does not test behaviour and
// does not pretend to; it exists so that the day someone gives `void.recorded` an emitter, they
// are sent to `DEC-MONEY-010` by a red test instead of discovering the gate three weeks later.
//
// It carries its own `24-F14` empty-match guard: a scan that matched nothing would pass silently
// and go inert, which is the failure mode of every source-scanning check in this repo.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type SettledConservationArgs, settledConservationResidualPaisa } from "../invariants.js";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — WHAT THE ABSENCE COSTS. `DEC-MONEY-010`'s own worked figures.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§A DEC-MONEY-010 — the three terms are ABSENT, and a comped order pays for it", () => {
  it("a legitimately comped order reads as a conservation SHORTFALL of exactly the comp", () => {
    // Rs 1,000 billed, Rs 450 comped by a manager, Rs 550 taken — conserved in every sense a
    // human would recognise, and the equation reads +45000 as if Rs 450 had walked out of the
    // door. This is the defect `DEC-MONEY-010` rules on, stated as a number rather than as prose.
    //
    // ⚠ WHEN THE GATE OPENS THIS TEST MUST CHANGE. It defends the present rule deliberately and
    // says so — which is `catalog-pricing.test.ts:394`'s failure committed with its eyes open and
    // a note attached, rather than by accident and for three weeks.
    const args: SettledConservationArgs = {
      billed_paisa: 100_000,
      tendered_paisa: 55_000,
      refunded_paisa: 0,
    };
    expect(settledConservationResidualPaisa(args)).toBe(45_000);
  });

  it("the equation is exactly `billed − (tendered − refunded)` and reads NO fourth input", () => {
    // MUTATION THIS CATCHES: a term smuggled in behind an optional parameter defaulting to zero —
    // the one shape `DEC-MONEY-010` forbids by name, because it is indistinguishable from a real
    // term at every call site and has no producer behind it. An extra key here must change
    // nothing; if it ever does, the gate was opened without the ruling.
    const base = { billed_paisa: 100_000, tendered_paisa: 55_000, refunded_paisa: 0 };
    const withTerms = {
      ...base,
      void_value_paisa: 45_000,
      comp_value_paisa: 45_000,
      discounts_paisa: 45_000,
    } as SettledConservationArgs;
    expect(settledConservationResidualPaisa(withTerms)).toBe(
      settledConservationResidualPaisa(base),
    );
  });

  it("a fully-tendered order still conserves — the absence costs nothing where no term applies", () => {
    // The negative control for §A: the equation is not simply broken. Where none of the three
    // terms would be non-zero, it already gives the right answer, which is why this survived.
    expect(
      settledConservationResidualPaisa({
        billed_paisa: 224_000,
        tendered_paisa: 224_000,
        refunded_paisa: 0,
      }),
    ).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE TRIPWIRE. Gate condition (i): a term needs a PRODUCER.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The four `02-F20` escalatable writes whose values `01-F30`'s three terms would be summed from. */
const TERM_TYPES = [
  "void.recorded",
  "comp.recorded",
  "discount.recorded",
  "order.line_price_overridden",
] as const;

const repoRoot = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = dirname(dir);
  }
  throw new Error("repo root not found — the tripwire cannot scan and must not pass silently");
};

/** Every shipping `.ts`/`.tsx` under each app's and service's `src`; tests and stories excluded. */
const shippingSources = (): string[] => {
  const root = repoRoot();
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry === "node_modules" || entry === "__acceptance__" || entry === "dist") continue;
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.(test|spec|stories)\.tsx?$/.test(entry)) continue;
      out.push(p);
    }
  };
  for (const group of ["apps", "services"]) {
    const base = join(root, group);
    if (!existsSync(base)) continue;
    for (const pkg of readdirSync(base)) {
      const src = join(base, pkg, "src");
      if (existsSync(src)) walk(src);
    }
  }
  return out;
};

/**
 * Does this file CONSTRUCT an event of that type — `type: "void.recorded"` — as opposed to merely
 * mentioning it?
 *
 * **A mention is not an emission**, and this repo has already paid for the reverse mistake:
 * `AGENTS.md` records a count *"inflated by comment hits"* that sent a reader to a file to find a
 * gate that was never there. So comments and lookup-table KEYS are both excluded: `authorize.ts`
 * and `approval-record.ts` name all four as `"void.recorded": <something>`, which is a table keyed
 * BY the type and not a construction OF one. What is matched is the type appearing as the VALUE of
 * a `type:` property, which is the shape every emitter in this product uses.
 */
const emitsAny = (source: string): readonly string[] => {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
  return TERM_TYPES.filter((t) =>
    new RegExp(String.raw`\btype\s*:\s*["'\`]${t.replace(".", "\\.")}["'\`]`).test(stripped),
  );
};

describe("§B DEC-MONEY-010 — gate condition (i): the four term types have NO producer", () => {
  it("the scan actually reads shipping source (24-F14 — an empty match must never pass)", () => {
    // The guard on the guard. A tripwire whose scan silently matched nothing would be green for
    // ever and would be the vacuous test the round-3 law is about.
    const files = shippingSources();
    expect(files.length, "the source scan found no shipping files at all").toBeGreaterThan(50);
    // And it can see a producer when there IS one: `payment.recorded` is emitted by this product,
    // so the same matcher must find it. Without this the regex could be wrong and §B would pass
    // by never matching anything.
    const canSeeAProducer = files.some((f) =>
      /\btype\s*:\s*["'`]payment\.recorded["'`]/.test(readFileSync(f, "utf8")),
    );
    expect(canSeeAProducer, "the matcher cannot detect a KNOWN producer — it is broken").toBe(true);
  });

  it("nothing in apps/ or services/ constructs any of the four", () => {
    // ⚠ **WHEN THIS GOES RED, DO NOT DELETE IT — READ `DEC-MONEY-010`.** A producer appearing is
    // gate condition (i) opening, and it is exactly the moment the ruling exists for: the term may
    // then be admitted, but only once (ii) an `01-F31`-class key and (iii) a `26 §7` merge rule
    // are also in place. Adding the term without them makes a double-tapped "void Rs 500" subtract
    // Rs 1,000 — the failure `01-F31` exists to prevent, reintroduced one event family over.
    const producers = shippingSources().flatMap((f) => {
      const hits = emitsAny(readFileSync(f, "utf8"));
      return hits.map((t) => `${t} <- ${f}`);
    });
    expect(producers).toEqual([]);
  });
});
