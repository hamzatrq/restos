# 18 — Engineering Handbook: Monorepo, Stack, Libraries & Rules

**Engineering standards — Draft 1, July 2026** · Parent: `00-platform-overview.md`. This document turns 00 §3–§4 into enforceable rules: the exact monorepo layout, the libraries we build on, and the strategy for every layer. It is the law of the codebase.

**How rules work:** MUST/NEVER rules are enforced by lint/CI where possible and by review otherwise. Changing a rule = a PR editing this document first. AI sessions reach this document through the `/AGENTS.md` router (governed by `23-ai-context.md`) — it is routed to on demand, never embedded in always-loaded context; code that violates it is rejected in review regardless of whether it works.

**Version policy:** major versions named here are current at time of writing; exact versions are pinned (see §2) and live in the lockfile. Verify majors when adopting; never downgrade to match this doc.

---

## 1. Toolchain & repo foundation

| Concern | Decision | Rule |
|---|---|---|
| Runtime | Node.js current LTS | Pinned in `.nvmrc` + `engines`; CI matches exactly |
| Package manager | pnpm via corepack | `packageManager` field pinned; npm/yarn/bun NEVER |
| Orchestration | Turborepo | All tasks (`build/test/lint/typecheck`) run through `turbo`; remote cache on |
| Module system | ESM only (`"type": "module"`) everywhere | No CommonJS anywhere; CJS-only deps are disqualified or isolated behind a wrapper package |
| Lint + format | Biome (single tool) | One shared config in `packages/config`; zero per-package overrides without a rule change here; `console.log` banned outside CLIs (use logger) |
| Dependency pinning | Exact versions (`save-exact=true` in `.npmrc`) | No `^`/`~` ranges; upgrades arrive only as Renovate PRs (weekly batch), reviewed like code |
| Licenses | Allowlist: MIT, Apache-2.0, BSD-2/3, ISC, 0BSD | GPL/AGPL/SSPL NEVER in shipped code; CI license check blocks merge |
| Secrets | `.env` local only (gitignored); platform secret store in cloud | Secrets NEVER in code, config files in repo, or logs; env access only through the validated env module (§5) |
| Commits | Conventional Commits (`feat:`, `fix:`, `chore:`…), scope = package/app name | Enforced by commitlint in CI; trunk-based, short-lived branches, PR + senior review always |

## 2. Monorepo structure

```
restos/
  apps/
    pos-electron/      # Windows counter (Electron + React); preferred branch hub
    pos-rn/            # Android counter (Expo)
    pass-kds/          # Pass screen + KDS (Expo, tablet landscape)
    waiter/            # T3 handheld (Expo, BYOD-friendly)
    manager/           # Manager console (Expo, Android + iOS)
    rider/             # Rider app (Expo)
    owner/             # Owner app (Expo, Android + iOS)
    storefront/        # Customer ordering (Next.js, multi-tenant)
    backoffice/        # Restaurant back office (Next.js)
    platform-admin/    # Vendor internal console (Next.js)
  services/
    api/               # Fastify: tRPC routers (all modules) + REST webhooks + auth
    sync-gateway/      # WebSocket sync endpoint (01 §3); scales separately from api
    jobs/              # BullMQ workers: briefs, fiscalization, webhooks-out, forecasts
    whatsapp/          # Doc 07 driver (webhook in, Graph API out)
    foodpanda/         # Doc 08 driver (AggregatorDriver #1)
    intelligence/      # Doc 13: semantic layer, brief generator, analyst, LLM gateway
    tax/               # Doc 16: fiscalization state machine, rule packs, FBR/PRA clients
  packages/
    domain/            # THE source of truth: Zod event/entity schemas, event catalog,
                       # permission matrix, config schemas, money/qty/id utilities
    sync-client/       # Device sync engine: storage adapter, outbox, LAN mesh, hub
                       # election, folds, reactive queries; + /react hooks entry
    sync-protocol/     # Wire types shared by sync-client and sync-gateway
    escpos/            # ESC/POS encoder + transport interfaces (§11)
    ui/                # RN component kit + design tokens (web consumes tokens only)
    config/            # tsconfig base, Biome config, env validation factory
    testing/           # fast-check generators, event fixtures, fold test harness,
                       # virtual printer, rush-replay simulator
  specs/               # These documents
```

