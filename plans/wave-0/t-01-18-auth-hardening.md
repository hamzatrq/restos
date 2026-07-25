# T-01-18 — Auth hardening (DEC-AUTH-001 / DEC-AUTH-002)

Closes `01-F47` (token lifetime, binding, renewal) and `01-F48` (eviction latency).
Ratified in `fdb4efd`. Senior-review origin: `audit-1.md` #9 and #1-residual.

## Starting point (verified, not remembered)

`services/sync-gateway/src/auth.ts` already carries an **optional** `expires_at` custom
claim, enforced by the gateway against the **injected** clock (18 §4). Two properties of
the current design are load-bearing and must survive:

- Issuance is **deterministic** — no `iat`/`jti`/`exp` is stamped, so identical claims +
  secret yield identical bytes, and committed golden fixtures depend on it.
- Expiry rides as a **custom** `expires_at` claim, never standard `exp`, because jose
  would validate standard `exp` against the wall clock and break the injected-clock law.

Both constraints are respected below. `iss`/`aud` are safe as *standard* claims —
unlike `exp` they are compared by value, not against a clock, so determinism holds.

## Work

1. **`exp` mandatory, 90-day default.** `expires_at` becomes required at issuance
   (default `now + 90d` from the injected clock at the issuance seam). Verification stays
   clock-free; the gateway keeps enforcing the comparison.
2. **`iss`/`aud` binding.** `.setIssuer()` / `.setAudience()` at mint;
   `jwtVerify(..., { issuer, audience })` at verify. A token minted for one deployment
   becomes inert in another. Both values are gateway configuration.
3. **Silent renewal.** `hello_ack` gains an optional `renewed_token`. The cloud mints a
   fresh token whenever remaining life is below the renewal threshold and the registry row
   is active. **Hub-relayed devices renew too** — the relayed ack path (DEC-SYNC-009)
   carries the renewal to a device that never holds WAN itself. This is the clause that
   makes a 90-day TTL safe in a LAN-only deployment.
4. **Expiry never blocks a sale (01-F17).** An expired token withdraws cloud/LAN
   *admission* only. An expired-but-**unrevoked** device is admitted for the sole purpose
   of draining its backlog and receiving a renewal; expired **and revoked** is purged
   (01-F42). The device keeps serving and persisting locally in every case.
5. **Low-life warning.** Below 25% remaining life the device surfaces a warning through
   the existing sync-status surface (01-F11 honesty UI).
6. **01-F48 eviction ≤ 30 s.** The *read* half already landed (`9a0c1ff`: revoked peers
   culled from fan-out, fail-closed, post-commit). Remaining: drop **live sessions** on
   the revoking transaction rather than waiting for the device's next voluntary contact,
   and the same on the hub's LAN side. Fail-closed throughout — unreadable revocation
   state refuses participation.

## Traps

- **Do not switch `expires_at` to standard `exp`.** It reads the wall clock inside jose
  and silently defeats the injected-clock law that every deterministic test depends on.
- **Do not let renewal mint on every hello.** That destroys issuance determinism and the
  golden fixtures. Renew only below the threshold, and make the threshold injectable so
  tests can drive it.
- **Do not treat expiry as revocation.** They have opposite failure directions: revocation
  must fail *closed* (deny on unreadable state), expiry must fail *open* toward the device
  keeping its ability to sell. Conflating them re-creates the cloud-stranding class
  DEC-SYNC-009 exists to remove.
- **A renewal must not extend a revoked device.** Check the registry, not just the
  signature, before minting.

## Assumption surfaced (24 §3b)

The simpler alternative is no expiry at all with `iss`/`aud` binding only — genuinely less
code, and it can never brick a device. Rejected because it leaves a stolen tablet valid
forever unless someone notices and revokes it, which the founder ruled against. Recorded
so the trade is visible rather than implied.
