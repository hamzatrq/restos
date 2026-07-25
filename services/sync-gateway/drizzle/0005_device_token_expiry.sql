-- T-01-18 (01-F47 / DEC-AUTH-001): the cloud's record of when each device's token
-- was last issued to expire.
--
-- Why a column rather than reading the token: a WAN-less origin's credential never
-- reaches the cloud — only its RELAYED events do — so there is no token to inspect
-- when deciding whether that device needs renewing. The alternative was carrying the
-- origin's token up through the hub, which was rejected: it would make a peer's token
-- authoritative for a device that is not the session's own identity, against 18 §5
-- ("the registry, never the token or the hello, decides"), and would move a
-- credential through a hub whose compromise DEC-SYNC-009 already treats as a residual
-- risk. Single writer: mint and renewal.
--
-- Nullable because rows provisioned before this migration have no recorded expiry.

ALTER TABLE "kernel"."device_registry" ADD COLUMN "token_expires_at" bigint;
