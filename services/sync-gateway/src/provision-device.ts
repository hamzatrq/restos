// **THE DEVICE-PROVISIONING PATH — `pnpm -C services/sync-gateway provision-device` (August 2026).**
//
// Until this landed, nothing in this product minted a device credential. To bring a second till up
// you followed `plans/wave-1/running-the-stack.md` §6b: a `tsx -e` one-liner that reached into
// `src/auth.ts` for `issueDeviceToken`, and then a hand-written `INSERT` into `kernel.device_registry`
// — a protected service's table, edited with psql. `registry.ts`'s `registerDevice` carried a
// `seams:check` debt marker saying so in as many words: *"a device is provisioned only by a test or
// by hand-written SQL"*. That is AGENTS.md's recurring defect in the shape `migrate.ts` was in a
// week ago: the subsystem is correct, tested, and has no way to be invoked.
//
// (The marker token is deliberately not spelled out anywhere in this file. A marker in a FILE
// HEADER covers every export in the module, so quoting it in this paragraph silently marked all
// three exports below as debt — measured on this change: `seams:check` went from a hard failure to
// a clean run that had quietly muted the new file. `migrate.ts` carries the same warning.)
//
// **WHAT SHAPE, AND WHY THIS ONE** (`24 §3b` — the alternatives, not a silent pick):
//
//   - **A declared command on this service (chosen).** It is the shape `migrate` already set, and
//     the decisive property is that **it grants no authority that its inputs did not already carry**:
//     it needs `DEVICE_TOKEN_SECRET` *and* `DATABASE_URL`, and anyone holding both can already mint a
//     token (`issueDeviceToken` is exported) and already write the registry row — that is literally
//     what §6b instructed. So this narrows a two-step manual procedure into one declared step and
//     removes a footgun (below); it does not widen the blast radius.
//   - **An `/internal` route behind `PUBLISH_TOKEN` (rejected).** `PUBLISH_TOKEN` is the *menu*
//     credential, held by `services/api`. Minting device credentials behind it would mean anything
//     that can publish a menu can admit a device to the org's ledger — two very different powers
//     behind one secret, crossed silently. `18 §5`'s reason for a 32-byte floor on that key is that
//     it is "the ONLY thing standing between a reachable port and the org's menu"; it should not
//     quietly also stand in front of admission.
//   - **A back-office operator surface (rejected FOR NOW — it is the correct end state, and OWED).**
//     `01-F25` is explicit: *"Registration is a one-time pairing via back office code"*, and
//     `14-F26` puts "devices (pairing codes)" in the onboarding wizard. That is the product answer.
//     It is not this session's, for a commandment-2 reason rather than a scheduling one: the
//     pairing-code *model* — how a code is minted, how long it lives, that it is claimed once, what
//     binds it to a class and a branch — appears in the corpus only as that one clause, so building
//     it means inventing policy. The rest of what `01-F47` covers and this does not is listed at the
//     bottom of this comment.
//   - **Device self-registration on first connect (rejected).** `01-F40`: slice predicates are
//     enforced from device class and role and are "never client-declared". A device that registers
//     itself declares its own class.
//
// **THE FOOTGUN IT REMOVES, and it is not hypothetical.** §6b's `INSERT` ended
// `on conflict (org_id, device_id) do update set revoked_at = null` — so re-running the documented
// provisioning step **un-revokes a revoked device**. `01-F25` and `01-F48` make revocation the
// operative kill switch (`01-F47`: *"revocation remains the operative kill switch"*), and a
// provisioning path that resurrects a revoked till by default inverts it. This command refuses a
// revoked row in **both** of its modes and says why.
//
// **WHAT `01-F47` COVERS THAT THIS DOES NOT** (named here rather than left to look intentional):
// silent renewal *persistence* on the device — the FR puts it in `sync-client`, not the host app,
// and `apps/pos-electron` still takes its token from `RESTOS_DEVICE_TOKEN` on every launch; the
// host-app warning at <25% remaining life; and `hub_relay` (`01-F39`), which this command never
// grants because no mesh session exists to use it. `01-F25`'s pairing code is owed in full.

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { defineEnv, redactedDsn } from "@restos/config";
import { DisplayName } from "@restos/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import { DEVICE_TOKEN_TTL_MS, issueDeviceToken } from "./auth.js";
import { DATABASE_URL_DEFAULT } from "./database-url.js";
import type { GatewayDb } from "./gateway.js";
import {
  readDeviceName,
  readRegistryRow,
  recordDeviceName,
  recordTokenExpiry,
  registerDevice,
} from "./registry.js";

