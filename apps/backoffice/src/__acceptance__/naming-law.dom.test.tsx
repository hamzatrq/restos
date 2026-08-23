/**
 * **`21-F15` — THE NAMING LAW, CHECKED THE WAY THE FR SAYS TO CHECK IT.**
 *
 * *"How it is checked — mechanically, and not by grep. … it sweeps visible text nodes, and a node
 * whose text matches the identifier shape and is not inside a component declared a technical-id
 * slot is a violation, reported by surface and control. ⚠ A grep over the per-app `strings.ts`
 * catalogs is NOT this check and must not be substituted for it — the defect is a runtime
 * interpolation, never a string literal, so a catalog sweep is green on every real instance of it."*
 *
 * So this file mounts the SHIPPED shell with the SHIPPED screens, works every tab, and reads the
 * text nodes. `data-technical-id` is the declaration the sweep reads; `lib/names.tsx` is the only
 * thing that emits it.
 *
 * **THE FIXTURE IS THE COVERAGE BOUNDARY, and it is chosen rather than convenient.** Every id below
 * is a real UUIDv7 of the shape a provisioned tenant actually holds — the org, the owner and the
 * branch are the three from the run that produced this defect, where the header read
 * `ORGANISATION 01a03082-83d2-725f-81ae-c044cdd0b0c4` over a Postgres holding *Karachi Biryani
 * House*. A fixture using `org-zaiqa` and `user-hina` could not fail this sweep at all: those are
 * not identifier-shaped, so the regex would never fire and the whole file would be vacuous.
 *
 * **THREE STATES, THREE MOUNTS, because two of them are indistinguishable to a screen that gets
 * them wrong.** The directory answers with names; answers with none (`01-F68`'s UNNAMED org, which
 * is every tenant provisioned before the naming commands existed); and refuses (the matrix says no,
 * or the peer is down). A suite running only the first proves nothing about a product whose
 * deployments are mostly in the second.
 *
 * **What this cannot see, stated because a rail oversold is a rail trusted wrongly** (`21-F15`'s own
 * clause): it sees only the states this fixture produces, so a name slot reachable only through an
 * interaction nobody drives here is unmeasured; and it cannot judge whether a name is the RIGHT
 * name, only that a key is not standing in for one.
 *
 * ⚠ AUTHORSHIP DEPARTURE, DECLARED (`24 §3`): written by the session that wrote `lib/names.tsx`.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import { afterEach, describe, expect, it } from "vitest";
import { AuthGate } from "../components/auth-gate";
import { Workspace } from "../components/workspace";
import { strings } from "../lib/strings";
import { type CallLog, type Handlers, Harness } from "./harness";

afterEach(cleanup);

// ── the tenant, as Postgres actually holds one ────────────────────────────────────────────────

const ORG_ID = "01a03082-83d2-725f-81ae-c044cdd0b0c4";
const OWNER_ID = "01a03082-8b3a-7ad2-8ae9-2958e7acd7ff";
const BRANCH_ID = "01a03082-8789-7600-9f6d-5afa3036acd6";
/** A second branch and a second person, both absent from every directory below — see §C. */
const OTHER_BRANCH_ID = "01a03082-9111-7000-8000-aaaaaaaaaaaa";
const CASHIER_ID = "01a03082-9222-7000-8000-bbbbbbbbbbbb";
const DEVICE_ID = "01a03082-9333-7000-8000-cccccccccccc";
const SHIFT_ID = "01a03082-9444-7000-8000-dddddddddddd";
const EDIT_ID = "01a03082-9555-7000-8000-eeeeeeeeeeee";

const ORG_NAME = "Karachi Biryani House";
const BRANCH_NAME = "Tariq Road";
const OWNER_NAME = "Ayesha Khan";

/**
 * **The identifier shape, as `21-F15` defines a machine identifier**: *"any value whose only purpose
 * is to be a key"*. UUIDv7 is what `00 §6` mints, so that is the shape swept for. It is knowingly
 * narrower than the definition — a key like `org-demo` is one too — and narrower is the right
 * direction for a mechanical rail: it cannot produce a false violation on a restaurant genuinely
 * called something that looks like a UUID, and the fixture guarantees it has real targets to find.
 */
