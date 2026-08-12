// Acceptance tests — the manager console's HOME MODEL: what the screen is allowed to claim about
// data it may not have. The derivation half is `alarm-derivation.test.ts`.
//
// Authored from spec text ONLY (24 §3 step 2; read-only to the implementing session):
//   `05-F22` — "The full console works over cloud from anywhere. Every screen shows last-synced
//              age; when the branch is unreachable, the console says so plainly ('branch offline —
//              last seen 12 min ago') and never renders stale state as live (00 §5.7)."
//   `05-F23` — "Remote alarm push continues via FCM/APNs whenever the branch has WAN; while the
//              branch is offline, the console shows the alarm gap honestly INSTEAD OF IMPLYING
//              CALM."
//   `05-F9`  — "the remote approval card shows data age (00 §5.7) BEFORE the manager commits".
//   `05 §4`  — the honesty path, verbatim: "alarm silence is labeled as unknown, not calm."
//   `05-F21` — the home screen "is a glance, not a dashboard: active alarms, …".
//   `00 §5.7` — sync honesty: a surface never presents unknown or stale state as current.
//   `05-N4`  — "Console offline … must cost the branch nothing" — so the screen must RENDER in
//              every one of these states rather than refuse (`01-F17`, commandment 4).
//
// No implementation of `../home.js` was read; none exists in this tree.
//
// ── WHY THIS FILE IS THE ANTI-FAKE TRIPWIRE, AND WHAT IT CAN AND CANNOT CATCH ───────────────────
//
// `apps/manager` cannot reach a branch stream today (both planes are blocked; the blockers are in
// this session's report). The obvious way to make an alarm screen "work" anyway is to hand it a
// literal, which AGENTS.md names as this wave's recurring defect shipped on purpose. The two
// assertions with teeth against that are:
//
//   · `alarms` is UNREPRESENTABLE as an empty list while the branch is unreachable. The contract
//     below is a discriminated union — `{ known: true; list }` or `{ known: false }` — so "no
//     alarms" and "I do not know" cannot be confused by an implementation OR by a renderer. This
//     is `05-F23`'s "instead of implying calm" expressed as a type rather than as a caption, for
//     the reason `OrdersSurface.tsx` recorded: a caption asserting a rule the rows do not follow
//     is worse than no caption.
//   · when the branch IS reachable the model's list must EQUAL `alarmsFrom` over the same input,
//     computed independently by the test. A hardcoded, filtered or padded list reddens.
//
// What it cannot catch, stated so a clean run is not read as coverage: nothing here proves that
// any React component renders the model, because `packages/ui` ships no RN components and
// `21-F2` bans raw `react-native` primitives in app code — so there is no compliant screen to
// assert against, and `18 §12` gives RN exactly one testing tool (Maestro E2E on the office rig)
// and no component-level renderer. The model is the honest boundary; the glass is owed.

import { resolveAging } from "@restos/device-config/aging";
import type { KitchenQueueRow, OpenOrderRow } from "@restos/sync-client/fold-engine";
import { describe, expect, it } from "vitest";
import { type AlarmInput, alarmsFrom } from "../alarms.js";
import { type BranchSnapshot, managerHome, managerHomeNow } from "../home.js";

const MINUTE = 60_000;
const NOW = 1_770_000_000_000;
const AGING = resolveAging(undefined);

const queueRow = (order_id: string, minutesOld: number): KitchenQueueRow => ({
  order_id,
  confirm_at: NOW - minutesOld * MINUTE,
  channel: "counter",
  age_basis: NOW - minutesOld * MINUTE,
  lines_ready: 0,
  lines_total: 1,
});

const orderRow = (order_id: string): OpenOrderRow => ({
  order_id,
  channel: "counter",
  order_type: "dine_in",
  confirmed_at: NOW - MINUTE,
  settled: 0,
  table_ids_json: "[]",
  table_conflict: 0,
  pay_total: 0,
  repaid_total: 0,
  refund_total: 0,
  pay_attempts_json: "[]",
  refund_attempts_json: "[]",
  cap_violated: 0,
  exceptions_json: "[]",
  json_lines: "{}",
});

const branch = (orders: readonly { id: string; minutes: number }[]): AlarmInput => ({
  queue: orders.map((o) => queueRow(o.id, o.minutes)),
  orders: orders.map((o) => orderRow(o.id)),
  facts: [],
  now: NOW,
  aging: AGING,
});

const reachable = (input: AlarmInput, last_seen_ms = NOW - 40_000): BranchSnapshot => ({
  reachable: true,
  last_seen_ms,
  branch: input,
});

const unreachable = (last_seen_ms: number | null): BranchSnapshot => ({
  reachable: false,
  reason: "no branch stream on this device",
  last_seen_ms,
});

