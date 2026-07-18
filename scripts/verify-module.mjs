#!/usr/bin/env node
// Conformance derivation (24-F5) + per-module verify command (24-F6).
// Usage: node scripts/verify-module.mjs <NN> [--gate]
//   Runs the module's test suites, maps FR-tagged test titles to spec-defined FRs,
//   derives conformance/NN.yml (DO NOT hand-edit — 24-F5), prints the delta.
//   Exit 1 on any red row; with --gate, also on any unmapped row (the D1 gate).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const nn = process.argv[2];
const gate = process.argv.includes("--gate");
if (!/^\d{2}$/.test(nn ?? "")) {
  console.error("usage: verify-module.mjs <NN> [--gate]");
  process.exit(2);
}

// Module → workspaces hosting its tests (grows as modules gain code).
const MODULE_WORKSPACES = {
  "01": ["@restos/domain", "@restos/sync-protocol", "@restos/sync-client"],
};
const workspaces = MODULE_WORKSPACES[nn];
if (!workspaces) {
  console.error(`verify:${nn}: no workspace mapping yet — add it to MODULE_WORKSPACES`);
  process.exit(2);
}

// FR universe from the owning spec (same definition shape docs-lint enforces).
const specFile = readdirSync(join(ROOT, "specs")).find((f) => f.startsWith(`${nn}-`));
const defRe = /^\s*-\s+\*{0,2}(\d{2}-[FN]\d+[a-z]?)\b/;
const universe = [];
for (const line of readFileSync(join(ROOT, "specs", specFile), "utf8").split("\n")) {
  const m = line.match(defRe);
  if (m?.[1].startsWith(`${nn}-`)) universe.push(m[1]);
}

// Run each workspace's suite with the JSON reporter; derive even when red.
const frRe = new RegExp(`\\b(${nn}-[FN]\\d+[a-z]?)\\b`, "g");
const byFr = new Map(); // fr -> { tests: [], statuses: [] }
let suitesRan = 0;
let anyRed = false;
for (const ws of workspaces) {
  const dir = join(ROOT, ws.replace("@restos/", "packages/"));
  const hasTests =
    existsSync(join(dir, "src")) &&
    execFileSync("find", [join(dir, "src"), "-name", "*.test.ts"])
      .toString()
      .trim() !== "";
  if (!hasTests) continue;
  const out = join(tmpdir(), `restos-verify-${nn}-${ws.split("/")[1]}.json`);
  try {
    execFileSync(
      "pnpm",
      ["--filter", ws, "exec", "vitest", "run", "--reporter=json", `--outputFile=${out}`],
      {
        cwd: ROOT,
        stdio: "pipe",
      },
    );
  } catch {
    anyRed = true; // vitest exits nonzero on failures; the JSON file still has results
  }
  if (!existsSync(out)) {
    console.error(`verify:${nn}: no reporter output from ${ws}`);
    process.exit(2);
  }
  suitesRan++;
  const report = JSON.parse(readFileSync(out, "utf8"));
  for (const file of report.testResults ?? []) {
    const rel = String(file.name ?? "").replace(`${ROOT}`, "");
    for (const t of file.assertionResults ?? []) {
      for (const m of String(t.title ?? "").matchAll(frRe)) {
        const row = byFr.get(m[1]) ?? { tests: new Set(), statuses: [] };
        row.tests.add(`${rel}#${t.title}`);
        row.statuses.push(t.status);
        byFr.set(m[1], row);
      }
    }
  }
}

// Derive rows for the full FR universe.
const rows = universe.map((fr) => {
  const hit = byFr.get(fr);
  const status = !hit ? "unmapped" : hit.statuses.every((s) => s === "passed") ? "green" : "red";
  return { fr, tests: hit ? [...hit.tests] : [], status };
});
const count = (s) => rows.filter((r) => r.status === s).length;

// Emit conformance/NN.yml (derived artifact — 24-F5).
const yaml = [
  "# DERIVED by scripts/verify-module.mjs — do not hand-edit (24-F5).",
  `module: "${nn}"`,
  `derived_from: ${suitesRan} suite run(s)`,
  "rows:",
  ...rows.flatMap((r) => [
    `  - fr: ${r.fr}`,
    `    status: ${r.status}`,
    ...(r.tests.length
      ? ["    tests:", ...r.tests.map((t) => `      - "${t.replaceAll('"', "'")}"`)]
      : []),
  ]),
  "",
].join("\n");
mkdirSync(join(ROOT, "conformance"), { recursive: true });
writeFileSync(join(ROOT, "conformance", `${nn}.yml`), yaml);

console.log(
  `verify:${nn} — ${count("green")} green / ${count("red")} red / ${count("unmapped")} unmapped of ${universe.length} FRs → conformance/${nn}.yml`,
);
if (anyRed || count("red") > 0) process.exit(1);
if (gate && count("unmapped") > 0) {
  console.error(
    `verify:${nn} --gate: ${count("unmapped")} unmapped FR(s) block the D1 gate (24-F5)`,
  );
  process.exit(1);
}
