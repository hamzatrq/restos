// ACCEPTANCE TESTS — one machine, two RestOS apps, and the two ways they silently become ONE
// device: a shared store file, and a shared dev-seed `device_id`.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The session that wrote this file wrote no
// production code for the behaviour it describes and is disqualified from implementing it. The
// assertions are expected to be RED on the tree they were written against; that is the point.
//
// It lives in `apps/pass-kds` because this app is the one that silently becomes the other, and
// because the repo-wide walk beside it (`shared-config-extraction.test.ts`) established the
// precedent for a cross-app assertion living here: reading another app's FILE is not importing it,
// so `18 §2`'s "apps NEVER import other apps" — which that suite asserts over test trees too — is
// untouched. Nothing here imports from `apps/`.
//
// ── THE AUTHORITIES, quoted so an assertion can be argued with ─────────────────────────────────
//
//   01-F2   "Every device persists events locally (SQLite, WAL) before acknowledging the action to
//           the UI."  — every DEVICE, singular. `packages/sync-client/src/device-store.ts` states
//           the same reading in its append guard: "one device, one store; nothing persisted".
//
//   01-F8   "Push: a device uploads its own events in `lamport_seq` order; the server acks the
//           high-water mark."  — the outbox is the device's, keyed by its identity.
//
//   01-F13  the branch star, "ties broken by lowest device id", and the cloud "tracks lamport
//           contiguity per origin device". Two processes answering to one `device_id` are one
//           origin with two lamport sequences interleaved, which no consumer of either can repair.
//
//   01-F1   corrections are new events; there is no delete. So every harm below is PERMANENT once
//           the outbox has drained.
//
//   00 §5.7 a device says what it is using and which of its facts were TOLD rather than assumed —
//           the law `device-identity.ts` already cites for its boot line, and the reason a refusal
//           has to name the key that is missing.
//
// ── THE TWO DEFECTS, as measured ───────────────────────────────────────────────────────────────
//
// (1) **ONE FILE, TWO APPS.** `apps/pos-electron` and `apps/pass-kds` both open
//     `join(app.getPath("userData"), "device.db")`, and neither sets an app name, so both resolve
//     to `~/.config/Electron/device.db`. Two processes with DIFFERENT `device_id`s against that one
//     file merged into one event table and each store returned the other's events as its own, with
//     no error.
//
// (2) **ONE SEED, TWO DEVICES.** `resolveDeviceIdentity` falls back to `DEV_IDENTITY` PER KEY, so
//     the pass screen launched without `RESTOS_DEVICE_ID` silently IS the counter. `apps/manager`
//     already met this and wrote it down: "an unconfigured phone would silently adopt the
//     COUNTER's `device_id`, and two devices pushing under one origin fork one outbox into a
//     ledger `01-F1` cannot unwind."
//
// ── THE MEASUREMENT §A's DEFAULT RESTS ON, run rather than assumed ─────────────────────────────
//
// Electron 43.2.0 on this repo's own binary, launched the way both apps' `start` script launches
// them (`electron out/main/index.js`), printing `app.getName()` and `app.getPath("userData")`:
//
//   • no package.json anywhere            → name `Electron`, userData `~/.config/Electron`
//   • package.json at the app ROOT with
//     `name` AND `productName`            → name `Electron`, userData `~/.config/Electron`
//   • package.json BESIDE the script      → name `Electron`, userData `~/.config/Electron`
//   • `app.setName("RestOS Counter")`     → name `RestOS Counter`, userData `~/.config/RestOS Counter`
//
// So a `productName` in `package.json` is NOT a fix at the launch path this repo ships: Electron
// resolves the app path to the SCRIPT'S DIRECTORY (`out/main`) and reads no manifest of ours. That
// is why §A's default app name is the literal `Electron` for every host that does not call
// `app.setName`, and why an implementer who "fixes" this in `package.json` alone will still be
// red here — correctly, because the two processes would still share one directory.
//
// ── WHAT IS DELIBERATELY NOT ASSERTED, and the readings that are PINNED ────────────────────────
//
// **No fix is named.** §A compares the (userData key, file) pairs each host derives and requires
// them to be disjoint. A distinct `app.setName`, a distinct `app.setPath("userData", …)` and a
// distinct filename each satisfy it; the suite has no opinion between them.
//
// **The store's own defence is a different file.** `packages/sync-client/src/__acceptance__/
// store-identity-binding.test.ts` asserts that a device database refuses a foreign identity. The
// two are not redundant: this one keeps two apps out of one file, that one holds when a host gets
// the path wrong anyway (a hand-typed `--user-data-dir`, a restored backup, a copied VM image).
//
// **PINNED READING (a): the refusal for an absent key belongs in `@restos/device-config`, not in
// this app.** `apps/manager/src/branch.ts` hand-rolls the same check today, so a second consumer
// exists and `DEC-ARCH-001` rules extract at that moment — "a second local helper is a second
// interpretation … and the two diverge silently". The simpler alternative, named as `24 §3b`
// requires: let each host check its own environment, as the manager does. It is refused because
// the property is one sentence of `01-F8` and three hosts would then hold three copies of it.
//
// **PINNED READING (b): the strict resolution must be reachable by the ENVIRONMENT ALONE — a
// separate exported entry point, not a second argument to the seed-permitting one.** An options
// flag leaves the seed one keystroke away under the SAME name, which is how `01-F60`'s enabled
// set came to be declared twice, and it cannot be grepped for at a call site. §B's seam assertion
// needs a name it can find in the host.
//
// **NOT asserted: that the counter must also refuse.** `device-identity.ts` argues the seed is the
// counter's own, and `pnpm start` with no environment is the counter's documented dev launch. The
// property here is only that a SECOND host may not silently take it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import * as deviceConfig from "@restos/device-config";
// BOTH published entry points, because either is a legitimate home for the new resolution and a
// suite that watched only one would go red against a correct implementation that used the other.
// `apps/manager` already reaches the identity module by its subpath; this app reaches the barrel.
import * as deviceIdentityEntry from "@restos/device-config/device-identity";
import { describe, expect, it } from "vitest";

