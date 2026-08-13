// THE DEVICE-STORAGE CONTRACT — one list of named checks, run against EVERY driver.
//
// ⚠ PROTECTED PATH (commandment 10, `20 §4.4`): `packages/sync-client`. This file and the two
// suites that consume it need SENIOR REVIEW, and so does the implementation they describe.
//
// Authored from spec text ONLY (`24 §3` step 2; read-only to the implementing session). The
// governing sentence is `18 §4`, quoted whole because every check below is one clause of it:
//
//   > **Device DB:** SQLite, WAL mode, foreign keys on. Electron: `better-sqlite3`; RN:
//   > `@op-engineering/op-sqlite`. Apps NEVER run SQL directly — all device data access goes
//   > through **`sync-client`'s storage adapter** and query API (§7). Migration of device schemas
//   > ships inside `sync-client` (versioned, forward-only, tested against fixture DBs).
//
// Also binding here:
//   `01-F2` / `00 §5.2` — confirmed = durably persisted BEFORE the UI acks. That makes the port
//                         SYNCHRONOUS a correctness property, not a style: a driver whose write
//                         completes on a later turn has changed the durability contract.
//   `01-F1`             — append-only; a rolled-back page must leave no row behind.
//   `01-F17`            — a sale is never blocked; the store may not wedge on one bad item.
//   `26 §6.4` / `T-01-16` — a catch-up PAGE commits once, with PER-ITEM isolation. That is nested
//                         transaction (savepoint) semantics, and it is the check most likely to
//                         be silently missing from a second driver.
//   `18 §14`            — `@op-engineering/op-sqlite` is already allowlisted; no `18 §15` process.
//
// ── WHY A LIST OF CHECKS AND NOT A `describe` BLOCK ──────────────────────────────────────────
//
// AGENTS.md: *"a PORT SUPPLIED WITH A STUB … Rule B asks whether an optional member is supplied,
// never whether what was supplied is REAL, and a stub is a supply."* `pnpm seams:check` cannot
// see the difference and neither can a type. The only thing that can is running the contract and
// watching it FAIL — so the checks are values, `storage-adapter.test.ts` §D runs them against a
// deliberately inert driver and asserts that each one throws BY NAME. A suite that merely passes
// against the real driver would bless a decorative one.
//
// ── THE NAMES BELOW ARE THE CONTRACT ─────────────────────────────────────────────────────────
//
// `24 §3` puts the acceptance tests first and makes them read-only to the implementer, so the
// symbols this file imports (`StorageAdapter`, `openStore({ adapter, identity })`,
// `createNodeStorageAdapter`, `createOpSqliteStorageAdapter`) are the declared API and not a
// guess at one. If a name here is wrong, it is wrong in the SPEC sense — argue it in review and
// change this file; do not implement a different name and leave this RED. A test that stays red
// under a correct implementation is rated as damaging as a vacuous one (AGENTS.md round-3 law).

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newId } from "@restos/domain";
import { openStore, type StorageAdapter, type StoreIdentity } from "../index.js";

/** A durable database a check may open, close, and OPEN AGAIN — `01-F6`'s re-derivation needs it. */
export type AdapterHarness = {
  /** Open the SAME database. Called more than once by the reopen checks. */
  open: () => StorageAdapter;
  /** Everything this harness opened, closed and discarded. */
  dispose: () => void;
};

export type ContractCheck = {
  /** Stable id — §D asserts kills BY NAME, so a renamed check is a visible change. */
  readonly name: string;
  readonly run: (harness: AdapterHarness) => void;
};

const identityOf = (): StoreIdentity => ({
  org_id: newId(),
  branch_id: newId(),
  device_id: newId(),
});

/**
 * The harness's OWN schema, deliberately not `device-store.ts`'s.
 *
 * It is a script, with the three hazards a driver that reaches SQLite one statement at a time has
 * to survive: a `--` comment line, a parenthesised `CHECK`, and **a semicolon inside a string
 * literal**. `18 §4` says migrations ship inside `sync-client`; a script applier that splits on
 * `;` silently truncates this one and every check downstream of it fails with a missing table,
 * which is the honest signal.
 */
