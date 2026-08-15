#!/usr/bin/env node
/**
 * `14-F38` / `00 §5.6` — THE JARGON RAIL: no internal identifier reaches a user's screen.
 *
 * The founder opened the back office's own menu editor and read, on a help line under a field:
 * *"Leave blank to inherit from the category above (03-F50)."* `03-F50` is a cross-reference into
 * our requirements corpus. To a restaurant owner it reads like an error code — and one string told
 * her to *"Set ENABLED_BRANCHES and ENABLED_CHANNELS on the RestOS service"*, which is an act she
 * cannot perform and a sentence she cannot act on.
 *
 * Seventeen of this repo's user-facing catalog strings carried one when this rail was written. The
 * cleanup is the cheap half and it ROTS: the next session writing a help line will reach for the FR
 * id, because that is what every code comment around it does — correctly. So the rule is mechanical.
 *
 * FOUR CLASSES NEVER RENDER (`14-F38`'s list, one named rule each):
 *
 *   fr-id     an FR/NFR id — `03-F50`, `01-N5`. Our filing system, not a fact about a menu.
 *   env-key   an environment variable or configuration key — `ENABLED_BRANCHES`, `DATABASE_URL`.
 *             A user cannot set one; naming it sends her to a person, so say *that* instead.
 *   repo-path a repository path or package name — `services/api`, `@restos/domain`.
 *   spec-ref  a spec section or document number — `00 §5.6`, *doc 13*.
 *
 * ⚠ **COMMENTS ARE STRIPPED FIRST, AND THAT IS THE WHOLE PRECISION OF THIS RAIL.** A code comment
 * citing an FR is how this codebase explains itself; there are hundreds and every one is correct.
 * `apps/backoffice/src/lib/strings.ts` carries `03-F50` in the comment ABOVE the string this rail
 * was built for — the comment must survive, the sentence must not. `02-F52` drew exactly this line
 * for the word *86*: the jargon stays in the FRs and the code, and never reaches glass or paper.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT "USER-FACING" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT COVER
 * ---------------------------------------------------------------------------------------------
 *
 * FAILING SCOPE = every string in the SHIPPING SOURCE OF A MODULE WHOSE SPEC HAS ADOPTED THE RULE,
 * minus test paths (`ADOPTED`, below). One boundary — the module — and it is the only one the
 * corpus draws:
 *
 *   `14-F38` closes by scoping itself: *"this binds THIS module. The same defect plausibly exists
 *   on other surfaces; widening it platform-wide amends `21 §5`'s language law or `00 §5.6` and is
 *   deliberately not taken here."* A rail that failed doc 02's strings would be enforcing a policy
 *   the corpus declined to set — commandment 2, committed by a script. So another module joins by
 *   adopting the rule in its own doc and adding one line to `ADOPTED`; until then it is COUNTED in
 *   the register, which is how the next adopter finds out there is anything to adopt.
 *
 * ⚠ **IT WAS THE CATALOG ONLY UNTIL AUGUST 2026, AND THE MEASURED CONSEQUENCE WAS THAT IT PASSED
 * WHILE THE PRODUCT FAILED.** The old boundary read: *"the CATALOG, because `00 §5.6` defines it as
 * where user-facing strings live … inside one, a string is user-facing by construction, so there is
 * no judgement to argue with and no false positive."* Every clause of that is true and the
 * conclusion was still wrong, which is what makes it worth keeping in full. `00 §5.6` says where
 * strings SHOULD live; its inline-literal ban is not wired in this repo, so it does not say where
 * they DO live. `14-F38` does not say "no catalog entry contains" — it says **"no RENDERED string
 * contains"**. Measured the day this widened: an owner typing `450.50` into the price grid met
 * *"whole rupees only — no decimals and no grouping separators (27-F23)"*, authored in
 * `apps/backoffice/src/lib/money.ts`, rendered verbatim by `components/price-grid.tsx` — and this
 * rail reported CLEAN at exit 0. The old header even NAMED those two files as the register's
 * headline example. A rail that names the live defect in its own output and exits 0 is not a narrow
 * rail; it is an inert one. **When the contract and the product disagree, the rail follows the
 * product.**
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE WHOLE MODULE, AND NOT A CLEVERER RULE — THE FALSE-POSITIVE CLASS IS MEASURED AT ZERO
 * ---------------------------------------------------------------------------------------------
 *
 * The obvious objection is the right one: a blanket sweep of `src/**` drowns in developer-facing
 * text — boot lines, thrown errors, CI verdicts — and a rail that cries wolf gets switched off,
 * which is worse than a narrow one. Two rules were considered and both are worse than this:
 *
 *   *Only strings on named "text carriers"* (`reason`, `label`, `help`, `message`): catches
 *   `money.ts` today and invents a vocabulary the corpus never wrote. The next refusal returned as
 *   `{ why: "…" }`, or as a bare `return "…"`, is missed SILENTLY — a false negative that looks
 *   exactly like a clean run. That is this rail's own named failure mode (mutant V10), designed in.
 *
 *   *Only strings the renderer transitively reaches*: correct, and it needs a dataflow analysis
 *   this repo has no business growing in a `scripts/*.mjs` (`18 §15` rule 1).
 *
 * So the scope is the module, and the objection is answered by MEASUREMENT rather than by argument:
 * **`apps/backoffice/src` contains no `console.*` call and no `throw` statement at all** — a Next.js
 * product surface has neither a boot line nor a CI verdict to protect, because it is not a process
 * and not a gate. Where developer output does exist it lives in modules that have not adopted
 * (`layout-gate/`'s verdicts, `sync-gateway`'s boot lines), and those are counted, never failed.
 * The measurement is the defence, so re-take it before adopting the next module: if it has
 * developer output, that is a fact about that module, not a reason to narrow this one.
 *
 * And when `apps/backoffice` does one day grow a developer-facing string, the answer is the
 * `@jargon-ok` marker below — one line, carrying a reason, reviewable, and it FAILS the moment it
 * stops applying. That is loud. Narrowing the glob to avoid it would be quiet, and this file's
 * entire history is the case against quiet.
 *
 * NOT COVERED, and the list is shorter than it was: `packages/ui` renders no strings of its own but
 * takes them as props (so its callers are where the sentence is), a template's `${…}` is walked as
 * CODE so a literal inside an interpolation is not read, and a screen can be perfectly free of
 * jargon and still incomprehensible. `components/pending-edits.tsx` renders
 * `${edit.entity} / ${edit.entity_id}` — internal kind strings on the glass, `14-F38`'s own last
 * sentence — and no string rule can see it, because the jargon is in the DATA and not in the text.
 * This rail removes a class of damage; it does not make a sentence good.
 *
 * ---------------------------------------------------------------------------------------------
 * THE OPT-OUT IS A STATED DECISION, NEVER A SILENT ALLOWLIST (`24-F14`'s idiom, as check-seams)
 * ---------------------------------------------------------------------------------------------
 *
 *     // @jargon-ok the fiscal receipt legally must print the FBR clause id
 *     invoiceClause: "…",
 *
 * A marker carries a reason (>= 12 characters) or it is rejected. A marker on a string that no
 * longer contains jargon is rejected too — a stale exception is how an allowlist rots into a mute
 * button, and the register cannot rot if the marker fails the moment it stops applying. A marker in
 * the file header (before the first import/export) covers the whole file, with one reason.
 *
 * ---------------------------------------------------------------------------------------------
 * EMPTY-MATCH PROTECTION (`24-F14`), AND WHY IT IS A SELF-TEST HERE RATHER THAN A COUNT
 * ---------------------------------------------------------------------------------------------
 *
 * check-seams asserts each rule matched a non-zero number of files. That idiom is unavailable to
 * this rail in its steady state: once the catalogs are clean, EVERY rule matches zero strings, and
 * "clean" and "inert" are the same output. So each rule is fired at a known violation and at a
 * legitimate near-miss on every run, before any verdict is trusted — the same move
 * `apps/backoffice/src/__acceptance__/two-plane.test.ts` makes ("fires each rule at a known
 * violation first, so a clean report is evidence rather than an absence"). The comment-stripping
 * and literal-scanning pipeline is fired at a specimen too, because a stripper that swallowed
 * everything would also report clean.
 *
 * Plain Node, no new dependency (`18 §15` rule 1: a small utility is written, not installed).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const ROOT = resolvePath(new URL("..", import.meta.url).pathname);
const MARKER = "@jargon-ok";
const REASON_MIN = 12;

/** A test is not a screen. A fixture must be able to write the string this rail detects. */
const TEST_PATH =
  /(^|\/)(__acceptance__|__oracle__|__fixtures__|__mocks__)\/|\.(test|spec|stories)\.[cm]?[jt]sx?$/;

