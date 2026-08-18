/**
 * **THE SEAM BETWEEN THE TENANCY DIRECTORY AND A TENANT THAT CAN ACTUALLY BE ONBOARDED.**
 * `01-F68` / `01-F69` / `01-F70` / `11-F20` / `15-F25` / `15-F26` / `15-F27`.
 *
 * The schema landed in `0010`/`0011` and `packages/domain/src/tenancy.ts` declared the records —
 * both correct, both tested, and **neither reachable**. This service's own `CLAUDE.md` said so in
 * as many words ("STORAGE ONLY: THEY HAVE NO WRITER YET") and `tenancy.ts` carried the debt marker
 * ("NOTHING CONSTRUCTS THESE YET"). Meanwhile the only org a running deployment had was three
 * environment variables in `services/api`, held in a `Map` that dies with the process. So the
 * kernel was multi-tenant and the product could onboard exactly one tenant, once, until restart.
 *
 * So this file, like `provisionable.test.ts`, `revocable.test.ts` and `migratable.test.ts` beside
 * it, reads nothing's mind: it runs the **declared scripts** from `package.json`, in **separate
 * processes**, against a **real Postgres**, and then asks the DATABASE what is true. Executing the
 * declared string is the point (`startable.test.ts`'s M1) — a test that hardcoded
 * `tsx src/create-org.ts` would keep passing after someone deleted the script, and "the script does
 * not exist" is the exact state this service was in for `start`, for `migrate`, and for every one
 * of these four.
 *
 * **THE ANTI-VACUITY GUARDS ARE THE PART TO READ.** Every write assertion is preceded by its own
 * two-sided half: the row is asked for BEFORE the command and required to be absent, so a suite
 * that had accidentally provisioned its fixture elsewhere fails rather than passing. Every refusal
 * assertion checks that **nothing was written**, so a command that complained *after* writing fails
 * rather than passing for having complained — `provisionable.test.ts` §D's discipline.
 *
 * **AND ONE ASSERTION IS NOT ABOUT A ROW AT ALL:** §D verifies the stored `password_hash` against
 * the plaintext the command printed, using the product's own `verifyPin`. A user row whose
 * credential does not open is `15-F26`'s "no org exists that nobody can administer" failing
 * silently, and no column check can see it.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { newId, PIN_ARGON2ID_PARAMS, verifyPin } from "@restos/domain";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CREATE_BRANCH_PREFIX } from "../create-branch.js";
import { CREATE_ORG_PREFIX } from "../create-org.js";
import { CREATE_OWNER_PREFIX } from "../create-owner.js";
import { LIST_TENANCY_PREFIX } from "../list-tenancy.js";
import { closeDb, type Db, openDb, testDatabaseUrl } from "./helpers.js";

const PKG_DIR = resolve(import.meta.dirname, "..", "..");

/** ≥32 bytes — only `provision-device` needs it, and only in §E. */
const DEVICE_SECRET = "a-device-token-secret-of-at-least-32-bytes-for-the-tenancy-suite";

type Scripts = Record<string, string | undefined>;
type Ran = { readonly code: number | null; readonly out: string; readonly err: string };

let db: Db;
let scripts: Scripts;

const readScripts = async (): Promise<Scripts> => {
  const raw = await readFile(join(PKG_DIR, "package.json"), "utf8");
  return (JSON.parse(raw) as { scripts?: Scripts }).scripts ?? {};
};

/**
 * Runs a DECLARED script exactly as a package manager would — the command string through a shell,
 * from the package root, with the package's own `node_modules/.bin` on `PATH`. The script name is
 * read from `package.json`; nothing here knows what it expands to.
 */
const runScript = async (
  name: string,
  args: readonly string[],
  env: Record<string, string> = {},
): Promise<Ran> => {
  const declared = scripts[name];
  if (declared === undefined) throw new Error(`package.json declares no \`${name}\` script`);
  return new Promise<Ran>((done, fail) => {
    const child = spawn(`${declared} ${args.join(" ")}`, {
      shell: true,
      cwd: PKG_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${join(PKG_DIR, "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
        DATABASE_URL: testDatabaseUrl(),
        DEVICE_TOKEN_SECRET: DEVICE_SECRET,
        ...env,
      },
    });
    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      err += chunk;
    });
    child.on("error", (cause: Error) =>
      fail(new Error(`\`${declared}\` could not be spawned: ${cause.message}`)),
    );
    child.on("close", (code) => done({ code, out, err }));
  });
};

