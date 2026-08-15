// **THE READ-BACK — `pnpm -C services/sync-gateway list-tenancy` (August 2026).**
//
// `15-F27`: a provisioning step whose result cannot be inspected is one an operator has to trust.
// Three commands beside this one write rows into `kernel.orgs`, `kernel.branches`, `kernel.users`
// and `kernel.device_registry`; before this there was no way to read any of them back except psql,
// and "which orgs exist on this host" had no answer at all — a multi-tenant service that could not
// enumerate its tenants.
//
// (The `seams:check` marker token is deliberately not spelled out anywhere in this file — a marker
// in a FILE HEADER covers every export in the module. `create-org.ts` names the files that learned
// this the hard way.)
//
// ⚠ **THIS IS THE DIRECTORY, NOT `15-F11`'s FLEET DASHBOARD, AND THE DIFFERENCE IS `00 §5.7`.**
// `15-F11` wants heartbeat, app version, last-seen and sync lag per device. **None of those are
// stored anywhere in this service** — `registry.ts` says so at `listDevices` and doc 15's device
// pipeline is what closes them. So they are ABSENT here rather than invented: a screen (or a
// command) showing an aged number as a fresh one is the failure `00 §5.7` names, and a plausible
// `last_seen` stamped at hello would be a second interpretation of a fact another module owns.
// What this reports is exactly what the directory stores, and nothing else.
//
// **THE PASSWORD HASH IS NEVER SELECTED.** `listUsers` does not read the column at all (`tenancy.ts`
// states why): a credential that never leaves the row it lives in cannot be printed by accident,
// piped into a log, or pasted into an issue by an operator sharing "what the command said".

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defineEnv, redactedDsn } from "@restos/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL_DEFAULT } from "./database-url.js";
import type { GatewayDb } from "./gateway.js";
import { listDevices } from "./registry.js";
import { listBranches, listOrgs, listUsers } from "./tenancy.js";

/** Exported so the acceptance suite matches THIS string rather than a hand-copy (round-3, `K-3`). */
export const LIST_TENANCY_PREFIX = "@restos/sync-gateway list-tenancy ";

/**
 * **stdout is JSON and nothing else; the prose is on stderr.**
 *
 * `provision-device`'s split for the third distinct reason on this service: not a credential and not
 * an id to capture, but a *machine* output. `… list-tenancy | jq '.orgs[].org_id'` has to work, and
 * a banner line inside the document would break it — so the readable summary goes to stderr, where
 * an operator reading the terminal still sees it and a pipe does not.
 */
const say = (line: string): void => {
  process.stderr.write(`${LIST_TENANCY_PREFIX}${line}\n`);
};

type Args = {
  /** Absent ⇔ every org on the host, names only. Present ⇔ that org in full. */
  readonly org: string | undefined;
};

const USAGE = "list-tenancy [--org <org_id>]";

export const parseListTenancyArgs = (argv: readonly string[]): Args => {
  const { values } = parseArgs({
    args: [...argv],
    options: { org: { type: "string" } },
    strict: true,
  });
  return { org: values.org === undefined || values.org === "" ? undefined : values.org };
};

/**
 * The document this command prints.
 *
 * Two shapes rather than one, because the two questions are different: *"what tenants are on this
 * host"* is answered by a list of orgs and is the one you ask first, while *"is org X provisioned
 * correctly"* wants its branches, its people and its tills together — that is the check that
 * catches `BOOTSTRAP_ORG_ID` disagreeing with a device's `branch_id`, which is the silent
 * four-process failure `running-the-stack.md` §0 exists to warn about.
 */
export type TenancyListing = {
  readonly orgs: readonly {
    readonly org_id: string;
    readonly display_name: string;
    readonly status: string;
    readonly created_at: number;
    /** Present only when the org was named with `--org`. */
    readonly branches?: readonly unknown[];
    readonly users?: readonly unknown[];
    readonly devices?: readonly unknown[];
  }[];
};

export const readTenancy = async (db: GatewayDb, args: Args): Promise<TenancyListing> => {
  const orgs = await listOrgs(db);
  if (args.org === undefined) return { orgs };

  const org = orgs.find((candidate) => candidate.org_id === args.org);
  if (org === undefined) {
    // A refusal rather than an empty document, because an empty one is indistinguishable from an
    // org that exists and has nothing in it — and those two states want opposite next actions.
    // ⚠ An org with EVENTS and no record is UNNAMED, not invalid (`01-F68`), so this says "no
    // record" and never "no such org": the ledger may well be full of its sales.
    throw new Error(
      `org ${args.org} has no directory record on this host. That does NOT mean it has no ` +
        "ledger: an org with events and no record is UNNAMED, not invalid (01-F68), and this " +
        "command reads the directory only. Run create-org --org " +
        `${args.org} --name "<what the restaurant calls itself>" to name it, or list-tenancy with ` +
        "no --org to see what is here.",
    );
  }

  return {
    orgs: [
      {
        ...org,
        branches: await listBranches(db, args.org),
        users: await listUsers(db, args.org),
        // The registry read the back office's `14-F12` list already uses — one interpretation of
        // "this org's devices", not a second one written here.
        devices: await listDevices(db, args.org),
      },
    ],
  };
};

const main = async (): Promise<void> => {
  const args = parseListTenancyArgs(process.argv.slice(2));
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
  });

  const db = drizzle(env.DATABASE_URL);
  try {
    const listing = await readTenancy(db, args);
    const scope = args.org === undefined ? "every org on this host" : `org ${args.org} in full`;
    say(`${scope} · ${listing.orgs.length} org(s) · ${redactedDsn(env.DATABASE_URL)}`);
    if (args.org === undefined && listing.orgs.length === 0) {
      say(
        "no orgs are provisioned here. That is the state a fresh database is in — run create-org. " +
          "It does NOT mean the ledger is empty: events under an unnamed org fold and sync as " +
          "normal (01-F68).",
      );
    }
    say(
      "app version, last-seen and sync lag are NOT reported: this service stores none of them " +
        "(15-F11's device pipeline is unbuilt), and showing a plausible value would be worse " +
        "than showing none (00 §5.7).",
    );
    process.stdout.write(`${JSON.stringify(listing, null, 2)}\n`);
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
