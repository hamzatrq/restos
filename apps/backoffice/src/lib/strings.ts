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
    name: "Name",
    /**
     * `14-F34` — what the field is, and what happens if it is left as it is. Every control on the
     * editor carries one of these and the DOM binds it with `aria-describedby`, never a tooltip.
     */
    nameHelp:
      "What a customer calls this. It is the name your staff will look for on the till and the " +
      "name printed on the bill, so type it the way you want it read.",
    kitchenName: "Kitchen name",
    kitchenNameHelp:
      "A shorter name for the kitchen ticket, for when the menu name is too long to read at a " +
      "glance across a hot kitchen. Leave it blank and the ticket prints the name above.",
    /** `14-F33` — the parent, asked for as a question about the MENU rather than as a foreign key. */
    parent: "Menu section",
    parentHelp:
      "Which part of the menu this belongs under, so your staff find it where they expect on the " +
      "till. Leave it alone and this sits on its own, outside every section.",
    /** Chosen from the sections that exist (`14-F33`); an owner never types one. */
    parentNone: "Not in any section",
    /**
     * A section the owner made today that lands at 05:00 with everything else (`14-F28`). It is
     * offered — a dish staged for the same boundary lands beside it — and it is MARKED, so the
     * two version axes are named rather than blurred into one list.
     */
    parentStaged: "waiting for day end",
    parentEmpty:
      "There are no menu sections yet. You can add this now and put it in a section later, or " +
      "add a section first — that is its own job on the previous screen.",
    /** `03-F50` — the station is catalog data, and absence means INHERIT, never "no station". */
    station: "Kitchen station",
    /**
     * `03-F50`. The citation moved into this comment and out of the sentence (`14-F38`).
     * Blank is the NORMAL answer, so the help says what blank does — an owner who reads
     * "leave blank" as "not set up yet" fills in a station she does not need.
     */
    stationHelp:
      "Which part of the kitchen cooks this, so its ticket prints in the right place. Leave it " +
      "blank and this follows its menu section — fill it in only when this one dish is made " +
      "somewhere else.",
    archive: "Archive",
    archived: "Archived",
    /** `14-F7` — archive, never delete. The word "delete" appears nowhere in this app. */
    archiveHelp:
      "Archiving takes this off the menu and off every till, and keeps the record: reprint an " +
      "older order and it still names this item. Nothing is deleted.",
    save: "Save",
    saving: "Saving…",

    /**
     * **`14-F32` — one task per job, named in the owner's vocabulary.**
     *
     * The internal chain's own words are vendor vocabulary and are banned from every one of these
     * sentences (`14-F38`); these nouns are this surface's name for each rung, on the chooser, on
     * the form header and on a saved entry. `14-F34` is why each carries a sentence rather than a
     * bare noun: hiding the schema without explaining the job just moves the confusion.
     *
     * ⚠ The dish sentence deliberately does not contain the word *section*. The oracle picks a
     * task by matching rendered text, so a dish whose description mentioned sections would be
     * found first when the section task was asked for — a real defect in this file, not in a test.
     */
    tasks: {
      heading: "Add to the menu",
      standfirst: "Pick what you are adding. Each one asks only for what it needs.",
      dish: "Add a dish",
      dishNoun: "Dish",
      dishHelp:
        "Something a customer orders and pays for by name, like Shoyu Ramen. You give it a price " +
        "for every branch and every way people order.",
      section: "Add a menu section",
      sectionNoun: "Menu section",
      sectionHelp:
        "A heading that groups dishes together on the till, like Ramen or Cold Drinks. It has no " +
        "price of its own and nobody orders it.",
      size: "Add a size or version of a dish",
      sizeNoun: "Size or version",
      sizeHelp:
        "The same dish in another size or style — Half Plate, Large, Spicy — priced on its own " +
        "because a customer pays a different amount for it.",
      choice: "Add a choice group",
      choiceNoun: "Choice group",
      choiceHelp:
        "A question your cashier answers when this is ordered, like Spice level, holding the " +
        "answers a customer can pick from. It has no price of its own.",
      addon: "Add an add-on",
      addonNoun: "Add-on",
      addonHelp:
        "Something a customer adds to a dish, like Extra Raita. It carries its own price, and one " +
        "you give away free carries a plain zero rather than an empty box.",
      /**
       * An entry whose kind this screen has no task for. It is never OFFERED — it exists only so
       * that opening published data always works: a menu a till is currently selling must not
       * become uneditable because this list has not caught up with it (`00 §5.7`).
       */
      unknownNoun: "Menu entry",
      unknownHelp:
        "This was added by a newer part of RestOS than this screen knows about. You can still " +
        "rename it and change its prices here; anything else it carries is left exactly as it is.",
    },

    /**
     * **`14-F33` — the identifier, shown once and demoted.** Never on a control: an owner must be
     * able to READ it (a till renders it when a menu has not caught up, `01-F54`) and must never
     * have to invent one. `{code}` is filled in by the editor.
     */
    reference: "Reference code",
    referenceHelp:
      "RestOS recognises this entry by it, and a till shows it if its menu has not caught up yet. " +
      "You never type it and it never changes.",

    /**
     * **`14-F35` — the inherited answer, resolved and legible in the CLOSED state.**
     *
     * Three whole sentences rather than fragments, because a sentence assembled from four catalog
     * pieces reads like one and cannot be reviewed like one. `{ticket}`, `{station}` and `{from}`
     * are filled in by the editor from the resolved values.
     *
     * ⚠ The fallback sentence names no section on purpose: when nothing up the chain sets a
     * station there is no origin to name, and naming the section anyway would tell an owner a
     * decision was made where none was (`00 §5.7`).
     */
    kitchenGroup: "Kitchen settings",
    kitchenClosedInherited:
      "Kitchen printing — the ticket says {ticket}, and it prints at {station}, which this takes " +
      "from {from}. Open this to change either.",
    kitchenClosedOwn:
      "Kitchen printing — the ticket says {ticket}, and it prints at {station} because that is " +
      "what you set here. Open this to change either.",
    kitchenClosedFallback:
      "Kitchen printing — the ticket says {ticket}, and it prints at {station}, which is where " +
      "RestOS sends anything nobody has given a place to. Open this to change either.",
    /** The terminal fallback a device applies when nothing up the chain resolves — see below. */
    kitchenFallbackStation: "the kitchen",
    /** Used only until the owner has typed a name, so the closed line is never half a sentence. */
    kitchenTicketUnnamed: "this, once you have named it",

    /**
     * **`14-F32` + the founder's own flow: 60 to 120 items, typed one at a time.**
     *
     * The second sentence exists because the first would otherwise be a surprise — an owner who
     * cannot see what was carried over has to check it, which costs more than retyping it.
     * The timing is NOT carried: `14-F36` forbids remembering apply-now between edits.
     */
    saveAndAddAnother: "Save and add another",
    saveAndFinish: "Save and finish",
    savedCarried:
      "Saved. The next one starts in the same menu section so you can keep typing; when it " +
      "applies goes back to day end every time, so one urgent change never makes the next one " +
      "urgent too.",
  },

  grid: {
    heading: "Prices",
    /**
     * `14-F29` — the price grid: a row per branch, a column per enabled channel. The no-fallback
     * rule and its commission reason are `01-F60`; both citations live here now rather than in the
     * sentence (`14-F38`), and the FACT — miss a cell and the aggregator sells at your counter
     * price — is what the owner is told.
     */
    help:
      "Every branch needs a price for every sales channel, and there is no fallback price. Miss " +
      "the price for a delivery app and that order would go out at your in-restaurant price " +
      "while the app still took its commission.",
    branch: "Branch",
    fillValue: "Price for every cell",
    fillAcross: "Fill across",
    fillAcrossHelp: "Sets every cell below, then type over the ones that differ.",
    /** `01-F60` — "this costs nothing" and "somebody forgot" must not look the same. */
    freeHelp: "A free item carries an explicit 0 in every cell — an empty cell is not a zero.",
    incomplete: "This item cannot be saved yet:",
    unpriced: "no price",

    /**
     * **The four refusals a cell can carry, in the owner's words — `14-F38`.**
     *
     * `lib/money.ts` and `lib/price-grid.ts` used to return these sentences themselves, and the
     * price grid rendered them verbatim, so an owner who typed `450.50` was told *"whole rupees
     * only — no decimals and no grouping separators (27-F23)"* and *"digits only (27-F22)"*.
     * `14-F38`'s rule is that the citation MOVES rather than disappears: it is in these comments,
     * where commandment 9 and `14-F2`'s traceability are served and no owner reads it — and the
     * sentences are here rather than in `lib/` so `pnpm strings:check`, which scans the catalog,
     * can see them at all. That rail reported CLEAN while all three were on the glass.
     *
     * Each says what to DO, not which requirement was violated. `27-F23` is the reason there is no
     * sub-rupee price and `27-F22` the reason a price is Western digits; neither is a fact about
     * this owner's menu, and the FACT — type it this way — is what is carried into the sentence.
     */
    /** `01-F60`'s missing cell. It must not read as "0" — an empty cell is not a free item. */
    reasonNoPrice: "no price typed here yet — type a number, or 0 if you give this away free",
    /**
     * `27-F23` — no sub-rupee unit circulates, so the editor refuses a decimal rather than
     * silently pricing a dish at four hundred and fifty and a half rupees for ever (`01-F53`
     * freezes whatever is saved into every line rung against it). The example is the point: an
     * owner meets this by typing a price he sees on his own menu card.
     */
    reasonNotWhole: "whole rupees only — type 450, not 450.50, and no commas",
    /** `27-F22` — Western digits, and a price has no sign (`01-F17`). */
    reasonNotNumber: "numbers only — no letters, spaces or symbols",
    /** The wire's ceiling. Not a rule an owner can break by accident, but it must still say so. */
    reasonTooLarge: "that price is too large — check the number",
    /**
     * **`14-F37` — the running count, so an incomplete set is obvious BEFORE the save is pressed.**
     *
     * The same completeness rule the writer enforces, rendered continuously instead of on demand.
     * `{missing}` and `{total}` are filled in by the grid on every keystroke. It carries no colour
     * while the item is merely unfinished (`27-F16`): a half-typed new dish is the normal state of
     * a form, and colour arrives with the refusal.
     */
    stillNeeded: "{missing} of {total} prices still needed",
    everyPriceSet: "Every price set.",
    /**
     * **The empty set is a REFUSAL, not "nothing to check"** (`01-F60`).
     *
     * ⚠ This sentence used to end *"Set ENABLED_BRANCHES and ENABLED_CHANNELS on the RestOS
     * service"* — two environment variables, named at a restaurant owner who has no shell on that
     * host and no way to act on them. `14-F38`'s rule for exactly this case: **a message about
     * something the owner cannot change names the ROLE that can, never the mechanism.** The state
     * is still reported as broken (`00 §5.7`); only the instruction changed audience.
     */
    notEnabled:
      "No branches or sales channels have been set up yet, so there is no price grid to fill in " +
      "and nothing can be saved. Whoever set up RestOS for you has to add at least one branch and " +
      "one sales channel first.",
    openOrdersKeepTheirPrice:
      "Open orders keep the price they were rung at. A line takes its price the moment it is " +
      "added to an order, so changing a price here never re-prices an order already on a till.",
  },

  /** `14-F28` — the timing control. Every one of these is the consequence, stated on the control. */
  timing: {
    heading: "When does this apply?",
    dayEnd: "At day end (05:00)",
    dayEndConsequence:
      "The tills keep today's menu until 05:00. Nothing moves under a cashier mid-shift, which " +
      "is why this is the normal choice.",
    now: "Apply now",
    nowConsequence:
      "Every till in the business changes as soon as this saves — including a till with a " +
      "cashier halfway through an order. Use it only when the change genuinely cannot wait.",
    pendingHeading: "Waiting for day end",
    pendingEmpty: "Nothing is waiting.",
    cancel: "Cancel this edit",
    cancelling: "Cancelling…",
    cancelHelp:
      "Nothing waiting here has reached a till yet, so a cancelled edit never will. You can take " +
      "one back at any time before it lands.",
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
      "Price changes are recorded with their before and after values. Other changes — a rename, " +
      "a kitchen station — are recorded as a catalog version only, without the old and new " +
      "wording.",
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
      "Only the branches this report covers are offered. A branch missing here is one this " +
      "sign-in is not allowed to see.",
    /**
     * `12-F12`. The narrative is the doc 13 nightly brief, doc 13 is Wave 4, and its service is a
     * scaffold stub — so there is no brief. Unlike every other absence on this screen this one
     * does NOT arrive in the server's omission list, because that list covers blocks of numbers.
     */
    noNarrative:
      "No narrative. The nightly brief that would supply this summary's words is not built yet, " +
      "so there is no brief to render and none is written here. What follows is the numbers, and " +
      "only the numbers.",
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
      help: "One row per shift, as the drawer was counted when that shift closed.",
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
      help: "One bar per hour of the business day, labelled by the clock on the wall.",
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
      /** `01-F44`'s raw device stamps — see this block's header on the word "provisional". */
      deviceClock: "Events stamped on a device clock rather than the branch clock:",
      openShifts: "Shifts with money still in an open drawer:",
      allDaysClosed: "Every branch closed its day.",
      /** `12-F9`'s banner — and the ONE string on this screen allowed the word "provisional". */
      dayOpen: "A branch has not closed its day, so every figure here is provisional.",
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
      "App version, last seen and sync delay are not recorded anywhere in RestOS yet, so they " +
      "are not shown rather than guessed at. What is in this list is what is actually known " +
      "about each device.",
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
      "This device stops working within 30 seconds and cannot be brought back. Whatever replaces " +
      "it has to be registered from scratch as a new device.",
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