describe("05-F23 / 05 §4 — an unreachable branch is a GAP, never calm", () => {
  it("reports the alarm list as UNKNOWN when the branch is unreachable", () => {
    // The whole point of the file. `05 §4`: "alarm silence is labeled as unknown, not calm."
    // The mutant this exists for renders `{ known: true, list: [] }`, which is indistinguishable
    // on glass from a quiet kitchen and is what a manager at home would act on.
    const model = managerHome(unreachable(NOW - 3 * MINUTE), NOW);
    expect(model.alarms.known).toBe(false);
    expect(model.reachable).toBe(false);
  });

  it("CONTROL: a reachable branch with no late orders reports KNOWN and empty", () => {
    // Without this, `alarms: { known: false }` for every input passes the test above — and the
    // console would never show an alarm at all while looking scrupulously honest.
    const model = managerHome(reachable(branch([{ id: "order-fresh", minutes: 2 }])), NOW);
    expect(model.alarms.known).toBe(true);
    expect(model.alarms.known && model.alarms.list).toEqual([]);
  });

  it("still says something — the honesty line is never empty, in either state", () => {
    // `00 §5.7` and `05-F22`'s "says so plainly". A blank label is the same failure as a wrong one:
    // the manager reads an empty screen as a quiet branch. The WORDING is deliberately not pinned
    // here — only that the model carries one, so the text lives in the model and a renderer cannot
    // substitute its own cheerier sentence.
    expect(managerHome(unreachable(null), NOW).honesty.length).toBeGreaterThan(0);
    expect(managerHome(reachable(branch([])), NOW).honesty.length).toBeGreaterThan(0);
  });

  it("renders rather than refuses when the branch has NEVER been seen", () => {
    // `05-N4` / `01-F17`: a console that throws on a cold start costs the branch something. The
    // never-seen case is the state this app is actually in today, so it is the one most likely to
    // be reached first and the one least likely to have been exercised.
    const model = managerHome(unreachable(null), NOW);
    expect(model.alarms.known).toBe(false);
    expect(model.last_seen_seconds).toBeNull();
    expect(model.honesty.length).toBeGreaterThan(0);
  });
});

describe("05-F22 / 05-F9 / 00 §5.7 — data age is stated, as a number, before anyone acts", () => {
  it("reports the age of the last contact in seconds", () => {
    // "Every screen shows last-synced age" — a NUMBER, because `05-F22`'s own example sentence
    // ("last seen 12 min ago") cannot be written from a boolean. The mutant is a model that
    // carries only `reachable`, which reads as live at 40 s and as live at 40 minutes.
    expect(managerHome(reachable(branch([]), NOW - 40_000), NOW).last_seen_seconds).toBe(40);
  });

  it("reports the age of the last contact after the branch drops, not the moment of the drop", () => {
    // `05-F22`'s worked sentence is about an UNREACHABLE branch: "branch offline — last seen 12
    // min ago". So the age has to survive the transition, which is the case an implementation
    // that computes the age only on the reachable path silently loses.
    expect(managerHome(unreachable(NOW - 12 * MINUTE), NOW).last_seen_seconds).toBe(12 * 60);
  });
});

describe("the seam — the screen shows the DERIVATION's alarms and nothing it made up", () => {
  it("carries exactly what `alarmsFrom` returns for the same branch input", () => {
    // Computed independently on both sides of the assertion, so a hardcoded card, a dropped alarm
    // and a padded list all redden. This is the mutation AGENTS.md asks for by name — mutate the
    // SEAM, not the logic — and it is the reason the model takes the branch input rather than a
    // pre-made list: a model handed alarms cannot be tested for having derived them.
    const input = branch([
      { id: "order-late-1", minutes: 30 },
      { id: "order-late-2", minutes: 45 },
      { id: "order-fine", minutes: 3 },
    ]);
    const model = managerHome(reachable(input), NOW);

    expect(model.alarms.known).toBe(true);
    expect(model.alarms.known && model.alarms.list).toEqual(alarmsFrom(input));
    expect(model.alarms.known && model.alarms.list).toHaveLength(2);
  });

  it("the SHIPPED composition never claims to know alarms it cannot have", () => {
    // `managerHomeNow()` is the zero-argument construction the app's screen calls — the one place
    // a source, a clock and the derivation are wired together, and therefore the one place the
    // recurring defect can enter the product.
    //
    // ⚠ The invariant is written as an IMPLICATION on purpose, so it holds today (no branch
    // stream: unreachable) and still holds on the day a storage adapter lands (reachable, real
    // rows). A test asserting "unreachable" outright would go RED against a CORRECT
    // implementation, which this repo rates as damaging as a vacuous one.
    const model = managerHomeNow();

    expect(model.honesty.length).toBeGreaterThan(0);
    // (`last_seen_seconds` is deliberately NOT asserted here: an unreachable branch that WAS seen
    // eleven minutes ago has a number, and that is `05-F22`'s own worked example.)
    if (!model.reachable) {
      expect(model.alarms.known).toBe(false);
    } else {
      expect(model.alarms.known).toBe(true);
    }
  });
});
