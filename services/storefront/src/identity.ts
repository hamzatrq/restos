import { DEVICE_CLASSES, type DeviceClass } from "@restos/domain";

/**
 * `06-F30` — **the storefront's ORIGIN identity, one per (org, branch).**
 *
 * A customer's browser is not a device: it holds no `01-F47` token, no branch clock and no
 * `actor_user_id`, while `01-F62` requires all three stamped **at append by an originating
 * device**. So the service holds the device identity and appends on the customer's behalf.
 *
 * ⚠ **`01-F62` IS UNAMENDED AND THE NEXT READER WILL ASSUME OTHERWISE.** This is not
 * `05-F29`'s rejected option (b), which amended `01-F62` so a cloud USER's decision had an
 * envelope — that dissolves the FR's own discriminant. Here the discriminant survives untouched:
 * *"org-scoped when its only legitimate emitter is the cloud plane"*, and `order.created`'s
 * legitimate emitters have always included every till in the country. The event was
 * branch-scoped before this file and is branch-scoped after it. **What was missing was a
 * device, not a scope** — and this module is that device.
 */
export const STOREFRONT_DEVICE_CLASS: DeviceClass = "storefront_cloud";

/* A compile-level pin: if `01-F39`'s vocabulary ever drops this member, this stops building
   rather than silently falling back to a class that means something else. */
const _classIsDeclared: true = DEVICE_CLASSES.includes(STOREFRONT_DEVICE_CLASS) as true;
void _classIsDeclared;

export type OriginIdentity = {
  readonly org_id: string;
  readonly branch_id: string;
  readonly device_id: string;
  readonly device_class: DeviceClass;
  /**
   * `06-F34` (a) / `06-F1` — the ONE host this deployment answers for, lower-cased.
   *
   * It is not a tenant lookup and it is not a fact *about* a tenant read from the environment
   * (`28-F5` (a)): it is this process's vhost binding, the same layer-3 deployment configuration
   * `01-F65` requires for a device's own identity, and the tenant it serves was already fixed by
   * `06-F30`'s origin identity. What it buys is the refusal: with no configured host the service
   * answers every `Host` header with one org's ordering surface, and `06-F1`'s *"unknown host →
   * neutral 404"* has nothing to compare against.
   *
   * ⚠ When this deployment stops being one origin per process, this becomes a directory read —
   * that is `28-F20`'s gap, inherited rather than invented here, and `06-F34` (c) records it.
   */
  readonly public_host: string;
};

/**
 * `06-F30`: **one origin per (org, branch)** — never one per org and never one per process.
 *
 * The envelope needs a `branch_id` (`01-F62`), so an org-wide identity could not stamp a legal
 * envelope at all; and `06 §8`'s July note (*"a single cloud device identity"*) is exactly the
 * under-specification this resolves. The `branch_id` is part of the identity rather than a
 * per-request argument **because the `01-F47` token is issued against it** — one device pushing
 * two branches' events is a device lying about which branch it is.
 */
export const originIdentity = (input: {
  org_id: string;
  branch_id: string;
  device_id: string;
  public_host: string;
}): OriginIdentity => {
  for (const field of ["org_id", "branch_id", "device_id", "public_host"] as const) {
    if (input[field].trim() === "") {
      throw new Error(
        `06-F30/06-F34: the storefront origin needs a non-empty ${field}. An origin missing any ` +
          `part of its (org, branch, device) identity cannot stamp a legal 01-F62 envelope, and ` +
          `a defaulted one would push a real branch's ledger under a made-up name; an origin ` +
          `with no public host cannot refuse a request that names another one (06-F1).`,
      );
    }
  }
  return {
    ...input,
    // Compared against a `Host` header, which is case-insensitive per RFC 9110 and arrives
    // lower-cased from some proxies and not others. Normalised once, here, rather than at the
    // comparison — two normalisations is how one of them stops matching.
    public_host: input.public_host.trim().toLowerCase(),
    device_class: STOREFRONT_DEVICE_CLASS,
  };
};

/**
 * `T12`'s join key, one service over. `BOOTSTRAP_ORG_ID` has three ends and no error message;
 * this has the same shape, so the resolver NAMES which variables were missing rather than
 * defaulting any of them. A storefront that silently invented an `org_id` would push orders into
 * a tenant that does not exist and report success (`00 §5.4`).
 */
export const resolveOriginIdentity = (env: Record<string, string | undefined>): OriginIdentity => {
  const missing = (
    ["RESTOS_ORG_ID", "RESTOS_BRANCH_ID", "RESTOS_DEVICE_ID", "RESTOS_STOREFRONT_HOST"] as const
  ).filter((k) => (env[k] ?? "").trim() === "");
  if (missing.length > 0) {
    throw new Error(
      `06-F30: the storefront origin is unconfigured — ${missing.join(", ")} not set. ` +
        `There is deliberately no default: 00 §5.4 makes org scoping absolute, and a guessed ` +
        `org_id or branch_id is a cross-tenant write that every process would report as success.`,
    );
  }
  return originIdentity({
    org_id: env.RESTOS_ORG_ID as string,
    branch_id: env.RESTOS_BRANCH_ID as string,
    device_id: env.RESTOS_DEVICE_ID as string,
    public_host: env.RESTOS_STOREFRONT_HOST as string,
  });
};
