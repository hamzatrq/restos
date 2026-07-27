// ORACLE ACCEPTANCE TESTS — the contracts that must hold at COMPILE time.
//
// PROVENANCE: oracle session (24 §3 step 2).
//
// `packages/ui/CLAUDE.md` states the rule this package exists to hold: "A component that can
// be configured into violating a law is not a closed vocabulary." That is a claim about the
// TYPE SURFACE, so it can only be checked by a type-checker. Every test here writes a fixture
// and runs the repo's own `tsc` over it, asserting that the compiler does — or does not —
// reject it.
//
// WHY A SUBPROCESS. TypeScript 7 is the native port: the legacy `ts.createProgram` JS API is
// gone and `typescript/unstable/sync` exposes no usable program handle. Shelling out to the
// same `tsc` binary CI runs is both the most robust option and the most honest one — the
// question being asked is literally "does the build reject this".

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const UI_ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const REPO_ROOT = join(UI_ROOT, "..", "..");
// Kept inside the package so node_modules resolution works, and OUTSIDE `src` so the root
// tsconfig's `packages/*/src` include never picks the fixtures up during `pnpm verify`.
const TMP = join(UI_ROOT, ".oracle-typecheck");
const TSC = join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

/**
 * Typecheck a fixture against the REAL package sources and return tsc's diagnostics.
 * An empty string means the compiler accepted the fixture.
 */
const typecheck = (name: string, code: string): string => {
  const dir = join(TMP, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "fixture.ts"), code);
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: join(REPO_ROOT, "packages", "config", "tsconfig.base.json"),
      compilerOptions: {
        jsx: "react-jsx",
        types: [],
        paths: {
          "@restos/ui": [join(UI_ROOT, "src", "index.ts")],
          "@restos/domain": [join(REPO_ROOT, "packages", "domain", "src", "index.ts")],
        },
      },
      include: ["fixture.ts"],
    }),
  );
  try {
    execFileSync(process.execPath, [TSC, "--noEmit", "-p", join(dir, "tsconfig.json")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "";
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
};

/** Only fixture errors count — a broken harness must not read as a passing contract. */
const rejects = (name: string, code: string): boolean =>
  typecheck(name, code).includes("fixture.ts");

describe("F5 / 00 §6 — MoneyValue takes BRANDED paisa, so the `as` cast can die", () => {
  // `packages/ui/CLAUDE.md`: "MoneyValue takes integer paisa, never a formatted string and
  // never a signed amount — money has no sign here". Today `MoneyValueProps.paisa` is a plain
  // `number` and `formatPaisa` launders it through
  // `value as Parameters<typeof rupeesFromPaisa>[0]`. The documented contract is therefore
  // enforced only by a RUNTIME throw inside `domain` — and a RangeError during render takes
  // the cart down, which is the one thing 01-F17 says must never happen to a sale.

  it("rejects a raw number where paisa is required", () => {
    const rejected = rejects(
      "money-raw-number",
      `import type { MoneyValue } from "@restos/ui";
       type P = Parameters<typeof MoneyValue>[0];
       const total: number = 12345;
       export const bad: P["paisa"] = total;`,
    );
    expect(rejected, "a plain number is accepted as paisa — the brand is not enforced").toBe(true);
  });

  it("rejects a negative literal, because money has no sign here", () => {
    expect(
      rejects(
        "money-negative",
        `import type { MoneyValue } from "@restos/ui";
         type P = Parameters<typeof MoneyValue>[0];
         export const bad: P["paisa"] = -500;`,
      ),
    ).toBe(true);
  });

  it("accepts a value constructed through domain's `paisa()`", () => {
    const out = typecheck(
      "money-branded-ok",
      `import type { MoneyValue } from "@restos/ui";
       import { paisa } from "@restos/domain";
       type P = Parameters<typeof MoneyValue>[0];
       export const good: P["paisa"] = paisa(12345);`,
    );
    expect(out, "the sanctioned constructor must still typecheck").toBe("");
  });

  it("sources direction from `directedPaisa`, not from a loose string", () => {
    // Post money-round, `domain` exports `directedPaisa(value) -> { magnitudePaisa, sign }`.
    // A screen that renders a variance must take the sign from there rather than the caller
    // deciding a word, or the display edge starts writing `residual < 0 ? ... : ...` again.
    const out = typecheck(
      "money-direction",
      `import type { MoneyValue } from "@restos/ui";
       import { directedPaisa } from "@restos/domain";
       type P = Parameters<typeof MoneyValue>[0];
       const d = directedPaisa(-4200);
       export const amount: P["paisa"] = d.magnitudePaisa;
       export const sign: -1 | 0 | 1 = d.sign;`,
    );
    expect(out, "MoneyValue must accept directedPaisa's magnitude directly").toBe("");
  });

  it("no longer casts through the brand in MoneyValue's own source", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(join(UI_ROOT, "src", "components", "MoneyValue.tsx"), "utf8"),
    );
    expect(src).not.toMatch(/as\s+Parameters<typeof\s+rupeesFromPaisa>/);
  });
});

