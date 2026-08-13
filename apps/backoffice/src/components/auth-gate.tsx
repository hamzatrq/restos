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
    /*
      Two columns on a desk, stacked on anything narrower. The left panel is the whole reason
      this screen is not a card floating on a void: it says what is behind the door and that a
      restaurant's money is on the other side of it.

      **The composition is anchored, not centred in a void.** It was `max-w-4xl` centred with
      `items-center`, which on a 1440 desk left ~330 px of nothing above and below a 280 px block
      — the *"three small boxes marooned in white"* the direction document names as one of the two
      rejected screens' failure modes, in its milder form. It now takes the width it needs and sits
      at the optical third rather than the geometric middle.
    */
    <div className="mx-auto grid min-h-svh w-full max-w-5xl content-center gap-12 px-6 py-16 lg:grid-cols-[1fr_22rem] lg:items-center lg:gap-20">
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          {/* The product's name, set as the largest thing on the screen — this is the one place
              in the app where identity, not data, is the payload. Tailwind's scale, not the
              manifest's: `packages/ui` ships no DISPLAY composite (see `theme-css.ts`). */}
          <h1 className="text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
            {strings.appName}
          </h1>
          <p className="max-w-md text-body text-muted-foreground">{strings.signIn.standfirst}</p>
        </div>
        {/*
          Ground and space, not a ladder of rules. This was a bordered `<ul>` with a `border-b` on
          every row — four 3.41:1 hairlines for three short lines of text, which is a lot of
          structure to spend on a list that is not tabular and has no columns to align. Each row is
          now an OBJECT: the glyph sits in a bounded sunken tile and the rows are separated by
          space, so the panel reads as three things rather than as a table someone forgot to fill.
        */}
        <ul className="flex max-w-md flex-col gap-5">
          {DOES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
              </span>
              <span className="text-body text-muted-foreground">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>{strings.signIn.heading}</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            className="flex flex-col gap-5"
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
            {/* This screen's one committing action, so it takes the `27-F14` blue and the `lg`
                weight. Nothing else on the surface is pressable, which is what makes that legible
                rather than decorative. */}
            <Button type="submit" size="lg" className="mt-1" disabled={login.isPending}>
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
    return <p className="p-8 text-body text-muted-foreground">{strings.errors.loading}</p>;
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
    /*
      **The shell is a frame, and the page has a GROUND** (direction move 3). The chrome sits on
      the RAISED surface and the work sits on the page's own `bgColor-surface`, so the header reads
      as the instrument's bezel rather than as the first row of the content. The two fills are only
      ~1.1:1 apart by `27-F66`'s own measurement, which is exactly why the boundary does the work
      and the fills are only a depth cue.
    */
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8">
          {/* `truncate` and `whitespace-nowrap` below are not decoration: at 390 px (`14-N2`'s
              phone) the brand wrapped to two lines and `Sign out` wrapped under its own glyph,
              which doubled the chrome's height on the surface with the least of it to spare. */}
          <span className="truncate text-base font-semibold tracking-tight">{strings.appName}</span>
          <div className="flex shrink-0 items-center gap-4 sm:gap-8">
            {/*
              The org and the user, LABELLED AND STACKED. These are raw ids because they are the
              only names the server has — `01-F47` covers devices, not people, and there is no user
              profile in the corpus to read a display name from. They used to run together on one
              line behind a single word and a `·`, which read as one fact.

              Label above value, each in its own column: the direction's move 2 at chrome scale.
              **The org survives to phone width and the user does not** — `14-N2` puts an owner on
              a phone with a publish button, and which organisation she is about to publish to is
              consequential in a way her own user id is not.
            */}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {strings.session.org}
              </span>
              <span className="truncate text-label text-foreground">{whoami.data.org_id}</span>
            </span>
            <span className="hidden flex-col leading-tight md:flex">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {strings.session.user}
              </span>
              <span className="text-label text-foreground">{whoami.data.user_id}</span>
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
              <span className="whitespace-nowrap">{strings.session.signOut}</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-6 sm:px-8">{children}</main>
    </div>
  );
};
