"use client";

/**
 * **THE CLOUD PLANE, AND THE DISCIPLINE IS ABSOLUTE (Commandment 5, `18 §6`).**
 *
 * TanStack Query v5 + tRPC, and nothing else. There is no client store in this app and there is no
 * `@restos/sync-client` import anywhere in it — `commandment-5.test.ts` walks every source file and
 * fails on either, because the two planes disagree about what the catalog *is*: to the POS it is a
 * local read-only cache resolved by id; to this app it is an editable server-owned aggregate.
 * Mixing them would put a device's stale snapshot behind an editor.
 *
 * The consequence for every screen below: query results are **read where they are needed**, never
 * copied into `useState` and never mirrored into a context. What a component may hold is what the
 * OWNER has typed and has not yet sent — a draft is not server state, it is an unsent request.
 *
 * `superjson` matches `services/api`'s transformer; a mismatch would silently reshape every date
 * and `undefined` on the wire.
 */

// `AppRouter` is TYPE ONLY. The router's type is the contract; importing any VALUE from
// `services/api` would pull Fastify, `node:zlib` and the gateway wire schema into a browser bundle.
import type { AppRouter } from "@restos/api/src/router.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { type ReactNode, useState } from "react";
import superjson from "superjson";
import { readSessionToken } from "./session-token";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * Same-origin, because `next.config.ts` rewrites `/api/trpc/*` onto the API. The browser never
 * makes a cross-origin request carrying the bearer.
 */
const TRPC_URL = "/api/trpc";

/**
 * `18 §5`'s decision, seen from the client: the token is an identity claim and the server re-reads
 * authority per request. So the header is read fresh on every call rather than captured when the
 * client was built — a client built at mount would keep sending a token the user has signed out of.
 */
const authHeaders = (): Record<string, string> => {
  const token = readSessionToken();
  return token === null ? {} : { authorization: `Bearer ${token}` };
};

/** `UNAUTHORIZED` is the one error the shell acts on: the session is over, show the login screen. */
export const isUnauthorized = (error: unknown): boolean =>
  error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED";

/**
 * A `FORBIDDEN` refusal's message. `services/api`'s `errorFormatter` lifts the whole `AuthDecision`
 * onto the error shape so a screen can route to an approval instead of printing "denied" — this
 * app has no approval surface, so it prints the server's sentence, which already names the action.
 */
export const refusalMessage = (error: unknown): string | null =>
  error instanceof TRPCClientError ? error.message : null;

export const TrpcProviders = ({ children }: { children: ReactNode }): ReactNode => {
  // `useState` with an initialiser, not a module-level singleton: one QueryClient per browser
  // session, never one shared across server renders. This holds no server DATA — the cache is the
  // query layer's, which is exactly where `18 §6` puts it.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // An owner editing a menu wants to see what the server has, not a five-minute-old
            // snapshot of it — this app's whole subject is the difference between the two.
            staleTime: 0,
            retry: false,
          },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: TRPC_URL, transformer: superjson, headers: authHeaders })],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
};
