// Acceptance tests — `01-F87`'s FOLD BAN, and the one thing the FR says a property test cannot do.
//
// FRs: `01-F87` (*"NO FOLD READS CONFIGURATION, FOR ANY KEY"*), `01-F34` (standing law 1),
// `01-F52` (catalog state is not a fold input), `01-F85`, `26 §7`, `26 §8`.
//
// ── WHY THIS FILE EXISTS AT ALL, IN THE FR's OWN WORDS ────────────────────────────────────────
//
// `01-F87`: *"The sharp part is that `01-F34`'s existing property test cannot catch this. That
// test is bijective envelope-id relabel plus clock injection over an equal delivered SET, and a
// configuration read is not an ordering read at all: it makes a projection a function of
// `(delivered set, artifact version)`, so both harness devices hold the same configuration,
// relabel invariance holds, and two real tills at different versions still project different
// money. **Enforcement is therefore structural — what a fold is allowed to take as input** — and
// not a property test."*
//
// So this file asserts the STRUCTURE. Three properties, and each one is a different mechanism:
//
//   §A **A fold's INPUT TYPE has nowhere to put configuration** — every fold is `(state, event)`
//        and every projection is `(state)`. Asserted at COMPILE time, so widening a signature is
//        a type error rather than a review comment.
//   §B **The engine cannot even ROUTE the event to a fold** — `config.changed` is in `merge.ts`'s
//        `NON_FOLD_TYPES`, `keysFor` answers `[]`, and `OrderKeyedEventType` excludes it, so a
//        fold arm for it fails `assertNever` at compile time.
//   §C **No fold can NAME a configuration symbol** — the value lives behind
//        `@restos/domain/config`, a second entry in that package's `exports` map, which nothing
//        under `src/folds/` imports. This is the half the compiler cannot see, and `merge.ts`'s
//        own `printer.status_changed` note records the measurement that makes it necessary:
//        MOVING a row between `NON_FOLD_TYPES` and `OTHER_FOLD_TYPES` is runtime-identical and
//        reddens nothing, so membership alone is *"a sentence a reader believes"*.
//
// ⚠ **AUTHORED ALONGSIDE THE IMPLEMENTATION** under founder ruling **R66** (tests beside the code
// for `plans/v0.md`'s four gaps; this is gap 3). AGENTS.md §7 records that R66 is carried into no
// FR. The weakness is stated rather than hidden — see `packages/domain`'s `config-plane.test.ts`
// header for the full form of it.
//
// ── WHAT THIS FILE DELIBERATELY DOES NOT ASSERT ───────────────────────────────────────────────
//
//   · **That configuration cannot influence a projected value AT ALL.** It cannot, and `01-F87`
//     is why: the ban is on the fold's INPUT, and a value the till resolved at the ACT and wrote
//     INTO the event is exactly where a configured number belongs (`01-F53`'s frozen price,
//     `26 §7`'s carried key). A fold reading that off the envelope is CORRECT.
//   · **That a fold cannot reach a configured value copied into some third module.** It can —
//     the ban is on this module's identity, not on the number 1600 — and `packages/domain/src/
//     config.ts`'s header names that as the neighbouring class it does not close (`L11`).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  emptyCustomerFile,
  foldCustomerFile,
  projectCustomerFile,
} from "../folds/customer-file.js";
import {
  emptyCustomerOrders,
  foldCustomerOrders,
  projectCustomerOrders,
} from "../folds/customer-orders.js";
import { emptyShiftCash, foldShiftCash, projectShiftCash } from "../folds/shift-cash.js";

const FOLDS_DIR = fileURLToPath(new URL("../folds/", import.meta.url));
const ENGINE = fileURLToPath(new URL("../fold-engine.ts", import.meta.url));

const foldFiles = (): string[] =>
  readdirSync(FOLDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => `${FOLDS_DIR}${entry.name}`)
    .sort();

