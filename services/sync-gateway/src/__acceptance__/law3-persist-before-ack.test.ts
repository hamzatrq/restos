// T-01-07 law 3 — Persist-before-ack (01-F2, cloud side). Contract:
// plans/wave-0/kernel-tasks.md T-01-07. At the moment push_ack reaches the sink,
// every acked event is readable through an INDEPENDENT DB connection: the sink
// itself kicks off the query — commit must observably precede the ack.
import type { ProtocolMessage } from "@restos/sync-protocol";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Gateway } from "../index.js";
import { createGateway } from "../index.js";
import {
  closeDb,
  type Db,
  freshIdentity,
  helloMsg,
  makeClock,
  must,
  openDb,
  pushMsg,
  validEnvelopes,
} from "./helpers.js";

let db: Db;
let independent: Db; // separate pool from the gateway's — the law's whole point
let gateway: Gateway;

beforeAll(() => {
  db = openDb();
  independent = openDb();
  gateway = createGateway({ db, clock: makeClock() });
});

afterAll(async () => {
  await gateway.close();
  await closeDb(db);
  await closeDb(independent);
});

describe("law 3 — persist-before-ack (01-F2)", () => {
  it("01-F2: when push_ack reaches the sink, the sink's own independent connection already sees every acked row and the watermark", async () => {
    const identity = freshIdentity();
    const batch = validEnvelopes(identity, 0, 5);
    const batchIds = batch.map((e) => e.id).sort();

    // The probe starts INSIDE the sink, at ack-delivery time, on a connection
    // the gateway does not own. If the impl acked before commit, this read
    // (a separate transaction) cannot see the rows.
    let ackProbe:
      | Promise<{ acked: number; visibleIds: string[]; visibleWatermark: number | undefined }>
      | undefined;

    const conn = gateway.connect((message: ProtocolMessage) => {
      if (message.kind !== "push_ack") return;
      const acked = message.acked_watermark;
      ackProbe = (async () => {
        const rowsResult = await independent.execute(
          sql`select id from kernel.events where org_id = ${identity.org_id}`,
        );
        const watermarkResult = await independent.execute(
          sql`select acked_watermark from kernel.device_watermarks
              where org_id = ${identity.org_id} and device_id = ${identity.device_id}`,
        );
        const watermarkRow = [...watermarkResult][0];
        return {
          acked,
          visibleIds: [...rowsResult].map((r) => String(r.id)).sort(),
          visibleWatermark:
            watermarkRow === undefined ? undefined : Number(watermarkRow.acked_watermark),
        };
      })();
    });

    await conn.handle(helloMsg(identity));
    await conn.handle(pushMsg(batch));

    const probe = await must(ackProbe, "push_ack was delivered to the sink");
    expect(probe.acked).toBe(4);
    expect(probe.visibleIds).toEqual(batchIds); // every acked event already committed
    expect(probe.visibleWatermark).toBe(4); // watermark updated in the same transaction
    conn.close();
  });
});
