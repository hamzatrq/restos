// **THE SECOND PROVISIONING STEP — `pnpm -C services/sync-gateway create-branch` (August 2026).**
//
// `01-F69`: a branch is a named record under exactly one org. `15-F4` creates branches at
// provisioning and said nothing about what it creates; `0010` added `kernel.branches` with no
// writer. Before this, a `branch_id` was a UUID an operator generated in a shell and threaded
// through `ENABLED_BRANCHES`, a device identity and a token — with nothing anywhere recording that
// it existed, let alone what the restaurant calls it.
//
// (The `seams:check` marker token is deliberately not spelled out anywhere in this file — a marker
// in a FILE HEADER covers every export in the module. `create-org.ts` carries the same warning and
// names the four files that learned it the hard way.)
//
// **THE ORDERING REFUSAL IS THE POINT OF THIS FILE, and it exists because the SCHEMA deliberately
// cannot enforce it.** `01-F68` forbids a foreign key from any ledger table for a reason with teeth
// (an FK would refuse ingest for orgs whose events predate their record — refusing a sale a till
// has already rung, `01-F17`/`00 §5.1`), and `0010` extended that restraint to the directory's own
// edges: `branches.org_id` does not reference `kernel.orgs`. `schema.ts` says where the rule went
// instead — *"Ordering is the writer's job (15-F26 provisioning)"* — and this is that writer.
// Without the check below, `create-branch --org <typo>` succeeds, and the branch exists under an
// org that does not, which no query anywhere reports.
//
// **`--type` AND `--class` DEFAULT, AND `--device`'s CLASS DOES NOT** (`24 §3b`: the simpler
// alternative, stated). `provision-device` requires `--class` because `01-F39`'s device vocabulary
// has no majority member and a wrong one silently changes what the device is allowed to do
// (`01-F40`'s slice predicates). A branch's two discriminators are not like that: `01-F25`'s
// `branch` and `01-F49`'s `production` are what a restaurant's branches overwhelmingly are, and the
// two exceptions — a prep kitchen, a training branch — are things an operator sets out to create
// rather than forgets. The defaults are ECHOED on the confirmation line so a wrong one is visible
// at the moment it is made, which is the property that matters. Requiring both would be defensible
// and is the alternative not taken.

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defineEnv, redactedDsn } from "@restos/config";
import {
  BRANCH_CLASSES,
  BRANCH_TYPES,
  type BranchClass,
  type BranchRecordT,
  type BranchType,
  newId,
} from "@restos/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import { DATABASE_URL_DEFAULT } from "./database-url.js";
import type { GatewayDb } from "./gateway.js";
import { insertBranch, readBranch, readOrg } from "./tenancy.js";

/** Exported so the acceptance suite matches THIS string rather than a hand-copy (round-3, `K-3`). */
export const CREATE_BRANCH_PREFIX = "@restos/sync-gateway create-branch ";

/** stdout is the `branch_id` and nothing else — `create-org.ts` records why. */
const say = (line: string): void => {
  process.stderr.write(`${CREATE_BRANCH_PREFIX}${line}\n`);
};

type Args = {
  readonly org: string;
  readonly branch: string | undefined;
  readonly name: string;
  readonly branchType: BranchType;
  readonly branchClass: BranchClass;
};

const USAGE =
  "create-branch --org <org_id> --name <display_name> [--branch <branch_id>] " +
  `[--type ${BRANCH_TYPES.join("|")}] [--class ${BRANCH_CLASSES.join("|")}]`;

const oneOf = <T extends string>(
  values: readonly T[],
  raw: string | undefined,
  fallback: T,
  flag: string,
  fr: string,
): T => {
  if (raw === undefined || raw === "") return fallback;
  if ((values as readonly string[]).includes(raw)) return raw as T;
  // Named, never coerced: a closed set has ONE interpretation and it is `packages/domain`'s.
  throw new Error(`--${flag} "${raw}" is not one of ${values.join(" | ")} (${fr}).\n${USAGE}`);
};

export const parseCreateBranchArgs = (argv: readonly string[]): Args => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      org: { type: "string" },
      branch: { type: "string" },
      name: { type: "string" },
      type: { type: "string" },
      class: { type: "string" },
    },
    strict: true,
  });
  const missing = (["org", "name"] as const).filter(
    (key) => values[key] === undefined || values[key] === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `missing required argument(s): ${missing.map((k) => `--${k}`).join(", ")}\n${USAGE}`,
    );
  }
  return {
    org: values.org as string,
    branch: values.branch === undefined || values.branch === "" ? undefined : values.branch,
    name: values.name as string,
    branchType: oneOf(BRANCH_TYPES, values.type, "branch", "type", "01-F25"),
    branchClass: oneOf(BRANCH_CLASSES, values.class, "production", "class", "01-F49"),
  };
};

