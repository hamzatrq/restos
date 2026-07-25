// T-01-11 fix round F7 — spawned-node entry: imports the AUDITOR MODULE with
// better-sqlite3 unresolvable (purity-block-sqlite.mjs). Loading this file to
// the success marker proves the auditor's whole import graph — @restos/domain,
// @restos/sync-client/fold-engine, drizzle-orm — never touches the native
// addon (t-01-11 ruling 2). Exit 0 + marker = pass; any resolution of
// better-sqlite3 throws in the blocker and the process dies non-zero.
import { runAuditor } from "../auditor.js";

if (typeof runAuditor !== "function") {
  process.stderr.write("[t-01-11 F7] auditor module loaded but runAuditor is not a function\n");
  process.exit(2);
}
process.stdout.write("AUDITOR_MODULE_LOADED_WITHOUT_SQLITE\n");
