/**
 * A real tRPC client over a fake link.
 *
 * **Not a mocked hook, and the difference is the whole point of these tests.** The recurring defect
 * of this wave is a correct subsystem with no seam to the product: a suite exercises a module
 * directly and nothing asserts the application reaches it. Stubbing `useTRPC` would reproduce that
 * exactly — the screens would be tested against a shape, not against the path they actually take.
 *
 * So the components below run through the genuine `TRPCProvider`, the genuine TanStack Query cache
 * and the genuine options proxy; only the transport is replaced. What each test asserts is
 * therefore *what the shipped screen sends*, which is the only claim worth making about a seam.
 */

import type { AppRouter } from "@restos/api/src/router.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ReactNode } from "react";
import { TRPCProvider } from "../lib/trpc";

/** One procedure's answer. Throw to make it fail; return to make it succeed. */
export type Handler = (input: unknown) => unknown;
export type Handlers = Record<string, Handler>;

/**
 * Every call the components made, in order — the evidence each seam test reads.
 *
 * **`type` is the operation's own kind**, added when `21-F15`'s naming reads landed on screens whose
 * read-only claims (`12-F26`, Commandment 5) were asserted as *"the path set has one member"*. That
 * is a proxy: the FR bans MUTATING endpoints, not additional queries, and a proxy assertion breaks
 * on a legal change while staying silent on the illegal one it was aimed at. With the kind on the
 * log a suite can assert what the FR says.
 */
export type CallLog = {
  path: string;
  input: unknown;
  type: "query" | "mutation" | "subscription";
}[];

/** The refusal shape `services/api` actually puts on the wire, so `isUnauthorized` sees the real thing. */
export const unauthorized = (): never => {
  throw TRPCClientError.from({
    error: {
      code: -32001,
      message: "no valid session",
      data: { code: "UNAUTHORIZED", httpStatus: 401 },
    },
  });
};

const fakeLink =
  (handlers: Handlers, log: CallLog): TRPCLink<AppRouter> =>
  () =>
  (opts) =>
    observable((observer) => {
      log.push({ path: opts.op.path, input: opts.op.input, type: opts.op.type });
      const handler = handlers[opts.op.path];
      if (handler === undefined) {
        observer.error(TRPCClientError.from(new Error(`no handler for ${opts.op.path}`)));
        return;
      }
      try {
        observer.next({ result: { data: handler(opts.op.input) } });
        observer.complete();
      } catch (error) {
        observer.error(
          error instanceof TRPCClientError ? error : TRPCClientError.from(error as Error),
        );
      }
    });

export const Harness = ({
  handlers,
  log,
  children,
}: {
  handlers: Handlers;
  log: CallLog;
  children: ReactNode;
}): ReactNode => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const client = createTRPCClient<AppRouter>({ links: [fakeLink(handlers, log)] });
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
};
