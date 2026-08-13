/**
 * The `audit.login` sink — what turns a PIN session's record into a ledger event (`01-F5`).
 *
 * `pin-session.ts` deliberately holds no store: `01-F5` makes `prev_audit_hash` STORE-owned
 * (the device stamps it inside the append transaction and rejects a caller-supplied value), so
 * the session emits a record and something else appends it. Until now every host filled that
 * `audit` option with `() => {}`, which meant an unlock, a wrong PIN and a lockout left no
 * trail anywhere — `01-F5` names `audit.login` among its six subtypes and nothing produced
 * one. This is that something else.
 *
 * NO EVENT TYPE IS INVENTED (commandment 2): `audit.login` is already in the `01 §4` catalog
 * and the `AuditEventType` annotation on `PinAuditRecord` makes a new one a compile error.
 */

import { newId } from "@restos/domain";
import type { DeviceStore } from "./device-store.js";
import type { PinAuditRecord } from "./pin-session.js";

export type PinAuditSinkOptions = {
  /** Narrowed to what an audit append actually touches — this seam reads no projection. */
  store: Pick<DeviceStore, "identity" | "append">;
  /**
   * The RAW device clock for `device_created_at` (`01-F45`: an untrusted forensic hint). The
   * store stamps the authoritative `branch_created_at` itself, so nothing here reads a clock
   * a fold will ever see.
   */
  now: () => number;
};

export const createPinAuditSink = (
  options: PinAuditSinkOptions,
): ((record: PinAuditRecord) => void) => {
  const { store, now } = options;

  return (record) => {
    // Fields are NAMED, never spread. `01-F1` has no update or delete path, so anything that
    // reaches this append is permanent and un-redactable — a PIN that arrived in a field the
    // type does not name would be a credential the product could never take back. A whitelist
    // is the only boundary that holds under a caller this file does not control.
    const { user_id, device_id, outcome, reason } = record.payload;
    try {
      store.append({
        id: newId(),
        org_id: store.identity.org_id,
        branch_id: store.identity.branch_id,
        device_id: store.identity.device_id,
        // `02-F45` reads attribution from the envelope and `02-F41` makes it whoever's PIN is
        // IN. On a refusal nobody's is, so this is null and the attempted identity stays in
        // the payload below, where it reads as an attempt rather than as an attribution that
        // `01-F1` would make permanent.
        actor_user_id: outcome === "success" ? user_id : null,
        device_created_at: now(),
        type: record.type,
        schema_version: 1,
        // `prev_audit_hash` is absent on purpose — the store stamps it (`01-F5`), and supplying
        // one is a loud refusal with nothing persisted.
        payload:
          reason === undefined
            ? { user_id, device_id, outcome }
            : { user_id, device_id, outcome, reason },
        refs: [],
      });
    } catch {
      // `01-F17`: a sale is never blocked. An audit that cannot be written is a gap in a log;
      // an audit that THROWS unwinds through the unlock that already succeeded and stops the
      // till to protect its own paperwork. Swallowed, and currently SILENT — no FR names a
      // surface that owns "the audit trail could not be written", and inventing one here would
      // be the speculative error handling `24-F23` bans.
    }
  };
};
