// Acceptance property tests — T-01-03 (20 §2.3), authored from the kernel-tasks
// binding contract + specs/01-kernel-sync.md §3 only (24 §3 step 2).
// Laws under test: gap-free lamport (01-F3); drain order + checkpoint-only
// advance, never-lose / idempotent-drain (01-F8, 18 §4).

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { openStore } from "../index.js";
import { appendInput, identity } from "./builders.js";

type Op = { kind: "append" } | { kind: "ack"; frac: number };

const opArb = fc.oneof(
  fc.constant<Op>({ kind: "append" }),
  fc.record({
    kind: fc.constant("ack" as const),
    frac: fc.double({ min: 0, max: 1, noNaN: true }),
  }),
);

describe("outbox invariants (01-F3/01-F8)", () => {
  it("01-F3/01-F8: for any interleaving of appends and legal acks, lamport stays gap-free and the unacked set matches the checkpoint model", () => {
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 60 }), (ops) => {
        const id = identity();
        const store = openStore({ path: ":memory:", identity: id });
        let appended = 0;
        let checkpoint = -1; // model: highest acked lamport, -1 = none
        for (const op of ops) {
          if (op.kind === "append") {
            expect(store.append(appendInput(id)).lamport_seq).toBe(appended);
            appended++;
          } else if (appended > 0) {
            const watermark = Math.min(appended - 1, Math.floor(op.frac * appended));
            store.advanceTo(watermark);
            checkpoint = Math.max(checkpoint, watermark);
          }
          const unacked = store.nextBatch(1000).map((e) => e.lamport_seq);
          const expected = [];
          for (let i = checkpoint + 1; i < appended; i++) expected.push(i);
          expect(unacked).toEqual(expected);
          expect(store.status().queue_depth).toBe(expected.length);
        }
        expect(store.readOwnEvents().map((e) => e.lamport_seq)).toEqual(
          Array.from({ length: appended }, (_, i) => i),
        );
        store.close();
      }),
    );
  });

  it("01-F8: drain content is independent of batch size — chunked drains concatenate to the full tail", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 10 }),
        (total, chunk) => {
          const id = identity();
          const store = openStore({ path: ":memory:", identity: id });
          const all = Array.from({ length: total }, () => store.append(appendInput(id)).id);
          const chunks: string[] = [];
          while (chunks.length < total) {
            // nextBatch never consumes — only an ack advances the checkpoint (19 §5)
            const batch = store.nextBatch(chunk);
            const last = batch.at(-1);
            if (!last) break;
            for (const e of batch) chunks.push(e.id);
            store.advanceTo(last.lamport_seq);
          }
          expect(chunks).toEqual(all);
          store.close();
        },
      ),
    );
  });
});
