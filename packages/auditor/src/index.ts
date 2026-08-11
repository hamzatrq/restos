// @restos/auditor — 20 §4.2's Auditor: the READ-ONLY nightly refold of one
// org's kernel ledger. It lives in a package rather than in the gateway that
// wrote it because it has TWO consumers (DEC-ARCH-001, RULED): the scheduled
// host services/jobs, and services/sync-gateway, whose barrel re-exports every
// name below unchanged so the ten suites pinned to that surface did not move.
export {
  type AuditorCheck,
  type AuditorDb,
  type AuditorFinding,
  type AuditorReport,
  type ReadModelInput,
  type RunAuditorArgs,
  runAuditor,
} from "./auditor.js";