const IDENTIFIER = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Where a text node sits, for a verdict a human can act on without opening a debugger. */
const trail = (node: Node): string => {
  const parts: string[] = [];
  for (let el = node.parentElement; el !== null; el = el.parentElement) {
    const attrs = ["data-summary-block", "data-shift", "data-correction-by", "aria-label"]
      .map((name) => el?.getAttribute(name))
      .filter((v): v is string => v !== null && v !== "");
    parts.unshift(
      attrs.length === 0 ? el.tagName.toLowerCase() : `${el.tagName.toLowerCase()}[${attrs[0]}]`,
    );
  }
  return parts.slice(-4).join(" > ");
};

/**
 * **Every label under which an identifier is allowed to appear at all.**
 *
 * Read off `strings` rather than restated, so a renamed label cannot silently widen what the sweep
 * accepts. `21-F15` exception (b) is *"a secondary, explicitly labelled technical id offered for
 * support beside a name"* — the label is the condition, not decoration.
 */
const REFERENCE_LABELS: readonly string[] = [
  strings.names.orgReference,
  strings.names.branchReference,
  strings.names.deviceReference,
  strings.names.personReference,
  strings.summary.cash.shiftReference,
  strings.catalog.reference,
];

/**
 * Every VISIBLE text node in which an identifier appears WITHOUT its label immediately in front of
 * it — `21-F15`'s violation, stated as the FR states its condition.
 *
 * ⚠ **The rule is label ADJACENCY and not an ancestor attribute, and the difference was found by
 * running this sweep rather than by reasoning.** The FR describes the check as *"not inside a
 * component declared a technical-id slot"*, and `<TechnicalId>` is that component. But two real
 * slots cannot contain a component at all — an `<option>` and an `aria-label` hold ONE string —
 * so the flat form of the treatment is the only thing that fits there, and an ancestor walk
 * reported all four of them as violations while every one was correctly labelled. Adjacency is
 * what the exception actually requires, it covers the component case for free (`TechnicalId`
 * renders `label + id` in one text node), and it is strictly harder to satisfy by accident: a key
 * emitted anywhere without its label fails, including inside a declared slot.
 *
 * Attributes are deliberately not swept: `data-shift="<uuid>"` is a React key and a test anchor,
 * never something a human reads, and `21-F15`'s name slot is *"any place a surface presents such an
 * entity to a human"*.
 */
const bareIdentifiers = (): string[] => {
  const found: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? "";
      for (const match of text.matchAll(new RegExp(IDENTIFIER, "gi"))) {
        const before = text.slice(0, match.index);
        if (REFERENCE_LABELS.some((label) => before.trimEnd().endsWith(label))) continue;
        found.push(`${trail(node)} :: ${text.trim().slice(0, 120)}`);
      }
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };
  walk(document.body);
  return found;
};

const bodyText = (): string => (document.body.textContent ?? "").replace(/\s+/g, " ");

// ── the whole cloud plane, answered ───────────────────────────────────────────────────────────

const ENTRY = {
  kind: "item",
  id: "biryani",
  name: "Chicken Biryani",
  station: null,
  parent_id: null,
  prices: [
    { branch_id: BRANCH_ID, channel: "counter", price_paisa: 45_000 },
    { branch_id: OTHER_BRANCH_ID, channel: "counter", price_paisa: 45_000 },
  ],
};

const SUMMARY = {
  business_date: "2031-03-02",
  branch_ids: [BRANCH_ID, OTHER_BRANCH_ID],
  sales: {
    total_paisa: 120_000,
    orders: 4,
    by_channel: [{ channel: "counter", orders: 4, billed_paisa: 120_000 }],
  },
  cash: [
    {
      shift_id: SHIFT_ID,
      cashier_user_id: CASHIER_ID,
      branch_id: BRANCH_ID,
      closed: true,
      expected_cash_paisa: 120_000,
      counted_cash_paisa: 118_500,
      variance_paisa: -1_500,
      no_sale_count: 0,
      paid_out_paisa: 0,
    },
  ],
  corrections: [
    {
      kind: "void",
      count: 1,
      value_paisa: 4_000,
      removed_from_sales: true,
      by: [{ actor_user_id: CASHIER_ID, approver_user_id: OWNER_ID, count: 1, value_paisa: 4_000 }],
    },
    { kind: "comp", count: 0, value_paisa: 0, removed_from_sales: false, by: [] },
    { kind: "discount", count: 0, value_paisa: 0, removed_from_sales: false, by: [] },
  ],
  top_items: [{ item_id: "biryani", qty: 4, revenue_paisa: 120_000 }],
  hourly: [{ offset: 0, wall_hour: 12, billed_paisa: 120_000 }],
  days: [
    {
      day_id: "2031-03-02",
      branch_id: BRANCH_ID,
      closed: true,
      opening_float_paisa: 5_000,
      counted_cash_paisa: 118_500,
      deposit_paisa: 0,
    },
  ],
  honesty: {
    events: 50,
    provisional_stamp_events: 0,
    every_day_closed: true,
    open_shifts: 0,
    unsettled_orders: 0,
    truncated: false,
    anomalies: [],
  },
  omissions: [],
  sync: { latest_arrival_ms: 1_930_000_000_000, server_now_ms: 1_930_000_060_000 },
  scope: { org_id: ORG_ID, branch_id: null, covers: null },
};