const fail = (message) => {
  console.error(`check-strings: ${message}`);
  process.exit(1);
};

// ---------------------------------------------------------------------------------------------
// 1. The four rules. Each carries the specimen that proves it bites and the near-miss that proves
//    it is not merely matching everything — both exercised on every run (section 5).
// ---------------------------------------------------------------------------------------------

const RULES = [
  {
    id: "fr-id",
    what: "an FR/NFR id",
    // `\d{2}-F12` / `\d{2}-N5`, with the lettered form (`27-F11a`) the corpus also uses.
    re: /\b\d{2}-[FN]\d+[a-z]?\b/g,
    fix: "carry the FACT into the sentence and drop the id — the owner needs what happens, not where it is written down",
    specimen: "Leave blank to inherit from the category above (03-F50).",
    nearMiss: "The tills keep today's menu until 05:00. Rs 1,850 was rung on 2 Jul.",
  },
  {
    id: "env-key",
    what: "an environment variable or configuration key",
    // SCREAMING_SNAKE_CASE of two or more segments. A general shape rather than a prefix list:
    // `RESTOS_*`/`ENABLED_*`/`BOOTSTRAP_*` were the known offenders, but `DATABASE_URL` and
    // `SESSION_SECRET` share none of those prefixes, and the next one will share none either.
    re: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g,
    fix: "an owner cannot set one — say who to ask, or what she should do instead",
    specimen: "Set ENABLED_BRANCHES and ENABLED_CHANNELS on the RestOS service.",
    nearMiss: "TAKE CASH opens the drawer. RestOS never asks twice.",
  },
  {
    id: "repo-path",
    what: "a repository path or package name",
    re: /@restos\/[a-z0-9-]+|\b(?:apps|services|packages|scripts)\/[a-z0-9-]+/g,
    fix: "name the thing in the owner's world (`the RestOS service`), never ours",
    specimen: "Ask whoever runs services/api to restart it, or check @restos/domain.",
    nearMiss: "One price per branch and channel — counter/storefront included.",
  },
  {
    id: "spec-ref",
    what: "a spec section or document number",
    re: /§|\bdocs?\s+\d{1,2}\b/g,
    fix: "state the rule itself; the owner has no corpus to look it up in",
    specimen: "English only per 00 §5.6, and doc 13 carries the narrative.",
    nearMiss: "Print the document 2 minutes before service. Every change is kept.",
  },
];

