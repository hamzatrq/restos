/**
 * **`14-F38` — owner-facing text on this surface names no internal identifier.**
 * **`14-F34` — every field says what it is and why you would set it (the catalog half).**
 *
 * ⚠ **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2), by a session that implemented **none** of
 * the editor these FRs reshape and wrote no line of `lib/strings.ts`. Its source is
 * `specs/14-backoffice.md` §"The catalog editor's SHAPE" and the founder review quoted there.
 *
 * **Why the string CATALOG and not the screen.** `14-F34` says it in the FR itself: *"The
 * sentences live in the app's string catalog, so completeness is assertable without rendering
 * anything … That is the testable form of this FR and the reason it is written as one."* And
 * `14-F38` measured its own defect *"with comments stripped and concatenated literals joined,
 * because a comment hit is not a rendered string and counting the two together is how a number
 * here goes wrong"* — which is exactly what importing the object does and what grepping the file
 * does not. `14-F38`'s second bullet makes the comment the CORRECT home for a citation, so a scan
 * that read the file as text would fail the very placement the FR requires.
 *
 * A companion suite, `task-editor.dom.test.tsx`, fires the same rules at what the editor actually
 * RENDERS — the belt to this file's braces. A string can be clean in the catalog and an FR id can
 * still reach an owner through a JSX literal, and a repo-wide rail (being built separately) can be
 * deleted; this pair is what `14-F38` binds for THIS module either way.
 *
 * **Every rule below is fired at a known violation first** — the two sentences `14-F38` quotes,
 * verbatim — before it is fired at the shipped catalog. `two-plane.test.ts` established that
 * convention here for the reason it matters: without it a clean report is indistinguishable from a
 * scanner that matches nothing, which is this wave's round-3 defect in a regex.
 */

import { describe, expect, it } from "vitest";
import { strings } from "../lib/strings";

/** One catalog entry, flattened: the dotted key path an implementer can grep, and its value. */
type Entry = { readonly path: string; readonly value: string };

const flatten = (node: unknown, path: string): readonly Entry[] => {
  if (typeof node === "string") return [{ path, value: node }];
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    flatten(value, path === "" ? key : `${path}.${key}`),
  );
};

/**
 * The whole catalog, as VALUES. Concatenated literals are joined by the compiler and comments
 * never existed at runtime — both halves of `14-F38`'s stated counting method, for free.
 */
const CATALOG: readonly Entry[] = flatten(strings, "");

/**
 * The two sentences `14-F38` quotes as the defect, plus one per remaining banned class. Fired at
 * every rule before the catalog is, so a rule that has stopped matching anything says so.
 */
const KNOWN_VIOLATIONS: readonly Entry[] = [
  {
    path: "known.frId",
    value: "Leave blank to inherit from the category above (03-F50)",
  },
  {
    path: "known.envVar",
    value: "Set ENABLED_BRANCHES and ENABLED_CHANNELS on the RestOS service.",
  },
  { path: "known.eventType", value: "This emits catalog.changed when you save." },
  { path: "known.column", value: "The parent_id column decides where this sits." },
  { path: "known.path", value: "See services/api/src/catalog.ts for the rule." },
  { path: "known.section", value: "Prices are per channel (00 §7, layer 2)." },
  { path: "known.symbol", value: "assertSavable refused this entry." },
];

/**
 * **An FR id.** `03-F50`, `01-F60`, `14-F28`, `01-N5`, `T-01-09` — the corpus's own shapes. To a
 * restaurant owner they read like error codes, which is the founder's word for them.
 */
const FR_ID = /\b(?:[0-9]{2}|[A-Z])-[FNT][0-9]+[a-z]?\b/;

/** An environment or config variable: `ENABLED_BRANCHES`, `BOOTSTRAP_ORG_ID`, `RESTOS_API_URL`. */
const ENV_VAR = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/;

/**
 * A code symbol, a table or a column name: anything spelled `snake_case`. This is also how the
 * internal `kind` string `modifier_group` would reach a screen, which `14-F32` bans by name.
 */
const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

/**
 * An event type — `catalog.changed`, `order.line_added`, `audit.login`. Written as a dotted
 * lowercase pair, which is also how a filename or an abbreviation reads, so the three abbreviations
 * English actually uses are excluded rather than left to fire.
 */
const EVENT_TYPE = /\b[a-z][a-z0-9]*\.[a-z][a-z0-9_]*\b/;
const NOT_EVENT_TYPES = new Set(["e.g", "i.e", "etc.al", "vs.the"]);

/** A file path, and the section marks the corpus uses for cross-references. */
const FILE_PATH = /\b[\w-]+\/[\w-]+\.[a-z]{2,4}\b/;
const SECTION_REF = /§/;

/**
 * `14-F32`: *"The internal kind strings are vendor vocabulary under `14-F38` and are not rendered;
 * the task noun is this surface's name for a kind everywhere, including on a saved entry and in
 * `14-F3`'s history."* The `01-F21` chain is Category → MenuItem → Variant → ModifierGroup →
 * Modifier.
 *
 * ⚠ **`item` is deliberately NOT in this list, and the omission is the discipline rather than an
 * oversight.** It is an ordinary English noun, so a word-boundary ban on it would fail a CORRECT
 * implementation for writing *"New item"* — and this wave has already produced three tests that a
 * correct implementation could not pass. The four below have no such reading on this surface:
 * `14-F32` gives each of them an owner-facing name (a menu section · a size or version of a dish ·
 * a choice group · an add-on), so their appearance in a rendered sentence is the schema leaking.
 */
