/**
 * `14-F41` — `01-F25`'s pairing code, as the owner meets it, and the SEAM that makes it reachable.
 *
 * ⚠ **AUTHORSHIP DEPARTURE, DECLARED, exactly as `device-list.dom.test.tsx` declares its own:**
 * written by the session that wrote `pairing-panel.tsx`, so this is **not** `24 §3`'s independent
 * oracle and must not be counted as one. What stands in for that independence is the mutation
 * matrix in `apps/backoffice/CLAUDE.md`, which is measured rather than claimed. The independent
 * oracle for the half this screen drives is `services/sync-gateway`'s `pairing-claim.test.ts`,
 * authored from spec text by a session that wrote no implementation.
 *
 * ── THE THREE THINGS THIS FILE IS FOR ───────────────────────────────────────────────────────────
 *
 * **1. THE SEAM, and §A drives `Workspace` rather than `PairingPanel`.** `L8` is this repo's most
 * recorded defect — a correct subsystem with no seam to the product — and the shape it takes here
 * is a perfectly good panel that no screen mounts. A file that only rendered `PairingPanel`
 * directly is structurally incapable of noticing, which is the finding `journey-catalog.test.ts`
 * recorded about its own first draft and `apps/backoffice/CLAUDE.md` records as M10/M11.
 *
 * **2. THE CODE IS SHOWN ONCE AND CANNOT BE FETCHED BACK.** `14-F41` requires *no* ability of the
 * cloud to reproduce a live code, deliberately, so §B asserts both halves: it renders after the
 * mint, and **no waiting row ever renders one** — which is the property a screen would break by
 * "helpfully" caching it.
 *
 * **3. CANCEL IS NOT REVOKE.** `14-F41`: *"The two controls look identical and only one is
 * undoable, so the surface states which side of that line the owner is on before she presses."*
 * §D asserts the safe sentence is on screen BEFORE the destructive-looking press, and that the
 * claim-beat-the-press answer says the device is real now.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PairingPanel } from "../components/pairing-panel";
import { Workspace } from "../components/workspace";
import { strings } from "../lib/strings";
import { type CallLog, type Handlers, Harness } from "./harness";

const NOW = 1_787_000_000_000;
const TTL_MS = 15 * 60 * 1000;

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

type Waiting = {
  device_id: string;
  branch_id: string;
  device_class: string;
  display_name: string;
  minted_at: number;
  expires_at: number;
};

/**
 * ⚠ **A default row is LIVE against the REAL clock, not against `NOW`.**
 *
 * The first draft defaulted to `NOW + TTL_MS`, and `NOW` is a fixed PAST instant — so every row in
 * every section except §C rendered as EXPIRED, and the happy path this file is mostly about was
 * never on screen. It surfaced as a mutant's blast radius rather than as a failure (BO3, which
 * filters expired rows, killed six tests instead of one), which is `L10`'s point exactly: a fixture
 * that does not produce the state its assertions are about passes for the wrong reason. §C pins the
 * clock explicitly and states its own instants against `NOW`.
 */
const waitingRow = (over: Partial<Waiting> = {}): Waiting => ({
  device_id: over.device_id ?? "pairing-1",
  branch_id: over.branch_id ?? "branch-main",
  device_class: over.device_class ?? "counter_electron",
  display_name: over.display_name ?? "Front counter",
  minted_at: over.minted_at ?? Date.now(),
  expires_at: over.expires_at ?? Date.now() + TTL_MS,
});

/**
 * `01-F80` (b): eight digits on the wire. The screen groups them; nothing else may.
 *
 * Deliberately NOT a value any assertion here re-derives a grouping from — §B reads the rendered
 * text and compares against `4831 9026` written out, so a screen that stopped grouping fails
 * rather than agreeing with its own helper (`K-3`'s dead-oracle defect).
 */
const CODE = "48319026";

