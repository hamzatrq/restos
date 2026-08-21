/**
 * **THE HAND-WRITTEN ASSERTION `01-F71` (f) (ii) DEMANDS BY NAME — and it exists because a mutation
 * run said it had to.**
 *
 * This is NOT an oracle. `__acceptance__/tenant-backup-restore.test.ts` is the contract for R38 and
 * was authored by a session that saw no implementation; this file was written by the implementing
 * session, deliberately and with its reason recorded, because the acceptance suite is READ-ONLY
 * (`24 §3`) and **one enforcement point had no assertion aimed at it**.
 *
 * ## The measurement that produced it
 *
 * `01-F71` is explicit that its register is not advisory: *"Each point carries a test that FAILS
 * when that point alone is removed. Reading is not evidence and neither is a green suite: a suite
 * exercising one tenant passes with all four deleted. The test must run two tenants and mutate the
 * point under test."*
 *
 * Measured on this change, full package suite, `REAL_EXIT` read from a marker inside the log:
 *
 *     mutant B7 — the foreign-row refusal in `parseArtifact` deleted   →  0 killed of 72
 *
 * Every other clause of (f) is covered by the acceptance suite and dies loudly (the artifact's
 * `where org_id = $1` kills **6**), so this was the one hole and it is precisely the shape `01-F71`
 * records from the reference-serve round: *"every fixture in the repo passed the session's own key,
 * so a fixture that cannot express a foreign key cannot test a refusal of one."* No fixture in the
 * acceptance suite produces a MIXED artifact — every artifact it inspects was written by the
 * correct implementation, which never puts two tenants in one file — so the refusal that catches a
 * mixed one was unreachable from it.
 *
 * ## Why the check is worth having at all, since a correct writer cannot produce the input
 *
 * That objection is the reason to write it down rather than to delete the check. The artifact is a
 * FILE: it outlives the process that wrote it, it is copied off the box, and the thing a restore
 * reads may have been produced by an older build, by a hand-edit during an incident, or by the
 * cluster-wide `pg_dump` that `ops/backup.sh` still takes (`plans/saas-pivot/mvp-plan.md`: *"one
 * artifact holds every tenant and handing it to an owner is a cross-tenant disclosure"*). The
 * refusal is the last point at which two tenants in one file is still detectable — after it, the
 * rows are in the database and `01-F1` forbids removing them.
 *
 * It is also the reason the refusal is a REFUSAL and not a filter, and `§B` below is what pins
 * that: writing the subset would restore the tenant correctly and destroy the only evidence that
 * something upstream produced a mixed dump.
 *
 * ## Two tenants, both populated, and the CONTROL comes first
 *
 * `01-F71`'s other measured lesson is that *"refused and served nothing are separate claims"*. So
 * every refusal below is paired, in the same test, with the same artifact minus the foreign row
 * being ACCEPTED — otherwise "it refused" is indistinguishable from "`parseArtifact` refuses
 * everything".
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ArtifactError, parseArtifact } from "./tenant-artifact.js";

const ORG_A = "org-kababjees-r38";
const ORG_B = "org-student-biryani-r38";
const A_BRANCH = "branch-gulberg";
const B_BRANCH = "branch-nazimabad";

/**
 * Build an artifact by hand, in the shipped format, digest and all.
 *
 * ⚠ **It does NOT call `tenantArtifact`, and that is the point rather than a convenience.** The
 * writer cannot produce the input this test exists for — a correct `where org_id = $1` never emits
 * a foreign row — so a fixture built by calling it could not express the case, which is the exact
 * failure `01-F71` records. The digest is recomputed here so a REFUSAL is attributable to the org
 * check and never to a body that fails its own integrity test first.
 */
const artifactOf = (org_id: string, rows: readonly { t: string; r: unknown }[]): string => {
  const tables = ["branches", "events", "orgs"];
  const header = JSON.stringify({
    kind: "restos.tenant-backup",
    format: 1,
    org_id,
    taken_at: 1_752_800_000_000,
    tables,
  });
  const lines = rows.map((row) => JSON.stringify(row));
  const hash = createHash("sha256");
  for (const line of lines) {
    hash.update(line);
    hash.update("\n");
  }
  const footer = JSON.stringify({
    kind: "restos.tenant-backup.end",
    rows: lines.length,
    digest: hash.digest("hex"),
  });
  return `${[header, ...lines, footer].join("\n")}\n`;
};

