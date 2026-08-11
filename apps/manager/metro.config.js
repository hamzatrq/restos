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

module.exports = config;
