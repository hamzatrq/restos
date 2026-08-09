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

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeviceList } from "../components/device-list";
import { strings } from "../lib/strings";
import { type CallLog, type Handlers, Harness } from "./harness";

type Row = {
  device_id: string;
  branch_id: string;
  device_class: string;
  revoked_at: number | null;
  token_expires_at: number | null;
  revoked_by: string | null;
};

const ACTIVE: Row = {
  device_id: "device-counter-1",
  branch_id: "branch-main",
  device_class: "counter_electron",
  revoked_at: null,
  token_expires_at: 1_900_000_000_000,
  revoked_by: null,
};

const REVOKED_HERE: Row = {
  device_id: "device-stolen-tablet",
  branch_id: "branch-main",
  device_class: "waiter",
  revoked_at: 1_785_000_000_000,
  token_expires_at: 1_900_000_000_000,
  revoked_by: "user-ayesha",
};

const REVOKED_BY_CLI: Row = {
  device_id: "device-decommissioned",
  branch_id: "branch-two",
  device_class: "kitchen",
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

describe("14-F12 — the list", () => {
  it("renders every registered device, revoked ones included", async () => {
    mount([ACTIVE, REVOKED_HERE, REVOKED_BY_CLI]);
    for (const row of [ACTIVE, REVOKED_HERE, REVOKED_BY_CLI]) {
      expect(await screen.findByText(row.device_id)).toBeTruthy();
    }
  });

  it("says which of 14-F12's columns are NOT recorded, rather than inventing them", async () => {
    mount([ACTIVE]);
    expect(await screen.findByText(strings.devices.columnsOwed)).toBeTruthy();
    // The negative half, scoped to the ROW — the card's disclosure sentence necessarily contains
    // the words "last seen" and "sync lag", and a screen-wide query would match its own honesty
    // notice. What must contain no fabricated liveness figure is the device row itself (`00 §5.7`:
    // a plausible "last seen 2 minutes ago" is indistinguishable from a real one on a demo).
    const row = within(screen.getByRole("listitem")).getByText(ACTIVE.device_id).closest("li");
    expect(row?.textContent ?? "").not.toMatch(/last seen|sync lag|app version/i);
    // …and it DOES carry the three the registry actually holds, which is the control: without it
    // the assertion above passes against a row that renders nothing at all.
    expect(row?.textContent ?? "").toContain(ACTIVE.branch_id);
    expect(row?.textContent ?? "").toContain(ACTIVE.device_class);
    expect(row?.textContent ?? "").toContain(strings.devices.active);
  });
});

describe("14-F13 — revoked state and ACTOR", () => {
  it("a device revoked through this screen names WHO revoked it", async () => {
    mount([REVOKED_HERE]);
    expect(await screen.findByText(/user-ayesha/)).toBeTruthy();
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
    expect(screen.queryByText(/user-ayesha/)).toBeNull();
  });

  it("the three states are three DIFFERENT renderings on one screen", async () => {
    // The pairwise assertion, so no collapse of any two can pass — the same shape
    // `permission-matrix.test.ts` §2 uses for Appendix A's three cell kinds.
    mount([ACTIVE, REVOKED_HERE, REVOKED_BY_CLI]);
    await screen.findByText(ACTIVE.device_id);
    expect(screen.getAllByText(strings.devices.active)).toHaveLength(1);
    expect(screen.getAllByText(strings.devices.notRecorded)).toHaveLength(1);
    expect(screen.getAllByText(/user-ayesha/)).toHaveLength(1);
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
    await screen.findByText(REVOKED_HERE.device_id);
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
    await screen.findByText(ACTIVE.device_id);
    expect(log.map((call) => call.path)).toEqual(["devices.list"]);
  });
});