const HARNESS_SCHEMA = `
-- one row per note; the default carries a semicolon ON PURPOSE (see the header)
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL DEFAULT 'a; b',
  n INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS solo (
  id INTEGER PRIMARY KEY CHECK (id = 0),
  seq INTEGER NOT NULL
) STRICT;
INSERT OR IGNORE INTO solo (id, seq) VALUES (0, 0);
CREATE TABLE IF NOT EXISTS child (
  id TEXT PRIMARY KEY,
  parent TEXT NOT NULL REFERENCES notes(id)
) STRICT;
`;

/** noUncheckedIndexedAccess-safe unwrap. */
const must = <T>(value: T | undefined | null, what: string): T => {
  if (value === undefined || value === null) throw new Error(`expected ${what}`);
  return value;
};

const fail = (message: string): never => {
  throw new Error(message);
};

const eq = <T>(actual: T, expected: T, what: string): void => {
  if (!Object.is(actual, expected)) {
    fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

const threw = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

type NoteRow = { id: string; body: string; n: number };

const seeded = (harness: AdapterHarness): StorageAdapter => {
  const adapter = harness.open();
  adapter.exec(HARNESS_SCHEMA);
  return adapter;
};

/**
 * The contract. Every check is a clause of `18 §4` or of a kernel FR named in the header, and
 * every one of them has to be capable of FAILING against a driver that merely type-checks.
 */
export const STORAGE_CONTRACT: readonly ContractCheck[] = [
  {
    // `18 §4`: "Migration of device schemas ships inside sync-client." A script is a script.
    name: "exec applies a MULTI-STATEMENT script, semicolons in string literals and all",
    run: (harness) => {
      const db = seeded(harness);
      db.prepare("INSERT INTO notes (id, n) VALUES (?, ?)").run("n1", 1);
      const row = db.prepare<[string], NoteRow>("SELECT * FROM notes WHERE id = ?").get("n1");
      // Every statement in the script ran: the table exists, the DEFAULT survived the split, and
      // the `solo` row two statements further down was inserted.
      eq(must(row, "note row").body, "a; b", "default from the script's string literal");
      const solo = db.prepare<[], { seq: number }>("SELECT seq FROM solo WHERE id = 0").get();
      eq(must(solo, "solo row").seq, 0, "the third statement of the script ran");
    },
  },
  {
    // `18 §6`: reads are "named, typed queries"; `device-store.ts` drives 40 prepared statements
    // through `.run()` / `.get()` / `.all()` and binds POSITIONALLY.
    name: "prepare binds positional parameters and returns rows for get/all",
    run: (harness) => {
      const db = seeded(harness);
      const insert = db.prepare<[string, number]>("INSERT INTO notes (id, n) VALUES (?, ?)");
      insert.run("a", 1);
      insert.run("b", 2);
      insert.run("c", 3);
      const one = db.prepare<[string], NoteRow>("SELECT * FROM notes WHERE id = ?").get("b");
      eq(must(one, "row b").n, 2, "get() binds its parameter");
      const many = db
        .prepare<[number], NoteRow>("SELECT * FROM notes WHERE n >= ? ORDER BY n")
        .all(2);
      eq(many.length, 2, "all() returns every matching row");
      eq(must(many[0], "first row").id, "b", "all() returns rows in the query's order");
    },
  },
  {
    // `.get()` on no match is `undefined`, which `device-store.ts` reads as `row?.x ?? fallback`
    // in five places. A driver returning `null` breaks none of them loudly and one of them
    // quietly, so it is pinned.
    name: "get returns undefined when nothing matches, and all returns an empty array",
    run: (harness) => {
      const db = seeded(harness);
      const missing = db.prepare<[string], NoteRow>("SELECT * FROM notes WHERE id = ?").get("nope");
      eq(missing, undefined, "get() on no match");
      eq(db.prepare<[], NoteRow>("SELECT * FROM notes").all().length, 0, "all() on an empty table");
    },
  },
  {
    // `18 §4`: "SQLite, **WAL mode**, **foreign keys on**." Read back from the engine rather
    // than trusted: `openStore` sets all three and nothing has ever checked that they took.
    name: "pragma sets AND reports journal_mode = wal",
    run: (harness) => {
      const db = harness.open();
      db.pragma("journal_mode = WAL");
      const rows = db.pragma("journal_mode") as { journal_mode?: string }[];
      eq(String(must(rows[0], "journal_mode row").journal_mode).toLowerCase(), "wal", "WAL is on");
    },
  },
  {
    name: "pragma sets AND reports foreign_keys = ON, and the constraint actually bites",
    run: (harness) => {
      const db = seeded(harness);
      db.pragma("foreign_keys = ON");
      const rows = db.pragma("foreign_keys") as { foreign_keys?: number }[];
      eq(Number(must(rows[0], "foreign_keys row").foreign_keys), 1, "foreign_keys is on");
      // The pragma reporting `1` is not the property; refusing the orphan is.
      const orphan = (): void =>
        db.prepare<[string, string]>("INSERT INTO child (id, parent) VALUES (?, ?)").run("c", "no");
      eq(threw(orphan), true, "an orphan row is refused while foreign_keys is on");
    },
  },
  {
    // `00 §5.2` / `01-F2`: durable BEFORE the ack. A transaction that resolves later has changed
    // the durability contract even when it eventually commits the same bytes.
    name: "transaction is SYNCHRONOUS — it returns the function's value, never a promise",
    run: (harness) => {
      const db = seeded(harness);
      const tx = db.transaction((id: string): number => {
        db.prepare<[string, number]>("INSERT INTO notes (id, n) VALUES (?, ?)").run(id, 7);
        return 7;
      });
      const result: unknown = tx("t1");
      if (result !== null && typeof result === "object" && "then" in result) {
        fail("transaction returned a thenable — the write is not durable before the caller acks");
      }
      eq(result, 7, "the transaction returns the wrapped function's value");
      // Visible on a SECOND connection with no await anywhere: the commit already happened.
      const other = harness.open();
      const seen = other.prepare<[string], NoteRow>("SELECT * FROM notes WHERE id = ?").get("t1");
      eq(must(seen, "committed row read by a second handle").n, 7, "committed before return");
    },
  },
  {
    // `01-F1`: history is never half-written. `appendTx` stamps the audit head and the ledger row
    // in ONE transaction, so a partial commit is a broken hash chain.
    name: "transaction rolls the whole body back when the body throws, and rethrows",
    run: (harness) => {
      const db = seeded(harness);
      const tx = db.transaction((): void => {
        db.prepare<[string, number]>("INSERT INTO notes (id, n) VALUES (?, ?)").run("keep", 1);
        db.prepare<[string, number]>("INSERT INTO notes (id, n) VALUES (?, ?)").run("gone", 2);
        throw new Error("boom");
      });
      eq(threw(tx), true, "the error reaches the caller rather than being swallowed");
      eq(db.prepare<[], NoteRow>("SELECT * FROM notes").all().length, 0, "nothing was committed");
    },
  },
  {
    // `26 §6.4` / `T-01-16`, and the check a second driver is most likely to be missing: ONE
    // transaction per page, PER-ITEM savepoint isolation. "A per-item failure rolls back only
    // that item's savepoint — the good prefix commits, siblings after it are still attempted."
    name: "nested transactions are SAVEPOINTS — an inner failure loses only the inner work",
    run: (harness) => {
      const db = seeded(harness);
      const insert = db.prepare<[string, number]>("INSERT INTO notes (id, n) VALUES (?, ?)");
      const inner = db.transaction((id: string, explode: boolean): void => {
        insert.run(id, 1);
        if (explode) throw new Error("item failed");
      });
      const page = db.transaction((): number => {
        let failures = 0;
        for (const [id, explode] of [
          ["good-1", false],
          ["bad", true],
          ["good-2", false],
        ] as const) {
          try {
            inner(id, explode);
          } catch {
            failures += 1;
          }
        }
        return failures;
      });
      eq(page(), 1, "the page kept going after the bad item (01-F17)");
      const ids = db
        .prepare<[], NoteRow>("SELECT id FROM notes ORDER BY id")
        .all()
        .map((r) => r.id);
      // If `transaction` is not nesting-aware, the inner throw either aborts the whole page
      // (nothing lands) or commits mid-page (the later rollback loses good-1 too). Both are
      // distinguishable here and both are the defect `26 §6.4` names.
      eq(ids.join(","), "good-1,good-2", "the good prefix AND the good suffix survived");
    },
  },
  {
    // `01-F6`: "a reinstalled phone reconstructs its state completely" — from bytes on disk.
    name: "the database is DURABLE — a value written, closed and reopened is still there",
    run: (harness) => {
      const first = seeded(harness);
      first.prepare<[string, number]>("INSERT INTO notes (id, n) VALUES (?, ?)").run("durable", 42);
      first.close();
      const second = harness.open();
      const row = second
        .prepare<[string], NoteRow>("SELECT * FROM notes WHERE id = ?")
        .get("durable");
      eq(must(row, "row after reopen").n, 42, "the write survived close + reopen");
    },
  },
  {
    name: "close() means closed — a statement prepared afterwards refuses",
    run: (harness) => {
      const db = seeded(harness);
      db.close();
      eq(
        threw(() => db.prepare("SELECT 1").get()),
        true,
        "use after close throws",
      );
    },
  },
  // ── the same adapter, driving the REAL store ────────────────────────────────────────────────
  // Everything above is the port in isolation. These two run `device-store.ts` itself over the
  // driver, which is the only thing that proves all 40 prepared statements, all 7 transactions
  // and the audit chain work against it. A driver can satisfy every check above and still fail
  // here — that gap is exactly what "a stub is a supply" means one layer up.
  {
    name: "openStore runs on the adapter — append is durable and the ledger reads back",
    run: (harness) => {
      const identity = identityOf();
      const store = openStore({ adapter: harness.open(), identity });
      const order_id = newId();
      const envelope = store.append({
        id: newId(),
        org_id: identity.org_id,
        branch_id: identity.branch_id,
        device_id: identity.device_id,
        actor_user_id: null,
        device_created_at: 1_752_800_000_000,
        type: "order.created",
        schema_version: 1,
        payload: { order_id, order_type: "dine_in", channel: "counter" },
        refs: [],
      });
      // `01-F3`: monotonic and GAP-FREE, assigned atomically with the insert. The first value is
      // read from the store rather than asserted, because the base of the sequence is the store's
      // business and this contract is about the DRIVER; the step is the property that a driver
      // losing writes cannot fake.
      const first = envelope.lamport_seq;
      const second = store.append({
        id: newId(),
        org_id: identity.org_id,
        branch_id: identity.branch_id,
        device_id: identity.device_id,
        actor_user_id: null,
        device_created_at: 1_752_800_001_000,
        type: "order.confirmed",
        schema_version: 1,
        payload: { order_id },
        refs: [],
      });
      eq(second.lamport_seq, first + 1, "01-F3: lamport advances by exactly one per append");
      eq(store.readAllEvents().length, 2, "both ledger rows are readable");
      eq(store.status().queue_depth, 2, "01-F11: the outbox knows what it is owed");
      store.close();

      // `01-F6`: reopen replays the surviving set. A driver that lost the bytes reads zero.
      const reopened = openStore({ adapter: harness.open(), identity });
      eq(reopened.readAllEvents().length, 2, "the events survived a close and a reopen");
      eq(reopened.openOrders().length, 1, "the FOLD re-derived from the stored set");
      reopened.close();
    },
  },
  {
    name: "openStore's catch-up page keeps its good prefix when one item is divergent",
    run: (harness) => {
      const identity = identityOf();
      const store = openStore({ adapter: harness.open(), identity });
      const peer = { ...identity, device_id: newId() };
      const envelope = (lamport: number, order_id: string): Record<string, unknown> => ({
        id: newId(),
        org_id: peer.org_id,
        branch_id: peer.branch_id,
        device_id: peer.device_id,
        actor_user_id: null,
        device_created_at: 1_752_800_000_000,
        branch_created_at: 1_752_800_000_000,
        time_basis: "branch",
        lamport_seq: lamport,
        server_received_at: null,
        type: "order.created",
        schema_version: 1,
        payload: { order_id, order_type: "dine_in", channel: "counter" },
        refs: [],
      });
      const good1 = envelope(1, newId());
      const good2 = envelope(2, newId());
      // Same id, different payload — `01-F9`'s divergent duplicate, carried as `{ok:false}`.
      const divergent = { ...good1, payload: { ...(good1.payload as object), qty: 9 } };

      const results = store.ingestPage([
        { envelope: good1 },
        { envelope: divergent },
        { envelope: good2 },
      ]);
      eq(results.length, 3, "one result per item, in order");
      eq(must(results[0], "result 0").ok, true, "the good prefix landed");
      eq(must(results[1], "result 1").ok, false, "the divergent item was refused, not thrown");
      eq(must(results[2], "result 2").ok, true, "the sibling after the failure was still tried");
      eq(store.openOrders().length, 2, "01-F17: the page committed both good orders");
      store.close();
    },
  },
];

/** A fresh temp directory — one durable database per harness, on a real filesystem. */
export const tempDir = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix));
