// ACCEPTANCE TESTS — `02-F20`'s LOCAL manager-PIN path, the surface `can()`'s third outcome
// never had.
//
// PROVENANCE (24 §3 step 2), stated rather than glossed: authored and implemented by the same
// session. The mitigation is the round-3 law, not a claim of independence — every assertion below
// was mutation-tested against a CONTROL differing in exactly one branch, and the matrix is in the
// session report. Where an assertion could pass vacuously it is anchored on something the
// implementation cannot also supply (§A reads source; §F drives two REAL `createPinSession`s over
// a REAL store and real Argon2id hashes).
//
// THE FRs THIS FILE IS WRITTEN FROM, quoted so an assertion can be argued with:
//
//   02-F20 "Manager escalation required for: void after KOT, comp, discount above org threshold,
//          price override. Two equivalent authorization paths: local manager PIN on the POS;
//          remote approval via manager console. First response wins; **the recorded event carries
//          actor + approver either way**."
//   02-F38 "A requester never sees an approve control for their own request … The control is
//          absent from the requester's screen **and refused server-side by the `domain`
//          permission matrix** (a client that renders it anyway must still fail)."
//   05-F19 `cash.paid_out` above the org threshold requires approval. `canPayOut` derives its
//          `satisfied_by` from `approval.grant`'s row — "the credential that closes the gap is
//          one that may GRANT an approval, not one that may record a paid-out".
//   01-F28 PIN verification is ON DEVICE against the synced Argon2id hashes.
//   01-F61 the failure counter is per (device, user) and PERSISTS across a restart.
//   02-F41 attribution is whoever's PIN is IN, read at APPEND — so the actor must stay the
//          cashier even though a manager's PIN was just verified.
//   18 §5  server-side authorization always; client role claims are never trusted.
//
// ⚠ WHAT THIS SUITE DOES NOT CLAIM. `02-F20`'s SECOND path — remote approval via the manager
// console (`approval.requested/granted`, doc 05) — is not built and nothing here may be read as
// evidence about it, including "first response wins", which needs two paths to have a race.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashPin } from "@restos/domain";
import { createPinSession, type DeviceStore, openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppendRequest, EscalationResult } from "../../shared/ipc";
import {
  type AuthorizedEscalation,
  authorizeEscalation,
  authorizeWrites,
  PAID_OUT_APPROVAL_THRESHOLD_PAISA,
} from "../authorize";

const ORG = "org-1";
const BRANCH = "br-1";
const CASHIER = "user-ayesha";
const MANAGER = "user-hina";
const OTHER_CASHIER = "user-bilal";
const OWNER = "user-owner";

/** `05-F19` — Rs 4,000, which is `05 §5`'s own worked scenario and above the Rs 2,000 pin. */
const ABOVE = 400_000;
const BELOW = 100_000;

const paidOut = (amount_paisa: number): AppendRequest => ({
  type: "cash.paid_out",
  payload: {
    amount_paisa,
    reason: "supplier",
    receipt_photo_ref: "photo-1",
    shift_id: "shift-1",
  },
  refs: [],
});

type Roster = Readonly<Record<string, { role: string; branch_id: string | null }>>;

const ROSTER: Roster = {
  [CASHIER]: { role: "cashier", branch_id: BRANCH },
  [OTHER_CASHIER]: { role: "cashier", branch_id: BRANCH },
  [MANAGER]: { role: "branch_manager", branch_id: BRANCH },
  [OWNER]: { role: "owner", branch_id: null },
};

type Rig = {
  escalation: AuthorizedEscalation;
  appended: AppendRequest[];
  verify: ReturnType<typeof vi.fn>;
};

/**
 * A rig over a STUB gateway, so an authorized escalation is observable as a delegation and a
 * refused one as a delegation that never happened.
 *
 * `verifyApprover` is stubbed by DEFAULT because Argon2id is deliberately slow and these
 * assertions are about the matrix, not the KDF. §F drives the real one.
 */