/** One row of each tenant, in a table both tenants populate. */
const ownRow = { t: "orgs", r: { org_id: ORG_A, display_name: "Kababjees", status: "active" } };
const ownBranch = {
  t: "branches",
  r: { branch_id: A_BRANCH, org_id: ORG_A, display_name: "Gulberg" },
};
const foreignRow = {
  t: "orgs",
  r: { org_id: ORG_B, display_name: "Student Biryani", status: "active" },
};
const foreignBranch = {
  t: "branches",
  r: { branch_id: B_BRANCH, org_id: ORG_B, display_name: "Nazimabad" },
};

describe("01-F71 (f) (ii): a restore REFUSES an artifact carrying another tenant's rows", () => {
  it("A the CONTROL — a single-tenant artifact of the same shape parses and keeps every row", () => {
    // Stated first and in the same file, because "the mixed one was refused" proves nothing about
    // the org check if `parseArtifact` refuses this too.
    const parsed = parseArtifact(artifactOf(ORG_A, [ownRow, ownBranch]));
    expect(parsed.header.org_id).toBe(ORG_A);
    expect(parsed.rows).toHaveLength(2);
  });

  it("B a foreign row anywhere in the body refuses the WHOLE artifact, naming both orgs", () => {
    const mixed = artifactOf(ORG_A, [ownRow, foreignRow, ownBranch]);
    expect(() => parseArtifact(mixed)).toThrow(ArtifactError);
    // The message has to name the tenant that does not belong and the one the artifact claims to
    // be about — an operator holding a refused artifact at 3am needs to know which dump produced
    // it, and "refused" alone sends them to re-run the same backup.
    try {
      parseArtifact(mixed);
      expect.unreachable("a mixed-tenant artifact was accepted");
    } catch (error) {
      expect(String((error as Error).message)).toContain(ORG_B);
      expect(String((error as Error).message)).toContain(ORG_A);
      expect(String((error as Error).message)).toContain("01-F71");
    }
  });

  it("C it REFUSES rather than filtering — the tenant's own rows do not survive the refusal", () => {
    // The distinction this test exists for. A filter would restore tenant A perfectly and destroy
    // the only signal that something produced a two-tenant dump; `01-F71` (e) refuses to clamp a
    // mis-routed artifact for the same reason. `parseArtifact` is the whole gate, so nothing
    // downstream can be reached with a partial result: it throws, and there is no value to filter.
    let parsedAnyway: unknown = "not reached";
    try {
      parsedAnyway = parseArtifact(artifactOf(ORG_A, [ownRow, foreignRow]));
    } catch {
      parsedAnyway = "refused";
    }
    expect(parsedAnyway).toBe("refused");
  });

  it("D the direction is not privileged — B's artifact carrying A is refused the same way", () => {
    // A one-branch mutant that compared against a hardcoded org, or that only checked the first
    // row, would pass §B and fail here. Both directions, on `§B3`'s own reasoning: a filter applied
    // to one tenant and not the other is exactly a one-branch mutant.
    expect(parseArtifact(artifactOf(ORG_B, [foreignRow, foreignBranch])).rows).toHaveLength(2);
    expect(() => parseArtifact(artifactOf(ORG_B, [foreignRow, ownRow]))).toThrow(ArtifactError);
  });

  it("E a row whose org_id is ABSENT is refused too — a missing key is not a matching one", () => {
    // `undefined !== header.org_id` holds, so this is the same branch; it is asserted because the
    // dangerous rewrite is `owner && owner !== header.org_id`, which silently admits every row that
    // carries no tenant at all. Every kernel table carries `org_id` NOT NULL today, so such a row
    // can only come from a damaged or foreign artifact — which is what this gate is for.
    const orphan = { t: "orgs", r: { display_name: "no tenant at all", status: "active" } };
    expect(() => parseArtifact(artifactOf(ORG_A, [ownRow, orphan]))).toThrow(ArtifactError);
  });
});
