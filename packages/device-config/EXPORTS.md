# `@restos/device-config` — why there are two entry points

`.` is the whole package: `aging.ts`, `device-identity.ts`, `panel-density.ts`. It is what a
**Node or Electron host** imports, and it is the only entry those two should ever use.

`./aging` is a **pure subpath**, added August 2026 for `apps/manager` (React Native / Hermes), on
exactly the precedent `@restos/sync-client/fold-engine` set one package over: *the root entry pulls
a module that cannot run on the target runtime, so the portable half gets its own door.*

## The measurement that forced it

`panel-density.ts` is not portable and is not merely inconvenient on RN — it **shells out**:

```ts
export const measurePhysicalWidthMm = (
  platform: NodeJS.Platform,
  run: (command: string, args: readonly string[]) => string | null,
): number | null => { … run("powershell.exe", […]) … }
```

Two consequences, both measured rather than predicted:

1. **Typecheck.** `apps/manager` has its own `tsc` program with `types: []` (RN's ambient globals
   and `@types/node` are mutually incompatible — see that app's `tsconfig.json`). Importing the
   root entry from there produced
   `packages/device-config/src/panel-density.ts(109,20): error TS2694: Namespace 'global.NodeJS' has no exported member 'Platform'.`
2. **The bundle, which is the half that actually matters.** Metro follows the same import, so the
   root entry would put an OS-command runner inside a Hermes bundle. That is the shape
   `apps/manager/CLAUDE.md` records for `better-sqlite3`, and it is the reason
   `26 §8`'s pure subpath exists at all.

`aging.ts` itself is pure — no `process`, no `node:` import, no I/O — so the split costs nothing
and duplicates nothing. **`03-F14`'s thresholds keep ONE definition**, which is the point: a
manager console re-deriving "red at Y minutes" for itself would be `03-F40`'s two-interpretations
defect on the number a late-order alarm fires on.

## Rule

A device host on Node or Electron imports `.`. A React Native app imports `./aging` and must not
import `.` — there is nothing in the other two modules it can run.
