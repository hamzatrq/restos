# @restos/backoffice

**Owning spec: `specs/14-backoffice.md` — read it before modifying anything here (AGENTS.md routing).**
Plan: `plans/wave-1/backoffice-catalog.md`. Stack rules: `18 §7`. Visual language: `27`.

- **IMPLEMENTED: B-5 (shell + tRPC client + auth), B-6 (catalog editor + `14-F29` price grid +
  `03-F50` station), B-7 (`14-F3` change history in place).** `services/api` is the backend and its
  router is the contract — `AppRouter` is imported **type-only** from `@restos/api/src/router.js`.
- **THE TWO-PLANE LAW IS ABSOLUTE HERE (Commandment 5, `18 §6`).** TanStack Query v5 + tRPC only.
  Server state is never copied into a client store; `sync-client` appears nowhere.
  `__acceptance__/two-plane.test.ts` scans every shipped file and **fires each rule at a known
  violation first**, so a clean report is evidence rather than an absence.
  - The legal pattern this app uses: a draft is **seeded once** from a prop and never synced.
    `catalog-screen.tsx` gives `EntryEditor` a `key` per entry, so choosing another item MOUNTS a
    new editor. Remove that key and the seeds go stale and would have to become a sync.
- **`next build --webpack`, deliberately.** `packages/domain` and `packages/ui` ship TS source whose
  internal specifiers carry `.js`; Turbopack has no `extensionAlias` and cannot follow them.
  `next.config.ts` records the two rejected alternatives.
- **No `@/*` path alias.** The repo's `pnpm typecheck` compiles `apps/*/src` with the ROOT tsconfig,
  which has no path mapping — an alias here would pass `next build` and red `pnpm verify`. Relative
  imports only. `src/globals.d.ts` exists for the same reason (`next-env.d.ts` is outside `src/`).
- **The enabled `(branch, channel)` set is DECLARED TWICE and can drift** —
  `NEXT_PUBLIC_ENABLED_BRANCHES`/`NEXT_PUBLIC_ENABLED_CHANNELS` here, `ENABLED_*` in the API. There
  is no `catalog.enabled` procedure, so the editor cannot ask the server what to draw. The server's
  refusal is the backstop; the procedure is **owed**. See `lib/env.ts`.
- **Money is string surgery, never `× 100`** (`lib/money.ts`). Whole rupees in, integer paisa out,
  no float and therefore no rounding step. Decimals are REFUSED — a pinned interpretation, recorded
  in the file, not a specified rule.

## Mutation matrix (round-3 law) — control 83/83 green, 19 mutants, **0 survivors**

Re-run it out-of-tree before trusting a change to `lib/` or the editor. Kill counts, one branch each:

| # | mutant | killed |
|---|---|---|
| M1 | rupees→paisa off by a factor of 100 | 5 |
| M2 | a free modifier saves as MISSING rather than `0` | 5 |
| M3 | an EMPTY cell reads as free (M2's mirror) | 8 |
| M4a | the grid accepts an unpriced enabled pair (logic) | 8 |
| M4b | **the editor ignores its own refusal and saves anyway (SEAM)** | 2 |
| M5 | apply-now becomes the default | 3 |
| M6a/b/c | cancel inert · cancels the wrong edit · does not re-read the server | 2 / 1 / 1 |
| M7a/b | the two-plane rule / client-store rule neutered (guard attribution) | 2 / 1 |
| M7c | **a real `sync-client` + `useEffect`-sync file added to shipped source** | 1 |
| M8 | a blank station sent as `""` instead of `null` (`03-F50` inheritance) | 1 |
| M9 | fill-across fills only the first channel column | 18 |
| M10 | `modifier` dropped from `SELLABLE_KINDS` (the overruled July rule) | 2 |
| M11 | the change history is not filtered in place | 3 |
| M12 | `isWholeRupees` unpadded, so a FREE item reads as inexpressible | 4 |
| M13 | an empty enabled set treated as "nothing to check" | 3 |
| M14 | the timing radio sends `day_end` whatever the owner chose | 1 |

## Owed, and named as owed

- **`14-F3` is not fully renderable from the contract.** `catalog.history` returns records carrying
  `before_ref`/`after_ref` content hashes and **no timestamp**, so the FR's own example — *"price
  changed by Ali, 2 Jul, 450 → 480"* — has neither its date nor its two numbers. The screen says so
  rather than inventing them.
- **`services/api` has no `dev`/`start` script and no TS runtime**, so the two processes have never
  been run against each other. The tRPC path is exercised end to end in `__acceptance__` through a
  real client over a fake link.
- The session bearer lives in `sessionStorage`; an httpOnly cookie via a Next route handler is the
  correct shape. Reset, lockout, rate limiting, rotation, revocation and `audit.login` are all owed
  (`backoffice-catalog.md` Q2) and none of them is client work.
- `SELLABLE_KINDS` is now declared a **third** time (`lib/price-grid.ts`). `18 §2` puts it in
  `domain` once; that is a protected-path change and outside this task.