describe("F9 / 27-F8 — `floor` is a floor, not a design posture", () => {
  // 27-F8 lists "absolute floor, anything - 48 dp" as a FLOOR, not as a posture anyone should
  // design to. Today `Posture` puts it in the same union as counter/keypad/kitchen/handheld,
  // so `<ItemGrid posture="floor">` renders a 48 dp counter grid where 27-F8 requires 76 —
  // and `pageCapacity` validates that violation as correct, because it checks the tile
  // against whatever posture it was handed.

  it("rejects `floor` where a grid posture is required", () => {
    const rejected = rejects(
      "posture-floor-grid",
      `import type { ItemGrid } from "@restos/ui";
       type P = Parameters<typeof ItemGrid>[0];
       export const bad: P["posture"] = "floor";`,
    );
    expect(rejected, "`floor` is accepted as an ItemGrid posture").toBe(true);
  });

  it("rejects `floor` where a Tile posture is required", () => {
    expect(
      rejects(
        "posture-floor-tile",
        `import type { Tile } from "@restos/ui";
         type P = Parameters<typeof Tile>[0];
         export const bad: P["posture"] = "floor";`,
      ),
    ).toBe(true);
  });

  it("still accepts every real design posture", () => {
    const out = typecheck(
      "posture-designs-ok",
      `import type { ItemGrid } from "@restos/ui";
       type P = Parameters<typeof ItemGrid>[0];
       export const ok: P["posture"][] = ["counter", "keypad", "kitchen", "handheld"];`,
    );
    expect(out).toBe("");
  });

  it("keeps `floor` reachable for the things that legitimately sit at the floor", () => {
    // Cart's remove control and ItemGrid's page buttons are at 48 dp today and 27-F8 permits
    // that under "absolute floor, anything". Splitting the union must not delete the floor —
    // only stop it being passed where a POSTURE is asked for.
    const out = typecheck(
      "posture-floor-still-exists",
      `import { targetFor } from "@restos/ui";
       export const n: number = targetFor("floor");`,
    );
    expect(out, "targetFor must still accept the floor").toBe("");
  });
});

describe("F7 / 27-F43 — the pairing is structural, not prose", () => {
  // 27-F43 requires "`on-*` pairing names AND a `<Surface>` component. The name carries the
  // intent; THE COMPONENT MAKES IT STRUCTURAL. Leaving the pairing in prose produced a
  // publicly-reported failure that remains unfixed years later." Only the naming half shipped.

  it("exports a Surface component", () => {
    const out = typecheck(
      "surface-exists",
      `import { Surface } from "@restos/ui";
       export const x: unknown = Surface;`,
    );
    expect(out, "27-F43's <Surface> does not exist").toBe("");
  });

  it("binds a foreground to its surface rather than letting a caller choose one", () => {
    // The failure this prevents, concretely: `fgColor-status-fault` on `bgColor-status-fault`
    // measures 1.00:1. Nothing today stops a component composing exactly that, because every
    // component picks its foreground out of a flat global `color` record by hand.
    const rejected = rejects(
      "surface-rejects-mismatch",
      `import type { Surface } from "@restos/ui";
       type P = Parameters<typeof Surface>[0];
       export const bad: P = { fill: "bgColor-status-fault", fg: "fgColor-status-fault" };`,
    );
    expect(rejected, "a mismatched fill/foreground pair is accepted").toBe(true);
  });
});
