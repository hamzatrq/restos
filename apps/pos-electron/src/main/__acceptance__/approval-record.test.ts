/**
 * ACCEPTANCE TESTS — `05-F6`'s *"every decision is fully logged"* on the ONE approval path that
 * exists, and the append seam `05-F29`(a) will reuse.
 *
 * **AUTHORED FROM SPEC TEXT ONLY.** Written by a session that read `specs/05-manager-console.md`
 * (`05-F5`, `05-F6`, `05-F7`, `05-F19`, `05-F28`, `05-F29`, `05 §4`), `specs/02-pos-app.md`
 * (`02-F20`, `02-F38`, `02-F41`, `02-F45`) and `specs/01-kernel-sync.md` (`01-F1`, `01-F4`,
 * `01-F27`, `01-F36`, `01 §4`), and did NOT write the implementation it describes. Oracle for that
 * work under `24 §3` step 2; read-only to the implementing session.
 *
 * ## The defect, quoted
 *
 *   05-F29  "⚠ THE PREREQUISITE IS INDEPENDENT OF THIS RULING AND MUST LAND FIRST, ON THE
 *           ELECTRON TILL. Nothing anywhere emits `approval.requested` … and **the local path
 *           emits no approval record at all**: `apps/pos-electron/src/main/authorize.ts` appends
 *           only the escalated write with `approver_user_id` in its payload, so `05-F6`'s *every
 *           decision is fully logged* is **unmet today on the one path that exists**. Closing that
 *           on the till also settles the seam (a) will reuse — an append accepting an
 *           **explicitly verified** actor rather than the session's — and `verifyApprover`
 *           deliberately does not move the session, so the till cannot author a
 *           correctly-attributed grant even locally until it exists."
 *   05-F6   "One-tap approve/deny, authorized by the manager's PIN → `approval.granted` /
 *           `approval.denied` **referencing the request** … every decision is fully logged."
 *   05-F7   request payload: `approval_type`, `refs[]`, `amounts`, `requester_id`, requesting
 *           `device_id`, `context`. "Grants reference the request id, are idempotent, and the
 *           first response wins."
 *   02-F41  "Attribution is whoever's PIN is in, with no 'acting for' concept."
 *   02-F45  attribution is read from the ENVELOPE, never from a payload field.
 *   01-F36  "`approval.granted / denied` applies only while its request is pending; duplicates and
 *           stale responses are logged no-ops."
 *
 * ## THE CASE THAT MATTERS — §C, and everything else is scaffolding around it
 *
 * **One operator act must produce TWO differently-attributed envelopes.** The escalated write
 * (`cash.paid_out`) is the CASHIER's act and its envelope actor stays hers; the `approval.granted`
 * is the MANAGER's act and its envelope actor is hers. `registry.ts`'s own comment on
 * `approval.granted` says so in as many words — *"A grant whose envelope named the cashier would
 * be the local path's defect committed on the remote one: the session moved, one identity where
 * there must be two."*
 *
 * The till cannot do that today, and the reason is mechanical rather than an omission:
 * `main/gateway.ts` stamps `actor_user_id: deps.session()?.user_id ?? null` **unconditionally**
 * at all three of its append sites, and `verifyApprover` deliberately does not move the session
 * (moving it would sign the cashier out and re-attribute her next twenty orders under `01-F1`).
 * So a grant appended through any existing path names the CASHIER.
 *
 * **The plausible wrong implementations this file is aimed at**, each a one-branch mutant:
 *   W1  the grant is appended through `gateway.append` / `writes.append` — it *looks* right, the
 *       payload names the approver, and the ENVELOPE names the cashier. Nothing in the product
 *       reddens; `05-F7`'s two required identities are both present; only §C sees it.
 *   W2  the session is moved for the duration of the approval (a `sessionOverride`, a temporary
 *       getter swap). Correct actor on the grant, and every concurrent append in the process —
 *       `kot.printed`, `line-advance`'s edges, another tab's line-add — is attributed to the
 *       manager for the width of an `await`. This is `02-F41`'s defect with a shorter window.
 *   W3  `approval.requested` is emitted with the APPROVER as its actor (the "one approval, one
 *       actor" collapse). `05-F7` puts `requester_id` on the request; `02-F45` puts the actor on
 *       the envelope; the requester is the person who ASKED.
 *   W4  the grant is appended whenever `approve()` is CALLED rather than when it succeeds — so a
 *       wrong PIN or a `02-F38` self-approval writes a permanent grant into a ledger `01-F1`
 *       forbids correcting.
 *   W5  `approval_type` is hardcoded to `paid_out`, because `05-F19`'s paid-out is the only act
 *       that could escalate before the four write schemas landed. §D's void/comp/override rows
 *       are what separate a mapping from a constant.
 *
 * ## THE CONTRACT THIS FILE PINS (design stated so a reviewer can reject it — `24 §3b`)
 *
 * 1. **`main/gateway.ts` exports `createVerifiedAppend({ store }): VerifiedAppend`**, where
 *    `VerifiedAppend = (actor_user_id: string, req: unknown) => AppendResult`. The actor is a
 *    SEPARATE positional argument, never a field of the request, so it can never arrive inside a
 *    renderer-supplied `AppendRequest` (`AppendRequestSchema` has no actor field and must not
 *    gain one — that is Commandment 8's whole content on this bridge).
 *
 *    **It is deliberately NOT a member of `Gateway`.** `gateway.test.ts` frames that type as
 *    *"the renderer's whole surface"* and pins its member count so a widening is acknowledged
 *    rather than quiet. An append that names an arbitrary actor must not be on the renderer's
 *    surface at all, so the honest placement is beside it, not in it — and that pin correctly
 *    stays green.
 *
 * 2. **`AuthorizedEscalation` gains `authorizeApprover(req, approver_user_id, pin)`** returning
 *    `{ ok: true, approver_user_id, requester_user_id } | { ok: false, refused }` and
 *    **appending nothing**. `02-F20`'s four refusals (`01-F28` credential, `02-F38`
 *    self-approval, the approver's own matrix verdict, and "the act was never escalatable") are
 *    already decided once inside `authorize.ts`; a denial needs the identical decision without
 *    the write, and a second reading of those rules in another module is exactly the drift
 *    `authorize.ts`'s own header refuses ("A second copy of this reasoning for the approver is
 *    how an escalation quietly widens a cell the guard narrows — so there is one").
 *
 * 3. **`main/approval-record.ts` exports `recordApprovals({ escalation, appendAs, session })`**
 *    returning `{ raise, approve, deny }`. It DECORATES the existing escalation rather than
 *    changing it: `authorizeEscalation`'s deps, `approve`'s signature and its single
 *    `writes.append` call are untouched, which is what keeps `escalation.test.ts` — the oracle
 *    for `02-F20`'s local path — green rather than forcing an edit to another session's file.
 *
 * ## ALTERNATIVES REJECTED, and why (stated rather than silently not chosen)
 *
 * - **Move the PIN session for the approval.** `02-F41` + `01-F1`: `unlock()` moves the session,
 *   the cashier is signed out, and her next twenty orders are attributed to whoever authorised
 *   one paid-out — permanently. This is the defect `main/index.ts` already spends a whole second
 *   `createPinSession` avoiding, and W2 above is its short-window twin.
 * - **An optional `actor_user_id` on `AppendRequest`/`gateway.append`.** That field crosses the
 *   IPC bridge, so a compromised renderer could name its own actor. `18 §9` makes main the
 *   trusted side precisely so this cannot be expressed.
 * - **Return the events for `main/index.ts` to append.** It puts the two-identity decision in a
 *   wiring file that no suite in this package can import (it builds an Electron app at module
 *   scope), so the one place the property lives would be the one place nothing can test.
 * - **Emit the approval events inside `authorizeEscalation`.** It needs a new dep there; required
 *   breaks `escalation.test.ts`'s rig at compile, optional is `seams:check` Rule B's blind spot
 *   (instances 2 and 5 of the wave's named defect), and either way `approve`'s single
 *   `writes.append` count — which that oracle asserts — changes.
 *
 * ## WHAT THIS FILE DELIBERATELY DOES NOT PIN
 *
 * - **The ORDER of the grant against the escalated write.** `01-F34` forbids any fold reading
 *   ordering metadata, and `05-F6`'s "→" is a causal narrative rather than a sequence contract.
 *   Pinning it would force a decide/append split whose only benefit is narrowing a crash window
 *   no FR speaks to.
 * - **`approval_type: "discount"`.** `main/authorize.ts`'s `WRITE_ACTIONS` deliberately carries
 *   NO row for `discount.recorded` and says why ("a FINDING, not an oversight" — `02-F20` splits
 *   discounts at an org threshold, there is no `canDiscount` predicate on `canPayOut`'s pattern
 *   and no threshold in `00 §7` to feed one). So a discount fails closed to `deny`, never
 *   escalates, and cannot reach this recorder at all. Four of `05-F7`'s five types are reachable
 *   today and §D asserts exactly those four.
 * - **The renderer control for `deny`.** `ManagerApproval`'s composition belongs to
 *   `manager-approval.dom.test.tsx` and `packages/ui`'s oracles; §A pins only that the bridge
 *   carries it, on the same source-read instrument `escalation.test.ts` §A already uses.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvent } from "@restos/domain";
import type { BlockedCursor, DeviceStore } from "@restos/sync-client";
import { openStore } from "@restos/sync-client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAging } from "../../../../pass-kds/src/main/aging";
import type { AppendRequest, AppendResult, Session } from "../../shared/ipc";
import { recordApprovals } from "../approval-record";
import {
  type AuthorizedEscalation,
  authorizeEscalation,
  PAID_OUT_APPROVAL_THRESHOLD_PAISA,
} from "../authorize";
import { createGateway, createVerifiedAppend, type GatewayDeps } from "../gateway";

const ORG = "00000000-0000-7000-8000-000000000001";
const BRANCH = "00000000-0000-7000-8000-000000000002";
const DEVICE = "00000000-0000-7000-8000-000000000003";

const CASHIER = "user-ayesha";
const MANAGER = "user-hina";
const OTHER_CASHIER = "user-bilal";

/** `05 §5`'s own worked scenario — a PKR 4,000 paid-out, above the Rs 2,000 pin. */
const ABOVE = 400_000;
const BELOW = 100_000;

