# 03 — Kitchen & Fulfillment: Printing Service, Pass Screen, KDS, Timing Pipeline

**Module spec — Draft 1, July 2026** · Parent: `00-platform-overview.md` (conventions §5–§7 inherited), `01-kernel-sync.md`. Seed detail: `restaurant-os.md` Appendix G (printing) and Appendix B (KOT). Wave 1 (printing + pass screen); KDS station routing ships with the T3 mesh (Wave 4).

## 1. Purpose & scope

Everything between order confirm and food leaving the kitchen:

- the **printing service** — KOTs, receipts, cash-drawer kick, on every tier;
- the **pass screen** (T2) — one cheap Android tablet at the pass showing the branch queue with aging and line-level assembly state;
- the **KDS** (T3) — per-station screens with routing and bump;
- the **timing pipeline** — aging timers from day one, and silent training of per-item prep-time estimates from ready-marks.

Users: chefs, pass staff, and whichever role owns the ready signal (03-F24). Devices: ESC/POS thermal printers (58/80 mm) and 2–3 GB Android tablets; the print service runs inside the counter POS host process (doc 02).

## 2. Position in platform

- **Depends on:** kernel (doc 01) for the order stream and fast-path LAN propagation; `packages/escpos`.
- **References:** doc 02 (confirm boundary, receipt jobs, T1 auto-advance), doc 04 (waiter ready-notifications; waiter-on-pickup ownership), doc 05 (late-order alarms consume the aging thresholds defined here; print-failure alarms), docs 04/06/13 (consumers of published ETAs — ETA *display* belongs to them, never here), doc 15 (printer/device fleet health).
- **Events consumed:** `order.created / confirmed / line_added / note_added / line_state_changed`, `availability.changed`, receipt job requests (doc 02).
- **Events emitted:** `kot.printed / reprint_requested / print_failed`, `order.line_state_changed`, `availability.changed` (pass-screen toggle), `cash.drawer_opened` (kick execution on POS request), extensions `printer.status_changed`, `eta.estimates_published` (§5).

## 3. Functional requirements

**Printing service**
- 03-F1 ESC/POS output, 58 mm and 80 mm, over USB, Bluetooth SPP/BLE, and TCP port 9100, via `packages/escpos` (encoder + pluggable transports).
- 03-F2 Routing by category: one `order.confirmed` fans out to N KOTs by category→printer rules (grill printer vs Chinese printer vs tandoor), with per-printer copy count.
- 03-F3 KOT layout:
  - order number + table/channel in large type, timestamp;
  - one line per item with qty/variant/modifiers;
  - item notes visually emphasized;
  - reprints carry a "REPRINT" band;
  - course grouping (starters/mains) optional, off by default.
- 03-F4 Durable spooler: every print job is persisted (SQLite, WAL) with an explicit state machine (`queued → transmitting → stalled? → printed | failed`; **`stalled` added July 2026 — see 03-F41**) before the first transmit attempt; a crash or power loss mid-print resumes or reprints the job on restart — never drops it. Retry with backoff (default 3 attempts over 30 s) on transport failure. (Instance of the canonical durable-local-queue pattern, 18 §4 — one implementation shared with the sync outbox 01-F8 and fiscal queue 16-F11.)
- 03-F5 **Silent KOT failure is forbidden.** When retries exhaust:
  - the host device raises a loud alert — full-screen banner + repeating sound — naming the printer and order ("KOT #142 did not print — grill printer offline"), repeating until acknowledged;
  - acknowledgment is logged (`audit.*`);
  - `kot.print_failed` is emitted (consumed by doc 05 alarms).
  Testable: kill a printer mid-rush; the alert shows within 45 s of confirm.
