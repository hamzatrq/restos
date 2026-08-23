/**
 * `14-F12`'s list and `14-F13`'s revoke control, as an owner meets them.
 *
 * **The assertion this file exists for is the ACTOR column**, because that is the entire reason
 * `14-F13` puts revocation on an authenticated screen rather than on the shell command that already
 * existed. It has three states and they must be three, not two: active, revoked-with-actor, and
 * revoked-with-no-actor-recorded. The third is a real state today — every revocation performed by
 * `pnpm -C services/sync-gateway revoke-device` is one — and collapsing it either way is a lie: into
 * "active" hides a dead till, into "revoked by —" invents an attribution.
 *
 * **The fixture is the coverage boundary here, exactly as `pnpm layout:check` records for itself.**
 * A suite built only on devices revoked through this screen could not tell a correct implementation
 * from one that renders the current user's id for every revoked row, so the CLI-revoked row is not
 * extra coverage — it is the only row that discriminates.
 *
 * ⚠ AUTHORSHIP DEPARTURE, DECLARED: written by the session that wrote the component. The mutation
 * matrix in `apps/backoffice/CLAUDE.md` is what stands in for `24 §3`'s independent oracle.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeviceList } from "../components/device-list";
import { strings } from "../lib/strings";
import { type CallLog, type Handlers, Harness } from "./harness";

type Row = {
  device_id: string;
  branch_id: string;
  device_class: string;
  /**
   * `01-F70`'s human name, off the cloud registry row. **`null` on two of the three fixtures on
   * purpose** — nothing writes one in any deployment today, so a suite that named every till would
   * never exercise `21-F15`'s treatment, which is what every real row renders.
   */
  display_name: string | null;
  revoked_at: number | null;
  token_expires_at: number | null;
  revoked_by: string | null;
};

/**
 * `01-F68`/`01-F69` and `11-F20`, as the two directories this screen resolves names through.
 * `branch-two` is deliberately ABSENT from the branch list: a till standing at a branch the
 * directory does not name is `21-F15`'s unnamed case, and without it every branch on the screen
 * would be named and the treatment would go unexercised.
 */
const DIRECTORY = {
  org: { org_id: "org-zaiqa", display_name: "Karachi Biryani House", status: "active" },
  branches: [
    {
      branch_id: "branch-main",
      display_name: "Tariq Road",
      branch_type: "branch",
      branch_class: "production",
    },
  ],
};

const ROSTER = [
  {
    user_id: "user-ayesha",
    display_name: "Ayesha Khan",
    email: null,
    grid_ordinal: 1,
    assignments: [],
  },
];

const ACTIVE: Row = {
  device_id: "device-counter-1",
  branch_id: "branch-main",
  device_class: "counter_electron",
  display_name: "Front counter",
  revoked_at: null,
  token_expires_at: 1_900_000_000_000,
  revoked_by: null,
};

const REVOKED_HERE: Row = {
  device_id: "device-stolen-tablet",
  branch_id: "branch-main",
  device_class: "waiter",
  display_name: null,
  revoked_at: 1_785_000_000_000,
  token_expires_at: 1_900_000_000_000,
  revoked_by: "user-ayesha",
};

const REVOKED_BY_CLI: Row = {
  device_id: "device-decommissioned",
  branch_id: "branch-two",
  device_class: "kitchen",
  display_name: null,
  revoked_at: 1_784_000_000_000,
  token_expires_at: null,
  revoked_by: null,
};

const mount = (
  rows: readonly Row[],
  extra: Handlers = {},
): { log: CallLog; revocations: unknown[] } => {
  const log: CallLog = [];
  const revocations: unknown[] = [];
  const handlers: Handlers = {
    "devices.list": () => rows,
    // `21-F15` — the two reads this screen resolves names through. Neither gates it, which §N
    // below is the assertion for.
    "tenancy.directory": () => DIRECTORY,
    "users.list": () => ROSTER,
    "devices.revoke": (input) => {
      revocations.push(input);
      const { device_id } = input as { device_id: string };
      return {
        device_id,
        branch_id: "branch-main",
        device_class: "counter_electron",
        revoked_at: 1_786_000_000_000,
        already: false,
        revoked_by: "user-ayesha",
      };
    },
    ...extra,
  };
  render(
    <Harness handlers={handlers} log={log}>
      <DeviceList />
    </Harness>,
  );
  return { log, revocations };
};

afterEach(cleanup);

/**
 * A device's row, found by the KEY rather than by any rendered word — so the helper keeps working
 * whether the row is naming its till, standing on `21-F15`'s unnamed treatment, or reporting that
 * the directory could not be read.
 */
const rowFor = (row: Row): HTMLElement => {
  const found = Array.from(document.querySelectorAll("li")).find((el) =>
    (el.textContent ?? "").includes(row.device_id),
  );
  if (found === undefined) throw new Error(`no row on screen for ${row.device_id}`);
  return found as HTMLElement;
};