// ---------------------------------------------------------------------------------------------
// 2. Source text → the text a human could read, with comments removed FIRST.
//
//    A scanner rather than a regex sweep, for one reason each: a comment may contain a quote
//    (`don't`), a string may contain the other quote (`the server's`), a template's `${…}` is CODE
//    and its identifiers are not prose, and a regex literal may contain a lone quote (`/["']/`)
//    which would otherwise open a string and swallow the rest of the file.
//
//    ⚠ **JSX MODE (August 2026) — `.tsx` used to be UNSCANNED, and the header said so honestly:**
//    *"an apostrophe in `don't` between two tags opens a phantom string and the count downstream is
//    fiction."* That is true of a JS-only scanner and it left every renderer file out of reach, on
//    the one rail whose subject is text a person reads. It is now a three-context machine — JS,
//    inside a JSX tag, and JSX children — so `don't` between two tags is TEXT (never a quote), an
//    attribute string is a literal, `{…}` is JS again, and the children of an element are read out
//    as text in their own right. Prose is now *more* covered, not merely safe: a sentence typed
//    straight into a component is exactly the shape this rail exists to catch.
//
//    ⚠ **AND IT CAN FAIL TO PARSE, WHICH MUST BE LOUD.** `<T,>(x: T) => x` — a generic arrow, legal
//    in `.tsx` — is indistinguishable from an element without a type checker, and mis-entering JSX
//    swallows the rest of the file as children: a scan that reports nothing, in the safe-looking
//    direction, which is this rail's own named failure mode. So the returned array carries
//    `.unbalanced` when the machine did not come back to the top level, and the caller FAILS on it.
// ---------------------------------------------------------------------------------------------

/**
 * A VALUE position: where a value may begin, so `<` opens JSX rather than comparing two numbers.
 * The punctuation set alone cannot express `return <Row/>`, which is why the previous WORD is
 * consulted first — a bare identifier before `<` (`useState<string>(…)`, `a < b`) is never JSX.
 */
const VALUE_PUNCT = /[=(,:[!&|?{};+\-*%~^<>]/;
const VALUE_KEYWORD = new Set([
  "return",
  "case",
  "typeof",
  "in",
  "of",
  "throw",
  "default",
  "await",
  "yield",
  "else",
  "do",
  "new",
  "delete",
  "void",
  "instanceof",
]);

const scanLiterals = (src, { jsx = false } = {}) => {
  const out = [];
  let i = 0;
  let line = 1;
  let prevSignificant = "";
  let prevWord = "";
  /** JS · inside a `<tag …>` · between an element's tags. A stack, because JSX nests through `{}`. */
  const stack = [{ kind: "js", brace: 0 }];
  const mark = (c) => {
    prevSignificant = c;
    prevWord = "";
  };
  const valuePosition = () =>
    prevWord !== ""
      ? VALUE_KEYWORD.has(prevWord)
      : prevSignificant === "" || VALUE_PUNCT.test(prevSignificant);

  while (i < src.length) {
    const ctx = stack[stack.length - 1];

    // ---- JSX CHILDREN: everything is TEXT until a tag or an expression opens. ------------------
    if (ctx.kind === "jsx-children") {
      // The line reported is where the first non-space character is, not where the tag ended: a
      // node opened by `<p>` at the end of one line and written on the next belongs to the next.
      let startLine = line;
      let text = "";
      while (i < src.length && src[i] !== "<" && src[i] !== "{") {
        if (!/\S/.test(text) && /\S/.test(src[i])) startLine = line;
        if (src[i] === "\n") line++;
        text += src[i];
        i++;
      }
      // Read out as a literal in its own right: `<p>Set ENABLED_BRANCHES</p>` is the defect with
      // the quotes taken off. Whitespace between two tags is not text and is not counted.
      if (/\S/.test(text)) out.push({ line: startLine, text, isSpecifier: false, jsxText: true });
      if (i >= src.length) break;
      if (src[i] === "{") {
        stack.push({ kind: "js", brace: 0 });
        i++;
        mark("{");
        continue;
      }
      if (src[i + 1] === "/") {
        while (i < src.length && src[i] !== ">") {
          if (src[i] === "\n") line++;
          i++;
        }
        i++;
        stack.pop();
        mark(">");
        continue;
      }
      stack.push({ kind: "jsx-tag" });
      i++;
      continue;
    }

    const c = src[i];

    // ---- INSIDE A TAG: attribute strings are read; `{` is JS again. ----------------------------
    //
    // ⚠ Comments are stripped HERE as well, and that is not symmetry for its own sake — it is the
    // first defect this machine had, found by pointing it at the shipped `catalog-screen.tsx`
    // rather than at a specimen. That file explains an attribute in a block comment BETWEEN two
    // attributes, and the comment contains the words *"one screen's tree"*. Unstripped, the
    // apostrophe opened a string that ran on until the next quote, swallowing a `>` and leaving one
    // element permanently open — after which the rest of the file was read as JSX text. It cost
    // nothing visible: the run reported FEWER strings and would have exited clean.
    if (ctx.kind === "jsx-tag" && c !== '"' && c !== "'" && !(c === "/" && src[i + 1] === "*")) {
      if (c === "\n") line++;
      else if (c === "/" && src[i + 1] === "/") {
        while (i < src.length && src[i] !== "\n") i++;
        continue;
      } else if (c === "/" && src[i + 1] === ">") {
        i += 2;
        stack.pop();
        mark(">");
        continue;
      } else if (c === ">") {
        ctx.kind = "jsx-children";
        i++;
        mark(">");
        continue;
      } else if (c === "{") {
        stack.push({ kind: "js", brace: 0 });
        i++;
        mark("{");
        continue;
      }
      i++;
      continue;
    }

    if (c === "\n") {
      line++;
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      const startLine = line;
      const lineStart = src.lastIndexOf("\n", i - 1) + 1;
      const prefix = src.slice(lineStart, i);
      let text = "";
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          text += src[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          let depth = 1;
          while (i < src.length && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            else if (src[i] === "\n") line++;
            i++;
          }
          continue;
        }
        if (src[i] === "\n") line++;
        text += src[i];
        i++;
      }
      i++;
      mark(quote);
      // A module specifier is a PATH, not prose — `import … from "@restos/domain"` would otherwise
      // be a `repo-path` finding in any catalog that grows an import, which is a false positive on
      // the one rail that must never cry wolf.
      //
      // ⚠ This tested the LINE for an `import`/`export` keyword until a mutant caught it: that
      // suppressed `export const label = "Export to Excel (14-F24)"` — a genuine user-facing
      // string, silently, in the safe-looking direction. Only the literal's POSITION decides:
      // directly after `from`, after `import`/`import(`, or inside `require(`.
      const isSpecifier = /\bfrom\s*$|\bimport\s*\(?\s*$|\brequire\(\s*$/.test(prefix);
      out.push({ line: startLine, text, isSpecifier });
      continue;
    }
    if (jsx && c === "<" && valuePosition() && /[A-Za-z_$>]/.test(src[i + 1] ?? "")) {
      stack.push({ kind: "jsx-tag" });
      i++;
      continue;
    }
    if (c === "{") {
      ctx.brace++;
      i++;
      mark("{");
      continue;
    }
    if (c === "}") {
      // Brace zero with a parent means this JS ran inside a JSX `{…}` — close it, don't go negative.
      if (ctx.brace === 0 && stack.length > 1) stack.pop();
      else ctx.brace--;
      i++;
      mark("}");
      continue;
    }
    if (c === "/" && /[=(,:[!&|?{};+\-*%~^<>]|^$/.test(prevSignificant)) {
      i++;
      let inClass = false;
      while (i < src.length) {
        const d = src[i];
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === "\n") break;
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) {
          i++;
          break;
        }
        i++;
      }
      mark("/");
      continue;
    }
    // An identifier is consumed WHOLE, so the word before a `<` is knowable. `return` is a value
    // position and `useState` is not, and no single character can tell them apart.
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      prevWord = src.slice(i, j);
      prevSignificant = src[j - 1];
      i = j;
      continue;
    }
    if (!/\s/.test(c)) mark(c);
    i++;
  }
  // The tripwire. A `.tsx` the machine could not walk reports FEWER strings, never more, so this
  // must be a verdict and not a shrug — see the header.
  out.unbalanced = stack.length > 1;
  // The mode is reported by the SCANNER rather than remembered by the caller, so "was this `.tsx`
  // actually read as JSX" is answerable at the call site. A mutant passing `jsx: false` there — the
  // shape of every "simplification" that would un-do this widening — is then a verdict and not a
  // quieter run. Found by mutation: it survived every self-test, because the self-tests call this
  // function directly and therefore pass their own flag.
  out.jsx = jsx;
  return out;
};

const violationsIn = (text) => {
  const found = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) found.push({ rule, token: m[0] });
  }
  return found;
};

