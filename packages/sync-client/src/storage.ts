/**
 * # `18 §4` — THE DEVICE STORAGE PORT
 *
 * > **Device DB:** SQLite, WAL mode, foreign keys on. **Electron: `better-sqlite3`; RN:
 * > `@op-engineering/op-sqlite`.** Apps NEVER run SQL directly — all device data access goes
 * > through **`sync-client`'s storage adapter** and query API (§7). Migration of device schemas
 * > ships inside `sync-client`.
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10) — SENIOR REVIEW.**
 *
 * One sentence, two engines, one adapter. Until August 2026 `device-store.ts` opened
 * `new Database(path)` from `better-sqlite3` at module scope, so *importing* `@restos/sync-client`
 * at all was fatal under Hermes and the second engine the handbook names could never be reached.
 * This file is the seam that sentence always described: the store binds THIS type, and the engines
 * live behind `storage-node.ts` and `storage-op-sqlite.ts`.
 *
 * ## Why it is this small, and why every member is load-bearing
 *
 * The port is exactly the surface `device-store.ts` uses and not one method more, because every
 * member is something a second driver has to reimplement correctly — `storage-op-sqlite.ts`
 * hand-rolls `transaction` out of raw SQL, and each extra member would be another chance for the
 * two engines to disagree (`03-F40`'s two-sensor-layouts defect, one layer down). Measured against
 * the shipped store: one construction, 3 pragmas, 1 `exec`, 40 prepared statements driving
 * `run`/`get`/`all`, 7 transactions, one `close`.
 *
 * ## The three properties that are CORRECTNESS and not style
 *
 * 1. **Everything is SYNCHRONOUS.** `01-F2` / `00 §5.2`: confirmed means durably persisted
 *    *before* the UI acknowledges it. A driver whose write completes on a later turn has changed
 *    the durability contract even when it eventually commits the same bytes — and `append()` is a
 *    synchronous value-returning function all the way up to the renderer.
 * 2. **`transaction` NESTS AS A SAVEPOINT.** `26 §6.4` / `T-01-16`: a catch-up page commits ONCE
 *    with PER-ITEM isolation, so an inner failure must roll back only the inner work while the
 *    good prefix stays and later siblings are still attempted (`01-F17` — one bad event may never
 *    wedge a page). A driver that nests as a plain `BEGIN` loses the whole page or commits
 *    mid-page; both are silent.
 * 3. **`get` returns `undefined` on no match.** `device-store.ts` reads `row?.x ?? fallback` in
 *    five places; `null` breaks none of them loudly and one of them quietly.
 */

/**
 * What SQLite can bind. Deliberately narrower than `unknown`: the store binds ids, integers and
 * JSON strings, and a parameter type wide enough to accept an object would let a fold row reach a
 * statement unserialised — which SQLite reports as a bind error at run time on the device rather
 * than as a type error here.
 */
export type SqlValue = string | number | bigint | Uint8Array | null;

/**
 * One prepared statement. `Params` is a tuple so the 40 call sites in `device-store.ts` keep
 * checking their argument arity and order, which is the whole reason they were typed that way
 * against `better-sqlite3` — losing it in the move to a port would have retired 40 checks silently.
 */
export type StorageStatement<
  Params extends readonly SqlValue[] = readonly SqlValue[],
  Row = unknown,
> = {
  run(...params: Params): void;
  /** `undefined` — never `null` — when nothing matches. See property 3 above. */
  get(...params: Params): Row | undefined;
  all(...params: Params): Row[];
};

/**
 * The device database, as `sync-client` uses it. Both shipped drivers implement exactly this and
 * nothing else crosses the boundary — no app may hold one (`18 §4`: *"Apps NEVER run SQL
 * directly"*), which is why neither `openStore` nor `openRnStore` returns one.
 */
export type StorageAdapter = {
  prepare<Params extends readonly SqlValue[] = readonly SqlValue[], Row = unknown>(
    sql: string,
  ): StorageStatement<Params, Row>;
  /**
   * Apply a whole SQL SCRIPT — `18 §4`'s *"migration of device schemas ships inside
   * `sync-client`"*. The device schema is one multi-statement string with `--` comment lines,
   * parenthesised `CHECK` clauses and semicolons inside string literals, so a driver that reaches
   * SQLite one statement at a time must split it properly rather than on a bare `;`.
   */
  exec(script: string): void;
  /**
   * `18 §4`'s *"WAL mode, foreign keys on"*. Returns the engine's own rows so the setting can be
   * READ BACK rather than trusted — `journal_mode` reports the mode it actually entered, and a
   * read-only filesystem silently refuses WAL.
   */
  pragma(statement: string): unknown[];
  /** Synchronous, value-returning, and savepoint-nesting. See properties 1 and 2 above. */
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  close(): void;
};
