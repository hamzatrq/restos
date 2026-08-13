/**
 * # `18 §4` — THE NODE / ELECTRON DRIVER: `better-sqlite3` behind the storage port
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10) — SENIOR REVIEW.**
 *
 * > **Device DB:** … **Electron: `better-sqlite3`**; RN: `@op-engineering/op-sqlite`.
 *
 * **This is the ONE module in the package that constructs `better-sqlite3`**, and that is an
 * asserted property rather than a convention (`storage-adapter.test.ts` §A). Before August 2026
 * the construction sat inside `device-store.ts`, which meant every consumer of the kernel — the
 * cloud Auditor, the manager's phone, anything that only wanted a fold — dragged a native addon
 * behind it. Nothing about the store needed that; it needed a database.
 *
 * The wrapper is deliberately thin: `better-sqlite3` already implements the port's semantics
 * exactly — synchronous statements, savepoint-nesting transactions, `undefined` on no match — so
 * this file adapts SHAPE and never behaviour. The op-sqlite driver is where the real work is.
 */
import Database from "better-sqlite3";
import type { SqlValue, StorageAdapter, StorageStatement } from "./storage.js";

export const createNodeStorageAdapter = (options: {
  path: string;
  /**
   * An explicit path to the compiled `better_sqlite3.node`.
   *
   * Needed because ONE checkout serves two V8 ABIs. `better-sqlite3` resolves its addon through
   * `bindings`, which checks `build/Release/` FIRST — so under pnpm, where every package shares
   * one physical copy, rebuilding for Electron (ABI 148) overwrites the build Node (ABI 127)
   * needs, and the test suites that open a store stop loading at all. They genuinely fight over
   * one file; there is no ordering that satisfies both.
   *
   * So the DEFAULT is left alone — `build/Release/` stays the Node build, which is what every
   * suite and every non-Electron host wants — and the Electron main processes pass the path to
   * their own ABI-matched binary instead. `apps/pos-electron` and `apps/pass-kds` are the only
   * callers, and `storage-adapter.test.ts` §C asserts that a bad path FAILS LOUDLY: an option
   * accepted and quietly dropped would put the Node addon in front of Electron, and the till
   * would stop booting for a reason no suite could see.
   */
  nativeBinding?: string | undefined;
}): StorageAdapter => {
  const db = new Database(
    options.path,
    options.nativeBinding === undefined ? {} : { nativeBinding: options.nativeBinding },
  );
  return {
    prepare: <Params extends readonly SqlValue[], Row>(sql: string) =>
      // `better-sqlite3`'s `Statement<P, R>` already IS `StorageStatement<P, R>` structurally
      // (`run` returns a `RunResult` where the port returns `void`, which is assignable). The
      // cast is over its `BindParameters extends unknown[]` constraint, which cannot express the
      // port's narrower `SqlValue` tuples.
      db.prepare(sql) as unknown as StorageStatement<Params, Row>,
    exec: (script) => {
      db.exec(script);
    },
    pragma: (statement) => db.pragma(statement) as unknown[],
    transaction: <T extends (...args: never[]) => unknown>(fn: T): T =>
      // `Transaction<F>` is `F` plus `.deferred`/`.immediate`/…; nothing here uses those, and the
      // port promises only `T` so a second driver need not invent them.
      db.transaction(fn as unknown as (...args: unknown[]) => unknown) as unknown as T,
    close: () => {
      db.close();
    },
  };
};
