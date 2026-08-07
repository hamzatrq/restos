"use client";

/**
 * **B-5 — the shell's authentication gate.**
 *
 * Founder ruling (`dac8747`): email + password, our own implementation, Argon2id, sessions in
 * `services/api`. This is the client half and it is deliberately thin.
 *
 * **It gates on the SERVER's answer, never on a stored claim.** The gate is "does `session.whoami`
 * succeed" — a round trip that re-reads the user from the store on every request (`01-F27`). It is
 * not "is there a token in `sessionStorage`", because a token is a string a browser holds and the
 * server may have revoked the user behind it. This is the difference Commandment 8 is about, seen
 * from the client: **nothing here decides what the owner may do.** No role is read, no permission
 * is computed, no button is hidden by rank. The API refuses what the matrix refuses, and this app
 * renders the refusal.
 *
 * ⚠ **OWED, and named as owed in `backoffice-catalog.md` Q2:** password reset, lockout and rate
 * limiting on the login endpoint, session rotation and revocation, and the `audit.login` record
 * `01-F5` already has a subtype for. None of them is client work, and none of them is here.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, History, LogOut, RefreshCw, Table2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { clearSessionToken, writeSessionToken } from "../lib/session-token";
import { strings } from "../lib/strings";
import { isUnauthorized, useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";
import { Card, CardBody, CardHeader, CardTitle, Note, Problem } from "./ui/surface";

/**
 * What this surface is for, in the owner's words rather than the system's.
 *
 * Three lines because three is what the back office actually does today — the `14-F29` grid, the
 * `14-F28` day boundary and the `14-F3` history. A fourth would be a promise the screen behind
 * this one does not keep, and this codebase treats a screen claiming a capability it lacks the
 * same way it treats one hiding a gap it has.
 */
const DOES: readonly { icon: typeof Table2; text: string }[] = [
  { icon: Table2, text: strings.signIn.doesPrices },
  { icon: CalendarClock, text: strings.signIn.doesTiming },
  { icon: History, text: strings.signIn.doesHistory },
];

const SignIn = ({ onSignedIn }: { onSignedIn: () => void }): ReactNode => {
  const trpc = useTRPC();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: (data) => {
        writeSessionToken(data.token);
        onSignedIn();
      },
    }),
  );

  return (
    // Two columns on a desk, stacked on anything narrower. The left panel is the whole reason
    // this screen is not a card floating on a void: it says what is behind the door and that a
    // restaurant's money is on the other side of it.
    <div className="mx-auto grid min-h-svh w-full max-w-4xl items-center gap-10 p-6 lg:grid-cols-[1fr_auto] lg:gap-14">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          {/* The product's name, set as the largest thing on the screen — this is the one place
              in the app where identity, not data, is the payload. */}
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">{strings.appName}</h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">
            {strings.signIn.standfirst}
          </p>
        </div>
        {/* A ruled list, not a feature grid: the rules are the structure the price grid itself
            has, and they cost no colour (27-F16 keeps the palette for what is abnormal). */}
        <ul className="flex max-w-md flex-col border-t border-border">
          {DOES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 border-b border-border py-3">
              <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm leading-relaxed text-muted-foreground">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <Card className="w-full lg:w-80 lg:justify-self-end">
        <CardHeader>
          <CardTitle>{strings.signIn.heading}</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              login.mutate({ email, password });
            }}
          >
            <Field label={strings.signIn.email} htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label={strings.signIn.password} htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {/* One refusal for both halves — the server does not say which and neither does this,
                because a login endpoint that distinguishes them is an account enumerator. */}
            {login.error === null ? null : <Note tone="fault">{strings.signIn.refused}</Note>}
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? strings.signIn.working : strings.signIn.submit}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
};

export const AuthGate = ({ children }: { children: ReactNode }): ReactNode => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // THE gate. The server's own answer to "who is this", re-asked rather than remembered.
  const whoami = useQuery(trpc.session.whoami.queryOptions());

  const signedIn = (): void => {
    void queryClient.invalidateQueries();
  };

  if (whoami.isPending) {
    return <p className="p-6 text-sm text-muted-foreground">{strings.errors.loading}</p>;
  }
  if (whoami.error !== null) {
    if (isUnauthorized(whoami.error)) return <SignIn onSignedIn={signedIn} />;
    // NOT `error.message` in a red bar. That rendered undici's `fetch failed` — and, in the run
    // that produced this change, `Unexpected token 'I', "Internal S"... is not valid JSON` — as
    // the entire application. The raw string is still available under `detail`.
    return (
      <div className="flex min-h-svh items-center p-6">
        <Problem
          heading={strings.unreachable.heading}
          body={strings.unreachable.body}
          action={strings.unreachable.action}
          detail={whoami.error.message}
        >
          <Button
            type="button"
            variant="secondary"
            disabled={whoami.isFetching}
            onClick={() => void whoami.refetch()}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {whoami.isFetching ? strings.unreachable.retrying : strings.unreachable.retry}
          </Button>
        </Problem>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">{strings.appName}</span>
        <div className="flex items-center gap-4">
          {/* The org and the user, labelled. These are raw ids because they are the only names
              the server has — `01-F47` covers devices, not people, and there is no user profile
              in the corpus to read a display name from. Labelling them at least says WHICH id
              is which, instead of running two identifiers together behind one word. */}
          <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="uppercase tracking-wide">{strings.session.org}</span>
            <span className="font-medium text-foreground">{whoami.data.org_id}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-foreground">{whoami.data.user_id}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearSessionToken();
              // Drop every cached answer with the credential that fetched it. Leaving them would
              // render the previous user's menu behind the next one's login.
              queryClient.clear();
              void queryClient.invalidateQueries();
            }}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {strings.session.signOut}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 p-6">{children}</main>
    </div>
  );
};
