/**
 * # `01-F2` / `01-F13` — which device this is, and why it is a CONFIGURED value here
 *
 * `panel-density.ts`, `hardware-tier.ts` and `station-routing.ts` are the house pattern for a
 * `00 §7` key: a `resolveX` that reads the environment, a `describeX` that says at boot which
 * source was used, and the honest admission when the answer is an assumption. This is the same
 * pair, for the three ids that make a terminal *this* terminal.
 *
 * ## Why it exists — the defect it closes, which no rail in this repo can see
 *
 * The three ids were a source constant with **no environment override**, while
 * `RESTOS_DEVICE_TOKEN` — the credential `provision-device` mints **for a specific `device_id`**
 * — was configurable. So the credential could be pointed at a second till and the identity it
 * authenticates could not: two counter terminals in one branch were producible only by editing
 * `main/index.ts` and rebuilding.
 *
 * Everything underneath was complete. `packages/sync-protocol` carries `push` / `push_ack` /
 * `event_batch` / `catchup_request` / `catchup_response`; `services/sync-gateway` ingests
 * idempotently **per origin** and merges into a per-org `global_seq`; `main/sync.ts` builds a real
 * `createCloudSession`, which drains the outbox and advances on `push_ack`. Not one export was
 * unreached and not one optional seam was unsupplied, so `pnpm seams:check` was clean and every
 * suite was green — the gateway proves its fan-out with two *synthetic* sessions inside one
 * process, which needs no second binary and therefore never asked for one.
 *
 * That is the wave's recurring defect in a **new shape**: not a dead export and not an unsupplied
 * optional, but *a correct, tested subsystem with no configuration by which the product can enter
 * the state that uses it*. `02-F11` — an order started on one till, visible on another — was not
 * merely unexercised in production; it was **unreachable from the shipped binary**.
 *
 * ## What it does NOT close
 *
 * `01-F25`'s pairing. Nothing here gives a device an identity — an operator types the same three
 * ids into `provision-device` on the service host and into this environment on the till, and a
 * mismatch is still silent. It closes only the narrower thing: that one of those two ends could
 * not be typed at all.
 */

/**
 * `01-F13` — a device's identity is issued at admission and persisted, never generated at boot.
 * This is a DEV SEED and is marked as one: a device that mints a fresh `device_id` every launch
 * would fork its own outbox on every restart. Admission (`01-F47`) replaces this and is Wave-1
 * work that has not landed; until it does, the ids are stable constants rather than `newId()`
 * calls so that a relaunch resumes the same store instead of orphaning it.
 */
export const DEV_IDENTITY = {
  org_id: "00000000-0000-7000-8000-000000000001",
  branch_id: "00000000-0000-7000-8000-000000000002",
  device_id: "00000000-0000-7000-8000-000000000003",
} as const;

export type DeviceIdentity = { [K in keyof typeof DEV_IDENTITY]: string };

/**
 * `00 §7` **layer 3**, per device — because these three values are the whole of what makes one
 * device distinguishable from another, which is not something an org-wide or branch-wide layer
 * can express.
 */
export const IDENTITY_ENV = {
  org_id: "RESTOS_ORG_ID",
  branch_id: "RESTOS_BRANCH_ID",
  device_id: "RESTOS_DEVICE_ID",
} as const;

/**
 * The identity to open the store with: each id from its own environment key, falling back to the
 * seed above.
 *
 * **Each key is independent on purpose.** A second till in the same branch differs in exactly one
 * id, so requiring all three would make the ordinary case retype two values it cannot change.
 *
 * **A value that is present but blank or padded REFUSES rather than falling back**, and that is
 * the whole of the validation, deliberately. Identity keys the outbox (`01-F8`) and `01-F1`
 * forbids unwinding a forked ledger, so a typo that silently resolved to the dev seed would be a
 * second `BOOTSTRAP_ORG_ID` — a join key with no error message, which is the failure
 * `plans/wave-1/running-the-stack.md` §0 exists to warn about. It is **not** a UUID check:
 * `provision-device` takes any non-empty string and `kernel.device_registry` stores `text`, so a
 * device stricter than the registry that admits it would refuse credentials that work.
 */
export const resolveDeviceIdentity = (env: Record<string, string | undefined>): DeviceIdentity => {
  const read = (key: keyof DeviceIdentity): string =>
    readIdentityKey(env, key) ?? DEV_IDENTITY[key];
  return { org_id: read("org_id"), branch_id: read("branch_id"), device_id: read("device_id") };
};

