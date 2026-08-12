// ACCEPTANCE TESTS — `18 §4`'s RN DRIVER: `@op-engineering/op-sqlite` behind the storage adapter.
//
// ⚠ PROTECTED PATH (commandment 10 / `20 §4.4`): `packages/sync-client`. **SENIOR REVIEW REQUIRED.**
//
// Authored from spec text ONLY (`24 §3` step 2; read-only to the implementing session), plus one
// artefact that is not spec and is named as such: `@op-engineering/op-sqlite@17.2.0`'s published
// `lib/typescript/src/types.d.ts`. The fake below is built from that file and from nothing else.
//
//   `18 §4`  — "Device DB: SQLite, WAL mode, foreign keys on. Electron: `better-sqlite3`;
//              **RN: `@op-engineering/op-sqlite`**. Apps NEVER run SQL directly — all device data
//              access goes through sync-client's storage adapter and query API."
//   `18 §8`  — "Storage: `op-sqlite` **via `sync-client` only**; `expo-secure-store` for device
//              tokens; AsyncStorage banned (nothing important may live there)."
//   `18 §14` — `@op-engineering/op-sqlite` is ALREADY on the allowed-dependency registry, so this
//              needs no `18 §15` process. It is the last clause of `18 §4` being implemented.
//   `01-F2` / `00 §5.2` — confirmed = durably persisted BEFORE the UI acknowledges it.
//   `05 §8`  — "the manager device holds a normal full branch slice"; `05-N5` — the queue and the
//              alarm list "survive app kill/restart without loss — they are folds over the branch
//              stream, re-derived on start (`01-F6`)". Neither sentence is satisfiable on a phone
//              that cannot open a database.
//
// ══ ⚠ WHAT THIS SUITE CANNOT SEE, STATED FIRST BECAUSE IT IS THE MOST IMPORTANT THING HERE ══════
//
// **It cannot see a phone, and no suite in this repository can.** `@op-engineering/op-sqlite` is a
// React Native TurboModule — its published manifest carries a `codegenConfig` with an Android
// java package (`com.op.sqlite`) and C++ sources — so it cannot be loaded by Node, by Vitest, or
// by Expo Go. `18 §12` gives React Native exactly one testing tool, **Maestro E2E on the office
// reference rig** (`00 §4`), and that rig does not exist in this tree.
//
// So the driver is exercised against a FAKE that implements op-sqlite's published `DB` type. What
// that proves: the shim's own logic — statement emulation, positional binding, row shape,
// transaction and savepoint SQL, script splitting, and that it never reaches for an asynchronous
// primitive. What it does NOT prove: that `open()` succeeds on a device, that WAL survives
// Android's scoped storage, that Hermes bundles the module, or that a real head returns the rows
// this fake returns. **Those are K-8-shaped debts — hardware, not code — and a green run here must
// never be quoted as "the RN driver works".**
//
// The fake is backed by `better-sqlite3` for its SQL engine, exposing ONLY op-sqlite's surface.
// That is deliberate: the property under test is the shim, and what executes the SQL underneath is
// irrelevant to it. It does mean a divergence between the two SQLite builds would be invisible.
//
// ══ THE DESIGN CONSTRAINT THIS SUITE ENCODES, AND WHERE IT COMES FROM ═══════════════════════════
//
// op-sqlite offers exactly ONE synchronous execution primitive — `executeSync(query, params)`.
// Its `transaction(fn)` returns `Promise<void>`, and `prepareStatement(sql).execute()` returns
// `Promise<QueryResult>` (only `bindSync` is synchronous). `01-F2` and `00 §5.2` require the write
// to be durable *before* the UI acks, and every one of `device-store.ts`'s seven transactions is a
// synchronous function returning a value. **Therefore the adapter must build transactions and
// savepoints out of `executeSync` and raw `BEGIN` / `SAVEPOINT` / `RELEASE` / `ROLLBACK` SQL.**
// The fake below offers the async members faithfully, so an implementation that reaches for them
// fails the contract's synchrony check rather than being refused by a missing method.
//
// One conservatism, declared: the fake's `executeSync` refuses a MULTI-STATEMENT string, because
// `sqlite3_prepare_v2` compiles one statement. If a real device turns out to accept a script, this
// suite is stricter than the device — an adapter that splits scripts works in both worlds, so the
// constraint can cost a correct implementation nothing.
//
// ══ ⚠ THE DEV-CLIENT FINDING, WHICH IS A DEPLOYMENT FACT AND NOT A CODE ONE ═════════════════════
//
// `@op-engineering/op-sqlite@17.2.0`'s published manifest carries `codegenConfig` (`type:
// "modules"`, `android.javaPackageName: "com.op.sqlite"`) and ships C++ sources: it is a React
// Native TurboModule, compiled into the binary. **It therefore cannot run in Expo Go, and
// `apps/manager` needs a custom dev client / EAS build from the moment this lands.** That is
// reported rather than worked around, per this track's brief. It does NOT breach `18 §8`: that
// section forbids CUSTOM native modules outside `pos-rn`/`pass-kds` ("waiter/rider/owner/manager
// stay pure-JS installable") while itself specifying `op-sqlite` as the manager's storage and
// putting every Expo app on "dev clients + EAS Build/Update" (`18 §1`/`§8`) — and `18 §14` already
// allowlists the package. So the constraint is on the developer LOOP (no Expo Go), not on the
// shipped app. **If "pure-JS installable" was ever meant to mean "runs in Expo Go", that reading
// and `18 §4`'s "RN: `@op-engineering/op-sqlite`" cannot both stand, and it is a founder call —
// but no reading of `18` makes a store optional, and `05-N5` makes it mandatory.**

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createOpSqliteStorageAdapter, type OpSqliteDb } from "../index.js";
import { type AdapterHarness, STORAGE_CONTRACT, tempDir } from "./storage-contract.js";

