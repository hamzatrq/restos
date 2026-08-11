// **THE KILL SWITCH — `pnpm -C services/sync-gateway revoke-device` (August 2026).**
//
// `provision-device.ts` landed hours before this and closed the *admission* half of `01-F25`. It
// closed it alone: `revokeDevice` had **zero shipping callers**, so from that moment a till could be
// admitted by a declared command and taken away only with hand-written SQL against a PROTECTED
// service's table. That asymmetry is worse than the one it fixed, because the missing half is the
// security half — `01-F48` exists for a stolen or decommissioned device, and 2am against a
// production database is the worst possible moment to be improvising an `UPDATE`.
//
// (The `seams:check` marker token is deliberately not spelled out anywhere in this file. A marker in
// a FILE HEADER covers every export in the module, so quoting it here would silently mark all three
// exports below as debt. `migrate.ts`, `registry.ts` and `provision-device.ts` each carry this
// warning and an agent reproduced it anyway after reading one of them.)
//
// **WHAT SHAPE, AND WHY THIS ONE** (`24 §3b` — the alternatives, named rather than silently passed
// over). Note first that the corpus does NOT leave this open: `14-F13` is the answer.
//
//   - **A second declared command on this service, symmetrical with `provision-device` (chosen).**
//     Its authority argument is the same one and is in fact *stronger*: `provision-device` needs
//     `DEVICE_TOKEN_SECRET` and `DATABASE_URL`; this needs `DATABASE_URL` **only**, and anyone
//     holding it can already run this exact `UPDATE` — which is literally what the runbook told them
//     to do. So it grants nobody anything new; it removes an improvised statement from the one
//     procedure you run under pressure.
//   - **A `--revoke` flag on `provision-device` (rejected, and it is the SIMPLER option).** One
//     fewer file and one fewer script. Rejected on `registry.ts`'s own recorded reason — *"a
//     provisioning command that also revokes is one typo from a stopped branch"* — and because the
//     two acts have opposite blast radii: a failed provisioning is an inconvenience, an accidental
//     revocation stops a till mid-service. They also want opposite defaults, which is how one
//     command ends up with a flag that inverts its own safety check.
//   - **The back office device list (`14-F12`/`14-F13`) — this is the CORRECT END STATE and it is
//     OWED, not rejected on merit.** `14-F13` is explicit: *"Revocation is immediate ('stolen
//     tablet' flow): `device.revoked` → cloud token rejected, LAN participation flagged branch-wide
//     on next contact (01-F25); the list shows revoked state and actor"*, and `14-N2` puts it on an
//     owner's phone. Three things stand between here and there, none of them schedulable inside a
//     gateway task: `PERMISSION_ACTIONS` (`packages/domain`, PROTECTED) declares **no device
//     action**, so commandment 8 has nothing to authorize the request against and adding a cell is a
//     spec PR against Appendix A; the screen needs `14-F12`'s device list read model (class, app
//     version, last-seen, sync lag), none of which this service projects; and the **actor** — see
//     the next paragraph, which is the reason this command deliberately writes no event.
//   - **An `/internal` route behind `PUBLISH_TOKEN` (rejected).** Same reason `provision-device`
//     rejected it: `PUBLISH_TOKEN` is the *menu* credential held by `services/api`. Anything that
//     can publish a menu being able to switch off a branch's tills is two very different powers
//     behind one secret.
//
// **IT WRITES NO `device.revoked` EVENT, AND THAT IS A DECISION.** `device.revoked` is a legal
// org-scoped type (`01-F62`, `ORG_SCOPED_EVENT_TYPES`) and `appendOrgEvent` is in this very service,
// so emitting one is a two-line change. It is not made, for three reasons that point the same way.
// (1) `registry.ts`'s header records the **ratified T-01-09 ruling** that `registerDevice` /
// `revokeDevice` write registry rows only and `device.registered / revoked` emission belongs to the
// doc 14/15 emitters. (2) `OrgEvent.actor_user_id` is nullable and `14-F13` requires the list to
// show the **actor**; a shell on the service host has no authenticated user, so this command could
// only ever write `null` — an unattributed row, permanently, into an append-only store
// (commandment 1). "Somebody revoked this and we do not know who" is a worse record than no record,
// because it looks like one. (3) `provision-device` emits no `device.registered`, so emitting here
// would produce a history of revocations with no matching registrations — half a trail, reading as
// a whole one. **The ledger half of `14-F13` is therefore OWED and is listed as such** in this
// package's `CLAUDE.md` and in `plans/wave-1/running-the-stack.md`.
//
// **UN-REVOCATION IS NOT OFFERED, AND THE SPEC IS THE REASON RATHER THAN CAUTION.** Nothing in the
// corpus describes reinstating a revoked device — no FR, no `DECISIONS.md` row; `grep -ain
// "un-revoke\|unrevoke\|reinstate"` over `specs/` returns nothing. What the corpus *does* specify is
// the replacement path: `01-N5` mints a **fresh `device_id`** for a wiped device so it never
// collides with its old slot, and `01-F42` sends a revoked device a local-purge on next contact —
// after which there is nothing left to reinstate anyway. Building a restore flag would be inventing
// security policy (commandment 2), and it is the precise defect `provision-device` removed: §6b's
// `on conflict … do update set revoked_at = null` resurrected revoked tills. `parseArgs` runs
// `strict`, so `--restore` / `--unrevoke` / `--reissue` are refused by name rather than ignored.

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defineEnv, redactedDsn } from "@restos/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL_DEFAULT } from "./database-url.js";
import { type GatewayDb, REVOCATION_SWEEP_INTERVAL_MS } from "./gateway.js";
import { readRegistryRow, revokeDevice } from "./registry.js";

