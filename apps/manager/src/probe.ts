/**
 * The runtime facts `05-F29` rests on, measured ON THE DEVICE.
 *
 * **This closes no FR and renders no product surface.** It exists because the ruling that
 * chose the Expo device app over a web console (`05-F29`, answering `05-F28`) turns on one
 * claim about a runtime nobody has run this code on: *"only a device holding a `01-F26` PIN
 * session can author `approval.granted` with the approver on the envelope"*. That claim is
 * sound on the kernel and **unmeasured on Hermes**, and the number that decides whether it is
 * deliverable cannot be taken on a development machine — see `pinVerifyCost` below.
 *
 * Everything here reads SHIPPED code. Nothing is stubbed, and nothing may be stubbed later:
 * a probe that measures a fake is worse than no probe, because it retires the measurement
 * somebody would otherwise take (AGENTS.md's "a port supplied with a STUB").
 */

import { PIN_ARGON2ID_PARAMS, verifyPin } from "@restos/domain";
// The PURE fold subpath, never the root entry — the root pulls `device-store.ts` and with it
// `better-sqlite3`, which cannot load under Hermes (see metro.config.js reason 2).
import { emptyShiftCash } from "@restos/sync-client/fold-engine";
import { space, touch } from "@restos/ui/tokens";

export type ProbeResult = {
  readonly label: string;
  /** `null` while the measurement is still running. */
  readonly detail: string | null;
  readonly verdict: "pending" | "ok" | "blocked";
};

/**
 * A THROWAWAY FIXTURE, not a credential — the Argon2id encoding of the digits `4821`, minted
 * with `hashPin` on 2026-08-11 purely so this probe has something to verify against.
 *
 * It is safe to commit and it is safe to delete. No staff member has this PIN, nothing
 * accepts it, and `01-F1` is not engaged because it reaches no ledger. It is here because
 * **`verifyPin` is the operation this device actually performs and `hashPin` is not**:
 * `01-F28` syncs the stored hash TO devices from wherever staff are enrolled, so the manager
 * phone only ever checks a candidate against a hash it received. Measuring enrolment instead
 * would measure the wrong half — and would not run at all, per `randomnessForEnrolment`.
 */
const FIXTURE_PIN = "4821";
const FIXTURE_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$pAjdHG7odScGTsFB7ygMCA$Nu+FpBxGNSki6wl1x/7Wt6SP1YpuRXiTm9pi6/FTWSQ";

/** `05-N1` budgets the whole machine round trip; the verify is one term inside it. */
const N1_BUDGET_MS = 2000;

/**
 * `01-F26`'s Argon2id, at `01-F61`'s real cost floor, timed. **This is the point of the probe.**
 *
 * `packages/domain` uses `@noble/hashes`' PURE-JS `argon2id` on the device path, deliberately —
 * a node-gyp addon "would break every browser workspace that imports `domain`" (`pin.ts`).
 * Pure JS is fine on a JIT. Hermes has no JIT, and Argon2id is memory-hard by construction:
 * 19 MiB of dependent reads that cannot be optimised away, in an interpreter, on `00 §4`'s
 * 2–3 GB Android reference device.
 *
 * Measured on this repo's development machine (x86 Node 22, JIT): **~460 ms to verify**.
 * `05-N1` budgets the machine portion of the approval round trip — request emitted → POS
 * unblocked — at **≤ 2 s p95**, and this verify sits INSIDE that budget alongside the append
 * and the cloud hop. A 4× interpreter penalty spends the entire budget on the hash alone.
 *
 * So this number is a go/no-go on `05-F29` as specified, not a performance curiosity. If it
 * lands over budget the resolution is a SPEC question, not a code one: `01-F61` fixes the cost
 * floor precisely so it cannot be quietly lowered to make a screen feel fast, and lowering it
 * is a kernel change to a credential (protected path, commandment 10).
 */
export const pinVerifyCost = async (): Promise<ProbeResult> => {
  const started = Date.now();
  const accepted = await verifyPin(FIXTURE_HASH, FIXTURE_PIN);
  const elapsed = Date.now() - started;

  const { m, t, p } = PIN_ARGON2ID_PARAMS;
  return {
    label: "01-F26 verify — Argon2id under Hermes",
    detail:
      `${elapsed} ms · budget ${N1_BUDGET_MS} ms (05-N1) · ` +
      `m=${m} KiB, t=${t}, p=${p} · accepted=${String(accepted)}`,
    verdict: accepted && elapsed <= N1_BUDGET_MS ? "ok" : "blocked",
  };
};

/**
 * Does this runtime have `crypto.getRandomValues`?
 *
 * `@noble/hashes`' `randomBytes` THROWS `"crypto.getRandomValues must be defined"` without it,
 * and Hermes does not provide it. That makes **`hashPin` unavailable on this platform** while
 * `verifyPin` is unaffected (it reads its salt out of the stored PHC string).
 *
 * Reported rather than fixed, because whether it needs fixing is a scope question this session
 * cannot answer: nothing in `05` asks the manager device to ENROL a PIN, so the gap may be
 * permanent and harmless. If a later FR does put enrolment here, the fix is `expo-crypto` —
 * an official `expo-*` module and therefore already inside `18 §14`'s allowlist, needing no
 * `18 §15` process.
 */
export const randomnessForEnrolment = (): ProbeResult => {
  const available = typeof globalThis.crypto?.getRandomValues === "function";
  return {
    label: "hashPin — crypto.getRandomValues",
    detail: available
      ? "present · enrolment would work here"
      : "ABSENT · hashPin throws; verifyPin unaffected (01-F28 syncs hashes in)",
    // Not "blocked": no FR asks this device to enrol. Absence is a fact, not a failure.
    verdict: "ok",
  };
};

/**
 * Does the pure fold subpath LOAD and RUN here?
 *
 * `05-N5` requires the approval queue and alarm list to "survive app kill/restart without
 * loss — they are folds over the branch stream, re-derived on start (`01-F6`)". Re-deriving
 * needs two things: the fold engine, and a durable local copy of the stream. This measures
 * the first. The second does not exist on this platform and is the app's blocking gap —
 * `openStore` binds `better-sqlite3` directly, so there is nothing to re-derive FROM.
 */
export const foldEngineLoads = (): ProbeResult => {
  const empty = emptyShiftCash();
  return {
    label: "26 §8 fold engine — pure subpath under Hermes",
    detail: `emptyShiftCash() → ${typeof empty} · no better-sqlite3 in the bundle`,
    verdict: typeof empty === "object" && empty !== null ? "ok" : "blocked",
  };
};

/**
 * `18 §2` calls `packages/ui` an "RN component kit + design tokens (web consumes tokens
 * only)". The repo built the inverse: all 18 exported components render React DOM, and the
 * TOKENS are the only half an RN app can consume. This confirms that half travels.
 */
export const tokensLoad = (): ProbeResult => ({
  label: "27 tokens — the portable half of packages/ui",
  detail: `space-4=${space["space-4"]} · touch-handheld=${touch["touch-handheld"]} (unitless, RN-ready)`,
  verdict: typeof space["space-4"] === "number" ? "ok" : "blocked",
});
