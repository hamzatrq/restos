/**
 * **`01-F60` + `18 §2` — the sellable-kind set is declared HERE and reached from everywhere else.**
 *
 * The FR text these assert against:
 *   `01-F60`  — "Every sellable entry (`item`, `variant`) … **`modifier` is SELLABLE** (founder
 *               ruling July 2026) … Non-sellable kinds (`category`, `modifier_group`) carry none."
 *   `18 §2`   — `domain` is SACRED: every platform schema lives there ONCE.
 *   `18 §4`   — a domain type is declared in `domain`; redeclaring it elsewhere is a violation,
 *               not a convenience (`.claude/rules/protected-paths.md` item 4 states it outright).
 *
 * **WHY A SOURCE SCAN AND NOT JUST A VALUE ASSERTION.** `SELLABLE_KINDS` existed three times —
 * the gateway's writer check, the API's save check, the back office's editor grid — and the value
 * assertion was already present in two of those suites, GREEN, while the lists were free to drift
 * apart. What a value assertion cannot see is a *fourth* copy appearing, or a consumer quietly
 * swapping its import for a local `const`: both leave every existing test green and produce a
 * catalog the editor saves and the writer refuses. `01-F60` gained `modifier` by founder ruling in
 * July and that ruling had to be applied in one place; the only durable guarantee is that there is
 * only one place.
 *
 * So the strong assertion here is structural: **exactly one declaration, and every other mention
 * imports it.** Deleting the import in `services/api/src/catalog.ts` or
 * `services/sync-gateway/src/catalog.ts` and re-declaring the list locally reddens this file and
 * nothing else in the repo.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SELLABLE_KINDS } from "../index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");

/** The one file allowed to declare it, as a repo-relative path. */
const DECLARING_FILE = "packages/domain/src/catalog.ts";

/**
 * `apps/backoffice/src/lib/price-grid.ts` holds the third copy. It is another package's file and
 * outside this change; it is listed so a NEW app copy still fails while the pending fix does not
 * have to wait on this suite. The membership test below is a SUBSET one on purpose — the register
 * shrinking (the back office switching to the import) must never turn a correct change red, which
 * is as damaging as a vacuous test.
 */
const KNOWN_PENDING_DUPLICATES = ["apps/backoffice/src/lib/price-grid.ts"];

const SOURCE_ROOTS = ["packages", "services", "apps"];

const sourceFiles = (): readonly string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("."))
        continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) found.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(REPO_ROOT, root));
  return found;
};

/** `const SELLABLE_KINDS`, exported or not — the shape a re-declaration takes. */
const DECLARES = /(?:^|\n)\s*(?:export\s+)?const\s+SELLABLE_KINDS\b/;
const MENTIONS = /\bSELLABLE_KINDS\b/;
const MENTIONS_GLOBAL = /\bSELLABLE_KINDS\b/g;
const IMPORTS_FROM_DOMAIN = /import\s*\{[^}]*\bSELLABLE_KINDS\b[^}]*\}\s*from\s*"@restos\/domain"/;

/**
 * Comments stripped before the CODE scan. The symbol is discussed in prose all over this repo —
 * `publish.ts` cites the consolidation, this file's own header names it four times — and a scan
 * that counted those would be noise a future session silences by weakening the assertion. What is
 * being asserted is where the symbol is *reached*, not where it is *mentioned*.
 */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

type Scan = { readonly path: string; readonly text: string; readonly code: string };

const scanned: readonly Scan[] = sourceFiles().map((path) => {
  const text = readFileSync(path, "utf8");
  return { path: relative(REPO_ROOT, path), text, code: withoutComments(text) };
});

/**
 * `packages/domain/src/index.ts` is the barrel that PUBLISHES the symbol — the one file that
 * legitimately names it without importing it from `@restos/domain`, since it is `@restos/domain`.
 */
const DOMAIN_BARREL = "packages/domain/src/index.ts";

