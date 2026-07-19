// T-01-07 law 4 — Catchup pages never skip and never duplicate (01-F9). Contract:
// plans/wave-0/kernel-tasks.md T-01-07. Branch stream, exclusive cursor
// (from_global_seq = last seq already held, assumption 6), ascending, page cap
// CATCHUP_PAGE_SIZE = 500, next_from feeds the next request unchanged, complete
// = nothing beyond the page at read time. Cross-branch/cross-org isolation
// (00 §5.4) even when two orgs reuse the same branch_id string.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { CATCHUP_PAGE_SIZE, createGateway } from "../index.js";
import {
  catchupMsg,
  closeDb,
  type Db,
  eventRows,
  freshIdentity,
  makeClock,
  must,
  ofKind,
  openDb,
  openSession,
  pushMsg,
  type Session,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let verify: Db;
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  verify = openDb();
  gateway = createGateway({ db, clock: makeClock() });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(verify);
});

const requestPage = async (session: Session, from: number) => {
  const before = ofKind(session.rec.all, "catchup_response").length;
  await session.conn.handle(catchupMsg(from));
  const responses = ofKind(session.rec.all, "catchup_response");
  expect(responses.length).toBe(before + 1);
  return must(responses.at(-1), "catchup_response");
};

describe("law 4 — catchup paging (01-F9)", () => {
  it("01-F9: CATCHUP_PAGE_SIZE is the exported binding constant 500", () => {
    expect(CATCHUP_PAGE_SIZE).toBe(500);
  });

  it("01-F9: paging from 0 yields every branch event exactly once, ascending, page cap enforced, complete/next_from per contract", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    // A second branch in the SAME org — its events must never surface in the
    // first branch's pages even though the org sequence interleaves them.
    const otherBranch = { ...identity, branch_id: freshIdentity().branch_id };
    const otherPusher = await openSession(gateway, otherBranch);

    const total = CATCHUP_PAGE_SIZE + 50;
    let lamport = 0;
    let otherLamport = 0;
    while (lamport < total) {
      const size = Math.min(110, total - lamport);
      await pusher.conn.handle(pushMsg(validEnvelopes(identity, lamport, size)));
      lamport += size;
      await otherPusher.conn.handle(pushMsg(validEnvelopes(otherBranch, otherLamport, 10)));
      otherLamport += 10;
    }

    const branchRows = (await eventRows(verify, identity.org_id)).filter(
      (r) => r.branch_id === identity.branch_id,
    );
    expect(branchRows).toHaveLength(total);
    const expectedSeqs = branchRows.map((r) => r.global_seq);

    const reader = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    const page1 = await requestPage(reader, 0);
    expect(page1.events).toHaveLength(CATCHUP_PAGE_SIZE); // cap enforced
    expect(page1.complete).toBe(false);
    const page1Last = must(page1.events.at(-1), "last event of page 1");
    expect(page1.next_from).toBe(must(page1Last.global_seq, "global_seq on served event"));

    const page2 = await requestPage(reader, page1.next_from); // next_from feeds the next request unchanged
    expect(page2.events).toHaveLength(50);
    expect(page2.complete).toBe(true);
    const page2Last = must(page2.events.at(-1), "last event of page 2");
    expect(page2.next_from).toBe(must(page2Last.global_seq, "global_seq on served event"));

    const seen = [...page1.events, ...page2.events];
    const seenSeqs = seen.map((e) =>
      must(e.global_seq, "global_seq present on every served event"),
    );
    // exactly once, in global_seq order, nothing skipped, nothing duplicated
    expect(seenSeqs).toEqual(expectedSeqs);
    // and never another branch's events (00 §5.4)
    for (const e of seen) expect(e.branch_id).toBe(identity.branch_id);
  });

  it("01-F9: an empty page returns events: [], complete: true, next_from = from_global_seq", async () => {
    const identity = freshIdentity();
    const session = await openSession(gateway, identity);
    await session.conn.handle(pushMsg(validEnvelopes(identity, 0, 3)));
    const top = must((await eventRows(verify, identity.org_id)).at(-1), "top row").global_seq;

    const page = await requestPage(session, top);
    expect(page.events).toEqual([]);
    expect(page.complete).toBe(true);
    expect(page.next_from).toBe(top);
  });

  it("01-F9: paging concurrent with in-flight merges yields every branch event exactly once across pages (the org-counter lock makes a lower seq never appear after a higher one was served)", async () => {
    const identity = freshIdentity();
    const pusher = await openSession(gateway, identity);
    const reader = await openSession(gateway, {
      ...identity,
      device_id: freshIdentity().device_id,
    });

    let pushingDone = false;
    const pusherTask = (async () => {
      for (let batch = 0; batch < 5; batch++) {
        await pusher.conn.handle(pushMsg(validEnvelopes(identity, batch * 20, 20)));
      }
      pushingDone = true;
    })();

    const pagerTask = (async () => {
      const collected: number[] = [];
      let from = 0;
      for (;;) {
        const page = await requestPage(reader, from);
        collected.push(...page.events.map((e) => must(e.global_seq, "global_seq on served event")));
        from = page.next_from;
        if (page.complete && pushingDone) break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      return collected;
    })();

    const [, collected] = await Promise.all([pusherTask, pagerTask]);

    const expected = (await eventRows(verify, identity.org_id)).map((r) => r.global_seq);
    expect(expected).toHaveLength(100);
    // exactly once, ascending, no skip even while merges were committing mid-page
    expect(collected).toEqual(expected);
  });

  it("00 §5.4/01-F9: another org NEVER leaks into catchup, even when it reuses the same branch_id string", async () => {
    const orgA = freshIdentity();
    const orgB = { ...freshIdentity(), branch_id: orgA.branch_id }; // same branch id, different org

    const sessionA = await openSession(gateway, orgA);
    const sessionB = await openSession(gateway, orgB);
    await sessionA.conn.handle(pushMsg(validEnvelopes(orgA, 0, 3)));
    await sessionB.conn.handle(pushMsg(validEnvelopes(orgB, 0, 2)));

    const pageA = await requestPage(sessionA, 0);
    expect(pageA.events).toHaveLength(3);
    for (const e of pageA.events) expect(e.org_id).toBe(orgA.org_id);

    const pageB = await requestPage(sessionB, 0);
    expect(pageB.events).toHaveLength(2);
    for (const e of pageB.events) expect(e.org_id).toBe(orgB.org_id);
  });
});
