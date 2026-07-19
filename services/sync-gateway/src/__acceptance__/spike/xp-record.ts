// XP fixture recorder (T-01-06 real-core leg, 20 §2.7). Drives the LANDED
// @restos/testing sim-cloud double through the shared directed exchange and writes
// the committed golden transcript. Run on demand to (re)generate the fixture:
//
//   pnpm --filter @restos/sync-gateway exec tsx \
//     src/__acceptance__/spike/xp-record.ts
//
// The fixture is a spec-review artifact (20 §2.7): editing it by hand is a drift
// event. xp-transcript.test.ts re-records in-suite and asserts equality with the
// committed bytes, so an accidental hand-edit or a sim-cloud drift fails loudly.
// This is a script, not a *.test.ts — vitest never collects it.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { recordTranscript } from "./xp-exchange.js";

const FIXTURE = fileURLToPath(
  new URL(
    "../../../../../packages/sync-protocol/src/__acceptance__/fixtures/transcripts/spike-cloud-contract.json",
    import.meta.url,
  ),
);

const transcript = recordTranscript();
mkdirSync(dirname(FIXTURE), { recursive: true });
// Trailing newline + 2-space indent — the repo's JSON fixture convention.
writeFileSync(FIXTURE, `${JSON.stringify(transcript, null, 2)}\n`, "utf8");
console.log(`[xp-record] wrote ${transcript.length} transcript entries to ${FIXTURE}`);
