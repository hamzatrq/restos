/**
 * The DSN fact shared by this service's entry points — `server.ts` (the running gateway),
 * `migrate.ts` (the deploy step) and the two device commands. It lives here rather than in any one
 * of them because a second copy of the default would let the commands point at different databases
 * while all reporting success, and "which database" is precisely the question that cost real time
 * when it had no answer (`server.ts`'s boot lines exist for it).
 *
 * `redactedDsn` used to live here too and now lives in `@restos/config` (`DEC-ARCH-001`): it
 * acquired a second consumer in `services/jobs`, and one redaction is one interpretation of which
 * part of a DSN may reach a log store. The default did NOT go with it — see below for why it is
 * this service's fact and not a shared one.
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
