// ACCEPTANCE TESTS — `18 §4`'s DEVICE STORAGE ADAPTER: the port, and the Node driver behind it.
//
// ⚠ PROTECTED PATH (commandment 10 / `20 §4.4`): `packages/sync-client`. **SENIOR REVIEW REQUIRED**
// for this suite and for the implementation it describes. Say so in the PR title.
//
// Authored from spec text ONLY (`24 §3` step 2; read-only to the implementing session). No
// implementation of the port was read, because none exists in this tree — `device-store.ts:33`
// still does `import Database from "better-sqlite3"` at module scope, which is the whole reason
// this work exists.
//
// THE SPEC SENTENCE, verbatim (`18 §4`, "Domain & data layer"):
//
//   > **Device DB:** SQLite, WAL mode, foreign keys on. **Electron: `better-sqlite3`; RN:
//   > `@op-engineering/op-sqlite`.** Apps NEVER run SQL directly — all device data access goes
//   > through **`sync-client`'s storage adapter** and query API (§7).
//
// One sentence names two engines and one adapter. A package that can only be loaded by one of
// them is not implementing it. `18 §8` adds *"Storage: `op-sqlite` via `sync-client` only"*, and
// `18 §14` already allowlists `@op-engineering/op-sqlite` — so nothing here needs an `18 §15`
// dependency process and nothing here needs a founder ruling. It is the implementation catching
// up with its own handbook.
//
// ── WHAT EACH SECTION OWNS ─────────────────────────────────────────────────────────────────────
//
//   §A  The port EXISTS and `device-store.ts` no longer drags a native addon behind it. Structural
//       and comment-blind, over the real transitive import graph. **This is the assertion that
//       decides whether `apps/manager` can open a store at all** — everything else in this file is
//       true today of a package React Native cannot load.
//   §B  The Node driver satisfies the whole `storage-contract.ts` contract, INCLUDING running the
//       real `openStore` over it. Behavioural, on a real filesystem.
//   §C  `nativeBinding` still reaches `better-sqlite3`. The existing Electron hosts pass it and
//       nothing has ever asserted it arrives; a refactor that quietly drops it puts the Node ABI
//       addon in front of Electron and the till stops booting.
//   §D  **A STUB IS A SUPPLY.** The contract is run against a driver that type-checks perfectly
//       and does nothing, and the kills are asserted BY NAME — with the two checks it SURVIVES
//       named too, because those two are the shape of every vacuous test ever written here.
//   §E  The seam: the shipped Node hosts still open a real database with the Electron-ABI binding.
//
// ── WHAT THIS SUITE CAN AND CANNOT SEE ─────────────────────────────────────────────────────────
//
// CAN: everything a Node process can — real SQLite, real files, real transactions, the real
// `openStore`, and the real static module graph of `packages/sync-client`.
// CANNOT: a phone. Nothing here runs under Hermes, nothing here loads `@op-engineering/op-sqlite`,
// and no assertion in this file would notice if the RN half were broken. That half is
// `storage-op-sqlite.test.ts`, and it has its own, larger, honesty note.
//
// THE NEGATIVE CONTROL for "the existing hosts are unchanged" is not in this file and cannot be:
// it is the 582 `sync-client` and 574 `pos-electron` tests that already drive `openStore`. If the
// port lands and those stay green, behaviour is preserved; if this file were the only evidence,
// it would be proving a refactor correct with the refactor's own tests.
//
// ── THE MUTATION MATRIX (round-3 law), measured against a trial implementation that took these ──
// ── two files to 52/52, then reverted (`git status` clean, `shasum` identical to HEAD) ──────────
//
//   M1  `device-store.ts` re-imports `better-sqlite3` at module scope ......... 2 killed
//   M2  the Node driver's `transaction` is a pass-through (no BEGIN/COMMIT) ... 2 killed
//   M3  the Node driver ignores `nativeBinding` .............................. 1 killed  (§C)
//   M4  the Node driver's `pragma` always returns `[]` ....................... 2 killed
//   M5  the op-sqlite driver splits its script on a bare `;` ................ 13 killed
//   M6  op-sqlite nests transactions as plain BEGIN, not SAVEPOINT ........... 3 killed
//   M7  op-sqlite `get()` returns `null` rather than `undefined` ............. 1 killed
//   M8  `package.json` drops the `./rn` subpath .............................. 1 killed
//   M16 one call routed through op-sqlite's ASYNC member, behaviour identical . 1 killed
//   M17 the RN door stops opening op-sqlite .................................. 1 killed
//   NC  NEGATIVE CONTROL — a pure refactor of the op-sqlite adapter .......... 0 killed ✓
//
// M16 is the one to read: it changes NO observable behaviour of the contract and is caught by
// exactly one assertion, which is what attribution means. `NC` reddening would have meant this
// suite pins shape rather than behaviour.

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createNodeStorageAdapter,
  openStore,
  type StorageAdapter,
  type StorageStatement,
} from "../index.js";
import { type AdapterHarness, STORAGE_CONTRACT, tempDir } from "./storage-contract.js";