describe("01-F60 — the sellable kinds", () => {
  it("is exactly item, variant and modifier (founder ruling, July 2026)", () => {
    // `modifier` is the ruling that closed the July gap: a paid add-on carries the same commission
    // exposure as the dish it sits on. A suite still encoding the old rule would fail a CORRECT
    // implementation, which AGENTS.md keeps as this wave's worked example.
    expect([...SELLABLE_KINDS].sort()).toEqual(["item", "modifier", "variant"]);
  });

  it("excludes the kinds nothing prices", () => {
    // One underscore from `modifier`, and on the opposite side of the list.
    expect(SELLABLE_KINDS).not.toContain("category");
    expect(SELLABLE_KINDS).not.toContain("modifier_group");
  });
});

describe("18 §2 / 18 §4 — it is declared once, and reached from everywhere else", () => {
  it("scans a non-empty corpus (24-F14: a vacuous pass is not a pass)", () => {
    // Without this the whole file passes by finding nothing — rename `services/` and every
    // structural claim below becomes a statement about the empty set.
    expect(scanned.length).toBeGreaterThan(200);
    expect(scanned.map((file) => file.path)).toContain(DECLARING_FILE);
    expect(scanned.some((file) => MENTIONS.test(file.text))).toBe(true);
  });

  it("has exactly one declaration in packages/ and services/", () => {
    const declaring = scanned
      .filter((file) => file.path.startsWith("packages/") || file.path.startsWith("services/"))
      .filter((file) => DECLARES.test(file.code))
      .map((file) => file.path)
      .sort();
    expect(
      declaring,
      "a second declaration of SELLABLE_KINDS — 18 §4 puts it in domain once, and a copy is how " +
        "the next founder ruling gets applied to one list and not the other",
    ).toEqual([DECLARING_FILE]);
  });

  it("lets no NEW app declare its own copy", () => {
    const declaring = scanned
      .filter((file) => file.path.startsWith("apps/"))
      .filter((file) => DECLARES.test(file.code))
      .map((file) => file.path);
    // Subset, never equality: the register shrinking is the fix landing, not a regression.
    for (const path of declaring) expect(KNOWN_PENDING_DUPLICATES).toContain(path);
  });

  it("every other mention in packages/ and services/ imports it from @restos/domain", () => {
    const offenders = scanned
      .filter((file) => file.path.startsWith("packages/") || file.path.startsWith("services/"))
      .filter((file) => file.path !== DECLARING_FILE && file.path !== DOMAIN_BARREL)
      // This suite names the symbol in its own regexes; it is the scanner, not a consumer.
      .filter((file) => file.path !== relative(REPO_ROOT, fileURLToPath(import.meta.url)))
      .filter((file) => MENTIONS.test(file.code))
      .filter((file) => !IMPORTS_FROM_DOMAIN.test(file.code))
      .map((file) => file.path);
    expect(
      offenders,
      "a consumer names SELLABLE_KINDS without importing it from @restos/domain — either it " +
        "re-declared the list locally, or it is reaching a barrel re-export (18 §2 gives the " +
        "symbol one export point)",
    ).toEqual([]);
  });

  it("both writer-side consumers actually reach it", () => {
    // The SEAM half. "Declared once" and "used by the checks that matter" are different claims,
    // and a consolidation nothing consumes is this wave's named defect wearing a new costume.
    for (const path of ["services/api/src/catalog.ts", "services/sync-gateway/src/catalog.ts"]) {
      const file = scanned.find((candidate) => candidate.path === path);
      expect(file, `${path} is missing — the consumer this consolidation exists for`).toBeDefined();
      expect(IMPORTS_FROM_DOMAIN.test((file as Scan).code), `${path} does not import it`).toBe(
        true,
      );
      expect(DECLARES.test((file as Scan).code), `${path} re-declares it`).toBe(false);
      // Reached, not merely imported — an unused import is exactly the dead seam `seams:check`
      // exists for, and it would satisfy every assertion above.
      expect(
        ((file as Scan).code.match(MENTIONS_GLOBAL) ?? []).length,
        `${path} imports SELLABLE_KINDS and never uses it`,
      ).toBeGreaterThan(1);
    }
  });
});