const NAMED_DIRECTORY = {
  org: { org_id: ORG_ID, display_name: ORG_NAME, status: "active" },
  branches: [
    {
      branch_id: BRANCH_ID,
      display_name: BRANCH_NAME,
      branch_type: "branch",
      branch_class: "production",
    },
  ],
};

/** `01-F68`'s UNNAMED org: events, no directory row. The state every tenant is in before naming. */
const EMPTY_DIRECTORY = {
  org: { org_id: ORG_ID, display_name: null, status: null },
  branches: [],
};

/**
 * **`CASHIER_ID` is deliberately NOT in it.** The summary attributes a shift and a void to her, so
 * one person on that screen is named and one is not — `11-F22`'s *"rendering is independent of
 * participation"* and `21-F15`'s treatment, both exercised by one fixture. A roster carrying
 * everybody could not tell a correct implementation from one that renders whatever it is handed.
 */
const NAMED_ROSTER = [
  {
    user_id: OWNER_ID,
    display_name: OWNER_NAME,
    email: "ayesha@example.test",
    grid_ordinal: 1,
    assignments: [{ role: "owner", branch_id: null, status: "active" }],
  },
  {
    user_id: "01a03082-9666-7000-8000-ffffffffffff",
    display_name: "Hina Raza",
    email: null,
    grid_ordinal: 2,
    // A BRANCH assignment, so the staff screen has a place to name (or to treat as unnamed).
    assignments: [{ role: "cashier", branch_id: BRANCH_ID, status: "active" }],
  },
];

const refused = (): never => {
  throw TRPCClientError.from({
    error: {
      code: -32003,
      message: "the matrix said no",
      data: { code: "FORBIDDEN", httpStatus: 403 },
    },
  });
};

const handlersFor = (directory: Handler, roster: Handler): Handlers => ({
  "session.whoami": () => ({
    user_id: OWNER_ID,
    org_id: ORG_ID,
    assignments: [{ role: "owner", branch_id: null }],
    display_name: OWNER_NAME,
  }),
  "tenancy.directory": directory,
  "users.list": roster,
  "catalog.published": () => ({ version: 7, entries: [ENTRY] }),
  "catalog.enabled": () => ({ branches: [BRANCH_ID, OTHER_BRANCH_ID], channels: ["counter"] }),
  "catalog.pending": () => [
    {
      edit_id: EDIT_ID,
      entity: "item",
      entity_id: "biryani",
      name: "Chicken Biryani (Half)",
      actor_user_id: OWNER_ID,
      apply_when: "day_end",
      lands_at: 1_930_100_000_000,
      version: null,
    },
  ],
  "catalog.history": () => [
    {
      entity: "item",
      entity_id: "biryani",
      actor_user_id: OWNER_ID,
      server_received_at: 1_930_000_000_000,
      version: 7,
      payload: {
        price_changes: [
          { branch_id: BRANCH_ID, channel: "counter", before_paisa: 40_000, after_paisa: 45_000 },
          {
            branch_id: OTHER_BRANCH_ID,
            channel: "counter",
            before_paisa: 40_000,
            after_paisa: 45_000,
          },
        ],
      },
    },
  ],
  "devices.list": () => [
    {
      device_id: DEVICE_ID,
      branch_id: BRANCH_ID,
      device_class: "counter_electron",
      display_name: null,
      revoked_at: 1_929_000_000_000,
      token_expires_at: null,
      revoked_by: OWNER_ID,
    },
  ],
  "summary.nightly": () => SUMMARY,
});

type Handler = (input: unknown) => unknown;