/** Comments stripped, because `L5` — a MENTION is not an import, and this file's claim is imports. */
const codeOf = (path: string): string =>
  readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("§A — 01-F87: a fold's INPUT TYPE has nowhere to put configuration", () => {
  it("A0 24-F14: this file is pointed at real folds, and there is more than one", () => {
    // The anti-vacuity guard. Every assertion below walks `foldFiles()`, so a directory renamed
    // out from under this import — or a single fold left in it — would pass them all while proving
    // nothing about the class.
    const files = foldFiles();
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) expect(codeOf(file).length).toBeGreaterThan(200);
  });

  /**
   * **THE COMPILE-TIME PIN.** `01-F87`'s enforcement is *"what a fold is allowed to take as
   * input"*, and this is that sentence as a type: each fold is exactly `(state, event) => state`
   * and each projection exactly `(state) => rows`. There is no third parameter, so a configured
   * value cannot be PASSED to one — and widening any of these signatures stops this file
   * compiling, which `vitest` runs through `esbuild` and `pnpm typecheck` catches outright.
   *
   * The `never` assignment is the mechanism (`merge-workcounter.test.ts`'s own device): if the
   * conditional type resolves to anything but `true`, `const … : never = true` is a type error.
   */
  it("A1 01-F87/26 §8: every shipped fold takes EXACTLY TWO parameters — there is no third slot", () => {
    // `Parameters<F>["length"]` and NOT `F extends (a, b) => …`, because TypeScript makes a
    // 2-arity function assignable to a 3-arity signature (fewer parameters is assignable to more),
    // so the obvious `extends` form resolves to `never` for a CORRECT implementation and would
    // block the implementer indefinitely — `L10`'s *"a test that stays RED under a correct
    // implementation is as damaging as a vacuous one"*, which is exactly what the first draft of
    // this assertion did. It passed under `vitest` (esbuild strips types) and failed `tsc`.
    type ArityIsTwo<F extends (...args: never[]) => unknown> = Parameters<F>["length"] extends 2
      ? true
      : never;

    const shiftCash: ArityIsTwo<typeof foldShiftCash> = true;
    const customerFile: ArityIsTwo<typeof foldCustomerFile> = true;
    const customerOrders: ArityIsTwo<typeof foldCustomerOrders> = true;
    expect([shiftCash, customerFile, customerOrders]).toEqual([true, true, true]);

    // …and the RUNTIME arity beside the type, because a THIRD parameter with a DEFAULT VALUE is
    // erased from `Parameters<F>` and would satisfy the assertion above while giving a caller
    // somewhere to pass an artifact. `Function.length` also stops at the first default, which is
    // why §C1b reads the source text as a third mechanism for the same property.
    expect([foldShiftCash.length, foldCustomerFile.length, foldCustomerOrders.length]).toEqual([
      2, 2, 2,
    ]);
  });

  /**
   * ⚠ **STATE THE CLASS THAT IS CLOSED AND THE ONE THAT IS NOT** (`L11`).
   *
   * A fold's second parameter is typed **`unknown`**, not `EventEnvelopeT` — deliberately, because
   * it arrives off a wire and each fold narrows it to its own event union internally. So §A1's
   * claim is exactly *"there is no THIRD input"* and **not** *"the second input cannot be a
   * configuration artifact"*: a caller could pass one into the envelope slot and it would type.
   *
   * What makes that harmless is that a fold would then have to READ it, and §C is the assertion
   * that no fold can name a configuration symbol or import the module that holds one. Two
   * mechanisms, one property — and this comment exists so the next session does not read §A1 as
   * covering the half it does not.
   */
  it("A1b 26 §7: the second parameter is the ENVELOPE slot, and it is `unknown` at that boundary", () => {
    type SecondIsUnknown<F extends (...args: never[]) => unknown> = unknown extends Parameters<F>[1]
      ? true
      : never;
    const a: SecondIsUnknown<typeof foldShiftCash> = true;
    const b: SecondIsUnknown<typeof foldCustomerFile> = true;
    const c: SecondIsUnknown<typeof foldCustomerOrders> = true;
    expect([a, b, c]).toEqual([true, true, true]);
    // The anti-vacuity half, so `unknown` is not read as *"anything goes"* but as *"the wire's
    // shape, narrowed inside"*: a well-formed envelope satisfies the slot, and one carrying
    // `config.changed` — the type `merge.ts` classifies NON_FOLD — leaves the state untouched.
    const before = emptyShiftCash();
    const envelope = {
      type: "config.changed",
      payload: { key: "charge.rounding_paisa", layer: 2, version: 2, before: null, after: 1000 },
    };
    expect(foldShiftCash(before, envelope)).toEqual(before);
  });

  it("A2 01-F87: every PROJECTION takes only the folded state — no config can reach the read either", () => {
    // The half a reader forgets. A fold that never sees configuration but whose PROJECTION does
    // still makes the projected value a function of `(delivered set, artifact version)`, which is
    // the exact quantity `01-F87` bans. `customer-orders.ts` already records this as the reason it
    // projects COUNTS and never an ANSWER, and puts the division by `17-F14`'s `N` at RENDER time.
    type ArityIsOne<F extends (...args: never[]) => unknown> = Parameters<F>["length"] extends 1
      ? true
      : never;
    const a: ArityIsOne<typeof projectShiftCash> = true;
    const b: ArityIsOne<typeof projectCustomerFile> = true;
    const c: ArityIsOne<typeof projectCustomerOrders> = true;
    expect([a, b, c]).toEqual([true, true, true]);
    expect([
      projectShiftCash.length,
      projectCustomerFile.length,
      projectCustomerOrders.length,
    ]).toEqual([1, 1, 1]);
  });

  it("A3 24-F14: the empty states this rests on are real folds, not stubs", () => {
    // Anti-vacuity for §A: the type assertions above would hold for three functions that do
    // nothing. These are the shipped ones.
    expect(emptyShiftCash()).toBeDefined();
    expect(emptyCustomerFile()).toBeDefined();
    expect(emptyCustomerOrders()).toBeDefined();
  });
});

