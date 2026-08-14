#!/usr/bin/env bash
#
# ops/backup.sh — nightly backup of a till and/or the cloud database. 22-F21, 22-F22.
#
# ⚠ THE TILL HOLDS THE ONLY COPY OF A SALE UNTIL IT SYNCS. The "device-side second copy" the
#   corpus talks about is a REPLICATION property and runs the other way: the cloud is a copy of
#   the device, not the reverse. Lose the till before it pushes and the sales are gone.
#
# ⚠ COPYING device.db ALONE SILENTLY OMITS COMMITTED SALES — AND USUALLY ALL OF THEM. The device
#   store is opened WAL + `synchronous = FULL` and apps/pos-electron never closes it (there is no
#   store.close() on any quit handler), so the write-ahead log is never checkpointed. Measured on
#   a store written exactly the way the device store is: 500 committed rows, main file 4 KB,
#   -wal 2 MB, and a copy of the main file alone opened with "no such table". Not a short tail —
#   the whole ledger. So: online backup first, and a plain copy takes db, -wal AND -shm.
#
# Usage:
#   ops/backup.sh                 both halves, whichever is configured
#   ops/backup.sh --till          the device stores on this machine only
#   ops/backup.sh --cloud         pg_dump only
#
# Configuration (environment, or a file sourced before this runs):
#   RESTOS_BACKUP_DIR       REQUIRED. Where backups are written. Put it on a DIFFERENT disk from
#                           the one being backed up, or a dead SSD takes both copies.
#   RESTOS_TILL_DATA_DIR    The Electron userData directory holding device.db. Auto-discovered
#                           if unset; see the search list below.
#   DATABASE_URL            The cloud Postgres DSN. Absent = the cloud half is skipped.
#   RESTOS_BACKUP_KEEP_DAYS Retention in days. Default 30. 0 disables pruning.
#
# Exit codes: 0 every requested half succeeded · 1 something failed (read the message) ·
#             2 misconfiguration. A partial run is a FAILURE, not a warning.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS="${RESTOS_BACKUP_KEEP_DAYS:-30}"

DO_TILL=1
DO_CLOUD=1
case "${1:-}" in
  --till)  DO_CLOUD=0 ;;
  --cloud) DO_TILL=0 ;;
  "")      ;;
  *) echo "usage: $0 [--till|--cloud]" >&2; exit 2 ;;
esac

fail() { echo "backup: $*" >&2; FAILED=1; }
note() { echo "backup: $*"; }
FAILED=0

if [ -z "${RESTOS_BACKUP_DIR:-}" ]; then
  echo "backup: RESTOS_BACKUP_DIR is not set. Refusing to guess where a restaurant's only" >&2
  echo "  copy of its sales should live. Set it to a path on a different disk." >&2
  exit 2
fi
mkdir -p "$RESTOS_BACKUP_DIR" || { echo "backup: cannot create $RESTOS_BACKUP_DIR" >&2; exit 2; }

# ── the till ────────────────────────────────────────────────────────────────────────────────
# Two databases live under the Electron userData directory: device.db (the ledger, the catalog,
# the staff registry) and print-spool.db (queued kitchen tickets). Both matter — 03-F4 makes the
# spool durable precisely so a power cut does not lose queued tickets, and a restore that brings
# back the ledger without the spool loses whatever had not printed.
#
# There is no boot line printing this path, so it is discovered. On Windows it is under %APPDATA%.
discover_data_dir() {
  [ -n "${RESTOS_TILL_DATA_DIR:-}" ] && { echo "$RESTOS_TILL_DATA_DIR"; return; }
  local root
  for root in \
    "${APPDATA:-}" \
    "$HOME/.config" \
    "$HOME/Library/Application Support"
  do
    [ -n "$root" ] && [ -d "$root" ] || continue
    # One level down only: the userData directory is a direct child named for the app.
    local hit
    hit="$(find "$root" -maxdepth 2 -name device.db -print 2>/dev/null | head -1)"
    [ -n "$hit" ] && { dirname "$hit"; return; }
  done
  echo ""
}