// ── the Node harness ───────────────────────────────────────────────────────────────────────────

/** One durable database on a real filesystem, reopenable, with every handle tracked. */
const nodeHarness = (): AdapterHarness => {
  const dir = tempDir("restos-storage-node-");
  const path = join(dir, "device.db");
  const opened: StorageAdapter[] = [];
  return {
    open: () => {
      const adapter = createNodeStorageAdapter({ path });
      opened.push(adapter);
      return adapter;
    },
    dispose: () => {
      for (const adapter of opened) {
        try {
          adapter.close();
        } catch {
          // already closed by a check; nothing to do
        }
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE PORT EXISTS, AND `device-store.ts` NO LONGER PULLS A NATIVE ADDON
// ───────────────────────────────────────────────────────────────────────────────────────────────

const SRC_DIR = new URL("../", import.meta.url);

/**
 * Comments stripped before anything is concluded from a search.
 *
 * AGENTS.md pays for this three times: *"A MENTION IS NOT A USE … Strip comments before
 * concluding from a search."* `device-store.ts`'s header will almost certainly go on NAMING
 * `better-sqlite3` in prose after the import is gone — as it should — and a grep that counted
 * that would report the work undone.
 */
const stripComments = (code: string): string => {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < code.length) {
    const ch = code[i] as string;
    const next = code[i + 1];
    if (quote !== null) {
      out += ch;
      if (ch === "\\") {
        out += code[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
};

/** Every module specifier this file imports, statically or dynamically. */
/**
 * Every module specifier this file actually PULLS AT RUNTIME.
 *
 * `import type { … } from "x"` and `export type { … } from "x"` are erased by the bundler and are
 * therefore NOT edges — which is not a detail here, it is the mechanism `apps/manager` already
 * depends on: `alarms.ts` reaches `KitchenQueueRow` from `@restos/sync-client/fold-engine` under a
 * comment reading *"TYPE-only, and it must stay type-only"*. A walk that counted type imports
 * would report the RN app pulling `better-sqlite3` for naming a type, which is the false positive
 * that gets a correct implementation rejected.
 *
 * Conservative in the other direction, and stated: Babel also erases a plain `import { X }` whose
 * specifiers are only used as types, so a file that writes one is reported as an edge here when
 * Metro would drop it. The repo's Biome `recommended` preset writes `import type` for those, so
 * the two agree in practice; if that ever changes, this is the line to revisit.
 */
const specifiersOf = (code: string): string[] => {
  const body = stripComments(code);
  const found: string[] = [];
  const patterns = [
    /(?:^|[\s;}])(?:import|export)\s+(?!type\s)[^;]*?\sfrom\s*["']([^"']+)["']/g,
    /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of body.matchAll(pattern)) found.push(match[1] as string);
  }
  return found;
};

/**
 * The transitive import graph of one module INSIDE this package, plus every bare specifier it
 * reaches. Relative `./x.js` names `x.ts` on disk — the repo's own convention (see
 * `apps/manager/metro.config.js`, which exists because Metro does not perform that mapping).
 */
const graphFrom = (entry: string): { files: Set<string>; bare: Set<string> } => {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.pop() as string;
    if (files.has(rel)) continue;
    files.add(rel);
    const url = new URL(rel, SRC_DIR);
    if (!existsSync(url)) throw new Error(`24-F14: module ${rel} does not exist — walk is vacuous`);
    for (const specifier of specifiersOf(readFileSync(url, "utf8"))) {
      if (!specifier.startsWith(".")) {
        bare.add(specifier);
        continue;
      }
      const target = new URL(specifier, url);
      const asTs = target.pathname.replace(/\.js$/, ".ts");
      const relative = asTs.slice(SRC_DIR.pathname.length);
      queue.push(relative);
    }
  }
  return { files, bare };
};

describe("§A 18 §4 — the storage adapter is a PORT, and the native addon is behind a driver", () => {
  it("is actually reading the files it guards (24-F14: an empty match is a failure)", () => {
    const graph = graphFrom("device-store.ts");
    // Anchored on things that have nothing to do with this work, so a walk that resolved nothing
    // cannot report clean. `device-store.ts` reaches the folds and the domain registry or the
    // walker is broken.
    expect(graph.files.size).toBeGreaterThan(5);
    expect(graph.files.has("folds/merge.ts")).toBe(true);
    expect(graph.bare.has("@restos/domain")).toBe(true);
  });

  it("device-store.ts reaches NO native or Node-only module, transitively", () => {
    // The measured blocker, from `apps/manager/CLAUDE.md`: "openStore constructs better-sqlite3
    // directly (device-store.ts:33), which cannot load under Hermes". `18 §4` names ONE adapter
    // for two engines; a store module that binds one engine cannot serve the other.
    //
    // `node:*` is included because it fails the same way and for the same reason — Hermes has no
    // `node:net` either, which is what keeps `transport-ws.ts` off this device (a SEPARATE gap,
    // reported in this session's findings and deliberately not conflated with this one).
    const { bare } = graphFrom("device-store.ts");
    expect([...bare].filter((s) => s === "better-sqlite3")).toEqual([]);
    expect([...bare].filter((s) => s.startsWith("node:"))).toEqual([]);
    expect([...bare].filter((s) => s === "ws")).toEqual([]);
  });

  it("the Node driver is the ONE place better-sqlite3 is constructed", () => {
    // `18 §4`'s "Electron: better-sqlite3" has to live somewhere; the property is that it lives in
    // exactly one module, so a second host cannot acquire it by accident. Comment-blind: the
    // header of `device-store.ts` should go on explaining the addon in prose.
    const driver = graphFrom("storage-node.ts");
    expect(driver.bare.has("better-sqlite3")).toBe(true);

    const sources = ["device-store.ts", "catalog.ts", "staff.ts", "pin-attempts.ts", "index.ts"];
    for (const file of sources) {
      const code = stripComments(readFileSync(new URL(file, SRC_DIR), "utf8"));
      expect(`${file}: ${code.includes("better-sqlite3")}`).toBe(`${file}: false`);
    }
  });

  it("the port is a TYPE the store depends on, not a class the store constructs", () => {
    // A compile-time assertion, and the only one this file makes: `openStore` accepts an adapter
    // built elsewhere. If this stops type-checking the port has been narrowed to one engine again.
    const accepts = (adapter: StorageAdapter): StorageStatement<[string], { x: string }> =>
      adapter.prepare<[string], { x: string }>("SELECT ? AS x");
    expect(typeof accepts).toBe("function");
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE NODE DRIVER SATISFIES THE CONTRACT
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B the Node driver (better-sqlite3) — the whole 18 §4 contract, on a real disk", () => {
  it.each(STORAGE_CONTRACT.map((check) => [check.name, check] as const))("%s", (_name, check) => {
    const harness = nodeHarness();
    try {
      check.run(harness);
    } finally {
      harness.dispose();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — `nativeBinding` STILL REACHES better-sqlite3 (the Electron hosts depend on it)
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§C the existing hosts are unchanged — nativeBinding is not silently dropped", () => {
  it("a nativeBinding that does not exist FAILS, so the option is provably not ignored", () => {
    // The attribution assertion. `openStore`'s own comment says one checkout serves two V8 ABIs
    // and the Electron main process "passes the path to its own ABI-matched binary instead"; if a
    // refactor accepts the option and forgets to forward it, every suite here stays green and the
    // till loads the Node addon under Electron. A bad path must be LOUD.
    const dir = tempDir("restos-storage-binding-");
    try {
      expect(() =>
        createNodeStorageAdapter({
          path: join(dir, "device.db"),
          nativeBinding: join(dir, "no-such-better_sqlite3.node"),
        }),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("omitting nativeBinding uses the default build, which is what every Node host wants", () => {
    // The control for the test above: without it, a driver that threw unconditionally would pass.
    const dir = tempDir("restos-storage-default-");
    try {
      const adapter = createNodeStorageAdapter({ path: join(dir, "device.db") });
      adapter.exec("CREATE TABLE t (id TEXT PRIMARY KEY) STRICT;");
      adapter.prepare<[string]>("INSERT INTO t (id) VALUES (?)").run("x");
      expect(adapter.prepare<[], { id: string }>("SELECT id FROM t").all()).toEqual([{ id: "x" }]);
      adapter.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("openStore leaves a WAL database on disk — 18 §4's mode, observed as a FILE", () => {
    // `18 §4`: "SQLite, **WAL mode**". A `-wal` sidecar is what WAL looks like from outside the
    // process, and it is the one form of this assertion a driver cannot satisfy by reporting.
    const dir = tempDir("restos-storage-wal-");
    try {
      const path = join(dir, "device.db");
      const store = openStore({
        adapter: createNodeStorageAdapter({ path }),
        identity: {
          org_id: "00000000-0000-7000-8000-000000000001",
          branch_id: "00000000-0000-7000-8000-000000000002",
          device_id: "00000000-0000-7000-8000-000000000003",
        },
      });
      expect(existsSync(`${path}-wal`)).toBe(true);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §D — A STUB IS A SUPPLY. The contract must KILL a driver that does nothing.
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A driver that type-checks perfectly and stores nothing.
 *
 * This is the exact shape AGENTS.md measured on the publish adapter — *"replace the real gateway
 * publisher with the in-memory stub and `pnpm verify` is exit 0, `seams:check` is clean … and the
 * product ships no menu to any till"*. `seams:check` Rule B asks whether an optional member is
 * SUPPLIED, never whether what was supplied is REAL. Nothing but a running contract can tell.
 */
const inertAdapter = (): StorageAdapter => ({
  prepare: <_Params, Row>() => ({
    run: () => {},
    get: () => undefined,
    // The cast is the point: an empty array satisfies `Row[]` for every Row, which is why a
    // do-nothing driver type-checks against a correct port.
    all: () => [] as Row[],
  }),
  exec: () => {},
  pragma: () => [],
  transaction: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  close: () => {},
});

const inertHarness = (): AdapterHarness => ({
  open: () => inertAdapter(),
  dispose: () => {},
});

/**
 * The two checks a do-nothing driver SURVIVES, named exactly.
 *
 * Both are NEGATIVE assertions — "nothing matched", "nothing was committed" — and a driver that
 * never stores anything satisfies every negative assertion in existence. This is the round-3 law
 * in miniature: the mechanism is correct and simply is not aimed at the dangerous case. They are
 * kept because each is a real contract clause (`device-store.ts` reads `row?.x ?? fallback` in
 * five places, and `01-F1` needs the rollback), and they are LISTED because a suite whose
 * survivors are unrecorded is a suite nobody has mutated.
 */
const STUB_SURVIVORS = [
  "get returns undefined when nothing matches, and all returns an empty array",
  "transaction rolls the whole body back when the body throws, and rethrows",
] as const;

describe("§D the anti-stub guard — the contract kills a driver that merely type-checks", () => {
  it.each(STORAGE_CONTRACT.map((check) => [check.name, check] as const))(
    "kills the inert driver: %s",
    (name, check) => {
      const survives = (STUB_SURVIVORS as readonly string[]).includes(name);
      let threw = false;
      try {
        check.run(inertHarness());
      } catch {
        threw = true;
      }
      // Asserted as `name: verdict` so a failure names the check rather than printing `false`.
      expect(`${name} => ${threw ? "killed" : "survived"}`).toBe(
        `${name} => ${survives ? "survived" : "killed"}`,
      );
    },
  );

  it("the survivor list is a MEASUREMENT and stays small", () => {
    // If this number grows, the contract has lost teeth and somebody should be told which two
    // clauses are now vacuous. `24-F14`: an empty contract would pass every assertion above.
    expect(STORAGE_CONTRACT.length).toBeGreaterThanOrEqual(12);
    expect(STUB_SURVIVORS.length).toBe(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §E — THE SEAM: the shipped Node hosts still open a REAL database, with the Electron ABI addon
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Read as SOURCE and not imported, deliberately: `packages/sync-client` is the kernel and must not
 * take a dependency on an app. `check-seams.mjs` reads the whole repo the same way, for the same
 * reason. What is asserted is only that the two Electron hosts still name the ABI-matched binary
 * where they open their store — NOT the call's shape, because whether `openStore` keeps a `path`
 * arm or takes a constructed adapter is the implementer's call and both are correct.
 */
const hostSource = (app: string): string => {
  const url = new URL(`../../../../apps/${app}/src/main/index.ts`, import.meta.url);
  const code = readFileSync(url, "utf8");
  expect(code.length).toBeGreaterThan(2_000); // 24-F14: reading the wrong file reads clean
  return stripComments(code);
};

describe("§E the Electron hosts keep their ABI-matched binding (00 §5.7, openStore's own note)", () => {
  it.each(["pos-electron", "pass-kds"])("%s still supplies electronAddonPath()", (app) => {
    const code = hostSource(app);
    expect(code).toContain("openStore({");
    expect(code).toContain("nativeBinding:");
    expect(code).toContain("electronAddonPath()");
  });

  it("neither Electron host reaches for the RN driver", () => {
    // `18 §4` names one engine per platform. An Electron main process that opened op-sqlite would
    // be a different defect with the same symptom (a store that will not open), and it is the
    // mistake a session copying the manager's wiring would make.
    for (const app of ["pos-electron", "pass-kds"]) {
      expect(`${app}: ${hostSource(app).includes("op-sqlite")}`).toBe(`${app}: false`);
    }
  });
});