/**
 * The command's own narrative prefix, exported so `__acceptance__/provisionable.test.ts` matches
 * THIS string rather than a hand-copy of it (round-3 law, `K-3`: a copied literal keeps passing
 * against a command that no longer says it — both of `K-3`'s oracle symbols were dead exports).
 */
export const PROVISION_PREFIX = "@restos/sync-gateway provision-device ";

/**
 * **stdout carries the TOKEN and nothing else; every human-readable line goes to stderr.**
 *
 * Two reasons, and the first is the one with teeth. A device token is a credential — `18 §5` keeps
 * the DSN's password out of everything this service prints for exactly that reason — and the only
 * way to get one to a till is to emit it, so the emission is deliberately as narrow as it can be:
 * one line, one stream, nothing else on it. `TOKEN=$(… provision-device …)` therefore captures the
 * credential and not a paragraph, and a `2>/dev/null` never silently swallows the token instead of
 * the prose. (`| tail -1` is still in the runbook because a package manager prints its own banner.)
 */
const say = (line: string): void => {
  process.stderr.write(`${PROVISION_PREFIX}${line}\n`);
};

type Args = {
  readonly org: string;
  readonly branch: string;
  readonly device: string;
  readonly deviceClass: string;
  /** `01-F70`'s human label. REQUIRED — see the note under `parseProvisionArgs`. */
  readonly name: string;
  readonly reissue: boolean;
};

const USAGE =
  "provision-device --org <org_id> --branch <branch_id> --device <device_id> " +
  '--class <device_class> --name "<human name>" [--reissue]';

/**
 * Arguments, not configuration. They are `parseArgs` flags rather than env keys on purpose: an env
 * key that names a specific device would read as a `00 §7` config layer, which is what a device
 * identity is emphatically not. Secrets stay in env, where the rest of this service keeps them.
 *
 * ⚠ **`--name` IS REQUIRED, AND `01-F70` REQUIRES IT TO BE (August 2026).** *"Required at
 * registration, on `01-F65`'s discipline: an absent name is refused, naming the argument an operator
 * must supply, **so a nameless device cannot be created and named later — which never happens.**"*
 * The FR's own measured complaint is that `14-F12`'s device list and `15-F11`'s fleet dashboard could
 * name a till only by its UUID while the operator reading either is by construction not standing in
 * front of it. **The simpler alternative — an optional flag with a warning — was rejected as the
 * thing the FR names**: an optional label is a label the busy path never sets, and the busy path is
 * the only one that ever provisions a device. It cost two fixture helpers in the acceptance suites,
 * which is the price of a required argument and not a reason to soften one.
 */
export const parseProvisionArgs = (argv: readonly string[]): Args => {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      org: { type: "string" },
      branch: { type: "string" },
      device: { type: "string" },
      class: { type: "string" },
      name: { type: "string" },
      reissue: { type: "boolean", default: false },
    },
    strict: true,
  });
  const missing = (["org", "branch", "device", "class", "name"] as const).filter(
    (key) => values[key] === undefined || values[key] === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `missing required argument(s): ${missing.map((k) => `--${k}`).join(", ")}\n${USAGE}\n` +
        (missing.includes("name")
          ? '--name is the device\'s HUMAN name ("Counter till", "Kitchen screen") — 01-F70 ' +
            "requires it AT REGISTRATION, because a device that may be named later never is, and " +
            "the operator reading 14-F12's device list is not standing in front of the till."
          : ""),
    );
  }
  return {
    org: values.org as string,
    branch: values.branch as string,
    device: values.device as string,
    deviceClass: values.class as string,
    name: values.name as string,
    reissue: values.reissue === true,
  };
};

