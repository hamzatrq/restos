// ACCEPTANCE TESTS — `18 §2`'s dependency direction, and the three app→app imports that break it.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The author of this file wrote no production
// code for the extraction it describes and is disqualified from implementing it. Every claim below
// is traced to a quoted FR or a ratified `DECISIONS.md` row; where a reading had to be chosen, the
// choice is named as a choice and the simpler alternative is stated (`24 §3b`).
//
// THE AUTHORITIES THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   18 §2   "**Dependency direction (MUST):** `apps → packages`, `services → packages`,
//           `packages → packages` (acyclic; `domain` imports no internal package). Apps NEVER
//           import services or **other apps**; services NEVER import apps. Cross-module calls go
//           through tRPC/events, never through direct imports across service boundaries."
//
//   18 §2   (the outbox core, one paragraph away from that MUST — the handbook's own rule for
//           what to do when a module acquires a second consumer) "One shared implementation
//           (**extracted from `sync-client`'s outbox core when the second consumer is built**); a
//           module specifying a persist-before-attempt queue MUST consume it, not reinvent it."
//
//   DEC-ARCH-001  "Where a shared implementation lives once it acquires a second consumer …
//           **RULED: (B) — move `auditor.ts` into `packages/auditor`, which both services may
//           import.** … The decisive reason is that the handbook already answers this exact
//           situation one section away from the MUST everyone argues about … The handbook's rule
//           for *'an implementation living inside one owner has acquired a second consumer'* is
//           **extract it at that moment**, and the trigger has fired."
//
//           …and the graft that names the failure mode this suite's §B exists to catch: the one
//           shared helper was moved "rather than being copied for the reason `03-F40`'s two sensor
//           bit layouts records: a second local helper is a second interpretation … and the two
//           diverge silently — one of them starts keeping a field, and nothing says which is
//           right."
//
//   23-F5   "Every package/app gets a 5–15 line `CLAUDE.md` stub … containing: what this package
//           is, its owning spec path, and only the rules unique to that directory."
//
//   03-F14  "Aging colors on each card: neutral → amber at X min → red at Y min. X/Y are
//           org-configurable per order type (defaults: dine-in 10/20, delivery 15/25); timer basis
//           is `order.confirmed`, so a failed print never hides a late order."
//
//   05-F1   alarms the manager off "the red aging threshold (03-F14)" — which is WHY §C exists.
//           `03-F14` describes ONE org policy and three surfaces read it (the counter's order
//           queue, the pass screen, the manager's alarm). A counter reading neutral while the pass
//           reads red is three surfaces disagreeing about whether the food is late, and the
//           mechanism that produces that disagreement is a second declaration of the table.
//
//   01-F17  a sale is never blocked, and (commandment 4) no in-branch feature may require a
//           correct configuration to keep working — a REFUSED threshold string must leave the
//           shipped defaults in force rather than take the surface down.
//
// ── WHAT THIS SUITE DELIBERATELY DOES NOT DO, AND WHY ────────────────────────────────────────
//
// **It does not name the package.** No ruling names one. `DEC-ARCH-001` pinned `@restos/auditor`
// and `@restos/config` by name because *the ruling itself named them*; here the corpus states the
// property ("apps never import other apps"; "extract it at that moment") and leaves the home to
// the implementer — `packages/config` is already described by `18 §2` as the "env validation
// factory" and all three modules are env resolvers, so it is a live candidate beside a new
// package. A suite that pinned a name would go RED against a correct implementation that chose the
// other one, and the round-3 law puts that failure on exactly the same footing as a vacuous test.
// So every assertion below DISCOVERS the declaring package and then asserts a property of it.
//
// **It does not require the three modules to land in the SAME package.** `aging.ts` is `03-F14`
// org policy, `panel-density.ts` is `27-F11c` hardware and `device-identity.ts` is `01-F2`
// identity; they share a shape (`00 §7` env resolver) and not a subject. Assertions are per
// symbol.
//
// **It allows exactly one surviving app→app edge, by name, and it is not one of the three.**
// `apps/pass-kds/src/layout-gate/main.ts` imports `measureSurface` from
// `apps/pos-electron/src/layout-gate/probe`. That module states its own reason at length ("copying
// it would give the repo **two interpretations of 'is this control on the screen'**") and it is
// the same argument this suite makes for the threshold table, so it is a real instance of the same
// debt — but it is CI rail rather than shipped app code, it is serialised with
// `Function.prototype.toString()` and executed inside a page (so it cannot simply become a package
// import), and it is not one of the three edges this round was scoped to. It is allowlisted with
// its reason rather than silently skipped, and the allowlist is a **subset** test: a new edge reds,
// and *removing* the allowlisted edge later does NOT red. Reporting it here is the point — an
// exception nobody can see is how a rail goes quiet.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = resolve(import.meta.dirname, "..", "..", "..");
const REPO_ROOT = resolve(APP_DIR, "..", "..");
const APPS_ROOT = join(REPO_ROOT, "apps");
const PACKAGES_ROOT = join(REPO_ROOT, "packages");