const APP_DIR = resolve(import.meta.dirname, "..", "..", "..");
const REPO_ROOT = resolve(APP_DIR, "..", "..");
const APPS_ROOT = join(REPO_ROOT, "apps");

const exists = (path: string): boolean => {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
};

const read = (path: string): string => readFileSync(path, "utf8");

/**
 * Comments stripped before anything is counted — the same instrument, and the same reason, as
 * `shared-config-extraction.test.ts`: both hosts carry long block comments naming `device.db`,
 * `RESTOS_DEVICE_ID` and each other, and after a correct fix those comments will say the collision
 * is GONE, which a raw substring search would read as the collision still being there.
 * `[^:]` guards the `//` inside a URL.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const squash = (raw: string): string => raw.replace(/\s+/g, " ").trim();

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Host discovery: every Electron main process in this repo that puts a file under `userData`.
// Discovered rather than listed, so a third till app is measured the day it lands (the property
// `01-F2` states is about DEVICES, not about these two).
// ───────────────────────────────────────────────────────────────────────────────────────────────

type Host = { app: string; file: string; src: string };

const hosts = (): Host[] =>
  readdirSync(APPS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ app: entry.name, file: join(APPS_ROOT, entry.name, "src/main/index.ts") }))
    .filter((candidate) => exists(candidate.file))
    .map((candidate) => ({ ...candidate, src: stripComments(read(candidate.file)) }))
    .filter((candidate) => candidate.src.includes('app.getPath("userData")'));

const USER_DATA_JOIN = /join\(\s*app\.getPath\(\s*"userData"\s*\)\s*,([^)]+)\)/g;

/**
 * The directory key: what `app.getPath("userData")` will actually be. `setPath` wins over
 * `setName`; with neither, it is Electron's own default — see the measurement in the header.
 */
const userDataKeyOf = (host: Host): string => {
  const override = /app\.setPath\(\s*"userData"\s*,([\s\S]*?)\)\s*;/.exec(host.src);
  if (override?.[1] !== undefined) return `setPath:${squash(override[1])}`;
  const named = /app\.setName\(([^)]*)\)/.exec(host.src);
  if (named?.[1] === undefined) return "name:Electron";
  const arg = squash(named[1]);
  const literal = /^"([^"]*)"$|^'([^']*)'$/.exec(arg);
  if (literal !== null) return `name:${literal[1] ?? literal[2] ?? ""}`;
  // A constant rather than a literal. Resolve it where it is DECLARED, so that two hosts naming
  // one shared constant collide (they would, at runtime) while two hosts naming their own differ.
  const declared = new RegExp(`\\b(?:const|let|var)\\s+${arg}\\s*=\\s*["']([^"']+)["']`).exec(
    host.src,
  );
  if (declared?.[1] !== undefined) return `name:${declared[1]}`;
  const imported = new RegExp(
    `import\\s*\\{[^}]*\\b${arg}\\b[^}]*\\}\\s*from\\s*["']([^"']+)["']`,
  ).exec(host.src)?.[1];
  if (imported !== undefined) return `name:${imported}#${arg}`;
  // Unmeasurable rather than assumed to be safe: an app name this walk cannot resolve is one a
  // reader cannot resolve either. Round-2 pattern 2 — a guard must never pass by not looking.
  return `name:UNRESOLVED(${host.app}:${arg})`;
};

