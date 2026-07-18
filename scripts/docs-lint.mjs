#!/usr/bin/env node
// Doc linter (23-F8): keeps the router, index, and FR-ID trails honest.
// Checks: routing completeness, FR definition uniqueness + file-prefix match,
// FR reference resolution, authority-block identity, size caps.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const errors = [];
const err = (m) => errors.push(m);

const specFiles = readdirSync(join(ROOT, "specs")).filter((f) => /^\d{2}-.*\.md$/.test(f));
const agents = read("AGENTS.md");
const master = read("restaurant-os.md");
const zero = read("specs/00-platform-overview.md");

// C1 — routing completeness: every numbered spec (except 00) referenced in AGENTS.md; every spec + DECISIONS in 00 §1 index.
for (const f of specFiles) {
  const nn = f.slice(0, 2);
  if (nn !== "00" && !new RegExp(`\`${nn}( §[^\`]*)?\``).test(agents))
    err(`AGENTS.md routing: spec ${f} (\`${nn}\`) not referenced`);
  if (nn !== "00" && !zero.includes(f)) err(`00 §1 index: ${f} missing`);
}
if (!agents.includes("DECISIONS.md")) err("AGENTS.md routing: DECISIONS.md not referenced");
if (!zero.includes("DECISIONS.md")) err("00 §1 index: DECISIONS.md missing");

// C2 — FR definitions: "- NN-Fxx ..." (optionally bold) at line start; unique; prefix matches owning file.
const defs = new Map(); // id -> file:line
const defRe = /^\s*-\s+\*{0,2}(\d{2}-[FN]\d+[a-z]?)\b/;
for (const f of specFiles) {
  const nn = f.slice(0, 2);
  read(`specs/${f}`)
    .split("\n")
    .forEach((line, i) => {
      const m = line.match(defRe);
      if (!m) return;
      const id = m[1];
      if (defs.has(id))
        err(`duplicate FR definition ${id}: ${defs.get(id)} and specs/${f}:${i + 1}`);
      else defs.set(id, `specs/${f}:${i + 1}`);
      if (!id.startsWith(`${nn}-`))
        err(`FR ${id} defined in specs/${f}:${i + 1} — prefix does not match owning doc`);
    });
}

// C3 — FR reference resolution: every NN-Fxx / NN-Nxx token anywhere must resolve to a definition.
const refRe = /\b(\d{2}-[FN]\d+[a-z]?)\b/g;
const corpus = [
  ["AGENTS.md", agents],
  ["restaurant-os.md", master],
  ...specFiles.map((f) => [`specs/${f}`, read(`specs/${f}`)]),
];
for (const [name, text] of corpus) {
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(refRe)) {
      if (!defs.has(m[1])) err(`unresolved FR reference ${m[1]} at ${name}:${i + 1}`);
    }
  });
}

// C4 — authority-order blocks byte-identical (single line starting with "**Authority order").
const block = (t, name) => {
  const l = t.split("\n").find((x) => x.startsWith("**Authority order"));
  if (!l) err(`${name}: authority-order block not found`);
  return l ?? "";
};
if (block(master, "restaurant-os.md") !== block(zero, "specs/00"))
  err(
    "authority-order blocks differ between restaurant-os.md and specs/00 (must be byte-identical, 23-F8)",
  );

// C5 — size caps (23-F3): specs ≤ 360 lines; AGENTS.md ≤ 120.
for (const f of specFiles) {
  const n = read(`specs/${f}`).split("\n").length;
  if (n > 360)
    err(`specs/${f}: ${n} lines exceeds the 23-F3 cap (360) — split by ownership boundary`);
}
if (agents.split("\n").length > 120)
  err(`AGENTS.md: ${agents.split("\n").length} lines exceeds the T0 cap (120)`);

if (errors.length) {
  console.error(
    `docs-lint: ${errors.length} finding(s)\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `docs-lint: clean — ${specFiles.length} specs, ${defs.size} FR definitions, router + index + authority blocks consistent`,
);
