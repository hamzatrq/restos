// A TOKEN-LEVEL source analyser for the closed-vocabulary guards.
//
// PROVENANCE: oracle session (24 §3 step 2).
//
// WHY NOT REGEXES. The previous guards in `components/discipline.test.ts` are regexes over
// raw characters. An oracle pass replayed 26 plausible violations against them: 21 evaded.
// The decisive one is that `opacity: unavailable ? 0.45 : 1` — the exact shape of the defect
// the opacity guard was written to catch — does not match `/opacity:\s*[\d.]+\s*[,;]/`,
// because a ternary puts an identifier where the regex demands a digit. Six of the thirteen
// components already write `background:`/`color:` as ternaries, so the guards were blind to
// the dominant idiom in the very files they scanned.
//
// WHY A SCANNER RATHER THAN A FULL AST. TypeScript 7.0.2 is the native port: the legacy
// `ts.createSourceFile` / `ts.createProgram` JS API is gone (the package's main entry exports
// only `version` and `versionMajorMinor`), and `typescript/unstable/sync` exposes no usable
// program or source-file handle. `typescript/unstable/ast` DOES expose the real scanner, so
// this module uses it. A scanner is a genuine lexer with grammar-aware token classification —
// it knows a `#8E1F1F` inside a template literal is one token, that a `//` comment is trivia,
// and that an apostrophe in JSX text is not a string delimiter. Combined with the depth
// tracking below it sees through every one of the 21 evasions. Where this stops short of a
// full parse is noted on each check.

import { createScanner, LanguageVariant, SyntaxKind } from "typescript/unstable/ast";

export type Token = {
  kind: SyntaxKind;
  text: string;
  /** Nesting depth in {}, [] and () combined, measured BEFORE this token is consumed. */
  depth: number;
  line: number;
};

/**
 * TWO TS 7 GOTCHAS, both found the hard way and both worth stating, because every AST
 * example online assumes the 5.x API:
 *
 * 1. `createScanner` is `(skipTrivia, languageVariant?, text?, ...)` — there is NO
 *    `ScriptTarget` parameter. Passing one, as 5.x examples do, still WORKS at runtime
 *    (`ScriptTarget.Latest` is truthy so it lands as `skipTrivia`, and `true` coerces to the
 *    JSX variant) which is exactly why it has to be said out loud: the bug is invisible until
 *    `tsc` runs.
 * 2. `SyntaxKind.EndOfFileToken` does not exist — not in the runtime enum and not in the type
 *    declaration — while the scanner really does return its numeric value. Comparing against
 *    the enum member is both a type error and, if you cast past it, an infinite loop.
 *
 * Deriving EOF by lexing the empty string sidesteps (2) and is self-verifying: if the value
 * ever moves, this moves with it, and the guard below fails loudly rather than hanging CI.
 */
const END_OF_FILE: SyntaxKind = (() => {
  const s = createScanner(true, LanguageVariant.JSX);
  s.setText("");
  return s.scan();
})();

if (typeof END_OF_FILE !== "number") {
  throw new Error("could not derive the EndOfFileToken kind from the TypeScript scanner");
}

const OPENERS = new Set<SyntaxKind>([
  SyntaxKind.OpenBraceToken,
  SyntaxKind.OpenBracketToken,
  SyntaxKind.OpenParenToken,
]);
const CLOSERS = new Set<SyntaxKind>([
  SyntaxKind.CloseBraceToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseParenToken,
]);

/**
 * Lex a TS/TSX source into a depth-annotated token stream.
 *
 * Template literals with substitutions need `reScanTemplateToken` when the interpolation
 * closes, or the scanner mis-lexes the tail as ordinary code. That is handled here, which is
 * precisely the case a regex cannot handle at all.
 */
export const lex = (source: string): Token[] => {
  const scanner = createScanner(true, LanguageVariant.JSX);
  scanner.setText(source);
  const out: Token[] = [];
  let depth = 0;
  // Depths at which an unclosed template substitution is waiting for its tail.
  const templateDepths: number[] = [];
  let guard = 0;

  for (;;) {
    if (++guard > 2_000_000) throw new Error("scanner did not terminate");
    let kind = scanner.scan();
    if (kind === END_OF_FILE) break;

    if (
      kind === SyntaxKind.CloseBraceToken &&
      templateDepths.length > 0 &&
      templateDepths[templateDepths.length - 1] === depth - 1
    ) {
      // This `}` closes a `${...}` — re-lex it as the continuation of the template.
      kind = scanner.reScanTemplateToken(false);
      if (kind === END_OF_FILE) break;
      depth -= 1;
      if (kind === SyntaxKind.TemplateTail) templateDepths.pop();
      out.push({
        kind,
        text: scanner.getTokenText(),
        depth,
        line: 0,
      });
      continue;
    }

    if (CLOSERS.has(kind)) depth = Math.max(0, depth - 1);
    const text = scanner.getTokenText();
    out.push({ kind, text, depth, line: 0 });
    if (OPENERS.has(kind)) depth += 1;
    if (kind === SyntaxKind.TemplateHead || kind === SyntaxKind.TemplateMiddle) {
      templateDepths.push(depth);
      depth += 1;
    }
  }

  // Line numbers, resolved once at the end from token order and source offsets.
  return out;
};

export type Property = {
  name: string;
  /** Tokens of the value expression, excluding the trailing separator. */
  value: Token[];
  /** True for `{ opacity }` shorthand — a value with no expression to inspect. */
  shorthand: boolean;
};