const ROSTER: Readonly<Record<string, { role: string; branch_id: string | null }>> = {
  [CASHIER]: { role: "cashier", branch_id: BRANCH },
  [OTHER_CASHIER]: { role: "cashier", branch_id: BRANCH },
  [MANAGER]: { role: "branch_manager", branch_id: BRANCH },
};

const staffStub = {
  lookup: (id: string) => {
    const row = ROSTER[id];
    return row === undefined
      ? null
      : { user_id: id, pin_hash: "argon2id$stub", display_name: id, assignments: [row] };
  },
};

const paidOut = (amount_paisa: number, refs: string[] = []): AppendRequest => ({
  type: "cash.paid_out",
  payload: {
    amount_paisa,
    reason: "supplier — cooking gas",
    receipt_photo_ref: "photo-1",
    shift_id: "shift-1",
  },
  refs,
});

const voidLine = (): AppendRequest => ({
  type: "void.recorded",
  payload: {
    order_id: "order-1",
    amount_paisa: 45_000,
    reason: "wrong item discovered after the KOT",
    approver_user_id: null,
  },
  refs: ["order-1", "line-3"],
});

const compLine = (): AppendRequest => ({
  type: "comp.recorded",
  payload: {
    order_id: "order-1",
    amount_paisa: 32_000,
    reason: "cold when it reached the table",
    approver_user_id: null,
  },
  refs: ["order-1"],
});

