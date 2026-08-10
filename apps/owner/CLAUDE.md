# @restos/owner

**Owning spec: `specs/12-owner-app.md` — read it before modifying anything here (AGENTS.md routing).**

- Cloud plane ONLY (18 §6): tRPC + TanStack Query; no sync-client, no kernel outbox (12 read-only law).
- **This package is still a scaffold stub — and `12-F10`'s nightly summary is BUILT, server-side,
  somewhere else.** Read the next section before concluding it is unstarted.

## `12-F10` is built and authorized; what is missing is a SCREEN (August 2026)

The nightly owner summary exists end to end **except for its surface**:

- `services/api/src/summary.ts` — the fold. Pure, order-free, BigInt money, `01-F46` business day.
- `services/api/src/summary-router.ts` — `summary.nightly`, built with
  `authorized("report.sales_view")` and narrowed a second time by `reportScope`.
- `services/api/src/ledger.ts` + `gateway-client.ts` — the `DayLedger` port and its gateway binding.
- `services/sync-gateway/src/day-ledger.ts` + `/internal/ledger/window` — the window read.
- Oracles: `services/api/src/__acceptance__/summary.test.ts` (35),
  `services/sync-gateway/src/__acceptance__/day-ledger-http.test.ts` (13), and the `12-F10` seam
  assertion inside `catalog-gateway-seam.test.ts` which drives the DECLARED `start` script.
  Mutation matrices in `services/api/CLAUDE.md` and `services/sync-gateway/CLAUDE.md`.

**It is REACHABLE, not decorative** — the seam test logs in over a real socket and folds a real
window served by a real peer — but no human can open it. That is a screen owed, not a dead
subsystem, and the distinction matters because the two have different fixes.

### Why the screen was NOT built in the same session, stated rather than assumed

Three reasons, in descending strength. None is "ran out of time"; each would recur for the next
session and each wants a decision rather than a guess.

1. **`12 §8` says Expo + React Native and this repo has no RN toolchain at all.** `18 §14` allows
   both stacks, so a Next.js owner app is a *deviation with a plausible case*, not an obvious
   choice — and `apps/pos-rn` is a stub for the same reason. Picking one silently is exactly what
   `24 §3b` forbids.
2. **THERE IS NO PORTRAIT LAYOUT IN THIS PRODUCT, and `pnpm layout:check` deliberately keeps
   `phone-6.5` out** ("composition verdicts bind regardless of `ships` and there is no portrait
   layout"). `27 §1a` gives the owner's phone as ~6.5″ at ~405 PPI. A phone-portrait screen built
   today could not be measured by the one gate that has found **nine** layout defects and the
   suites have found zero — so it would ship as this wave's SECOND named defect (a correct
   component that is not on the screen) with no rail able to see it.
3. **The back office is not a legal home for it either.** It is the closer analogue in register
   (calmer, denser, textual) and it already runs on this plane with a tRPC client and an auth
   gate — but doc 12 owns the nightly summary and doc 14 owns layer-2 config. Putting a doc-12
   report on a doc-14 screen is inventing placement, which is Commandment 2 in the shape it
   usually arrives: a reasonable-looking decision nobody was asked to make.

**What a screen session needs to know before it starts.** The procedure returns, beside the
numbers, an `omissions` array and a `honesty` block — **both are content, not diagnostics**.
`OMISSIONS` names every `12-F10`/Appendix C block this ledger cannot answer and the FR that
decides each; a screen that renders only the numbers would let an owner read an absent voids
figure as "no voids". `honesty` carries `every_day_closed` (`12-F9`'s provisional banner),
`open_shifts`, `provisional_stamp_events` (`01-F44`), `truncated` and the fold's `01-F31`/`02-F37`
anomalies. `sync.latest_arrival_ms` is `12-F8`'s age and is stated by the SERVER — a client clock
is not a fact this product trusts anywhere else either.

**Design direction is `plans/wave-1/design-direction.md`**: the money figure is the signature,
invert label and value, labels are scaffolding. `27-F16` reserves signal colour for the abnormal,
and a nightly summary is mostly normal — the one figure that has earned colour is a `shift.closed`
whose `variance_paisa` is non-zero.
