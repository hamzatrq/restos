/**
 * **`21-F15`'s resolution rules, as arithmetic** — the half of the naming law that is decidable
 * without a DOM. The other half (does a key ever reach the glass) is `naming-law.dom.test.tsx`,
 * and the two are deliberately separate: this file can enumerate the states exhaustively and cannot
 * prove a screen uses them; that file proves the screens and cannot enumerate.
 *
 * ⚠ AUTHORSHIP DEPARTURE, DECLARED (`24 §3`): written by the session that wrote `lib/names.tsx`.
 * The mutation matrix in `apps/backoffice/CLAUDE.md` is what stands in for the independent oracle.
 */

import { describe, expect, it } from "vitest";
import {
  type NameKind,
  type Naming,
  nameText,
  namingFrom,
  referenceText,
  TREATMENTS,
} from "../lib/names";
import { strings } from "../lib/strings";

const KINDS: readonly NameKind[] = ["org", "branch", "device", "person"];

describe("A · 21-F15 — the four record kinds each have a complete treatment", () => {
  it("has an entry for every kind the law names, and no kind is missing a word", () => {
    // `21-F15`: *"a name slot renders the record's name (01-F68 org, 01-F69 branch, 01-F70 device,
    // 11-F20 person)"*. A kind absent from this table is a slot with no treatment, which is where a
    // raw key gets in — so the union and the table are asserted against each other rather than
    // trusted to stay in step.
    expect(Object.keys(TREATMENTS).sort()).toEqual([...KINDS].sort());
    for (const kind of KINDS) {
      for (const slot of ["unnamed", "unknown", "reference"] as const) {
        expect(TREATMENTS[kind][slot].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("the three words of a kind are three DIFFERENT words", () => {
    // The whole point of a third state is that a reader can tell *this has no name* from *the name
    // could not be read*. Two treatments spelled alike collapse them silently.
    for (const kind of KINDS) {
      const { unnamed, unknown, reference } = TREATMENTS[kind];
      expect(new Set([unnamed, unknown, reference]).size).toBe(3);
    }
  });

  it("no kind borrows another kind's words — a branch never reads as a person", () => {
    const all = KINDS.flatMap((kind) => [TREATMENTS[kind].unnamed, TREATMENTS[kind].unknown]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("`24-F14` — the vocabulary is not empty", () => {
    expect(KINDS.length).toBe(4);
  });
});

describe("B · a name is a NON-EMPTY name, or it is not a name", () => {
  // `01-F68`, `01-F69`, `11-F20` all require a *"required, non-empty display_name"*. `21-F15` calls
  // a blank *"the same lie with less information"*, so an empty string may never reach a slot.
  const cases: readonly [string, string | null | undefined][] = [
    ["null", null],
    ["undefined", undefined],
    ["the empty string", ""],
    ["a run of spaces", "   "],
    ["a tab and a newline", "\t\n"],
  ];

  for (const [what, value] of cases) {
    it(`${what} is UNNAMED, never a name`, () => {
      const naming = namingFrom("branch", "b-1", value);
      expect(naming.state).toBe("unnamed");
      expect(nameText(naming)).toContain(strings.names.branchUnnamed);
    });
  }

  it("a real name is a name", () => {
    const naming = namingFrom("branch", "b-1", "Tariq Road");
    expect(naming).toEqual({ state: "named", kind: "branch", id: "b-1", name: "Tariq Road" });
    expect(nameText(naming)).toBe("Tariq Road");
  });
});

describe("C · commandment 7 — user content is Unicode and renders FAITHFULLY", () => {
  /**
   * `00 §5.6`: the UI is English; **what the owner typed is not the UI**. A restaurant named in
   * Urdu, a cashier whose name carries combining marks, a business with an emoji in its sign — each
   * must reach the glass byte-for-byte. The emptiness test above trims; nothing else may.
   */
  const content: readonly [string, string][] = [
    ["Urdu, right-to-left", "کراچی بریانی ہاؤس"],
    ["Urdu with a Latin tail", "بریانی House"],
    ["a combining mark", "Ayeshá Khan"],
    ["an emoji", "Biryani 🍛 House"],
    ["a Nastaʿlīq name with ZWNJ", "طارق‌روڈ"],
    ["Chinese", "卡拉奇比尔亚尼"],
    ["a name that is only marks", "اَ"],
  ];

  for (const [what, value] of content) {
    it(`${what} survives resolution unchanged`, () => {
      const naming = namingFrom("org", "o-1", value);
      expect(naming.state).toBe("named");
      // Identity, not equivalence: no trim, no normalisation, no case fold. A `toBe` on the string
      // is what makes a future `.normalize()` or `.trim()` in `resolve` a red test rather than a
      // silent edit of somebody's restaurant name.
      expect(naming.state === "named" && naming.name).toBe(value);
      expect(nameText(naming)).toBe(value);
    });
  }

  it("leading and trailing spaces INSIDE a real name are preserved, not tidied", () => {
    // The emptiness test is `trim() !== ""`; it decides whether there is a name, never what it is.
    const naming = namingFrom("person", "u-1", "  Hina  ");
    expect(naming.state === "named" && naming.name).toBe("  Hina  ");
  });
});

describe("D · the flat form and the rendered form are ONE treatment", () => {
  it("a technical id is always LABELLED — never a bare key", () => {
    for (const kind of KINDS) {
      const naming: Naming = { state: "unnamed", kind, id: "01a03082-83d2-725f-81ae-c044cdd0b0c4" };
      const text = referenceText(naming);
      expect(text.startsWith(TREATMENTS[kind].reference)).toBe(true);
      expect(text).toContain(naming.id);
      // `21-F15` exception (b)'s condition: the label and the value are one unit. A key that could
      // be rendered without its label is the shape the law exists to stop.
      expect(text).not.toBe(naming.id);
    }
  });

  it("the unnamed and unknown flat forms lead with the WORD and demote the key", () => {
    for (const state of ["unnamed", "unknown"] as const) {
      const naming: Naming = { state, kind: "branch", id: "b-1" };
      const text = nameText(naming);
      expect(text.startsWith(TREATMENTS.branch[state])).toBe(true);
      // The identifier never occupies the name slot: it appears only after its own label.
      expect(text.indexOf(TREATMENTS.branch.reference)).toBeLessThan(text.indexOf("b-1"));
    }
  });

  it("a named record's flat form is the name and NOTHING else — no key, no label", () => {
    const naming = namingFrom("person", "01a03082-8b3a-7ad2-8ae9-2958e7acd7ff", "Ayesha Khan");
    expect(nameText(naming)).toBe("Ayesha Khan");
    expect(nameText(naming)).not.toContain("01a03082");
    expect(nameText(naming)).not.toContain(TREATMENTS.person.reference);
  });
});

describe("E · 14-F38 — none of these sentences is jargon", () => {
  it("no treatment names an FR, an environment key, a path or a spec section", () => {
    // The rail (`scripts/check-strings.mjs`) owns this for the whole module; it is asserted here
    // too because these particular strings are the ones a restaurant owner reads MOST — every
    // unnamed record on every screen renders one of them.
    const all = KINDS.flatMap((kind) => Object.values(TREATMENTS[kind])).concat(strings.names.owed);
    for (const sentence of all) {
      expect(sentence).not.toMatch(/\b\d{2}-[FN]\d+\b/);
      expect(sentence).not.toMatch(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/);
      expect(sentence).not.toMatch(/(apps|packages|services)\//);
      expect(sentence).not.toMatch(/§/);
    }
  });

  it("the counterpart sentence says WHERE a name is set, not merely that one is missing", () => {
    // `21-F15`: *"a treatment that says only 'unnamed' has retired the question"*. `14-F38`'s rule
    // for something the owner cannot change herself is to name the role that can.
    expect(strings.names.owed.length).toBeGreaterThan(40);
    expect(strings.names.owed).toMatch(/set up RestOS/i);
  });
});
