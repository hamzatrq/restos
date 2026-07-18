# Hub election state machine (24-F8 artifact for spec 01-F13 — implementation follows in T-01-05)

States: `solo` (no peers) → `follower` (connected to hub) → `candidate` (election) → `hub`.

- **Eligibility:** hub-eligible classes only (01-F39): counter-electron > counter-rn > kitchen. Waiter/manager/rider devices never enter `candidate`.
- **Deterministic election (no consensus protocol needed):** every eligible device broadcasts `ping{class, device_id}` on LAN (mDNS discovery, manual-IP fallback, 01-F12). Winner = highest class rank; tie → lowest `device_id` (lexicographic). Every device computes the same winner locally from the same peer set — election is a pure function of visible peers, re-run on peer-set change.
- **Heartbeat:** hub pings followers every 2 s; follower marks hub lost after 3 missed (6 s) → recompute election from current peers → new hub announces via `hello_ack{hub:true}`. Re-election target < 10 s (01-F13).
- **Split-brain tolerance:** two hubs after a partition is *safe by design* — both relay append-only events; merge on heal is set-union + dedupe (01-F8, 01-F38); the deterministic function converges both sides to one hub once they see each other. No fencing needed because hubs hold no exclusive authority (cloud assigns `global_seq`, 01-F3).
- **Hub duties:** relay `push` branch-wide + upward; serve `catchup` from its full window (01-F14); preferred cloud uplink. Followers keep their own cloud fallback if the hub has no WAN.
- **Cold start:** single eligible device → `solo` (acts as hub for later joiners). Scoped classes connect to whoever is hub and never serve peers (01-F39).