/**
 * Register a device and mint its first token — or, with `--reissue`, mint a fresh token for a device
 * that is already registered.
 *
 * **ONE expiry instant, written twice.** `expires_at` is computed here and passed to BOTH
 * `issueDeviceToken` and the registry write. `registry.ts` names the hazard of not doing this: the
 * column would otherwise be seeded from the DATABASE clock while `01-F47`'s renewal logic judges it
 * against the gateway's INJECTED clock, so a freshly-provisioned device can read as permanently
 * not-due and never renew. Its doc comment ends "Pass the value." This is the caller that does.
 */
export const provisionDevice = async (
  db: GatewayDb,
  args: Args,
  tokenSecret: string,
  binding: { readonly issuer?: string; readonly audience?: string },
  now: number,
): Promise<{ readonly token: string; readonly expires_at: number; readonly reissued: boolean }> => {
  // `01-F70`'s non-empty rule, enforced through `packages/domain`'s `DisplayName` (`18 §2`) and
  // BEFORE anything is written or minted: `"   "`, a control character and a 121-code-point label
  // are refused here. `0010` declined a CHECK constraint precisely so this would be the one place
  // that decides what a name may be.
  const display_name = DisplayName.parse(args.name);

  const existing = await readRegistryRow(db, args.org, args.device);

  if (existing !== undefined && !args.reissue) {
    throw new Error(
      `device ${args.device} is already registered in org ${args.org} (branch ${existing.branch_id}, ` +
        `class ${existing.device_class}${existing.revoked_at === null ? "" : ", REVOKED"}). ` +
        "Registering a device twice is a provisioning error — re-registration mints a FRESH " +
        "device_id (01-N5), so a wiped device never collides with its old slot. To hand this " +
        "registered device a new credential instead, pass --reissue.",
    );
  }

  // **Revocation is never undone here, in either mode.** `01-F25`/`01-F48` make revocation the kill
  // switch and `01-F47` says so in as many words. The runbook's hand-written INSERT resurrected a
  // revoked row on conflict; refusing is the whole reason this step stopped being SQL.
  if (existing !== undefined && existing.revoked_at !== null) {
    throw new Error(
      `device ${args.device} is REVOKED (org ${args.org}). Provisioning never un-revokes: ` +
        "revocation is the operative kill switch (01-F25, 01-F47, 01-F48). Register the " +
        "replacement under a fresh device_id.",
    );
  }

  // The registry has the veto (`18 §5`: the registry, never the token, decides), so a token minted
  // for a branch the row disagrees with opens nothing at all — a silent nothing, exactly the class
  // of failure `running-the-stack.md` §0 exists to warn about. Loud here instead.
  if (existing !== undefined && existing.branch_id !== args.branch) {
    throw new Error(
      `device ${args.device} is registered to branch ${existing.branch_id}, not ${args.branch}. ` +
        "The registry decides admission, so a token minted for the wrong branch would be accepted " +
        "by nothing and report no error anywhere.",
    );
  }

  // **`--reissue` NEVER RENAMES, and it is not allowed to ignore `--name` either.** A required
  // argument the re-credentialling path silently discarded would be worse than an optional one: the
  // operator would believe they had corrected a label. So a stored name that disagrees is a refusal
  // pointing at `14-F30`, and a row `0010` left UNNAMED is filled below — filling a null is
  // `01-F68`'s reconciliation applied to a device, not a rename.
  const storedName =
    existing === undefined ? undefined : await readDeviceName(db, args.org, args.device);
  if (storedName !== undefined && storedName !== null && storedName !== display_name) {
    throw new Error(
      `device ${args.device} is named "${storedName}", not "${display_name}" (org ${args.org}). ` +
        "Provisioning creates; it never renames (15-F27). Renaming a device is device.manage " +
        "(14-F30) from the back office's device list (14-F12), where the change carries the actor " +
        "who made it — a command on this host has no authenticated user and could not record one. " +
        "Re-run with the stored name to re-issue the credential.",
    );
  }

  const expires_at = now + DEVICE_TOKEN_TTL_MS;
  const token = await issueDeviceToken(
    { org_id: args.org, branch_id: args.branch, device_id: args.device, expires_at },
    tokenSecret,
    binding,
  );

  if (existing === undefined) {
    await registerDevice(db, {
      org_id: args.org,
      branch_id: args.branch,
      device_id: args.device,
      device_class: args.deviceClass,
      // `01-F70`. Parsed through `packages/domain`'s `DisplayName` (`18 §2`), so `"   "`, a control
      // character and a 121-code-point label are refused before any row is written — which is where
      // `0010` said the non-empty rule would live when it declined a CHECK constraint.
      display_name,
      token_expires_at: expires_at,
    });
  } else {
    // `recordTokenExpiry` is documented as the SINGLE writer of this column, "called at mint and at
    // renewal". A hand-triggered re-mint is a mint; it goes through the same writer.
    await recordTokenExpiry(db, args.org, args.device, expires_at);
    // Fill a name `0010` left null. `recordDeviceName`'s `and display_name is null` clause is what
    // makes this incapable of renaming, whatever this branch is asked to do later.
    if (storedName === null) await recordDeviceName(db, args.org, args.device, display_name);
  }

  return { token, expires_at, reissued: existing !== undefined };
};