/**
 * The command's own narrative prefix, exported so `__acceptance__/revocable.test.ts` matches THIS
 * string rather than a hand-copy of it (round-3 law, `K-3`: both of that suite's oracle symbols were
 * dead exports asserted against by hand, so the assertions survived the command changing).
 */
export const REVOKE_PREFIX = "@restos/sync-gateway revoke-device ";

/**
 * **Everything goes to stdout, and the difference from `provision-device` is deliberate.** That
 * command puts every readable line on stderr because stdout carries a *credential* and the emission
 * had to be one line wide. Nothing here is secret — a revocation produces no token — so this follows
 * `migrate.ts` instead, where the outcome is the output.
 */
const say = (line: string): void => {
  console.log(`${REVOKE_PREFIX}${line}`);
};

type Args = {
  readonly org: string;
  readonly device: string;
};

const USAGE = "revoke-device --org <org_id> --device <device_id>";

/**
 * **Two arguments, and no `--branch`.** `(org_id, device_id)` is the registry's own key, so a branch
 * flag would be a third value to get right on the one command you run under pressure — and the
 * branch is *reported* below, read from the row, which is the check an operator actually needs
 * ("which till did I just switch off?"). `strict` is what refuses an invented `--restore`.
 */
export const parseRevokeArgs = (argv: readonly string[]): Args => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      org: { type: "string" },
      device: { type: "string" },
    },
    strict: true,
  });
  const missing = (["org", "device"] as const).filter(
    (key) => values[key] === undefined || values[key] === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `missing required argument(s): ${missing.map((k) => `--${k}`).join(", ")}\n${USAGE}`,
    );
  }
  return { org: values.org as string, device: values.device as string };
};

export type RevokeOutcome = {
  readonly branch_id: string;
  readonly device_class: string;
  readonly revoked_at: number;
  /** True when the row was ALREADY revoked and this run changed nothing. */
  readonly already: boolean;
};

/**
 * Set `revoked_at` on one registered device, and report what is true afterwards.
 *
 * **The registry is READ FIRST, and that is the `00 §5.7` half rather than a nicety.**
 * `revokeDevice` is an `UPDATE … WHERE`, so on a mistyped `--device` it matches zero rows, returns
 * `void`, and the command would print success over a till that is still live. That is the worst
 * failure this surface can have — an operator walks away believing a stolen tablet is dead. So a
 * device with no registry row is a LOUD refusal, and the row that *is* found supplies the branch and
 * class printed back, which is how a typo that happens to hit a real device is caught by a human.
 *
 * **Re-revoking is honest, not an error.** `revokeDevice` stamps only the first revocation (its
 * `and revoked_at is null` clause), so a second run cannot move the instant. Exiting non-zero would
 * be a worse lie than the one it prevents: the desired state holds, and a kill switch you are afraid
 * to re-run is a kill switch you hesitate over. It says *already* and prints the original instant —
 * which is a security signal in its own right, because if you did not revoke it, somebody did.
 */
