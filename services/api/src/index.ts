// B-2 — the Fastify + tRPC host and its authorization middleware
// (plans/wave-1/backoffice-catalog.md §4.1). Spec: specs/18-engineering-handbook.md §5.
//
// This is the cloud plane's first caller of `domain`'s `can(user, action, scope)`, so
// Commandment 8 is enforced here or it is enforced nowhere on this plane.
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
