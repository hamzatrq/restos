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
    /**
     * The signed-in user, LABELLED. The header ran the org id and the user id together behind one
     * word, so `org-zaiqa · bootstrap-owner:org-zaiqa` read as one fact with a stray separator.
     * Both are raw ids because they are the only names the server has — `01-F47` covers devices,
     * not people, and there is no user profile in the corpus to read a display name from — so the
     * least this can do is say which id is which.
     */
    user: "Signed in as",
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

  /**
   * The sections this app has. `14-F12`/`14-F13` gave it a second one; `14-F31` a third.
   *
   * **Appended, never inserted.** `27-F4`'s positional contract is about muscle memory: the two
   * tabs that existed keep their positions and their order, and the new one goes after them.
   */
  nav: {
    menu: "Menu",
    devices: "Devices",
    summary: "Summary",
  },

  /**
   * `14-F31` — the nightly owner summary as a READ-ONLY desk view, rendering `12-F10`'s blocks.
   *
   * **Four of these sentences exist because the honest answer is an absence**, and `00 §5.7` makes
   * saying so the requirement rather than a shortfall: the missing `12-F12` narrative, an open
   * shift's four nulls, a truncated window, and a branch that has never been heard from. None of
   * them may render as a zero — a zero is a measurement, and `12-F11` states the rule for its own
   * block in the corpus's words: never guessed, never shown as zero.
   *
   * ⚠ **The word "provisional" appears in exactly ONE of these strings** — `dayOpen`, which is
   * `12-F9`'s banner. `01-F44`'s raw-clock stamps are called a raw device clock and NOT
   * "provisional stamps", even though the ledger's own marker is `branch_provisional`: two
   * different facts sharing one word on one screen is how an owner reads "some events had odd
   * clocks" as "the day is not closed yet".
   */
  summary: {
    heading: "Nightly summary",
    businessDay: "Business day",
    /** `12-F13` — history is browsable by date, and the day shown is the one the SERVER answered. */
    dayShown: "Figures for the business day",
    branch: "Branch",
    /** `12-F22` — the roll-up is the default view; a branch is a drill-in from it. */
    allBranches: "Every branch in this organisation",
    branchHelp:
      "Only branches this answer covers are offered. The scope is the server's (12-F2), so a " +
      "branch missing here is one this sign-in is not authorised to read.",
    /**
     * `12-F12`. The narrative is the doc 13 nightly brief, doc 13 is Wave 4, and its service is a
     * scaffold stub — so there is no brief. Unlike every other absence on this screen this one
     * does NOT arrive in the server's omission list, because that list covers blocks of numbers.
     */
    noNarrative:
      "No narrative. 12-F12 makes this summary's words the doc 13 nightly brief, and doc 13 is " +
      "not built — so there is no brief to render and none is written here. What follows is the " +
      "numbers, and only the numbers.",
    notAnswered: "This summary was not answered.",
    notAnsweredHelp:
      "No figure is shown because none was received. Nothing on this screen is estimated in the " +
      "meantime, and nothing has changed.",

    sales: {
      heading: "Sales",
      total: "Billed",
      orders: "orders",
      byChannel: "By channel",
      empty: "No order was rung on any channel.",
    },

    /**
     * `12-F10` bullet 2. The row is per SHIFT because that is what the drawer count is per — one
     * cashier can work two shifts and two cashiers can share a day.
     */
    cash: {
      heading: "Cash, expected against counted",
      help: "One row per shift, as the drawer was counted at close (02-F23).",
      expected: "Expected",
      counted: "Counted",
      variance: "Variance",
      /** Four nulls on one row: no expected figure, no count, no variance, no cashier. */
      notCounted: "Still open — not counted yet",
      cashierNotRecorded: "cashier not recorded",
      empty: "No shift was opened.",
    },

    items: {
      heading: "Top items by revenue",
      sold: "sold",
      empty: "No item was sold.",
    },

    hourly: {
      heading: "Hourly sales",
      help: "One bucket per hour of the business day, labelled with the wall clock (01-F46).",
      empty: "No hour of this day carries an order.",
    },

    /**
     * `00 §5.7` — a surface reports what is true, including about itself. Never called an alert:
     * these are the ledger's own fold facts, and `13-F14a`'s alert classes cannot fire at all
     * (the server's own omission list says why).
     */
    honesty: {
      heading: "What this summary knows about itself",
      events: "Events read for this business day:",
      deviceClock: "Events stamped on a raw device clock (01-F44):",
      openShifts: "Shifts with money still in an open drawer:",
      allDaysClosed: "Every branch closed its day.",
      dayOpen: "A branch has not closed its day, so every figure here is provisional (12-F9).",
      truncated:
        "The read hit the service's row cap, so this day is incomplete: every total below is a " +
        "floor and not the whole.",
      whole: "The whole business day was read.",
      anomalies: "The fold reported:",
      noAnomalies: "The fold reported nothing odd.",
    },

    omissions: {
      heading: "Not in this report",
      help:
        "What this product cannot answer today, with the requirement that decides each absence. " +
        "A block named here is not a zero — it is not measured.",
      none: "Every block this report covers was answered.",
    },

    /** `12-F8` — the age is the SERVER's, computed from the two instants it sends. */
    sync: {
      heading: "Data age",
      lastSynced: "Last synced",
      minutesAgo: "minutes ago",
      hoursAgo: "hours ago",
      daysAgo: "days ago",
      live: "Live — an event reached the cloud within the last minute.",
      never:
        "Nothing has ever been received for this day, so there is no age to state and nothing " +
        "here is live.",
    },
  },

  /**
   * `14-F12` (the device list) and `14-F13` (revocation, "immediate — the stolen tablet flow").
   *
   * **Two of these sentences exist because the honest answer is "we do not know", and saying so is
   * the requirement rather than a shortfall.** `14-F12` asks for app version, last-seen and sync
   * lag; none is stored anywhere in this product, and a screen that showed a plausible number for
   * a fact it does not have is the `00 §5.7` failure the whole corpus is written against. Same for
   * an actor the ledger never recorded: `notRecorded` is a statement, and a blank cell would be a
   * different, false one ("nobody").
   */
  devices: {
    heading: "Devices",
    empty: "No devices are registered in this organisation yet.",
    /**
     * Named as owed, on the screen, because an owner reading this list will otherwise assume the
     * columns she asked for are simply not applicable to her tills.
     */
    columnsOwed:
      "App version, last seen and sync lag are not recorded yet, so they are not shown (14-F12). " +
      "What is here is what the device registry actually holds.",
    branch: "Branch",
    deviceClass: "Type",
    active: "Active",
    revoked: "Revoked",
    revokedAt: "Revoked",
    revokedBy: "by",
    /** An actor the ledger has no record of — see this block's header. */
    notRecorded: "actor not recorded",
    notRecordedHelp:
      "This device was revoked outside the back office — from the service host, where there is no " +
      "signed-in user to record. Revocations made here are attributed.",
    tokenExpires: "Credential expires",
    revoke: "Revoke",
    revoking: "Revoking…",
    /**
     * `14-F13` + `01-F48` + `01-N5`. The consequence is stated ON the control, `14-F28`'s rule
     * applied to the one act on these screens that is genuinely irreversible — apply-now moves a
     * menu, this stops a till, and nothing anywhere brings it back.
     */
    revokeConsequence:
      "This device stops working within 30 seconds and cannot be brought back. Its replacement " +
      "must be registered as a new device (01-F48, 01-N5).",
    confirm: "Revoke this device?",
    confirmYes: "Yes, revoke it",
    confirmNo: "Keep it",
    /** The already-revoked answer, which claims no credit — see `device-router.ts`. */
    alreadyRevoked: "This device was already revoked; nothing changed and no actor was recorded.",
    refused: "The server refused this revocation:",
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