// ---------------------------------------------------------------------------------------------
// 3. The opt-out marker, attached the way check-seams attaches its own.
// ---------------------------------------------------------------------------------------------

/** Every `@jargon-ok` in the file, with the reason that follows it on its own line. */
const markersIn = (raw) => {
  const out = [];
  raw.split("\n").forEach((text, idx) => {
    const at = text.indexOf(MARKER);
    if (at === -1) return;
    const reason = text
      .slice(at + MARKER.length)
      .replace(/\*\/\s*$/, "")
      .replace(/^[\s:—-]+/, "")
      .trim();
    out.push({ line: idx + 1, reason, used: false });
  });
  return out;
};

/** The contiguous run of comment lines directly above `line` (1-based, inclusive range). */
const commentRunAbove = (lines, line) => {
  let i = line - 2; // zero-based index of the line above
  let last = null;
  while (i >= 0) {
    const text = lines[i];
    if (/^\s*$/.test(text)) break;
    if (!/^\s*(\/\/|\/\*|\*|\*\/)/.test(text)) break;
    last = i;
    if (/^\s*\/\*/.test(text)) break;
    i--;
  }
  return last === null ? null : [last + 1, line - 1];
};

/**
 * A catalog entry can be `key: "…"` on one line, or `key:` with the sentence and its continuations
 * below. So a marker is looked for above the LITERAL and above its entry key — plus the file
 * header, which covers everything. Three stated places; nothing implicit.
 */
