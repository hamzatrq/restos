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
    // Expand the catalog line's shorthand into fully-qualified type names. TWO notations are
    // in use and both must parse, because a group this parser silently drops becomes a family
    // C6 cannot see at all:
    //   `order.created / confirmed / rejected`     — family stated once, then bare leaves
    //   `void.recorded / comp.recorded / discount.recorded` — each leaf fully qualified
    // Footnote markers (`line_removed†`) are stripped first. The dagger is why this check
    // spent its first month blind to all sixteen `order.*` types: it broke the group match,
    // the family never registered, and the old "unknown family ⇒ skip" rule below then
    // exempted every `order.*` mention in every module doc.
    const known = new Set();
    for (const [, group] of catalogLine.matchAll(/`([^`]+)`/g)) {
      const cleaned = group.replace(/[†‡]/g, "").trim();
      if (!/^[a-z_]+\.[a-z_.*\s/]+$/.test(cleaned)) continue; // not an event group (e.g. a path)
      let family = null;
      for (const raw of cleaned.split("/")) {
        const leaf = raw.trim();
        if (!leaf) continue;
        if (leaf.includes(".")) {
          const [f, ...rest] = leaf.split(".");
          family = f;
          known.add(`${f}.${rest.join(".")}`);
        } else if (family) known.add(`${family}.${leaf}`);
      }
    }
    const wildcards = [...known].filter((k) => k.endsWith(".*")).map((k) => k.slice(0, -1));

    // Dotted names that are NOT event types. There is no family-prefix escape hatch: a name
    // is either a catalogued event, or it is listed here with a reason. That asymmetry is the
    // point — the old rule skipped any name whose family was absent from the catalog, which
    // exempted precisely the wholly-unabsorbed families (`governance.*`, `fiscal.*`,
    // `campaign.*`, `loyalty.*`) that the check exists to catch.
    const notEvents = new Set([
      // 13 §2 metric ids — a metric is a derived number, not an emission.
      "cash.variance",
      "stock.variance_value",
      "sales.total",
      "voids.count",
      "margin.gross_estimate",
      // 25/26 fold field and predicate names, not emissions.
      "day.business_date",
      "env.device_created_at",
      "in_scope.pending",
      "orders.settled",
      "shifts.open_at",
      // Withdrawn names, retained in prose for the audit trail (07-F7 / 07-F18).
      "whatsapp.optin_recorded",
      "whatsapp.optout_recorded",
      // Code identifiers quoted in prose (18 §4, 26 §8, DEC-AUDIT-001).
      "console.log",
      "process.env",
      "z.object",
      // Database objects (kernel schema), not events.
      "kernel.quarantine_notices",
      // `domain` PERMISSION ACTIONS (`restaurant-os.md` Appendix A via 01-F26, `permissions.ts`).
      // They share `noun.verb` with the event catalog and are a different vocabulary entirely —
      // an action is something a ROLE may do, an event is something that HAPPENED. A spec that
      // names the action gating a screen (14-F30) is not declaring an emission, and the two
      // vocabularies genuinely overlap in shape: `device.revoked` IS an event, `device.manage` is
      // not and never will be. Listed by name rather than wildcarded, so a real event that lands
      // in one of these families is still caught.
      "device.manage",
      "catalog.edit_menu_prices",
      // The seven actions 14-F30 names to COUNT the precedent it follows (7 of 22 have no
      // Appendix A row). Every one is the infinitive of an act; every event in the same family is
      // 00 §6's `noun.verb_past` — `shift.open_close` the action versus `shift.opened` /
      // `shift.closed` the events, `refund.issue` versus `refund.issued`. So none of these can
      // ever become an event and listing them costs the rule nothing.
      //
      // ⚠ The two vocabularies collide on exactly one name and it is worth knowing: `cash.paid_out`
      // is BOTH a permission action and a real event type, so it is absent here — it passes as a
      // known event. A future action that happens to be spelled like a past-tense event will
      // likewise pass silently; the rule cannot tell them apart, and only the count above would.
      "order.price_override",
      "approval.grant",
      // `02-F46`'s action and the row it copies. Both are infinitives of an act and both have a
      // past-tense event beside them in the same family — `availability.toggle` the action versus
      // `availability.changed` the event, `order.create` versus `order.created` — so by this
      // block's own test neither can ever become an emission.
      "availability.toggle",
      "order.create",
      "shift.open_close",
      "cash.count",
      "cash.drawer_no_sale",
      "refund.issue",
      "day.open_close",
      // The naming-convention placeholder itself (00 §6).
      "noun.verb_past",
    ]);
    // Filenames read as `a.b`. An extension test beats listing every file the corpus cites.
    const fileRe = /\.(ts|tsx|js|mjs|json|md|sql|yaml|yml|toml|css|html)$/;

    const evRe = /`([a-z_]+\.[a-z_]+)`/g;
    for (const f of specFiles) {
      if (f.startsWith("01-")) continue;
      // DECISIONS.md is excluded BY DESIGN: it is the one doc where undecided things are
      // legitimately named, so an event discussed in an open proposal is not yet owed to the
      // catalog. A decision that ratifies an event still gets caught — commandment 9 makes it
      // land in its owning module doc, and every module doc is scanned.
      if (f === "DECISIONS.md") continue;
      const text = read(`specs/${f}`);
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(evRe)) {
          const t = m[1];
          if (known.has(t) || notEvents.has(t) || fileRe.test(t)) continue;
          if (wildcards.some((w) => t.startsWith(w))) continue;
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