// ── the fake, built from op-sqlite@17.2.0's published types ────────────────────────────────────

type Scalar = string | number | boolean | null | ArrayBuffer | ArrayBufferView;
type QueryResult = { rowsAffected: number; rows: Record<string, Scalar>[]; insertId?: number };

/** Every asynchronous member of op-sqlite's `DB`, counted. `01-F2` says none may be used. */
type AsyncUse = { transaction: number; prepareStatement: number; execute: number };

type Fake = { db: OpSqliteDb; async: AsyncUse; sql: string[] };

const fakeOpSqlite = (path: string): Fake => {
  const inner = new Database(path);
  const async: AsyncUse = { transaction: 0, prepareStatement: 0, execute: 0 };
  const sql: string[] = [];

  const executeSync = (query: string, params?: Scalar[]): QueryResult => {
    sql.push(query.trim());
    const bound = (params ?? []) as never[];
    const statement = inner.prepare(query); // throws on a multi-statement string, per the header
    if (statement.reader) {
      return { rowsAffected: 0, rows: statement.all(...bound) as Record<string, Scalar>[] };
    }
    const info = statement.run(...bound);
    return { rowsAffected: info.changes, rows: [], insertId: Number(info.lastInsertRowid) };
  };

  const db = {
    executeSync,
    close: () => inner.close(),
    // Faithful async members. Present so an implementation that reaches for one gets a PROMISE
    // and fails the contract's synchrony clause, rather than a `TypeError` that reads like a
    // missing feature.
    execute: async (query: string, params?: Scalar[]): Promise<QueryResult> => {
      async.execute += 1;
      return executeSync(query, params);
    },
    transaction: async (fn: (tx: unknown) => Promise<void>): Promise<void> => {
      async.transaction += 1;
      executeSync("BEGIN");
      try {
        await fn({
          execute: async (q: string, p?: Scalar[]) => executeSync(q, p),
          commit: async () => executeSync("COMMIT"),
          rollback: () => executeSync("ROLLBACK"),
        });
        executeSync("COMMIT");
      } catch (error) {
        executeSync("ROLLBACK");
        throw error;
      }
    },
    prepareStatement: (query: string) => {
      async.prepareStatement += 1;
      let bound: Scalar[] = [];
      return {
        bind: async (params: Scalar[]): Promise<void> => {
          bound = params;
        },
        bindSync: (params: Scalar[]): void => {
          bound = params;
        },
        execute: async (): Promise<QueryResult> => {
          async.execute += 1;
          return executeSync(query, bound);
        },
      };
    },
  };
  // The adapter is typed against `OpSqliteDb` — the narrow slice `sync-client` declares. The cast
  // is the fake announcing that it implements more of op-sqlite's `DB` than the port needs.
  return { db: db as unknown as OpSqliteDb, async, sql };
};

