// B-2 — the Fastify + tRPC host and its authorization middleware
// (plans/wave-1/backoffice-catalog.md §4.1). Spec: specs/18-engineering-handbook.md §5.
//
// This is the cloud plane's first caller of `domain`'s `can(user, action, scope)`, so
// Commandment 8 is enforced here or it is enforced nowhere on this plane.
//
// B-3 + B-4 — the catalog router, the staged-edit store and the publish path
// (specs/14-backoffice.md `14-F3`/`14-F7`/`14-F28`/`14-F29`, specs/01 `01-F52`..`01-F60`).
export {
  type ApplyWhen,
  assertSavable,
  type CatalogEntry,
  createMemoryStagedEditStore,
  DEFAULT_APPLY_WHEN,
  type EnabledPairs,
  SELLABLE_KINDS,
  type StagedEdit,
  type StagedEditStore,
} from "./catalog.js";
export { catalogProcedures } from "./catalog-router.js";
export {
  type CatalogDeps,
  type CatalogPublisher,
  type CatalogRuntime,
  createCatalogRuntime,
  createDayEndScheduler,
  createMemoryCatalogPublisher,
  createMemoryLedgerAppender,
  type DayEndScheduler,
  dayEndBoundary,
  type LedgerAppender,
  type LedgerRecord,
  landsAt,
  publishEdits,
  stageEdit,
} from "./publish.js";
export {
  type AppRouter,
  appRouter,
  assertEveryProcedureIsGated,
  PUBLIC_PROCEDURES,
  SESSION_ONLY_PROCEDURES,
} from "./router.js";
export { type ApiServerOptions, createApiServer } from "./server.js";
export { SESSION_TTL_MS } from "./session.js";
export { type ApiContext, AuthzRefusal, authorized, sessionProcedure } from "./trpc.js";
export { createMemoryUserStore, type UserRecord, type UserStore } from "./users.js";