const markerGoverning = (lines, markers, literalLine, headerEnd) => {
  const ranges = [];
  const above = commentRunAbove(lines, literalLine);
  if (above) ranges.push(above);
  for (let i = literalLine - 1; i >= 1; i--) {
    if (/^\s*(["']?[\w$]+["']?)\s*:/.test(lines[i - 1])) {
      const entry = commentRunAbove(lines, i);
      if (entry) ranges.push(entry);
      break;
    }
  }
  ranges.push([1, headerEnd]);
  return markers.find((m) => ranges.some(([from, to]) => m.line >= from && m.line <= to)) ?? null;
};

// ---------------------------------------------------------------------------------------------
// 4. Discovery. `git ls-files`, so the scan follows the repo's own ignore rules and never walks
//    node_modules or another agent's worktree.
// ---------------------------------------------------------------------------------------------

const tracked = (...globs) => {
  try {
    return execFileSync("git", ["ls-files", "-z", "--", ...globs], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter(Boolean)
      .filter((f) => !TEST_PATH.test(f));
  } catch {
    return [];
  }
};

/**
 * The modules that have adopted the rule, each with the FR that did it. One line per module; a
 * module is added here on the same PR as its own FR, never before. See the header for why this is
 * a list and not a glob over every app.
 *
 * ⚠ **THE SCOPE IS DERIVED FROM THE MODULE, NEVER LISTED BESIDE IT**, and the coverage assertion
 * below enforces that. A hand-written list of directories is one plausible-looking edit away from
 * un-doing this rail: dropping `lib/` on the reasonable-sounding ground that *"a lib module is not
 * a screen"* restores the exact defect the widening was for — `money.ts`'s refusal reasons — and
 * leaves the run CLEAN. So the module is the unit, the globs come from its name, and a file that
 * escapes them is a failure rather than a silence.
 */
const ADOPTED = [{ module: "apps/backoffice", fr: "14-F38" }];

/** Source, by extension rather than by glob: `src/**\/*.ts` does not match `src/index.ts` in git. */
const SOURCE_EXT = /\.[cm]?[jt]sx?$/;

const shipping = tracked(...ADOPTED.map((a) => `${a.module}/src/**`)).filter((f) =>
  SOURCE_EXT.test(f),
);
const catalogs = shipping.filter((f) => f.endsWith("/strings.ts"));
const otherCatalogs = tracked("apps/*/src/**/strings.ts", "packages/*/src/**/strings.ts").filter(
  (f) => !catalogs.includes(f),
);

// ---------------------------------------------------------------------------------------------
// 5. THE SELF-TEST. Nothing below is trusted until every rule has bitten a specimen, declined a
//    near-miss, and the pipeline has proved it reads strings and not comments.
// ---------------------------------------------------------------------------------------------

for (const rule of RULES) {
  if (violationsIn(rule.specimen).some((v) => v.rule.id === rule.id) === false)
    fail(
      `SELF-TEST FAILED — rule \`${rule.id}\` did not flag its own specimen ${JSON.stringify(rule.specimen)}. ` +
        "The rule is inert, so a clean report below would mean nothing (24-F14).",
    );
  const wrong = violationsIn(rule.nearMiss).filter((v) => v.rule.id === rule.id);
  if (wrong.length > 0)
    fail(
      `SELF-TEST FAILED — rule \`${rule.id}\` flagged ${JSON.stringify(wrong[0].token)} in a legitimate ` +
        `sentence: ${JSON.stringify(rule.nearMiss)}. A rail that cries wolf gets disabled (24-F14).`,
    );
}

{
  /**
   * The pipeline, on a file shaped exactly like the defect: all four classes cited in a comment
   * (legitimate — there are hundreds of these, and `14-F38` puts the citation THERE on purpose)
   * directly above the same FR cited in a string (the defect).
   *
   * ⚠ The comment is MULTI-LINE deliberately, and the first draft of this specimen was not. A
   * one-line `/** … *\/` survives broken block-comment stripping by accident: with the block
   * branch disabled, the leading `/` falls through to the regex-literal branch and the closing
   * `*\/` terminates it, so the whole line is eaten anyway and the specimen still scores 2 and 1.
   * Measured — with stripping removed this tripwire stayed GREEN while the real catalog produced
   * six comment-sourced findings. The multi-line form is the shape every real comment here has,
   * and it is the one that discriminates.
   *
   * ⚠ The LINE comment needed the same treatment, for a subtler reason, and it took a second
   * measurement to find: deleting the `//` branch is nearly harmless, because the regex-literal
   * branch below then swallows the rest of the line and imitates it. The one shape that separates
   * them is a line comment containing a `/` — the phantom regex closes ON it, and the quoted words
   * after it become a literal. So the specimen's line comment cites a PATH. Without it, a mutant
   * deleting `//` stripping ran clean at exit 0.
   */
  const specimenSrc = [
    "/**",
    " * `03-F50` — the station is catalog data, and absence means INHERIT.",
    " * `00 §5.6` and doc 13 and ENABLED_BRANCHES and services/api are all legitimate here.",
    " */",
    'const a = "Leave blank to inherit from the category above (03-F50).";',
    "const b = ok()",
    '// see apps/backoffice for the "old" wording (14-F7)',
    'const c = "Archiving keeps the record.";',
  ].join("\n");
  const lits = scanLiterals(specimenSrc);
  const flagged = lits.filter((l) => violationsIn(l.text).length > 0);
  if (lits.length !== 2)
    fail(
      `SELF-TEST FAILED — the literal scanner found ${lits.length} strings in a 2-string specimen. ` +
        "It has stopped reading this codebase's syntax and would report every catalog clean (24-F14).",
    );
  if (flagged.length !== 1 || flagged[0].line !== 5)
    fail(
      "SELF-TEST FAILED — comment stripping is broken: expected exactly the STRING on line 5 to be " +
        `flagged, got ${JSON.stringify(flagged.map((f) => f.line))}. Either a legitimate FR-citing ` +
        "comment now trips this rail (hundreds of them do exist) or strings are no longer read at all.",
    );
}

{
  /**
   * THE SPECIFIER SPECIMEN — the V10 mutant, finally written down as an assertion.
   *
   * The header records that `isSpecifier` once tested the LINE for an `import`/`export` keyword,
   * that this silently suppressed `export const label = "Export to Excel (14-F24)"`, and that only
   * mutation found it. The fix landed; the regression test did not. Measured again in August 2026
   * with the scope widened: restoring the line test still suppresses **22** strings in this repo,
   * still exits at the same code, and still catches enough to look like it works.
   *
   * So both directions are pinned. A real specifier is not prose; a string on a line that merely
   * says `export` is prose, and it is the commonest shape a catalog entry has.
   */
  const specifierSrc = [
    'import { paisa } from "@restos/domain";',
    'export const label = "Export to Excel (14-F24)";',
  ].join("\n");
  const lits = scanLiterals(specifierSrc);
  const prose = lits.filter((l) => !l.isSpecifier).map((l) => l.text);
  if (JSON.stringify(prose) !== JSON.stringify(["Export to Excel (14-F24)"]))
    fail(
      `SELF-TEST FAILED — the module-specifier heuristic read ${JSON.stringify(prose)} as prose, not ` +
        '["Export to Excel (14-F24)"]. Either an import path is now a finding (this rail must never ' +
        "cry wolf) or a genuine user-facing string is being suppressed because its line happens to " +
        "say `export` — which is the V10 defect, and it fails SILENTLY (24-F14).",
    );
}

{
  /**
   * THE JSX SPECIMEN, and every line of it is load-bearing — this is the machine that decides
   * whether a renderer file is read at all, and its failure mode is a QUIETER answer.
   *
   *   line 2  an attribute string, which must be read (a `title=` reaches a screen).
   *   line 3  JSX TEXT with three apostrophes, which must be read as ONE text node and must NOT
   *           open a string. This is the whole reason `.tsx` was excluded before; with the
   *           children context deleted, the `'` in `Don't` opens a literal, the parse desynchronises
   *           and the count below stops matching.
   *   line 5  a block comment BETWEEN two attributes, containing an apostrophe and an FR id. This
   *           is the shape that broke the first draft — see the tag context for the measurement —
   *           and it is legitimate twice over: `14-F38` puts the citation in the comment, and the
   *           comment must not be read as text.
   *   line 7  a `{…}` expression inside an attribute — JS again, so its string is a literal.
   *   line 11 a string AFTER the element closes. A machine that never leaves JSX swallows it, which
   *           is the silent direction: fewer findings, exit 0, nobody the wiser.
   */
  const jsxSrc = [
    "export const Row = () => (",
    '  <div className="p-2">',
    "    Don't set ENABLED_BRANCHES yourself — it's the owner's job, not the cashier's.",
    "    <Field",
    "      /* This screen's station line inherits per 03-F50; blank is the normal case. */",
    '      label="Kitchen name"',
    '      help={"Leave blank (03-F50)."}',
    "    />",
    "  </div>",
    ");",
    'export const after = "Archiving keeps the record (14-F7).";',
  ].join("\n");
  const lits = scanLiterals(jsxSrc, { jsx: true });
  if (lits.unbalanced)
    fail(
      "SELF-TEST FAILED — the JSX scanner did not return to the top level on a balanced specimen, " +
        "so it would refuse every renderer file in the repo (24-F14).",
    );
  const at = (n) => lits.filter((l) => l.line === n).map((l) => l.text.trim());
  const expected = [
    [2, ["p-2"]],
    [3, ["Don't set ENABLED_BRANCHES yourself — it's the owner's job, not the cashier's."]],
    [5, []],
    [6, ["Kitchen name"]],
    [7, ["Leave blank (03-F50)."]],
    [11, ["Archiving keeps the record (14-F7)."]],
  ];
  for (const [line, want] of expected) {
    if (JSON.stringify(at(line)) !== JSON.stringify(want))
      fail(
        `SELF-TEST FAILED — the JSX scanner read ${JSON.stringify(at(line))} on line ${line} of its ` +
          `specimen, not ${JSON.stringify(want)}. \`.tsx\` is where sentences are rendered; a scanner ` +
          "that mis-walks one reports FEWER findings and stays green (24-F14).",
      );
  }
  if (lits.length !== 5)
    fail(
      `SELF-TEST FAILED — the JSX scanner read ${lits.length} text nodes and strings from a specimen ` +
        "holding 5. Something is being swallowed or invented between the tags (24-F14).",
    );
  // And the tripwire itself: a generic arrow is indistinguishable from an element here, so the
  // machine must NOTICE that it never came back rather than silently eating the rest of the file.
  if (
    !scanLiterals('const f = <T,>(x: T) => x;\nconst s = "hi (01-F1)";', { jsx: true }).unbalanced
  )
    fail(
      "SELF-TEST FAILED — an unbalanced JSX walk was not detected. That is the ONE failure of this " +
        "scanner that produces a clean report from an unread file (24-F14).",
    );
}

// EMPTY-MATCH PROTECTION, ASSERTED PER SCOPE HALF (`layout:check`'s lesson, learned the hard way
// there: one half kept a global count non-zero while the other went inert and the rail stayed
// green). The catalog and the rest of the module are two halves of one scope, and `.tsx` is a third
// thing again — it is the half that needs a working JSX machine, so it is asserted by itself.
if (catalogs.length === 0)
  fail(
    `EMPTY MATCH — no \`strings.ts\` under the ${ADOPTED.length} adopted module(s) ` +
      `(${ADOPTED.map((a) => `${a.module} · ${a.fr}`).join("; ")}). \`00 §5.6\` puts every ` +
      "user-facing string in one, so either the catalogs were renamed and this rail is now inert, or " +
      "the app layout moved (24-F14).",
  );

// COVERAGE. Not an empty-match check — the opposite one. The three above ask whether the scope
// still matches something; this asks whether anything in the module has ESCAPED it. It is what
// makes "the module is the unit" a fact rather than an intention.
//
// ⚠ The file list is computed a SECOND time here, from the module name, and the duplication is the
// whole mechanism: a tripwire sharing its input with the thing it checks cannot fail. The mutant
// this exists for is `.filter((f) => !f.includes("/lib/"))` on the scope above — plausible, because
// a lib module does not look like a screen, and it restores the founder's defect in silence.
{
  const declared = ADOPTED.flatMap((a) => tracked(`${a.module}/src/**`)).filter((f) =>
    SOURCE_EXT.test(f),
  );
  const missed = declared.filter((f) => !shipping.includes(f));
  if (missed.length > 0)
    fail(
      `${missed.length} source file(s) of an adopted module are NOT in the failing scope:\n` +
        missed.map((f) => `  ✗ ${f}`).join("\n") +
        "\n`14-F38` binds the module, so every shipping file in it is in scope by definition. A " +
        "file that is tracked, is not a test and is not scanned means the globs were narrowed — " +
        "which is how a rail goes quiet without anyone deleting it (24-F14).",
    );
}

if (shipping.filter((f) => !catalogs.includes(f)).length === 0)
  fail(
    `EMPTY MATCH — the adopted module(s) matched ${shipping.length} shipping file(s) and none of them ` +
      "outside the catalog. The whole point of the widening is that a rendered string does not have " +
      "to live in a catalog (14-F38), so this scope has gone inert (24-F14).",
  );

if (shipping.filter((f) => f.endsWith(".tsx")).length === 0)
  fail(
    "EMPTY MATCH — no `.tsx` in the adopted module(s). Renderer files are where sentences reach a " +
      "person, and the JSX machine above exists only to read them (24-F14).",
  );

// ---------------------------------------------------------------------------------------------
// 6. The scan.
// ---------------------------------------------------------------------------------------------

const findings = [];
const staleMarkers = [];
const emptyReasons = [];
let stringsScanned = 0;
let jsxScanned = 0;
let filesScanned = 0;
let marked = 0;

for (const file of shipping) {
  filesScanned++;
  const raw = readFileSync(resolvePath(ROOT, file), "utf8");
  const lines = raw.split("\n");
  const markers = markersIn(raw);
  const firstCode = lines.findIndex((l) => /^\s*(import|export)\s/.test(l));
  const headerEnd = firstCode === -1 ? 0 : firstCode; // 1-based line before the first import/export

  for (const marker of markers) {
    if (marker.reason.length < REASON_MIN) emptyReasons.push({ file, ...marker });
  }

  const literals = scanLiterals(raw, { jsx: file.endsWith(".tsx") });
  if (file.endsWith(".tsx") && !literals.jsx)
    fail(
      `${file} is a renderer file and was read as plain JS. Its JSX text and every attribute after ` +
        "the first apostrophe are then unread, and the run gets QUIETER rather than louder (24-F14).",
    );
  if (literals.unbalanced)
    fail(
      `${file} — the JSX walk never returned to the top level, so most of this file was NOT READ. ` +
        "A generic arrow (`const f = <T,>(x: T) => x`) is the cause every time it has happened here " +
        "and is indistinguishable from an element without a type checker; the `function f<T>(x: T)` " +
        "form is not, because the `<` then follows a name. This is a verdict rather than a shrug " +
        "because the failure direction is a QUIETER report, not a louder one (14-F38).",
    );

  for (const literal of literals) {
    if (literal.isSpecifier) continue;
    stringsScanned++;
    if (literal.jsxText) jsxScanned++;
    const found = violationsIn(literal.text);
    if (found.length === 0) continue;
    const marker = markerGoverning(lines, markers, literal.line, headerEnd);
    if (marker && marker.reason.length >= REASON_MIN) {
      marker.used = true;
      marked++;
      continue;
    }
    const seen = new Set();
    for (const { rule, token } of found) {
      if (seen.has(`${rule.id} ${token}`)) continue; // one line, one verdict per token
      seen.add(`${rule.id} ${token}`);
      findings.push({ file, line: literal.line, rule, token, text: literal.text });
    }
  }

  for (const marker of markers) {
    if (!marker.used && marker.reason.length >= REASON_MIN) staleMarkers.push({ file, ...marker });
  }
}

// The scope was computed correctly and then the loop read something else. It sounds like a mistake
// nobody makes; it is precisely how this rail shipped in the first place — `catalogs` was the right
// collection for the old scope and is still in scope as a variable, so `for (const file of catalogs)`
// is a one-word edit that reverts the widening, passes every check above, and reports CLEAN.
if (filesScanned !== shipping.length)
  fail(
    `${filesScanned} file(s) were scanned but the adopted scope holds ${shipping.length}. The scan ` +
      "is reading a narrower collection than the one every assertion above just validated (24-F14).",
  );

if (stringsScanned === 0)
  fail(
    `EMPTY MATCH — ${shipping.length} shipping file(s) were opened and zero string literals were read ` +
      "out of them. The scanner no longer matches this codebase's syntax, so every module would look " +
      "clean forever (24-F14).",
  );

// ---------------------------------------------------------------------------------------------
// 7. The register: jargon in the modules that have NOT adopted the rule. Counted, never failed —
//    `14-F38` binds its own module and says so, and a script that enforced doc 02's language would
//    be inventing policy (commandment 2). One exclusion, by name and with a reason:
//
//    `layout-gate/`  a CI gate's own verdict text, printed to a build log. It SHOULD cite the FR
//                    it is enforcing; that is the opposite of this defect.
//
//    ⚠ `.tsx` WAS the second exclusion and is not any more (August 2026). It read: *"the scanner
//    reads JS/TS, not JSX TEXT — an apostrophe in `don't` between two tags opens a phantom string
//    and the count downstream is fiction … renderer files are UNMEASURED here."* That was true and
//    the fix was to teach the scanner JSX, not to keep the hole: renderer files are where a person
//    reads a sentence, so leaving them out made the register understate exactly where it mattered.
//    The old measurement (10 fictional strings in `Counter.tsx`) is now the regression test — the
//    JSX specimen in section 5 fails the moment the children context stops working.
// ---------------------------------------------------------------------------------------------

const registerFiles = tracked(
  "apps/*/src/**/*.ts",
  "apps/*/src/**/*.tsx",
  "packages/*/src/**/*.ts",
  "packages/*/src/**/*.tsx",
).filter((f) => !/\/layout-gate\//.test(f) && !shipping.includes(f));

const register = new Map();
const unreadable = [];
for (const file of registerFiles) {
  let n = 0;
  const literals = scanLiterals(readFileSync(resolvePath(ROOT, file), "utf8"), {
    jsx: file.endsWith(".tsx"),
  });
  // Unlike the adopted scope this is a count, so an unwalkable file is EXCLUDED and named rather
  // than failed — a number nobody can attribute is worse than a number with a stated hole in it.
  if (literals.unbalanced) {
    unreadable.push(file);
    continue;
  }
  for (const literal of literals)
    if (!literal.isSpecifier && violationsIn(literal.text).length > 0) n++;
  if (n > 0) register.set(file, n);
}

const registerReport = () => {
  const unadopted = otherCatalogs.filter((f) => register.has(f));
  const adoptLine =
    unadopted.length === 0
      ? ""
      : `\n\n${unadopted.length} catalog(s) of a module that has NOT adopted the rule carry jargon:\n` +
        unadopted.map((f) => `  · ${f}  (${register.get(f)})`).join("\n") +
        "\n  Not failed, deliberately: `14-F38` binds its own module and says so. That doc adopts it," +
        "\n  then one line joins ADOPTED in this file. Until then this is the number, not a verdict.";
  if (register.size === 0) return adoptLine;
  const total = [...register.values()].reduce((a, b) => a + b, 0);
  const rows = [...register.entries()].sort((a, b) => b[1] - a[1]);
  const shown = rows.slice(0, 6);
  return (
    `\n\n${total} string(s) OUTSIDE a catalog carry internal jargon, across ${register.size} file(s) — ` +
    "counted, not failed:\n" +
    shown.map(([f, n]) => `  · ${f}  (${n})`).join("\n") +
    (rows.length > shown.length ? `\n  · … and ${rows.length - shown.length} more file(s)` : "") +
    "\n  Most are developer-facing — boot lines, anomaly codes, thrown errors — and citing an FR in" +
    "\n  those is correct. Some are not, and only a human reading the module can tell: that is what" +
    "\n  adopting the rule in the owning doc settles, one module at a time. `.tsx` IS measured now." +
    (unreadable.length === 0
      ? ""
      : `\n  ${unreadable.length} file(s) excluded, unwalkable JSX: ${unreadable.slice(0, 3).join(", ")}`) +
    adoptLine
  );
};

// ---------------------------------------------------------------------------------------------
// 8. Report.
// ---------------------------------------------------------------------------------------------

const problems = [];

if (findings.length > 0) {
  const byRule = new Map();
  for (const f of findings) byRule.set(f.rule.id, [...(byRule.get(f.rule.id) ?? []), f]);
  for (const [id, group] of byRule) {
    const rule = RULES.find((r) => r.id === id);
    problems.push(
      `${group.length} user-facing string(s) contain ${rule.what} (\`${id}\`) — ${rule.fix}:\n` +
        group
          .map(
            (f) =>
              `  ✗ ${f.file}:${f.line}  «${f.token}»\n      ${JSON.stringify(f.text.trim().slice(0, 96))}`,
          )
          .join("\n"),
    );
  }
}

if (emptyReasons.length > 0) {
  problems.push(
    `${emptyReasons.length} ${MARKER} marker(s) with no reason (at least ${REASON_MIN} characters — the ` +
      "entire point is that the exception is reviewable):\n" +
      emptyReasons.map((m) => `  ✗ ${m.file}:${m.line}`).join("\n"),
  );
}

if (staleMarkers.length > 0) {
  problems.push(
    `${staleMarkers.length} STALE ${MARKER} marker(s) — the string they excuse carries no jargon any ` +
      "more, so the exception has quietly stopped applying and is now a mute button. Delete it (that " +
      "is the good news: someone rewrote the sentence):\n" +
      staleMarkers.map((m) => `  ✗ ${m.file}:${m.line}  "${m.reason}"`).join("\n"),
  );
}

// "literal", not "string" and not "entry": a sentence built by `+` across three lines is three
// literals here and ONE catalog entry in `14-F38`'s count of 17-in-143. Two honest numbers of two
// different things, and naming the unit is what stops the next reader treating them as a conflict.
const scanned =
  `${stringsScanned} string(s) — ${jsxScanned} of them JSX text — across ${shipping.length} shipping ` +
  `file(s) of ${ADOPTED.length} adopted module(s) (${catalogs.length} of them a catalog), against ` +
  `${RULES.length} rules each fired at a specimen and a near-miss first`;

if (problems.length === 0) {
  console.log(
    `check-strings: clean — no internal identifier reaches a user's screen from an adopted module, ` +
      `wherever in it the sentence was authored. ` +
      `Scanned ${scanned}. ${marked} string(s) excused by ${MARKER}.${registerReport()}`,
  );
  process.exit(0);
}

console.error(
  `check-strings: ${problems.length} finding group(s). Scanned ${scanned}.\n\n${problems.join("\n\n")}\n\n` +
    `Each is our filing system rendered at a restaurant owner, who reads it as an error code (14-F38).\n` +
    `The FACT behind the reference is usually load-bearing — carry it into the sentence in her words\n` +
    `and drop the code. If it genuinely must render, record the decision AT the string:\n` +
    `  \`${MARKER} <why this identifier must reach a user>\`\n` +
    `That is a reviewable statement, not an allowlist: the moment the sentence is rewritten, the\n` +
    `marker itself fails this check and must be deleted. Comments may cite anything — they are\n` +
    `stripped before matching, on purpose.${registerReport()}`,
);
process.exit(1);
