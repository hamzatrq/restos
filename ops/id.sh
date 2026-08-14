#!/usr/bin/env bash
#
# ops/id.sh — mint this restaurant's ids and secrets ONCE, into one file.
#
# WHY THIS EXISTS. Four processes have to agree on values that nothing anywhere checks.
# `services/api`'s BOOTSTRAP_ORG_ID must equal the till's RESTOS_ORG_ID; the till's
# RESTOS_BRANCH_ID must be inside the API's ENABLED_BRANCHES; the token minted by
# `provision-device --device X` must be pasted onto the device whose RESTOS_DEVICE_ID is X.
# Get any of those wrong and ALL FOUR PROCESSES REPORT SUCCESS AND NO TILL EVER SEES A MENU.
# There is no error message anywhere in the product for this. The fix is not a check we do not
# have — it is to type each value exactly once and paste it everywhere else.
#
# The three secrets are minted here too, for the same reason. PUBLISH_TOKEN (gateway) and
# SYNC_GATEWAY_TOKEN (API) are ONE secret under TWO names; a mismatch is a 401 on every publish.
#
# Usage:  bash ops/id.sh            # refuses if ops/ids.env already exists
#         bash ops/id.sh --force    # overwrite (this ORPHANS every already-provisioned device)
#
# Output: ops/ids.env, mode 600, gitignored.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${RESTOS_IDS_FILE:-$HERE/ids.env}"

if [ -e "$OUT" ] && [ "${1:-}" != "--force" ]; then
  echo "ops/id.sh: $OUT already exists — refusing to overwrite." >&2
  echo "  These ids are baked into every device token already minted and into every event" >&2
  echo "  already appended to a device store. Re-minting them does not reconfigure a" >&2
  echo "  restaurant; it strands one (01-F1: the ledger is append-only, and a forked ledger" >&2
  echo "  cannot be unwound). Pass --force only for a deployment that has never run." >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || {
  echo "ops/id.sh: node is required (>= 22.16.0) and is not on PATH." >&2
  exit 1
}

# node, not uuidgen/openssl: node is a hard requirement on every RestOS host already (the
# services run on tsx and the tills run from this checkout), while uuidgen is absent on stock
# Windows and openssl is absent on plenty of minimal Linux images.
gen() { node -e "$1"; }

ORG_ID="$(gen 'process.stdout.write(crypto.randomUUID())')"
BRANCH_ID="$(gen 'process.stdout.write(crypto.randomUUID())')"
COUNTER_DEVICE_ID="$(gen 'process.stdout.write(crypto.randomUUID())')"
KITCHEN_DEVICE_ID="$(gen 'process.stdout.write(crypto.randomUUID())')"

# 48 base64url chars ≈ 36 bytes. The gateway enforces >= 32 BYTES on DEVICE_TOKEN_SECRET and on
# PUBLISH_TOKEN at boot (18 §5), and refusing at 31 is a boot crash rather than a warning.
SECRET() { gen 'process.stdout.write(crypto.randomBytes(36).toString("base64url"))'; }
DEVICE_TOKEN_SECRET="$(SECRET)"
PUBLISH_TOKEN="$(SECRET)"
SESSION_SECRET="$(SECRET)"

umask 077
cat > "$OUT" <<EOF
# RestOS — this restaurant's identity and secrets. Minted $(date -u +%Y-%m-%dT%H:%M:%SZ) by ops/id.sh.
#
# ⚠ NEVER EDIT A VALUE IN THIS FILE AFTER THE FIRST DEVICE HAS BEEN PROVISIONED.
# Device identity keys the outbox (01-F8) and the ledger is append-only (01-F1), so a changed
# id does not move a device — it forks one. The replacement path for a device is a NEW
# device_id and a fresh provision, never an edited one.
#
# ⚠ SECRETS BELOW. Mode 600, gitignored. Do not paste this file into a chat, a ticket or a
# screenshot. If it leaks, rotate DEVICE_TOKEN_SECRET (every device token must be re-minted),
# PUBLISH_TOKEN/SYNC_GATEWAY_TOKEN (restart gateway + API together) and SESSION_SECRET
# (every back-office session is invalidated).

# ── identity ────────────────────────────────────────────────────────────────────────────────
# ORG_ID     -> services/api  BOOTSTRAP_ORG_ID
#            -> every device  RESTOS_ORG_ID
#            -> provision-device --org
ORG_ID=$ORG_ID

# BRANCH_ID  -> services/api  ENABLED_BRANCHES   (it must be IN that list, not merely equal to it)
#            -> every device  RESTOS_BRANCH_ID
#            -> provision-device --branch
BRANCH_ID=$BRANCH_ID

# One per PHYSICAL machine. Two tills sharing a device id fork one outbox between two
# processes; two APPS on one machine sharing it share one store.
COUNTER_DEVICE_ID=$COUNTER_DEVICE_ID
KITCHEN_DEVICE_ID=$KITCHEN_DEVICE_ID

# ── secrets ─────────────────────────────────────────────────────────────────────────────────
# HS256 key the gateway verifies device tokens with, and provision-device signs them with.
# Both processes read it under this exact name. >= 32 bytes, enforced at boot.
DEVICE_TOKEN_SECRET=$DEVICE_TOKEN_SECRET

# ONE secret, TWO names. The gateway reads PUBLISH_TOKEN; the API sends the same string as
# SYNC_GATEWAY_TOKEN. Absent on the gateway is fail-closed (every /internal route 503);
# mismatched is a 401 on every publish, so a menu is authored, saved, and reaches nobody.
PUBLISH_TOKEN=$PUBLISH_TOKEN

# Back-office session signing key (services/api). Non-empty is the ONLY check — there is no
# length floor on this one, unlike the two above.
SESSION_SECRET=$SESSION_SECRET
EOF
chmod 600 "$OUT"

echo "ops/id.sh: wrote $OUT (mode 600)"
echo
echo "  ORG_ID             $ORG_ID"
echo "  BRANCH_ID          $BRANCH_ID"
echo "  COUNTER_DEVICE_ID  $COUNTER_DEVICE_ID"
echo "  KITCHEN_DEVICE_ID  $KITCHEN_DEVICE_ID"
echo "  DEVICE_TOKEN_SECRET / PUBLISH_TOKEN / SESSION_SECRET  written, not printed"
echo
echo "Next: ops/README.md step 3. Every value below is COPIED from this file — never retyped."
