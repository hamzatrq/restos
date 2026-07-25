// T-01-11 fix round F7 — registers the better-sqlite3 resolution blocker
// (purity-hooks.mjs) for a spawned node. Passed via `--import` AFTER tsx so
// the blocker sits at the head of the hook chain and sees bare specifiers
// verbatim (either order blocks — a throw anywhere in the chain fails the
// import — but head placement keeps the control's failure message ours).
import { register } from "node:module";

register(new URL("./purity-hooks.mjs", import.meta.url));