/**
 * Mounts the SHIPPED shell around the SHIPPED tabs, on the Menu section with the entry OPEN — the
 * price grid's row axis and `14-F3`'s moved cells are name slots that exist only behind a click.
 */
const mountApp = async (directory: Handler, roster: Handler): Promise<void> => {
  const log: CallLog = [];
  render(
    <Harness log={log} handlers={handlersFor(directory, roster)}>
      <AuthGate>
        <Workspace />
      </AuthGate>
    </Harness>,
  );
  await screen.findByRole("button", { name: strings.nav.devices });
  const rows = await screen.findAllByRole("button", { name: /Chicken Biryani/ });
  fireEvent.click(rows[0] as HTMLElement);
  await screen.findByRole("button", { name: "Save" });
  await waitFor(() => expect(bodyText()).toContain(strings.history.heading));
};

/**
 * Move to a section and wait for it to have finished asking the server.
 *
 * "Finished" is *not loading any more* rather than *a landmark appeared*, because a section whose
 * reads the matrix REFUSED never renders its landmark — and the refused state is one of the three
 * this file exists to sweep. A caller that wants a specific landmark names one.
 */
const goTo = async (label: string, landmark?: string): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => {
    if ((document.body.textContent ?? "").includes(strings.errors.loading)) {
      throw new Error(`${label} is still loading`);
    }
  });
  if (landmark !== undefined) await waitFor(() => expect(bodyText()).toContain(landmark));
};

const SECTIONS: readonly string[] = [strings.nav.devices, strings.nav.summary, strings.nav.staff];

/**
 * **Sweeps EVERY section, collecting at each one.**
 *
 * `workspace.tsx` mounts one section at a time on purpose (*"the inactive section's queries should
 * not run"*), so the DOM only ever holds the tab you are on — a sweep that visited four tabs and
 * read the document once would be a sweep of the fourth. That is the vacuous shape this repo keeps
 * recording, so the collection is per section and the verdict names which one it came from.
 */
const sweepEverySection = async (
  directory: Handler,
  roster: Handler,
): Promise<{ readonly bare: string[]; readonly sectionsWithIdentifiers: string[] }> => {
  await mountApp(directory, roster);
  const bare: string[] = [];
  const sectionsWithIdentifiers: string[] = [];
  const collect = (label: string): void => {
    bare.push(...bareIdentifiers().map((v) => `${label} :: ${v}`));
    // `24-F14` per SECTION rather than per run: a section rendering no identifier at all is a
    // section this sweep says nothing about, and four such sections still produce a clean verdict.
    // Scoped to `<main>`: the shell's HEADER is on every section, so an unnamed org's own
    // reference would make all four sections "have an identifier" and the guard would be measuring
    // the chrome rather than the screen.
    const main = (document.querySelector("main")?.textContent ?? "").replace(/\s+/g, " ");
    if (IDENTIFIER.test(main)) sectionsWithIdentifiers.push(label);
  };
  collect(strings.nav.menu);
  for (const label of SECTIONS) {
    await goTo(label);
    collect(label);
  }
  return { bare, sectionsWithIdentifiers };
};

// ══ A. THE SWEEP — the assertion this file exists for ══════════════════════════════════════════

