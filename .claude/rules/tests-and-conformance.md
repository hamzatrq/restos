---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "conformance/**"
---

# Oracle protection (24 §3 step 2, 24-F5)

Tests and conformance rows are the oracle. The rules:
- **Acceptance tests are written from spec text by a session that never sees the implementation** — if you are implementing the FRs these tests cover, you may not edit them. Report the conflict instead.
- Never weaken, special-case, or delete an assertion to make a run pass. A test you believe is wrong = a finding for the test-owning session, cited by FR ID.
- `conformance/` status is CI-derived. Hand-editing it is falsifying the ledger.
- Evidence over assertion: paste the harness-captured run output; never claim "tests pass" without it.
