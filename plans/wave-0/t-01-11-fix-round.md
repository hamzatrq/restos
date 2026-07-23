# T-01-11 fix round — review BLOCKING (F1/F2) + rulings

- **F1 (ruled):** the report survives ANY poisoned input — never silent. Per-order guard around `settledConservationResidualPaisa` (RangeError → a `conservation`-class finding naming the order, magnitude argument as at the gateway per t-01-08 F-1); per-event guard around `parseEvent` in the refold (throw → structured `unparseable_merged_event` finding). Whole-org abort is charter violation.
- **F2 (ruled, GATEWAY-side):** fill a lamport slot ONLY when the quarantine row was actually stored — check the insert result (`ON CONFLICT DO NOTHING` returning nothing = no fill, no watermark advance for that slot). The coverage law's premise ("the slot is durably held by the row") becomes true by construction. Auditor unchanged on this point.
- **F3 (ruled):** gap leg aggregates contiguous missing slots into ONE range finding; per-device slot-scan cap (watermark-corruption class must produce a bounded report, not a hang).
- **F5 (ruled):** a duplicate order_id in the supplied read-model arrays is itself a `readmodel_diff` finding.
- **F4 (ruled, sync-client additive):** the engine exports `billed_effective` (row field or helper) — the Auditor's mirror (`billedFromJsonLines` + re-declared EXITED) is deleted. The auditor file's own "never reimplemented here" header becomes true.
- **F7 (ruled):** purity gets a PIN — spawned-node import-graph test (auditor module loads with better-sqlite3 absent) authored by the oracle phase; plus the root-specifier ban noted for a future lint arm.
- **F6 (recorded, not built):** the nightly wrapper must gate on a sync-quiescence/stability horizon before findings page anyone — deployment-wiring decision for the cron task, candidate DEC row. `RunAuditorArgs` unchanged in v1.
- **F8 residuals recorded** (ratified masking instance → fill-credit follow-up; excess-tender deferral; quarantined-create invisibility; tail-truncation inherency; scale posture "fine for Wave 0").