describe("§B — 01-F87/01-F62: the engine cannot ROUTE `config.changed` to a fold", () => {
  it("B1 01-F87: `config.changed` is classified NON_FOLD, at `catalog.changed`'s strength", () => {
    // `merge.ts`'s `NON_FOLD_TYPES` says NO fold may read the type — which is `01-F52`'s claim for
    // the catalog and `01-F87`'s for configuration. `OTHER_FOLD_TYPES` says the opposite (the type
    // IS folded, by a fold this engine does not own), and `merge.ts`'s own measurement is that the
    // two sets are RUNTIME-IDENTICAL: moving a row between them reddens nothing. So this is the
    // hand-written assertion that closes that hole for this row.
    const merge = codeOf(`${FOLDS_DIR}merge.ts`);
    const nonFold = merge.slice(
      merge.indexOf("const NON_FOLD_TYPES"),
      merge.indexOf("type NonFoldEventType"),
    );
    const otherFold = merge.slice(
      merge.indexOf("const OTHER_FOLD_TYPES"),
      merge.indexOf("type OtherFoldEventType"),
    );
    // Anti-vacuity: both slices are real and non-trivial, so a rename cannot make this pass by
    // making both haystacks empty.
    expect(nonFold).toContain("catalog.changed");
    expect(otherFold).toContain("shift.opened");

    expect(nonFold).toContain('"config.changed"');
    expect(otherFold).not.toContain("config.changed");
  });

  it("B2 01-F87: the classification cites the FR, so a future reader can check it", () => {
    // `merge.ts` keys each row to the FR that decides it. A row with the wrong id is a claim
    // nobody can grep, and `01-F87` is the id that makes this one permanent rather than "no fold
    // reads it today".
    const merge = readFileSync(`${FOLDS_DIR}merge.ts`, "utf8");
    expect(merge).toMatch(/"config\.changed":\s*"01-F87"/);
  });
});

