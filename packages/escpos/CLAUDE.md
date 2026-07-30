# @restos/escpos

**Owning spec: `specs/03-kitchen-fulfillment.md + 18 §10` — read it before modifying anything here (AGENTS.md routing).**

- PROTECTED PATH (encoder). Printer fonts for English/numerals; bitmap path for logos/QR/non-Latin user content (03-F8).
- This package is a scaffold stub: no implementation exists until its plans/ task and pre-implementation artifacts (24-F8) do.
- **`src/__acceptance__/` is the ORACLE and is READ-ONLY to the implementing session (24 §3 step 2, 24-F5).** K-1's suites (`printer-capability.test.ts`, `min-columns.test.ts`, and the type-only `oracle-surface.ts`) were authored from `03 §7` layer 3, `03-F36` and `03-F49`; K-2's (`encoder.test.ts` and the type-only `encoder-oracle-surface.ts`) from `03-F8`, `03-F35`, `03-F36`, `27-F55/F56` and `18 §10`. Each by a session that read no implementation and no design doc. They are committed RED on purpose. If you believe an assertion is wrong, that is a finding for the test-owning session, cited by FR ID — never an edit.
- **`encoder.test.ts` carries an independent ESC/POS walker, and it is an ALLOWLIST.** Any command it does not admit fails the suite as an unaccounted byte — that is how `03-F36`'s ban is made total. Each admitted command carries the FR that buys it; each banned one carries the FR that bans it. Needing a command the list does not admit is a finding for the test-owning session, not a test edit.
- Each suite ends with a `DEFERRED` block naming what it could NOT assert and which later K-task owns it, and each header names the FR ambiguities it refused to fill. Read both before claiming an FR is covered.