**Dependency direction (MUST):** `apps → packages`, `services → packages`, `packages → packages` (acyclic; `domain` imports no internal package). Apps NEVER import services or other apps; services NEVER import apps. Cross-module calls go through tRPC/events, never through direct imports across service boundaries. Enforced with Biome/dependency-cruiser check in CI.

**`packages/domain` is sacred:** every event payload, entity, config schema, and permission rule lives there once. Apps and services import types and validators from it; nobody redeclares a domain type locally. A PR touching `domain` requires senior review, always.

## 3. TypeScript rules

- `strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`. One base tsconfig in `packages/config`; packages extend, never fork.
- `any` is banned (lint error). `as` casts require a comment justifying them; `!` non-null assertions banned outside tests.
- Runtime boundaries (network, storage, env, IPC, LLM output, webhooks) MUST parse with Zod before the data touches typed code. Internal function calls do not re-validate.
- Discriminated unions over enums for state machines (order states, fiscalization states); exhaustive `switch` with `never` check mandatory.
- Errors: typed error taxonomy per layer (§6); `throw` only `Error` subclasses from `domain`; no string throws, no silent catches (`catch` must log or rethrow — lint-checked).

## 4. Domain & data layer

- **Zod v4** (current major) for all schemas. Event payload schemas are versioned objects in `packages/domain` keyed by `type` + `schema_version` (01 §4); the catalog is a typed registry — producing an event not in the registry is a compile error.
- **IDs:** `uuidv7` package; wrapper `newId()` in `domain` — direct package import banned elsewhere (one place to swap).
- **Money/quantities:** branded integer types (`Paisa`, `Milligrams`, `Millilitres`) in `domain` with arithmetic helpers; NEVER floats (00 §6). Raw `number` arithmetic on money is banned — and because "banned by convention + review" is not enforcement, this is to be backed by a **lint rule**, with division/scaling only via the `domain` rounding-policy helpers (`splitPaisa`, `applyRateBps`) and rates as integer basis points (DEC-MONEY-005). Branded types are compile-time only: they stop a raw `number` crossing an API boundary, they do **not** stop `a * 0.17` inside a module — the lint rule and the helpers are what make that unrepresentable, and the Auditor's 01-F30 conservation check is the runtime backstop.
- **Time:** timestamps are epoch milliseconds (integer) in events and storage. Formatting/timezone (Asia/Karachi) only at UI edges via `date-fns` v4 + `@date-fns/tz`. `new Date()` free-use banned in domain logic — clock is injected (testability, and device clocks are untrusted per 01-N2).
- **Cloud DB:** PostgreSQL, **Drizzle ORM + drizzle-kit** migrations. One database; one Postgres schema per module (`kernel`, `inventory`, `staff`, `intel`, `tax`, `marketing`). Rules: migrations are append-only (never edit an applied migration); read models are rebuildable projections — destructive read-model migrations are fine, event-table migrations are additive-only; every table owns exactly one writer service.
- **Device DB:** SQLite, WAL mode, foreign keys on. Electron: `better-sqlite3`; RN: `@op-engineering/op-sqlite`. Apps NEVER run SQL directly — all device data access goes through `sync-client`'s storage adapter and query API (§7). Migration of device schemas ships inside `sync-client` (versioned, forward-only, tested against fixture DBs).
- **Redis:** BullMQ queues + ephemeral cache only. Redis is NEVER a source of truth; anything in Redis must be reconstructible from Postgres.
- **Durable local queues (canonical pattern):** the sync outbox (01-F8), the print spooler (03-F4), and the fiscal store-and-forward queue (16-F11) are the same machine — row persisted in device SQLite (WAL) *before* the first attempt, explicit state machine, retry with backoff, idempotent delivery, loud terminal failure. One shared implementation (extracted from `sync-client`'s outbox core when the second consumer is built); a module specifying a persist-before-attempt queue MUST consume it, not reinvent it. Its property tests (never-lose, crash-resume, idempotent-drain) run once and cover all consumers.

## 5. Backend service rules

- **Fastify** with `@fastify/websocket` (sync-gateway), `@fastify/cors`, `@fastify/rate-limit`. **tRPC v11** for all first-party clients (superjson transformer); plain REST endpoints only for third-party webhooks/callbacks (foodpanda, WhatsApp, payment, FBR) — each with signature verification and a Zod-parsed body.
- **Auth:** `jose` for device/session tokens (short-lived access + rotating refresh per device registration, 01-F25); `argon2` for PIN hashes. Authorization is a single `can(user, action, scope)` helper generated from the `domain` permission matrix — inline role checks are banned.
- **Env/config:** each service declares a Zod env schema via `packages/config` factory; process crashes at boot on invalid env. `process.env` access outside that module is banned.
- **Logging:** `pino` (Fastify's logger), structured JSON, `pino-pretty` dev-only. Request/actor/org ids on every log line via ALS context. PII rule: customer phone numbers are logged masked (`+92300*****12`) outside kernel debug paths.
- **Observability:** OpenTelemetry SDK (traces on tRPC procedures, queues, external calls) + Sentry (`@sentry/node`). Error taxonomy: `DomainError` (expected, typed, returned to client), `IntegrationError` (external system, retriable flag), `InvariantViolation` (bug — alerts).
- **Jobs:** BullMQ; every job idempotent (keyed by deterministic job id); retries with exponential backoff; dead-letter queues monitored in doc 15 fleet health. Scheduled work (nightly brief) uses BullMQ repeatables — no OS cron.
- **External HTTP:** native `fetch` only (no axios); every external client is a thin hand-rolled module in its service with Zod-parsed responses, timeout, and retry policy declared at the top of the file. Official SDK exception: `@anthropic-ai/sdk` (LLM gateway, doc 13).

## 6. State & data management (the two-plane law)

Every screen in every app belongs to exactly one data plane; mixing planes on one screen requires an explicit sync-age label (00 §5.7):

**Local plane (operational, offline-first):** POS, pass/KDS, waiter, manager-in-branch. Source of truth is the device event log via `sync-client`:
- Writes = append a domain event through `sync-client.append()`. The UI updates from the fold, not from an optimistic cache — there is no "pending server state" because the device IS authoritative (01-F2). No TanStack Query mutations on this plane.
- Reads = `sync-client` **reactive queries**: named, typed queries over materialized fold state (e.g. `openOrders(branch)`, `kitchenQueue(station)`), subscribed in React via `useSyncExternalStore` hooks from `@restos/sync-client/react`. Components NEVER touch SQLite or fold internals.
- Folds live in `sync-client` (shared by every app), are pure functions `(state, event) → state`, and are property-tested (01-N1). Apps may register app-specific derived views but not new folds without a `sync-client` PR.

**Cloud plane (analytics/config/commerce):** owner app, back office, platform admin, storefront, manager-remote. **TanStack Query v5** + tRPC client is the only data layer; server state NEVER copied into client stores.

**Client-only UI state** (modals, wizards, cart-in-progress on storefront): **Zustand** (small, per-feature stores) or component state. Rules: no Redux; no global store containing server or ledger data; a Zustand store outliving its feature is a smell.

**Forms:** `react-hook-form` + `@hookform/resolvers` (Zod schemas from `domain`) on web and RN. Server re-validates everything (§3).

## 7. Web UI rules (Next.js apps)

- **Next.js** current major, App Router, React Server Components where natural; client components for interactive surfaces. TypeScript route handlers only for webhooks that must live web-side (rare — prefer `services/api`).
- **Styling: Tailwind CSS v4.** Internal tools (backoffice, platform-admin): **shadcn/ui** (Radix primitives) + `lucide-react` icons — boring, fast, consistent. Storefront: Tailwind with a per-org theme layer (CSS variables set from org branding config; light/dark) — no shadcn dependency in the customer bundle where avoidable.
- **Design tokens** (color scale, spacing, radii, type scale) come from `packages/ui` tokens export — web consumes tokens, not RN components. The binding UI-quality rules — closed component vocabulary, arbitrary-value bans, golden screens, per-role UX budgets — live in `21-ux-system.md`; Storybook (+ RN Storybook), Chromatic, and Maestro screenshot flows join the §14 registry via that document.
- **Tables:** TanStack Table. **Charts:** Recharts, wrapped once in a local chart-kit so swapping later is one file.
- **Language: English only** (00 §5.6 — no i18n framework, no RTL). String hygiene still applies: user-facing strings live in a per-app `strings.ts` catalog; inline string literals in JSX are lint-flagged. This is not i18n — it is a one-file-per-app convention that keeps a future language layer mechanical.
- **Accessibility floor:** keyboard operability + labels on all internal tools; storefront meets WCAG AA contrast (it faces customers).

## 8. React Native rules (Expo apps)

- **Expo** current SDK, dev clients + EAS Build/Update; `expo-router` for navigation; New Architecture on.
- **Styling: NativeWind v4** with the same token set as web. Escape hatch: `StyleSheet` where profiling on reference hardware demands it — with a comment.
- **Performance budget (2–3GB Android is the reference device, 00 §4):** `@shopify/flash-list` for every list (bare `FlatList`/`ScrollView`-as-list banned); `react-native-reanimated` for animation (JS-thread animation banned); screens must hit the 00 §5.3 targets on reference hardware, measured in CI-adjacent perf runs before release.
- **Device APIs:** `expo-notifications` (FCM/APNs), `expo-camera` (invoice photos, selfie clock-in), `expo-barcode-scanner`-equivalent from camera for QR pairing, `react-native-ble-plx` (BLE printers), custom **Expo Modules API** native modules for USB/serial printing and mDNS where Expo lacks primitives. Custom native code lives only in `pos-rn`/`pass-kds` dev clients — waiter/rider/owner/manager stay pure-JS installable.
- **Storage:** `op-sqlite` via `sync-client` only (§4); `expo-secure-store` for device tokens; AsyncStorage banned (nothing important may live there).
- **Sentry:** `@sentry/react-native`. Bundle size and cold-start tracked per release for waiter/rider (BYOD, doc 04 budgets).

## 9. Electron rules (pos-electron)

- **electron-vite** build, **electron-builder** packaging (NSIS installer + portable), staged auto-update wired to doc 15 rollout channels — never during business hours.
- Process split (MUST): main process owns SQLite (`better-sqlite3`), `sync-client` (hub role), printing (`serialport`, `usb`), cash-drawer, auto-update. Renderer is a plain React app (same §6–§7 rules) with NO Node access: `contextIsolation: true`, `nodeIntegration: false`, single preload exposing a typed, Zod-validated IPC API (`window.restos.*`). Free-form `ipcRenderer.send` from feature code is banned — all IPC goes through the typed bridge.
- Renderer and `pos-rn` share order-flow logic and view-models through `packages/` (sync-client, domain, ui tokens) — screens are reimplemented per platform, logic is not.

## 10. Printing stack (`packages/escpos`)

- Hand-rolled ESC/POS encoder (bytes are stable and documented; no fit-for-purpose maintained lib covers our transport matrix). Public API: document model (`receipt(...)`, `kot(...)`) → encoder → `Transport` interface.
- Transports: TCP 9100 (pure TS, all platforms), USB/serial (Electron main via `serialport`/`usb`; RN via custom native module), Bluetooth SPP/BLE (RN via `ble-plx`; Electron via OS serial pairing).
- Text prints via printer fonts (English + numerals — sufficient under the English-only decision, 00 §5.6); the bitmap raster path exists for logos and QR codes only. If a second script is ever added, shaping-to-bitmap reopens as a project.
- Every printer interaction goes through the spooler (doc 03): queue → attempt → confirm/timeout → retry/alert. Direct transport writes from app code are banned.
- The **virtual printer** (in `packages/testing`) implements `Transport` and renders output to PNG for snapshot tests; CI runs receipt/KOT snapshots for every layout change.

## 11. External integrations rules

One thin client per integration, living in its owning service, following §5's external-HTTP rules. Webhook ingestion: verify signature → Zod-parse → translate to kernel events → ack fast; processing happens in jobs. Outbound calls that mutate external state run inside BullMQ jobs with idempotency keys, never inline in request handlers. Integration credentials are per-org rows (encrypted at rest via app-level AES-GCM with KMS-held key), never env vars. Sandbox/mock mode is mandatory for every integration (`packages/testing` fakes: WhatsApp, foodpanda `AggregatorDriver` mock, FBR fiscalization simulator) — a feature is not done until it runs against the fake in CI.

## 12. Testing stack & rules

| Layer | Tool | Non-negotiable rules |
|---|---|---|
| Unit/integration | Vitest | Folds, money math, permission checks: 100% branch coverage |
| Property-based | fast-check | Mandatory for fold determinism (01-N1), sync merge, unit conversions |
| Postgres/Redis integration | Testcontainers | No mocked DB in service tests; real Postgres per CI run |
| API mocks | MSW + `packages/testing` fakes | External HTTP never hit in tests |
| Web E2E | Playwright | Storefront order flow + back-office critical paths per release |
| RN E2E | Maestro | POS rush flow, offline toggle scenarios, on reference hardware in the office rig |
| Metrics | Golden-value tests | Every doc-13 metric ships with fixture ledger + expected values |
| Durability | Kill-test harness + physical plug-pull protocol | Per 00 §4; release-blocking |

Rule: bug fixes land with a regression test; sync/ledger code lands with a property test or it doesn't land.

This table is the summary. The full testing taxonomy (14 kinds), the environment strategy (where Docker fits), and the AI-correctness system (the Auditor, mutation gates, review lanes, release gates) are binding in `20-testing-correctness.md`.

## 13. CI/CD & release

GitHub Actions: `turbo run lint typecheck test build` on every PR (remote cache); license + dependency-direction checks; EAS Build for RN release candidates; electron-builder artifacts signed. Release trains per app, versioned independently; rollout through doc 15 channels (internal → dev-pilot → fleet) with kill-switch flags. `main` is always releasable; feature flags over long-lived branches.

## 14. Package registry (allowed dependencies)

Anything not listed (or not added via §15) is not allowed. Grouped; exact pins in lockfile.

- **Core/shared:** `typescript`, `zod`, `uuidv7`, `date-fns` + `@date-fns/tz`, `superjson`, `tsx` (dev), `@biomejs/biome`, `turbo`, `@noble/hashes` (audit hash-chain — pure-JS/sync/cross-runtime SHA-256; DEC-AUDIT-001)
- **Backend:** `fastify`, `@fastify/websocket|cors|rate-limit`, `@trpc/server`, `drizzle-orm`, `drizzle-kit`, `postgres` (driver), `bullmq`, `ioredis`, `pino`, `pino-pretty` (dev), `jose`, `argon2`, `@anthropic-ai/sdk`, `@sentry/node`, OpenTelemetry SDK packages, `ws`
- **Web:** `next`, `react`, `react-dom`, `tailwindcss`, shadcn/ui (vendored components + `radix-ui` primitives), `lucide-react`, `@tanstack/react-query`, `@trpc/client` + `@trpc/tanstack-react-query`, `@tanstack/react-table`, `recharts`, `react-hook-form`, `@hookform/resolvers`, `zustand`, `@sentry/nextjs`
- **React Native:** `expo` + official `expo-*` modules (router, notifications, camera, secure-store, updates), `@op-engineering/op-sqlite`, `nativewind`, `@shopify/flash-list`, `react-native-reanimated`, `react-native-ble-plx`, `victory-native` (charts), `@sentry/react-native`
- **Electron:** `electron`, `electron-vite`, `electron-builder`, `better-sqlite3`, `serialport`, `usb`
- **Printing:** `pngjs` (virtual printer, logo/QR raster)
- **Testing:** `vitest`, `fast-check`, `@playwright/test`, `msw`, `testcontainers`, Maestro (CLI)

## 15. Adding a dependency (the process)

1. Check it isn't already solvable with an allowed package or 50 lines of our own code — bias: fewer dependencies; a small utility is written, not installed.
2. License on the allowlist (§1); maintained (commits within 6 months) or trivially vendorable; no install scripts doing anything surprising.
3. PR adds it to §14 with one line of justification; senior approves. Lockfile diff reviewed.
4. Native-module deps (RN/Electron) additionally require a build-on-reference-hardware check before merge.

## 16. Open questions

1. Turborepo remote cache hosting (Vercel-hosted vs self-hosted) — decide at repo setup.
2. mDNS on Android (01 §9.1 LAN transport spike will force the native-module shape).
3. Whether `manager` and `owner` apps share one Expo project with role-gated entry (install simplicity) or stay separate (store clarity) — decide before Wave 1 beta.
4. Storefront hosting: same Node platform as services vs edge deployment for customer latency — decide at Wave 2.
