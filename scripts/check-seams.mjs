#!/usr/bin/env node
/**
 * `24-F14` / `24-F15` — THE INTEGRATION-COVERAGE RAIL.
 *
 * Six times in Wave 1 a subsystem was built correctly, tested thoroughly, mutation-hardened —
 * and **nothing in the shipping product called it**. Every gate stayed green each time, because
 * a suite exercises a module DIRECTLY and no gate asserts the application reaches it:
 * `createPinSession` (zero production callers while the app compared `pin === "1234"`), the
 * durable lockout counter (engaged only if a host passed `attempts`; none did), the Argon2id
 * cost floor, `audit.login`'s sink, `SpoolerJobStore` (mutation-proved, then wired with no
 * store), and the catalog transport (built, tested, uncalled — so the till's grid was empty).
 *
 * Six is not bad luck; it is a missing check. This is the check. It answers one question
 * mechanically: **does shipping code reach this?**
 *
 * TWO RULES, because the defect has two shapes and only one of them is a dead export.
 *
 *   A. UNREACHED EXPORT — a value exported from a workspace module that no shipping code
 *      reaches. (`createPinSession`, `createPinAuditSink`, `createCatalogFetch`,
 *      `publishCatalog`.)
 *   B. UNSUPPLIED SEAM — an OPTIONAL property of the options object of a factory that shipping
 *      code DOES call, which no shipping call site ever passes. The export is reached; the
 *      capability behind the option is not. (`createSpooler({ store })`,
 *      `createPinSession({ attempts })`.) Rule A cannot see this one: `createSpooler` is
 *      imported and called, and the durable queue is still dead.
 *
 * SHIPPING CODE = the `src` tree of every `apps/` and `services/` package, minus
 * `__acceptance__/`, `__oracle__/`, `__fixtures__/`, `*.test.*`, `*.spec.*` and `*.stories.*`.
 * A subsystem reached only by its own tests is precisely the defect, so tests are not evidence
 * of reach — by construction.
 *
 * SCOPE, DECLARED (`24 §3b`): Rule A covers **value** exports (const/function/class/enum), not
 * types. An unreferenced `type` is not this defect — no subsystem hides behind it — and
 * including types would have put ~200 pure-noise entries in front of a reviewer. False
 * positives kill a rail faster than false negatives: a rail that cries wolf gets disabled.
 *
 * THE OPT-OUT IS A STATED DECISION, NEVER A SILENT ALLOWLIST. Some exports legitimately have
 * no caller yet — a Wave-2 module landing ahead of its app, a helper only tests may use. Mark
 * it at the declaration — a JSDoc block or a plain line comment directly above it, carrying the
 * tag and a reason:
 *
 *     // @unreached-by-design Wave-2 storefront lands its caller; see plans/wave-2/...
 *     export const createFoo = ...
 *
 * A marker with no reason is rejected. A marker on a symbol that IS reached is rejected too —
 * a stale exception is how an allowlist rots into a mute button. A marker in a file header
 * (before the first import/export) covers every export in that file, with one reason.
 *
 * EMPTY-MATCH PROTECTION (`24-F14`): a rule matching zero files must FAIL, so a rename cannot
 * silently switch the rail off. Every discovery step below asserts a non-zero count.
 *
 * Plain Node, no new dependency (`18 §15` rule 1: a small utility is written, not installed).
 * `knip` is named by `24-F15` for dead exports and was considered first — see NOTES at the
 * bottom of this file for why it does not close this defect.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(new URL("..", import.meta.url).pathname);
const WORKSPACE_GROUPS = ["packages", "apps", "services"];
const SHIPPING_GROUPS = ["apps", "services"];
const MARKER = "@unreached-by-design";
/**
 * The second marker, and it is not a synonym.
 *
 * Baselining existing debt with `@unreached-by-design` would be a lie, and a rail that forces a
 * lie to go green is the mute button it was built to replace. `@unreached-owed` says the
 * opposite thing: a shipping caller IS owed, here is the plan that owes it. Both suppress the
 * failure; only this one is COUNTED AND PRINTED on every clean run, so the debt is a number in
 * front of whoever runs `pnpm verify` rather than a comment nobody greps.
 */
const OWED_MARKER = "@unreached-owed";

/** A test is not evidence of reach. This is the whole premise, so it is one list. */
const TEST_PATH =
  /(^|\/)(__acceptance__|__oracle__|__fixtures__|__mocks__)\/|\.(test|spec|stories)\.[cm]?[jt]sx?$/;

const fail = (message) => {
  console.error(`check-seams: ${message}`);
  process.exit(1);
};

// ---------------------------------------------------------------------------------------------
// 1. Source text: blank comments, strings and regex literals so the parsers below cannot be
//    fooled by an import written inside a doc comment (this file would trip its own rail).
//    Positions are preserved exactly, so line numbers stay honest.
// ---------------------------------------------------------------------------------------------