export const revokeRegisteredDevice = async (db: GatewayDb, args: Args): Promise<RevokeOutcome> => {
  const existing = await readRegistryRow(db, args.org, args.device);
  if (existing === undefined) {
    // A `RangeError` because this is the CALLER's mistake and `publish-http.ts`'s `refusalStatus`
    // is the module that has to tell the two apart: an unknown device is a 400, a failed write is
    // a 500. The CLI reads `error.message` and exits 1 either way, so the class is invisible there
    // — which is exactly why it can be stated for the route without moving the command.
    throw new RangeError(
      `device ${args.device} is NOT REGISTERED in org ${args.org} — nothing was revoked. ` +
        "Check both ids: an UPDATE against a device that does not exist matches no rows and " +
        "reports no error, which is how an operator walks away believing a live till is dead.",
    );
  }
  if (existing.revoked_at !== null) {
    return {
      branch_id: existing.branch_id,
      device_class: existing.device_class,
      revoked_at: existing.revoked_at,
      already: true,
    };
  }

  await revokeDevice(db, { org_id: args.org, device_id: args.device });

  // Re-read rather than assume, for `migrate.ts`'s reason: "the command exited 0" is the only thing
  // an operator (or a script) reads, so the state it claims is the state the DATABASE reports.
  const after = await readRegistryRow(db, args.org, args.device);
  if (after === undefined || after.revoked_at === null) {
    throw new Error(
      `device ${args.device} is STILL NOT REVOKED after the write (org ${args.org}). ` +
        "Treat this device as live.",
    );
  }
  return {
    branch_id: after.branch_id,
    device_class: after.device_class,
    revoked_at: after.revoked_at,
    already: false,
  };
};

const main = async (): Promise<void> => {
  const args = parseRevokeArgs(process.argv.slice(2));
  // `DATABASE_URL` and nothing else. `provision-device` also needs `DEVICE_TOKEN_SECRET` because it
  // MINTS; revocation mints nothing, so this command's inputs are strictly smaller than the ones
  // that admitted the device in the first place.
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
  });

  const db = drizzle(env.DATABASE_URL);
  try {
    const outcome = await revokeRegisteredDevice(db, args);
    say(
      `${outcome.already ? "device was ALREADY revoked:" : "REVOKED"} ${args.device} · ` +
        `org ${args.org} · branch ${outcome.branch_id} · class ${outcome.device_class} · ` +
        `${redactedDsn(env.DATABASE_URL)}`,
    );
    say(
      `revoked_at ${new Date(outcome.revoked_at).toISOString()}` +
        (outcome.already
          ? " — this run changed nothing. If you did not revoke it, somebody else did."
          : " (01-F25/01-F48). This is NOT reversible here and nothing un-revokes: register the " +
            "replacement under a FRESH device_id (01-N5)."),
    );
    // The bound is READ FROM THE GATEWAY, never written out here. A hand-copied "30 s" would keep
    // saying 30 after someone changed the sweep — `K-3`'s dead-oracle defect, in an operator's
    // sentence instead of a test's.
    say(
      `a RUNNING gateway drops this device's live sessions within ${String(
        REVOCATION_SWEEP_INTERVAL_MS / 1000,
      )}s (01-F48) and refuses its next hello with a purge_command (01-F42). ` +
        "Where no gateway is running, nothing is evicted until one starts.",
    );
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};

// The same entry guard as `server.ts`, `migrate.ts` and `provision-device.ts`: importable without
// running (which is what the acceptance suite does to reach `revokeRegisteredDevice` directly),
// runnable as the declared script.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Loud, never degraded (`18 §5`). A revocation that fails quietly is the one failure that
    // leaves a stolen device selling under an operator who believes otherwise.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