/** The two apps that sit on the three edges this round is scoped to. */
const POS = "pos-electron";
const PASS = "pass-kds";

/**
 * The one surviving app→app edge, named with its reason. See the header. `from` and `to` are
 * repo-relative directory prefixes, so the entry covers the gate and nothing else in either app.
 */
const ALLOWED_APP_EDGES: readonly { from: string; to: string; why: string }[] = [
  {
    from: `apps/${PASS}/src/layout-gate`,
    to: `apps/${POS}/src/layout-gate`,
    why:
      "the layout gate's Blink probe — CI rail rather than shipped app code, and it is serialised " +
      "with Function.prototype.toString() to run inside the page, so it cannot become an ordinary " +
      "package import. Real debt of the same shape, out of scope for this round, named rather " +
      "than hidden.",
  },
];

// ── file-system walk ─────────────────────────────────────────────────────────────────────────

const SKIP_DIR = new Set(["node_modules", "dist", "out", ".next", ".turbo", ".oracle-typecheck"]);

const exists = (path: string): boolean => {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
};

const tsFilesUnder = (dir: string): string[] => {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      out.push(...tsFilesUnder(join(dir, entry.name)));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
};

const rel = (path: string): string => relative(REPO_ROOT, path).split(sep).join("/");

const read = (path: string): string => readFileSync(path, "utf8");

const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(read(path)) as Record<string, unknown>;

/** Every `apps/<name>` and `packages/<name>` directory that has a `src`. */
const workspaceDirsIn = (root: string): { dir: string; name: string }[] =>
  !exists(root)
    ? []
    : readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !SKIP_DIR.has(entry.name))
        .map((entry) => ({ dir: join(root, entry.name), name: entry.name }))
        .filter((candidate) => exists(join(candidate.dir, "src")));

// ── source parsing: A MENTION IS NOT AN IMPORT ───────────────────────────────────────────────

/**
 * Comments stripped before anything is counted. This is not fastidiousness — the violating import
 * in `apps/pos-electron/src/main/index.ts` carries a **twelve-line block comment** arguing for
 * itself, and `apps/pos-electron/src/main/gateway.ts` names the same path in prose while importing
 * nothing. A raw substring search cannot tell "still imports it" from "explains why it used to",
 * and after a correct extraction those comments will be rewritten to say the edge is GONE — which
 * a substring search would read as the edge still being there.
 *
 * `[^:]` guards the `//` inside a URL, which these headers are full of.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every module specifier a file imports, re-exports from, or dynamically imports. */
