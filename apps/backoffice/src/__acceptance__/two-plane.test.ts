/**
 * **Commandment 5 / `18 §6` — the two-plane law, enforced structurally rather than by review.**
 *
 * `backoffice-catalog.md §6.8`: *"No `sync-client` import exists anywhere in `apps/backoffice` or
 * `services/api` — the two-plane law, enforced structurally rather than by review."*
 *
 * **The suite proves the scanner BITES before it uses it as evidence.** Each rule is fired at a
 * known violation first, on the same code path that then clears the real tree — because the
 * round-3 finding of this wave is a guard that was built correctly and never aimed at the case
 * that matters. A clean report from a scanner nothing has ever made fail is not evidence.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { scanPlaneDiscipline } from "./plane-scan";

const SRC = new URL("..", import.meta.url).pathname;

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
};

/** Shipped source only. A violation inside this suite's own fixtures is the fixture doing its job. */
const shipped = walk(SRC)
  .filter((path) => !path.includes("__acceptance__"))
  .map((path) => ({ file: relative(SRC, path), source: readFileSync(path, "utf8") }));

const scan = (source: string) => scanPlaneDiscipline([{ file: "fixture.tsx", source }]);

describe("the scanner fires on the violation it exists to catch", () => {
  it("catches a sync-client import", () => {
    const found = scan(`import { openLedger } from "@restos/sync-client";\nexport const a = 1;`);
    expect(found.map((v) => v.rule)).toContain("two-plane");
  });

  it("catches a deep sync-client import too", () => {
    const found = scan(`import { x } from "@restos/sync-client/src/catalog.js";`);
    expect(found.map((v) => v.rule)).toContain("two-plane");
  });

  it("catches a client store", () => {
    const found = scan(`import { create } from "zustand";\nimport { atom } from "jotai";`);
    expect(found.filter((v) => v.rule === "client-store")).toHaveLength(2);
  });

  it("catches server state copied into useState", () => {
    const found = scan(`const q = useQuery(o);\nconst [x, setX] = useState(q.data);`);
    expect(found.map((v) => v.rule)).toContain("state-copy");
  });

  it("catches the useEffect sync — the shape that looks like ordinary React", () => {
    const found = scan(
      `const q = useQuery(o);\nuseEffect(() => { if (q.data) setName(q.data.name); }, [q.data]);`,
    );
    expect(found.map((v) => v.rule)).toContain("effect-sync");
  });

  it("does NOT fire on a draft seeded from a prop", () => {
    // The legal pattern this app actually uses. A scanner that flagged it would be unusable and
    // would be suppressed, which is worse than the gap it closes.
    const found = scan(`const [form, setForm] = useState(() => formOf(initial));`);
    expect(found).toHaveLength(0);
  });

  it("does NOT fire on the words inside a comment or a string", () => {
    const found = scan(
      `// we never import from "@restos/sync-client" here\nconst why = "zustand is banned";`,
    );
    expect(found).toHaveLength(0);
  });
});

describe("apps/backoffice obeys the two-plane law", () => {
  it("has source files to scan", () => {
    // `24-F14` empty-match protection: a moved layout must FAIL rather than pass vacuously.
    expect(shipped.length).toBeGreaterThan(10);
  });

  it("imports nothing from the operational plane and holds no client store", () => {
    expect(scanPlaneDiscipline(shipped)).toEqual([]);
  });

  it("declares no dependency on sync-client in its manifest either", () => {
    // The import scan covers the code; this covers the manifest, because a dependency that is
    // declared and unused today is one `import` away from being used tomorrow.
    const manifest = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8")) as Record<
      string,
      Record<string, string>
    >;
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(declared.filter((name) => name.includes("sync-client"))).toEqual([]);
  });
});
