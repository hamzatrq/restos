/**
 * The DSN facts shared by this service's TWO entry points — `server.ts` (the running gateway) and
 * `migrate.ts` (the deploy step). They live here rather than in either one because a second copy of
 * the default would let the two commands point at different databases while both report success,
 * and "which database" is precisely the question that cost real time when it had no answer
 * (`server.ts`'s boot lines exist for it).
 */

/**
 * The conventional local Postgres.
 *
 * **Why a default at all, when `18 §5` crashes at boot on invalid env.** Until August 2026 this
 * service had no `start` script whatsoever, so nothing had ever run it as a process; when one was
 * added, a *required* `DATABASE_URL` meant the gateway could not be brought up beside
 * `services/api` and the back office without first knowing a URL, and the three-process stack is
 * the thing that was missing. The default is not a fallback that hides: `postgres-js` connects
 * **lazily**, so a wrong or absent database is never a silent success — it is a loud failure on the
 * first request that needs one, and `server.ts`'s boot line names the address that will be tried.
 *
 * The credentials stay required where a credential is the control: `DEVICE_TOKEN_SECRET` has no
 * default and `PUBLISH_TOKEN` absent is fail-CLOSED. A default connection string cannot grant
 * anyone anything; a default secret would.
 */
export const DATABASE_URL_DEFAULT = "postgres://postgres:postgres@localhost:5432/restos";

/**
 * The DSN with its password removed, for anything this service prints. `18 §5` logs are structured
 * JSON that ends up in a log store; a connection password is the one part of a DSN that must never
 * reach one, and the host/port/database — the part an operator actually needs to diagnose "why can
 * it not reach the database" — are the parts kept.
 */
export const redactedDsn = (raw: string): string => {
  const url = URL.parse(raw);
  if (url === null) return "(unparseable DATABASE_URL)";
  if (url.password !== "") url.password = "*****";
  return url.toString();
};
