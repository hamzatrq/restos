/**
 * ONE redaction of a connection string, for every process that prints one (`DEC-ARCH-001`).
 *
 * It was `services/sync-gateway/src/database-url.ts`'s until `services/jobs` became its second
 * consumer, and it moved here rather than being copied for the reason `03-F40`'s two sensor bit
 * layouts records: a second local helper is a second interpretation of which part of a DSN may
 * reach a log store, and the two diverge silently — one of them starts keeping a field, and nothing
 * says which is right. `DATABASE_URL_DEFAULT` deliberately did NOT come with it: that default
 * exists because the gateway's boot must not require a URL, and a shared default would hand every
 * other service a database it never named.
 */

/**
 * The DSN with its password removed, for anything a service prints. `18 §5` logs are structured
 * JSON that ends up in a log store; a connection password is the one part of a DSN that must never
 * reach one, and the host/port/database — the part an operator actually needs to diagnose "why can
 * it not reach the database" — are the parts kept.
 *
 * An input it cannot parse is REPLACED, never echoed: a boot line is printed while reporting a
 * fault, so returning the raw string would leak the password on exactly the DSN shape nobody
 * predicted. It never throws for the same reason.
 */
export const redactedDsn = (raw: string): string => {
  const url = URL.parse(raw);
  if (url === null) return "(unparseable DATABASE_URL)";
  if (url.password !== "") url.password = "*****";
  return url.toString();
};