const specifiersOf = (code: string): string[] => {
  const out: string[] = [];
  for (const m of code.matchAll(/\bfrom\s*["']([^"']+)["']/g)) out.push(String(m[1]));
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(String(m[1]));
  for (const m of code.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(String(m[1]));
  return out;
};

/**
 * Does this file DECLARE the symbol — exported or not? The un-exported form is deliberate: the
 * failure `DEC-ARCH-001`'s graft exists to stop is a second **private** copy, which would not be an
 * export and which `pnpm seams:check` cannot see either (its Rule A asks whether shipping code
 * reaches an export, never whether two files declare the same thing).
 */
const declaresSymbol = (code: string, name: string): boolean =>
  new RegExp(
    `^\\s*(?:export\\s+)?(?:const|let|var|class|function|async\\s+function|type|interface)\\s+${name}\\b`,
    "m",
  ).test(code);

/** `@scope/name/sub` → `@scope/name`; `pkg/sub` → `pkg`. Relative and node: specifiers pass through. */
const packageRootOf = (specifier: string): string => {
  if (specifier.startsWith(".") || specifier.startsWith("node:")) return specifier;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : String(parts[0]);
};

// ── the app→app edge walk ────────────────────────────────────────────────────────────────────

type Edge = { file: string; specifier: string; from: string; to: string };

/**
 * Every import in `apps/*` that resolves into a DIFFERENT app.
 *
 * Only relative specifiers can express this today (no app publishes a package name), so the walk
 * resolves `../../../pos-electron/src/main/aging` against the importing file and asks which
 * `apps/<name>` the result lands in. Resolving rather than pattern-matching is what makes the
 * assertion survive an implementer who reaches the same file by a different number of `../`.
 */
const appToAppEdges = (opts: { tests: boolean }): Edge[] => {
  const edges: Edge[] = [];
  for (const app of workspaceDirsIn(APPS_ROOT)) {
    for (const file of tsFilesUnder(join(app.dir, "src"))) {
      const inTestTree = /\.test\.tsx?$/.test(file) || file.split(sep).includes("__acceptance__");
      if (opts.tests !== inTestTree) continue;
      for (const specifier of specifiersOf(stripComments(read(file)))) {
        if (!specifier.startsWith(".")) continue;
        const target = rel(resolve(join(file, ".."), specifier));
        const parts = target.split("/");
        if (parts[0] !== "apps") continue;
        const targetApp = String(parts[1]);
        if (targetApp === app.name) continue;
        edges.push({ file: rel(file), specifier, from: app.name, to: targetApp });
      }
    }
  }
  return edges;
};

const isAllowed = (edge: Edge): boolean =>
  ALLOWED_APP_EDGES.some(
    (allowed) =>
      edge.file.startsWith(`${allowed.from}/`) &&
      rel(resolve(join(REPO_ROOT, edge.file, ".."), edge.specifier)).startsWith(`${allowed.to}/`),
  );

const describeEdges = (edges: Edge[]): string =>
  edges.map((e) => `  ${e.file}\n      -> ${e.specifier}  (apps/${e.to})`).join("\n");

// ── symbol discovery: where did each module LAND? ────────────────────────────────────────────

type Home = { pkgName: string; pkgDir: string; file: string };

/**
 * The three modules, by the symbol that identifies each one. A symbol rather than a filename: the
 * implementer may legitimately rename `aging.ts` on the way into a package, and a suite that
 * pinned the filename would red on a correct move. What may NOT change is that the counter and the
 * pass resolve their thresholds through the same function.
 */
const MODULES = [
  {
    label: "03-F14/03-F47 aging thresholds",
    entry: "resolveAging",
    /** Symbols whose second declaration would be a second interpretation of the table (05-F1). */
    single: [
      "resolveAging",
      "parseAgingThresholds",
      "DEFAULT_AGING_THRESHOLDS",
      "FALLBACK_AGING",
      "AGING_THRESHOLDS_ENV",
    ],
    consumers: [POS, PASS],
  },
  {
    label: "01-F2/01-F13 device identity",
    entry: "resolveDeviceIdentity",
    single: ["resolveDeviceIdentity", "DEV_IDENTITY", "IDENTITY_ENV"],
    consumers: [POS, PASS],
  },
  {
    label: "27-F11c panel density",
    entry: "resolvePanelDensity",
    single: ["resolvePanelDensity", "PLAUSIBLE_PPI", "REFERENCE_COUNTER_DIAGONAL_IN"],
    consumers: [POS, PASS],
  },
] as const;

// Every production (non-test) source file under a `packages/<name>/src` tree, with its package
// name. (A line comment on purpose: the glob for that path contains the two characters that close
// a block comment, and writing it inside one silently ends the comment and breaks the parse.)
const packageSources = (): { pkgName: string; pkgDir: string; file: string; code: string }[] => {
  const out: { pkgName: string; pkgDir: string; file: string; code: string }[] = [];
  for (const pkg of workspaceDirsIn(PACKAGES_ROOT)) {
    const manifest = join(pkg.dir, "package.json");
    if (!exists(manifest)) continue;
    const pkgName = String(readJson(manifest).name ?? "");
    for (const file of tsFilesUnder(join(pkg.dir, "src"))) {
      if (/\.test\.tsx?$/.test(file) || file.split(sep).includes("__acceptance__")) continue;
      out.push({ pkgName, pkgDir: pkg.dir, file, code: stripComments(read(file)) });
    }
  }
  return out;
};

/** Where a symbol is declared under `packages/`, or `undefined` if it has not moved yet. */
const homeOf = (symbol: string): Home | undefined => {
  const hit = packageSources().find((candidate) => declaresSymbol(candidate.code, symbol));
  return hit === undefined
    ? undefined
    : { pkgName: hit.pkgName, pkgDir: hit.pkgDir, file: rel(hit.file) };
};

const mustHome = (symbol: string, label: string): Home => {
  const home = homeOf(symbol);
  if (home === undefined) {
    throw new Error(
      `no file under packages/*/src declares \`${symbol}\` (${label}). 18 §2 forbids one app ` +
        "importing another, and DEC-ARCH-001 rules that a shared implementation is EXTRACTED at " +
        "the moment it acquires its second consumer. Until this module lives in a package, " +
        "nothing here can pass.",
    );
  }
  return home;
};

/** Everything an app declares as a dependency of any kind. */
const declaredDepsOf = (appName: string): Record<string, string> => {
  const manifest = join(APPS_ROOT, appName, "package.json");
  const json = readJson(manifest);
  return {
    ...((json.dependencies as Record<string, string> | undefined) ?? {}),
    ...((json.devDependencies as Record<string, string> | undefined) ?? {}),
  };
};

// ── the module under test, loaded WITHOUT a literal specifier ────────────────────────────────

type AgingThresholds = { amberAt: number; redAt: number };
type AgingPolicy = {
  thresholdsFor: (order_type: string | null) => AgingThresholds;
  source: string;
  malformed: readonly string[];
};

/**
 * ⚠ **The specifier is a variable on purpose**, and it is the `DEC-ARCH-001` suite's reason
 * verbatim: the target package does not exist until this lands, and a literal
 * `import "@restos/whatever"` would make the whole repo fail `pnpm typecheck`. A suite that
 * arrives RED as a typecheck failure rather than as a named assertion tells the implementing
 * session nothing about what is missing (`24 §3`).
 */
const load = async (specifier: string): Promise<Record<string, unknown>> => {
  try {
    // `as`: a dynamic import with a computed specifier is `any` by construction (18 §3).
    return (await import(specifier)) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `\`${specifier}\` does not resolve from apps/${PASS}. A module that lives in a package but ` +
        "is not a declared dependency of its consumer resolves by luck of the layout, not by " +
        "declaration — add it to this app's package.json dependencies.",
      { cause },
    );
  }
};