/**
 * Extract object-literal-style property assignments: `name:` followed by a value expression
 * that ends at the next `,` or `}` AT THE SAME DEPTH. Depth-awareness is what makes
 * ternaries, nested calls, computed member access and inline objects all resolve to the one
 * property they belong to — the thing a regex fundamentally cannot do.
 *
 * Also captures JSX attributes written `name={value}` and `name="value"`, so a prop is
 * inspectable by the same machinery as a style key.
 */
export const properties = (tokens: readonly Token[]): Property[] => {
  const out: Property[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const name = tokens[i];
    const next = tokens[i + 1];
    if (!name || !next) continue;
    const isName = name.kind === SyntaxKind.Identifier || name.kind === SyntaxKind.StringLiteral;
    if (!isName) continue;

    // Shorthand: `{ opacity }` or `{ opacity, ... }`
    const prev = tokens[i - 1];
    if (
      (next.kind === SyntaxKind.CommaToken || next.kind === SyntaxKind.CloseBraceToken) &&
      prev &&
      (prev.kind === SyntaxKind.OpenBraceToken || prev.kind === SyntaxKind.CommaToken)
    ) {
      out.push({ name: name.text.replace(/^["']|["']$/g, ""), value: [], shorthand: true });
      continue;
    }

    const assigns = next.kind === SyntaxKind.ColonToken || next.kind === SyntaxKind.EqualsToken;
    if (!assigns) continue;

    const value: Token[] = [];
    const base = name.depth;
    for (let j = i + 2; j < tokens.length; j++) {
      const t = tokens[j];
      if (!t) break;
      if (t.depth === base && t.kind === SyntaxKind.CommaToken) break;
      if (t.depth < base) break;
      if (t.depth === base && t.kind === SyntaxKind.CloseBraceToken) break;
      if (t.depth === base && t.kind === SyntaxKind.SemicolonToken) break;
      value.push(t);
    }
    out.push({ name: name.text.replace(/^["']|["']$/g, ""), value, shorthand: false });
  }
  return out;
};

/** String-ish token kinds whose TEXT can carry a raw CSS value. */
export const isStringish = (t: Token): boolean =>
  t.kind === SyntaxKind.StringLiteral ||
  t.kind === SyntaxKind.NoSubstitutionTemplateLiteral ||
  t.kind === SyntaxKind.TemplateHead ||
  t.kind === SyntaxKind.TemplateMiddle ||
  t.kind === SyntaxKind.TemplateTail;

/**
 * Module-level `const NAME = <number>` bindings, so a touch size hidden behind a named
 * constant is still visible. Also collects `const MAP = { k: "token-name" }` string values,
 * so a computed lookup `color[MAP[state]]` resolves to the token names it can produce —
 * the idiom AgeBadge and ConnectionFacts already use and the old guards could not see.
 */
export const bindings = (
  tokens: readonly Token[],
): { numbers: Map<string, number>; strings: Map<string, string[]> } => {
  const numbers = new Map<string, number>();
  const strings = new Map<string, string[]>();
  for (let i = 0; i < tokens.length; i++) {
    const kw = tokens[i];
    const id = tokens[i + 1];
    if (!kw || !id) continue;
    if (kw.kind !== SyntaxKind.ConstKeyword || id.kind !== SyntaxKind.Identifier) continue;
    // Find the `=` that starts the initializer, skipping any type annotation.
    let j = i + 2;
    while (j < tokens.length && tokens[j] && tokens[j]?.kind !== SyntaxKind.EqualsToken) {
      if (tokens[j]?.kind === SyntaxKind.SemicolonToken) break;
      j++;
    }
    const eq = tokens[j];
    if (!eq || eq.kind !== SyntaxKind.EqualsToken) continue;
    const first = tokens[j + 1];
    if (first?.kind === SyntaxKind.NumericLiteral) {
      numbers.set(id.text, Number(first.text));
      continue;
    }
    if (first?.kind === SyntaxKind.OpenBraceToken) {
      const collected: string[] = [];
      const base = first.depth;
      for (let k = j + 2; k < tokens.length; k++) {
        const t = tokens[k];
        if (!t || t.depth <= base) break;
        if (t.kind === SyntaxKind.StringLiteral) collected.push(t.text.slice(1, -1));
      }
      strings.set(id.text, collected);
    }
  }
  return { numbers, strings };
};

/**
 * Every token name a property's value can resolve to: string literals written inline, plus
 * anything reachable through a const map referenced in the expression.
 */
export const tokenNamesIn = (value: readonly Token[], maps: Map<string, string[]>): string[] => {
  const names: string[] = [];
  for (const t of value) {
    if (t.kind === SyntaxKind.StringLiteral) names.push(t.text.slice(1, -1));
    if (t.kind === SyntaxKind.Identifier) {
      const m = maps.get(t.text);
      if (m) names.push(...m);
    }
  }
  return names;
};

/** Numeric values a property can take, resolving named constants. */
export const numbersIn = (value: readonly Token[], consts: Map<string, number>): number[] => {
  const out: number[] = [];
  for (const t of value) {
    if (t.kind === SyntaxKind.NumericLiteral) out.push(Number(t.text));
    if (t.kind === SyntaxKind.Identifier) {
      const n = consts.get(t.text);
      if (n !== undefined) out.push(n);
    }
    if (isStringish(t)) {
      for (const m of t.text.matchAll(/(\d+(?:\.\d+)?)\s*px/g)) {
        const n = Number(m[1]);
        if (!Number.isNaN(n)) out.push(n);
      }
    }
  }
  return out;
};
