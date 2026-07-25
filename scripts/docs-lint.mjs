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

// C6 — event-catalog absorption (01 §4, Commandment 2). Every event type named in any
// module doc must appear in the 01 §4 catalog line. 01-F4 makes producing an unknown type a
// build-time AND runtime error, so an unabsorbed type is a latent build break, not a doc nit.
// Fourteen had accumulated by July 2026, two of them blocking shippable tasks.
{
  const kernel = read("specs/01-kernel-sync.md");
  const catalogLine = kernel.split("\n").find((l) => l.includes("`order.created / confirmed"));
  if (!catalogLine) err("specs/01: the §4 event catalog line was not found — C6 cannot run");
  else {
    // Expand `a.b / c / d` shorthand into fully-qualified type names.
    const known = new Set();
    for (const m of catalogLine.matchAll(/`([a-z_]+)\.([a-z_*]+(?:\s*\/\s*[a-z_*]+)*)`/g)) {
      for (const leaf of m[2].split("/")) known.add(`${m[1]}.${leaf.trim()}`);
    }
    const wildcards = [...known].filter((k) => k.endsWith(".*")).map((k) => k.slice(0, -1));
    // Names that collide with an event-family prefix but are NOT event types: metric ids
    // (13 §2), fold field names (26), and deliberately withdrawn names retained for the
    // audit trail. Keep this list short — every entry is a place the heuristic gives up.
    const notEvents = new Set([
      "cash.variance", // 13 §2 metric id, sibling of sales.total / voids.count
      "stock.variance_value", // 13 §2 metric id
      "day.business_date", // 26 fold field, not an emission
      "whatsapp.optin_recorded", // WITHDRAWN 07-F7 → customer.opted_in
      "whatsapp.optout_recorded", // WITHDRAWN 07-F18 → customer.opted_out
    ]);
    const evRe = /`([a-z_]+\.[a-z_]+)`/g;
    for (const f of specFiles) {
      if (f.startsWith("01-")) continue;
      const text = read(`specs/${f}`);
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(evRe)) {
          const t = m[1];
          // Only nouns that look like event types: a known family prefix.
          const fam = t.split(".")[0];
          if (![...known].some((k) => k.startsWith(`${fam}.`))) continue;
          if (known.has(t) || notEvents.has(t) || wildcards.some((w) => t.startsWith(w))) continue;
          err(
            `specs/${f}:${i + 1}: event type \`${t}\` is not absorbed into the 01 §4 catalog — ` +
              `01-F4 makes emitting it a build-time and runtime error (Commandment 2)`,
          );
        }
      });
    }
  }
}

if (errors.length) {
  console.error(
    `docs-lint: ${errors.length} finding(s)\n${errors.map((e) => `  ✗ ${e}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `docs-lint: clean — ${specFiles.length} specs, ${defs.size} FR definitions, router + index + authority blocks consistent`,
);
