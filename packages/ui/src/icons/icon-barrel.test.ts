// §C OF THE ADVERSARIAL SEAM GUARD — see `icon-seam.dom.test.tsx`'s header for the provenance and
// the mutation numbers. It lives in its own file because it reads SOURCE rather than rendering,
// and this package runs source-reading suites in the `node` project (`*.test.ts`) and rendering
// suites in the `dom` one (`*.dom.test.tsx`).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — `27-F35`'s PROTECTION IS AN ABSENT EXPORT, AND NOTHING ASSERTED THE ABSENCE
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 27-F35 — a bare pictogram is not reachable from app code", () => {
  it("keeps `Icon` off this package's barrel while the comprehension gate is unrun", () => {
    // KILLS THE BARREL MUTANT, WHICH SCORED 44/44 ON THE AUTHORED SUITES — and then, with a bare
    // `<Icon>` rendered from `Counter.tsx`, scored pos-electron **1006/1006**, ui **387/387**,
    // `typecheck` 0 and `seams:check` clean. The design's whole `27-F35` protection is that
    // `Icon` is not exported; `src/index.ts`'s own comment calls exporting it *"a one-line
    // hole"*, and until now a one-line hole is exactly what it was. The authored suite closed
    // four other doors — no `iconOnly` prop, no sr-only treatment, no `aria-label` on the
    // drawing, a blank label throws — and could not see this one, because its scan reads
    // `src/icons/*` and the barrel is one directory up.
    //
    // Matched against the EXPORT CLAUSES, never the file text: this module's doc comment contains
    // the sentence "`IconLabel` IS EXPORTED AND `Icon` IS NOT", so a naive source grep would
    // fail on the very comment that states the rule.
    const barrel = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
    const clauses = [...barrel.matchAll(/export\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    expect(clauses.length, "no export clause found — is this still the barrel?").toBeGreaterThan(0);
    const exported = clauses
      .flatMap((c) => c.split(","))
      .map((s) => (s.split(/\bas\b/).pop() ?? "").replace(/\btype\b/, "").trim())
      .filter((s) => s.length > 0);
    expect(exported, "the barrel is not exporting the pairing at all").toContain("IconLabel");
    expect(
      exported,
      "27-F35's gate is unrun: a pictogram may accompany a word and may never replace one",
    ).not.toContain("Icon");
    // `ICONS` / `ICON_NAMES` are held back for the same reason the module header gives — an
    // enumeration is how a screen starts rendering symbols on its own.
    expect(exported).not.toContain("ICONS");
    expect(exported).not.toContain("Icon");
  });
});
