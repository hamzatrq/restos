// ACCEPTANCE TESTS — one device, one store: a device database is BOUND to the identity it was
// created for, and refuses a different one rather than merging two devices into one ledger.
//
// **AUTHORED FROM SPEC TEXT ONLY** (`24 §3` step 2). The session that wrote this file wrote no
// production code for the behaviour it describes and is disqualified from implementing it. The
// assertions below are expected to be RED until the store gains the binding; that is the point.
//
// ⚠ **PROTECTED PATH (`20 §4.4`, commandment 10): `packages/sync-client`. SENIOR REVIEW** on the
// change that makes this green.
//
// ── THE AUTHORITIES, quoted so an assertion can be argued with ─────────────────────────────────
//
//   01-F1   "Append-only event log per org, following the canonical envelope (00 §6). No
//           update/delete paths exist in any API. Corrections are new events referencing the
//           corrected event id."  — which is why the harm below is PERMANENT: once two devices'
//           envelopes have been drained out of one outbox, nothing unwinds them.
//
//   01-F2   "Every device persists events locally (SQLite, WAL) before acknowledging the action to
//           the UI. A confirmed action is a persisted event (plug-pull safe)."  — *every DEVICE*,
//           singular. `device-store.ts` already states the reading this file tests, in its own
//           append guard: "one device, one store; nothing persisted".
//
//   01-F3   lamport_seq is "monotonic, gap-free, assigned atomically with the insert" — per
//           device. Two devices sharing one `events` table interleave one sequence between two
//           origins, and every consumer of it (the outbox drain, the ack watermark, the cloud's
//           per-origin contiguity check) is reading a sequence that belongs to nobody.
//
//   01-F8   "Push: a device uploads its own events in `lamport_seq` order; the server acks the
//           high-water mark; retries are idempotent (event `id` dedupes)."  — the outbox is keyed
//           by the device identity. `01-F13` adds that the cloud "tracks lamport contiguity per
//           origin device".
//
//   01-F9   the branch stream is identity-scoped — `device-store.ts`'s ingest guard already
//           refuses a peer envelope whose org/branch do not match the store identity, citing it.
//
// ── THE DEFECT THIS FILE IS AIMED AT, as measured ──────────────────────────────────────────────
//
// `apps/pos-electron` and `apps/pass-kds` both open `join(app.getPath("userData"), "device.db")`
// and neither sets an app name, so on Linux both resolve to `~/.config/Electron/device.db` — ONE
// FILE, TWO APPS. Two processes with DIFFERENT `device_id`s were pointed at one file: the two
// event tables merged, and each store returned the other's events as its own, with no error at
// all. Both outboxes then push the other's envelopes upward, into a log `01-F1` makes permanent.
//
// The store is the last line of defence and the only one that holds for every host: the file path
// is decided by an app (see `apps/pass-kds/src/main/__acceptance__/one-device-one-store.test.ts`),
// but a device database that refuses a foreign identity is safe against ANY host that gets the
// path wrong — including a hand-typed `--user-data-dir`, a restored backup, and a copied VM image.
//
// ── WHAT IS DELIBERATELY NOT ASSERTED ──────────────────────────────────────────────────────────
//
// **No error TYPE is named.** `AckBeyondAppendedError` is the house precedent for a named class,
// but nothing in the corpus requires one here and a suite that pinned a class name would go red
// against a correct implementation that threw a plain `Error`. What IS required is that the
// message names both identities — an operator meeting this at 19:40 needs to know which store he
// opened and which device he asked to be (`00 §5.7`).
//
// **Nothing is asserted about REPAIR.** `01-N5`'s replacement path is a fresh `device_id` and the
// corpus offers no merge, split or re-stamp for a store that has already forked. Refusing is the
// whole of what these FRs support; inventing a repair would be commandment 2.
//
// **A FINDING for the implementing session (commandment 9).** No FR states in one clause that a
// store REFUSES a foreign identity — `01-F2`'s "every device persists events locally" plus
// `01-F8`'s per-device outbox is the reading this file rests on, and `device-store.ts` already
// carries it in an append-guard message. If the implementer's reviewer wants that reading written
// down, the spec PR belongs in `specs/01-kernel-sync.md` and this file's citations should move to
// the new id.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDeviceStore } from "../device-store.js";
import { createNodeStorageAdapter } from "../storage-node.js";
import { openStore } from "../store.js";
import { appendInput, type Identity, identity } from "./builders.js";