describe("18 §2 — apps never import other apps (the three edges, and the one interpretation)", () => {
  // ══ §A the violation itself ═════════════════════════════════════════════════════════════════

  describe("§A the dependency direction", () => {
    it("18 §2: no SHIPPED app module imports another app", () => {
      const offending = appToAppEdges({ tests: false }).filter((edge) => !isAllowed(edge));
      expect(
        offending,
        `18 §2 states the dependency direction as a MUST and puts "Apps NEVER import ... other ` +
          `apps" in it. ${offending.length} shipped import(s) still cross:\n${describeEdges(offending)}\n` +
          "DEC-ARCH-001 rules the remedy for exactly this situation: EXTRACT the shared module at " +
          "the moment it acquires a second consumer.",
      ).toEqual([]);
    });

    it("18 §2: no app TEST imports another app either — the edge is the same edge", () => {
      const offending = appToAppEdges({ tests: true }).filter((edge) => !isAllowed(edge));
      expect(
        offending,
        "18 §2 carves out no exception for tests, and leaving ~10 suites reaching across apps " +
          "leaves the extraction half-done in the place a reader looks to find out where a module " +
          `lives. ${offending.length} test import(s) still cross:\n${describeEdges(offending)}`,
      ).toEqual([]);
    });

    it("the cycle is gone: pos-electron and pass-kds do not import each other in either direction", () => {
      const cyclic = appToAppEdges({ tests: false })
        .concat(appToAppEdges({ tests: true }))
        .filter((edge) => !isAllowed(edge))
        .filter(
          (edge) =>
            (edge.from === POS && edge.to === PASS) || (edge.from === PASS && edge.to === POS),
        );
      const directions = new Set(cyclic.map((edge) => `${edge.from}->${edge.to}`));
      expect(
        directions.size,
        `18 §2 requires the package graph to be acyclic, and these two apps import each other: ` +
          `${[...directions].join(" and ")}. A cycle is worse than a single violation because ` +
          "neither app can be built, moved or reasoned about without the other.",
      ).toBe(0);
    });
  });

  // ══ §B extracted, not copied ════════════════════════════════════════════════════════════════

  describe("§B the module MOVED — a second copy is the failure this is built to catch", () => {
    for (const mod of MODULES) {
      for (const symbol of mod.single) {
        it(`${symbol} (${mod.label}) is declared exactly once in the repo`, () => {
          const inPackages = packageSources().filter((c) => declaresSymbol(c.code, symbol));
          const inApps = workspaceDirsIn(APPS_ROOT).flatMap((app) =>
            tsFilesUnder(join(app.dir, "src"))
              .filter((file) => !/\.test\.tsx?$/.test(file))
              .filter((file) => declaresSymbol(stripComments(read(file)), symbol))
              .map((file) => rel(file)),
          );
          const everywhere = [...inPackages.map((c) => rel(c.file)), ...inApps];
          expect(
            everywhere,
            `\`${symbol}\` is declared in ${everywhere.length} file(s): ${everywhere.join(", ")}. ` +
              'DEC-ARCH-001 moved its shared helper rather than copying it because "a second ' +
              "local helper is a second interpretation ... and the two diverge silently — one of " +
              'them starts keeping a field, and nothing says which is right". A re-export shim ' +
              "left behind in the app is fine (it declares nothing); a second DECLARATION is not.",
          ).toHaveLength(1);
          expect(
            inApps,
            `\`${symbol}\` is still declared under apps/ (${inApps.join(", ")}). Extraction means ` +
              "the declaration leaves the app, not that a copy joins it in a package.",
          ).toEqual([]);
        });
      }
    }
  });

  // ══ §C ONE interpretation of the threshold table ════════════════════════════════════════════

  describe("§C 03-F14 is ONE org policy — every surface reads the same table", () => {
    it("05-F1/03-F14: both apps import resolveAging from the same package", () => {
      const home = mustHome("resolveAging", "03-F14 aging");
      const sources = new Map<string, Set<string>>();
      for (const app of [POS, PASS]) {
        const found = new Set<string>();
        for (const file of tsFilesUnder(join(APPS_ROOT, app, "src"))) {
          const code = stripComments(read(file));
          for (const m of code.matchAll(
            /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
          )) {
            const names = String(m[1])
              .split(",")
              .map((raw) =>
                raw
                  .trim()
                  .replace(/^type\s+/, "")
                  .split(/\s+as\s+/)[0]
                  ?.trim(),
              );
            if (!names.includes("resolveAging")) continue;
            found.add(packageRootOf(String(m[2])));
          }
        }
        sources.set(app, found);
      }
      for (const [app, found] of sources) {
        expect(
          [...found],
          `apps/${app} reaches resolveAging through ${found.size} distinct specifier root(s): ` +
            `${[...found].join(", ")}. 05-F1 alarms the manager off "the red aging threshold ` +
            `(03-F14)" and 03-F14 is one org policy — a counter reading neutral while the pass ` +
            "reads red is three surfaces disagreeing about whether the food is late.",
        ).toEqual([home.pkgName]);
      }
    });

    it("03-F14: no app declares its own aging threshold literal beside the shared table", () => {
      // The mechanism that produces a second interpretation is not always a second `const` with
      // the same NAME — it is a hand-typed `{ amberAt: 10, redAt: 20 }` in a component that "just
      // needs a default". This asks the narrower, checkable question: does any shipped app file
      // spell the pair out at all?
      //
      // ⚠ `src/layout-gate` is EXCLUDED, and the exclusion was found by running a correct
      // implementation rather than by reading this file — the first draft asserted over every app
      // source and went RED against a correct extraction, which the round-3 law rates exactly as
      // damaging as a vacuous test. `apps/pos-electron/src/layout-gate/preload.ts` carries
      // `aging: { minutes: 144, amberAt: 10, redAt: 20 }` as the fixture for ONE order card, and a
      // gate that renders a badge must pin the badge's state to render it. Pinning a fixture is not
      // deciding org policy, which is what `03-F14` reserves to one place. Note the carve-out is
      // narrow: `§B` still forbids a second DECLARATION of the table anywhere at all, layout gate
      // included, so the hole this opens is exactly "a fixture may name a number" and nothing more.
      const offenders = workspaceDirsIn(APPS_ROOT).flatMap((app) =>
        tsFilesUnder(join(app.dir, "src"))
          .filter((file) => !/\.test\.tsx?$/.test(file))
          .filter((file) => !rel(file).includes("/src/layout-gate/"))
          .filter((file) =>
            /amberAt\s*:\s*\d+\s*,\s*redAt\s*:\s*\d+/.test(stripComments(read(file))),
          )
          .map((file) => rel(file)),
      );
      expect(
        offenders,
        `these shipped app files spell out an aging threshold pair: ${offenders.join(", ")}. ` +
          "03-F14's X/Y are org-configurable and there is exactly one place they may be decided.",
      ).toEqual([]);
    });
  });

  // ══ §D the new home is a real package ═══════════════════════════════════════════════════════

  describe("§D whatever package it landed in is a package, not a directory", () => {
    for (const mod of MODULES) {
      it(`${mod.label}: its package publishes an exports map and a 23-F5 CLAUDE.md`, () => {
        const home = mustHome(mod.entry, mod.label);
        const manifest = readJson(join(home.pkgDir, "package.json"));
        expect(
          manifest.exports,
          `${home.pkgName} declares no \`exports\` field. packages/auditor — the worked precedent ` +
            "from DEC-ARCH-001 — publishes one, and without it a consumer reaches into the " +
            "package's file layout instead of its public surface.",
        ).toBeDefined();
        expect(
          exists(join(home.pkgDir, "CLAUDE.md")),
          `${home.pkgName} has no CLAUDE.md. 23-F5: "Every package/app gets a 5–15 line CLAUDE.md ` +
            "stub ... what this package is, its owning spec path, and only the rules unique to " +
            'that directory." The pinned readings this module carries (takeaway/pickup take ' +
            "dine-in's 10/20; a refused config is not applied) are exactly the rules that stub is " +
            "for.",
        ).toBe(true);
      });

      it(`${mod.label}: every consuming app DECLARES the dependency`, () => {
        const home = mustHome(mod.entry, mod.label);
        for (const app of mod.consumers) {
          const deps = declaredDepsOf(app);
          expect(
            Object.keys(deps),
            `apps/${app} imports from ${home.pkgName} but does not declare it. A workspace ` +
              "package that resolves without being declared resolves by luck of the layout — the " +
              "same class of finding as a merge that needs `pnpm install` afterwards and reads as " +
              "a broken merge instead.",
          ).toContain(home.pkgName);
        }
      });
    }

    it("18 §2: the package it moved into imports nothing from apps/ or services/", () => {
      const homes = MODULES.map((mod) => mustHome(mod.entry, mod.label));
      const dirs = [...new Set(homes.map((home) => home.pkgDir))];
      const inversions: string[] = [];
      for (const dir of dirs) {
        for (const file of tsFilesUnder(join(dir, "src"))) {
          for (const specifier of specifiersOf(stripComments(read(file)))) {
            const root = packageRootOf(specifier);
            const resolved = specifier.startsWith(".")
              ? rel(resolve(join(file, ".."), specifier))
              : "";
            if (
              resolved.startsWith("apps/") ||
              resolved.startsWith("services/") ||
              /^@restos\/(api|sync-gateway|jobs|whatsapp|foodpanda|intelligence|tax)$/.test(root)
            ) {
              inversions.push(`${rel(file)} -> ${specifier}`);
            }
          }
        }
      }
      expect(
        inversions,
        `18 §2's direction is apps → packages and services → packages, never back. ` +
          `${inversions.join(", ")}. DEC-ARCH-001 records this exact trap: its move had to ` +
          're-declare a database type locally because "a `packages → services` import is a WORSE ' +
          'inversion than the one being removed and it compiles, links and runs".',
      ).toEqual([]);
    });
  });

  // ══ §E a MOVE, not a rewrite ════════════════════════════════════════════════════════════════

  describe("§E the move preserved behaviour — 03-F14's numbers survive the journey", () => {
    const agingModule = async (): Promise<{ resolveAging: (raw?: string) => AgingPolicy }> => {
      const home = mustHome("resolveAging", "03-F14 aging");
      const mod = await load(home.pkgName);
      expect(
        typeof mod.resolveAging,
        `${home.pkgName} resolves but does not export resolveAging from its public entry. §B ` +
          "found the declaration; a declaration a consumer cannot import is not an extraction.",
      ).toBe("function");
      return mod as { resolveAging: (raw?: string) => AgingPolicy };
    };

    it("03-F14: the two stated defaults are unchanged — dine-in 10/20, delivery 15/25", async () => {
      const { resolveAging } = await agingModule();
      const policy = resolveAging(undefined);
      expect(policy.thresholdsFor("dine_in"), "03-F14 states dine-in 10/20 verbatim").toEqual({
        amberAt: 10,
        redAt: 20,
      });
      expect(policy.thresholdsFor("delivery"), "03-F14 states delivery 15/25 verbatim").toEqual({
        amberAt: 15,
        redAt: 25,
      });
    });

    it("the two UNSTATED order types keep their pinned reading — takeaway and pickup take 10/20", async () => {
      // ⚠ NOT spec text. `03-F14` gives defaults for two of the four order types `02-F1` + `01 §4`
      // name, and the module that is moving carries an argued reading for the other two. It is
      // pinned HERE because a pure move must not quietly change it, and because the pass screen's
      // own suite already pins the same values — two suites pinning one reading is what makes a
      // silent drift impossible. A session that wants to re-rule it changes the FR and both.
      const { resolveAging } = await agingModule();
      const policy = resolveAging(undefined);
      expect(policy.thresholdsFor("takeaway")).toEqual({ amberAt: 10, redAt: 20 });
      expect(policy.thresholdsFor("pickup")).toEqual({ amberAt: 10, redAt: 20 });
      expect(policy.thresholdsFor("an_order_type_nobody_specified")).toEqual({
        amberAt: 10,
        redAt: 20,
      });
      expect(policy.thresholdsFor(null)).toEqual({ amberAt: 10, redAt: 20 });
    });

    it("03-F14: X/Y remain org-configurable, per order type", async () => {
      const { resolveAging } = await agingModule();
      const policy = resolveAging("dine_in=8/16,delivery=20/40");
      expect(policy.source).toBe("configured");
      expect(policy.thresholdsFor("dine_in")).toEqual({ amberAt: 8, redAt: 16 });
      expect(policy.thresholdsFor("delivery")).toEqual({ amberAt: 20, redAt: 40 });
      // An order type the operator did NOT configure keeps its shipped default rather than
      // inheriting the one they did — "per order type" is the FR's own phrase.
      expect(policy.thresholdsFor("takeaway")).toEqual({ amberAt: 10, redAt: 20 });
      // ⚠ AIMED AT THE CASE THAT MATTERS, and it was not until a mutant proved it. The three lines
      // above all ask about order types that are IN the shipped table, so an implementation whose
      // fallback wrongly inherits the configured `dine_in` row answers them correctly and survives.
      // An order type with no row of its own is the ONLY input where "falls back to 03-F14's own
      // 10/20" and "inherits whatever the operator typed for dine-in" give different answers, and
      // it is the input a real branch produces the day someone adds a channel.
      expect(
        policy.thresholdsFor("an_order_type_nobody_specified"),
        "an unconfigured order type inherited the configured dine-in row instead of 03-F14's " +
          "default — an org that tightened dine-in to 8/16 would silently tighten every order " +
          "type the FR never named",
      ).toEqual({ amberAt: 10, redAt: 20 });
      expect(policy.thresholdsFor(null)).toEqual({ amberAt: 10, redAt: 20 });
    });

    it("01-F17: a malformed threshold is REFUSED and REPORTED, and nothing stops working", async () => {
      const { resolveAging } = await agingModule();
      for (const junk of ["dine_in=20/10", "dine_in=8", "=8/16", "dine_in=x/y", "dine_in=0/10"]) {
        const policy = resolveAging(junk);
        expect(policy.malformed, `\`${junk}\` was accepted or silently dropped`).toContain(junk);
        expect(
          policy.source,
          "a refused configuration must say so — 00 §5.7, a threshold that is wrong looks exactly " +
            "like one that is right",
        ).toBe("refused");
        expect(
          policy.thresholdsFor("dine_in"),
          "commandment 4 / 01-F17: a typo in a threshold must never take the surface down mid " +
            "service — 03-F14's own defaults stay in force",
        ).toEqual({ amberAt: 10, redAt: 20 });
      }
    });

    it("01-F17: a config that is PART good and PART malformed is refused WHOLE", async () => {
      // ⚠ THE CASE THE LOOP ABOVE CANNOT SEE, and a mutant proved it rather than a reading. Every
      // string up there is malformed in ALL of its entries, so the refused row was never going to
      // be in the map anyway — an implementation that reports `refused` and then applies the parse
      // regardless answers all fifteen of those assertions correctly and survives. Only a MIXED
      // string separates "refused and not applied" from "refused and applied", and mixed is the
      // realistic shape: an operator edits one row of three and fat-fingers it.
      //
      // Refusing WHOLE rather than per-entry is the module's stated reading and the safer of the
      // two: `00 §5.7` wants one honest sentence about the configuration, and a half-applied table
      // is a state no operator asked for and none can see.
      const { resolveAging } = await agingModule();
      const policy = resolveAging("dine_in=8/16,delivery=oops");
      expect(policy.malformed, "the unreadable entry is not reported verbatim").toEqual([
        "delivery=oops",
      ]);
      expect(policy.source).toBe("refused");
      expect(
        policy.thresholdsFor("dine_in"),
        "the GOOD half of a refused configuration was applied anyway — the boot line says " +
          "REFUSED while the thresholds in force are the operator's, which is the one state " +
          "00 §5.7 exists to make impossible",
      ).toEqual({ amberAt: 10, redAt: 20 });
      expect(policy.thresholdsFor("delivery")).toEqual({ amberAt: 15, redAt: 25 });
    });

    it("03-F14's ladder needs three rungs: amber strictly before red", async () => {
      // `neutral → amber at X min → red at Y min` has three states only when X < Y. A row where
      // red arrives first or together collapses the ladder to two and the operator loses the
      // warning that exists to be acted on BEFORE the food is late.
      const { resolveAging } = await agingModule();
      expect(resolveAging("dine_in=10/10").malformed).toEqual(["dine_in=10/10"]);
      expect(resolveAging("dine_in=20/10").malformed).toEqual(["dine_in=20/10"]);
    });
  });
});
