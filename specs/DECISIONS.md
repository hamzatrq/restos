# Decision Register

**Purpose:** cross-cutting decisions that span module boundaries live here until promoted into their owning document. A leaf module must not implement against a `proposed`/`blocked` decision. Format per row: stable ID · status (`proposed | accepted | blocked | superseded`) · authority (owning doc once promoted) · one-line decision · open dependency · target wave.

| ID | Topic | Status | Authority | Decision / current state | Open dependency | Target |
|---|---|---|---|---|---|---|
| DEC-MONEY-001 | Refunds & post-settlement corrections | **accepted** | 01-F29..F33, 02-F36 | Linked event pairs, manager-approved, conservation-checked | — | W1 |
| DEC-MONEY-002 | Split-payment tax apportionment | proposed | 16 §9.1 | Apportion by payment share per method (provisional) | Authority guidance per adapter | Tax enablement |
| DEC-MONEY-003 | Khata fiscalization timing | proposed | 16-F16 / §9.6 | Fiscalize at receipt issuance, rate per rule-pack credit mapping | Legal verify per adapter | Tax enablement |
| DEC-MONEY-004 | Tips (capture, pooling, payout) | proposed | — (02/09/11 candidates) | Unmodeled; cash tips invisible today | Founder product call | W2 |
| DEC-SYNC-001 | Convergence contract | **accepted** | 01-F34..F38 | Commutative folds + global-seq tiebreak; quarantine model | — | W0 |
| DEC-SYNC-002 | Device classes & slices | **accepted** | 01-F39..F42 | Six classes (counter split by host runtime: electron/rn); server/hub-enforced predicates | — | W0 |
| DEC-SYNC-003 | Event archive tier at scale | proposed | 01 §9.4, 22 | S3 parquet archive vs keep-hot | Year-2 volume data | Post-launch |
| DEC-SYNC-004 | Hub upward relay vs `push` own-events-only | proposed | 01-F13 / PROTOCOL.md | 01-F13 says hub "relays events upward"; PROTOCOL.md `push` carries own events only with per-device sessions — no on-behalf semantics exist. Interim (T-01-06): followers use their own cloud fallback (documented in HUB-ELECTION.md); hub-proxied uplink needs a protocol design | Founder + protocol PR | W0 exit |
| DEC-TEST-001 | Wave-0 conformance gate scope (24-F5 vs multi-wave kernel) | proposed | 24-F5 / 20 | `verify:01 --gate` fails on unmapped rows, but ~15 kernel FRs legitimately stay unmapped through Wave 0 (catalog, customer, auth, slices). Needs a declared Wave-0 FR subset or per-row waivers | Founder ratifies subset | W0 exit |
| DEC-TEST-002 | Where 01 §8 exit criteria "run" (sim vs containerized vs rig) | proposed | 01 §8 / 20 §1 | Exit claims mix logic-provable (sim, virtual time) and physical (plug-pull, Wi-Fi p95) across three rigs; T-01-06 draft stages them (sim = binding gate, real-process smoke = probe, rig = D3). Staging needs ratification — the 19 §6 Ditto ramp needs an unambiguous pass/fail | Founder ratifies staging | W0 exit |
| DEC-TEST-003 | Auditor v1 scope ("ships in Wave 0" vs missing prerequisites) | proposed | 20 §4.2 | Full Auditor needs gateway read models, 01-F5 hash-chain emission (unscheduled), doc-15 fleet surfaces. Proposed v1: refold-diff + lamport gap-free + 01-F30 conservation + state-machine legality; device-state diff and chain verification follow their producers | Founder ratifies trim | W0 exit |
| DEC-ORDER-001 | Pre-orders / scheduled orders (`fire_at`) | proposed | — (01/03/06 candidates) | Unmodeled; storefront "order for 8pm" not supported | Founder product call | W2 |
| DEC-SUPPLY-001 | Purchase-order events (auto-PO from suggestions) | proposed | — (10/13 R3) | `action.proposed` draft-PO exists in ladder; PO entity undefined | Design with 10 forecasting maturity | W4 |
| DEC-PEOPLE-001 | Shared rider phones (one device, several riders) | proposed | 09 §9 | PIN-switch on one device vs disallow | Field reality at pilots | W2 |
| DEC-CUST-001 | Customer merge conflict UX (multi-branch same-phone) | proposed | 01 §9.3 | Kernel merges; who resolves name/address conflicts, where | UX design | W2 |
| DEC-DATA-001 | PII erasure mechanism (final) | proposed | 22 (crypto-shredding default) | Envelope-encrypted PII fields, key destruction on erasure | Legal verify + build spike | Pre-pilot |
| DEC-DATA-002 | Pakistan data-residency posture | proposed | 22 | Region near PK; residency law unverified | Legal verify | Pre-pilot |
| DEC-CHAN-001 | Customer-chat bilingual (roman-Urdu) output | **blocked** (eval gate) | 07-F23 | English replies until native-speaker eval bar passes | Eval corpus + model quality | Post-launch |
| DEC-CHAN-002 | Instagram DM automation | proposed | 07 / concept §4.2 | Link-in-bio only; DM bot when API allows | Meta API capability | W4+ |

**Rules:** promoting a decision = writing it into the owning doc and flipping status to accepted with the FR reference; a superseded row keeps its ID and points at its successor. CI (20 §2.1 static checks) will eventually lint FR references in this table against the specs.