describe("A · 21-F15 — no machine identifier reaches a name slot, in any of the three states", () => {
  it("named: the directory answers, and every id on the glass is a labelled reference", async () => {
    const swept = await sweepEverySection(
      () => NAMED_DIRECTORY,
      () => NAMED_ROSTER,
    );
    expect(swept.bare).toEqual([]);
    /*
      `24-F14`, per SECTION rather than per run: a section rendering no identifier at all is a
      section this sweep says nothing about, and four such sections still produce a clean verdict.

      **STAFF IS ABSENT HERE AND PRESENT IN THE NEXT TEST, AND THAT IS THE SIGNAL.** Everything on
      it is named in this state, so there is no reference to render and no key on the screen — which
      is `21-F15` working: the treatment sites are a debt that shrinks. The three that remain hold
      keys the product has no name for (a shift, a till nothing has named, a branch outside the
      directory), which is why they still have targets.
    */
    expect(swept.sectionsWithIdentifiers).toEqual([
      strings.nav.menu,
      strings.nav.devices,
      strings.nav.summary,
    ]);
  });

  it("unnamed: the directory answers with NO names, and still no bare key reaches a slot", async () => {
    // `01-F68`: *"an org with events and no record is UNNAMED, not invalid"* — and it is the state
    // of nearly every deployment, so it is the state that must not degrade to hexadecimal.
    const swept = await sweepEverySection(
      () => EMPTY_DIRECTORY,
      () => NAMED_ROSTER,
    );
    expect(swept.bare).toEqual([]);
    expect(swept.sectionsWithIdentifiers).toEqual([
      strings.nav.menu,
      strings.nav.devices,
      strings.nav.summary,
      strings.nav.staff,
    ]);
  });

  it("unknown: the directory is REFUSED, and still no bare key reaches a slot", async () => {
    const swept = await sweepEverySection(refused, refused);
    expect(swept.bare).toEqual([]);
    // The menu, the devices and the summary still render their keys behind labels; the STAFF
    // section renders its refusal instead (`14-F39` — both of its reads were refused) and carries
    // no key at all, which is the honest answer and is named here rather than papered over.
    expect(swept.sectionsWithIdentifiers).toEqual([
      strings.nav.menu,
      strings.nav.devices,
      strings.nav.summary,
    ]);
  });

  it("unnamed: the key is KEPT and labelled — two unnamed records stay tellable apart", async () => {
    /*
      **The dual of the sweep above, and it exists because the sweep alone cannot see this.**
      `bareIdentifiers()` reports a key that reaches the glass WITHOUT its label; an implementation
      that dropped the key entirely emits nothing and passes it cleanly — while `21-F15` says the
      slot *"is never blank"* and exception (b) is precisely how a support call about one of two
      unnamed branches is possible at all. Measured: with the reference dropped from the treatment,
      the sweep stays green and only this assertion fires.
    */
    await mountApp(
      () => EMPTY_DIRECTORY,
      () => NAMED_ROSTER,
    );

    await goTo(strings.nav.summary, strings.summary.cash.heading);
    const summaryText = bodyText();
    // Two unnamed branches on one control, each carrying its own key behind the shared label.
    for (const id of [BRANCH_ID, OTHER_BRANCH_ID]) {
      expect(summaryText).toContain(`${strings.names.branchReference} ${id}`);
    }
    expect(summaryText).toContain(`${strings.summary.cash.shiftReference} ${SHIFT_ID}`);
    // The cashier the roster does not carry keeps hers too.
    expect(summaryText).toContain(`${strings.names.personReference} ${CASHIER_ID}`);

    await goTo(strings.nav.devices, strings.devices.columnsOwed);
    expect(bodyText()).toContain(`${strings.names.deviceReference} ${DEVICE_ID}`);
  });

  it("`24-F14` — the sweep has identifiers to find, so a clean run is evidence", async () => {
    // The empty-match protection, and it is not decoration: the sweep's whole verdict is an empty
    // array, which is exactly what a broken walker, an unmounted app or a fixture full of
    // `org-demo` keys would also produce. This asserts the walker fires on a real violation and
    // that the fixture puts identifiers on the screen at all.
    await mountApp(
      () => EMPTY_DIRECTORY,
      () => NAMED_ROSTER,
    );
    expect(IDENTIFIER.test(bodyText())).toBe(true);

    const probe = document.createElement("div");
    document.body.append(probe);
    try {
      // A bare key: the defect this whole change removes, injected so the walker is proven to see
      // one before its empty verdicts above are read as evidence.
      probe.textContent = ORG_ID;
      expect(bareIdentifiers()).toHaveLength(1);

      // …and the exemption is real and NARROW: the same key behind its label is not a violation,
      // while a `data-technical-id` slot that dropped the label still is.
      probe.textContent = `${strings.names.orgReference} ${ORG_ID}`;
      expect(bareIdentifiers()).toEqual([]);

      probe.setAttribute("data-technical-id", "");
      probe.textContent = ORG_ID;
      expect(bareIdentifiers()).toHaveLength(1);
    } finally {
      probe.remove();
    }
    expect(bareIdentifiers()).toEqual([]);
  });
});

// ══ B. THE NAMES THEMSELVES ═══════════════════════════════════════════════════════════════════

