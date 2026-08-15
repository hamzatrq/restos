/**
 * `01-F68` + `01-F69` — the org and its branches, as this service can serve them.
 *
 * **THE PROBLEM THIS EXISTS FOR, stated as `21-F15` states it:** *"no surface renders a machine
 * identifier where the product knows a name — and where it knows none, that is a MISSING FIELD, not
 * a rendering problem."* Until this port, `services/api` had no way to learn a name for anything.
 * `session.whoami` answered `user_id` / `org_id` / `assignments`; `devices.list` answered UUIDs; the
 * owner summary's branch selector had no list to draw from at all. Every one of those passed
 * typecheck, passed its tests, and was nonsensical to the only person who matters.
 *
 * **ONE port with two members, not two ports, and the coupling is deliberate** — the same argument
 * `devices.ts` records for `DeviceDirectory`'s four methods. `01-F68` and `01-F69` are one
 * directory: a deployment that wired the org half and forgot the branch half would render a named
 * restaurant above a selector full of UUIDs, silently, and Rule B cannot see a member nobody passes
 * when the bag itself was supplied. One bag, both required.
 *
 * **`display_name` is `string | null` on the org and `string` on a branch, and the asymmetry is the
 * SCHEMA's rather than a choice made here.** `kernel.orgs.display_name` is `NOT NULL`, so an org
 * either has a row (with a name) or has no row at all — `null` here means *no row*, which is
 * `01-F68`'s UNNAMED. `kernel.branches.display_name` is `NOT NULL` too, so a branch that appears in
 * the list is always named and one that has no row simply does not appear. Neither absence is an
 * error and neither may be dressed as data.
 *
 * ⚠ **NOTHING WRITES EITHER TABLE YET, AND THAT IS REPORTED RATHER THAN PAPERED OVER.**
 * `0010_tenancy_records` created them as STORAGE ONLY: `15-F26`'s provisioning (the org, its first
 * branch and its first owner in one act) and `01-F70`'s `--name` at device registration are both
 * OWED, so in this deployment `org` is `null` and `branches` is `[]` for every tenant. This port is
 * still the honest surface for that state — it is what lets a screen say *unnamed, set it at
 * provisioning* instead of printing a UUID and hoping — and it is what the writer lands behind.
 */

/**
 * The org's own directory row (`01-F68`), always answered for the caller's own org.
 *
 * `status` is `15-F25`'s `active | suspended` and travels as the string the record holds, `null`
 * alongside an absent name because both come from the same missing row. **It gates nothing here**:
 * no FR anywhere makes a lifecycle state refuse a request, `15-F24` says metering is measurement
 * only, and inventing a suspension check would be inventing policy (commandment 2).
 */
export type OrgListing = {
  readonly org_id: string;
  /** `null` ⇔ no `kernel.orgs` row names this org — `01-F68`'s UNNAMED, not an error. */
  readonly display_name: string | null;
  readonly status: string | null;
};

/** One branch's directory row (`01-F69`). Present ⇒ named, by the schema's `NOT NULL`. */
export type BranchListing = {
  readonly branch_id: string;
  readonly display_name: string;
  readonly branch_type: string;
  readonly branch_class: string;
};

export type TenancyDirectory = {
  /** `01-F68` + `01-F69` in one read — see this file's header for why they are not two. */
  directory(org_id: string): Promise<{
    readonly org: OrgListing;
    readonly branches: readonly BranchListing[];
  }>;
};

/**
 * The fallback when a host declares no tenancy directory — **it REFUSES**, loudly.
 *
 * The tempting fallback is the empty answer: `display_name: null`, `branches: []`. It is the one
 * shape AGENTS.md measured as invisible to every rail we have ("Rule B asks whether an optional
 * member is *supplied*, never whether what was supplied is *real*, and a stub is a supply") — and
 * here it is worse than usual, because **the empty answer is indistinguishable from the correct
 * answer today**. Every org is genuinely unnamed until provisioning lands, so a stub returning
 * "unnamed, no branches" would render a screen that is exactly right for the wrong reason, and it
 * would go on rendering it after the writer landed and the directory filled up. `00 §5.7`: a
 * misconfigured host may not make claims about a tenant it never asked about.
 */
export const unconfiguredTenancyDirectory = (): TenancyDirectory => ({
  directory: async () => {
    throw new Error(
      "tenancy directory not configured: this API host was built with no `tenancy` dependency, so " +
        "it can answer nothing about the org (01-F68) or its branches (01-F69). `start()` always " +
        "supplies one from SYNC_GATEWAY_URL/_TOKEN; a host that reaches this line is a test host " +
        "or a misconfigured deployment. It refuses rather than answering emptily — an unnamed org " +
        "with no branches is a CLAIM, and it happens to be the true answer for every tenant today, " +
        "which is exactly why an empty stub here would be undetectable.",
    );
  },
});
