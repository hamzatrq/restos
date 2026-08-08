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
    /**
     * What is behind the door, in the owner's terms. Three lines, because three is what this
     * surface actually does today (`14-F29`, `14-F28`, `14-F3`) — a fourth would be a promise.
     */
    standfirst: "The menu, the prices and the record of who changed them.",
    doesPrices: "One price for every branch and every sales channel",
    doesTiming: "Edits hold until 05:00 so no till moves under a cashier",
    doesHistory: "Every price change kept, with its before and after",
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
    /** The empty editor pane. An empty screen is an invitation to act. */
    chooseOne: "Choose anything on the left to edit it, or add a new item.",
    /**
     * The money column's heading. `01-F60` prices per `(branch, channel)`, so a list can only
     * ever quote ONE of them — this names which, once, instead of leaving a bare number to be
     * read as "the price" or repeating the pair on every row.
     */
    pricesShown: "Prices shown for",
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
    /**
     * **The empty set is a REFUSAL, not "nothing to check"** (`01-F60`), and the sentence names
     * where it is configured — which since August 2026 is the RestOS service and not this app.
     * The back office asks `catalog.enabled` and has no copy of its own to point an owner at.
     */
    notEnabled:
      "No branches or channels are configured, so no price grid can be drawn and nothing can be " +
      "saved (01-F60). Set ENABLED_BRANCHES and ENABLED_CHANNELS on the RestOS service.",
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
     * Not recorded — used for an absent actor and for a price cell that did not exist on one side
     * of the edit. One mark for both, because both mean the same thing to a reader: the ledger has
     * no value here. Never `0` and never a blank, which would read as "free" and as "nothing
     * happened" respectively (`01-F60`'s explicit-zero rule, seen from the display side).
     */
    absent: "—",
    /**
     * ⚠ Narrowed August 2026, and the narrowing is the point. This string used to say the date and
     * the before/after values were absent from the record; `01-F62` and `payload.price_changes`
     * made that false, and a screen claiming a gap it no longer has misleads a reader exactly as
     * badly as one hiding a gap it does have. What remains true is only the non-price half: the
     * refs are one-way `payloadHash` digests, so a rename or a station move has a version and no
     * values.
     */
    nonPriceFields:
      "Price changes are recorded with their before and after values. Other fields — a rename, a " +
      "kitchen station — are recorded as a catalog version only (14-F3, owed).",
  },

  errors: {
    loading: "Loading…",
    /** A refusal from the server is the owner's mistake and names the cell — never "save failed". */
    saveRefused: "The server refused this save:",
    signedOut: "Your session has ended. Sign in again.",
  },

  /**
   * **The surface that replaced a raw `error.message` in a red bar.**
   *
   * What was there rendered whatever string reached the client — `fetch failed`, and in this
   * session's own run `Unexpected token 'I', "Internal S"... is not valid JSON`, edge to edge on
   * an otherwise empty page. That is undici's and `JSON.parse`'s wording, not the product's, and
   * it tells an owner nothing about what is broken, whether waiting helps, or what to do.
   *
   * **These sentences claim only what this client can actually know.** The back office is a front
   * end with no backend of its own (`apps/backoffice/CLAUDE.md`): every query goes to
   * `services/api`, so a failed query means that service did not answer usefully — which is true
   * whether the process is down, the rewrite is misconfigured, or the API's own dependency
   * failed. It does NOT say which, because this client cannot tell, and a surface that guesses a
   * cause sends an owner to fix the wrong thing. The server's own words are still shown, demoted
   * to technical detail and labelled as such, so they remain available to whoever can act on
   * them.
   *
   * Retriability is answered by a CONTROL, not by a sentence: the button is the claim.
   */
  unreachable: {
    heading: "Can't reach the RestOS service",
    body:
      "The back office has no data of its own — it reads everything from the RestOS service, and " +
      "that service did not answer. Nothing has been lost and nothing has changed: this screen " +
      "cannot show the menu until the service answers again.",
    /** Named as the thing to check, because it is the one thing an owner can act on. */
    action: "If this keeps happening, the service needs to be restarted by whoever runs it.",
    retry: "Try again",
    retrying: "Trying…",
    /** The raw string, kept but demoted — never the headline. */
    detail: "Technical detail",
  },
} as const;