export type CreateBranchOutcome = {
  readonly branch: BranchRecordT;
  readonly org_name: string;
  /** True when the row already existed identically and this run wrote nothing. */
  readonly already: boolean;
  readonly minted: boolean;
};

export const createBranch = async (
  db: GatewayDb,
  args: Args,
  now: number,
): Promise<CreateBranchOutcome> => {
  // `15-F27`'s ordering refusal. The schema cannot make this claim (no FK, `01-F68`), so it is made
  // here or nowhere — and "nowhere" means a branch under an org that does not exist, which reads as
  // a working provisioning run and shows up months later as a till nobody can name.
  const org = await readOrg(db, args.org);
  if (org === undefined) {
    throw new Error(
      `org ${args.org} has no record — nothing was written. A branch is "under exactly one org" ` +
        "(01-F69) and this directory carries no foreign key to enforce it (01-F68), so the check " +
        "is here. Run create-org first, or check the id: the ledger accepts events under an " +
        "unnamed org by design, so nothing else will ever tell you this was wrong.",
    );
  }

  const minted = args.branch === undefined;
  const branch: BranchRecordT = {
    branch_id: args.branch ?? newId(),
    org_id: args.org,
    display_name: args.name,
    branch_type: args.branchType,
    branch_class: args.branchClass,
    created_at: now,
  };

  const wrote = await insertBranch(db, branch);
  if (wrote) return { branch, org_name: org.display_name, already: false, minted };

  // Re-run, or a `--branch` id that is already taken. `readBranch` is keyed on `branch_id` ALONE
  // (`01-F69`'s primary key), so a branch that exists under a DIFFERENT org is found and named —
  // the one answer a `(org, branch)` lookup could not give, and the one that matters most here.
  const existing = await readBranch(db, branch.branch_id);
  if (existing === undefined) {
    throw new Error(
      `branch ${branch.branch_id} was not written and does not exist. Treat it as UNPROVISIONED.`,
    );
  }
  if (existing.org_id !== branch.org_id) {
    throw new Error(
      `branch ${branch.branch_id} already exists under org ${existing.org_id}, not ${branch.org_id}` +
        ' — it is called "' +
        existing.display_name +
        '". A branch is under EXACTLY ONE org (01-F69) and a branch_id is never reused. ' +
        "Run without --branch and let this command mint one.",
    );
  }
  const differs = (
    [
      ["name", existing.display_name, branch.display_name],
      ["type", existing.branch_type, branch.branch_type],
      ["class", existing.branch_class, branch.branch_class],
    ] as const
  ).filter(([, was, now_]) => was !== now_);
  if (differs.length > 0) {
    throw new Error(
      `branch ${branch.branch_id} already exists and differs: ` +
        differs.map(([field, was, now_]) => `${field} is "${was}", not "${now_}"`).join("; ") +
        ". Provisioning creates; it never renames or reclassifies (15-F27). A rename is a 14-F2 " +
        "settings change made by an authenticated human; a class change is not offered anywhere, " +
        "because a training branch's isolation IS its class (01-F49).",
    );
  }
  return { branch: existing, org_name: org.display_name, already: true, minted: false };
};

const main = async (): Promise<void> => {
  const args = parseCreateBranchArgs(process.argv.slice(2));
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
  });

  const db = drizzle(env.DATABASE_URL);
  try {
    const { branch, org_name, already, minted } = await createBranch(db, args, Date.now());
    say(
      `${already ? "branch ALREADY recorded (nothing changed):" : "created branch"} ` +
        `"${branch.display_name}" · org "${org_name}" (${branch.org_id}) · ` +
        `type ${branch.branch_type} · class ${branch.branch_class} · ` +
        `${redactedDsn(env.DATABASE_URL)}`,
    );
    // The two discriminators are echoed above whether they were typed or defaulted, and this line
    // says which — a default that is never shown is a default nobody notices was wrong.
    say(
      `type/class shown above are ${args.branchType === "branch" && args.branchClass === "production" ? "the defaults unless you passed them" : "as you passed them"}` +
        " — 01-F25 type, 01-F49 class. A training branch is a REAL branch with a real ledger; " +
        "nothing else in the kernel flags one.",
    );
    say(
      `${minted ? "minted" : "used the supplied"} branch_id. It is what a device's identity ` +
        "resolves against (01-F65) and what fan-out is keyed by (01-F71 d), so it must match " +
        "RESTOS_BRANCH_ID on every device here and appear in the API's ENABLED_BRANCHES.",
    );
    process.stdout.write(`${branch.branch_id}\n`);
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
