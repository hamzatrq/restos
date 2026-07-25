// bench/build.mjs — bundles the pure RestOS kernel compute (fold-engine subpath +
// @restos/domain) into a single self-contained JS file that runs under BOTH Node
// and the standalone Hermes VM. Additive Tier-B test infra (see bench/README.md):
// touches no product source.
//
// Design notes:
//  - esbuild is not a declared dependency of this harness (the task is additive-
//    only: new files + one root script, no lockfile churn). It IS already present
//    in the pnpm store transitively (vitest → vite → esbuild), so we discover the
//    newest esbuild@* there and load its JS API. If it ever vanishes, the error is
//    loud and the README documents the one-line `pnpm add -D esbuild` fallback.
//  - Every kernel import resolves RELATIVE TO ITS OWN FILE, so bundling the source
//    .ts files by relative path pulls @restos/domain and @noble/hashes in from the
//    packages' own node_modules — the bench dir needs nothing linked.
//  - Target es2020: the real Hermes 0.12 supports const/let, ??, ?., BigInt,
//    Object.hasOwn, Array.at, etc. (probed in phase 0). esbuild's built-in
//    `hermes0.12` target is far more conservative than the shipped VM (it rejects
//    `const`), so we deliberately do NOT use it.
//  - print shim banner: Hermes exposes `print` but no `console`; Node is the
//    reverse. `globalThis.__emit` unifies them so the same bundle prints on both.

import { existsSync, globSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

/** Discover the newest esbuild@* in the pnpm store and load its JS API. */
async function loadEsbuild() {
  const storeGlob = join(REPO_ROOT, "node_modules/.pnpm/esbuild@*/node_modules/esbuild");
  const matches = globSync(storeGlob).sort(); // esbuild@0.18 < 0.25 < 0.28 lexically here
  if (matches.length === 0) {
    throw new Error(
      "esbuild not found in the pnpm store. This harness reuses the esbuild that " +
        "vitest already installs. Run `pnpm install` (or `pnpm add -D esbuild` at the root) and retry.",
    );
  }
  const pkgDir = matches[matches.length - 1];
  const require = createRequire(join(pkgDir, "index.js"));
  const mod = require(join(pkgDir, "lib/main.js"));
  return { esbuild: mod, version: pkgDir.match(/esbuild@([^/]+)/)?.[1] ?? "unknown" };
}

/**
 * Resolve TS ESM `./foo.js` specifiers to the on-disk `./foo.ts` (the kernel is
 * authored in NodeNext style — imports carry `.js` extensions that point at `.ts`
 * sources). esbuild does not rewrite `.js`→`.ts` on its own.
 */
const tsExtensionPlugin = {
  name: "js-to-ts",
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.kind === "entry-point" || !args.importer) return null;
      if (!args.path.startsWith(".")) return null; // only relative specifiers
      const candidate = resolve(dirname(args.importer), args.path);
      const tsPath = candidate.replace(/\.js$/, ".ts");
      if (existsSync(tsPath)) return { path: tsPath };
      return null;
    });
  },
};

/**
 * Redirect the `@restos/domain` package specifier (imported by the fold engine's
 * folds/merge.ts and fold-engine.ts) to a zod-free kernel shim that re-exports the
 * IDENTICAL pure source modules (canonical/payload-hash/money/audit/states/
 * product-constants) but omits the barrel's registry+envelope (zod) and ids
 * (uuidv7) layers. Rationale, documented in bench/README.md:
 *   - The fold compute path never invokes zod — it consumes ALREADY-PARSED events,
 *     exactly as the acceptance-test builders construct them. Validation is an
 *     I/O-boundary concern, out of the compute layer this harness scopes.
 *   - zod's async-arrow functions are unsupported by the raw Hermes CLI (no flag
 *     fixes async arrows), and uuidv7 is never called (fixtures use fixed ids).
 * The code under test stays byte-identical to production; only the untested
 * validation shell is excluded.
 */
const KERNEL_SHIM = resolve(HERE, "src/domain-kernel.ts");
const domainKernelAlias = {
  name: "domain-kernel-alias",
  setup(build) {
    build.onResolve({ filter: /^@restos\/domain$/ }, () => ({ path: KERNEL_SHIM }));
  },
};

// print/console shim — injected ahead of the bundle so both runtimes have __emit.
const SHIM_BANNER = `(function(){
  var g = typeof globalThis !== 'undefined' ? globalThis : this;
  if (typeof g.__emit !== 'function') {
    if (typeof print === 'function') { g.__emit = function(s){ print(String(s)); }; }
    else if (typeof console !== 'undefined' && console.log) { g.__emit = function(s){ console.log(String(s)); }; }
    else { g.__emit = function(){}; }
  }
})();`;

export async function buildBundle({ entry, outfile }) {
  const { esbuild, version } = await loadEsbuild();
  mkdirSync(dirname(outfile), { recursive: true });
  const result = await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "iife",
    platform: "neutral",
    // es2020 keeps BigInt native (the money layer requires it — polyfilling it would
    // itself be a parity divergence) and keeps ES6 `class` intact. The target Hermes
    // engine DOES run classes and the compute-critical @noble/hashes sha256 — but only
    // under the `-Xes6-class` runtime flag (phase-0 finding; the raw CLI defaults it
    // off, React Native enables it). esbuild deliberately cannot lower `class` to ES5,
    // so we do NOT try — we pass the flag when invoking Hermes (see run.mjs) instead.
    target: "es2020",
    // The kernel + noble/hashes are pure ESM; neutral platform keeps Node globals
    // out of the bundle so Hermes (no process/require/fs) can run it.
    mainFields: ["module", "main"],
    conditions: ["import", "default"],
    banner: { js: SHIM_BANNER },
    legalComments: "none",
    logLevel: "warning",
    plugins: [domainKernelAlias, tsExtensionPlugin],
  });
  return { version, warnings: result.warnings };
}

// CLI: node build.mjs <entry.ts> <outfile.js>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , entry, outfile] = process.argv;
  if (!entry || !outfile) {
    console.error("usage: node build.mjs <entry.ts> <outfile.js>");
    process.exit(1);
  }
  const { version } = await buildBundle({
    entry: resolve(entry),
    outfile: resolve(outfile),
  });
  console.log(`bundled ${entry} -> ${outfile} (esbuild ${version})`);
}

// Keep readdirSync import used (defensive: some Node builds tree-shake globSync).
void readdirSync;
