# @restos/testing

**Owning spec: `specs/20-testing-correctness.md` — read it before modifying anything here (AGENTS.md routing).**

- fast-check generators, event fixtures, fold harness, virtual printer, rush-replay simulator, integration fakes.
- **The virtual printer no longer interprets ESC/POS — it delegates (August 2026).** The byte→page walk lives in `@restos/escpos`'s `simulate.ts`, because `apps/pos-electron` needed the same walk for its `RESTOS_PRINT_TO_FILE` transport and this package is unreachable from an app by design (`18 §12`). What is left here is the DEVICE: the `Transport` shape, `03-F41`'s hold, `03-F10`'s roll controls. `__acceptance__/one-interpretation.test.ts` holds that property from both sides — §A that the page is byte-identical to `simulate()`'s, §B that no second walk grows back in this file — and both halves are needed: a behavioural check alone blesses a copy that happens to agree today. This package now depends on `@restos/escpos` (see that package's `CLAUDE.md` for the turbo cycle cut).
- **IMPLEMENTED (Wave 0).** See `README.md`. The sim-cloud double must mirror the real gateway's laws or tests pass falsely (the double-drift trap) — see the README's fidelity notes.
