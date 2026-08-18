// **THE THIRD PROVISIONING STEP — `pnpm -C services/sync-gateway create-owner` (August 2026).**
//
// `15-F26`: *"Provisioning creates the org's FIRST NAMED OWNER in the same act as the org … No org
// exists that nobody can administer."* `11-F20`: a person is a named record. Measured before this
// landed, the whole of that was three environment variables — `BOOTSTRAP_OWNER_EMAIL`,
// `BOOTSTRAP_OWNER_PASSWORD_HASH`, `BOOTSTRAP_ORG_ID` — assembled by `services/api` at boot into a
// process-local `Map` (`createMemoryUserStore`) that **dies with the process**. One owner, one org,
// no way to make a second of either, and a restart is a migration. `15-F26` names that stopgap
// itself so that closing it would be a scheduled act; this is the act.
//
// (The `seams:check` marker token is deliberately not spelled out anywhere in this file — a marker
// in a FILE HEADER covers every export in the module. `create-org.ts` names the four files that
// learned this the hard way.)
//
// **THE CREDENTIAL IS THE HARD PART, AND `15-F26` RULES ON IT: *"The vendor never holds a
// restaurant's password … onboarding staff type no password."*** Three shapes were available and
// two are refused outright.
//
//   - **`--password <plaintext>` or `OWNER_PASSWORD=…` (REFUSED).** An argument reaches every `ps`
//     on the host and the operator's shell history; an environment variable reaches the process
//     table, `/proc`, a crash dump and every child process — which is exactly why `services/api`'s
//     env takes a *hash* and its own comment says "the env would then hold the credential itself".
//     Either way vendor staff choose and therefore know the password, which `15-F26` forbids on the
//     stated ground that `15-F3`'s audit trail cannot then separate vendor acts from the owner's.
//   - **`--password-hash <PHC>` (REFUSED, and it is the SMALLER change).** It is what the runbook
//     does today — `hashPin('<choose-a-dev-password>')` in a `tsx -e` one-liner, pasted into env —
//     and it moves the problem rather than solving it: a human still chose the password, so the
//     vendor still holds it, and the hashing step being manual is how a deployment ends up with one
//     minted under the wrong parameters. `15-F27` bans a password as an INPUT, in any encoding.
//   - **The command mints the secret itself, hashes it, and prints it once (CHOSEN).** Nobody
//     chooses it, nobody stores it, and the plaintext exists for exactly as long as the operator's
//     terminal holds it. `01-F26`'s single hashing story is `domain`'s `hashPin` — Argon2id at
//     `01-F61`'s cost floor — and it is used verbatim, never re-expressed here.
//
// ⚠ **WHAT THIS STILL DOES NOT SATISFY, stated rather than implied.** `15-F26` specifies a
// *single-use, expiring set-credential LINK the owner completes*. What ships here is an initial
// PASSWORD: it does not expire, it is not single-use, and nothing forces a rotation on first login.
// The redemption surface that closes the gap has to sit behind `14-F1`'s authenticated back office
// and does not exist. `15-F27` records the residual in the FR itself, and it is strictly smaller
// than the state it replaces (a vendor-chosen password in a deploy environment, permanently).
//
// **IT EMITS NO `user.changed` EVENT, on `revoke-device.ts`'s ratified reasoning.** The type is
// legal (`01-F62`) and `appendOrgEvent` is in this service; a command on a service host has no
// authenticated user, so `actor_user_id` could only ever be `null`, permanently, in an append-only
// store. `15-F3` requires an actor for every staff action, so the ledger half is OWED to the
// platform-admin console (`15-F27`).

import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defineEnv, redactedDsn } from "@restos/config";
import { hashPin, newId, type PersonRecordT } from "@restos/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL_DEFAULT } from "./database-url.js";
import type { GatewayDb } from "./gateway.js";
import { emailIsTaken, insertUser, orgHasOwner, readOrg } from "./tenancy.js";

/** Exported so the acceptance suite matches THIS string rather than a hand-copy (round-3, `K-3`). */
export const CREATE_OWNER_PREFIX = "@restos/sync-gateway create-owner ";