const blankNonCode = (src, blankStrings = false) => {
  const out = src.split("");
  const keep = (i) => {
    if (src[i] !== "\n") out[i] = " ";
  };
  let i = 0;
  let prevSignificant = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") keep(i++);
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      keep(i++);
      keep(i++);
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) keep(i++);
      keep(i++);
      keep(i++);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++; // keep the opening quote so `from "x"` still parses as a delimited literal
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          if (blankStrings) keep(i);
          i++;
          if (i < src.length) {
            if (blankStrings) keep(i);
            i++;
          }
          continue;
        }
        // `${…}` inside a template literal is CODE, not text. Blanking it would make a symbol
        // used only in an interpolation look unused, and this rail's whole verdict is "used".
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          let braces = 1;
          while (i < src.length && braces > 0) {
            if (src[i] === "{") braces++;
            else if (src[i] === "}") braces--;
            i++;
          }
          continue;
        }
        if (blankStrings) keep(i);
        i++;
      }
      i++;
      prevSignificant = quote;
      continue;
    }
    // A regex literal can contain a lone quote (`/["']/`), which would otherwise open a string
    // and swallow the rest of the file. Distinguish it from division by what precedes it.
    if (c === "/" && /[=(,:[!&|?{};+\-*%~^<>]|^$/.test(prevSignificant)) {
      keep(i++);
      let inClass = false;
      while (i < src.length) {
        const d = src[i];
        if (d === "\\") {
          keep(i++);
          if (i < src.length) keep(i++);
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        else if (d === "\n") break;
        keep(i++);
      }
      keep(i++);
      prevSignificant = "/";
      continue;
    }
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return out.join("");
};

const lineOf = (src, index) => {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
};

// ---------------------------------------------------------------------------------------------
// 2. Workspace discovery.
// ---------------------------------------------------------------------------------------------

const walk = (dir, out = []) => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "build", ".turbo", "storybook-static"].includes(entry.name)) {
        continue;
      }
      walk(path, out);
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
};

/** name -> { dir, group, entries: Map<subpath, absolute file> } */
const workspace = new Map();
for (const group of WORKSPACE_GROUPS) {
  const groupDir = join(ROOT, group);
  if (!existsSync(groupDir)) continue;
  for (const name of readdirSync(groupDir)) {
    const dir = join(groupDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = join(dir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const entries = new Map();
    const exportsField = manifest.exports;
    if (typeof exportsField === "string") {
      entries.set(".", resolvePath(dir, exportsField));
    } else if (exportsField && typeof exportsField === "object") {
      for (const [sub, target] of Object.entries(exportsField)) {
        const file = typeof target === "string" ? target : (target?.import ?? target?.default);
        if (typeof file === "string") entries.set(sub, resolvePath(dir, file));
      }
    }
    workspace.set(manifest.name, { dir, group, entries });
  }
}

if (workspace.size === 0)
  fail(
    "EMPTY MATCH — no workspace packages discovered under apps/, services/, packages/. The layout moved and this rail is now inert (24-F14).",
  );

const allFiles = [];
for (const { dir } of workspace.values()) allFiles.push(...walk(join(dir, "src")));

const isTest = (file) => TEST_PATH.test(relative(ROOT, file).replaceAll("\\", "/"));
const productionFiles = allFiles.filter((f) => !isTest(f));
const groupOf = (file) => relative(ROOT, file).split("/")[0];
const shippingFiles = productionFiles.filter((f) => SHIPPING_GROUPS.includes(groupOf(f)));

if (productionFiles.length === 0)
  fail("EMPTY MATCH — zero production source files found (24-F14).");
if (shippingFiles.length === 0)
  fail(
    `EMPTY MATCH — zero SHIPPING files found under ${SHIPPING_GROUPS.join("/, ")}/. Either the app layout moved or the test-path filter now eats everything; either way this rail proves nothing (24-F14).`,
  );
if (allFiles.length === productionFiles.length)
  fail(
    "EMPTY MATCH — the test-path filter matched no file, so 'reached only by tests' cannot be distinguished from 'reached'. The suite layout moved (24-F14).",
  );

// ---------------------------------------------------------------------------------------------
// 3. Per-file parse: what it exports, what it re-exports, what it imports.
// ---------------------------------------------------------------------------------------------

const splitSpecifiers = (text) =>
  text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = /^(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part);
      if (!m) return null;
      return { source: m[1], exposed: m[2] ?? m[1], typeOnly: /^type\s/.test(part) };
    })
    .filter(Boolean);

const VALUE_KINDS = new Set(["const", "let", "var", "function", "class", "enum"]);