- 03-F6 One-tap reroute: from the failure alert, the operator can resend the failed job to any other registered printer; the reroute is logged.
- 03-F7 Reprint and KOT-void always logged with actor + reason (`kot.reprint_requested`; post-KOT void per 01 §4 requires approver).
- 03-F8 Text prints via printer fonts (English + numerals — 00 §5.6); the bitmap raster path serves logos, QR codes, and **user-content fields containing non-Latin text** (customer names, addresses, order notes may arrive in Urdu script — 00 §5.6 user-content rule): such fields render to bitmap per-field, never dropped or transliterated. Numerals Western.
- 03-F9 Cash drawer kick via receipt-printer RJ11. The POS emits `cash.drawer_opened` (with reason) as the authoritative record; this service executes the kick. Drawer opens without a sale still require the event first — no kick without a ledger entry.
- 03-F10 Printer test harness — scripted suite runnable from device settings and on the office rig (00 §4):
  - charset page and logo/QR bitmap page;
  - cut and drawer kick;
  - 9100 and Bluetooth reconnect;
  - 200-job soak;
  - **paper-out behaviour: pull the roll mid-job and assert the spooler reports `stalled` (03-F41) via `DLE EOT 4` (03-F40), then assert reloading prints the job EXACTLY ONCE;**
  - **head-to-cutter distance** (an unpublished per-model constant, observed 20–30 mm) and **`GS B` solid-fill fidelity**, both rig-calibrated per model into the capability record;
  - results feed the maintained compatibility list (Black Copper BC-58U/85AC + generic Chinese printers are the baseline set). **Note the BC-58U has NO auto-cutter** — a manual tear bar, i.e. a human action and a mis-tear vector per ticket; it stays a compatibility target, never a recommendation.
- 03-F11 `printer.status_changed` (extension) emitted on online/offline transitions per registered printer — feeds doc 05 alarms and doc 15 fleet health.
- 03-F12 Receipts print through the same spooler and durability rules; receipt events are owned by doc 02.

**Pass screen (T2)**
- 03-F13 One tablet at the pass shows the branch order queue — all channels, channel-tagged — **strictly chronological by confirm time**. Card contents: order number, channel badge, table, age, line summary.
- 03-F14 Aging colors on each card: neutral → amber at X min → red at Y min.
  - X/Y are org-configurable per order type (defaults: dine-in 10/20, delivery 15/25);
  - timer basis is `order.confirmed`, so a failed print never hides a late order.
- 03-F15 Line-level assembly view per order: "2 of 3 items ready, waiting on naan" — folded from `order.line_state_changed` across stations.
- 03-F16 Ready-marking: per line and whole-order, one tap → `order.line_state_changed` to `ready` with actor. Item availability is also toggleable from the pass (01-F22).
- 03-F17 An order leaves the queue when all its lines reach a terminal service state — `served`, or `picked_up` for delivery (canonical vocabulary, 01 §4); a recall strip keeps the last 20 cleared orders one tap away (wrong-bump recovery).

**KDS (T3)**
- 03-F18 Per-station screens: a station map (station → categories/items, layer-2 config, mirroring or refining printer routing) filters each screen to its own lines only. A device knows its station identity (layer 3: "this screen is grill").
- 03-F19 Bump: the station marks its lines done in one tap → `order.line_state_changed` (`ready`, station-scoped) for those lines. Un-bump within 2 min is allowed and logged (a new state event, never an edit).
- 03-F20 Cross-station assembly: the pass screen aggregates line states from all stations via `order.line_state_changed` (line-level state routing, 01 §4) — the pass sees the whole order; stations see only their part.
- 03-F21 A station screen shows its own open-line count and nothing about other stations' load — visibility without cross-station pressure games.
- 03-F22 KDS may run alongside printers (screen + paper) or replace them per station — layer-2 choice.

**Sequencing law (settled)**
- 03-F23 Sequencing is **visibility only**. The system never dictates cook order: no auto-prioritization, no reordering of the queue, no "cook this next" prompts — at any tier, ever. Chronological order + aging color is the entire sequencing UI; the chef decides.

**Ready-signal ownership**
- 03-F24 Who marks `ready` is a role assignment at layer 2 (00 §7): chef (KDS bump), pass person (pass screen), counter (POS, 02-F33), or waiter-on-pickup (doc 04). The emitted event is identical regardless of owner; every surface capable of ready-marking respects the assignment (others render read-only). **Canonical (01 §4): station bump = those lines `ready`; order-level ready = the fold of all lines ready; an owner's "order ready" mark simply marks all remaining lines at once. There is no separate order-ready state.**

