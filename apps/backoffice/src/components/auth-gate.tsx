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
import { LogOut } from "lucide-react";
import { type ReactNode, useState } from "react";
import { clearSessionToken, writeSessionToken } from "../lib/session-token";
import { strings } from "../lib/strings";
import { isUnauthorized, useTRPC } from "../lib/trpc";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";
import { Card, CardBody, CardHeader, CardTitle, Note } from "./ui/surface";

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
    <div className="mx-auto flex min-h-svh max-w-sm items-center p-6">
      <Card className="w-full">
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
    return <Note tone="fault">{whoami.error.message}</Note>;
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <span className="text-sm font-semibold">{strings.appName}</span>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{`${strings.session.org} ${whoami.data.org_id} · ${whoami.data.user_id}`}</span>
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
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
};