/** Every file this host puts under `userData`, as `<directory key>::<join arguments>`. */
const storeKeysOf = (host: Host): string[] => {
  const dir = userDataKeyOf(host);
  return [...host.src.matchAll(USER_DATA_JOIN)].map((m) => `${dir}::${squash(String(m[1]))}`);
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — TWO APPS, TWO FILES.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F2 — no two RestOS apps may write one device database", () => {
  it("is actually reading the hosts it guards", () => {
    // ROUND-2 PATTERN 2, "the guard passed by not looking": a walk that discovered nothing would
    // report a clean sweep. Anchored on facts that have nothing to do with this work.
    const found = hosts();
    expect(
      found.map((h) => h.app).sort(),
      "fewer than two Electron hosts were discovered — the walk, not the product, is broken",
    ).toEqual(expect.arrayContaining(["pass-kds", "pos-electron"]));
    for (const host of found) {
      expect(host.src, `${host.app} does not open a store`).toContain("openStore({");
      expect(host.src.length, `${host.app}'s main is suspiciously short`).toBeGreaterThan(5_000);
      expect(
        storeKeysOf(host).length,
        `${host.app} puts nothing under userData — 24-F14 EMPTY MATCH, this walk has gone blind`,
      ).toBeGreaterThan(0);
    }
  });

  it("01-F2/01-F8: every host's userData file set is disjoint from every other host's", () => {
    const found = hosts();
    const collisions: string[] = [];
    for (let i = 0; i < found.length; i += 1) {
      for (let j = i + 1; j < found.length; j += 1) {
        const a = found[i] as Host;
        const b = found[j] as Host;
        const shared = storeKeysOf(a).filter((key) => storeKeysOf(b).includes(key));
        for (const key of shared) collisions.push(`${a.app} + ${b.app} → ${key}`);
      }
    }
    expect(
      collisions,
      "two apps resolve to ONE file. Measured on this repo's own Electron: with no `app.setName` " +
        "both processes get ~/.config/Electron, so a shared filename is a shared FILE. Two " +
        "device_ids in one `events` table interleave one lamport sequence between two origins " +
        "(01-F3), each store serves the other's events as its own, and both outboxes push them " +
        "upward (01-F8) into a log 01-F1 cannot unwind. Give the hosts different app names, " +
        "different userData paths or different filenames — this suite has no preference.",
    ).toEqual([]);
  });

  it("01-F2: this app's own store file is not the counter's", () => {
    // The pair the defect was measured on, named directly so a regression reads as itself rather
    // than as a row in a matrix.
    const found = hosts();
    const pass = found.find((h) => h.app === "pass-kds") as Host;
    const pos = found.find((h) => h.app === "pos-electron") as Host;
    expect(
      storeKeysOf(pass).filter((key) => storeKeysOf(pos).includes(key)),
      "the pass screen and the counter write the same file. On the shipped Linux launch that is " +
        "~/.config/Electron/device.db for both.",
    ).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — AN UNCONFIGURED HOST MUST NOT SILENTLY BE ANOTHER DEVICE.
//
// The strict resolver is DISCOVERED, not named: `shared-config-extraction.test.ts`'s rule, for the
// same reason — no ruling names one, and a suite that pinned a name would go red against a correct
// implementation that chose another. What is pinned is its BEHAVIOUR (see reading (b) above).
// ───────────────────────────────────────────────────────────────────────────────────────────────

const FULL_ENV = {
  RESTOS_ORG_ID: "org-x",
  RESTOS_BRANCH_ID: "branch-x",
  RESTOS_DEVICE_ID: "device-x",
};
const NO_DEVICE = { RESTOS_ORG_ID: "org-x", RESTOS_BRANCH_ID: "branch-x" };

type Resolver = (env: Record<string, string | undefined>) => unknown;

/**
 * `24-F14` empty-match protection, and it is not decoration: every assertion below runs INSIDE a
 * loop over the discovered resolvers, and a loop over an empty list is green. Without this line
 * three of the four tests in §B would report a clean sweep of a property nothing implements — the
 * vacuous-guard shape this repo's round-3 law exists to stop.
 */
const EMPTY_MATCH =
  "24-F14 EMPTY MATCH: no strict resolver was discovered, so every assertion in this test ran " +
  "zero times. See the first test in this block for what is missing.";

const callWithEnv = (
  fn: Resolver,
  env: Record<string, string | undefined>,
): { ok: true; value: unknown } | { ok: false; message: string } => {
  try {
    const value = fn(env);
    // A thenable candidate is rejected rather than awaited: nothing here may leave an unhandled
    // rejection behind, and an async resolver could not answer a synchronous boot anyway (01-F2).
    if (typeof (value as { then?: unknown } | null)?.then === "function") {
      void (value as Promise<unknown>).catch(() => undefined);
      return { ok: false, message: "async" };
    }
    return { ok: true, value };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
};

const isFullIdentity = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>).org_id === FULL_ENV.RESTOS_ORG_ID &&
  (value as Record<string, unknown>).branch_id === FULL_ENV.RESTOS_BRANCH_ID &&
  (value as Record<string, unknown>).device_id === FULL_ENV.RESTOS_DEVICE_ID;

/**
 * A strict resolver: it answers a fully configured environment with that environment's identity,
 * and REFUSES when the device key is absent. Both halves are required — the first is what stops a
 * function that throws unconditionally from qualifying, the second is the property itself.
 */
const strictResolvers = (): { name: string; fn: Resolver }[] =>
  Object.entries({
    ...(deviceIdentityEntry as Record<string, unknown>),
    ...(deviceConfig as Record<string, unknown>),
  })
    .filter(([, value]) => typeof value === "function")
    .map(([name, value]) => ({ name, fn: value as Resolver }))
    .filter((candidate) => {
      const full = callWithEnv(candidate.fn, FULL_ENV);
      if (!full.ok || !isFullIdentity(full.value)) return false;
      return !callWithEnv(candidate.fn, NO_DEVICE).ok;
    });

describe("§B 01-F8/01-F13 — a host that was not TOLD which device it is refuses to guess", () => {
  it("01-F8/01-F13: device-config exports a resolution that REFUSES an absent RESTOS_DEVICE_ID", () => {
    const found = strictResolvers();
    expect(
      found.map((r) => r.name),
      "no export of @restos/device-config both resolves a fully configured environment and " +
        "refuses one with RESTOS_DEVICE_ID absent. `resolveDeviceIdentity` falls back PER KEY, so " +
        "a second host launched without it silently becomes the seed device — the counter — and " +
        "two devices under one origin fork one outbox (01-F8) permanently (01-F1). This is the " +
        "same hazard apps/manager/src/branch.ts already refuses by hand; DEC-ARCH-001 says the " +
        "second consumer is when it is extracted, not copied.",
    ).not.toEqual([]);
  });

  it("01-F13: it refuses a BARE environment too — the unconfigured launch is the measured case", () => {
    // THE DANGEROUS CASE. A rule that only fires when org and branch ARE configured leaves
    // `pnpm -C apps/pass-kds start` with no environment at all — the launch its own guide
    // documents — resolving to the counter's `device_id`.
    expect(strictResolvers(), EMPTY_MATCH).not.toEqual([]);
    for (const { name, fn } of strictResolvers()) {
      const bare = callWithEnv(fn, {});
      expect(
        bare.ok,
        `${name} answered a completely unconfigured environment instead of refusing`,
      ).toBe(false);
      // ⚠ ANY of the three keys, and a CORRECT implementation is why. The first draft demanded
      // `RESTOS_DEVICE_ID` here; a resolver that refuses on the first missing key in declaration
      // order answers a bare environment with `RESTOS_ORG_ID is not set` — right, useful, and red
      // against that draft. Measured against an implementation out of tree, which is the only
      // thing that finds a test a correct implementation cannot pass. The device-key-specific
      // message is asserted below, on the environment where the device key is the ONLY one absent.
      expect(
        Object.values(deviceConfig.IDENTITY_ENV).some((key) =>
          (bare.ok ? "" : bare.message).includes(key),
        ),
        `${name}'s refusal names none of ${Object.values(deviceConfig.IDENTITY_ENV).join(", ")}. ` +
          "00 §5.7: an operator meeting this must be told what to set.",
      ).toBe(true);
    }
  });

  it("01-F8/01-F13: with org and branch configured, an absent device key is refused BY NAME", () => {
    // The realistic operator error and the one this file exists for: a host told which deployment
    // it serves and never told which device it is. Naming the key is the difference between a
    // device that starts on someone else's identity and one an operator can fix in ten seconds.
    expect(strictResolvers(), EMPTY_MATCH).not.toEqual([]);
    for (const { name, fn } of strictResolvers()) {
      const got = callWithEnv(fn, NO_DEVICE);
      expect(got.ok, `${name} resolved an identity with no device key`).toBe(false);
      expect(
        got.ok ? "" : got.message,
        `${name}'s refusal does not name the key that is missing`,
      ).toContain(deviceConfig.IDENTITY_ENV.device_id);
    }
  });

  it("01-F1/01-F8: the refusal never falls back to the seed on any partial environment", () => {
    // The direction matters more than the message: falling back is the silent failure, and a
    // resolver that "refused" by returning the seed with a warning would pass a throw-shaped test
    // written less carefully.
    expect(strictResolvers(), EMPTY_MATCH).not.toEqual([]);
    for (const { name, fn } of strictResolvers()) {
      for (const env of [
        {},
        NO_DEVICE,
        { RESTOS_ORG_ID: "org-x" },
        { RESTOS_DEVICE_TOKEN: "eyJ..." },
      ]) {
        const got = callWithEnv(fn, env);
        expect(
          got.ok && (got.value as { device_id?: unknown }).device_id,
          `${name} returned the DEV SEED device_id for ${JSON.stringify(env)} — the identity of ` +
            "another device on this machine",
        ).not.toBe(deviceConfig.DEV_IDENTITY.device_id);
      }
    }
  });

  it("01-F8: a present-but-unusable value refuses in the house shape, and no shape is imposed", () => {
    // Matching `resolveDeviceIdentity`'s existing refusal: blank and padded values are refused
    // naming the key, and a non-UUID is NOT — `provision-device` takes any non-empty string and
    // `kernel.device_registry` stores `text`, so a device stricter than the registry that admits
    // it would refuse credentials that work.
    expect(strictResolvers(), EMPTY_MATCH).not.toEqual([]);
    for (const { name, fn } of strictResolvers()) {
      for (const raw of ["", "   ", " device-x", "device-x\n"]) {
        const got = callWithEnv(fn, { ...FULL_ENV, RESTOS_DEVICE_ID: raw });
        expect(got.ok, `${name} accepted ${JSON.stringify(raw)} as a device_id`).toBe(false);
        expect(got.ok ? "" : got.message, `${name}'s refusal does not name the key`).toContain(
          deviceConfig.IDENTITY_ENV.device_id,
        );
      }
      const plain = callWithEnv(fn, { ...FULL_ENV, RESTOS_DEVICE_ID: "till-b" });
      expect(
        plain.ok && (plain.value as { device_id?: unknown }).device_id,
        `${name} refused a non-UUID device_id that provision-device would mint a token for`,
      ).toBe("till-b");
    }
  });

  it("01-F2/01-F13: THE SEAM — this app's host opens its store through the strict resolution", () => {
    // A resolver nothing calls is this wave's named defect one argument along. `main/index.ts`
    // builds an Electron app at module scope and cannot be imported by any suite here, so this is
    // a source read — the same weak instrument, and the same reason, as
    // `pos-electron`'s `device-identity-seam.test.ts` §C.
    const found = strictResolvers();
    const src = stripComments(read(join(APP_DIR, "src/main/index.ts")));
    expect(src, "reading the wrong file").toContain("openStore({");
    expect(src, "reading the wrong file").toContain("app.whenReady()");
    expect(
      found.some((r) => new RegExp(`\\b${r.name}\\s*\\(`).test(src)),
      `apps/pass-kds's host calls none of the strict resolutions (${found.map((r) => r.name).join(", ") || "none exist"}). ` +
        "The identity it opens its store with is the one that decides whose outbox this is.",
    ).toBe(true);
    expect(
      found.some((r) => r.name === "resolveDeviceIdentity") ||
        !/\bresolveDeviceIdentity\s*\(/.test(src),
      "the host still reaches the seed-permitting resolveDeviceIdentity. Reading (b): the strict " +
        "entry point exists so that the seed is not one keystroke away at this call site.",
    ).toBe(true);
  });
});