const mount = (
  rows: readonly Waiting[],
  extra: Handlers = {},
  what: "panel" | "workspace" = "panel",
): { log: CallLog; minted: unknown[]; cancelled: unknown[] } => {
  const log: CallLog = [];
  const minted: unknown[] = [];
  const cancelled: unknown[] = [];
  const handlers: Handlers = {
    "devices.pairings": () => rows,
    "devices.list": () => [],
    "tenancy.directory": () => DIRECTORY,
    "users.list": () => [],
    "catalog.enabled": () => ({ branches: ["branch-main"], channels: ["counter"] }),
    "catalog.published": () => ({ version: 0, entries: [] }),
    "catalog.pending": () => [],
    "catalog.history": () => [],
    "session.whoami": () => ({
      user_id: "user-ayesha",
      org_id: "org-zaiqa",
      display_name: "Ayesha Khan",
      assignments: [],
    }),
    "devices.mintPairing": (input) => {
      minted.push(input);
      return { code: CODE, device_id: "pairing-new", expires_at: NOW + TTL_MS };
    },
    "devices.cancelPairing": (input) => {
      cancelled.push(input);
      return { device_id: (input as { device_id: string }).device_id, cancelled: true };
    },
    ...extra,
  };
  render(
    <Harness handlers={handlers} log={log}>
      {what === "workspace" ? <Workspace /> : <PairingPanel />}
    </Harness>,
  );
  return { log, minted, cancelled };
};

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