const rig = (opts: { signedInAs?: string | null; pinOk?: boolean } = {}): Rig => {
  const appended: AppendRequest[] = [];
  const signedInAs = opts.signedInAs === undefined ? CASHIER : opts.signedInAs;
  const store = {
    identity: { org_id: ORG, branch_id: BRANCH, device_id: "dev-1" },
    staff: {
      lookup: (id: string) => {
        const row = ROSTER[id];
        return row === undefined
          ? null
          : { user_id: id, pin_hash: "argon2id$stub", display_name: id, assignments: [row] };
      },
    },
  } as unknown as Pick<DeviceStore, "identity" | "staff">;
  const verify = vi.fn(async () => opts.pinOk !== false);
  return {
    appended,
    verify,
    escalation: authorizeEscalation({
      writes: {
        append: (req: unknown) => {
          appended.push(req as AppendRequest);
          return { id: "evt-1" };
        },
        addLine: () => ({ id: "evt-2" }),
        toggleAvailability: () => ({ id: "evt-3" }),
        // `02-F27`/`02-F47` — the fourth member of the trusted write surface (August 2026).
        recordCustomer: () => ({ id: "evt-4" }),
      },
      store,
      session: () =>
        signedInAs === null ? null : { user_id: signedInAs, display_name: signedInAs },
      paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
      verifyApprover: verify,
    }),
  };
};

const refusalOf = (result: EscalationResult): string =>
  result.ok ? "ALLOWED" : `refused:${result.refused}`;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SEAM. The wave's recurring defect is a correct subsystem with no caller; this feature
// is one seam away from being exactly that, because every behaviour below is exercised through a
// factory the shipped host could simply not call.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

