# Conformance matrices (24-F5)

One YAML file per module: `conformance/NN.yml` — the derived ledger of FR → acceptance test → status. **Status is written by CI from test results; hand-editing status is falsifying the ledger** (only `tests:` mappings and waiver requests are authored by humans/test-owning sessions, and waivers require senior review).

## Format

```yaml
module: "02"                # owning spec number
target_rung: D1             # current DoD target (24-F2)
rows:
  - fr: 02-F9
    tests:
      - "apps/pos-rn/src/cloud-order-inbox.acceptance.test.ts#02-F9"
    status: green           # derived: unmapped | red | green | waived
  - fr: 02-F31
    tests: []
    status: unmapped        # visible debt — module cannot pass D1 with unmapped rows
  - fr: 02-F30
    tests: ["..."]
    status: waived
    waiver:
      reason: "blocked on foodpanda mapping fixture (08 open question 1)"
      expires: "2026-10-01"  # expired waiver = release-train blocker (24-F5)
```

## Rules

- Module finality at a rung = zero `unmapped`, zero `red`, zero expired waivers (24-F5).
- Test IDs embed the FR ID in the test name so the mapping is grep-verifiable (23-F14).
- Holdout-layer tests (24-F7) appear as rows here but their file paths are CI-only — implementing sessions can see *that* an FR is holdout-covered, never *how*.
- The derivation tool (Vitest/Maestro reporters → status) is the first Wave 0 harness task (24 §11.1); until it exists, matrices may not claim `green`.