describe("B · the defect as reported — the header names the business and the person", () => {
  it("renders the org's name and the signed-in person's, not their ids", async () => {
    await mountApp(
      () => NAMED_DIRECTORY,
      () => NAMED_ROSTER,
    );
    const header = document.querySelector("header") as HTMLElement;
    const text = (header.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain(strings.session.org);
    expect(text).toContain(ORG_NAME);
    expect(text).toContain(strings.session.user);
    expect(text).toContain(OWNER_NAME);
    // The reported defect, negatively: neither id is on the chrome any more.
    expect(text).not.toContain(ORG_ID);
    expect(text).not.toContain(OWNER_ID);
  });

  it("the person's name comes from `whoami` and NOT from the owner-only roster", async () => {
    // `router.ts` records why the two are split: an identity read that cannot answer without a peer
    // is not an identity read. So with the roster refused and the directory refused, the header
    // still names the person — and the ORG degrades to its stated treatment beside her.
    await mountApp(refused, refused);
    const text = ((document.querySelector("header") as HTMLElement).textContent ?? "").replace(
      /\s+/g,
      " ",
    );
    expect(text).toContain(OWNER_NAME);
    expect(text).toContain(strings.names.orgUnknown);
  });
});

describe("C · the branch, the cashier and the till", () => {
  it("names the branch on the price column, the price grid and the summary's drill-in", async () => {
    await mountApp(
      () => NAMED_DIRECTORY,
      () => NAMED_ROSTER,
    );
    fireEvent.click(screen.getByRole("button", { name: strings.nav.menu }));
    await screen.findByText(new RegExp(strings.catalog.pricesShown));
    expect(bodyText()).toContain(`${strings.catalog.pricesShown} ${BRANCH_NAME}`);
    expect(screen.getByLabelText(`${BRANCH_NAME} counter`)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: strings.nav.summary }));
    await waitFor(() => expect(bodyText()).toContain(strings.summary.cash.heading));
    const options = Array.from(
      (document.querySelector('[data-summary-control="branch"]') as HTMLElement).querySelectorAll(
        "option",
      ),
    );
    // The named branch reads as its name; the one the directory does not carry reads as the stated
    // treatment. **Both on one control**, which is what makes this discriminating: a screen that
    // rendered the directory's answer for everything, or the treatment for everything, fails here.
    expect(options.map((o) => o.textContent)).toContain(BRANCH_NAME);
    expect(options.some((o) => (o.textContent ?? "").includes(strings.names.branchUnnamed))).toBe(
      true,
    );
    expect(options.map((o) => o.value)).toContain(BRANCH_ID);
  });

  it("11-F22 — a cashier the roster does not carry is UNNAMED, and the shift still reads", async () => {
    await mountApp(
      () => NAMED_DIRECTORY,
      () => NAMED_ROSTER,
    );
    fireEvent.click(screen.getByRole("button", { name: strings.nav.summary }));
    await waitFor(() => expect(bodyText()).toContain(strings.summary.cash.heading));
    const row = document.querySelector(`[data-shift="${SHIFT_ID}"]`) as HTMLElement;
    const text = (row.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain(strings.names.personUnnamed);
    // The key survives, labelled — two shifts must stay tellable apart (`21-F15` exception (b)).
    expect(text).toContain(strings.summary.cash.shiftReference);
    expect(text).toContain(SHIFT_ID);
    // …and the row is still a cash row: naming it did not cost it its figures.
    expect(text).toContain("Rs");
  });

  it("01-F70 — the device list names the till, its branch and who revoked it", async () => {
    await mountApp(
      () => NAMED_DIRECTORY,
      () => NAMED_ROSTER,
    );
    fireEvent.click(screen.getByRole("button", { name: strings.nav.devices }));
    const row = await waitFor(() => {
      const li = Array.from(document.querySelectorAll("li")).find((el) =>
        (el.textContent ?? "").includes(DEVICE_ID),
      );
      if (li === undefined) throw new Error("no device row yet");
      return li as HTMLElement;
    });
    const text = (row.textContent ?? "").replace(/\s+/g, " ");
    // Nothing writes `01-F70`'s name yet, so the till stands on the treatment — the debt shown.
    expect(text).toContain(strings.names.deviceUnnamed);
    // Its key stays on the row whether or not it is named: it is what an owner quotes to support.
    expect(text).toContain(`${strings.names.deviceReference} ${DEVICE_ID}`);
    expect(text).toContain(BRANCH_NAME);
    // `14-F13`'s actor, by name (`11-F20`).
    expect(text).toContain(`${strings.devices.revokedBy} ${OWNER_NAME}`);
  });

  it("14-F28 — the pending row says WHO staged the edit, by name", async () => {
    await mountApp(
      () => NAMED_DIRECTORY,
      () => NAMED_ROSTER,
    );
    expect(bodyText()).toContain(`${strings.timing.stagedBy} ${OWNER_NAME}`);
  });
});