describe("§C — 01-F87: no fold can NAME a configuration symbol", () => {
  it("C1 01-F87: nothing under `src/folds/` imports `@restos/domain/config`", () => {
    // **The half the compiler cannot see.** The value lives behind a second entry in
    // `@restos/domain`'s `exports` map — the same device `@restos/sync-client/fold-engine` uses to
    // keep the better-sqlite3 addon out of the gateway runtime — so reaching it from a fold takes
    // a NEW import specifier, which is visible in a diff and reddens here.
    for (const file of foldFiles()) {
      expect(codeOf(file), file).not.toMatch(/@restos\/domain\/config/);
      // The device-side store is the other door to the same value.
      expect(codeOf(file), file).not.toMatch(/from\s+["'][^"']*\bconfig(?:-fetch)?\.js["']/);
    }
  });

  it("C1b 01-F87: no fold declares a THIRD parameter — the default-value evasion of §A1", () => {
    // `Function.length` stops at the first default, so `(state, event, config = EMPTY_CONFIG)`
    // reads 2 at runtime AND satisfies §A1's conditional type. The source text is the third
    // mechanism, and it is deliberately narrow: it looks for the exported fold's own signature
    // rather than for every function in the file.
    for (const file of foldFiles()) {
      const code = codeOf(file);
      for (const match of code.matchAll(/export const fold[A-Za-z]*\s*=\s*\(([^)]*)\)/g)) {
        const params = (match[1] ?? "").split(",").filter((p) => p.trim().length > 0);
        expect(params.length, `${file} :: ${match[0].slice(0, 60)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("C2 01-F87: nothing under `src/folds/` names a configuration RESOLVER", () => {
    // A symbol check beside the module check, because `L6` — search the PROPERTY, not the
    // mechanism. An import could be re-exported through some third module and still land these
    // names in a fold; a fold that names none of them is not reading configuration by any route
    // this package can offer.
    const banned = [
      "resolveConfig",
      "taxCellForTender",
      "configKeysOnDefault",
      "parseConfigArtifact",
      "CONFIG_KEYS",
      "createConfigStore",
    ];
    for (const file of foldFiles()) {
      for (const symbol of banned) {
        expect(codeOf(file), `${file} :: ${symbol}`).not.toContain(symbol);
      }
    }
  });

  it("C3 01-F87/26 §8: the AUDITOR's fold subpath cannot reach it either", () => {
    // `fold-engine.ts` is what the cloud Auditor imports for `20 §4.2`'s independent refold
    // (`01-F7`). If configuration reached a fold through THAT barrel, the Auditor and the device
    // would refold the same events against two different artifact versions — which is exactly the
    // divergence `01-F87` describes, arriving on the one path built to detect divergence.
    expect(codeOf(ENGINE)).not.toMatch(/@restos\/domain\/config/);
    expect(codeOf(ENGINE)).not.toMatch(/["']\.\/config(?:-fetch)?\.js["']/);
  });

  it("C4 24-F14: the module boundary this rests on EXISTS — `@restos/domain/config` is a real subpath", () => {
    // If `@restos/domain` stopped publishing the subpath (or the root barrel started re-exporting
    // the config module), §C1's regex would pass over folds importing `@restos/domain` and reach
    // configuration anyway. This is the assertion that the boundary is the one described.
    const manifest = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../domain/package.json", import.meta.url)), "utf8"),
    ) as { exports?: Record<string, string> };
    expect(manifest.exports?.["./config"]).toBe("./src/config.ts");

    const barrel = codeOf(fileURLToPath(new URL("../../../domain/src/index.ts", import.meta.url)));
    // The root barrel must NOT re-export it — that would put configuration one plain
    // `@restos/domain` import from every fold in this package.
    expect(barrel).not.toMatch(/from\s+["']\.\/config\.js["']/);
  });
});