/** Fill in the create form and submit it. */
const mintATill = async (name: string): Promise<void> => {
  fireEvent.click(screen.getByRole("button", { name: strings.pairing.connectTill }));
  const input = await screen.findByLabelText(strings.pairing.nameLabel);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: strings.pairing.create }));
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §A — THE SEAM: the shipped shell reaches this panel
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§A 14-F41 — the pairing task is on the shipped device screen", () => {
  it("14-F41: the Devices section offers the create task, driven through the app's own shell", async () => {
    // `Workspace`, not `PairingPanel`. A test that mounts the component it is testing cannot
    // observe whether the PRODUCT mounts it, which is `L8` in one sentence.
    mount([], {}, "workspace");
    fireEvent.click(screen.getByRole("button", { name: strings.nav.devices }));
    expect(
      await screen.findByRole("button", { name: strings.pairing.connectTill }),
      "14-F41: 'It is a task on 14-F12's list' — R40 requires a restaurant to reach a device " +
        "pairing code 'with nobody touching a terminal', and a panel no screen mounts is the " +
        "shell command with extra steps.",
    ).toBeTruthy();
  });

  it("14-F41: the waiting list and 14-F12's device list are TWO lists and stay two", async () => {
    mount([waitingRow()], {}, "workspace");
    fireEvent.click(screen.getByRole("button", { name: strings.nav.devices }));
    const waiting = await screen.findByTestId("waiting-pairings");
    expect(
      waiting.textContent,
      "14-F41: 'Before a claim there is no device' and 'the waiting row BECOMES 14-F12's device " +
        "row'. `devices.list` answered EMPTY here, so a screen that merged the two would be " +
        "showing an owner a fleet containing a till that does not exist.",
    ).toContain("Front counter");
    expect(
      screen.getByText(strings.devices.empty),
      "the device register is still empty and says so — the waiting row did not leak into it",
    ).toBeTruthy();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §B — THE CODE: three facts in, eight digits out, once
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§B 14-F41/01-F80 (a)/(b) — three facts, and a code that is shown once", () => {
  it("14-F41: the form sends the branch, the class and the name — and NO device_id", async () => {
    const { minted } = mount([]);
    await mintATill("Front counter");
    await waitFor(() => expect(minted).toHaveLength(1));
    expect(
      minted[0],
      "14-F41: 'The form asks three facts and no more.' 01-F80 (a) MINTS the device_id — " +
        "'UUIDv7, never reused' — so a caller that supplied one would be choosing an identity " +
        "01-F68 never gives back.",
    ).toEqual({
      branch_id: "branch-main",
      device_class: "counter_electron",
      display_name: "Front counter",
    });
  });

  it("01-F80 (b): the code renders grouped, and it says WHERE it goes and how long it lives", async () => {
    mount([]);
    await mintATill("Front counter");
    const card = await screen.findByTestId("pairing-code");
    expect(
      card.textContent,
      "01-F80 (b): 'displayed and read as 1234 5678'. It is spoken down a phone, so the grouping " +
        "is what makes it sayable — 14-F41 requires of the format only that it 'survive being said " +
        "by one person and typed by another'.",
    ).toContain("4831 9026");
    expect(
      card.textContent,
      "14-F41: the screen 'states, in the owner's terms, where the code goes; a code read to " +
        "somebody staring at a screen with no box for it is a support call'",
    ).toContain(strings.pairing.codeWhere);
    expect(card.textContent, "01-F80 (c)'s fifteen minutes, said on the screen").toContain(
      strings.pairing.codeLife,
    );
  });

  it("14-F41: a WAITING row never renders a code — the cloud cannot reproduce one, by design", async () => {
    mount([waitingRow()]);
    const waiting = await screen.findByTestId("waiting-pairings");
    expect(
      waiting.textContent,
      "14-F41: 'This FR requires NO ability of the cloud to reproduce a live code, deliberately — " +
        "so doc 01's credential half stays free to store a verifier and never the secret.' A row " +
        "that re-rendered the digits would be a standing credential on a screen, which is exactly " +
        "the sticky note beside the till that 01-F80 (c)'s TTL exists to prevent.",
    ).not.toMatch(/\d{4}\s?\d{4}/);
    expect(
      screen.queryByTestId("pairing-code"),
      "and no code card either — the code card exists only for the mint that just happened",
    ).toBeNull();
  });

  it("14-F38: no device CLASS string reaches the screen, in either list or in the form", async () => {
    mount([waitingRow(), waitingRow({ device_id: "pairing-2", device_class: "kitchen" })]);
    const waiting = await screen.findByTestId("waiting-pairings");
    // The whole document, not only the list: `14-F41` extends `14-F32`'s rule here — "the class
    // strings are vendor vocabulary and never render".
    const page = document.body.textContent ?? "";
    // ⚠ **`counter_electron` and NOT `kitchen`, and the exclusion is stated rather than silently
    // dropped.** `01-F39`'s `kitchen` is also an ordinary English word this screen legitimately
    // uses — `Connect a kitchen screen` is the owner's vocabulary — so asserting its ABSENCE would
    // fail a correct implementation, which is as damaging as a vacuous test (`L10`). The
    // discriminating word is the one no owner-facing sentence would ever contain.
    expect(
      page,
      `14-F38: owner-facing text names no internal identifier. The task is "${strings.pairing.connectTill}", ` +
        'never "counter_electron" — and the second row on screen carries the OTHER class, so this ' +
        "is a sweep over two classes rather than a single-fixture accident.",
    ).not.toContain("counter_electron");
    expect(waiting.textContent, "the rows are there — this is not a vacuous absence").toContain(
      "Front counter",
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §C — THE WAITING ROW STATES ITS OWN AGE, AND NEVER SILENTLY DISAPPEARS (`14-F4`, `00 §5.7`)
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§C 14-F41 — waiting, expiring, expired", () => {
  it("14-F41: a code near expiry SAYS so", async () => {
    // ⚠ `vi.spyOn(Date, "now")` and NOT `useFakeTimers()`. Fake timers stop TanStack Query's
    // scheduler, so every query stays pending and the test times out at 60 s reporting nothing
    // about the age sentence — measured on the first run of this file. Only `Date.now` needs to
    // be determinate here.
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    mount([waitingRow({ expires_at: NOW + 30_000 })]);
    const waiting = await screen.findByTestId("waiting-pairings");
    expect(
      waiting.textContent,
      "14-F41: 'Until then it states its own age; a code near expiry says so.'",
    ).toContain(strings.pairing.expiringSoon);
  });

  it("14-F41: an EXPIRED code reads expired and KEEPS ITS ROW, and offers another", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    mount([waitingRow({ expires_at: NOW - 1 })]);
    const waiting = await screen.findByTestId("waiting-pairings");
    expect(
      waiting.textContent,
      "14-F41: 'an EXPIRED code reads expired and offers another. It never silently disappears — " +
        "a vanished row is indistinguishable from a claimed one, which is the aged-fact-shown-as-" +
        "fresh failure 00 §5.7 exists to forbid.'",
    ).toContain(strings.pairing.expired);
    expect(waiting.textContent, "the row is still there under its name").toContain("Front counter");
    expect(
      screen.getByRole("button", { name: strings.pairing.reissue }),
      "14-F41: 'a waiting row whose code is no longer on screen offers ISSUE A NEW ONE'",
    ).toBeTruthy();
  });

  it("14-F41/01-F80 (c): re-issuing CANCELS the old code before minting — never two live codes on one row", async () => {
    const { minted, cancelled } = mount([waitingRow()]);
    fireEvent.click(await screen.findByRole("button", { name: strings.pairing.reissue }));
    await waitFor(() => expect(minted).toHaveLength(1));
    expect(
      cancelled,
      "14-F41: 'issuing replaces the old code so one waiting row never has two live codes', and " +
        "01-F80 (c) makes re-issue the pressure valve rather than a longer life. The cancel must " +
        "come FIRST — minting first would leave both live for as long as the second call takes.",
    ).toEqual([{ device_id: "pairing-1" }]);
    expect(
      minted[0],
      "and the replacement is the SAME device (branch, class, name) — she is not re-describing it",
    ).toEqual({
      branch_id: "branch-main",
      device_class: "counter_electron",
      display_name: "Front counter",
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §D — CANCEL IS NOT REVOKE (`14-F41`)
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§D 14-F41 — which side of the irreversible line she is on, BEFORE she presses", () => {
  it("14-F41: the SAFE sentence is on screen before the cancel is confirmed", async () => {
    const { cancelled } = mount([waitingRow()]);
    fireEvent.click(await screen.findByRole("button", { name: strings.pairing.cancelCode }));
    expect(
      screen.getByText(strings.pairing.cancelSafe),
      "14-F41: 'The two controls look identical and only one is undoable, so the surface states " +
        "which side of that line the owner is on BEFORE she presses.' 14-F13's revoke says the " +
        "opposite sentence on the list below, and the two must never be confusable.",
    ).toBeTruthy();
    expect(cancelled, "and nothing has been cancelled yet — the sentence is read first").toEqual(
      [],
    );
  });

  it("14-F41: a claim that beat the press says the device is REAL now, and that stopping it is the other act", async () => {
    mount([waitingRow()], {
      "devices.cancelPairing": (input) => ({
        device_id: (input as { device_id: string }).device_id,
        // The gateway's `and claimed_at is null` matched nothing: a device claimed this code
        // between the render and the press.
        cancelled: false,
      }),
    });
    fireEvent.click(await screen.findByRole("button", { name: strings.pairing.cancelCode }));
    fireEvent.click(screen.getByRole("button", { name: strings.pairing.cancelCode }));
    expect(
      await screen.findByText(strings.pairing.cancelTooLate),
      "14-F41: 'After a claim the act is 14-F13's revocation, which is PERMANENT.' Reporting a " +
        "cancellation that did not happen would leave an owner believing a live till was never " +
        "connected — and 01-F1 makes everything it then rings permanent.",
    ).toBeTruthy();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
   §E — COMMANDMENT 5, and the two-plane law on a new screen
   ═══════════════════════════════════════════════════════════════════════════════════════════════ */

describe("§E commandment 5 — tRPC + TanStack Query only", () => {
  it("every call this screen makes is a declared procedure, and the writes are the two acts", async () => {
    const { log } = mount([waitingRow()]);
    await mintATill("Kitchen screen");
    await waitFor(() => expect(log.some((call) => call.type === "mutation")).toBe(true));
    const mutations = [...new Set(log.filter((c) => c.type === "mutation").map((c) => c.path))];
    expect(
      mutations.sort(),
      "the only writes this surface performs are 14-F41's own two. A third would be a second " +
        "writer of a credential, which is what that FR calls 'that defect with a credential on it'.",
    ).toEqual(["devices.mintPairing"]);
    const queries = [...new Set(log.filter((c) => c.type === "query").map((c) => c.path))].sort();
    expect(
      queries,
      "and the reads are the waiting list plus the branch directory it needs to ask WHICH branch " +
        "(21-F15's existing read; no new procedure and no new permission action were minted)",
    ).toEqual(["devices.pairings", "tenancy.directory"]);
  });
});