/**
 * stdout's LAST non-empty line — a package manager prints its own banner ahead of the script, which
 * is why the runbook pipes through `tail -1`, and every command here puts its prose on stderr
 * precisely so this is unambiguous.
 */
const lastLine = (ran: Ran): string => {
  const lines = ran.out.split("\n").filter((line) => line.trim() !== "");
  const last = lines[lines.length - 1];
  if (last === undefined)
    throw new Error(`nothing on stdout.\nstdout:\n${ran.out}\nstderr:\n${ran.err}`);
  return last.trim();
};

/** Shell-safe quoting for a name with spaces. The commands take free text (`00 §5.6`). */
const q = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/* ── the DATABASE's own answers. Never our code's. ──────────────────────────── */

type OrgRow = { display_name: string; status: string; created_at: number };
const orgRow = async (orgId: string): Promise<OrgRow | undefined> => {
  const rows = await db.execute(
    sql`select display_name, status, created_at from kernel.orgs where org_id = ${orgId}`,
  );
  const row = [...rows][0];
  return row === undefined
    ? undefined
    : {
        display_name: String(row.display_name),
        status: String(row.status),
        created_at: Number(row.created_at),
      };
};

type BranchRow = {
  org_id: string;
  display_name: string;
  branch_type: string;
  branch_class: string;
};
const branchRow = async (branchId: string): Promise<BranchRow | undefined> => {
  const rows = await db.execute(
    sql`select org_id, display_name, branch_type, branch_class from kernel.branches
        where branch_id = ${branchId}`,
  );
  const row = [...rows][0];
  return row === undefined
    ? undefined
    : {
        org_id: String(row.org_id),
        display_name: String(row.display_name),
        branch_type: String(row.branch_type),
        branch_class: String(row.branch_class),
      };
};

type UserRow = {
  user_id: string;
  email: string;
  display_name: string;
  password_hash: string;
  assignments: unknown;
  grid_ordinal: number;
};
const usersOf = async (orgId: string): Promise<UserRow[]> => {
  const rows = await db.execute(
    sql`select user_id, email, display_name, password_hash, assignments, grid_ordinal
        from kernel.users where org_id = ${orgId} order by grid_ordinal asc`,
  );
  return [...rows].map((row) => ({
    user_id: String(row.user_id),
    email: String(row.email),
    display_name: String(row.display_name),
    password_hash: String(row.password_hash),
    assignments: row.assignments,
    grid_ordinal: Number(row.grid_ordinal),
  }));
};

