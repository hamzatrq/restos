// Metro, configured for THIS monorepo's two non-standard facts. Both are load-bearing; a
// stock `getDefaultConfig(__dirname)` fails on either one.
//
// 1. **The workspace packages export TypeScript SOURCE, not build output.** Every
//    `packages/*/package.json` points `exports` at `./src/*.ts` and every `build` script is an
//    `echo` stub, so Metro must both WATCH and TRANSFORM files outside this app directory.
//    `watchFolders` is what makes them visible; `babel-preset-expo` already strips the types.
// 2. **`@restos/sync-client` is reachable only by its `./fold-engine` subpath on this
//    platform.** Its root entry pulls `device-store.ts`, which imports the `better-sqlite3`
//    native addon (`18 §9` — an Electron/Node dependency that cannot load under Hermes). The
//    pure subpath exists precisely so a non-Node host can refold (`26 §8`, the cloud Auditor's
//    reason), and package `exports` resolution is what routes to it — hence the explicit flag
//    rather than trusting a default that has moved between Metro releases.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// pnpm puts real directories under the workspace root and symlinks into each package. Both
// paths are listed, app-local first, so a package hoisted to the root still resolves.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Reason (2) above.
config.resolver.unstable_enablePackageExports = true;

// 3. **The workspace packages import each other with `.js` extensions that name `.ts` files.**
//    `packages/sync-client/src/fold-engine.ts` says `from "./folds/customer-file.js"` and the
//    file on disk is `customer-file.ts`. That is correct TypeScript — it is the extension the
//    emitted JS *would* have, and it is what `moduleResolution: "Bundler"` and every other
//    consumer in this repo already expect. Metro does not perform that mapping and fails with
//    "Unable to resolve module ./folds/customer-file.js".
//
//    Resolved here rather than by rewriting the packages: those imports are correct, they are
//    on PROTECTED paths (`packages/sync-client`, `packages/domain`), and changing 40-odd import
//    specifiers across the kernel to accommodate one app's bundler would be exactly the
//    "improve adjacent code" drive-by that `24 §3b` forbids.
//
//    Original specifier FIRST, `.ts` only as a fallback — so a real `.js` file always wins and
//    this can never shadow one.
const withTsFallback = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
      return context.resolveRequest(context, `${moduleName.slice(0, -3)}.ts`, platform);
    }
    throw error;
  }
};
config.resolver.resolveRequest = withTsFallback;

module.exports = config;