describe("14-F12 — the list", () => {
  it("renders every registered device, revoked ones included", async () => {
    mount([ACTIVE, REVOKED_HERE, REVOKED_BY_CLI]);
    await screen.findByText(strings.devices.columnsOwed);
    for (const row of [ACTIVE, REVOKED_HERE, REVOKED_BY_CLI]) expect(rowFor(row)).toBeTruthy();
  });

  it("says which of 14-F12's columns are NOT recorded, rather than inventing them", async () => {
    mount([ACTIVE]);
    expect(await screen.findByText(strings.devices.columnsOwed)).toBeTruthy();
    // The negative half, scoped to the ROW — the card's disclosure sentence necessarily contains
    // the words "last seen" and "sync lag", and a screen-wide query would match its own honesty
    // notice. What must contain no fabricated liveness figure is the device row itself (`00 §5.7`:
    // a plausible "last seen 2 minutes ago" is indistinguishable from a real one on a demo).
    const row = rowFor(ACTIVE);
    expect(row.textContent ?? "").not.toMatch(/last seen|sync lag|app version/i);
    // …and it DOES carry the three the registry actually holds, which is the control: without it
    // the assertion above passes against a row that renders nothing at all. The branch is asserted
    // by its NAME (`21-F15`) — the key is what the row is FOUND by, never what it reads as.
    expect(row.textContent ?? "").toContain("Tariq Road");
    expect(row.textContent ?? "").toContain(ACTIVE.device_class);
    expect(row.textContent ?? "").toContain(strings.devices.active);
  });
});

describe("21-F15 — the fleet reads as NAMES, and says where a name is set", () => {
  it("names the till, its branch and the actor — and keeps the key beside the name", async () => {
    mount([ACTIVE]);
    await screen.findByText(strings.devices.columnsOwed);
    const row = (rowFor(ACTIVE).textContent ?? "").replace(/\s+/g, " ");
    // `01-F70`'s name, off the row `devices.list` already returns — the field that was served and
    // dropped while this list rendered the key as the row's identity.
    expect(row).toContain("Front counter");
    expect(row).toContain("Tariq Road");
    // Exception (b): the key STAYS on a named row here, because `device_id` is what an owner quotes
    // to support and what `01-N5`'s replacement path uses. Every other surface drops it once named.
    expect(row).toContain(`${strings.names.deviceReference} ${ACTIVE.device_id}`);
    // …and it is never the row's headline: the name comes first in the rendered text.
    expect(row.indexOf("Front counter")).toBeLessThan(row.indexOf(ACTIVE.device_id));
  });

  it("an unnamed till and a branch outside the directory both take the stated treatment", async () => {
    mount([REVOKED_BY_CLI]);
    await screen.findByText(strings.devices.columnsOwed);
    const row = (rowFor(REVOKED_BY_CLI).textContent ?? "").replace(/\s+/g, " ");
    expect(row).toContain(strings.names.deviceUnnamed);
    expect(row).toContain(strings.names.branchUnnamed);
    // Never blank and never the key alone (`21-F15`): both keys survive behind their labels.
    expect(row).toContain(`${strings.names.deviceReference} ${REVOKED_BY_CLI.device_id}`);
    expect(row).toContain(`${strings.names.branchReference} ${REVOKED_BY_CLI.branch_id}`);
  });

  /**
   * **`21-F15`'s counterpart half, and the SEAM assertion for it.** A treatment that says only
   * *unnamed* has retired the question; the sentence says who sets a name. It is asserted in both
   * directions because a note rendered unconditionally is decoration — the mutant that matters is
   * a `<NameDebt>` wired with an empty list, which looks correct on today's fixtures and never
   * disappears when the debt is paid.
   */
  it("says WHERE a name is set — and only while something is standing on the treatment", async () => {
    mount([REVOKED_BY_CLI]);
    await screen.findByText(strings.devices.columnsOwed);
    expect(screen.getByText(strings.names.owed)).toBeTruthy();
  });

  it("…and says nothing once every till and branch on the screen is named", async () => {
    mount([{ ...ACTIVE, display_name: "Front counter" }]);
    await screen.findByText(strings.devices.columnsOwed);
    expect(screen.queryByText(strings.names.owed)).toBeNull();
  });
});

describe("14-F13 — revoked state and ACTOR", () => {
  it("a device revoked through this screen names WHO revoked it", async () => {
    mount([REVOKED_HERE]);
    // BY NAME (`11-F20`, `21-F15`) — the roster resolves the word; the event carried only the id.
    expect(await screen.findByText(/Ayesha Khan/)).toBeTruthy();
  });

  it("a device revoked from the service host says the actor is NOT RECORDED", async () => {
    // Never a blank cell. A blank reads as "nobody", which is a claim; the true statement is that
    // the ledger has no row for it, because a shell has no signed-in user to record.
    mount([REVOKED_BY_CLI]);
    expect(await screen.findByText(strings.devices.notRecorded)).toBeTruthy();
  });

  it("an ACTIVE device shows neither a revocation nor an actor — the discriminating control", async () => {
    // Without this, "renders an actor when there is one" also passes against a component that
    // renders the actor line unconditionally.
    mount([ACTIVE]);
    expect(await screen.findByText(strings.devices.active)).toBeTruthy();
    expect(screen.queryByText(strings.devices.notRecorded)).toBeNull();
    expect(screen.queryByText(/Ayesha Khan/)).toBeNull();
  });

  it("the three states are three DIFFERENT renderings on one screen", async () => {
    // The pairwise assertion, so no collapse of any two can pass — the same shape
    // `permission-matrix.test.ts` §2 uses for Appendix A's three cell kinds.
    mount([ACTIVE, REVOKED_HERE, REVOKED_BY_CLI]);
    await screen.findByText(strings.devices.columnsOwed);
    expect(screen.getAllByText(strings.devices.active)).toHaveLength(1);
    expect(screen.getAllByText(strings.devices.notRecorded)).toHaveLength(1);
    expect(screen.getAllByText(/Ayesha Khan/)).toHaveLength(1);
  });
});

