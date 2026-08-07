/**
 * Where the session bearer lives in the browser — **the credential, and nothing else.**
 *
 * This is deliberately not a contradiction of Commandment 5. `18 §6` bans copying SERVER STATE
 * into a client store; a bearer token is not server state, it is the credential the client was
 * handed and must present on every request. Nothing else is kept here: who the user is, what org
 * they belong to and what they may do all come from `session.whoami` on every render, because
 * `01-F27` re-reads authority per request and a cached role is the Commandment 8 violation.
 *
 * ⚠ **`sessionStorage`, and the limitation is stated rather than glossed.** A script running on
 * this origin can read it, so an XSS is a token theft. The correct shape is an httpOnly, SameSite
 * cookie set by a Next route handler that proxies login — which is real work and belongs with the
 * rest of the auth surface `backoffice-catalog.md` Q2 already names as owed (reset, lockout, rate
 * limiting, rotation, revocation). `sessionStorage` over `localStorage` at least ends the session
 * with the tab rather than leaving a 12-hour bearer on a shared desk overnight.
 */

const KEY = "restos.backoffice.session";

/** `null` on the server, where there is no storage and no session — never a throw. */
export const readSessionToken = (): string | null => {
  if (typeof globalThis.sessionStorage === "undefined") return null;
  return globalThis.sessionStorage.getItem(KEY);
};

export const writeSessionToken = (token: string): void => {
  if (typeof globalThis.sessionStorage === "undefined") return;
  globalThis.sessionStorage.setItem(KEY, token);
};

export const clearSessionToken = (): void => {
  if (typeof globalThis.sessionStorage === "undefined") return;
  globalThis.sessionStorage.removeItem(KEY);
};