**Timing pipeline (stages defined here; ETA display belongs to docs 04/06/13)**
- 03-F25 **Stage 1 — aging timers, day one:** timers from `order.confirmed` on every queue surface (pass, KDS, POS T1 panel, manager console). No learning required; this alone is the Wave 1 deliverable.
- 03-F26 **Stage 2 — silent sample capture:** every ready-mark yields a prep-time sample derived purely from the ledger (no staff input, automation law 00 §5.8). Fields:
  - `item_id`, `variant_id`, `station`, `branch_id`;
  - `duration` (confirm → ready, per line);
  - load context: `open_lines_at_confirm`, `orders_confirmed_trailing_15min`, `daypart`;
  - `segment`: `rush` when trailing-15-min confirms ≥ threshold (default 8, layer-2 adjustable), else `quiet`.
  T1 branches produce no ready-marks (02-F31), so they honestly produce no samples.
- 03-F27 **Stage 3 — estimation:** a cloud job (BullMQ; nightly full + hourly incremental) computes per `item × segment × branch`: median and p80 prep time over a rolling 60-day window, outlier-trimmed.
- 03-F28 **Stage 4 — confidence gate:** an estimate is published only when its cell passes both conditions (defaults; platform-layer adjustable):
  - ≥ 30 samples in the rolling window;
  - p80 ≤ 2× median (spread sanity).
  Below the gate, consumers get "no estimate" — never a guess (concept law 6).
- 03-F29 **Stage 5 — publication:** gated estimates ship as versioned reference data via `eta.estimates_published` (extension) on the normal sync channel (01 §8).
  - The order-level quote rule is defined once, here, so every consumer quotes identically: max of line-item p80s + assembly buffer (default 2 min).
  - Consumers and display surfaces: waiter capture (doc 04), storefront/WhatsApp quoting (docs 06/07), analyst metrics (doc 13).

**Printed-document model (03 owns the renderer; 14 owns only the editing surface — AGENTS.md routing, July 2026)**

- 03-F30 **Two layers, strictly separated.** A **`DocumentSpec`** is vendor-authored, versioned, shipped as code under CODEOWNERS: an ordered list of typed blocks, one spec per document type. A **`DocumentProfile`** is org/branch config — a flat `slot_id → value` map, Zod-schemad and `config.changed`-audited (14-F2) — which **cannot express position, order, font or structure**. It can only fill holes the spec declared and flip toggles the spec declared. Render is a pure function: `render(Spec@v, Profile, Data, PrinterCaps, FiscalBlock?) → blocks → bytes`.
  - Rationale, in order of weight: (a) a slot space is **property-testable in full** — the entire customisation space can be generated and asserted over, which no surveyed vendor can do; (b) an owner can lose a *slot*, never a *layout*, which shrinks migration by an order of magnitude; (c) `00 §7`'s "presets, not knobs" — a slot value inside a vendor layout is a preset with a hole, a template is free-form configuration. **No POS vendor surveyed ships a WYSIWYG thermal editor**; even the best "visual editor" only reorders predefined blocks.
  - **Purity is a testable law:** identical `(spec, profile, data, caps)` must produce byte-identical output on Electron and React Native. A shipped competitor emits different tickets for the same order on two of its own devices.
- 03-F31 **Document types are first-class entities, never a flag on a printer.** Each declares its own data contract, spec, invariants and render-mode policy: `kot`, `receipt`, `bill` (**blocked pending DEC-TAX-001**), `refund_slip`, `shift_close_slip`, `rider_settlement_slip`, `day_summary`, `test_page`. Structural differences live in the TYPE, not in config: price presence, default font scale, station filtering, one-item-vs-whole-order, course/seat grouping, modifier emphasis, void marker, max-lines-per-chit, reprint marker.
  - The evidence for type-not-knob: owner demand for kitchen-ticket font size is genuinely **bidirectional** — chits want larger, cup labels want smaller, both correct. A knob resolves that wrongly for one of them forever.