const priceOverride = (): AppendRequest => ({
  type: "order.line_price_overridden",
  payload: {
    order_id: "order-1",
    line_id: "line-3",
    unit_price_paisa: 28_000,
    reason: "price agreed with the owner for the wedding party",
    approver_user_id: null,
  },
  refs: ["order-1", "line-3"],
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The STUB rig — a recorded gateway and a recorded verified-append, over a stub store.
//
// `appendAs` runs every payload it is handed through the REAL `parseEvent`, so a recorder that
// emitted a shape `01-F4` refuses fails HERE rather than only on a real store. That is the one
// thing a stub must not lose: the whole point of `05-F7`'s schemas is that the kernel validates.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Recorded = { actor_user_id: string; req: AppendRequest };

type Rig = {
  record: ReturnType<typeof recordApprovals>;
  /** Everything appended through the VERIFIED seam — the approval family. */
  verified: Recorded[];
  /** Everything appended through the session-reading write path — the escalated act. */
  appended: AppendRequest[];
  verify: ReturnType<typeof vi.fn>;
};

const rig = (opts: { signedInAs?: string | null; pinOk?: boolean } = {}): Rig => {
  const verified: Recorded[] = [];
  const appended: AppendRequest[] = [];
  const signedInAs = opts.signedInAs === undefined ? CASHIER : opts.signedInAs;
  const session = (): Session | null =>
    signedInAs === null ? null : { user_id: signedInAs, display_name: signedInAs };
  const store = {
    identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
    staff: staffStub,
  } as unknown as Pick<DeviceStore, "identity" | "staff">;
  const verify = vi.fn(async () => opts.pinOk !== false);

  const escalation: AuthorizedEscalation = authorizeEscalation({
    writes: {
      append: (req: unknown): AppendResult => {
        appended.push(req as AppendRequest);
        return { id: `evt-write-${appended.length}` };
      },
      addLine: () => ({ id: "evt-line" }),
      toggleAvailability: () => ({ id: "evt-toggle" }),
    },
    store,
    session,
    paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
    verifyApprover: verify,
  });

  return {
    verified,
    appended,
    verify,
    record: recordApprovals({
      escalation,
      session,
      store,
      appendAs: (actor_user_id: string, req: unknown): AppendResult => {
        const request = req as AppendRequest;
        // `01-F4` at the seam. A recorder emitting an illegal `approval.*` payload must fail
        // here, not silently in a rig that accepts anything.
        parseEvent({
          id: `0193b0f0-0000-7000-8000-${String(verified.length + 1).padStart(12, "0")}`,
          org_id: ORG,
          branch_id: BRANCH,
          device_id: DEVICE,
          actor_user_id,
          lamport_seq: verified.length + 1,
          device_created_at: 1_755_000_000_000,
          branch_created_at: 1_755_000_000_000,
          time_basis: "branch",
          server_received_at: null,
          type: request.type,
          schema_version: 1,
          payload: request.payload,
          refs: request.refs,
        });
        verified.push({ actor_user_id, req: request });
        return { id: `evt-verified-${verified.length}` };
      },
    }),
  };
};

const ofType = (rows: readonly Recorded[], type: string): Recorded[] =>
  rows.filter((row) => row.req.type === type);

const one = (rows: readonly Recorded[], type: string): Recorded => {
  const found = ofType(rows, type);
  expect(found, `expected exactly one ${type}`).toHaveLength(1);
  return found[0] as Recorded;
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE SEAM. The wave's recurring defect is a correct subsystem the product never reaches,
// and this feature is one wiring line away from being exactly that: `escalationFor` and
// `escalate` can both go on calling the UNDECORATED escalation, every test below stays green,
// and the ledger records nothing.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const SRC = new URL("../", import.meta.url).pathname;
const readSrc = (rel: string): string => readFileSync(`${SRC}${rel}`, "utf8");

describe("§A 05-F6 — the shipped host REACHES the recorder, on both channels", () => {
  const mainSrc = readSrc("index.ts");
  const preloadSrc = readFileSync(`${SRC}../preload/index.ts`, "utf8");
  const counterSrc = readFileSync(`${SRC}../renderer/Counter.tsx`, "utf8");

  it("is actually reading the files it guards", () => {
    // ROUND-2 PATTERN 2: a scanner over an empty string reports clean.
    expect(mainSrc).toContain("app.whenReady()");
    expect(preloadSrc).toContain("contextBridge.exposeInMainWorld");
    expect(counterSrc).toContain("window.restos.escalationFor");
  });

  it("builds the recorder over the VERIFIED append, not over the session-reading one", () => {
    const call = mainSrc.slice(mainSrc.indexOf("recordApprovals({"));
    const body = call.slice(0, call.indexOf("});"));
    expect(mainSrc).toContain("createVerifiedAppend(");
    // The whole design in one assertion: the approval family's actor is STATED. Wiring
    // `appendAs` to anything that reads the session is W1, and it is invisible everywhere else.
    expect(body).toMatch(/appendAs/);
    expect(body).not.toMatch(/appendAs:\s*(writes|gateway)\.append/);
  });

  it("`escalationFor` raises the REQUEST — the queue's only producer (05-F28)", () => {
    // `05 §4`: the request must exist BEFORE the decision, or the manager device's queue never
    // sees a pending item and `05-F29`(a) has nothing to render. `escalationFor` is called once
    // per refusal from `Counter.tsx`'s catch handler, which IS the moment the pad is raised.
    const handler = mainSrc.slice(mainSrc.indexOf("ipcMain.handle(CHANNELS.escalationFor"));
    expect(handler.slice(0, handler.indexOf(");") + 1)).toMatch(/\.raise\(/);
  });

  it("`escalate` resolves through the recorder, so a grant is logged with the decision", () => {
    const handler = mainSrc.slice(mainSrc.indexOf("CHANNELS.escalate,"));
    const body = handler.slice(0, handler.indexOf("\n  );"));
    expect(body).not.toMatch(/\bescalation\.approve\(/);
    expect(body).toMatch(/\.approve\(/);
  });

  it("the DENIAL has a channel, a bridge member and a caller (05-F6's other half)", () => {
    // `05-F6` is "approve/deny" and `registry.ts` says a denial "is a RECORD, never the absence
    // of one". A deny path built in main and reachable by nothing is instance N+1 of the wave's
    // named defect, so the seam is asserted on all three layers rather than assumed.
    expect(mainSrc).toContain("CHANNELS.denyEscalation");
    expect(preloadSrc).toContain("CHANNELS.denyEscalation");
    expect(counterSrc).toContain("window.restos.denyEscalation");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §B — the SEAM ITSELF, over a REAL store: an append whose actor is STATED, not read.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 02-F41/05-F29 — `createVerifiedAppend` stamps the actor it is given", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const realStore = (): DeviceStore => {
    const dir = mkdtempSync(join(tmpdir(), "restos-approval-"));
    dirs.push(dir);
    return openStore({
      path: join(dir, "device.db"),
      identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
    });
  };

  const gatewayOver = (store: DeviceStore, session: () => Session | null) =>
    createGateway({
      store,
      catalog: () => null,
      menu: () => [],
      priceOf: () => null,
      actor: "Counter 1",
      session,
      deviceLabel: "Counter 1",
      training: false,
      reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
      blockedCursor: (): BlockedCursor | null => null,
      catalogRefusal: () => null,
      businessDay: () => "2026-08-11",
      panelPpi: () => 100.5,
      // `03-F14`/`03-F47` — REQUIRED on `GatewayDeps` since `03-F25` put aging timers on the
      // counter. The SHIPPED resolver rather than a convenient constant, so a fixture that is not
      // about the thresholds still gets the product's own answers.
      aging: resolveAging(undefined).thresholdsFor,
      panelFit: () => null,
    } as GatewayDeps);

  const GRANT = (request_id: string): AppendRequest => ({
    type: "approval.granted",
    payload: { request_id, approver_user_id: MANAGER, requester_user_id: CASHIER },
    refs: [],
  });

  it("names the STATED actor while the live session names somebody else", () => {
    const store = realStore();
    try {
      const appendAs = createVerifiedAppend({ store });
      appendAs(MANAGER, GRANT("req-1"));
      const [event] = store.readAllEvents();
      // W1 and W2 both die here, and nothing else in the repo can tell them from this line.
      expect(event?.actor_user_id).toBe(MANAGER);
      expect(event?.type).toBe("approval.granted");
    } finally {
      store.close();
    }
  });

  it("does NOT move or consult the session — the till still names the cashier afterwards", () => {
    const store = realStore();
    const session = vi.fn((): Session | null => ({ user_id: CASHIER, display_name: "Ayesha" }));
    try {
      const gateway = gatewayOver(store, session);
      const appendAs = createVerifiedAppend({ store });
      const callsBefore = session.mock.calls.length;
      appendAs(MANAGER, GRANT("req-1"));
      // It cannot read what it was never handed. Asserted on the CALL COUNT rather than on the
      // dep list, because a future session could pass one "for logging" and the property that
      // matters is that no approval append ever depends on who is signed in.
      expect(session.mock.calls.length).toBe(callsBefore);

      gateway.append({
        type: "cash.drawer_opened",
        payload: { reason: "no_sale", shift_id: null },
        refs: [],
      });
      const events = store.readAllEvents();
      expect(events.find((e) => e.type === "approval.granted")?.actor_user_id).toBe(MANAGER);
      expect(events.find((e) => e.type === "cash.drawer_opened")?.actor_user_id).toBe(CASHIER);
    } finally {
      store.close();
    }
  });

  it("stamps the same envelope identity as the ordinary append — one construction, two actors", () => {
    const store = realStore();
    try {
      const gateway = gatewayOver(store, () => ({ user_id: CASHIER, display_name: "Ayesha" }));
      gateway.append({
        type: "cash.drawer_opened",
        payload: { reason: "no_sale", shift_id: null },
        refs: [],
      });
      createVerifiedAppend({ store })(MANAGER, GRANT("req-1"));
      const events = store.readAllEvents();
      const ordinary = events.find((e) => e.type === "cash.drawer_opened");
      const grant = events.find((e) => e.type === "approval.granted");
      // Everything except the actor comes from the same place. A second, hand-written envelope
      // construction beside `gateway.append`'s is `02-F45`'s "two sources for one fact" — and the
      // fields most easily lost are the ones `01-F43` stamps at append and no fold may re-derive.
      expect(grant?.org_id).toBe(ordinary?.org_id);
      expect(grant?.branch_id).toBe(ordinary?.branch_id);
      expect(grant?.device_id).toBe(ordinary?.device_id);
      expect(grant?.time_basis).toBe(ordinary?.time_basis);
      expect(typeof grant?.branch_created_at).toBe("number");
      expect(grant?.schema_version).toBe(1);
    } finally {
      store.close();
    }
  });

  /**
   * ⚠ **MEASURED, and the attribution is not what it looks like.** Deleting a guard *inside*
   * `createVerifiedAppend` reddens NOTHING — all 716 tests stay green — because
   * `packages/domain/src/envelope.ts` already declares
   * `actor_user_id: z.string().min(1).nullable()`, so an empty string is refused one layer down
   * by a protected package with its own suite. That is the correct place for it and this test is
   * not a second copy of that rule.
   *
   * What it DOES own is the coercion: an implementation that wrote
   * `actor_user_id: actor || null` passes the envelope schema, appends an **unattributed** event
   * that claims an approval, and is killed here and nowhere else (measured: 1 kill, 715 green).
   * So the assertion is about what this seam may do with an actor it cannot use — never about
   * whether Zod rejects `""`.
   */
  it("never turns an unusable actor into an UNATTRIBUTED approval", () => {
    const store = realStore();
    try {
      const appendAs = createVerifiedAppend({ store });
      expect(() => appendAs("", GRANT("req-1"))).toThrow();
      // `01-F1` — nothing partial is left behind, and in particular nothing with a null actor.
      expect(store.readAllEvents()).toHaveLength(0);
    } finally {
      store.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §C — THE CASE THAT MATTERS. One act, two identities, measured on REAL envelopes.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 02-F20/02-F41 — one approval, two differently-attributed envelopes", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const wholePath = () => {
    const dir = mkdtempSync(join(tmpdir(), "restos-approval-e2e-"));
    dirs.push(dir);
    const store = openStore({
      path: join(dir, "device.db"),
      identity: { org_id: ORG, branch_id: BRANCH, device_id: DEVICE },
    });
    const session = (): Session | null => ({ user_id: CASHIER, display_name: "Ayesha" });
    const gateway = createGateway({
      store,
      catalog: () => null,
      menu: () => [],
      priceOf: () => null,
      actor: "Counter 1",
      session,
      deviceLabel: "Counter 1",
      training: false,
      reachability: () => ({ lan: "down", hub: "down", cloud: "down" }),
      blockedCursor: (): BlockedCursor | null => null,
      catalogRefusal: () => null,
      businessDay: () => "2026-08-11",
      panelPpi: () => 100.5,
      // `03-F14`/`03-F47` — REQUIRED on `GatewayDeps` since `03-F25` put aging timers on the
      // counter. The SHIPPED resolver rather than a convenient constant, so a fixture that is not
      // about the thresholds still gets the product's own answers.
      aging: resolveAging(undefined).thresholdsFor,
      panelFit: () => null,
    } as GatewayDeps);
    // The staff registry the matrix reads its roles from — the same shape `01-F26` syncs.
    store.staff.apply({
      kind: "snapshot",
      version: 1,
      members: [
        {
          user_id: CASHIER,
          display_name: "Ayesha",
          pin_hash: "argon2id$stub",
          assignments: [{ role: "cashier", branch_id: BRANCH }],
        },
        {
          user_id: MANAGER,
          display_name: "Hina",
          pin_hash: "argon2id$stub",
          assignments: [{ role: "branch_manager", branch_id: BRANCH }],
        },
      ],
    });
    const escalation = authorizeEscalation({
      writes: gateway,
      store,
      session,
      paidOutApprovalThresholdPaisa: PAID_OUT_APPROVAL_THRESHOLD_PAISA,
      // The credential is `escalation.test.ts` §F's subject and is stubbed here on purpose:
      // this section is about ATTRIBUTION, and Argon2id would make it a 30-second test.
      verifyApprover: async () => true,
    });
    return {
      store,
      record: recordApprovals({
        escalation,
        session,
        store,
        appendAs: createVerifiedAppend({ store }),
      }),
    };
  };

  it("05-F19 — the paid-out lands with THREE events, and each names the right person", async () => {
    const { store, record } = wholePath();
    try {
      const req = paidOut(ABOVE, ["paidout-1"]);
      record.raise(req);
      const result = await record.approve(req, MANAGER, "0451");
      expect(result.ok, "the manager's approval must land").toBe(true);

      const events = store.readAllEvents();
      expect(events.map((e) => e.type).sort()).toEqual([
        "approval.granted",
        "approval.requested",
        "cash.paid_out",
      ]);

      const request = events.find((e) => e.type === "approval.requested");
      const grant = events.find((e) => e.type === "approval.granted");
      const write = events.find((e) => e.type === "cash.paid_out");

      // ── THE PROPERTY. Three envelopes, two identities, and the split is the whole task. ──
      // W3 dies on the first line, W1/W2 on the second, and `02-F41` on the third.
      expect(request?.actor_user_id, "the REQUEST is the cashier's act").toBe(CASHIER);
      expect(grant?.actor_user_id, "the GRANT is the manager's act").toBe(MANAGER);
      expect(write?.actor_user_id, "the escalated write stays the cashier's — 02-F41").toBe(
        CASHIER,
      );

      // `02-F20`'s "actor + approver" on the write is unchanged by any of this.
      expect((write?.payload as Record<string, unknown> | undefined)?.approver_user_id).toBe(
        MANAGER,
      );
      // …and it is NOT duplicated onto the envelope (`02-F45`).
      expect(write?.actor_user_id).not.toBe(MANAGER);
    } finally {
      store.close();
    }
  });

  it("05-F6/05-F7 — the grant REFERENCES the request, and names both identities", async () => {
    const { store, record } = wholePath();
    try {
      const req = paidOut(ABOVE);
      record.raise(req);
      await record.approve(req, MANAGER, "0451");
      const events = store.readAllEvents();
      const request = events.find((e) => e.type === "approval.requested");
      const grant = events.find((e) => e.type === "approval.granted");
      const requestPayload = request?.payload as Record<string, unknown>;
      const grantPayload = grant?.payload as Record<string, unknown>;

      // "Grants reference the request id" — asserted as an EQUALITY between two emitted events,
      // never against a literal, so nothing here can pass by both sides sharing a constant.
      expect(typeof requestPayload.request_id).toBe("string");
      expect(grantPayload.request_id).toBe(requestPayload.request_id);
      // Both identities, separately required by the schema and separately populated here.
      expect(grantPayload.approver_user_id).toBe(MANAGER);
      expect(grantPayload.requester_user_id).toBe(CASHIER);
    } finally {
      store.close();
    }
  });

  it("01-F1 — no credential reaches the ledger on any of the three events", async () => {
    const { store, record } = wholePath();
    try {
      const PIN = "0451";
      const req = paidOut(ABOVE);
      record.raise(req);
      await record.approve(req, MANAGER, PIN);
      const serialized = JSON.stringify(store.readAllEvents());
      // A PIN in an event syncs to every device in the org and can never be taken back.
      expect(serialized).not.toContain(PIN);
      expect(serialized.toLowerCase()).not.toContain("pin");
    } finally {
      store.close();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §D — `05-F7`'s request payload, DERIVED from the act rather than assumed from the one act
// that could escalate before the four write schemas existed.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§D 05-F7/05-F5 — the request describes the act a manager is being asked about", () => {
  /**
   * W5's row. Before this change `05-F19`'s paid-out was the ONLY act that could escalate,
   * because `01-F4` made the other four unemittable — so `approval_type: "paid_out"` as a
   * constant passes every test that only ever drives a paid-out. These four rows are what make
   * it a mapping.
   *
   * `discount` is absent and that is not an omission — see this file's header: `WRITE_ACTIONS`
   * carries no row for `discount.recorded`, so it fails closed to `deny` and never escalates.
   */
  it.each([
    ["cash.paid_out", paidOut(ABOVE), "paid_out", ABOVE],
    ["void.recorded", voidLine(), "void", 45_000],
    ["comp.recorded", compLine(), "comp", 32_000],
    ["order.line_price_overridden", priceOverride(), "price_override", 28_000],
  ] as const)("%s escalates as `%s`", (_type, req, approval_type, amount) => {
    const r = rig();
    expect(r.record.raise(req), "the matrix must escalate this act").not.toBeNull();
    const payload = one(r.verified, "approval.requested").req.payload;
    expect(payload.approval_type).toBe(approval_type);
    // `05-F7`'s "amounts", read from the act's OWN money field. A price override carries
    // `unit_price_paisa` and not `amount_paisa`; a recorder that read one key everywhere would
    // put Rs 0 on the card `05-F5` says must hold "enough to decide without walking over".
    expect(payload.amount_paisa).toBe(amount);
  });

  it("carries `05-F5`'s stated reason, the requester and the requesting device", () => {
    const r = rig();
    r.record.raise(voidLine());
    const payload = one(r.verified, "approval.requested").req.payload;
    expect(payload.reason).toBe("wrong item discovered after the KOT");
    // `05-F7`: "requester_id, requesting device_id". Both read on the TRUSTED side — the
    // requester from the live session (`02-F41`) and the device from the store's own identity
    // (`01-F2`), never from anything the renderer sent.
    expect(payload.requester_id).toBe(CASHIER);
    expect(payload.requesting_device_id).toBe(DEVICE);
  });

  it("carries the act's refs — `05-F7`'s `refs[]` (order/line/paid-out ids)", () => {
    const r = rig();
    r.record.raise(voidLine());
    expect(one(r.verified, "approval.requested").req.payload.approval_refs).toEqual([
      "order-1",
      "line-3",
    ]);
  });

  it("the REQUEST is the requester's act — its envelope actor is never the approver", async () => {
    const r = rig();
    const req = paidOut(ABOVE);
    r.record.raise(req);
    await r.record.approve(req, MANAGER, "0451");
    // W3. Both events go through the same verified seam, so the only thing separating them is
    // which identity the recorder decided each one belongs to.
    expect(one(r.verified, "approval.requested").actor_user_id).toBe(CASHIER);
    expect(one(r.verified, "approval.granted").actor_user_id).toBe(MANAGER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §E — one act, one request (05-F7 idempotency / 01-F36 / 01-F1).
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§E 05-F7/01-F36 — a pending request is announced ONCE", () => {
  it("re-raising the same refused write reuses the request rather than minting a second", () => {
    // `Counter.tsx` calls `escalationFor` from a `.catch()` on every attempt, so a cashier who
    // presses "Paid out" twice raises the pad twice. A fresh id per press puts two pending
    // requests for ONE act into an append-only ledger (`01-F1`), and a grant against the first
    // leaves the second pending for ever on the manager device `05-F29`(a) ships.
    const r = rig();
    const req = paidOut(ABOVE);
    expect(r.record.raise(req)).not.toBeNull();
    expect(r.record.raise(req)).not.toBeNull();
    const requests = ofType(r.verified, "approval.requested");
    expect(requests).toHaveLength(1);
  });

  it("the grant references the request that was already announced", async () => {
    const r = rig();
    const req = paidOut(ABOVE);
    r.record.raise(req);
    const announced = one(r.verified, "approval.requested").req.payload.request_id;
    await r.record.approve(req, MANAGER, "0451");
    expect(one(r.verified, "approval.granted").req.payload.request_id).toBe(announced);
  });

  it("a DIFFERENT act gets its own request", () => {
    const r = rig();
    r.record.raise(paidOut(ABOVE));
    r.record.raise(voidLine());
    const requests = ofType(r.verified, "approval.requested");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.req.payload.request_id).not.toBe(requests[1]?.req.payload.request_id);
  });

  it("approving without a prior raise still produces a request for the grant to reference", async () => {
    // `05-F7` makes the request id the key a grant carries; a grant referencing nothing is not
    // expressible. `escalate` is a separate IPC channel and a renderer is never obliged to have
    // called `escalationFor` first, so the recorder must not depend on it having happened.
    const r = rig();
    const req = paidOut(ABOVE);
    const result = await r.record.approve(req, MANAGER, "0451");
    expect(result.ok).toBe(true);
    const request = one(r.verified, "approval.requested");
    expect(one(r.verified, "approval.granted").req.payload.request_id).toBe(
      request.req.payload.request_id,
    );
    expect(request.actor_user_id).toBe(CASHIER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §F — nothing is recorded where nothing was decided. A refusal is NOT a decision.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§F 02-F38/01-F27/01-F1 — what never reaches the ledger", () => {
  it("a write the matrix ALLOWS outright raises nothing", () => {
    // Under `05-F19`'s threshold a cashier pays out unsupervised. A request here would put an
    // approval interrupt on a manager's phone for an act that needs none.
    const r = rig();
    expect(r.record.raise(paidOut(BELOW))).toBeNull();
    expect(r.verified).toHaveLength(0);
  });

  it("a flat DENY raises nothing — a manager PIN does not launder one", () => {
    const r = rig();
    const req: AppendRequest = { type: "day.opened", payload: { day_id: "d-1" }, refs: [] };
    expect(r.record.raise(req)).toBeNull();
    expect(r.verified).toHaveLength(0);
  });

  it("a LOCKED device raises nothing — 01-F27 leaves no requester to ask for", () => {
    const r = rig({ signedInAs: null });
    expect(r.record.raise(paidOut(ABOVE))).toBeNull();
    expect(r.verified).toHaveLength(0);
  });

  it("a request it cannot even read raises nothing", () => {
    const r = rig();
    expect(r.record.raise({ nonsense: true })).toBeNull();
    expect(r.verified).toHaveLength(0);
  });

  it("W4 — a BAD PIN records no grant, and the request still stands", async () => {
    const r = rig({ pinOk: false });
    const req = paidOut(ABOVE);
    r.record.raise(req);
    const result = await r.record.approve(req, MANAGER, "9999");
    expect(result.ok).toBe(false);
    expect(ofType(r.verified, "approval.granted")).toHaveLength(0);
    expect(ofType(r.verified, "approval.denied")).toHaveLength(0);
    // The request is a fact: it WAS raised, and a mis-keyed PIN does not unmake it (`01-F1`).
    expect(ofType(r.verified, "approval.requested")).toHaveLength(1);
    expect(r.appended).toHaveLength(0);
  });

  it("W4 — 02-F38: a self-approval records no grant AND no denial", async () => {
    // The distinction is the point. A matrix refusal is the system saying this person may not
    // DECIDE; recording `approval.denied` for it would name her as the approver of a decision she
    // was refused, permanently. `registry.ts` makes the same claim about denials in as many
    // words: "a requester may not deny their own request into the ledger any more than they may
    // grant it."
    const r = rig({ signedInAs: MANAGER });
    const req = paidOut(ABOVE);
    r.record.raise(req);
    const result = await r.record.approve(req, MANAGER, "0451");
    expect(result.ok).toBe(false);
    expect(ofType(r.verified, "approval.granted")).toHaveLength(0);
    expect(ofType(r.verified, "approval.denied")).toHaveLength(0);
  });

  it("W4 — an approver whose PIN is right and whose ROLE is not records no grant", async () => {
    const r = rig();
    const req = paidOut(ABOVE);
    r.record.raise(req);
    const result = await r.record.approve(req, OTHER_CASHIER, "0451");
    expect(result.ok).toBe(false);
    expect(ofType(r.verified, "approval.granted")).toHaveLength(0);
    expect(r.appended).toHaveLength(0);
  });

  it("the escalated write is still the ONLY thing on the session-reading path", async () => {
    // An anti-scope guard on the decorator: `escalation.test.ts` §C asserts exactly one
    // `writes.append` per approval, and wrapping must not change that. If the approval family
    // ever starts riding `writes.append`, it inherits the session's actor — which is W1.
    const r = rig();
    const req = paidOut(ABOVE);
    r.record.raise(req);
    await r.record.approve(req, MANAGER, "0451");
    expect(r.appended).toHaveLength(1);
    expect(r.appended[0]?.type).toBe("cash.paid_out");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §G — `05-F6`'s other half. "A denial is a RECORD, never the absence of one."
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("§G 05-F6/05 §4 — a denial is logged, and it appends no escalated write", () => {
  const REASON = "I did not see that item leave the kitchen";

  it("records approval.denied with the MANAGER as its envelope actor", async () => {
    const r = rig();
    const req = paidOut(ABOVE);
    r.record.raise(req);
    const result = await r.record.deny(req, MANAGER, "0451", REASON);
    expect(result.ok).toBe(true);
    const denial = one(r.verified, "approval.denied");
    // The same two-identity property as the grant: denying is the manager's act.
    expect(denial.actor_user_id).toBe(MANAGER);
    expect(denial.req.payload.approver_user_id).toBe(MANAGER);
    expect(denial.req.payload.requester_user_id).toBe(CASHIER);
    expect(denial.req.payload.reason).toBe(REASON);
    expect(denial.req.payload.request_id).toBe(
      one(r.verified, "approval.requested").req.payload.request_id,
    );
  });

  it("05 §4 — 'Denial leaves the line intact': nothing is appended to the act's own path", async () => {
    const r = rig();
    const req = paidOut(ABOVE);
    r.record.raise(req);
    await r.record.deny(req, MANAGER, "0451", REASON);
    // "the paid-out stays pending at the POS with the denial reason; cash does not leave the
    // drawer against the ledger" — so the ONE thing a denial must never do is let the write
    // through.
    expect(r.appended).toHaveLength(0);
    expect(ofType(r.verified, "approval.granted")).toHaveLength(0);
  });

  /**
   * `02-F20`'s four refusals bind a DENIAL identically, and they are four separate `it`s rather
   * than one so a mutant's kill count attributes to the ground it broke. A denial that skipped
   * `01-F28`'s credential, or `02-F38`, or the approver's own matrix verdict, would be a way to
   * write a permanent refusal into somebody else's name with no credential at all.
   */
  it("01-F28 — a denial on a bad PIN records nothing", async () => {
    const r = rig({ pinOk: false });
    r.record.raise(paidOut(ABOVE));
    expect((await r.record.deny(paidOut(ABOVE), MANAGER, "9999", REASON)).ok).toBe(false);
    expect(ofType(r.verified, "approval.denied")).toHaveLength(0);
  });

  it("02-F38 — a requester may not deny her own request into the ledger", async () => {
    const r = rig({ signedInAs: MANAGER });
    r.record.raise(paidOut(ABOVE));
    expect((await r.record.deny(paidOut(ABOVE), MANAGER, "0451", REASON)).ok).toBe(false);
    expect(ofType(r.verified, "approval.denied")).toHaveLength(0);
  });

  it("a denier whose PIN is right and whose ROLE is not records nothing", async () => {
    const r = rig();
    r.record.raise(paidOut(ABOVE));
    expect((await r.record.deny(paidOut(ABOVE), OTHER_CASHIER, "0451", REASON)).ok).toBe(false);
    expect(ofType(r.verified, "approval.denied")).toHaveLength(0);
  });

  it("an act that never escalated cannot be denied either", async () => {
    const r = rig();
    expect((await r.record.deny(paidOut(BELOW), MANAGER, "0451", REASON)).ok).toBe(false);
    expect(r.verified).toHaveLength(0);
  });

  it("a denial with no stated reason is refused rather than recorded with invented words", async () => {
    // `approval.denied.reason` is `z.string().min(1)` in the registry and `05 §4` reads the
    // reason back at the counter. A default sentence here would be commandment 2 — this repo
    // already had to find an FR before `CATALOG_REFUSAL_WORDS` could exist.
    const r = rig();
    r.record.raise(paidOut(ABOVE));
    const result = await r.record.deny(paidOut(ABOVE), MANAGER, "0451", "");
    expect(result.ok).toBe(false);
    expect(ofType(r.verified, "approval.denied")).toHaveLength(0);
  });
});
