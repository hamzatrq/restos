// T-01-11 fix round F7 — POSITIVE CONTROL entry: imports the @restos/sync-client
// ROOT specifier, whose device store pulls the better-sqlite3 native addon.
// Under the blocker this import MUST fail (proving the blocker really
// intercepts the addon — the purity pin is not vacuous); without the blocker
// it must load (proving the failure is the block, not general breakage).
import "@restos/sync-client";

process.stdout.write("SYNC_CLIENT_ROOT_LOADED\n");
