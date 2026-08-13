/**
 * # `18 §4` — THE REACT-NATIVE DRIVER: `@op-engineering/op-sqlite` behind the storage port
 *
 * ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10) — SENIOR REVIEW.**
 *
 * > **Device DB:** SQLite, WAL mode, foreign keys on. Electron: `better-sqlite3`; **RN:
 * > `@op-engineering/op-sqlite`.** Apps NEVER run SQL directly — all device data access goes
 * > through `sync-client`'s storage adapter and query API.
 *
 * ## This file imports NOTHING native, and that is what makes it testable at all
 *
 * op-sqlite is a React Native TurboModule: it cannot be loaded by Node, by Vitest or by Expo Go.
 * So the shim takes an already-open handle as an argument and `rn.ts` — one import, one line — is
 * the only module that reaches the package. That split is why `storage-op-sqlite.test.ts` can run
 * the WHOLE `18 §4` contract against this driver on a development machine.
 *
 * ⚠ **What that does NOT prove, stated here so a green suite is never quoted as more:** nothing in
 * this repository loads op-sqlite, runs Hermes, or opens a database on a phone. `18 §12` gives
 * React Native exactly one tool — Maestro on the `00 §4` office rig — and there is no rig. The
 * shim's logic is covered; `open()` on a device is a K-8-shaped debt, hardware and not code.
 *
 * ## The design constraint, and where it comes from
 *
 * **op-sqlite offers exactly ONE synchronous execution primitive, `executeSync(query, params)`.**
 * Its `transaction(fn)` returns `Promise<void>` and `prepareStatement(sql).execute()` returns
 * `Promise<QueryResult>`. `01-F2` / `00 §5.2` require the write to be durable BEFORE the UI
 * acknowledges it, and all seven of `device-store.ts`'s transactions are synchronous
 * value-returning functions. So this driver builds transactions, savepoints and the schema applier
 * out of `executeSync` and raw SQL. An adapter written on op-sqlite's own `transaction()` would
 * look correct, read correctly, and return to `append()`'s caller before the row was durable —
 * `01-F2`'s exact prohibition, invisible until a power cut.
 *
 * Statements are therefore not really *prepared* on this platform: `prepare()` returns a handle
 * that re-executes the SQL text each call. That is a PERFORMANCE property, not a correctness one,
 * and it is recorded rather than hidden — the alternative (`prepareStatement`) is asynchronous.
 */
import type { SqlValue, StorageAdapter, StorageStatement } from "./storage.js";

/** op-sqlite's bindable scalar, from `@op-engineering/op-sqlite@17`'s published `types.d.ts`. */
export type OpSqliteValue = string | number | boolean | null | ArrayBuffer | ArrayBufferView;

/** op-sqlite's `QueryResult`, narrowed to the three fields this shim reads. */
export type OpSqliteQueryResult = {
  rowsAffected: number;
  rows: Record<string, OpSqliteValue>[];
  insertId?: number;
};

/**
 * The slice of op-sqlite's `DB` this driver uses — **the synchronous slice, and no more.**
 *
 * Declaring it here rather than importing op-sqlite's own type is what keeps this module free of
 * the native package. It is also the assertion that matters: the async members exist on the real
 * handle and are deliberately absent from this type, so reaching for one is a compile error rather
 * than a durability regression nobody notices.
 */
export type OpSqliteDb = {
  executeSync(query: string, params?: OpSqliteValue[]): OpSqliteQueryResult;
  close(): void;
};

/**
 * Split a SQL script into statements.
 *
 * `18 §4` says migrations ship inside `sync-client`, and the device schema is ONE string with
 * `--` comment lines, parenthesised `CHECK (id = 0)` clauses and — the one that bites — a
 * semicolon inside a string literal. `better-sqlite3` takes the whole script; op-sqlite compiles
 * one statement per call (`sqlite3_prepare_v2`), so this is where the two engines would silently
 * diverge. A splitter on a bare `;` truncates the schema at the first quoted semicolon and every
 * later table is simply missing — which surfaces as a "no such table" error three subsystems away.
 *
 * Comments are dropped rather than carried: they are not needed by the engine, and a `--` run to
 * end-of-line is exactly where a `;` most often hides.
 */