const dirs: string[] = [];

const tempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "restos-store-identity-"));
  dirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The ordinary two-till case: same org, same branch, a different terminal (`01-F13`, `02-F11`). */
const sameBranchAs = (id: Identity): Identity => ({
  org_id: id.org_id,
  branch_id: id.branch_id,
  device_id: identity().device_id,
});

const messageOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
};

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §A — THE BINDING. Each assertion is aimed at a plausible implementation that would pass the
// others: an empty store (nothing to infer an identity from), a live second handle (the measured
// case — two PROCESSES, not two sequential opens), and a store that already holds events.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§A 01-F2/01-F8 — a device database belongs to one device", () => {
  it("01-F2/01-F8: a store created for one device_id REFUSES to reopen under another", () => {
    const a = identity();
    const b = sameBranchAs(a);
    const path = join(tempDir(), "device.db");

    const first = openStore({ path, identity: a });
    first.append(appendInput(a));
    first.close();

    expect(
      () => openStore({ path, identity: b }),
      "this file already belongs to device " +
        `${a.device_id} and was opened as ${b.device_id}. 01-F2 persists events for a DEVICE and ` +
        "01-F8 drains that device's outbox in its own lamport order; two devices in one `events` " +
        "table interleave one sequence between two origins and each pushes the other's envelopes " +
        "into a log 01-F1 forbids unwinding.",
    ).toThrow();
  });

  it("01-F2: an EMPTY store is bound too — the identity is not inferred from the first event", () => {
    // THE DANGEROUS CASE. The plausible implementation reads the `device_id` off a stored envelope
    // and finds none, so a store that has been opened and not yet written merges silently — which
    // is exactly the state both Electron hosts are in for the first seconds after launch, and the
    // state a freshly provisioned pair of devices is in on their first morning.
    const a = identity();
    const b = sameBranchAs(a);
    const path = join(tempDir(), "device.db");

    const first = openStore({ path, identity: a });
    expect(first.readOwnEvents(), "fixture: this store is deliberately empty").toEqual([]);
    first.close();

    expect(
      () => openStore({ path, identity: b }),
      "an empty device database accepted a second device_id. The binding must be written when the " +
        "store is CREATED, not derived from its contents — 01-F2's store exists before its first " +
        "event does.",
    ).toThrow();
  });

  it("01-F8/01-F13: it refuses while the first handle is still OPEN — the two-process case", () => {
    // The measured defect is two RUNNING apps, not two sequential opens. WAL admits many handles,
    // so an implementation that only checks on a cold open leaves the real case wide open.
    const a = identity();
    const b = sameBranchAs(a);
    const path = join(tempDir(), "device.db");

    const first = openStore({ path, identity: a });
    try {
      expect(
        () => openStore({ path, identity: b }),
        "a second device opened the same live database. This is the shipped shape of the defect: " +
          "two Electron apps, both resolving ~/.config/Electron/device.db, running at once.",
      ).toThrow();
    } finally {
      first.close();
    }
  });

  it("01-F1/01-F8: it refuses rather than serving the other device's events as its own", () => {
    const a = identity();
    const b = sameBranchAs(a);
    const path = join(tempDir(), "device.db");

    const first = openStore({ path, identity: a });
    const mine = [appendInput(a), appendInput(a), appendInput(a)].map((e) => first.append(e).id);
    first.close();

    expect(() => openStore({ path, identity: b })).toThrow();

    // The control that gives the refusal its meaning: A's own events are still A's, undisturbed.
    const reopened = openStore({ path, identity: a });
    expect(reopened.readOwnEvents().map((e) => e.id)).toEqual(mine);
    reopened.close();
  });

  it("01-F2/00 §5.7: the refusal NAMES the device on disk and the device that asked", () => {
    // A device that will not start must say which two identities disagree. Being wrong about this
    // value looks exactly like being right (`running-the-stack.md` §0), so a bare "identity
    // mismatch" leaves an operator with no way to tell which of the two ids is the typo.
    const a = identity();
    const b = sameBranchAs(a);
    const path = join(tempDir(), "device.db");
    const first = openStore({ path, identity: a });
    first.close();

    const message = messageOf(() => openStore({ path, identity: b }));
    expect(message, "the refusal does not name the device_id the store was created for").toContain(
      a.device_id,
    );
    expect(message, "the refusal does not name the device_id it was opened as").toContain(
      b.device_id,
    );
  });

  it("01-F9/01-F2: a foreign org or branch is refused on the same rule", () => {
    // `01-F9` makes the branch stream identity-scoped and `device-store.ts`'s ingest guard already
    // refuses a peer envelope on org/branch. A store whose org or branch changed under it holds a
    // ledger for one branch and is answering for another — the same fork, one axis over.
    const a = identity();
    const otherOrg = { ...a, org_id: identity().org_id };
    const otherBranch = { ...a, branch_id: identity().branch_id };

    const orgPath = join(tempDir(), "device.db");
    openStore({ path: orgPath, identity: a }).close();
    expect(() => openStore({ path: orgPath, identity: otherOrg })).toThrow();

    const branchPath = join(tempDir(), "device.db");
    openStore({ path: branchPath, identity: a }).close();
    expect(() => openStore({ path: branchPath, identity: otherBranch })).toThrow();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §B — THE CONTROLS. Without these, a door that threw unconditionally would satisfy §A, and the
// product would lose crash-resume (`01-F2`), the second till (`02-F11`) and every existing suite.
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§B 01-F2 — what must keep working", () => {
  it("01-F2/20 §2.6: reopening under the SAME identity resumes the same store", () => {
    const a = identity();
    const path = join(tempDir(), "device.db");
    let store = openStore({ path, identity: a });
    const ids = [appendInput(a), appendInput(a)].map((e) => store.append(e).id);
    store.close();

    store = openStore({ path, identity: a });
    expect(store.readOwnEvents().map((e) => e.id)).toEqual(ids);
    expect(store.append(appendInput(a)).lamport_seq, "01-F3: no gap, no reuse").toBe(2);
    store.close();
  });

  it("01-F2: a fresh file opens for whichever device asks for it", () => {
    const b = identity();
    const store = openStore({ path: join(tempDir(), "device.db"), identity: b });
    expect(store.identity.device_id).toBe(b.device_id);
    store.close();
  });

  it("01-F13/02-F11: two devices in one branch run side by side — in two files", () => {
    // The binding must cost the product nothing it is supposed to have. Two tills in one branch is
    // the case `01-F13`'s hub election and `02-F11`'s branch-wide order list exist for.
    const a = identity();
    const b = sameBranchAs(a);
    const first = openStore({ path: join(tempDir(), "device.db"), identity: a });
    const second = openStore({ path: join(tempDir(), "device.db"), identity: b });
    const mine = first.append(appendInput(a)).id;
    const theirs = second.append(appendInput(b)).id;

    expect(first.readOwnEvents().map((e) => e.id)).toEqual([mine]);
    expect(second.readOwnEvents().map((e) => e.id)).toEqual([theirs]);
    first.close();
    second.close();
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// §C — WHICH LAYER OWNS IT. `openStore`'s `{ path }` arm is one of three doors onto the same core
// (`storage-node`, `storage-op-sqlite` via `openRnStore`, and a caller-built adapter — the last is
// what `apps/manager` and `services/sync-gateway` use). A guard in the Electron door alone leaves
// the manager's phone and every adapter caller unprotected, and the phone is the device whose own
// host comment says an unconfigured one "would silently adopt the COUNTER's `device_id`".
// ───────────────────────────────────────────────────────────────────────────────────────────────

describe("§C 01-F2 — the binding is the STORE's, not one door's", () => {
  it("01-F2/18 §4: the engine-free core refuses a foreign device_id too", () => {
    const a = identity();
    const b = sameBranchAs(a);
    const path = join(tempDir(), "device.db");

    const first = createDeviceStore({ adapter: createNodeStorageAdapter({ path }), identity: a });
    first.close();

    expect(
      () => createDeviceStore({ adapter: createNodeStorageAdapter({ path }), identity: b }),
      "the refusal lives in the door rather than in the store, so `openRnStore` and every " +
        "caller-built adapter (apps/manager, services/sync-gateway) still merge two devices into " +
        "one file. 18 §4 puts one storage PORT under one core; the identity binding belongs with " +
        "the core that reads and writes the rows.",
    ).toThrow();
  });

  it("CONTROL: the core opens normally for its own identity through the same adapter", () => {
    const a = identity();
    const path = join(tempDir(), "device.db");
    const store = createDeviceStore({ adapter: createNodeStorageAdapter({ path }), identity: a });
    expect(store.identity.org_id).toBe(a.org_id);
    store.close();
  });
});