backup_sqlite() {
  local src="$1" dest_base="$2"
  [ -f "$src" ] || { note "  $src not present — skipped"; return 0; }

  # (a) 22-F21's first mechanism: the online backup API, correct with the app running.
  node "$HERE/sqlite-backup.mjs" "$src" "$dest_base.db"
  local rc=$?
  [ "$rc" -eq 0 ] && return 0

  # THE FALLBACK IS FOR A MISSING TOOL, NEVER FOR A FAILING DATABASE. Exit 3 means better-sqlite3
  # could not be loaded on this host at all; exit 1 means it loaded and THIS store failed to copy
  # or failed its integrity check. Falling back on exit 1 would write a byte-for-byte copy of a
  # store that just told us it is broken, and hand back a file that looks like a backup.
  if [ "$rc" -ne 3 ]; then
    rm -f "$dest_base.db"
    fail "  $src did not back up (sqlite-backup exit $rc) — NO backup was written for it."
    fail "  This is the database failing, not the tooling. Do not substitute a file copy."
    return 1
  fi

  # (b) 22-F21's second mechanism: the file copy, WITH the sidecars. Only correct with the app
  # closed, so it is never silent about that — a running app can write between the three copies.
  note "  better-sqlite3 unavailable on this host; falling back to a copy of db, -wal and -shm."
  note "  ⚠ THIS IS ONLY CORRECT IF THE APP IS CLOSED. If the till is running, this backup may"
  note "    be torn. Close the app and run it again before trusting it."
  local ok=1
  cp -p "$src" "$dest_base.db" || ok=0
  # The sidecars may legitimately be absent (a store that was cleanly closed has none), so their
  # absence is not an error — but a FAILED copy of one that exists is.
  [ -f "$src-wal" ] && { cp -p "$src-wal" "$dest_base.db-wal" || ok=0; }
  [ -f "$src-shm" ] && { cp -p "$src-shm" "$dest_base.db-shm" || ok=0; }
  if [ "$ok" -ne 1 ]; then
    # Leave nothing behind. A half-written backup is the artifact that retires the alarm.
    rm -f "$dest_base.db" "$dest_base.db-wal" "$dest_base.db-shm"
    fail "  could not copy $src and its sidecars — NO backup was written for it"
    return 1
  fi
  return 0
}

if [ "$DO_TILL" -eq 1 ]; then
  DATA_DIR="$(discover_data_dir)"
  if [ -z "$DATA_DIR" ]; then
    fail "no device.db found. Set RESTOS_TILL_DATA_DIR to the app's userData directory."
    fail "  (Searched \$APPDATA, ~/.config and ~/Library/Application Support, two levels deep.)"
  else
    note "till data directory: $DATA_DIR"
    OUT="$RESTOS_BACKUP_DIR/till-$STAMP"
    mkdir -p "$OUT"
    backup_sqlite "$DATA_DIR/device.db" "$OUT/device"
    backup_sqlite "$DATA_DIR/print-spool.db" "$OUT/print-spool"
    # An empty output directory means every store failed or none was present. Either way there is
    # nothing here to restore, so do not leave a directory that looks like a backup.
    if [ -z "$(ls -A "$OUT" 2>/dev/null)" ]; then
      rmdir "$OUT"
      fail "nothing was backed up from $DATA_DIR — removed the empty $OUT"
    fi
  fi
fi

# ── the cloud ───────────────────────────────────────────────────────────────────────────────
# 22-F22: this is a pre-22-F2 interim, and the objective it does NOT meet is stated out loud.
# 22-F1's RPO of 5 minutes DOES NOT HOLD here — the real RPO is however long it is between runs
# of this script. On a nightly timer that is up to 24 hours of orders.
if [ "$DO_CLOUD" -eq 1 ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
    note "DATABASE_URL unset — cloud half skipped (run this on the cloud host, or set it)."
  elif ! command -v pg_dump >/dev/null 2>&1; then
    fail "pg_dump is not on PATH. Install the postgresql-client matching the server's major"
    fail "  version — a dump taken by an older pg_dump can be refused by pg_restore."
  else
    DUMP="$RESTOS_BACKUP_DIR/cloud-$STAMP.dump"
    # Custom format (-Fc): compressed, and pg_restore can list and selectively restore it.
    if pg_dump --format=custom --no-owner --no-privileges --file="$DUMP" "$DATABASE_URL"; then
      note "cloud dump: $DUMP ($(du -h "$DUMP" | cut -f1))"
      note "  ⚠ 22-F22: RPO is the interval between runs of this script, NOT 22-F1's 5 minutes."
      note "  Restore with: pg_restore --clean --if-exists -d <DSN> $DUMP"
    else
      rm -f "$DUMP"
      fail "pg_dump failed — NO cloud backup was written"
    fi
  fi
fi

# ── retention ───────────────────────────────────────────────────────────────────────────────
# Pruned only after a successful run: a failing backup must not also delete the last good one.
if [ "$FAILED" -eq 0 ] && [ "$KEEP_DAYS" -gt 0 ]; then
  find "$RESTOS_BACKUP_DIR" -maxdepth 1 -name 'till-*' -type d -mtime "+$KEEP_DAYS" \
    -exec rm -rf {} + 2>/dev/null
  find "$RESTOS_BACKUP_DIR" -maxdepth 1 -name 'cloud-*.dump' -type f -mtime "+$KEEP_DAYS" \
    -delete 2>/dev/null
fi

if [ "$FAILED" -ne 0 ]; then
  echo "backup: FAILED. Do not treat tonight as backed up." >&2
  exit 1
fi
note "done."
