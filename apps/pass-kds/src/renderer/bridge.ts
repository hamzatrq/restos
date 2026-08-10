import type { PassBridge } from "../shared/ipc";

/**
 * `18 §9` — the ONE bridge, reached through one accessor.
 *
 * **It is a function rather than a `declare global` on `Window.restos`, and that is not style.**
 * `apps/pos-electron` already declares that exact property globally with its own `RestosBridge`
 * type, and the repo typechecks as ONE project — the root `tsconfig.json` includes every app's
 * `src` — so a second global declaration does not shadow the first, it **collides** with it, and
 * the errors land in the *other* app's files. Measured 2026-08-10: adding the obvious
 * `global.d.ts` here produced eleven `Property 'deviceState' does not exist on type 'PassBridge'`
 * errors inside `apps/pos-electron`'s renderer, which is a session breaking a neighbouring app by
 * declaring a type in its own.
 *
 * A single accessor also makes the seam greppable: every renderer read of the plane boundary goes
 * through this file, so *"what can this renderer ask main for"* is answerable by reading one
 * export rather than by trusting a global.
 */
export const bridge = (): PassBridge => (window as unknown as { restos: PassBridge }).restos;