describe("services/sync-gateway can provision a TENANT (15-F27 — the seam to a second restaurant)", () => {
  beforeAll(async () => {
    db = openDb();
    scripts = await readScripts();
  }, 60_000);

  afterAll(async () => {
    await closeDb(db);
  });

  it("§A declares the four tenancy scripts, each pointing at its own entry point", async () => {
    // The weakest assertions in the file, here only to name WHICH scripts everything below runs.
    for (const [name, file] of [
      ["create-org", "src/create-org.ts"],
      ["create-branch", "src/create-branch.ts"],
      ["create-owner", "src/create-owner.ts"],
      ["list-tenancy", "src/list-tenancy.ts"],
    ] as const) {
      expect(
        scripts[name],
        `no \`${name}\` script — a tenant can only be created with SQL`,
      ).toBeDefined();
      expect(scripts[name]).toContain(file);
    }
  });

  it("§B create-org writes a NAMED, ACTIVE org and mints an id that did not exist before", async () => {
    // ⚠ **The two-sided guard is per-ORG, never a global `count(*)`.** `helpers.ts` states the
    // isolation convention this whole suite runs on — *"Per-test isolation is fresh org_ids, never
    // truncation, so a single container serves every file"* — and vitest's `forks` pool runs FILES
    // in parallel against that one database. A global row count is therefore a race, measured: it
    // read 3 where 1 was expected on the first run of this file. The claim that matters is that
    // THIS id did not exist before the command and does after, which is exactly what is asserted.
    const ran = await runScript("create-org", ["--name", q("Karachi Biryani House")]);
    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);
    expect(ran.err).toContain(CREATE_ORG_PREFIX);

    const orgId = lastLine(ran);
    // The id is on STDOUT ALONE, because `ORG_ID=$(… create-org …)` is how every later step gets
    // it, and an id read off a log line is how BOOTSTRAP_ORG_ID ends up disagreeing with a device.
    expect(orgId).not.toContain(" ");

    const row = await orgRow(orgId);
    expect(row?.display_name).toBe("Karachi Biryani House");
    // `15-F25`: provisioning lands in `active`, and there is deliberately no third state.
    expect(row?.status).toBe("active");
    expect(row?.created_at).toBeTypeOf("number");

    // Exactly one row carries this id, and the id is a UUIDv7 the command minted — so "it did not
    // exist before" is a property of the id rather than of a count another file can move.
    const mine = await db.execute(
      sql`select count(*)::int as n from kernel.orgs where org_id = ${orgId}`,
    );
    expect(Number([...mine][0]?.n ?? 0)).toBe(1);
  }, 120_000);

  it("§B2 re-running is a NO-OP; a re-run under a DIFFERENT name is REFUSED and changes nothing", async () => {
    const orgId = newId();
    expect(
      (await runScript("create-org", ["--org", orgId, "--name", q("Lahore Karahi")])).code,
    ).toBe(0);
    const first = await orgRow(orgId);

    // Idempotent: provisioning must be safe to repeat, because the moment you doubt whether step 1
    // ran is the moment you run it again (`15-F27`).
    const again = await runScript("create-org", ["--org", orgId, "--name", q("Lahore Karahi")]);
    expect(again.code, `a re-run failed:\n${again.err}`).toBe(0);
    expect(again.err).toContain(CREATE_ORG_PREFIX);
    expect(lastLine(again)).toBe(orgId);
    // ⚠ **THE NO-OP CLAIM IS THIS LINE, NOT A WORD ON THE TERMINAL.** An earlier draft asserted the
    // narration contained "ALREADY" and the PROSE-ONLY control mutant killed it — a suite keying on
    // wording rather than on behaviour, which is the vacuity the round-3 law is about. `created_at`
    // is inside `first`, so an insert-or-overwrite that produced identical-looking output fails
    // here while a true no-op passes.
    expect(await orgRow(orgId)).toEqual(first);

    // But it never RENAMES: a rename is 14-F2/14-F30 from an authenticated surface, never a side
    // effect of re-running a script with a typo in it. Matched on the FR ids, which are the stable
    // contract (commandment 9), rather than on a sentence anyone may reword.
    const renamed = await runScript("create-org", ["--org", orgId, "--name", q("Lahore Karahi 2")]);
    expect(renamed.code, "create-org renamed an existing org").not.toBe(0);
    expect(`${renamed.err}${renamed.out}`).toContain("14-F2");
    expect(await orgRow(orgId), "a refused rename still wrote").toEqual(first);
  }, 120_000);

  it("§B3 a name that renders as NOTHING is refused, and nothing is written (21-F15)", async () => {
    const orgId = newId();
    const ran = await runScript("create-org", ["--org", orgId, "--name", q("   ")]);
    expect(ran.code, "an org was created with a blank name").not.toBe(0);
    expect(await orgRow(orgId)).toBeUndefined();

    // And --name absent at all is refused BY NAME (01-F68 makes it required).
    const missing = await runScript("create-org", []);
    expect(missing.code).not.toBe(0);
    expect(`${missing.err}${missing.out}`).toContain("--name");
  }, 120_000);

  it("§C create-branch REFUSES an org with no record — the check the schema cannot make", async () => {
    // ⚠ This is the assertion that matters most in this file. `01-F68` forbids a foreign key and
    // `0010` extended that to `branches.org_id`, so without this refusal a typo'd --org produces a
    // branch under an org that does not exist, and NO query anywhere reports it.
    const orphanOrg = newId();
    const branchId = newId();
    const refused = await runScript("create-branch", [
      ...["--org", orphanOrg],
      ...["--branch", branchId],
      ...["--name", q("Gulberg")],
    ]);
    expect(refused.code, "a branch was created under an org with no record").not.toBe(0);
    expect(`${refused.err}${refused.out}`).toContain("create-org");
    expect(await branchRow(branchId), "a refused branch still wrote a row").toBeUndefined();

    // ── the two-sided half: the SAME command succeeds once the org exists, so the refusal above is
    // attributable to the missing org and not to anything else about the arguments.
    const org = lastLine(await runScript("create-org", ["--org", orphanOrg, "--name", q("Bundu")]));
    expect(org).toBe(orphanOrg);
    const ok = await runScript("create-branch", [
      ...["--org", orphanOrg],
      ...["--branch", branchId],
      ...["--name", q("Gulberg")],
    ]);
    expect(ok.code, `stdout:\n${ok.out}\nstderr:\n${ok.err}`).toBe(0);
    expect(ok.err).toContain(CREATE_BRANCH_PREFIX);
    expect(lastLine(ok)).toBe(branchId);

    const row = await branchRow(branchId);
    expect(row?.org_id).toBe(orphanOrg);
    expect(row?.display_name).toBe("Gulberg");
    // The two discriminators default and are ECHOED — `01-F25` type, `01-F49` class.
    expect(row?.branch_type).toBe("branch");
    expect(row?.branch_class).toBe("production");
    expect(ok.err).toContain("production");
  }, 180_000);

  it("§C2 the two discriminators are CLOSED SETS, validated at the writer (no CHECK in Postgres)", async () => {
    const orgId = lastLine(await runScript("create-org", ["--name", q("Peshawar Chapli")]));
    const branchId = newId();
    const bad = await runScript("create-branch", [
      ...["--org", orgId],
      ...["--branch", branchId],
      ...["--name", q("Saddar")],
      ...["--class", "sandbox"],
    ]);
    expect(bad.code, '"sandbox" was accepted as a branch class').not.toBe(0);
    expect(`${bad.err}${bad.out}`).toContain("production");
    expect(await branchRow(branchId)).toBeUndefined();

    // A training branch is a REAL branch — `01-F49`: there is no training flag anywhere in the
    // kernel, the class IS the mechanism.
    const training = await runScript("create-branch", [
      ...["--org", orgId],
      ...["--branch", branchId],
      ...["--name", q("Training")],
      ...["--type", "prep_kitchen"],
      ...["--class", "training"],
    ]);
    expect(training.code, training.err).toBe(0);
    const row = await branchRow(branchId);
    expect(row?.branch_type).toBe("prep_kitchen");
    expect(row?.branch_class).toBe("training");
  }, 180_000);

  it("§D create-owner writes a REAL, PERSISTED owner whose printed credential OPENS the account", async () => {
    const orgId = lastLine(await runScript("create-org", ["--name", q("Quetta Sajji")]));
    expect(await usersOf(orgId), "the fixture org already had users").toEqual([]);

    const email = `owner-${orgId.slice(0, 8)}@example.test`;
    const ran = await runScript("create-owner", [
      ...["--org", orgId],
      ...["--email", email],
      ...["--name", q("Ayesha Khan")],
    ]);
    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);
    expect(ran.err).toContain(CREATE_OWNER_PREFIX);

    const [user] = await usersOf(orgId);
    expect(user?.email).toBe(email);
    // `11-F20`: the name is REQUIRED on the one record both planes read. Before this it was on
    // neither — the cloud user record carried no name at all.
    expect(user?.display_name).toBe("Ayesha Khan");
    // `15-F26`/`01-F26`: org-wide owner is `branch_id: null`, which is how Appendix A's
    // "everything" is held.
    //
    // ⚠ **AMENDED 2026-08-18 — the assignment RECORD gained a field; this test's claim did not
    // change.** `11-F22` was disambiguated in August 2026: participation is per-(person, branch)
    // and rides `01-F26`'s assignment, because a cashier transferring A→B must be "`inactive` in
    // A's roster and `active` in B's at the same moment" and no per-person value can express that.
    // So `PersonAssignment` requires a `status` and this exact-equality pin had to move with it —
    // the `branch_id: null` claim above is untouched and is still asserted exactly as strongly.
    // `active` is the only value a first owner could be given: she is created in order to sign in.
    // ⚠ Amended by the session IMPLEMENTING `11-F22`, which normally may not edit an oracle
    // (`24 §3`, `24-F5`). Recorded rather than done quietly: a green test defending an overruled
    // rule is AGENTS.md's named trap, and the alternative was to leave a pin that no correct
    // implementation of `11-F22` can satisfy.
    expect(user?.assignments).toEqual([{ role: "owner", branch_id: null, status: "active" }]);
    // `01-F61`: an EXPLICIT grid position, so a later hire appends instead of reshuffling tiles.
    expect(user?.grid_ordinal).toBe(0);

    // ⚠ THE ASSERTION NO COLUMN CHECK CAN MAKE. The stored hash must actually open with the
    // plaintext the command printed — otherwise `15-F26`'s "no org exists that nobody can
    // administer" fails silently and the row looks perfect.
    const password = lastLine(ran);
    expect(password.length).toBeGreaterThan(20);
    expect(await verifyPin(user?.password_hash ?? "", password)).toBe(true);
    // Two-sided: a hash that verified everything would pass the line above.
    expect(await verifyPin(user?.password_hash ?? "", `${password}x`)).toBe(false);

    // `01-F26`'s single hashing story at `01-F61`'s cost floor — the PHC string says which
    // parameters were used, and a command that quietly hashed cheaper would pass every test above.
    const { m, t, p } = PIN_ARGON2ID_PARAMS;
    expect(user?.password_hash).toContain(`$argon2id$v=19$m=${m},t=${t},p=${p}$`);

    // The plaintext is on STDOUT ALONE and never in the prose — a credential in a log line is a
    // credential in a log store.
    expect(ran.err).not.toContain(password);
  }, 180_000);

  it("§D2 a SECOND owner is refused, an unknown org is refused, a duplicate email is refused", async () => {
    const orgId = lastLine(await runScript("create-org", ["--name", q("Multan Sohan")]));
    const email = `first-${orgId.slice(0, 8)}@example.test`;
    expect(
      (
        await runScript("create-owner", [
          ...["--org", orgId],
          ...["--email", email],
          ...["--name", q("Hina Raza")],
        ])
      ).code,
    ).toBe(0);
    const after = await usersOf(orgId);

    // `15-F26` creates the FIRST owner; a second is `14-F14`'s CRUD. A "no-op" is not available
    // here the way it is for create-org: the password is minted, so a silent re-run would either
    // print a secret that does not work or reset a credential somebody is using.
    const second = await runScript("create-owner", [
      ...["--org", orgId],
      ...["--email", `second-${orgId.slice(0, 8)}@example.test`],
      ...["--name", q("Bilal Ahmed")],
    ]);
    expect(second.code, "a second owner was provisioned").not.toBe(0);
    expect(`${second.err}${second.out}`).toContain("14-F14");
    expect(await usersOf(orgId), "a refused owner still wrote a row").toEqual(after);

    // Ordering, again enforced at the writer because there is no foreign key.
    const orphan = newId();
    const noOrg = await runScript("create-owner", [
      ...["--org", orphan],
      ...["--email", `x-${orphan.slice(0, 8)}@example.test`],
      ...["--name", q("Nobody")],
    ]);
    expect(noOrg.code).not.toBe(0);
    expect(`${noOrg.err}${noOrg.out}`).toContain("create-org");
    expect(await usersOf(orphan)).toEqual([]);

    // Emails are unique CASE-FOLDED and globally — the login lookup takes an email and nothing
    // else, so two rows one lookup cannot choose between must not exist.
    const otherOrg = lastLine(await runScript("create-org", ["--name", q("Sialkot Grill")]));
    const clash = await runScript("create-owner", [
      ...["--org", otherOrg],
      ...["--email", email.toUpperCase()],
      ...["--name", q("Same Address")],
    ]);
    expect(clash.code, "a case-variant duplicate email was accepted").not.toBe(0);
    expect(await usersOf(otherOrg)).toEqual([]);
  }, 240_000);

  it("§D3 a PASSWORD is never an input — --password and --password-hash are refused BY NAME", async () => {
    // `15-F26`: the vendor never holds a restaurant's password. An IGNORED flag would be the worst
    // outcome available: the operator believes they set one, the command prints a different one,
    // and their chosen plaintext is in the shell history for nothing. `parseArgs` runs `strict`.
    const orgId = lastLine(await runScript("create-org", ["--name", q("Hyderabad Rabri")]));
    for (const flag of ["--password", "--password-hash", "--pin"]) {
      const ran = await runScript("create-owner", [
        ...["--org", orgId],
        ...["--email", `pw-${orgId.slice(0, 8)}@example.test`],
        ...["--name", q("Someone")],
        ...[flag, "hunter2"],
      ]);
      expect(ran.code, `${flag} was accepted`).not.toBe(0);
      expect(await usersOf(orgId)).toEqual([]);
    }
  }, 240_000);

  it("§E list-tenancy reports the whole tenant back — and never invents what it does not store", async () => {
    const orgId = lastLine(await runScript("create-org", ["--name", q("Islamabad Kabab")]));
    const branchId = newId();
    expect(
      (
        await runScript("create-branch", [
          ...["--org", orgId],
          ...["--branch", branchId],
          ...["--name", q("Blue Area")],
        ])
      ).code,
    ).toBe(0);
    expect(
      (
        await runScript("create-owner", [
          ...["--org", orgId],
          ...["--email", `list-${orgId.slice(0, 8)}@example.test`],
          ...["--name", q("Sana Malik")],
        ])
      ).code,
    ).toBe(0);
    const deviceId = newId();
    expect(
      (
        await runScript("provision-device", [
          ...["--org", orgId],
          ...["--branch", branchId],
          ...["--device", deviceId],
          ...["--class", "counter_electron"],
          ...["--name", q("Counter till")],
        ])
      ).code,
    ).toBe(0);

    const ran = await runScript("list-tenancy", ["--org", orgId]);
    expect(ran.code, `stdout:\n${ran.out}\nstderr:\n${ran.err}`).toBe(0);
    expect(ran.err).toContain(LIST_TENANCY_PREFIX);

    // stdout is JSON and NOTHING else — `… | jq` has to work, so the prose is on stderr.
    const document = JSON.parse(ran.out) as {
      orgs: {
        org_id: string;
        display_name: string;
        status: string;
        branches: { branch_id: string; display_name: string }[];
        users: { display_name: string; email: string }[];
        devices: { device_id: string; display_name: string | null }[];
      }[];
    };
    const org = document.orgs[0];
    expect(org?.org_id).toBe(orgId);
    expect(org?.display_name).toBe("Islamabad Kabab");
    expect(org?.status).toBe("active");
    expect(org?.branches.map((b) => b.display_name)).toEqual(["Blue Area"]);
    expect(org?.users.map((u) => u.display_name)).toEqual(["Sana Malik"]);
    // `01-F70` end to end: the till has a NAME here, which is the whole complaint the FR opens with.
    expect(org?.devices).toEqual([
      expect.objectContaining({ device_id: deviceId, display_name: "Counter till" }),
    ]);

    // ⚠ `00 §5.7`: what this service does not store is ABSENT, never invented. `15-F11` wants app
    // version, last-seen and sync lag; a plausible value would be worse than none.
    for (const absent of ["last_seen", "app_version", "sync_lag"]) {
      expect(JSON.stringify(document)).not.toContain(absent);
    }
    // The credential never leaves its row, not even into a listing.
    expect(ran.out).not.toContain("$argon2id$");

    // And a password hash column exists on that user, so the absence above is a projection choice
    // rather than an empty table.
    expect((await usersOf(orgId))[0]?.password_hash).toContain("$argon2id$");
  }, 240_000);

  it("§E2 list-tenancy REFUSES an org with no record — and says why that is not 'no such org'", async () => {
    const orphan = newId();
    const ran = await runScript("list-tenancy", ["--org", orphan]);
    expect(ran.code).not.toBe(0);
    // `01-F68`: an org with events and no record is UNNAMED, not invalid. A command that said
    // "no such org" would be asserting something about a LEDGER it never read.
    expect(`${ran.err}${ran.out}`).toContain("UNNAMED");

    // With no --org it enumerates instead, and never refuses: "what tenants are on this host" is
    // the question a fresh operator asks first, and an empty answer is a legitimate one.
    const all = await runScript("list-tenancy", []);
    expect(all.code, all.err).toBe(0);
    const listed = JSON.parse(all.out) as { orgs: { org_id: string }[] };
    expect(listed.orgs.length).toBeGreaterThan(0);
    expect(listed.orgs.map((o) => o.org_id)).not.toContain(orphan);
  }, 120_000);
});
