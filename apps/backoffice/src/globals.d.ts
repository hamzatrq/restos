/**
 * A side-effect CSS import is a bundler fact, not a TypeScript one.
 *
 * Next generates `next-env.d.ts` with the declarations that cover this — but that file sits at the
 * app root, and the repo's `pnpm typecheck` compiles `apps/*​/src` with the ROOT tsconfig, which
 * never sees it. Declaring the module here means both compilers agree: the app's own `tsc` and the
 * repo-wide one. Without it `pnpm verify` reds on `import "./globals.css"` while `next build`
 * passes, which is the worst of the two possible failures — a gate that disagrees with the build.
 */
declare module "*.css";
