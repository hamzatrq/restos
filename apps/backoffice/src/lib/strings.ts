/**
 * `18 §7` — user-facing strings live in a per-app catalog; inline literals in JSX are flagged.
 * `00 §5.6`: English only. This is not i18n — it is what keeps a future language layer mechanical.
 *
 * The sentences carrying FR weight are here rather than in a component on purpose: `14-F28`
 * requires apply-now's consequence to be stated ON the control, and a consequence that lives in
 * a catalog can be asserted by a test that never renders anything.
 */

export const strings = {
  appName: "RestOS Back Office",

  signIn: {
    heading: "Sign in",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    working: "Signing in…",
    /** One refusal for both halves — the server does not say which, and neither does this. */
    refused: "Invalid email or password.",
  },

  session: {
    signOut: "Sign out",
    org: "Organisation",
  },

  catalog: {
    heading: "Menu",
    publishedVersion: "Published version",
    empty: "No published menu yet. Add the first item below.",
    newEntry: "New item",
    kind: "Type",
    name: "Name",
    kitchenName: "Kitchen name",
    parent: "Belongs to",
    sort: "Order",
    /** `03-F50` — the station is catalog data, and absence means INHERIT, never "no station". */
    station: "Kitchen station",
    stationHelp: "Leave blank to inherit from the category above (03-F50).",
    archive: "Archive",
    archived: "Archived",
    /** `14-F7` — archive, never delete. The word "delete" appears nowhere in this app. */
    archiveHelp:
      "Archiving hides this from menus and POS grids and keeps it resolvable, so a reprint of an " +
      "older order still names it (14-F7).",
    save: "Save",
    saving: "Saving…",
  },

  grid: {
    heading: "Prices",
    /** `14-F29` — the price grid: a row per branch, a column per enabled channel. */
    help:
      "Every enabled branch and channel needs a price. There is no fallback price: a forgotten " +
      "aggregator price would sell at the in-restaurant rate while commission still took its " +
      "cut (01-F60).",
    branch: "Branch",
    fillValue: "Price for every cell",
    fillAcross: "Fill across",
    fillAcrossHelp: "Sets every cell below, then type over the ones that differ.",
    /** `01-F60` — "this costs nothing" and "somebody forgot" must not look the same. */
    freeHelp: "A free item carries an explicit 0 in every cell — an empty cell is not a zero.",
    incomplete: "This item cannot be saved yet:",
    unpriced: "no price",
    notEnabled:
      "No branches or channels are configured, so no price grid can be drawn and nothing can be " +
      "saved (01-F60). Set NEXT_PUBLIC_ENABLED_BRANCHES and NEXT_PUBLIC_ENABLED_CHANNELS.",
    openOrdersKeepTheirPrice:
      "Open orders keep the price they were rung at — a line snapshots its price when it is " +
      "added and is never re-derived (01-F18).",
  },

  /** `14-F28` — the timing control. Every one of these is the consequence, stated on the control. */
  timing: {
    heading: "When does this apply?",
    dayEnd: "At day end (05:00)",
    dayEndConsequence:
      "The tills keep today's menu until 05:00. Nothing moves under a cashier mid-shift, which " +
      "is why this is the default (14-F28, 27-F4).",
    now: "Apply now",
    nowConsequence:
      "Every till in the organisation changes as soon as this saves — including tills with a " +
      "cashier mid-order. Use it only when the change genuinely cannot wait (14-F28).",
    pendingHeading: "Waiting for day end",
    pendingEmpty: "Nothing is waiting.",
    cancel: "Cancel this edit",
    cancelling: "Cancelling…",
    cancelHelp: "A cancelled edit never reaches a till (14-F28).",
    landsAt: "Lands",
    stagedBy: "Staged by",
  },

  /** `14-F3` — the change history, browsable in place. */
  history: {
    heading: "Change history",
    empty: "No recorded changes for this item yet.",
    created: "created",
    changed: "changed",
    by: "by",
    version: "catalog version",
    /**
     * ⚠ Stated in the UI because it is TRUE of the contract, not because it is desirable.
     * `catalog.history` returns `catalog.changed` records carrying `before_ref`/`after_ref`
     * content hashes and no timestamp, so `14-F3`'s literal sentence — "price changed by Ali,
     * 2 Jul, 450 → 480" — has neither its date nor its two numbers available here.
     */
    refsOnly:
      "The ledger records who changed what and at which catalog version. The date and the " +
      "before/after values are not on this record yet (14-F3, owed).",
  },

  errors: {
    loading: "Loading…",
    /** A refusal from the server is the owner's mistake and names the cell — never "save failed". */
    saveRefused: "The server refused this save:",
    signedOut: "Your session has ended. Sign in again.",
  },
} as const;
