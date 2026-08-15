// **THE FIRST PROVISIONING STEP — `pnpm -C services/sync-gateway create-org` (August 2026).**
//
// `15-F4` has said "create org → … → branches" since Draft 1 and `01 §5` has listed `orgs` among
// the cloud tables since then. Nothing created one. Measured before this landed: `org_id` arrived
// at this gateway as free text, the only org a running deployment had was
// `BOOTSTRAP_ORG_ID` in another service's environment, and `kernel.orgs` — added by `0010` days
// earlier — was a table with no writer. So the founder's *"we are making a multitenant SaaS"* was
// true of the plumbing and false of the product: **there was no way to onboard a tenant.**
// `15-F27` is the FR that says this act must be invokable, and this is the command it names.
//
// (The `seams:check` marker token is deliberately not spelled out anywhere in this file. A marker in
// a FILE HEADER covers every export in the module — `migrate.ts`, `registry.ts`, `provision-device.ts`
// and `revoke-device.ts` each carry this warning and an agent reproduced it anyway after reading one
// of them.)
//
// **WHAT SHAPE, AND WHY THIS ONE** (`24 §3b` — the alternatives named, not silently passed over).
// The corpus does not leave this open at the destination: `15-F1`'s role-scoped internal console
// with `15-F3`'s audit trail is the answer, and `15-F27` says so.
//
//   - **A declared command on this service (chosen).** It is the shape `migrate`, `provision-device`
//     and `revoke-device` already set, and the decisive property is theirs: **it grants no authority
//     its inputs did not already carry.** It needs `DATABASE_URL` and nothing else, and anyone
//     holding that can already `INSERT` this row — which is what an operator would otherwise be
//     doing, by hand, into a PROTECTED service's table.
//   - **The platform-admin console (`15-F1`/`15-F4`) — the CORRECT END STATE, OWED not rejected.**
//     `apps/platform-admin` is a two-line scaffold stub; `15-F1` wants internal SSO with mandatory
//     2FA and `15-F3` an audit row per act, none of which exists. Building it now is a module, not
//     a command.
//   - **An `/internal` route behind `PUBLISH_TOKEN` (rejected).** Same reason `provision-device`
//     rejected it and `CLAUDE.md` re-argues for the device routes: `PUBLISH_TOKEN` is the *menu*
//     credential held by `services/api`, and creating tenants is not a menu act. Unlike revocation
//     there is no person-level `can()` check above it either, because no user exists yet — the
//     credential would be the entire security story.
//   - **Self-service signup (rejected, and it is a DECISION rather than a gap).** `15-F26`: there is
//     no self-service signup path; §1 makes this module internal-only, §9.7 records that whether one
//     should ever exist is a business decision. A public form is the shortest path to a login and
//     `15-F26` forbids taking it.
//
// **IT EMITS NO EVENT, and `15-F4` says it should.** *"Provisioning emits the org's first
// `config.changed` events."* `config.changed` is a legal org-scoped type (`01-F62`) and
// `appendOrgEvent` is in this very service, so emitting one is two lines. It is not done, on
// `revoke-device.ts`'s ratified reasoning: a shell on the service host has no authenticated user,
// `OrgEvent.actor_user_id` would be `null` permanently in an append-only store (`01-F1`), and
// `15-F3` requires an actor for every staff action. An unattributed provisioning record reads like
// an attributed one. **The ledger half is OWED to the console** (`15-F27`).

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defineEnv, redactedDsn } from "@restos/config";
import { newId, type OrgRecordT } from "@restos/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL_DEFAULT } from "./database-url.js";
import type { GatewayDb } from "./gateway.js";
import { insertOrg, readOrg } from "./tenancy.js";

/**
 * The command's own narrative prefix, exported so the acceptance suite matches THIS string rather
 * than a hand-copy of it (round-3 law, `K-3`: both of that suite's oracle symbols were dead exports
 * asserted against by hand, so the assertions survived the command changing).
 */
export const CREATE_ORG_PREFIX = "@restos/sync-gateway create-org ";

/**
 * **stdout carries the `org_id` and nothing else; every readable line goes to stderr.**
 *
 * `provision-device`'s split, for a different reason: nothing here is secret, but the id is the
 * value the next four commands and three environment variables all need, so `ORG_ID=$(… create-org
 * --name "…")` has to capture an id and not a paragraph. Getting that id from a log line is how
 * `BOOTSTRAP_ORG_ID` ends up disagreeing with a device's `org_id` — the silent four-process failure
 * `running-the-stack.md` §0 exists to warn about.
 */
const say = (line: string): void => {
  process.stderr.write(`${CREATE_ORG_PREFIX}${line}\n`);
};

type Args = {
  /** Absent ⇔ mint one. See `parseCreateOrgArgs`. */
  readonly org: string | undefined;
  readonly name: string;
};

const USAGE = "create-org --name <display_name> [--org <org_id>]";