/**
 * **stdout carries the INITIAL PASSWORD and nothing else**, on `provision-device`'s discipline and
 * for its reason: this line is a credential, the only way to get it to the owner is to emit it, so
 * the emission is one line on one stream with nothing else on it. The `user_id` goes on stderr with
 * the rest of the prose — it is not a secret, and putting two values on stdout would make
 * `PASSWORD=$(… create-owner …)` capture the wrong one.
 */
const say = (line: string): void => {
  process.stderr.write(`${CREATE_OWNER_PREFIX}${line}\n`);
};

type Args = {
  readonly org: string;
  readonly email: string;
  readonly name: string;
};

const USAGE = "create-owner --org <org_id> --email <email> --name <display_name>";

/**
 * The email check is deliberately LOOSE: one `@`, something on each side, no whitespace.
 *
 * A stricter one would be inventing policy (commandment 2) — no FR anywhere in this corpus
 * constrains an email's shape — and RFC-shaped validators are famous for rejecting addresses that
 * work. What this catches is the mistake that actually happens at a terminal: a name typed into
 * `--email`, or a shell-mangled value with a space in it, producing an account nobody can log into
 * and no error anywhere.
 */
const assertEmailShape = (email: string): void => {
  const parts = email.split("@");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "" || /\s/.test(email)) {
    throw new Error(
      `--email "${email}" does not look like an email address (one @, no spaces). This is the ` +
        "login handle (15-F26); a value that is not one produces an owner nobody can sign in as.",
    );
  }
};

export const parseCreateOwnerArgs = (argv: readonly string[]): Args => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      org: { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
      // ⚠ `strict` is what refuses `--password`, `--password-hash` and `--pin` BY NAME rather than
      // ignoring them. An ignored `--password` is the worst outcome available here: the operator
      // believes they set one, the command prints a different one, and the plaintext they chose is
      // in their shell history for nothing.
    },
    strict: true,
  });
  const missing = (["org", "email", "name"] as const).filter(
    (key) => values[key] === undefined || values[key] === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `missing required argument(s): ${missing.map((k) => `--${k}`).join(", ")}\n${USAGE}`,
    );
  }
  assertEmailShape(values.email as string);
  return {
    org: values.org as string,
    email: values.email as string,
    name: values.name as string,
  };
};

/**
 * `15-F26`: the org-wide owner assignment — `01-F26`'s per-location pair with a **null** location,
 * which is how Appendix A's "everything" is held. Not a parameter: this command creates the FIRST
 * owner and nothing else, and every other assignment is `14-F14`'s CRUD.
 */
const ownerAssignment = (): PersonRecordT["assignments"] => [
  // Typed through `PersonRecord`'"'"'s own inferred shape rather than re-stated, so the drift tripwire
  // in `packages/domain/src/tenancy.ts` — which makes `RoleAssignment` and its wire form agree at
  // COMPILE time — is the thing this depends on, and a change to either stops compiling here.
  //
  // `11-F22`'s participation status is stated rather than defaulted: the FR refuses a default by
  // name and `01-F75` makes the field required at the writer, so the one person this command
  // creates says what she is. A provisioned owner is `active` — she is being created in order to
  // sign in (`15-F26`), and there is no other value a first owner could be given. It sits on the
  // ASSIGNMENT because participation is per-(person, branch) (`11-F22`, August 2026); an org-wide
  // assignment is `01-F26`'s own encoding of "every location", so one status here covers her at
  // every branch, which is exactly what an owner's `null` location already means.
  { role: "owner", branch_id: null, status: "active" },
];

/**
 * 24 random bytes, base64url — 192 bits, and the encoding is chosen so the value survives being
 * read off a terminal and typed into a login form (no `+`, no `/`, no `=`, nothing a shell quotes).
 *
 * It is NOT a memorable passphrase. This secret is meant to be used once and replaced; making it
 * pronounceable would trade entropy for a convenience that works against the intent.
 */
const mintInitialSecret = (): string => randomBytes(24).toString("base64url");

export type CreateOwnerOutcome = {
  readonly user_id: string;
  readonly org_name: string;
  readonly email: string;
  readonly display_name: string;
  /** The plaintext, returned so exactly one caller prints it and nothing logs it. */
  readonly initial_password: string;
};

