/**
 * `06-F32` / `28-F4` — **the gate on a surface that has no subject and no role.**
 *
 * A customer is not a `ROLES` member and must never become one, so `can(role, action)` has
 * nothing to answer here. `28-F4` supplies the second, orthogonal gate: `entitled(org,
 * capability)` composes WITH `can()` and is never bolted into `PERMISSION_ACTIONS`.
 *
 * ⚠ **TWO MECHANISMS, AND `28-F4` IS EXPLICIT THAT COLLAPSING THEM IS WRONG.** Its closing
 * bullet retires the tempting one-liner in terms: *"'an ungated or unentitled procedure is a boot
 * failure' is therefore wrong … what boot can see is a missing DECLARATION."* So:
 *
 *   (i)  BOOT sees a **declaration** — every procedure names a capability or is on the exemption
 *        list (`assertEveryProcedureDeclaresEntitlement`, `router.ts`). Static, org-free.
 *   (ii) RUNTIME resolves `entitled(org, capability)` per request from the org's `28-F6` record.
 *
 * A build with only (i) is the failure mode worth naming, because it LOOKS complete: every
 * procedure correctly labelled, a boot assertion that passes, and no tenant's entitlement ever
 * actually checked. `entitlement-gate.test.ts` §C is pointed at exactly that.
 */

/**
 * `28-F4`: *"the capability vocabulary is `15-F5`'s enumeration and nothing else … it is NOT a
 * per-procedure key."* `15-F5`'s three cloud channel flags are the whole vocabulary this service
 * can legitimately name, and it needs one of them. Minting a per-procedure capability to give a
 * type checker something to chew on is commandment 2 at scale — `28-F4` says so in those words.
 */
export const STOREFRONT_CAPABILITY = "channel.storefront" as const;
export type Capability = typeof STOREFRONT_CAPABILITY;

/**
 * The org's resolved `28-F6` record, narrowed to what this service reads. Deliberately NOT the
 * whole record: `28-F6` also carries tier gates and the intelligence rung cap, and a service that
 * destructured the lot would acquire a reason to branch on them.
 */
export type EntitlementRecord = { readonly capabilities: ReadonlySet<Capability> };

/** Resolved per org, from data (`28-F5`). `null` = no record — see `entitled()`. */
export type EntitlementSource = (org_id: string) => Promise<EntitlementRecord | null>;

/**
 * ⚠ **AN ABSENT RECORD IS REFUSED, AND THE OPPOSITE READING IS THE DANGEROUS ONE.**
 *
 * `28-F3` requires an org with no entitlement record to be *served identically*, which reads like
 * a licence to default-allow — and `28-F6` records what that reasoning cost once already, on
 * `01-F60`'s enabled set. It does not apply here, and the asymmetry is the reason: `01-F60`'s set
 * is layer-2 data whose absence breaks a restaurant that has bought nothing wrong, whereas this
 * flag is the commercial fact that a tenant has the storefront channel at all. Default-allow
 * would serve a public ordering page for every org in the platform the moment this deploys,
 * including orgs that never asked for one — which is not a degraded service, it is a different
 * product, published on the open internet under that restaurant's name.
 *
 * So: no record ⇒ not entitled. `28-F3`'s identical service is satisfied by every org having a
 * record, which is `28-F5`'s job and not this gate's to paper over.
 */
export const entitled = async (
  source: EntitlementSource,
  org_id: string,
  capability: Capability,
): Promise<boolean> => {
  const record = await source(org_id);
  if (record === null) return false;
  return record.capabilities.has(capability);
};
