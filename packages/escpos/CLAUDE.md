# @restos/escpos

**Owning spec: `specs/03-kitchen-fulfillment.md + 18 §10` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH (encoder). Printer fonts for English/numerals; bitmap path for logos/QR/non-Latin user content (03-F8).
- This package is a scaffold stub: no implementation exists until its plans/ task and pre-implementation artifacts (24-F8) do.
- **`src/__acceptance__/` is the ORACLE and is READ-ONLY to the implementing session (24 §3 step 2, 24-F5).** K-1's suites (`printer-capability.test.ts`, `min-columns.test.ts`, and the type-only `oracle-surface.ts`) were authored from `03 §7` layer 3, `03-F36` and `03-F49` by a session that read no implementation and no design doc. They are committed RED on purpose. If you believe an assertion is wrong, that is a finding for the test-owning session, cited by FR ID — never an edit.
- Each K-1 suite ends with a `DEFERRED` block naming what it could NOT assert and which later K-task owns it. Read those before claiming an FR is covered.
