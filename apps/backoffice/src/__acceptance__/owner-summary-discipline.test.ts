/**
 * `12-F26`, Commandment 6 and `12-F8`, asserted over the summary screen's SOURCE.
 *
 * ⚠ **AUTHORED FROM SPEC TEXT ONLY** (`24 §3`), alongside `owner-summary.dom.test.tsx`.
 *
 * **Why a source scan when the render suite already exists.** `pnpm layout:check` records the
 * limit of every render-based gate in this repo in its own words: *"it only sees states its
 * fixture produces … the fixture is the real coverage boundary, not the assertions."* Three of the
 * claims below are about code paths a fixture cannot be relied on to reach:
 *
 *   - `12-F26` is a claim about what this surface CANNOT do — *"no screen in this app offers
 *     creation, edit, or deletion"* — and the FR names this exact test: *"Automated tests assert
 *     the app's API client has no mutating endpoints…"*. A render test proves only that the
 *     mutation was not fired by the buttons the fixture happened to enable.
 *   - `12-F8` puts the data age in the SERVER's words. A `Date.now()` on a branch the fixture
 *     never renders — the empty day, the refusal, the stale banner — is invisible to the sweep.
 *   - Commandment 6 (`21 §2`) is about the vocabulary the file is written in, which is a property
 *     of the text and not of one render.
 *
 * Comments and string literals are blanked before every match, because this file's own prose names
 * every construct it bans, and so will the screen's.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE_PATH = new URL("../components/owner-summary.tsx", import.meta.url).pathname;

/**
 * Comments and string CONTENTS blanked, positions preserved — the same treatment
 * `plane-scan.ts` gives a file, for the same reason: a rule must not fire on prose.
 */
const blank = (source: string): string => {
  const out = source.split("");
  const keep = (i: number): void => {
    if (source[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") keep(i++);
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      keep(i++);
      keep(i++);
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) keep(i++);
      keep(i++);
      keep(i++);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          keep(i++);
          if (i < source.length) keep(i++);
          continue;
        }
        keep(i++);
      }
      i++;
      continue;
    }
    i++;
  }
  return out.join("");
};

const raw = (): string => readFileSync(SOURCE_PATH, "utf8");
const code = (): string => blank(raw());

describe("the file exists and there is something to scan", () => {
  /**
   * `24-F14` empty-match protection. Every assertion below is a NEGATIVE about a file's contents,
   * and a missing or empty file satisfies all of them vacuously — which is precisely how a guard
   * goes inert without anyone editing it.
   */
  it("apps/backoffice/src/components/owner-summary.tsx is a real module", () => {
    const source = raw();
    expect(source.length).toBeGreaterThan(1_000);
    expect(blank(source)).toMatch(/export\s+const\s+OwnerSummary\b/);
  });
});

describe("12-F26 — the desk view emits nothing", () => {
  it("declares no mutation of any kind", () => {
    const scanned = code();
    expect(scanned).not.toMatch(/\buseMutation\b/);
    expect(scanned).not.toMatch(/\bmutationOptions\b/);
    expect(scanned).not.toMatch(/\.mutate(Async)?\s*\(/);
  });

  /**
   * The positive control for the scanner itself, on the same code path — a clean report from a
   * matcher nothing has ever made fail is not evidence (`two-plane.test.ts` states the principle).
   */
  it("the scan would catch a mutation if one were added", () => {
    const fixture = blank(
      `// a comment naming useMutation must not fire\n` +
        `const save = useMutation(trpc.summary.nightly.mutationOptions());\n`,
    );
    expect(fixture).toMatch(/\buseMutation\b/);
    expect(fixture).toMatch(/\bmutationOptions\b/);
  });

  it("does not fire on the words inside a comment", () => {
    expect(blank(`/* useMutation and mutationOptions are banned here */`)).not.toMatch(
      /\buseMutation\b/,
    );
  });
});

describe("12-F8 — the data age is the server's, so this file has no clock", () => {
  /**
   * `12-F8`: the age is *"stated by the server, never computed in the client"* (`14-F31`). Two
   * constructs are the whole of that: `Date.now()` and a zero-argument `new Date()`. Formatting a
   * server-stated instant — `new Date(epoch_ms)`, `formatInstant(...)` — stays legal, because the
   * instant is a delivered fact and only its RENDERING is local.
   */
  it("never reads the browser clock", () => {
    const scanned = code();
    expect(scanned).not.toMatch(/\bDate\s*\.\s*now\s*\(/);
    expect(scanned).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
    expect(scanned).not.toMatch(/\bperformance\s*\.\s*now\s*\(/);
  });

  it("the scan would catch a browser clock if one were added", () => {
    const fixture = blank(
      `const age = Date.now() - sync.latest_arrival_ms;\nconst t = new Date();`,
    );
    expect(fixture).toMatch(/\bDate\s*\.\s*now\s*\(/);
    expect(fixture).toMatch(/\bnew\s+Date\s*\(\s*\)/);
  });

  it("does NOT ban formatting a server-stated instant", () => {
    const fixture = blank(`const label = new Date(sync.server_now_ms).toLocaleString("en-GB");`);
    expect(fixture).not.toMatch(/\bnew\s+Date\s*\(\s*\)/);
    expect(fixture).not.toMatch(/\bDate\s*\.\s*now\s*\(/);
  });
});

describe("Commandment 6 — money goes through the semantic component", () => {
  /**
   * `21 §2` / Commandment 6: *"`packages/ui` semantic components only"*. `MoneyValue` is what
   * carries `27-F23`'s symbol-first grouping, `27-F26`'s tabular figures, `27-F12`'s direction
   * WORD and `27-F16`'s abnormal opt-in — four rules that a screen re-implementing the format
   * would have to get right four separate times, and would eventually get wrong once.
   *
   * **A mention is not an import**, so this matches the import statement over blanked source
   * rather than the identifier anywhere in the file.
   */
  it("imports MoneyValue from @restos/ui", () => {
    const source = raw();
    const importLine = /import\s*\{[^}]*\bMoneyValue\b[^}]*\}\s*from\s*["']@restos\/ui["']/;
    expect(importLine.test(source)).toBe(true);
  });

  /**
   * The other half, and the one that actually bites: an import that is present while a hand-rolled
   * string does the work beside it. The app's own `lib/money.ts#formatPaisa` is a legitimate
   * helper for the price editor and is exactly the wrong thing here — it returns a STRING, which
   * carries no colour for `27-F16` to spend and no direction for `27-F12`.
   */
  it("formats no rupee figure of its own", () => {
    const scanned = code();
    expect(scanned).not.toMatch(/\btoLocaleString\s*\(/);
    expect(scanned).not.toMatch(/\bformatPaisa\b/);
    expect(scanned).not.toMatch(/\bIntl\s*\.\s*NumberFormat\b/);
    // `DEC-MONEY-005` seen from the display edge: no division by 100 to reach rupees.
    expect(scanned).not.toMatch(/\/\s*100\b/);
  });
});
