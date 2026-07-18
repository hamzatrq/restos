# @restos/pos-electron

**Owning spec: `specs/02-pos-app.md (also 01 §4, 21)` — read it before modifying anything here (AGENTS.md routing).**

- Windows counter POS (Electron). Preferred branch hub (01-F13): main process will own SQLite, sync hub, printing.
- Renderer gets NO Node access (18 §9): typed IPC bridge only.
- This package is a scaffold stub: no implementation exists until its plans/ task and pre-implementation artifacts (24-F8) do.