const opSqliteHarness = (): AdapterHarness & { fakes: Fake[] } => {
  const dir = tempDir("restos-storage-rn-");
  const path = join(dir, "device.db");
  const fakes: Fake[] = [];
  return {
    fakes,
    open: () => {
      const fake = fakeOpSqlite(path);
      fakes.push(fake);
      return createOpSqliteStorageAdapter(fake.db);
    },
    dispose: () => {
      for (const fake of fakes) {
        try {
          fake.db.close();
        } catch {
          // already closed by a check
        }
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SAME CONTRACT. One list of checks, two engines (`18 §4`'s own sentence).
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A the op-sqlite driver satisfies the SAME storage contract as the Node driver", () => {
  it.each(STORAGE_CONTRACT.map((check) => [check.name, check] as const))("%s", (_name, check) => {
    const harness = opSqliteHarness();
    try {
      check.run(harness);
    } finally {
      harness.dispose();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — `01-F2` / `00 §5.2`: the write is durable BEFORE the caller is told, so nothing is async.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B the driver never reaches an ASYNCHRONOUS op-sqlite primitive", () => {
  it("drives a whole openStore append cycle through executeSync alone", () => {
    // The clause with the sharpest failure mode: an adapter built on op-sqlite's own
    // `transaction()` would look correct, pass a casual read, and return to `append()`'s caller
    // BEFORE the row was durable — `01-F2`'s exact prohibition, invisible until a power cut.
    const harness = opSqliteHarness();
    try {
      const check = STORAGE_CONTRACT.find((c) =>
        c.name.startsWith("openStore runs on the adapter"),
      );
      expect(check).toBeDefined(); // 24-F14: a renamed check must not silently empty this test
      check?.run(harness);

      const totals = harness.fakes.reduce(
        (sum, fake) => ({
          transaction: sum.transaction + fake.async.transaction,
          prepareStatement: sum.prepareStatement + fake.async.prepareStatement,
          execute: sum.execute + fake.async.execute,
        }),
        { transaction: 0, prepareStatement: 0, execute: 0 },
      );
      expect(totals).toEqual({ transaction: 0, prepareStatement: 0, execute: 0 });
      // The control: it did real work rather than passing by doing nothing.
      expect(harness.fakes.some((f) => f.sql.length > 20)).toBe(true);
    } finally {
      harness.dispose();
    }
  });

  it("opens its transactions with real SQL, and nests them as SAVEPOINTs (26 §6.4)", () => {
    // Attribution for the nesting check in the contract: the contract proves the BEHAVIOUR, this
    // proves the mechanism is the only one op-sqlite makes available synchronously. Without it, a
    // driver could pass the nesting check by discarding inner transactions entirely on an engine
    // that happened not to notice.
    const harness = opSqliteHarness();
    try {
      const check = STORAGE_CONTRACT.find((c) => c.name.startsWith("nested transactions"));
      expect(check).toBeDefined(); // 24-F14
      check?.run(harness);
      const issued = harness.fakes
        .flatMap((f) => f.sql)
        .join("\n")
        .toUpperCase();
      expect(issued).toContain("BEGIN");
      expect(issued).toContain("SAVEPOINT");
      expect(issued).toContain("ROLLBACK TO");
    } finally {
      harness.dispose();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — `18 §8`: the RN entry point is REACHABLE from a phone, and reaches nothing a phone lacks.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const SRC_DIR = new URL("../", import.meta.url);
const PKG = new URL("../../package.json", import.meta.url);

describe("§C the RN door exists and is Hermes-safe", () => {
  it("package.json declares the ./rn subpath — 18 §8's 'op-sqlite via sync-client only'", () => {
    // Without a subpath an app must import the package ROOT, and the root is where `18 §4`'s
    // Electron half lives. `apps/manager/metro.config.js` already documents this exact mechanism
    // for `./fold-engine`; this is the second door and the first that can WRITE.
    const manifest = JSON.parse(readFileSync(PKG, "utf8")) as {
      exports?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.exports ?? {})).toContain("./rn");
    // `18 §14` already allows it; declaring it is what makes the driver real rather than described.
    expect(Object.keys(manifest.dependencies ?? {})).toContain("@op-engineering/op-sqlite");
  });

  it("the RN entry point exists and exports a store opener", () => {
    const url = new URL("rn.ts", SRC_DIR);
    expect(existsSync(url)).toBe(true);
    const code = readFileSync(url, "utf8");
    expect(code).toContain("openRnStore");
    // `18 §4`: "all device data access goes through sync-client's storage adapter" — so the RN
    // door hands back a `DeviceStore`, not a database handle for an app to run SQL against.
    expect(code).toContain("@op-engineering/op-sqlite");
  });

  it("the op-sqlite ADAPTER itself imports no native module — only the entry point does", () => {
    // The shim is pure TypeScript over an injected handle, which is what makes §A possible at all.
    // If the adapter imported op-sqlite directly, this whole suite would be untestable in Node and
    // the RN half would ship with zero coverage of any kind.
    const code = readFileSync(new URL("storage-op-sqlite.ts", SRC_DIR), "utf8");
    expect(code.length).toBeGreaterThan(500); // 24-F14
    expect(code.includes('from "@op-engineering/op-sqlite"')).toBe(false);
    expect(code.includes('from "better-sqlite3"')).toBe(false);
  });
});