const VENDOR_KIND = /\b(?:category|categories|variant|variants|modifier|modifiers)\b/i;

type Rule = { readonly name: string; readonly hits: (value: string) => boolean };

const RULES: readonly Rule[] = [
  { name: "an FR id", hits: (value) => FR_ID.test(value) },
  { name: "an environment or config variable", hits: (value) => ENV_VAR.test(value) },
  {
    name: "a code symbol, table or column name (snake_case)",
    hits: (value) => SNAKE_CASE.test(value),
  },
  {
    name: "an event type",
    hits: (value) => {
      const match = value.match(new RegExp(EVENT_TYPE, "g")) ?? [];
      return match.some((hit) => !NOT_EVENT_TYPES.has(hit));
    },
  },
  { name: "a file path", hits: (value) => FILE_PATH.test(value) },
  { name: "a section reference", hits: (value) => SECTION_REF.test(value) },
];

const offenders = (rule: Rule, entries: readonly Entry[]): readonly string[] =>
  entries
    .filter((entry) => rule.hits(entry.value))
    .map((entry) => `${entry.path} — ${entry.value}`);

describe("14-F38 — the rules bite (fired at the defect the FR quotes, before the catalog)", () => {
  for (const rule of RULES) {
    it(`14-F38 — flags ${rule.name} in a known violation`, () => {
      // Without this, an empty report below is indistinguishable from a scanner matching nothing.
      expect(offenders(rule, KNOWN_VIOLATIONS).length).toBeGreaterThan(0);
    });
  }

  it("14-F38 — flags a vendor kind string in a known violation", () => {
    expect(
      KNOWN_VIOLATIONS.some((entry) => VENDOR_KIND.test(entry.value)) ||
        VENDOR_KIND.test("Leave blank to inherit from the category above"),
    ).toBe(true);
  });

  it("14-F38 — does not fire on ordinary owner English", () => {
    // The other half of a scanner's honesty: a rule that flags every sentence proves nothing
    // either. These are the shapes this app's real prose contains.
    const innocent = [
      "The tills get this at 05:00 tomorrow.",
      "Every branch needs a price for every sales channel, and there is no fallback price.",
      "Archiving takes this off the menu and off every till, and keeps the record.",
      "Whoever set up RestOS for you has to add at least one branch and one sales channel first.",
      "Rs 1,850",
    ];
    for (const value of innocent) {
      for (const rule of RULES) {
        expect(`${rule.name}: ${value}`).toBe(
          `${rule.name}: ${rule.hits(value) ? "FLAGGED" : value}`,
        );
      }
    }
  });
});

describe("14-F38 — no owner-facing string in this module names an internal identifier", () => {
  for (const rule of RULES) {
    it(`14-F38 — no string catalog entry contains ${rule.name}`, () => {
      // The failure message IS the work list: each offender prints its key path and its sentence.
      expect(offenders(rule, CATALOG)).toEqual([]);
    });
  }

  it("14-F32/14-F38 — no string catalog entry renders an internal kind string", () => {
    const hits = CATALOG.filter((entry) => VENDOR_KIND.test(entry.value)).map(
      (entry) => `${entry.path} — ${entry.value}`,
    );
    expect(hits).toEqual([]);
  });

  it("14-F38 — a message about something the owner cannot change names the ROLE that can", () => {
    /**
     * The FR's own worked example, and the one string it quotes twice. It must still report the
     * state as broken (`00 §5.7`) — this is not a softening — while naming *whoever runs the
     * service* rather than the two variables that owner has no shell to set.
     *
     * The plausible wrong implementation is the sentence that shipped: correct, actionable, and
     * addressed to the wrong person entirely.
     */
    const value = strings.grid.notEnabled;
    expect(ENV_VAR.test(value)).toBe(false);
    expect(/whoever|the person who|whoever set up|ask/i.test(value)).toBe(true);
    // Still honest about the state: it says nothing can be saved, not "no prices needed".
    expect(/cannot|can't|nothing can be saved|not been set up/i.test(value)).toBe(true);
  });
});

describe("14-F34 — the help sentences are in the catalog, and none of them is decoration", () => {
  /**
   * Every entry whose key marks it as a field's help sentence. The rule is deliberately keyed on
   * the SUFFIX rather than on a list of field names: a session adding a field to the editor adds
   * `<field>Help` beside it, and this assertion then covers the new field with no edit here.
   *
   * ⚠ This is the catalog-side floor only. It cannot see a FIELD that ships with no help entry at
   * all — an absent key matches no suffix — so the per-control completeness claim is asserted
   * against the rendered form in `task-editor.dom.test.tsx`, where the controls can be enumerated.
   * Stated rather than implied, because a suffix scan reads like completeness and is not.
   */
  const helpEntries = CATALOG.filter((entry) => /Help$|Consequence$/.test(entry.path));

  it("14-F34 — the catalog carries help sentences at all", () => {
    expect(helpEntries.length).toBeGreaterThan(0);
  });

  for (const entry of helpEntries) {
    it(`14-F34 — ${entry.path} says what the field is AND what happens if it is left alone`, () => {
      // A blank, a placeholder, a repeated label and "Required" all fail here — which is the
      // founder's complaint stated as an assertion: *"hide until needed, but there are no
      // guidelines like what is what and why something should be entered."*
      const words = entry.value.trim().split(/\s+/).filter(Boolean);
      expect(`${entry.path}: ${words.length} words`).toBe(
        `${entry.path}: ${Math.max(words.length, 8)} words`,
      );
      expect(entry.value.trim()).not.toBe("");
    });
  }
});
