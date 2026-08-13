// Wall-clock Clock adapter (T-01-05 fix-round 4; contract (a) time seam): the
// production side — T-01-06's real transport consumes it; the sim provides the
// virtual one. Methods wrap the globals (never bare references) so `this`
// binding stays safe under Node's timers implementation.
// The `./transport` subpath rather than the package ROOT: the root re-exports
// `compression.ts`, whose `node:zlib` import a React Native program cannot even TYPE.
// A type-only import still loads the target module graph, so the specifier is load-bearing.
import type { Clock, TimerId } from "@restos/sync-protocol/transport";

export const wallClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number): TimerId => setTimeout(fn, ms),
  clearTimeout: (id: TimerId): void => {
    clearTimeout(id as ReturnType<typeof setTimeout>);
  },
};
