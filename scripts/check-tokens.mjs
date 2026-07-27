#!/usr/bin/env node
// 27-F44 — the `check-token` marker is a CI GATE, not a paragraph.
//
// Doc 27 and packages/ui/TOKENS.md both require that a value which cannot be expressed by an
// existing token is emitted with a `/* check-token */` marker, "greppable in CI". Nothing
// grepped for it: the string appeared only in the three prose files that describe it, so the
// escape hatch had no exit — a marker could sit in shipped source forever and no run would
// mention it. A rule whose enforcement does not exist is a rule that is not enforced, which
// is the failure class the oracle round named four separate times.
//
// The marker is legal in source. What is illegal is leaving it UNREVIEWED, so this prints
// every occurrence and exits 1: the author either replaces the raw value with a token or
// adds the token, and either way a human sees it before it merges.
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;

// git grep, so the scan follows the repo's own ignore rules and never walks node_modules.
let hits = "";
try {
  // SOURCE only. Prose that DESCRIBES the marker — TOKENS.md, doc 27 — must be able to name
  // it without tripping the gate, or the rule cannot be documented without being violated.
  hits = execFileSync(
    "git",
    [
      "grep",
      "-n",
      "check-token",
      "--",
      "packages/**/*.ts",
      "packages/**/*.tsx",
      "packages/**/*.json",
      "apps/**/*.ts",
      "apps/**/*.tsx",
      "services/**/*.ts",
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
} catch {
  // git grep exits 1 when there are no matches — the clean case.
}

// A marker inside a TEST is a fixture, not shipped source — the suite that proves this gate
// works has to be able to write the string it detects. Same class of defect the UI oracle hit
// twice in its own guards: a source-scanning check must not scan the thing doing the scanning.
const lines = hits
  .split("\n")
  .filter((l) => l.trim() !== "")
  .filter((l) => !/\.(test|spec|stories)\.tsx?:|__oracle__\/|__fixtures__\//.test(l));
if (lines.length === 0) {
  console.log("check-tokens: clean — no unreviewed `check-token` markers in package source");
  process.exit(0);
}

console.error(
  `check-tokens: ${lines.length} unreviewed \`check-token\` marker(s) (27-F44)\n` +
    `${lines.map((l) => `  ✗ ${l}`).join("\n")}\n\n` +
    "Each marks a value no token could express. Resolve it by adding the token to " +
    "tokens.json (with its 27-F* law) or by using an existing one — then remove the marker.",
);
process.exit(1);