/**
 * One key, validated. `undefined` means ABSENT — what the caller does with that is the whole
 * difference between `resolveDeviceIdentity` and `requireDeviceIdentity`, and it is the only
 * difference, so the present-but-unusable refusal below cannot drift between them.
 */
const readIdentityKey = (
  env: Record<string, string | undefined>,
  key: keyof DeviceIdentity,
): string | undefined => {
  const name = IDENTITY_ENV[key];
  const raw = env[name];
  if (raw === undefined) return undefined;
  if (raw.trim() === "" || raw.trim() !== raw) {
    throw new Error(
      `${name} is set to ${JSON.stringify(raw)}, which is not a usable ${key}. A device ` +
        "identity keys its own outbox and cannot be corrected afterwards (01-F1, 01-F8), so " +
        `this refuses rather than falling back to the dev seed. Unset ${name} to use the seed, ` +
        "or set it to the exact value passed to `provision-device`.",
    );
  }
  return raw;
};

/**
 * `01-F65` — **the same three ids, with no seed under them.** An ABSENT key REFUSES here.
 *
 * `resolveDeviceIdentity` above falls back per key to `DEV_IDENTITY`, which is right for exactly
 * one host: `apps/pos-electron`, whose documented dev launch is `pnpm start` with no environment
 * and whose seed this is. It is wrong for every OTHER host on the same machine, because falling
 * back there does not produce an unconfigured device — it produces **the counter**. Two processes
 * answering to one `device_id` are one origin with two interleaved lamport sequences (`01-F3`),
 * both draining into one outbox (`01-F8`), in a log `01-F1` forbids unwinding. The pass screen
 * launched with no environment was that device, silently, and `apps/manager/src/branch.ts` had
 * already met and hand-refused the same hazard on the phone.
 *
 * **A separate entry point rather than a flag on the one above**, deliberately: an options
 * argument leaves the seed one keystroke away under the same name and cannot be grepped for at a
 * call site, which is how `01-F60`'s enabled set came to be declared twice. The host names which
 * discipline it is under, in a word a reader and a seam test can both find.
 *
 * Validation of a value that IS present is byte-identical to the resolver's, by construction: not
 * a UUID check, because `provision-device` mints a token for any non-empty string and
 * `kernel.device_registry` stores `text`, so a device stricter than the registry that admits it
 * would refuse credentials that work.
 */
export const requireDeviceIdentity = (env: Record<string, string | undefined>): DeviceIdentity => {
  const read = (key: keyof DeviceIdentity): string => {
    const value = readIdentityKey(env, key);
    if (value === undefined) {
      const name = IDENTITY_ENV[key];
      throw new Error(
        `${name} is not set, and this host may not guess which device it is. Falling back would ` +
          `adopt another device's ${key} — on this machine, the counter's dev seed — and two ` +
          "devices under one origin interleave one lamport sequence (01-F3) into one outbox " +
          "(01-F8), permanently (01-F1). Set " +
          `${Object.values(IDENTITY_ENV).join(", ")} to the exact values passed to ` +
          "`provision-device` for THIS device (00 §5.7).",
      );
    }
    return value;
  };
  return { org_id: read("org_id"), branch_id: read("branch_id"), device_id: read("device_id") };
};

/**
 * `00 §5.7`, and this value has the property that makes that law bite: being wrong about it looks
 * exactly like being right. A till whose `org_id` does not equal the API's `BOOTSTRAP_ORG_ID`, or
 * whose `branch_id` is not in its `ENABLED_BRANCHES`, reports success in all four processes and
 * never sees a menu. Nothing here can check that — the other ends are three services away — so
 * the device states what it is using, and which of the three it was TOLD rather than assumed.
 */
export const describeDeviceIdentity = (
  identity: DeviceIdentity,
  env: Record<string, string | undefined>,
): string => {
  const keys = Object.keys(IDENTITY_ENV) as (keyof DeviceIdentity)[];
  const configured = keys.filter((key) => env[IDENTITY_ENV[key]] !== undefined);
  const source =
    configured.length === 0
      ? `DEV SEED (none of ${keys.map((k) => IDENTITY_ENV[k]).join(", ")} set) — two tills ` +
        "launched this way share one device_id and fork one outbox (01-F8)"
      : `configured: ${configured.map((key) => IDENTITY_ENV[key]).join(", ")}`;
  return (
    `identity: org ${identity.org_id} · branch ${identity.branch_id} · device ` +
    `${identity.device_id} — ${source}. The org must equal the API's BOOTSTRAP_ORG_ID and the ` +
    "branch must be in its ENABLED_BRANCHES, or this till never sees a menu and nothing anywhere " +
    "reports an error."
  );
};