/**
 * Create an org's first owner.
 *
 * **Every refusal here is an ordering or a uniqueness fact the schema cannot state** (`0011` carries
 * no foreign key and `15-F27` puts ordering at the writer), and each names the step that was
 * skipped rather than the constraint that fired.
 *
 * **A second run REFUSES rather than being a no-op, and that is the one place this command differs
 * from `create-org`/`create-branch`.** Those two can compare a stored row against the arguments and
 * say "identical, nothing changed". This one cannot: the password is minted, so a "no-op" would
 * either print a secret that does not open the account or silently reset a credential the owner is
 * already using. `15-F26` says FIRST owner; a second is `14-F14`'s CRUD; a lost password is a reset
 * flow that does not exist yet and must not be improvised here.
 */
export const createOwner = async (
  db: GatewayDb,
  args: Args,
  now: number,
): Promise<CreateOwnerOutcome> => {
  const org = await readOrg(db, args.org);
  if (org === undefined) {
    throw new Error(
      `org ${args.org} has no record — nothing was written. 15-F26 creates the first owner "in ` +
        'the same act as the org", so the org comes first: run create-org. This directory carries ' +
        "no foreign key (01-F68), so nothing else would ever have told you the id was wrong.",
    );
  }
  if (await orgHasOwner(db, args.org)) {
    throw new Error(
      `org "${org.display_name}" (${args.org}) already has an owner — nothing was written. ` +
        "15-F26 creates the FIRST owner; every user after that is 14-F14's CRUD in the back " +
        "office, made by an authenticated human. If the owner's password is lost, that is a reset " +
        "flow this product does not have yet — improvising one here would silently overwrite a " +
        "credential somebody may still be using.",
    );
  }

  const initial_password = mintInitialSecret();
  const row = {
    user_id: newId(),
    org_id: args.org,
    display_name: args.name,
    assignments: ownerAssignment(),
    // `01-F61`'s explicit grid position. The first person provisioned is the first tile; every
    // later hire APPENDS, which is what stops a new starter shifting every tile after them.
    grid_ordinal: 0,
    email: args.email,
    // `01-F26`'s single hashing story, verbatim from `packages/domain`: Argon2id at `01-F61`'s cost
    // floor. Never re-expressed here — a second Argon2id call site is a second set of parameters.
    password_hash: await hashPin(initial_password),
    created_at: now,
  };

  const wrote = await insertUser(db, row);
  if (!wrote) {
    // The only unique constraints on this table are the primary key and the case-folded email; a
    // minted UUIDv7 does not collide, so this is the email. Read it back to say so plainly rather
    // than surfacing "duplicate key value violates unique constraint users_email_lower_uq".
    const taken = await emailIsTaken(db, args.email);
    throw new Error(
      taken
        ? `${args.email} is already a login on this host (emails are unique case-folded across ` +
            "ALL orgs, because the login lookup takes an email and nothing else — the org comes " +
            "FROM the user record, 01-F71 b). Nothing was written. Use a different address."
        : `user ${row.user_id} was not written and the email is free — treat this owner as ` +
            "NOT CREATED and re-run.",
    );
  }

  return {
    user_id: row.user_id,
    org_name: org.display_name,
    email: args.email,
    display_name: args.name,
    initial_password,
  };
};

const main = async (): Promise<void> => {
  const args = parseCreateOwnerArgs(process.argv.slice(2));
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
  });

  const db = drizzle(env.DATABASE_URL);
  try {
    const outcome = await createOwner(db, args, Date.now());
    say(
      `created OWNER "${outcome.display_name}" <${outcome.email}> · org "${outcome.org_name}" ` +
        `(${args.org}) · user_id ${outcome.user_id} · ${redactedDsn(env.DATABASE_URL)}`,
    );
    say(
      'role owner with branch_id null — org-wide, which is how Appendix A\'s "everything" is ' +
        "held (01-F26/15-F26). Every other user is created in the back office (14-F14).",
    );
    say(
      "the next line on STDOUT is a ONE-TIME INITIAL PASSWORD. It is a credential: hand it to the " +
        "owner, do not log it, do not store it. It was minted here and nobody has ever seen it — " +
        "15-F26 forbids the vendor holding a restaurant's password. ⚠ It does NOT expire and " +
        "nothing forces a change on first login: 15-F26's single-use expiring set-credential link " +
        "needs a redemption screen behind 14-F1 and is OWED (15-F27).",
    );
    process.stdout.write(`${outcome.initial_password}\n`);
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