- 03-F32 **Type invariants override configuration.** A `kot` renders **no money token** under any profile; a fiscal block cannot be suppressed under any profile. This is enforced structurally — the profile schema has no slot id addressing them — not by a runtime check on a value the owner supplied. The deepest POS in the market has **no price option anywhere** in its kitchen-printer configuration: prices are simply not in the chit data model.
- 03-F33 **Region model.** Blocks carry exactly one region: `HEAD_LOCKED → HEAD_OWNER → BODY → TOTALS → FISCAL_LOCKED → FOOT_OWNER → TAIL_LOCKED`. Owner content is legal only **outside** the regulated block, which is what every strict-fiscal jurisdiction already does. `FISCAL_LOCKED` blocks are **not in the `DocumentSpec` at all** — they are injected at render by the certified authority adapter (16-F23), which declares the block **and its position**, because some authorities mandate field sets only and others mandate order.
- 03-F34 **Enforce at render; validate at save only for feedback.** Before bytes reach the spooler: assert every adapter-declared mandatory block is present, that the QR's computed physical size meets the adapter's declared minimum for the target dpi, and that no owner slot rendered inside a locked region. Failure is a **hard refusal to print plus an S1 band** (27-F11d), never a silent degradation. Save-time linting must never be able to block saving — a shipped competitor's linter left merchants unable to save **the vendor's own default template**, so *"the shipped default always validates and always saves"* is a named test.
- 03-F35 **The fiscal QR is always rasterised, never the native ESC/POS QR command.** Cheap printers report no QR capability and **fail silently** — printing nothing, or printing the raw payload as text. For a QR whose absence is an offence that can seal the premises, a silent no-op is the worst available failure mode. Size is computed from `dpi`; treat 7×7 mm as a legal floor and render 18–25 mm (FBR's own technical spec asks ~0.7–1.0 inch, ~2.5× the SRO figure). **The fiscal invoice number is an opaque token** — never parsed, reconstructed or shape-validated, because FBR's own documents give three different formats.
- 03-F36 **Every DocumentSpec must render correctly at `columns = 32`** (the 58 mm floor) — a build-time test, not a review convention. Degradation is declared per block, in order: full `left | right` → the block's declared `short` form → omit the label and keep the number → wrap to two rows. **Banned:** absolute dot positioning (an `x=384` offset is mid-line at 576 dots and off-paper at 384), and space-as-layout (it makes a document permanently unreflowable).
- 03-F37 **Reprint markers are mandatory per type, in a locked region.** 03-F3 gives the KOT a REPRINT band; the receipt currently logs the event (02-F16) and prints nothing. Reprints are already a named fraud vector — the paper must say so.
- 03-F38 **Long item names are a CATALOG problem, not a template one.** Add a short `kitchen_name` to the 01-F21 catalog chain, editable in back office, falling back to the display name. This is the most-requested workaround in competitor communities and it is a one-field change rather than a template feature.
- 03-F39 **`max_lines_per_chit` is declarative pagination policy**, because a template cannot know its own output length. Owner-settable per printer.

**Device mechanics (these are the failure modes the renderer cannot see — all three would otherwise ship)**

- 03-F40 **Paper-out is detected with the real-time `DLE EOT 4`, never `GS r`.** On the entire TM-T88 family and its peers (T88IV–VII, T82II, T70II, T90, L90) the paper-end sensor takes the printer **offline, and it then does not execute `GS r` at all** — so a health check built on `GS r` reports **"paper present" forever** and a paper-out becomes a silent KOT failure. Real-time commands are answered while offline by design. The two commands also use **incompatible bit layouts for the same sensor** (`DLE EOT 4`: bits 2,3 near-end / 5,6 out; `GS r 1`: bits 0,1 / 2,3), so `packages/escpos` must never decode one with the other's map. A **near-end** sensor is not universal (the TM-T88VII lists paper-end + cover-open only) — model-gate the feature from the 03-F10 capability record rather than assuming it. Cap outstanding real-time queries at **4**.
- 03-F41 **A stalled printer is holding the job, not dropping it — so `03-F4`'s retry must not fire.** `ESC c 4`: on paper-end the printer *"stops after the current printing completes"*, goes offline and **holds** until the roll is replaced; on most deployed models the sensor cannot even be disabled. Therefore the spooler distinguishes **`transmitting, printer stalled`** from **`failed`**, and **a stall never counts toward the 3-attempt budget and never re-transmits.** A timeout that flips a stall to `failed` and retries **double-prints the instant the roll is loaded** — a duplicate KOT is a real kitchen error, not a cosmetic one. Recovery from a recoverable/cutter error is `DLE ENQ n=2`. The cheap-printer wedge that needs a power cycle is the degenerate case, not the model.
- 03-F42 **A document is rendered whole, buffered, and transmitted as one unit.** With cut reservation, *"if data is interrupted for two seconds or more, the printer automatically feeds to the reserved cut position and cuts"* — so **a chunked or streaming renderer that stalls >2 s mid-ticket gets its ticket cut in half.** No I/O wait may be interleaved inside a document. (Reservations are also cleared by reset, power-off, buffer clear or a feed-button press.) Related: a real-time byte sequence occurring **inside raster data** is executed as a command and corrupts the image unless disabled via `GS ( D`.
- 03-F43 **Printers are sited at the pass or on a wall, never at the range** — an installation requirement with a spec consequence. Above **45 °C every deployed printer is out of its operating envelope**, and at **60 °C thermal paper self-blackens spontaneously** (manufacturer-stated; the ~100 °C figure quoted by secondary sources is the melt regime and is **wrong for a kitchen**). Prolonged exposure above **40 °C** degrades the media. Star Micronics explicitly recommends **impact** printers for hot kitchens; **we decline that trade** — impact costs the raster path (so no Urdu, no icons), reliable solid-fill inversion, and **14× the print time** (a 10-line KOT at ~2,130 ms vs ~150 ms). A station genuinely too hot for a printer gets a **screen or a runner**, not an impact printer.
- 03-F44 **Paper is never a record; the ledger is (01-F1).** A thermal image is destroyed by cooking oil, alcohol/hand sanitiser, esters and ketones, **human sweat**, PVC or plasticiser contact, and adhesive tape — and is **developed by a fingernail** (frictional heat). Heat plus humidity together is many times worse than either alone. No flow may require a printed document to be readable later to recover state; plan printed image life at **5 years** for the 48 GSM stock actually sold in Pakistan, and unprinted roll shelf life at **2 years**.
- 03-F45 **Consumables are procured by metres and GSM, and checked on receipt.** The international "80×80" convention **does not exist as a SKU in Pakistan**, and the market is ~exclusively **48 GSM** (≈52 µm; µm ≈ GSM × 1.09). Short rolls are a live risk — the same nominal SKU ranges **2.6× in price** on one marketplace in one day, and a listing sells *"80 mm × 40 **Yards**"* (a 8.5% shortfall hidden in the unit). A **vernier caliper is a sufficient goods-inwards test**: at 0.80 packing on a 12 mm core a genuine roll measures ≈ 59 mm OD at 40 m, 65 at 50 m, 74 at 65 m. Paper prices rose ~20%/yr for five years, so **every PKR figure in this corpus carries a review date**. BPA transfer to skin is ~10× higher onto wet or greasy fingers — which describes a kitchen line, not the cashier the EU limit was written for — and **no Pakistani regulator enforces it**, so BPA-free is a *purchasing requirement with supplier documentation* (14) or it is nothing.

## 4. Key flows

**Confirm → multi-printer KOT (happy + failure)**
1. `order.confirmed` arrives (LAN fast path) → routing resolves grill + Chinese printers → 2 jobs persisted → both print < 2 s from confirm.
2. Failure: grill printer offline → 3 retries fail → loud alert on the counter device + `kot.print_failed` → manager console alarm (doc 05) → operator reroutes the job to the Chinese printer (03-F6) or fixes the cable and reprints → every step logged.

**Cross-station assembly (T3)**
1. Order with grill + tandoor + fryer lines confirms → each station screen shows only its lines.
2. Grill bumps → pass shows "1 of 3 ready"; tandoor bumps → "2 of 3, waiting on fryer"; fryer bumps → card fully ready → the ready-signal owner marks the order ready → waiter notification fires (doc 04).

**Ready-mark trains the pipeline**
1. Pass marks a karahi line ready 14 min after confirm during rush → sample lands cloud-side on next sync → nightly job updates the `karahi × rush` cell → the cell crosses 30 samples with acceptable spread → `eta.estimates_published` → storefront (doc 06) begins quoting. Nothing changed for kitchen staff at any point.

**Plug-pull mid-print**
1. Power cut while a KOT is printing → on restart the spooler finds the job not in `printed` → reprints it marked "REPRINT" → no order lost (00 §4 durability protocol).

**Printer swap**
1. A printer dies permanently → replacement attached → layer-3 assignment updated on-device → test harness one-tap verification page → routing resumes; no cloud round-trip required.

## 5. Data

- **Owned (device-local):** `print_jobs` (durable spool: payload, printer, attempts, state), printer registry + live status, station map cache.
- **Owned (cloud read models):** `prep_time_samples`, `eta_estimates` (per item × segment × branch, versioned), printer compatibility list.
- **Emitted:**
  - `kot.printed / reprint_requested / print_failed`
  - `order.line_state_changed` (ready-marks, bumps, served)
  - `availability.changed` (pass toggle)
  - `cash.drawer_opened` (kick execution; POS-attributed)
  - `audit.*` (alert acknowledgments, reroutes, harness runs)
- **Extensions to 01 §4 introduced by this doc:** `printer.status_changed`, `eta.estimates_published`.
- **Consumed:** `order.created / confirmed / line_added / note_added / line_state_changed`, `availability.changed`, receipt job requests (doc 02).

## 6. Non-functional requirements (module-specific)

- 03-N1 Confirm → first byte at printer < 2 s (00 §5.3) with 3 routed printers in the fan-out.
- 03-N2 Spool durability: plug-pull mid-print never loses a job (00 §4 protocol); spool writes sit inside the same durability envelope as order events (01-F2).
- 03-N3 Print-failure alert raised ≤ 10 s after final retry exhaustion; alert audible at kitchen noise levels (device at max volume, tone chosen for cut-through).
- 03-N4 Pass/KDS render an incoming state change < 1 s over LAN (01-F15); a queue of 40 open orders scrolls without dropped input on the 2–3 GB reference tablet.
- 03-N5 Pipeline jobs never touch the serving path: estimation runs cloud-side only; a branch fully offline for a week keeps printing, marking ready, and buffering samples locally.

## 7. Customizability

- **Layer 2 (org):** category→printer routing, station map, KDS-vs-printer per station, aging thresholds X/Y per order type, ready-signal ownership, rush threshold, course grouping on/off, retry count/window, assembly buffer minutes.
- **Layer 3 (branch/device):** printer assignments + **printer capability profile**, station identity, alert tone/volume, recall-strip length. **"Paper width" as a `58 | 80` enum is WITHDRAWN (July 2026) — it silently truncates the PRICE column.** The folklore that 80 mm means 42 or 48 columns is wrong twice over: 42-vs-48 is a *resolution* difference, not a font one, and there is a third value — a TH230 at 576 dots gives **44** Font-A columns while a TM-P80 at the same 576 dots gives 42 and a TM-T20II gives 48. Layout is therefore expressed in **columns**, derived as `print_dots ÷ font_cell_dots` (Font A = 12, Font B = 9) from a per-model capability record `{model_id, dots, dpi, cols_font_a, cols_font_b, has_native_qr, has_cutter, raster_ok}`, seeded from a shipped table, defaulting **conservatively to 32** for an unknown model, with a technician override in the 03-F10 test harness (which already maintains the compatibility list). Millimetres are used only where a regulator specifies mm — the fiscal QR.
- **Deliberately not configurable:** disabling print-failure alerts (never), any form of system-dictated cook order (never), sample capture (always on — it is a pure side-effect), the confidence-gate floor (platform layer only).

## 8. Tech notes

- `packages/escpos`: pure-TS encoder; transports — Electron main via node-usb/serial + net sockets; RN via a BT SPP/BLE module + TCP. Logos and QR codes rasterized at the target dot width and cached.
- The spooler is a plain SQLite table + state machine in the POS host process. In T2 default the counter prints for the branch; the service can run on any device with attached printers (layer 3) — the pass tablet never needs to own printers.
- Pass and KDS are one Expo app with a mode switch (pass vs station) — one codebase, one update channel (doc 15).
- Estimation job = SQL over the events read model + a small TS job; no ML dependency at this rung of the autonomy ladder (concept §4.6).
- The physical printer rig (00 §4) gates releases: a `packages/escpos` change that fails the rig's soak test does not ship.

## 9. Open questions

1. BLE printer reliability in the field vs SPP — harness data decides the default transport ranking per printer model.
2. Bump granularity: per-line vs whole-station-ticket un-bump semantics under heavy modifier use.
3. Should ETA cells segment by variant (or modifier count) where sample volume allows — decide from pilot sample density.
4. Whether the pass gets a dedicated expo-printer option (pass-side summary/sticker print) — pull from pilot demand.
5. Aging-timer basis for scheduled/pre-orders (doc 06 future) — confirm-time basis breaks for orders placed hours ahead; likely needs a `fire_at` concept before doc 06 ships pre-orders.