const main = async (): Promise<void> => {
  const args = parseProvisionArgs(process.argv.slice(2));
  const env = defineEnv({
    DATABASE_URL: (raw) => (raw === undefined || raw === "" ? DATABASE_URL_DEFAULT : raw),
    DEVICE_TOKEN_SECRET: (raw) => {
      // The same key and the same 32-byte floor `server.ts` enforces — a token minted under a
      // weaker secret than the one that verifies it would be a credential this service trusts and
      // `18 §5` does not.
      if (raw === undefined || raw === "") throw new Error("required (device-token HS256 secret)");
      if (Buffer.byteLength(raw, "utf8") < 32) {
        throw new Error("must be at least 32 bytes (HS256 device-token verification key, 18 §5)");
      }
      return raw;
    },
    // **Read here because the SERVER reads them.** `01-F47` binds a token to its deployment through
    // `iss`/`aud`, and `verifyDeviceToken` enforces each only when configured. A gateway started
    // with `DEVICE_TOKEN_ISSUER` set and a token minted without it is a perfectly-signed credential
    // that opens nothing — the adversarial-review B3 defect (the capability existed and the shipped
    // artifact did not exhibit it) reproduced one process over.
    DEVICE_TOKEN_ISSUER: (raw) => (raw === undefined || raw === "" ? undefined : raw),
    DEVICE_TOKEN_AUDIENCE: (raw) => (raw === undefined || raw === "" ? undefined : raw),
  });

  const db = drizzle(env.DATABASE_URL);
  try {
    const { token, expires_at, reissued } = await provisionDevice(
      db,
      args,
      env.DEVICE_TOKEN_SECRET,
      {
        ...(env.DEVICE_TOKEN_ISSUER === undefined ? {} : { issuer: env.DEVICE_TOKEN_ISSUER }),
        ...(env.DEVICE_TOKEN_AUDIENCE === undefined ? {} : { audience: env.DEVICE_TOKEN_AUDIENCE }),
      },
      Date.now(),
    );
    say(
      `${reissued ? "re-issued a token for registered device" : "registered"} ` +
        `"${args.name}" (${args.device}) · org ${args.org} · branch ${args.branch} · ` +
        `class ${args.deviceClass} · ${redactedDsn(env.DATABASE_URL)}`,
    );
    say(
      `token expires ${new Date(expires_at).toISOString()} (01-F47, 90 days). Binding: ` +
        `iss=${env.DEVICE_TOKEN_ISSUER ?? "(unbound)"} aud=${env.DEVICE_TOKEN_AUDIENCE ?? "(unbound)"} ` +
        "— these must match the gateway that will verify it.",
    );
    say("the next line on STDOUT is the device token. It is a credential: do not log it.");
    process.stdout.write(`${token}\n`);
  } finally {
    await db.$client.end({ timeout: 5 });
  }
};

// The same entry guard as `server.ts` and `migrate.ts`: importable without running (which is what
// the acceptance suite does to reach `provisionDevice` directly), runnable as the declared script.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    // Loud, never degraded (`18 §5`). A provisioning step that fails quietly leaves an operator
    // holding a token that opens nothing, which reads as "the catalog never arrived".
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