/**
 * **`--name` is required and `--org` is not, and that asymmetry is the FR.**
 *
 * `01-F68` makes `display_name` required — it is "the only value `21-F15` permits in an org's name
 * slot" — and makes `org_id` a UUIDv7 *minted at provisioning*. So the name is the thing only a
 * human knows and the id is the thing this command can produce correctly. Accepting `--org`
 * anyway is not a hedge: `running-the-stack.md` generates an `ORG_ID` before anything else runs and
 * threads it through four processes, and a command that refused it would force that script to be
 * rewritten around this one. What `--org` must NEVER be is a way to re-use an id — `01-F68` makes
 * every event under it permanent, so a recycled id merges two restaurants' histories with no rule
 * for separating them; `15-F26` says a mistaken provision is **abandoned, never recycled**, and the
 * refusal below is the only enforcement of that this product has.
 */
export const parseCreateOrgArgs = (argv: readonly string[]): Args => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      org: { type: "string" },
      name: { type: "string" },
    },
    strict: true,
  });
  if (values.name === undefined || values.name === "") {
    throw new Error(`missing required argument: --name\n${USAGE}`);
  }
  return {
    org: values.org === undefined || values.org === "" ? undefined : values.org,
    name: values.name,
  };
};

export type CreateOrgOutcome = {
  readonly org: OrgRecordT;
  /** True when the row already existed with this exact name and this run wrote nothing. */
  readonly already: boolean;
  /** True when this command minted the `org_id` rather than being handed one. */
  readonly minted: boolean;
};

/**
 * Create one org, or report that it already exists under this name.
 *
 * **Re-running is a NO-OP, not an error, and re-running under a DIFFERENT name is a refusal.**
 * `15-F27` requires both halves and they pull in opposite directions on purpose. Provisioning must
 * be safe to repeat — the moment you doubt whether step 1 ran is the moment you run it again — so
 * the same id under the same name exits 0 and says nothing changed. But a re-run that would *change*
 * a stored name is refused, because renaming is an ordinary `14-F2` settings change made by an
 * authenticated human under `14-F30`, never a side effect of re-running a script with a typo in it.
 *
 * **`status` is not an argument.** `15-F25` puts provisioning in `active` and makes the transitions
 * `15-F7`'s act with a recorded reason; a `--status suspended` flag here would let a tenant be born
 * suspended, which is a state `15-F7`'s reversal path has nothing to reverse.
 */
export const createOrg = async (
  db: GatewayDb,
  args: Args,
  now: number,
): Promise<CreateOrgOutcome> => {
  const minted = args.org === undefined;
  const org: OrgRecordT = {
    org_id: args.org ?? newId(),
    display_name: args.name,
    // `15-F25`: provisioning lands in `active`. Not a parameter — see above.
    status: "active",
    created_at: now,
  };

  // Parses through `OrgRecord`/`DisplayName` on the way in (`packages/domain`, `18 §2`), so
  // `"   "`, a control character and a 121-code-point name are refused before any SQL runs.
  const wrote = await insertOrg(db, org);
  if (wrote) return { org, already: false, minted };

  // A conflict can only be an `org_id` collision, and a minted UUIDv7 does not collide — so this is
  // the `--org` path, and the stored row is the one that decides what happened.
  const existing = await readOrg(db, org.org_id);
  if (existing === undefined) {
    throw new Error(
      `org ${org.org_id} was not written and does not exist. Treat this org as UNPROVISIONED.`,
    );
  }
  if (existing.display_name !== org.display_name) {
    throw new Error(
      `org ${org.org_id} already exists and is called "${existing.display_name}", not ` +
        `"${org.display_name}". Provisioning creates; it never renames — an org id is minted once ` +
        "and never reused (01-F68), and a mistaken provision is abandoned, not recycled (15-F26). " +
        "If the name is wrong, change it from the back office (14-F2/14-F30); if you meant a " +
        "different org, run without --org and let this command mint one.",
    );
  }
  return { org: existing, already: true, minted: false };
};

const main = async (): Promise<void> => {
  const args = parseCreateOrgArgs(process.argv.slice(2));
  // `DATABASE_URL` and nothing else. This command mints no credential, so its inputs are strictly
  // smaller than `provision-device`'s — the same argument `revoke-device` makes.
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
  });

  const db = drizzle(env.DATABASE_URL);
  try {
    const { org, already, minted } = await createOrg(db, args, Date.now());
    say(
      `${already ? "org ALREADY recorded (nothing changed):" : "created org"} ` +
        `"${org.display_name}" · status ${org.status} · ${redactedDsn(env.DATABASE_URL)}`,
    );
    say(
      `${minted ? "minted" : "used the supplied"} org_id — it is NEVER reused (01-F68): every ` +
        "event under it is permanent, so a recycled id merges two restaurants' ledgers.",
    );
    say(
      "next: create-branch --org <this id> --name <branch name>, then create-owner, then " +
        "provision-device. A branch or an owner under an org with no record is refused (15-F27).",
    );
    process.stdout.write(`${org.org_id}\n`);
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};

// The same entry guard as every other entry point here: importable without running (which is what
// the acceptance suite does to reach `createOrg` directly), runnable as the declared script.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Loud, never degraded (`18 §5`). A provisioning step that fails quietly leaves an operator
    // building a branch, an owner and a till under an org that does not exist.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