describe("14-F13 — the control, and its consequence", () => {
  it("revoking takes TWO acts and states the consequence before the second (01-F48, 01-N5)", async () => {
    const { revocations } = mount([ACTIVE]);

    fireEvent.click(await screen.findByRole("button", { name: strings.devices.revoke }));
    // The consequence is READ, not the control's name — the a11y regression
    // `apps/backoffice/CLAUDE.md` records from the apply-when row, avoided here by construction.
    expect(screen.getByText(strings.devices.revokeConsequence)).toBeTruthy();
    // Nothing has been sent yet. A one-tap kill switch on an irreversible act is the defect.
    expect(revocations).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: strings.devices.confirmYes }));
    await waitFor(() => expect(revocations).toHaveLength(1));
    expect(revocations[0]).toEqual({ device_id: ACTIVE.device_id });
  });

  it("declining the confirmation sends nothing", async () => {
    const { revocations } = mount([ACTIVE]);
    fireEvent.click(await screen.findByRole("button", { name: strings.devices.revoke }));
    fireEvent.click(screen.getByRole("button", { name: strings.devices.confirmNo }));
    expect(revocations).toHaveLength(0);
    expect(screen.queryByText(strings.devices.revokeConsequence)).toBeNull();
  });

  it("re-reads the list from the server after a revocation — never edits its own cache", async () => {
    const { log } = mount([ACTIVE]);
    fireEvent.click(await screen.findByRole("button", { name: strings.devices.revoke }));
    fireEvent.click(screen.getByRole("button", { name: strings.devices.confirmYes }));
    await waitFor(() =>
      expect(log.filter((call) => call.path === "devices.list").length).toBeGreaterThan(1),
    );
  });

  it("a REVOKED device offers no control at all — there is no un-revoke (14-F30)", async () => {
    mount([REVOKED_HERE, REVOKED_BY_CLI]);
    await screen.findByText(strings.devices.columnsOwed);
    expect(screen.queryByRole("button", { name: strings.devices.revoke })).toBeNull();
    // …and no restore affordance was invented in its place.
    expect(screen.queryByText(/restore|un-?revoke|reinstate/i)).toBeNull();
  });

  it("an ALREADY-revoked answer says so and claims no attribution", async () => {
    mount([ACTIVE], {
      "devices.revoke": (input) => ({
        ...(input as object),
        branch_id: "branch-main",
        device_class: "counter_electron",
        revoked_at: 1_700_000_000_000,
        already: true,
        revoked_by: null,
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: strings.devices.revoke }));
    fireEvent.click(screen.getByRole("button", { name: strings.devices.confirmYes }));
    expect(await screen.findByText(strings.devices.alreadyRevoked)).toBeTruthy();
  });

  it("a REFUSED revocation shows the server's own words, not `revoke failed`", async () => {
    mount([ACTIVE], {
      "devices.revoke": () => {
        throw new Error("device device-counter-1 is NOT REGISTERED in org org-demo");
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: strings.devices.revoke }));
    fireEvent.click(screen.getByRole("button", { name: strings.devices.confirmYes }));
    expect(await screen.findByText(/NOT REGISTERED/)).toBeTruthy();
  });
});

describe("Commandment 5 — the screen reads the server and nothing else", () => {
  it("asks `devices.list` and never `catalog.*`", async () => {
    const { log } = mount([ACTIVE]);
    await screen.findByText(strings.devices.columnsOwed);
    /*
      **The set, not the count — and the set is an ALLOW-LIST rather than a singleton.** It was
      `toEqual(["devices.list"])`, which read as a two-plane assertion and was really a
      *"this screen makes exactly one call"* assertion: `21-F15`'s naming reads are on the same
      plane, gated by the same matrix, and reddened it. What Commandment 5 actually claims is that
      every call is a cloud-plane tRPC read and none reaches the operational plane, so that is what
      is asserted — and naming a third path is still a diff a reviewer sees.
    */
    expect([...new Set(log.map((call) => call.path))].sort()).toEqual([
      "devices.list",
      "tenancy.directory",
      "users.list",
    ]);
    expect(log.every((call) => call.type === "query")).toBe(true);
  });
});
