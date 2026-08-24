// Device classes (01-F39): fixed slice + hub rules per class. Order of
// HUB_ELIGIBLE_CLASSES is hub-election priority (sync-client HUB-ELECTION.md).
export const DEVICE_CLASSES = [
  "counter_electron",
  "counter_rn",
  "kitchen",
  "manager",
  "waiter",
  "rider",
  /**
   * `06-F30` — the hosted storefront's ORIGIN identity, one per (org, branch). Cloud-resident:
   * it appends `order.created` (and `06-F19`/`06-F27`'s `order.cancelled`) on a customer's
   * behalf, because a browser holds no `01-F47` token, no branch clock and no `actor_user_id`,
   * and `01-F62` requires all three stamped **at append by an originating device**.
   *
   * ⚠ **`01-F62` IS UNAMENDED BY THIS MEMBER, AND THE NEXT READER WILL ASSUME OTHERWISE.** This
   * is NOT `05-F29`'s rejected option (b), which amended `01-F62` so a cloud USER's decision had
   * an envelope and thereby dissolved the FR's own discriminant. That discriminant —
   * *"org-scoped when its only legitimate emitter is the cloud plane"* — is untouched here:
   * `order.created`'s legitimate emitters have always included every till in the country, so it
   * was branch-scoped before this member and is branch-scoped after it. **What was missing was a
   * device, not a scope**, and this line is that device.
   *
   * Holds **no branch slice** and never joins the branch LAN (like `rider`, and unlike it in
   * being a service rather than a person's phone); never hub-eligible — `HUB_ELIGIBLE_CLASSES`
   * below is unchanged and a cloud origin has no branch to serve a clock to. `06-F31` governs
   * its permanently-`branch_provisional` clock.
   */
  "storefront_cloud",
] as const;

export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const HUB_ELIGIBLE_CLASSES = ["counter_electron", "counter_rn", "kitchen"] as const;