// ══ D. THE TWO ABSENCES ARE TWO ═══════════════════════════════════════════════════════════════

describe("D · 00 §5.7 — the surface says WHICH absence it is showing", () => {
  it("`unnamed` and `unknown` are different words on the same slot", async () => {
    await mountApp(
      () => EMPTY_DIRECTORY,
      () => NAMED_ROSTER,
    );
    const unnamedText = bodyText();
    expect(unnamedText).toContain(strings.names.orgUnnamed);
    expect(unnamedText).not.toContain(strings.names.orgUnknown);
    cleanup();

    await mountApp(refused, refused);
    const unknownText = bodyText();
    expect(unknownText).toContain(strings.names.orgUnknown);
    expect(unknownText).not.toContain(strings.names.orgUnnamed);
  });

  it("21-F15's counterpart — the screen says where a name is SET, but only while one is missing", async () => {
    await mountApp(
      () => EMPTY_DIRECTORY,
      () => NAMED_ROSTER,
    );
    // The landmark is a sentence only this screen renders — `strings.staff.heading` is also the
    // TAB's own label, so waiting on it resolves before the roster has landed.
    await goTo(strings.nav.staff, strings.staff.nameFixOwed);
    expect(bodyText()).toContain(strings.staff.branchNamesOwed);
    cleanup();

    // …and it is GONE when nothing is standing on the treatment: an absence stated where there is
    // no absence is its own dishonesty.
    await mountApp(
      () => NAMED_DIRECTORY,
      () => NAMED_ROSTER,
    );
    await goTo(strings.nav.staff, strings.staff.nameFixOwed);
    expect(bodyText()).not.toContain(strings.staff.branchNamesOwed);
  });

  it("a refused naming read takes NO screen down — commandment 5 and 8 both hold", async () => {
    // The reason `usePlaceNames`/`usePeopleNames` swallow a refusal: `tenancy.directory` is
    // `report.sales_view` and `users.list` is `user.manage`, while the screens they decorate are
    // gated on other actions. A naming read that failed loudly would take down a screen the matrix
    // said yes to — which is a worse defect than the one this whole change fixes.
    await mountApp(refused, refused);
    fireEvent.click(screen.getByRole("button", { name: strings.nav.summary }));
    await waitFor(() => expect(bodyText()).toContain(strings.summary.cash.heading));
    expect(bodyText()).toContain("Rs");
    expect(bareIdentifiers()).toEqual([]);
  });
});

// ══ E. COMMANDMENT 7 — WHAT THE OWNER TYPED REACHES THE GLASS ═════════════════════════════════

describe("E · commandment 7 — user content is Unicode and renders faithfully", () => {
  it("an Urdu business, branch and cashier render exactly as typed, on every surface", async () => {
    // `00 §5.6`: the UI is English; the restaurant's name is not the UI. This is asserted rather
    // than assumed because the failure is silent — a normalised or transliterated name looks
    // plausible and is somebody's business rendered wrong.
    const urduOrg = "کراچی بریانی ہاؤس";
    const urduBranch = "طارق روڈ";
    const urduPerson = "عائشہ خان";
    await mountApp(
      () => ({
        org: { org_id: ORG_ID, display_name: urduOrg, status: "active" },
        branches: [
          {
            branch_id: BRANCH_ID,
            display_name: urduBranch,
            branch_type: "branch",
            branch_class: "production",
          },
        ],
      }),
      () => [
        {
          user_id: OWNER_ID,
          display_name: urduPerson,
          email: null,
          grid_ordinal: 1,
          assignments: [{ role: "owner", branch_id: null, status: "active" }],
        },
      ],
    );

    const header = ((document.querySelector("header") as HTMLElement).textContent ?? "").replace(
      /\s+/g,
      " ",
    );
    expect(header).toContain(urduOrg);
    expect(bodyText()).toContain(urduBranch);
    expect(bodyText()).toContain(`${strings.timing.stagedBy} ${urduPerson}`);

    fireEvent.click(screen.getByRole("button", { name: strings.nav.devices }));
    await waitFor(() => expect(bodyText()).toContain(strings.devices.revokedBy));
    expect(bodyText()).toContain(`${strings.devices.revokedBy} ${urduPerson}`);
  });
});