const parse = (file) => {
  const raw = readFileSync(file, "utf8");
  // Two derived views, and the split is load-bearing. `src` keeps STRING CONTENTS because a
  // module specifier lives in one (`from "./x.js"`). `code` blanks them, because an identifier
  // inside an error message is not a use of it — a live false negative when it was one view:
  // `publishCatalog` names itself in three `throw new RangeError("publishCatalog: …")` strings,
  // which read as internal use and hid instance 6 from its own rail.
  const src = blankNonCode(raw);
  const code = blankNonCode(raw, true);
  /** name -> { kind, line, valueLike } */
  const declared = new Map();
  /** name(exposed) -> { from, source } */
  const reexported = new Map();
  const starReexports = [];
  const imports = [];
  const localExports = [];
  /** Spans of every import/export STATEMENT, so `body` below can be the code that actually runs. */
  const statementSpans = [];

  // export { a, b } from "./x"   |   export type { A } from "./x"   |   export { a as b }
  const listRe = /export\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*(["'])([^"']+)\3)?/g;
  for (let m = listRe.exec(src); m !== null; m = listRe.exec(src)) {
    const typeOnlyList = Boolean(m[1]);
    const specs = splitSpecifiers(m[2]);
    const from = m[4];
    statementSpans.push([m.index, m.index + m[0].length]);
    for (const spec of specs) {
      if (from)
        reexported.set(spec.exposed, {
          from,
          source: spec.source,
          typeOnly: typeOnlyList || spec.typeOnly,
          line: lineOf(raw, m.index),
        });
      else localExports.push({ ...spec, line: lineOf(raw, m.index) });
    }
  }

  const starRe = /export\s*\*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?from\s*(["'])([^"']+)\1/g;
  for (let m = starRe.exec(src); m !== null; m = starRe.exec(src)) starReexports.push(m[2]);

  const declRe =
    /(^|[\s;}])export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(const|let|var|function|class|type|interface|enum|abstract\s+class)\s+\*?\s*([A-Za-z_$][\w$]*)/g;
  for (let m = declRe.exec(src); m !== null; m = declRe.exec(src)) {
    const kind = m[2].replace(/^abstract\s+/, "");
    declared.set(m[3], {
      kind,
      line: lineOf(raw, m.index + m[1].length),
      valueLike: VALUE_KINDS.has(kind),
    });
  }

  const namedImportRe =
    /import\s+(?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*(["'])([^"']+)\2/g;
  for (let m = namedImportRe.exec(src); m !== null; m = namedImportRe.exec(src)) {
    statementSpans.push([m.index, m.index + m[0].length]);
    imports.push({
      spec: m[3],
      names: splitSpecifiers(m[1]).map((s) => s.source),
      namespace: false,
    });
  }
  const nsImportRe = /import\s+(?:type\s+)?\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s*(["'])([^"']+)\1/g;
  for (let m = nsImportRe.exec(src); m !== null; m = nsImportRe.exec(src)) {
    statementSpans.push([m.index, m.index + m[0].length]);
    imports.push({ spec: m[2], names: [], namespace: true });
  }
  const defaultImportRe =
    /import\s+(?:type\s+)?([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*(["'])([^"']+)\2/g;
  for (let m = defaultImportRe.exec(src); m !== null; m = defaultImportRe.exec(src)) {
    statementSpans.push([m.index, m.index + m[0].length]);
    imports.push({ spec: m[3], names: ["default"], namespace: false });
  }
  const bareImportRe = /import\s*(["'])([^"']+)\1\s*;/g;
  for (let m = bareImportRe.exec(src); m !== null; m = bareImportRe.exec(src)) {
    statementSpans.push([m.index, m.index + m[0].length]);
    imports.push({ spec: m[2], names: [], namespace: false });
  }
  const dynamicRe = /import\s*\(\s*(["'])([^"']+)\1/g;
  for (let m = dynamicRe.exec(src); m !== null; m = dynamicRe.exec(src)) {
    imports.push({ spec: m[2], names: [], namespace: true });
  }

  // `export { a }` / `export { a as b }` with no `from`. Two cases, and conflating them was a
  // live bug: `a` may be declared here, or it may be an IMPORT this file simply re-exposes
  // (`export { acceptKeystroke }` in `TenderPanel.tsx`). The second is a re-export and must
  // resolve to the defining module, or the symbol is reported dead at a file that never had it.
  for (const spec of localExports) {
    const viaImport = imports.find((imp) => imp.names.includes(spec.source));
    if (viaImport) {
      reexported.set(spec.exposed, {
        from: viaImport.spec,
        source: spec.source,
        typeOnly: spec.typeOnly,
        line: spec.line,
      });
      continue;
    }
    if (declared.has(spec.exposed)) continue;
    const declLocal = new RegExp(
      `(?:^|[\\s;}])(const|let|var|function|class|type|interface|enum)\\s+${spec.source}\\b`,
    );
    const m = declLocal.exec(src);
    if (!m) continue; // a default import re-exposed under a new name; not our code to reach
    declared.set(spec.exposed, {
      kind: m[1],
      line: lineOf(raw, m.index),
      valueLike: VALUE_KINDS.has(m[1]),
    });
  }

  // `body` = the code minus every import/export STATEMENT. It answers the question the rail
  // turned out to need most: is this identifier actually USED here, or merely imported?
  // A leftover import is not reach. Removing `createPinAuditSink(...)`'s call while leaving its
  // import made instance 4 invisible to an import-counting walk — measured, not argued.
  const bodyChars = code.split("");
  for (const [start, end] of statementSpans) {
    for (let k = start; k < end; k++) if (bodyChars[k] !== "\n") bodyChars[k] = " ";
  }
  const body = bodyChars.join("");

  return { file, raw, src, code, body, declared, reexported, starReexports, imports };
};

const modules = new Map();
for (const file of productionFiles) modules.set(file, parse(file));
// Tests are parsed too — not to grant reach, but so the rail can say "reached ONLY by tests",
// which is the sentence a reader needs to act.
const testModules = new Map();
for (const file of allFiles) if (isTest(file)) testModules.set(file, parse(file));

const declaredTotal = [...modules.values()].reduce((n, m) => n + m.declared.size, 0);
if (declaredTotal === 0)
  fail(
    "EMPTY MATCH — parsed zero exported declarations across the whole workspace. The export parser no longer matches this codebase's syntax (24-F14).",
  );

// ---------------------------------------------------------------------------------------------
// 4. Module resolution: relative paths, and `@restos/*` through each package's `exports` field.
// ---------------------------------------------------------------------------------------------

const CANDIDATE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];

const resolveFile = (base) => {
  const attempts = [];
  if (/\.[cm]?jsx?$/.test(base)) {
    attempts.push(base.replace(/\.[cm]?jsx?$/, ".ts"), base.replace(/\.[cm]?jsx?$/, ".tsx"));
  }
  for (const ext of CANDIDATE_EXTENSIONS) attempts.push(base + ext);
  attempts.push(base);
  for (const ext of CANDIDATE_EXTENSIONS) attempts.push(join(base, `index${ext}`));
  for (const attempt of attempts) {
    if (existsSync(attempt) && statSync(attempt).isFile()) return attempt;
  }
  return null;
};

const resolveSpecifier = (fromFile, spec) => {
  if (spec.startsWith(".")) return resolveFile(resolvePath(dirname(fromFile), spec));
  const parts = spec.split("/");
  const pkgName = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const pkg = workspace.get(pkgName);
  if (!pkg) return null; // external dependency — not ours to reach
  const rest = spec.slice(pkgName.length);
  const sub = rest === "" ? "." : `.${rest}`;
  const target = pkg.entries.get(sub);
  return target && existsSync(target) ? target : null;
};

let workspaceEdges = 0;
for (const mod of modules.values()) {
  for (const imp of mod.imports) if (resolveSpecifier(mod.file, imp.spec)) workspaceEdges++;
}
if (workspaceEdges === 0)
  fail(
    "EMPTY MATCH — no import in any production file resolves to a workspace module. Module resolution is broken, so every export would look unreached (24-F14).",
  );

// ---------------------------------------------------------------------------------------------
// 5. Reachability. Roots are the shipping files; from there we follow named imports through
//    re-export chains to the DEFINING module, and mark the symbol reached there.
//
//    Granularity is deliberate and asymmetric: symbols are tracked precisely (a barrel
//    re-exporting a symbol is NOT a use of it — that is the exact hole `createPinSession` fell
//    through), while ENTERING a file marks all of that file's own imports reached. Per-symbol
//    intra-file dataflow would be a type checker; the file-granular over-approximation errs
//    toward "reached", which is the safe direction for a rail nobody may disable.
// ---------------------------------------------------------------------------------------------

const key = (file, name) => `${file}#${name}`;

const usesCache = new Map();
/** Does `name` appear in this module's body — the code left after import/export statements? */
const usesName = (mod, name) => {
  const k = key(mod.file, name);
  let hit = usesCache.get(k);
  if (hit === undefined) {
    hit = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(mod.body);
    usesCache.set(k, hit);
  }
  return hit;
};

const buildReach = (rootFiles) => {
  const reachedFiles = new Set();
  const reachedSymbols = new Set();
  const fileQueue = [];

  const enter = (file) => {
    if (reachedFiles.has(file)) return;
    reachedFiles.add(file);
    fileQueue.push(file);
  };

  const demand = (file, name, seen = new Set()) => {
    const guard = key(file, name);
    if (seen.has(guard)) return;
    seen.add(guard);
    const mod = modules.get(file);
    if (!mod) return;
    if (mod.declared.has(name)) {
      reachedSymbols.add(guard);
      enter(file);
      return;
    }
    const re = mod.reexported.get(name);
    if (re) {
      const target = resolveSpecifier(file, re.from);
      if (target) demand(target, re.source, seen);
      return;
    }
    for (const star of mod.starReexports) {
      const target = resolveSpecifier(file, star);
      if (target) demand(target, name, seen);
    }
  };

  const demandAll = (file, seen = new Set()) => {
    if (seen.has(file)) return;
    seen.add(file);
    const mod = modules.get(file);
    if (!mod) return;
    enter(file);
    for (const name of mod.declared.keys()) reachedSymbols.add(key(file, name));
    for (const [, re] of mod.reexported) {
      const target = resolveSpecifier(file, re.from);
      if (target) demandAll(target, seen);
    }
    for (const star of mod.starReexports) {
      const target = resolveSpecifier(file, star);
      if (target) demandAll(target, seen);
    }
  };

  for (const file of rootFiles) enter(file);

  while (fileQueue.length > 0) {
    const file = fileQueue.pop();
    const mod = modules.get(file);
    if (!mod) continue;
    for (const imp of mod.imports) {
      const target = resolveSpecifier(file, imp.spec);
      if (!target) continue;
      if (imp.namespace || imp.names.length === 0) demandAll(target);
      // AN IMPORT IS NOT A USE. The name must also appear in this file's body, or a leftover
      // import statement — the residue of exactly the deletion this rail exists to catch —
      // keeps the subsystem looking reached. Measured: reconstructing instance 4 by replacing
      // `audit: createPinAuditSink(...)` with `audit: () => {}` left the import in place, and
      // an import-counting walk reported the healthy tree.
      else for (const name of imp.names) if (usesName(mod, name)) demand(target, name);
    }
  }

  return { reachedFiles, reachedSymbols };
};

const shipping = buildReach(shippingFiles);

// The same walk rooted at the SUITES, so an unreached export can be reported honestly as
// "reached only by tests" rather than "dead".
const testReach = (() => {
  const reachedSymbols = new Set();
  for (const mod of testModules.values()) {
    for (const imp of mod.imports) {
      const target = resolveSpecifier(mod.file, imp.spec);
      if (!target) continue;
      const seenGuard = new Set();
      const demand = (file, name) => {
        const guard = key(file, name);
        if (seenGuard.has(guard)) return;
        seenGuard.add(guard);
        const m = modules.get(file);
        if (!m) return;
        if (m.declared.has(name)) {
          reachedSymbols.add(guard);
          return;
        }
        const re = m.reexported.get(name);
        if (re) {
          const t = resolveSpecifier(file, re.from);
          if (t) demand(t, re.source);
          return;
        }
        for (const star of m.starReexports) {
          const t = resolveSpecifier(file, star);
          if (t) demand(t, name);
        }
      };
      if (imp.namespace || imp.names.length === 0) {
        // `import * as x from "@restos/sync-client"` then `x.createPinAuditSink(...)` — the
        // barrel declares nothing, so this has to follow re-exports or the label reads
        // "no importer at all" for a symbol three suites exercise.
        const seenFiles = new Set();
        const expand = (file) => {
          if (seenFiles.has(file)) return;
          seenFiles.add(file);
          const m = modules.get(file);
          if (!m) return;
          for (const name of m.declared.keys()) reachedSymbols.add(key(file, name));
          for (const [, re] of m.reexported) {
            const t = resolveSpecifier(file, re.from);
            if (t) expand(t);
          }
          for (const star of m.starReexports) {
            const t = resolveSpecifier(file, star);
            if (t) expand(t);
          }
        };
        expand(target);
      } else {
        for (const name of imp.names) demand(target, name);
      }
    }
  }
  return reachedSymbols;
})();

// ---------------------------------------------------------------------------------------------
// 6. The opt-out. A marker must carry a reason; a marker on something reached is itself a
//    failure, because an exception that has quietly stopped applying is a mute button.
// ---------------------------------------------------------------------------------------------

const REASON_MIN = 12;

/** Read the marker attached to the line a declaration starts on (its JSDoc or comment run). */
const markerAbove = (raw, line) => {
  const lines = raw.split("\n");
  let i = line - 2; // zero-based index of the line above the declaration
  const collected = [];
  while (i >= 0) {
    const text = lines[i];
    if (/^\s*$/.test(text)) break;
    if (!/^\s*(\/\/|\/\*|\*|\*\/)/.test(text)) break;
    collected.unshift(text);
    if (/^\s*\/\*/.test(text)) break;
    i--;
  }
  return extractMarker(collected.join("\n"));
};

const extractMarker = (text) => {
  const owedIdx = text.indexOf(OWED_MARKER);
  const idx = owedIdx === -1 ? text.indexOf(MARKER) : owedIdx;
  if (idx === -1) return null;
  const used = owedIdx === -1 ? MARKER : OWED_MARKER;
  // The reason runs to the end of its JSDoc PARAGRAPH — a blank comment line or the next `@tag`
  // ends it. Without a boundary the reason absorbed every line below it, so a bare marker sitting
  // above unrelated prose scored a long "reason" and the no-reason check never fired.
  const stripped = text
    .slice(idx + used.length)
    .split(/\n/)
    .map((l) =>
      l
        .replace(/^\s*\*\/?\s?/, "")
        .replace(/^\s*\/\/\s?/, "")
        .replace(/\*\/\s*$/, ""),
    );
  const paragraph = [];
  for (const [i, line] of stripped.entries()) {
    if (i > 0 && (line.trim() === "" || /^\s*@\w/.test(line))) break;
    paragraph.push(line);
  }
  const after = paragraph
    .join(" ")
    .replace(/^[\s:—-]+/, "")
    .trim();
  return { reason: after, owed: used === OWED_MARKER, marker: used };
};

/** A marker in the file header (before the first import/export) covers the whole file. */
const fileMarker = (mod) => {
  // `[^\S\n]*` and NOT `\s*`: with the `m` flag `\s` crosses newlines, so `^\s*(import|export)`
  // matched at index 0 of every file whose header is a comment (blanked to spaces above), making
  // `head` empty and every file-level marker silently inert. Found by a marker that did nothing.
  const firstCode = mod.src.search(/^[^\S\n]*(import|export)\s/m);
  const head = firstCode === -1 ? mod.raw : mod.raw.slice(0, firstCode);
  return extractMarker(head);
};

// ---------------------------------------------------------------------------------------------
// 7. RULE A — unreached value exports.
// ---------------------------------------------------------------------------------------------

const ruleAFindings = [];
const staleMarkers = [];
const emptyReasons = [];
/** The two exception registers. `owed` is printed on every clean run; `byDesign` is a count. */
const owed = [];
const byDesign = [];
let ruleACandidates = 0;
let internalOnly = 0;

/**
 * Is `name` referenced INSIDE its own module, outside the export statements?
 *
 * A symbol used by its own module, in a module shipping code enters, is code the product runs —
 * the export is merely redundant. That is `24-F15`'s dead-export TREND metric (knip's job), not
 * this rail's question, and folding the two together put 40+ constants like `INK_LEVELS` and
 * `SPOOLER_JOB_STATES` in front of a reviewer who can do nothing about them. Deliberate
 * narrowing (`24 §3b`): it costs one detection — the Argon2id cost floor, whose real defect was
 * that no TEST asserted it, which no reachability walk can see.
 */
const usedInOwnModule = (mod, name) => {
  const withoutOwnDeclaration = mod.body.replace(
    new RegExp(
      `export\\s+(?:declare\\s+)?(?:default\\s+)?(?:async\\s+)?(?:const|let|var|function|class|type|interface|enum|abstract\\s+class)\\s+${name}\\b`,
    ),
    " ",
  );
  return new RegExp(`\\b${name}\\b`).test(withoutOwnDeclaration);
};

for (const mod of modules.values()) {
  const whole = fileMarker(mod);
  for (const [name, decl] of mod.declared) {
    if (!decl.valueLike) continue;
    ruleACandidates++;
    const k = key(mod.file, name);
    const imported = shipping.reachedSymbols.has(k);
    const internal = !imported && shipping.reachedFiles.has(mod.file) && usedInOwnModule(mod, name);
    if (internal) internalOnly++;
    const reached = imported || internal;
    const marker = whole ?? markerAbove(mod.raw, decl.line);
    if (marker) {
      if (marker.reason.length < REASON_MIN) {
        emptyReasons.push({
          where: `${relative(ROOT, mod.file)}:${decl.line}`,
          name,
          marker: marker.marker,
        });
        continue;
      }
      // A FILE-level marker claims "nothing outside imports this module", so only an external
      // import makes it stale. A DECLARATION-level marker claims more, and internal use alone
      // makes it redundant. Conflating the two made a correct file marker on the drizzle schema
      // report itself stale, because `kernel` is used by every `kernel.table(...)` below it.
      if (whole ? imported : reached) {
        staleMarkers.push({
          where: `${relative(ROOT, mod.file)}:${decl.line}`,
          name,
          reason: marker.reason,
          marker: marker.marker,
        });
      } else if (marker.owed) {
        owed.push({
          where: `${relative(ROOT, mod.file)}:${decl.line}`,
          name,
          reason: marker.reason,
        });
      } else {
        byDesign.push({
          where: `${relative(ROOT, mod.file)}:${decl.line}`,
          name,
          reason: marker.reason,
        });
      }
      continue;
    }
    if (reached) continue;
    ruleAFindings.push({
      where: `${relative(ROOT, mod.file)}:${decl.line}`,
      name,
      kind: decl.kind,
      onlyTests: testReach.has(k),
    });
  }
}

if (ruleACandidates === 0) fail("EMPTY MATCH — Rule A examined zero value exports (24-F14).");

// ---------------------------------------------------------------------------------------------
// 8. RULE B — optional seams never supplied by a shipping caller.
//
// Scope is deliberately narrow, and the narrowness is what makes it usable: it applies only to
// factories that SHIPPING CODE ALREADY CALLS. If nothing calls the factory, Rule A owns it.
// What is left is the exact shape of instances 2 and 5 — the host reached the subsystem and
// left the durable half of it switched off.
// ---------------------------------------------------------------------------------------------

/** Brace-match from an opening `{` (or `(`); returns the inner text. */
const matchBraces = (src, openIndex, open = "{", close = "}") => {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close) {
      depth--;
      if (depth === 0) return { inner: src.slice(openIndex + 1, i), end: i };
    }
  }
  return null;
};

/**
 * Top-level members of a type literal body: `name?: T` / `name: T`.
 *
 * `offset` is the member's absolute index in the FILE, not the slice. The marker for a Rule B
 * seam lives in the JSDoc above the property, and comments are blanked in the view this parses —
 * without a file position there is no way back to the raw text, and the opt-out silently does
 * nothing.
 */
const typeMembers = (body, base = 0) => {
  const members = [];
  let depth = 0;
  let start = 0;
  const push = (chunk, at) => {
    const m = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*(\??)\s*:/.exec(chunk);
    if (m) {
      members.push({
        name: m[1],
        optional: m[2] === "?",
        text: chunk,
        offset: base + at + (chunk.length - chunk.replace(/^\s+/, "").length),
      });
    }
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "(" || c === "[" || c === "<") depth++;
    // The `>` of an ARROW is not a closing bracket. `now: () => number;` drove depth to −1, and
    // every member after it — including `attempts?: PinAttemptStore`, the durable lockout seam,
    // instance 2 — stopped being a member at all. The mutation proof caught this; reading the
    // function did not.
    else if (c === ">" && body[i - 1] === "=") continue;
    else if (c === "}" || c === ")" || c === "]" || c === ">") depth--;
    else if ((c === ";" || c === ",") && depth === 0) {
      push(body.slice(start, i), start);
      start = i + 1;
    }
  }
  push(body.slice(start), start);
  return members;
};

/** Top-level keys of an object literal passed at a call site. */
const literalKeys = (body) => {
  const keys = [];
  let depth = 0;
  let start = 0;
  const push = (chunk) => {
    const m = /^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)\s*[:,]?/.exec(chunk);
    if (/^\s*\.\.\./.test(chunk)) {
      keys.push("...");
      return;
    }
    if (m) keys.push(m[1]);
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      push(body.slice(start, i));
      start = i + 1;
    }
  }
  push(body.slice(start));
  return keys.filter(Boolean);
};

/**
 * An OPTIONS BAG, not merely "the first parameter is an object".
 *
 * `negotiateCompression(hello: { accepts_compression?: boolean }, …)` takes a parsed wire message
 * whose optional field is DATA — a peer that omits it is stating a fact, not forgetting a seam —
 * and Rule B reported it twice before this narrowing. An options bag is destructured at the
 * signature or named by convention, and that is the whole distinction.
 */
const OPTIONS_PARAM_NAME = /^(options|config|opts|args|params|deps)$/;

/** For an exported factory, the optional properties of its single options parameter. */
const optionsOf = (mod, name) => {
  const declRe = new RegExp(
    `(?:^|[\\s;}])export\\s+(?:const|let|var|function|async\\s+function)\\s+${name}\\b`,
  );
  const m = declRe.exec(mod.code);
  if (!m) return null;
  const paren = mod.code.indexOf("(", m.index + m[0].length);
  if (paren === -1) return null;
  const params = matchBraces(mod.code, paren, "(", ")");
  if (!params) return null;
  // `({ a, b }: Opts)` or `(options: Opts)` or `({ a }: { a: X; b?: Y })`
  const colon = (() => {
    let depth = 0;
    for (let i = 0; i < params.inner.length; i++) {
      const c = params.inner[i];
      if (c === "{" || c === "(" || c === "[") depth++;
      else if (c === "}" || c === ")" || c === "]") depth--;
      else if (c === ":" && depth === 0) return i;
    }
    return -1;
  })();
  if (colon === -1) return null;
  const binder = params.inner.slice(0, colon).trim();
  if (!binder.startsWith("{") && !OPTIONS_PARAM_NAME.test(binder)) return null;
  const rawAnnotation = params.inner.slice(colon + 1);
  const annotation = rawAnnotation.trim();
  const annotationBase =
    paren + 1 + colon + 1 + (rawAnnotation.length - rawAnnotation.replace(/^\s+/, "").length);
  if (annotation.startsWith("{")) {
    const body = matchBraces(annotation, 0);
    return body ? typeMembers(body.inner, annotationBase + 1) : null;
  }
  // A single identifier only. `Compression | undefined` is a union, not an options bag, and
  // resolving its first name then scanning forward for "the next `{` in the file" found an object
  // 30 lines away and reported its fields as seams of an unrelated function.
  const typeName = /^([A-Za-z_$][\w$]*)$/.exec(annotation)?.[1];
  if (!typeName) return null;
  const typeRe = new RegExp(
    `(?:^|[\\s;}])export\\s+(?:type\\s+${typeName}\\s*=\\s*|interface\\s+${typeName}\\s*)\\{`,
  );
  const tm = typeRe.exec(mod.code);
  if (!tm) return null; // aliased, generic, intersected — not a plain object type; do not guess
  const brace = tm.index + tm[0].length - 1;
  const body = matchBraces(mod.code, brace);
  return body ? typeMembers(body.inner, brace + 1) : null;
};

/** Every shipping call site of `name`, with the top-level keys of its object argument. */
const callSites = (name) => {
  const sites = [];
  const callRe = new RegExp(`\\b${name}\\s*\\(`, "g");
  for (const file of shippingFiles) {
    const mod = modules.get(file);
    if (!mod) continue;
    // Only where the symbol is actually imported here — a same-named local is not this factory.
    const imported = mod.imports.some((imp) => imp.names.includes(name));
    if (!imported) continue;
    for (let m = callRe.exec(mod.code); m !== null; m = callRe.exec(mod.code)) {
      const openParen = m.index + m[0].length - 1;
      const args = matchBraces(mod.code, openParen, "(", ")");
      if (!args) continue;
      const brace = args.inner.indexOf("{");
      const keys = brace === -1 ? [] : literalKeys(matchBraces(args.inner, brace)?.inner ?? "");
      sites.push({ file, keys, line: lineOf(mod.raw, m.index) });
    }
    callRe.lastIndex = 0;
  }
  return sites;
};

const ruleBFindings = [];
let ruleBCandidates = 0;

for (const mod of modules.values()) {
  if (groupOf(mod.file) !== "packages") continue;
  for (const [name, decl] of mod.declared) {
    if (!decl.valueLike) continue;
    if (!shipping.reachedSymbols.has(key(mod.file, name))) continue;
    const members = optionsOf(mod, name);
    if (!members) continue;
    const optional = members.filter((member) => member.optional);
    if (optional.length === 0) continue;
    const sites = callSites(name);
    if (sites.length === 0) continue;
    if (sites.some((site) => site.keys.includes("..."))) continue; // spread — cannot be read statically
    const supplied = new Set(sites.flatMap((site) => site.keys));
    const whole = fileMarker(mod);
    for (const member of optional) {
      ruleBCandidates++;
      const label = `${name}({ ${member.name} })`;
      const line = lineOf(mod.raw, member.offset);
      const where = `${relative(ROOT, mod.file)}:${line}`;
      const marker = whole ?? markerAbove(mod.raw, line);
      if (supplied.has(member.name)) {
        if (marker && marker.reason.length >= REASON_MIN) {
          staleMarkers.push({ where, name: label, reason: marker.reason, marker: marker.marker });
        }
        continue;
      }
      if (marker) {
        if (marker.reason.length < REASON_MIN) {
          emptyReasons.push({ where, name: label, marker: marker.marker });
        } else if (marker.owed) {
          owed.push({ where, name: label, reason: marker.reason });
        } else {
          byDesign.push({ where, name: label, reason: marker.reason });
        }
        continue;
      }
      ruleBFindings.push({
        where,
        factory: name,
        option: member.name,
        sites: sites.map((s) => `${relative(ROOT, s.file)}:${s.line}`),
      });
    }
  }
}

if (ruleBCandidates === 0)
  fail(
    "EMPTY MATCH — Rule B found zero optional seams on any factory that shipping code calls. Either the options-type parser stopped matching or the app stopped constructing subsystems; both make this rail inert (24-F14).",
  );

// ---------------------------------------------------------------------------------------------
// 9. Report.
// ---------------------------------------------------------------------------------------------

const problems = [];

if (ruleAFindings.length > 0) {
  problems.push(
    `${ruleAFindings.length} export(s) NOT REACHED by shipping code (Rule A):\n` +
      ruleAFindings
        .map(
          (f) =>
            `  ✗ ${f.where}  ${f.kind} ${f.name}` +
            (f.onlyTests
              ? "   [reached only by tests — the defect, exactly]"
              : "   [no importer at all]"),
        )
        .join("\n"),
  );
}

if (ruleBFindings.length > 0) {
  problems.push(
    `${ruleBFindings.length} optional seam(s) NEVER SUPPLIED by a shipping caller (Rule B):\n` +
      ruleBFindings
        .map(
          (f) =>
            `  ✗ ${f.where}  ${f.factory}({ ${f.option} }) — constructed at ${f.sites.join(", ")} ` +
            `without it, so the capability behind that option is dead in the product.`,
        )
        .join("\n"),
  );
}

if (staleMarkers.length > 0) {
  problems.push(
    `${staleMarkers.length} STALE marker(s) — shipping code REACHES these now, so the exception has quietly stopped applying and is a mute button. Delete it (that is the good news: someone wired it):\n` +
      staleMarkers.map((m) => `  ✗ ${m.where}  ${m.name} — ${m.marker} "${m.reason}"`).join("\n"),
  );
}

if (emptyReasons.length > 0) {
  problems.push(
    `${emptyReasons.length} marker(s) with no reason (at least ${REASON_MIN} characters — the entire point is that the exception is reviewable):\n` +
      emptyReasons.map((m) => `  ✗ ${m.where}  ${m.name}  (${m.marker})`).join("\n"),
  );
}

const scanned =
  `${modules.size} production modules (${shippingFiles.length} shipping), ${ruleACandidates} value exports ` +
  `(${internalOnly} used only inside their own reached module — redundant exports, 24-F15's knip metric, not this rail's question), ` +
  `${ruleBCandidates} optional seams on shipping-constructed factories`;

/**
 * The debt register, printed on every run — clean or not.
 *
 * An exception list that only exists in comments is an exception list nobody reads. `24-F15`
 * gates the DIRECTION of a trend, and this is the number that trend is made of: how much of the
 * kernel the product still does not reach.
 */
const debtReport = () => {
  if (owed.length === 0) return "";
  const byFile = new Map();
  for (const item of owed) {
    const file = item.where.replace(/:\d+$/, "");
    byFile.set(file, (byFile.get(file) ?? 0) + 1);
  }
  return (
    `\n\n${owed.length} export(s) carry a recorded ${OWED_MARKER} debt marker — a shipping caller is OWED, ` +
    `not absent by design:\n` +
    [...byFile.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([file, n]) => `  · ${file}  (${n})`)
      .join("\n") +
    `\n  Grep \`${OWED_MARKER}\` for the plan each one names. Each must be DELETED when its caller lands —` +
    `\n  a marker on something reached fails this check, so the register cannot rot.`
  );
};

if (problems.length === 0) {
  console.log(
    `check-seams: clean — shipping code reaches every unmarked export. Scanned ${scanned}. ` +
      `${byDesign.length} marked ${MARKER}, ${owed.length} marked ${OWED_MARKER}.${debtReport()}`,
  );
  process.exit(0);
}

console.error(
  `check-seams: ${problems.length} finding group(s). Scanned ${scanned}.\n\n${problems.join("\n\n")}\n\n` +
    `Each is a subsystem the shipping product does not reach — the wave's named defect, found\n` +
    `mechanically. Wire it into an app or service, or record the decision at the declaration:\n` +
    `  \`${MARKER} <why it will never have one>\`   — e.g. test-support code, design-time math\n` +
    `  \`${OWED_MARKER} <the plan that owes the caller>\` — debt, counted and printed every run\n` +
    `Both are reviewable statements. Neither is an allowlist: the moment shipping code reaches a\n` +
    `marked symbol, the marker itself fails this check and must be deleted.${debtReport()}`,
);
process.exit(1);

/*
 * NOTES — why this is a script and not a `knip` config.
 *
 * `24-F15` names `knip` for "dead exports", and `knip --production` does express part of Rule A:
 * in production mode it drops test files from the graph and reports exports only tests reach.
 * It was rejected on three grounds, in order of weight:
 *
 * 1. It cannot express Rule B at all. `createSpooler` is imported, called, and its `store` option
 *    never passed — knip sees a used export. That is instance 5, the most expensive one in this
 *    wave, and half the defect class by count.
 * 2. `24-F14`'s empty-match protection has no knip equivalent. A rule that matches nothing must
 *    FAIL; knip reporting "no issues" after a rename that emptied its entry-point globs is
 *    indistinguishable from a healthy repo, which is the precise way rails die here.
 * 3. It is not in `18 §14`, so it is a dependency PR (`18 §15`), and §15 rule 1 asks first
 *    whether the job is 50 lines of our own code. This is that — with the reachability walk
 *    tuned to the one question we keep getting wrong.
 *
 * knip remains the right tool for `24-F15`'s trend line (dead exports as a *metric*). This rail
 * answers a different question: not "is anything using it" but "does the SHIPPING PRODUCT get
 * there".
 */