const statementsOf = (script: string): string[] => {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  const push = (): void => {
    const trimmed = current.trim();
    if (trimmed !== "") statements.push(trimmed);
    current = "";
  };
  while (i < script.length) {
    const ch = script[i] as string;
    if (ch === "-" && script[i + 1] === "-") {
      while (i < script.length && script[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && script[i + 1] === "*") {
      i += 2;
      while (i < script.length && !(script[i] === "*" && script[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    // SQLite's four quoting forms. `[` is closed by `]` and has no escape; the other three double
    // the delimiter to escape it ('it''s'), which is why the run continues past a doubled quote.
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      current += ch;
      i += 1;
      while (i < script.length) {
        const inner = script[i] as string;
        current += inner;
        i += 1;
        if (inner !== close) continue;
        if (close !== "]" && script[i] === close) {
          current += script[i] as string;
          i += 1;
          continue;
        }
        break;
      }
      continue;
    }
    if (ch === ";") {
      push();
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  push();
  return statements;
};

/**
 * A bigint reaches SQLite intact through `better-sqlite3` and has no place in op-sqlite's
 * published scalar set. It is REFUSED rather than coerced: money is integer paisa (commandment 3)
 * and a value silently narrowed through a double at the driver is unrecoverable — `01-F1` offers
 * no way to correct a ledger row that was written wrong. Nothing in `device-store.ts` binds one
 * today; this is the guard for the day something does.
 */
const bindable = (value: SqlValue): OpSqliteValue => {
  if (typeof value === "bigint") {
    throw new Error(
      `op-sqlite cannot bind the bigint ${value} (18 §4 — the RN driver refuses rather than ` +
        "narrowing through a double; commandment 3)",
    );
  }
  return value;
};

export const createOpSqliteStorageAdapter = (db: OpSqliteDb): StorageAdapter => {
  const run = (sql: string, params: readonly SqlValue[] = []): OpSqliteQueryResult =>
    db.executeSync(sql, params.map(bindable));

  /**
   * Transaction nesting depth. `26 §6.4` / `T-01-16`: a catch-up page commits ONCE with PER-ITEM
   * isolation, so the outer call is a real `BEGIN`/`COMMIT` and every inner one is a SAVEPOINT.
   * A driver that opened a second `BEGIN` would either error ("cannot start a transaction within
   * a transaction") or, worse, discard the nesting and take the whole page down with one bad
   * event — the case `01-F17` forbids in terms.
   *
   * The savepoint is named by DEPTH, which is safe because a level-N savepoint is always released
   * or rolled back before its sibling at the same level is opened.
   */
  let depth = 0;

  return {
    prepare: <Params extends readonly SqlValue[], Row>(sql: string) =>
      ({
        run: (...params: Params) => {
          run(sql, params);
        },
        // `undefined` and never `null` — `device-store.ts` reads `row?.x ?? fallback` in five
        // places, and `null` breaks none of them loudly and one of them quietly.
        get: (...params: Params) => run(sql, params).rows[0] as Row | undefined,
        all: (...params: Params) => run(sql, params).rows as Row[],
      }) satisfies StorageStatement<Params, Row>,

    exec: (script) => {
      for (const statement of statementsOf(script)) run(statement);
    },

    // `18 §4`'s "WAL mode, foreign keys on". op-sqlite returns a pragma's rows the same way it
    // returns any other query's, so the setting can be read back rather than trusted.
    pragma: (statement) => run(`PRAGMA ${statement}`).rows,

    transaction: <T extends (...args: never[]) => unknown>(fn: T): T =>
      ((...args: never[]): unknown => {
        const level = depth;
        const savepoint = `restos_sp_${level}`;
        run(level === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
        depth = level + 1;
        try {
          const result = fn(...args);
          run(level === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
          depth = level;
          return result;
        } catch (error) {
          // ROLLBACK TO leaves the savepoint on the stack (SQLite keeps it), so it is released
          // afterwards — otherwise the stack grows for the life of the page and the next
          // same-named SAVEPOINT would shadow a live one.
          run(level === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}`);
          if (level !== 0) run(`RELEASE ${savepoint}`);
          depth = level;
          throw error;
        }
      }) as T,

    close: () => {
      db.close();
    },
  };
};