describe("§A 18 §5/18 §9 — the shipped app REACHES the local escalation path", () => {
  const mainSrc = readSrc("index.ts");
  const preloadSrc = readFileSync(`${SRC}../preload/index.ts`, "utf8");

  it("is actually reading the files it guards", () => {
    // ROUND-2 PATTERN 2: a scanner over an empty string reports clean.
    expect(mainSrc).toContain("app.whenReady()");
    expect(preloadSrc).toContain("contextBridge.exposeInMainWorld");
  });

  it("registers both IPC handlers and serves both bridge members", () => {
    expect(mainSrc).toContain("ipcMain.handle(CHANNELS.escalationFor");
    expect(mainSrc).toContain("ipcMain.handle(\n    CHANNELS.escalate");
    // `RestosBridge` declares both OPTIONAL (three older harnesses would otherwise red), so the
    // TYPE cannot enforce that the shipped preload serves them. This is what stands in for it.
    expect(preloadSrc).toContain("CHANNELS.escalationFor");
    expect(preloadSrc).toContain("CHANNELS.escalate");
  });

  it("builds the verifier from createPinSession over the DURABLE 01-F61 counter", () => {
    const call = mainSrc.slice(mainSrc.indexOf("const approvals = createPinSession({"));
    const body = call.slice(0, call.indexOf("});"));
    // `01-F61`: "the counter PERSISTS across an app restart. A counter held in memory is defeated
    // by relaunching the app." Omitting this is instance 2 of the wave's named defect, exactly.
    expect(body).toContain("attempts: store.pinAttempts");
    // `01-F28` — the synced registry, not a constant and not a second hash store.
    expect(body).toContain("registry: store.staff");
    // The approval pad must not be a SECOND credential surface: no hand-rolled comparison.
    expect(mainSrc).not.toContain("verifyPin(");
  });

  it("hands the escalation the REQUESTER's session, not the approver's", () => {
    const call = mainSrc.slice(mainSrc.indexOf("const escalation = authorizeEscalation({"));
    const body = call.slice(0, call.indexOf("});"));
    // `02-F38` needs the requester, and `02-F41` needs her on the envelope. Binding this to the
    // approvals session instead would make every escalation a self-approval AND re-attribute the
    // event to the manager.
    expect(body).toContain("session,");
    // THE WIRING §F proves the property of. `unlock()` MOVES a session, so the verifier must
    // drive the approvals session and never `pins` — verifying the approver on the till's own
    // session signs the cashier out and re-attributes her next twenty orders (`02-F41`,
    // permanently under `01-F1`). A behavioural test cannot see which object was passed.
    expect(body).toMatch(/verifyApprover:[\s\S]*approvals\.unlock\(/);
    expect(body).not.toMatch(/verifyApprover:[\s\S]*\bpins\.unlock\(/);
    // The requester's session is the one `deviceState()` reports and the one main appends from.
    expect(mainSrc).toContain("const user_id = pins.currentUser();");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the OFFER. A pad is raised only where the matrix says `escalate`.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F20/05-F19 — what may be escalated at all", () => {
  it("offers the roles the MATRIX names for an above-threshold paid-out", () => {
    const offer = rig().escalation.offer(paidOut(ABOVE));
    // `canPayOut` derives these from `approval.grant`'s row, not `cash.paid_out`'s. Asserted as
    // an exact set: a screen that hardcoded "manager" is `18 §5`'s banned inline check relocated
    // into UI, and this is the assertion that says the roles came from the matrix.
    expect(offer?.satisfied_by).toEqual(["branch_manager", "owner"]);
  });

  it("offers NOTHING for a write the matrix allows outright", () => {
    // Under `05-F19`'s threshold a cashier may pay out unsupervised. A pad here would invite an
    // approval for an act that needs none — and `02-F20`'s "actor + approver" would then record
    // an approver for an unescalated event, permanently (`01-F1`).
    expect(rig().escalation.offer(paidOut(BELOW))).toBeNull();
  });

  it("offers NOTHING for a flat deny — a manager PIN does not launder one", () => {
    // `day.open_close`'s cashier cell is `deny`, NOT `escalate`, and the matrix says why in
    // terms: `02-F22`'s local manager-PIN path is a manager *unlocking a session*, not
    // `02-F20`'s in-session escalation.
    const req: AppendRequest = { type: "day.opened", payload: { day_id: "d-1" }, refs: [] };
    expect(rig().escalation.offer(req)).toBeNull();
  });

  it("offers NOTHING on a locked device", () => {
    // `01-F27` — a device identity is never promoted into a user identity, so there is no
    // requester to escalate FOR.
    expect(rig({ signedInAs: null }).escalation.offer(paidOut(ABOVE))).toBeNull();
  });

  it("offers NOTHING for a request it cannot even read", () => {
    expect(rig().escalation.offer({ nonsense: true })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — the APPROVAL. `02-F20`: "the recorded event carries actor + approver either way."
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F20 — a manager PIN closes the gap, and the event names her", () => {
  it("appends the request with the approver recorded on it", async () => {
    const r = rig();
    const result = await r.escalation.approve(paidOut(ABOVE), MANAGER, "0451");

    expect(refusalOf(result)).toBe("ALLOWED");
    expect(r.appended).toHaveLength(1);
    const req = r.appended[0];
    // The APPROVER. `01 §4`'s `cash.paid_out` schema is a `looseObject`, so this additive field
    // survives the append rather than being stripped — which is what makes `02-F20`'s "carries
    // actor + approver" expressible without a schema change.
    expect(req?.payload.approver_user_id).toBe(MANAGER);
    // Everything the cashier asked for is still there, unchanged. An escalation that rewrote the
    // request would be an approval for something other than what was refused.
    expect(req?.payload.amount_paisa).toBe(ABOVE);
    expect(req?.payload.reason).toBe("supplier");
    expect(req?.type).toBe("cash.paid_out");
  });

  it("does NOT put the approver on the envelope — the ACTOR stays the cashier", async () => {
    const r = rig();
    await r.escalation.approve(paidOut(ABOVE), MANAGER, "0451");
    // `02-F41`/`02-F45`: attribution is read at APPEND from the session, and this path does not
    // move the session. The request carries no actor field at all — main stamps it — so the
    // assertion is that nothing here tried to name one.
    expect(r.appended[0]?.payload).not.toHaveProperty("actor_user_id");
    expect(Object.keys(r.appended[0]?.payload ?? {})).toContain("approver_user_id");
  });

  it("carries NO credential into the payload — `01-F1` has no redaction path", async () => {
    const r = rig();
    const PIN = "0451";
    await r.escalation.approve(paidOut(ABOVE), MANAGER, PIN);
    const serialized = JSON.stringify(r.appended[0]);
    // A PIN in an event is published to every device that syncs and can never be taken back.
    expect(serialized).not.toContain(PIN);
    expect(serialized).not.toContain("pin");
  });

  it("an OWNER can approve too — the path reads the matrix, not a hardcoded role", async () => {
    const r = rig();
    expect(refusalOf(await r.escalation.approve(paidOut(ABOVE), OWNER, "0451"))).toBe("ALLOWED");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — the four refusals. Each one is a mutant this suite exists to kill.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 02-F20/02-F38/01-F28 — what a manager PIN does NOT buy", () => {
  it("refuses a PIN that does not verify, and appends nothing", async () => {
    const r = rig({ pinOk: false });
    expect(refusalOf(await r.escalation.approve(paidOut(ABOVE), MANAGER, "9999"))).toBe(
      "refused:bad_pin",
    );
    expect(r.appended).toHaveLength(0);
  });

  it("02-F38 — refuses a requester approving her OWN request, with a CORRECT PIN", async () => {
    // The PIN verifies (`pinOk` defaults true), so this cannot pass by the credential failing:
    // it is the matrix refusing, which is exactly what `02-F38` requires — "refused server-side
    // … a client that renders it anyway must still fail".
    const r = rig({ signedInAs: MANAGER });
    const result = await r.escalation.approve(paidOut(ABOVE), MANAGER, "0451");
    expect(refusalOf(result)).toBe("refused:self_approval");
    expect(r.appended).toHaveLength(0);
    // The credential WAS checked — the refusal is not a shortcut that skipped `01-F61`'s counter.
    expect(r.verify).toHaveBeenCalledWith(MANAGER, "0451");
  });

  it("refuses an approver whose PIN is right and whose ROLE is not", async () => {
    // A second cashier at the same till. `approval.grant`'s cashier cell is `deny` — "a cashier
    // escalates UP, never sideways". This is the mutant "escalation accepts any PIN without
    // re-checking `can()`", and it is the one a PIN-only implementation passes.
    const r = rig();
    const result = await r.escalation.approve(paidOut(ABOVE), OTHER_CASHIER, "0451");
    expect(refusalOf(result)).toBe("refused:not_permitted");
    expect(r.appended).toHaveLength(0);
  });

  it("refuses an approver the roster does not carry at all", async () => {
    const r = rig();
    expect(refusalOf(await r.escalation.approve(paidOut(ABOVE), "user-ghost", "0451"))).toBe(
      "refused:not_permitted",
    );
    expect(r.appended).toHaveLength(0);
  });

  it("refuses to manufacture an approver for a write that needed none", async () => {
    const r = rig();
    const result = await r.escalation.approve(paidOut(BELOW), MANAGER, "0451");
    expect(refusalOf(result)).toBe("refused:not_escalatable");
    // The mutant this kills: an approval path that appends whatever it is handed once the PIN
    // verifies would write `approver_user_id` onto an act nobody escalated — a false approval in
    // a ledger `01-F1` forbids correcting in place. The cashier's own unescalated append is the
    // route for this amount.
    expect(r.appended).toHaveLength(0);
  });

  it("refuses to launder a DENY into an append", async () => {
    const r = rig();
    const req: AppendRequest = { type: "day.opened", payload: { day_id: "d-1" }, refs: [] };
    expect(refusalOf(await r.escalation.approve(req, MANAGER, "0451"))).toBe(
      "refused:not_escalatable",
    );
    expect(r.appended).toHaveLength(0);
  });

  it("refuses on a locked device even with a manager PIN", async () => {
    // `01-F27` — there is no requester, so there is nothing to approve FOR, and an append here
    // would attribute to nobody while claiming an approver.
    const r = rig({ signedInAs: null });
    expect(refusalOf(await r.escalation.approve(paidOut(ABOVE), MANAGER, "0451"))).toBe(
      "refused:not_escalatable",
    );
    expect(r.appended).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — `escalate` must not have become `allow`. The unescalated write is STILL refused.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 18 §5 — the ordinary write path is unchanged", () => {
  const writesRig = (user_id: string) => {
    const appended: unknown[] = [];
    const store = {
      identity: { org_id: ORG, branch_id: BRANCH, device_id: "dev-1" },
      staff: {
        lookup: (id: string) => {
          const row = ROSTER[id];
          return row === undefined
            ? null
            : { user_id: id, pin_hash: "argon2id$stub", display_name: id, assignments: [row] };
        },
      },
    } as unknown as Pick<DeviceStore, "identity" | "staff">;
    return {
      appended,
      writes: authorizeWrites({
        writes: {
          append: (req: unknown) => {
            appended.push(req);
            return { id: "evt-1" };
          },
          addLine: () => ({ id: "evt-2" }),
          toggleAvailability: () => ({ id: "evt-3" }),
          // `02-F27`/`02-F47` — the fourth member of the trusted write surface (August 2026).
          recordCustomer: () => ({ id: "evt-4" }),
        },
        store,
        session: () => ({ user_id, display_name: user_id }),
        paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
      }),
    };
  };

  it("still refuses the above-threshold paid-out on the plain append channel", () => {
    const r = writesRig(CASHIER);
    let refusal: { outcome?: string } = {};
    try {
      r.writes.append(paidOut(ABOVE));
      throw new Error("the unescalated write was ALLOWED");
    } catch (error) {
      refusal = (error as { refusal?: { outcome?: string } }).refusal ?? {};
    }
    // Still `escalate`, still refused HERE. Building the local path must not have widened the
    // guard: the approval is a SECOND channel that decides for itself, never a flag that turns
    // the first one permissive.
    expect(refusal.outcome).toBe("escalate");
    expect(r.appended).toHaveLength(0);
  });

  it("still allows what it always allowed", () => {
    const r = writesRig(CASHIER);
    r.writes.append(paidOut(BELOW));
    expect(r.appended).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — THE REAL CREDENTIAL. Two `createPinSession`s over one REAL store and real Argon2id
// hashes. This is the section that proves the two properties no stub can: the approval does not
// move the till's session, and both pads charge ONE `01-F61` counter.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 01-F28/01-F61/02-F41 — one credential surface, two pads", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const PIN = "0451";
  const MAX_FAILED = 5;

  const realRig = async () => {
    const dir = mkdtempSync(join(tmpdir(), "restos-escalation-"));
    dirs.push(dir);
    const identity = {
      org_id: "00000000-0000-7000-8000-000000000001",
      branch_id: "00000000-0000-7000-8000-000000000002",
      device_id: "00000000-0000-7000-8000-000000000003",
    };
    const store = openStore({ path: join(dir, "device.db"), identity });
    // `01-F61` names a SHARED four-digit PIN as the ordinary case — the dev roster does the same.
    const pin_hash = await hashPin(PIN);
    store.staff.apply({
      kind: "snapshot",
      version: 1,
      members: [
        {
          user_id: CASHIER,
          display_name: "Ayesha",
          pin_hash,
          assignments: [{ role: "cashier", branch_id: identity.branch_id }],
        },
        {
          user_id: MANAGER,
          display_name: "Hina",
          pin_hash,
          assignments: [{ role: "branch_manager", branch_id: identity.branch_id }],
        },
      ],
    });
    const options = {
      registry: store.staff,
      device: { device_id: identity.device_id, registered: true },
      idle_lock_ms: 10 * 60_000,
      max_failed_attempts: MAX_FAILED,
      now: () => 1_754_300_000_000,
      audit: () => {},
      attempts: store.pinAttempts,
    };
    // Exactly `main/index.ts`'s two constructions, and the ONLY difference between them there is
    // which one `session` is bound to.
    return { store, pins: createPinSession(options), approvals: createPinSession(options) };
  };

  it("02-F41 — approving does NOT sign the manager in; the till still names the cashier", async () => {
    const { store, pins, approvals } = await realRig();
    try {
      await pins.unlock(CASHIER, PIN);
      expect(pins.currentUser()).toBe(CASHIER);

      const approved = await approvals.unlock(MANAGER, PIN);
      expect(approved.ok, "the manager's PIN must verify").toBe(true);

      // THE PROPERTY. `unlock()` moves a session, so verifying the approver on the SAME session
      // would sign the cashier out and re-attribute her next twenty orders to whoever authorised
      // one paid-out — permanently (`01-F1`). This is the mutant "reuse `pins` for the approval".
      expect(pins.currentUser(), "the manager must not take over the till").toBe(CASHIER);
    } finally {
      store.close();
    }
  }, 30_000);

  it("01-F61 — both pads charge ONE durable per-(device, user) counter", async () => {
    const { store, approvals, pins } = await realRig();
    try {
      // Spend the manager's whole budget at the APPROVAL pad.
      for (let i = 0; i < MAX_FAILED; i += 1) {
        expect((await approvals.unlock(MANAGER, "9999")).ok).toBe(false);
      }
      // …and the UNLOCK gate refuses her too, with the right PIN. A second credential surface
      // with its own counter is an unmetered place to guess: five tries per pad instead of five
      // per person, which is what "reuse it" in the task means and what this asserts.
      const gate = await pins.unlock(MANAGER, PIN);
      expect(gate.ok).toBe(false);
      expect(gate.ok === false ? gate.reason : null).toBe("locked_out");
      // The cashier is untouched — the counter is per (device, USER), not per device.
      expect((await pins.unlock(CASHIER, PIN)).ok).toBe(true);
    } finally {
      store.close();
    }
  }, 60_000);
});
