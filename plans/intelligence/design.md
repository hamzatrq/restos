# Intelligence — design and build plan

**Owning spec:** `specs/13-intelligence.md`. Consumers: `specs/12-owner-app.md` (brief, alerts,
analyst UI), `07-F12`/`07-F13` (WhatsApp transport), `14-F21`/`14-F22` (config), `15-F5`/`15-F24`
(rung cap, cost metering). Planning only; no code, no spec edited.

**Every number below is a dated measurement, not a fact (`L1`).** All measured 2026-08-24 against
`main` unless stated. Re-derive before quoting.

⚠ **Notation, because two id spaces collide.** A bare `R<n>` is a **founder ruling** from
`plans/saas-pivot/plan-of-record.md` §0. Doc 13's autonomy ladder also names its four rungs R1–R4,
so those are always written **`rung R1`**..**`rung R4`** here. `13-F20`..`13-F27` use the bare form;
read them as rungs.

---

## 0. The verdict

The ledger this module reads is real and good — 41 event types carry payload schemas and a whole
service day has been run through them end to end. **The AI layer is not blocked on models. It is
blocked on three things, in this order: a semantic layer that does not exist as a package, a
surface that does not exist for two of its three outputs, and a kernel rule that makes its own
event family unemittable.** Nothing in doc 13 can persist anything today: `packages/domain` ships
**zero** payload schemas for the ten event types doc 13 declares (`brief.generated`,
`alert.raised/acknowledged`, `suggestion.issued`, `action.proposed/approved/rejected/executed/
reversed`, `autonomy.rung_changed`), and `01-F4` makes a catalogued type with no schema
**unemittable rather than merely unbuilt**.

The good news is larger than the bad. **The first two slices of this module need no LLM, no new
event type, no new permission action and no spec act at all** — and one of them is already half
written in `services/api/src/summary.ts`.

---

## 1. What the data actually supports — measured, not estimated

`packages/domain/src/registry.ts` holds **34 fold-consumed payload schemas plus 7 `audit.*`
subtypes = 41 event types** (counted as top-level keys in `payloadSchemas` and
`auditPayloadSchemas`, 2026-08-24). `services/sync-gateway/src/schema.ts` holds **15 tables**, of
which `kernel.events` is the raw merged branch ledger and `kernel.org_events` the org-scoped one.
**There are no `01-F7` per-module read models.** `services/api` folds a business day on demand out
of raw events (`ledger.ts` → `summary.ts`) and that fold is the only projection over the ledger
anywhere on the cloud plane.

### 1.1 Answerable TODAY, from events that ship and have producers

| # | Question | Source events | Notes |
|---|---|---|---|
| 1 | Sales, order count, by channel, hourly curve | `order.settlement_closed.billed_paisa` | Already folded in `summary.ts`; tax-inclusive and attested (`01-F63`, R54) |
| 2 | Top items by revenue (menu mix, pre-tax) | `order.line_added`, `order.line_state_changed` | Does **not** tile with sales — the attestation is per order and has no per-item share. Already labelled as such |
| 3 | Voids / comps / discounts: count, value, **by whom and approved by whom** | `void/comp/discount.recorded` + `approval.*` | Actor on the envelope, approver in the payload (`02-F41`) |
| 4 | Cash over/short per cashier per shift | `shift.opened/closed`, `cash.*` | `shift-cash.ts` fold; R72's whole-drawer convention |
| 5 | No-sale drawer opens | `audit.drawer_opened`, `cash.drawer_opened` | |
| 6 | Price overrides | `order.line_price_overridden` | |
| 7 | Refunds | `payment.refunded` | Carries two idempotency keys (`01-F29`) |
| 8 | Kitchen timing: rung→ready, ready→served | `order.line_state_changed` | `apps/pass-kds` emits **both** edges; the "T1-only, no samples" claim in `summary.ts`'s omission table is already corrected there |
| 9 | Print failures per printer per branch | `kot.print_failed`, `printer.status_changed` | |
| 10 | Ledger honesty: divergences, provisional stamps, unsettled orders | `01-F31` registers | `summary.ts` computes these today and calls them facts, **not alerts** |
| 11 | Repeat callers, by phone | `customer.created`, `customer.address_added` | ⚠ **The brief for this plan says no surface consumes these. It is stale.** `apps/pos-electron/src/main/gateway.ts:1065` and `:1080` emit both, `02-F47` gates them, `packages/sync-client/src/folds/customer-file.ts` folds them |

That is **four of `13-F10`'s six detectors** (voids/comps/discounts value and count, cash
over/short, no-sale opens) and the whole of `12-F10`'s answerable summary. `summary.ts`'s own
omission table records the same arithmetic and was corrected to it on 2026-08-24.

### 1.2 Needs inventory (doc 10 — designed in `plans/inventory/design.md`, unbuilt)

Food cost, gross margin, item profitability (`12-F19`), stock variance after a count, supplier
price spikes, wastage, par levels, reorder, prep forecasts. **That is the other 2 of `13-F10`'s 6
detectors and 2 of the ladder's 4 tracks (`stock`, `prep`).** The blocker is precise and small:
`stock.purchase_recorded`, `stock.wastage_recorded` and `stock.count_recorded` have no payload
schema, and writing those three is slice 1 of the inventory plan.

⚠ **`13-F5`'s `margin.gross_estimate` precondition (recipe coverage ≥ 60% of period revenue) is
overruled by R76 and its amendment is A15, owned by the inventory plan.** This module must not
write a second one, and must not ship a metric whose precondition defends the overruled rule —
that is `catalog-pricing.test.ts:394` exactly (`L3`).

### 1.3 Needs customer history — **the CRM plan owns the model; this is what I need FROM it**

Repeat rate, lapse, cohorts, "who has not come back", campaign lift, LTV. I design no customer
model. Four requirements, stated so they land in the CRM design rather than here:

1. **A stable customer key.** Today it is E.164, normalized at the writer
   (`apps/pos-electron/src/main/customer-phone.ts`, which states in its own header why the
   normalizer is not in `packages/domain`). Whatever CRM rules, one key.
2. **An order→customer link.** `order.created` carries none. The inventory plan's **A8** already
   proposes an optional `customer_phone_e164` on `order.created` and hands the call to doc 02.
   **Without it, every customer metric in this module is uncomputable — not imprecise,
   uncomputable.**
3. **A fold-safe identity merge.** `customer.merged` is `01 §4` vocabulary with no schema. Two rows
   for one human make every repeat metric wrong in a way **no `13-F5` precondition can detect**,
   because the data looks complete. This is the one CRM requirement that is mine rather than
   marketing's: a merge whose result depends on delivery order breaks law 1 in a projected value.
4. **A consent state readable at query time**, so an analyst answer naming a person is legal to
   produce and a campaign metric can exclude opted-out customers.

### 1.4 Needs months of data, regardless of what we build

Every `13-F11` baseline (`13-F12`: ≥ 20 completed shifts for a cashier, ≥ 28 business days for
branch/item), every `13-F22`/`13-F24`/`13-F25` unlock criterion (8 weeks of sales, 4 weeks of
aging, 20 trailing proposals), weekday seasonality, and `10-F25`'s trailing averages. **`10-F24` is
the house rule and it applies verbatim: below minimum history the surface says "not enough data
yet" and shows what it needs.** A pilot opening in month 1 sees threshold rules and nothing else
for a month, and the screen must say so.

### 1.5 Structurally impossible today, however much history accrues

Labour cost and staff productivity (doc 11 unbuilt), delivery economics (doc 09), aggregator
commission and channel economics (`12-F19`; R60 puts commission rates on a layer-2 config plane
that does not exist), storefront and WhatsApp channel mix (`apps/storefront`, `services/whatsapp`
are 1-file stubs). **`12-F19`'s three launch reports: one is buildable (branch comparison, on the
metrics in §1.1), one needs inventory (item profitability), one needs a config plane that is not
built (channel economics).**

---

## 2. The model — five organs, and which of them are real

Doc 13 §1 names five parts. They are not peers, and the plan's whole shape follows from ranking
them by what each needs:

```
                 the ledger (real, 41 types)
                          │
        ┌─────────────────▼──────────────────┐
   ①    │  SEMANTIC LAYER — packages/metrics │   no LLM. no events. no new actions.
        │  id · version · unit · dimensions  │   this is the module.
        │  precondition · golden fixtures    │
        └────┬───────────────┬───────────────┘
             │               │
      ┌──────▼─────┐   ┌─────▼──────┐
 ②    │ DETECTORS  │   │  ③ NARRATOR│  ← the ONLY organ that touches an LLM
      │ pure fns   │   │  gateway   │     and it never sees a ledger row
      └──────┬─────┘   └─────┬──────┘
             │               │
        ┌────▼───────────────▼────┐
   ④    │      SURFACES           │  back office (48 files, ships) ·
        │  render + cite + refuse │  owner app (1 file) · WhatsApp (1 file)
        └────┬────────────────────┘
             │
   ⑤    ┌────▼────┐
        │ LADDER  │  ← blocked on the kernel AND on inventory. Deferred.
        └─────────┘
```

**Organ ① is the product.** Everything else is a renderer over it. A metric is code with an id, a
version, a unit, typed dimensions, a minimum-data precondition and golden fixtures (`13-F1`..
`13-F5`); a metric without golden tests cannot be registered, enforced at build time (`13-F3`).

**It must be a package, not a service, and `18 §2` decides that rather than taste.** `services →
packages` only, never `services → services`. Both `services/api` (which renders the summary today)
and `services/intelligence` must compute the same number, because `12-F12` and `12-F21` require
brief and screen to be incapable of disagreeing. The Auditor already paid this exact bill:
`DEC-ARCH-001` moved it from `services/sync-gateway` to `packages/auditor` for the same reason.
**So: `packages/metrics`, and `services/api/src/summary.ts`'s fold is its first member, moved.**

**Organ ③ is the one that can lie, and it is deliberately the smallest.** The narrator receives
`MetricResult[]` and writes connective English. It has no database handle, no SQL, no ledger row
and no free text from the store. This is design law 6 restated as an *interface*, not a policy:
there is no code path from free text to query text (`13-F4`), because the function that builds the
prompt takes a typed array and nothing else.


---

## 3. Citations — the difference between an analyst and a plausible liar

`13-F7` and `13-F16` require a validator; `10-F25` requires every forecast number to cite its
basis. **Both are usually built as a check on the model's output, and that is the wrong end.** The
requirement is not "the model cites"; it is **the model cannot produce a number at all**. Four
structural gates, each of which must fail closed, plus one that catches what they miss.

**Gate 1 — no number enters the prompt except as a metric result.** The narration call's user
content is a JSON array of `{metric_id, version, params, value, unit}` and a task string. There is
no ledger row, no SQL, no row count, no "here is the day's data". `18 §3` already requires every
runtime boundary — LLM output explicitly named — to parse with Zod before touching typed code;
this adds the mirror rule on the way *in*.

**Gate 2 — the tool surface is the registry, and it is `strict`.** Metric selection is tool use
with `strict: true` (top-level on the tool definition, with `additionalProperties: false` and
`required`), so `tool_use.input` validates exactly against the schema. Dimension values — branch
ids, cashier ids, item ids — are then checked against org-scoped whitelists on our side, after
`JSON.parse` (never string-matching the serialized input: current models vary JSON escaping in
tool inputs). An unknown dimension value is a refusal, not a clamp.

**Gate 3 — the post-generation numeric validator, and three traps that make it vacuous or
blocking.** It extracts every numeral from the draft and requires each to be present in the
executed set.
- **Rendered form ≠ stored form.** The value is paisa; the sentence says `Rs 12,340`. A validator
  comparing digit strings passes `1234000` and rejects `12,340`. It must compare **through the same
  renderer the screen uses** (`rupeesFromPaisa` / `MoneyValue`), or it is either vacuous or it
  blocks every correct brief — and `L10` records three tests in one round that stayed RED under a
  correct implementation, which is as damaging as a vacuous one.
- **Derived numbers.** *"sales were up 12%"* is a number no metric produced. Either the ratio is
  itself a registered metric with its own id and version, or the sentence is illegal. **Register
  the ratio; never teach the validator arithmetic** — an arithmetic-aware validator is a second
  implementation of the semantic layer, and `03-F40`'s two-interpretations defect is this repo's
  own worked example of what two implementations of one quantity cost.
- **It must be MUTATED, not read.** `L10` is the standing requirement: build a narrator out of tree
  that invents exactly one plausible number, take the suite green, then confirm *that* assertion
  reddens — with a **control** narrator differing in one branch, or the kill count proves nothing
  about attribution. Report the numbers. A claim that the validator bites is not evidence that it
  does; this repo has five suites that failed exactly this way in one round.

**Gate 4 — citations are attached by the pipeline, never written by the model.** `13-F16` says
answers *carry* citations and does not say who attaches them; that is the whole difference. The
answer is `{text, citations: MetricResult[]}` — the same array the narrator was given — rendered
as tappable chips (`12-F23`) and as footnote lines on WhatsApp (`07-F13`). A citation the model
wrote in prose is a claim. A citation the pipeline attached is a record.

**Gate 5 — `insufficient_data` is a return type, not an exception, and it says what is missing.**
`13-F5` requires a typed result with a reason; R76 makes the reason **actionable** (*"food cost
unavailable — 14 items need a price"*, and tappable) rather than merely absent. This is the one
place the corpus already has a shipped mechanism worth copying rather than inventing:

> `services/api/src/summary.ts`'s `OMISSIONS` list travels **with the answer** and the screen
> renders it, because "a screen that renders only what it received cannot tell an owner what is
> missing, and an owner who does not know that voids are unmeasured will read their absence as *no
> voids*."

And the half of that mechanism that matters more: **every omission declares its premises as data,
and `__acceptance__/omission-premises.test.ts` evaluates them against `@restos/domain` on every
run, so a premise that stops holding is a RED test rather than a wrong sentence.** That table has
already gone stale twice — an entry told an owner her kitchen produced no timing samples after the
emitter shipped, and another said voids were unmeasured the day their schemas landed — and
**both were found by a human comparing a screen against the ledger; no suite could see either,
because the claim was in a string.** Every `13-F5` precondition this module writes gets the same
executable premise. That is not polish; it is the only thing standing between R76's honesty rule
and a screen that lies politely.

---

## 4. Where the model runs, and what leaves the building

### 4.1 What the corpus RULES

- **`22-F12`'s vendor data-flow map is normative and already carries the row:** *Anthropic (LLM
  API) — "Aggregated metrics + brief/analyst text via doc 13 semantic layer. No raw customer file;
  injection-filtered (`20 §2.13`)."* Widening that flow requires a PR to that table. Nothing here
  widens it.
- **`13-N5`:** prompts never include customer phone numbers or PII beyond first names; org
  isolation is enforced at the gateway and covered by the injection evals.
- **`13-F18`:** org id and user scope come from the authenticated session, never from model output
  — cross-org access is structurally impossible at the gateway.
- **`18 §5` / `18 §14`:** `@anthropic-ai/sdk` is the one allowlisted official SDK, named for this
  module. No `§15` dependency event.
- **`20 §2.13`:** the injection corpus is a release gate — *"order notes and customer names
  containing instructions must never reach metric execution"* — and an eval regression blocks
  deploy of this service.
- **`00 §5.4` / `01-F71`:** org isolation is absolute.

**So the design law is not "minimize" — it is: the ledger never leaves.** Only registered metric
outputs, their labels, and the owner's own question cross the boundary. That is assertable rather
than promised, and it is the same shape as `services/api` holding no database handle: the gateway's
request builder takes `(MetricResult[], task, conversation)` and has no other input, so a caller
cannot hand it a row. **Write that assertion by hand** — `seams:check` cannot see it (`L8`: "a port
supplied with a stub"; measured on the publish adapter, `verify` exit 0 and no menu reaches any
till).

### 4.2 What the corpus is SILENT on — four holes, none of them decidable here

1. **The owner's own question text.** `13-F15` accepts uncontrolled input by design; `13-N5`
   constrains what *we* put in a prompt and says nothing about what the *user* types. A real
   owner's real question is *"why is Bilal's till always short"* — a named accusation about an
   employee, which then sits in a vendor's logs and in our own `llm_call_log` (`13-F30`) forever.
   **This is a founder decision, not an engineering one (decision 5).**
2. **User content as a dimension label.** Item names and order notes are Unicode user content
   (commandment 7) and reach the model as metric labels — `طاہر کا خاص`, a note carrying a
   customer's name. `20 §2.13` treats that text as an *attack surface*; nothing treats it as a
   *disclosure surface*.
3. **Retention at the vendor, and our own.** `22-F13`'s retention matrix has **no row** for
   `llm_call_log` or for prompts held by a vendor. It also interacts with a model-availability
   fact worth knowing before the tier table is written: Claude Fable 5 is unavailable under zero
   data retention, so a future ZDR requirement constrains `13-F31`'s routing.
4. **Residency.** `22-F12` itself says Pakistan cross-border transfer law must be verified before
   the first production org, and **the LLM flow is the one that leaves the region by
   construction**. The lever that exists is `inference_geo` on the request, which pins where
   inference runs and reports it back in `usage.inference_geo`. Named as the lever; this document
   asserts no legal conclusion, exactly as `22-F12` does not.

### 4.3 Local models — refused, with the reason

Not because they are bad. Because `13-F31` puts model choice in a routing table decided at build
time, `18 §14` allowlists one SDK, and a self-hosted model is an infrastructure project R42 has
already refused once. **The honest cost of the refusal is §4.2's four holes: they exist precisely
because inference is remote.** If any of them is answered "must not leave Pakistan", that is the
trigger to reopen this, and it is a business decision with an infrastructure bill attached, not a
design preference.

---

## 5. Which plane, and what it costs

### 5.1 Plane

Doc 13 is **cloud only, no UI of its own** (`13 §1`). Commandment 5 is satisfied trivially for
organs ①–③: they are server-side, and every surface reaching them is a cloud screen on tRPC +
TanStack Query. `services/intelligence` runs inside the modular Node backend (`00 §3`, no
microservice split); scheduled work is a **BullMQ repeatable** (`18 §5` verbatim: *"Scheduled work
(nightly brief) uses BullMQ repeatables — no OS cron"*), and `services/jobs` is the host that
already proves that pattern for the Auditor and the per-tenant backup. **The nightly brief is a
third queue on that existing process, not a fourth service.**

**Authorization needs no new action.** The analyst and the brief are reads; `report.sales_view`
exists, `can()` gates it, and `reportScope` narrows which branches an answer may cover — already
mutation-tested in `summary.test.ts`'s `SCOPE MUTANT`. `services/api` refuses at boot to host a
procedure built without `authorized(...)`. **Slices 0–2 mint zero permission actions.**

**Entitlement:** `28-F6` holds the *intelligence rung cap* as a member of the entitlement record,
and `28-F3` / `28 §9.22` leave **undecided** what an absent record resolves that member to — while every
self-serve pilot is in exactly that state on day one (`28-F13` creates two records and no
entitlement record). Rung R1 (describe) must resolve to ON under an absent record or a pilot gets nothing.
That is doc 28's decision to take, not this module's, and it is named in §9.

### 5.2 Cost — the arithmetic, with its assumptions on the outside

Pricing as cached in the `claude-api` skill, 2026-06-24 (Claude API first-party rates, $/1M
tokens): Opus 5 `claude-opus-5` $5 / $25 · Sonnet 5 `claude-sonnet-5` $3 / $15 · Haiku 4.5
`claude-haiku-4-5` $1 / $5. Batch API is 50%. Cache reads are ~0.1× input. FX assumed **PKR
280/USD** — an assumption, not a measurement; re-check it. Revenue basis: **PKR 8,000 / branch /
month** (`restaurant-os.md:108`), single plan, and **R5 makes it flat with no metering build**, so
every rupee below comes out of that one number.

**Nightly brief, per branch per night.** Prompt ≈ 2,500 tok of stable system + metric definitions,
≈ 1,200 tok of computed metric values, ≈ 700 tok out.

| Tier | Standard | Batch (50%) | Per branch / month (30 nights, batch) | % of PKR 8,000 |
|---|---|---|---|---|
| Haiku 4.5 | $0.0072 | $0.0036 | **≈ PKR 30** | 0.4% |
| Sonnet 5 | $0.0216 | $0.0108 | **≈ PKR 91** | 1.1% |
| Opus 5 | $0.036 | $0.018 | **≈ PKR 151** | 1.9% |

At `13-N1`'s 200-org scale (≈ 280 branches) the whole fleet's briefs cost **$1.01/night on Haiku
batch**. The brief is not the cost problem.

⚠ **The batch discount may not be available to it.** `13-N1` requires brief generation to complete
*for every org within 30 minutes of its trigger*; the Batch API is asynchronous with no 30-minute
guarantee. **Either `13-N1` gives or the 50% does** — a real either/or, and it is cheap because the
undiscounted Haiku number is PKR 60/month.

**Analyst, per answer.** Two calls (plan, then narrate) sharing a cached ≈ 7,000-token prefix of
system + registry tool schemas; ≈ 1,850 tok of fresh input across both; ≈ 700 tok out.

| Tier | Per answer | 2 questions/day | 20 questions/day |
|---|---|---|---|
| Sonnet 5 | ≈ $0.020 | ≈ PKR 336/mo (4.2%) | ≈ PKR 3,360/mo (42%) |
| Opus 5 | ≈ $0.034 | ≈ PKR 571/mo (7.1%) | ≈ PKR 5,712/mo (**71%**) |

**That last cell is the finding.** Under a flat subscription with no metering (R5), a single
enthusiastic owner erases the margin on his own branch, and nothing in the product stops him.
`13-F30`'s per-org monthly budget with graceful degradation — *"numbers are never sacrificed; only
narration degrades"* — is therefore **load-bearing, not a nicety**, and it must ship in the same
slice as the analyst rather than after it.

**Caching has one trap worth writing down now.** The stable prefix is the registry's tool schemas;
the *volatile* part is the org's branch/cashier/item whitelists, which differ per tenant. Put the
whitelists before the last breakpoint and the cache hit rate is zero across the fleet while every
test still passes. Verify with `usage.cache_read_input_tokens`, not by reading the code.

### 5.3 `13-F31`'s routing table — a recommendation, dated

`13-F31` is right that task code names a **tier**, never a model id, and doc 13 §8 says to verify
the lineup at build time. Proposed tiers, against the 2026-06-24 lineup:

| Task | Tier | Why |
|---|---|---|
| Intent routing / classification | Haiku 4.5 | Cheapest, and a wrong route is recoverable |
| Analyst **planning** (metric + parameter selection) | **Opus 5**, adaptive thinking | The only correctness-critical LLM step; a wrong metric is a wrong answer with a correct-looking citation |
| Analyst **narration** | Sonnet 5 | Writes connective text around numbers it cannot change |
| Brief narration | Haiku 4.5 or Sonnet 5 | Same job, offline, 30-min budget |

Handle `stop_reason: "refusal"` on every call. An owner asking about suspected theft can trip a
safety classifier; the honest response is the refusal surfaced as a refusal, never a regenerated
answer and never a fabricated number.

`13-F29`'s single-gateway rule ("no other module may call the Claude API directly, lint-enforced")
is enforceable today with a ~20-line rail beside `seams:check`: no `@anthropic-ai/sdk` import
outside `services/intelligence/src/gateway/`, with `24-F14`'s empty-match protection so a rename
cannot silence it.


---

## 6. What agentic means here — the sharpest question, and it is a kernel question

An analyst that answers is a read. An agent that **acts** writes a permanent event under an actor
that is not a person (`01-F1`), and both of the corpus's assumptions break at once: `EventEnvelope`
assumes a device stamps it, and commandment 8 assumes a human is being authorized. Three separate
walls, and they are not the same wall.

### 6.1 Wall 1 — the envelope. And doc 13 is on the OTHER side of it from doc 05

`01-F62` fixes the org-scoped set at exactly five — `catalog.changed`, `device.registered`,
`device.revoked`, `user.changed`, `config.changed` — with the discriminant *"an event type is
org-scoped when its only legitimate emitter is the cloud plane"*. Everything else is branch-scoped
and needs `branch_id`, `branch_created_at` and `time_basis` **stamped at append by a device**.
`services/sync-gateway/src/org-events.ts:86` refuses any other type by name, and
`kernel.events.device_id` is `NOT NULL`, so a cloud-emitted branch event is not merely illegal —
it has nowhere to be written. `services/jobs/src/index.ts` hit this in production code and recorded
it: `alert.raised` *"is in the `01 §4` catalog but has no payload schema … and it is not one of
`01-F62`'s five org-scoped types — while a branch-scoped envelope needs a device to stamp it and
this is a cloud job with no device. That is `05-F28`'s trap exactly."*

**But doc 13's describe/prescribe events pass `01-F62`'s own test, and doc 05's approval events
fail it.** `brief.generated`, `alert.raised`, `alert.acknowledged`, `suggestion.issued` and
`autonomy.rung_changed` have **no legitimate device emitter at all** — they are produced by a cloud
service from a merged multi-branch ledger, and no fold on any till reads one. That is the
definition of org-scoped, not an exception to it.

This matters because `05-F29` rejected `05-F28`'s resolution (b) **on the kernel**, arguing that
letting the cloud emit *branch-scoped* events empties the discriminant so that *"every later 'can
the server just write it?' (doc 08 ingest, **doc 13 `action.executed`**, doc 09, doc 16) becomes a
judgement call instead of a decidable question"*. **Read precisely, that argument names
`action.executed` and does not reach the other five.** Admitting five types to the org-scoped SET
*applies* the discriminant; letting the cloud stamp a branch envelope *deletes* it. They are
opposite acts and only the second was refused.

Three consequences, and one live contradiction:

- **An alert is *about* a branch; it does not *belong to* one.** An org-scoped event carries
  `org_id` and no `branch_id`, so the branch is a **payload** fact. Precedent: `catalog.changed` is
  org-scoped and its payload names branches. `01-F62`'s own clause — *"it never enters a branch
  stream and no device folds it"* — is exactly right for an alert.
- ⚠ **An org-scoped record has no envelope, so it has no `id` and no `refs[]`.** Measured:
  `services/sync-gateway/src/org-events.ts:52`'s `OrgEvent` is
  `{org_id, type, actor_user_id, server_received_at, payload}` — no id, no `refs`, none of
  `00 §6`'s canonical envelope. So an alert has **nothing an ack can name**, and `01-F1`'s
  *"corrections are new linked events"* has no linking mechanism on this plane at all. The
  consequence is not fatal and the FR already anticipated it: `13-F14` requires a **dedupe key**,
  which becomes the alert's identity, carried in the payload and computed deterministically from
  (class, entities, window). `05-F30` is the precedent and its warning applies verbatim — prefer
  the **facts** to a composed id string, because a format change silently unmatches every historical
  ack in an append-only ledger.
- ⚠ **`12 §5` currently specifies something the kernel forbids and a shipped writer throws on.** It
  says the owner app *"does NOT run `sync-client` … **the server emits `alert.acknowledged` into
  the ledger on the owner's behalf**"*. `alert.acknowledged` is not one of the five;
  `appendOrgEvent` raises a `RangeError` on it today. Under R49 the owner app is a **browser**, so
  the acknowledging emitter is the cloud plane and org-scoped is the coherent answer — but until
  `01-F62` is amended, `12-F17` is unbuildable, not merely unbuilt. Same shape as `05-F7`'s three
  payload schemas before August 2026.

### 6.2 Wall 2 — `action.executed`'s domain twin, which no amendment above reaches

`13 §2` requires an autonomous action to *additionally* emit the ordinary domain event: an auto-86
emits `availability.changed`, an auto-pause emits doc 05/06's channel event, an auto-PO emits a doc
10 event. **Every one of those is branch-scoped.** No amendment to the org-scoped set makes them
emittable from the cloud, and `05-F29`'s rejection of (b) stands squarely in front of the only
thing that would. **Rungs R3 and R4 are blocked on the kernel, not on data.**

### 6.3 Wall 3 — the actor. There is no service principal, and inventing one is not free

`AuthSubject` is `{user_id: string, org_id, assignments}`. `ROLES` is closed at four —
`cashier`, `branch_manager`, `storekeeper`, `owner` — and the verdict matrix is
`Record<Role, …>`, deliberately exhaustive so that *"adding a fifth column will not compile until
every row states its cell"*. `can()` fails closed on an unknown action. `13 §2`'s "`actor_user_id`
= the service principal" names something that does not exist, and the corpus already has a case
where its absence cost a ledger record: `14-F30` records `device.registered` as **deliberately
unemitted for want of an authenticated actor**.

Three shapes, all with real costs:

| | Shape | Cost |
|---|---|---|
| (a) | A user row for the service, with an owner-ish assignment | Cheapest in code, worst in the ledger. `02-F41` — *"attribution is whoever's PIN is in, with no 'acting for' concept"* — then names a robot as a person, permanently (`01-F1`), and every audit query special-cases it. Also hands a standing owner-scope credential to a cloud process |
| (b) | A fifth `system` role with its own Appendix A column | A `packages/domain` protected-path change. The exhaustive `Record<Role,…>` forces ~24 explicit answers to *"may the robot do this?"*, which is the **good** part. Costs a spec act on Appendix A and doc 14 |
| (c) | `actor_user_id: null` plus a separate `agent` field on the envelope | Most honest, most expensive: a kernel change to the envelope, touching every reader |

### 6.4 The recommendation: **the agent never writes to the ledger, and it does not need to**

`05-F32` (R48) already ruled this shape one module over, on a measurement: a browser decision
arriving with no PIN forces either an unverified approver on a money path (commandment 8) or the
cloud becoming a credential verifier. **The same reasoning transfers without a single new
argument**, and it gives a design that needs *none* of (a), (b) or (c):

> **The cloud PROPOSES and RENDERS; the device DECIDES and WRITES, under the operator's own
> credential; `refs[]` links the two.**

- `action.proposed` becomes a **sixth** org-scoped type. B1 lists five because slices 0–3 do not
  need it; admitting a sixth is the same act on the same discriminant, and — this is the load-
  bearing part — **it does not drag `action.executed` with it** (§6.2), because the executing event
  is the human's own.
- The **act** happens on the surface that already owns it, under the human's own session: an 86 is
  `02-F46`'s existing toggle on the till, gated by `availability.toggle`, which already ships. The
  resulting `availability.changed` is **hers**, correctly stamped by her device, with `refs[]`
  pointing at the proposal.
- The ledger then reads *"this 86 was proposed by the intelligence service at 19:38 and done by
  Ayesha at 19:42"* — which is **more** informative than a service principal, and needs no new
  actor concept, no fifth role, no envelope change and no second credential.
- `13-F26`'s "reversible in one tap" is free: reversal is the human's own inverse act, already
  built.

**Rung R3 collapses into rung R2 plus an existing control. Rung R4 does not ship.** That is the
cost, and it is the marquee demo: no auto-86 on stockout, no auto-pause, no auto-reorder. Stated
plainly so it is a decision rather than a discovery.

**Two things this does NOT close**, named rather than smoothed over (`L11`):
1. It closes *"an agent needs a non-human actor"*. It does **not** close *"a cloud service may
   write anything at all"* — §6.1's five org-scoped types still require a doc-01 spec act on a
   protected path, and slices 0–2 are designed to need none of them.
2. It says nothing about a **proposal an owner never sees**. `13-F14a`'s rule — *no alert class
   fires without a delivery surface* — is the FR that forbids that, and §7's slicing is built
   around it.

---

## 7. R34 — what the giants ship, and what they only demo

**Borrowed: the three-position autonomy switch, the semantic layer, the conversational surface.
Invented: nothing. Refused: the agentic marketing.**

| Product | What it actually ships (2026) | What we take |
|---|---|---|
| **Square AI** (beta, bundled) | *Insight-only* conversational analytics — it answers, it does not act. Blends own sales data with weather/events/reviews. Pin-and-save insights, conversation history | **The scope.** The largest POS AI in the market by seller count is deliberately read-only, and says so. That is `13-F15`..`13-F19` and nothing below it |
| **Toast IQ / Sous Chef** (~164k locations) | Conversational co-pilot over reports; **does act** — creates menu items, 86s items, fixes shift clockouts from chat — inside the operator's own authenticated session | **The action model**: acting through the operator's own credential, not a robot's. That is exactly §6.4. Also R50's note that Toast wins conditioning stability by shipping **additively** |
| **Lightspeed AI** (launched Jan 2026, from the $69 Starter plan) | Conversational layer inside the POS; publicly stated to be *"set to evolve from an assistant to a more autonomous agent"* through 2026 | **The sequencing admission.** The newest entrant shipped the assistant and *announced* the agent. Nobody has shipped autonomous restaurant actions as a default |
| **Nory / agentic inventory vendors** | Auto-reorder within thresholds; the governance pattern is a **three-position setting per action type — Off / Approve / Autonomous** — with stock reorder allowed autonomous "within limits" while pricing stays on approve | **The switch itself.** Doc 13's four-rung ladder is this with two extra rungs; `13-F25`'s double gate (measured eligibility **and** explicit owner enablement + spend caps) is the market's own answer and is already specified correctly |

**The semantic layer is not a RestOS invention either, and the measured case for it is strong.**
dbt Labs' 2026 paired benchmark (11 questions from the ACME Insurance suite, 20 runs each, 15
tables): **Claude Sonnet 4.6 90.0% → 98.2%** and **GPT-5.3-Codex 84.1% → 100.0%** moving from
text-to-SQL to a semantic layer; on the full unrestricted suite, 64.5% → 72.7%. Its own summary is
the sentence this module is built on: *"With text-to-SQL, failure looks like a plausible but
incorrect answer. With the Semantic Layer, failure looks like an error message."* Named failure
modes of raw text-to-SQL: silent incorrect results, wrong joins, column-semantics
misinterpretation, and **numbers that differ subtly across runs** — the last being the one an owner
cannot possibly catch. Runtime prior art we are copying in shape: **Cube, dbt Semantic Layer,
AtScale, Looker/LookML**.

**What nobody ships, which is where RestOS is actually ahead:** an append-only event ledger under
the metrics. Every competitor's semantic layer sits on a mutable operational database, so "what did
this number look like last Tuesday" is unanswerable at the source. `01-F1` makes it answerable —
and `12-F13`'s "past summaries render from stored values, never recomputed" is the property that
only an event-sourced product can honestly offer.

Sources: [dbt](https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026) ·
[Lightspeed AI](https://www.lightspeedhq.com/news/lightspeed-commerce-launches-lightspeed-ai-a-new-ai-powered-intelligence-layer-for-retail-and-hospitality/) ·
[Toast AI](https://pos.toasttab.com/blog/on-the-line/ai-restaurant-data) ·
[POS AI comparison](https://restauranttools.ai/blog/best-restaurant-pos-with-ai-features-2026) ·
[Square voice + assistant](https://www.restaurantdive.com/news/square-product-update-voice-ordering-ai-assistant/802331/) ·
[Nory agentic ordering](https://www.nory.ai/blog/ai-restaurant-ordering)


---

## 8. Build sequence — ordered by what each slice needs, not by what demos

**The ordering rule: every slice ships to a surface that exists, and no slice mints a spec act
until the slice that would use it is next.**

### Slice 0 — `packages/metrics`. No LLM, no events, no new actions, no spec act.

Move `services/api/src/summary.ts`'s fold into a package as **registered metrics**: id, human name,
definition text, computation (a deterministic fold over events — `13-F1` permits SQL over read
models or a fold, and there are no read models), typed Zod dimensions with org-scoped whitelists
(`13-F4`), unit (`00 §6`), minimum-data precondition with an **executable premise** (`13-F5` +
`summary.ts`'s existing pattern), and golden fixtures (`13-F3`, build-time enforced).
`summary-router.nightly` becomes its first caller, so **the seam exists before the registry does**
— which is the guard against `L8`, applied at the moment the module starts rather than after.

Members: `sales.total`, `sales.by_channel`, `sales.hourly`, `orders.count`, `items.top_by_revenue`,
`voids.count/value`, `comps.value`, `discounts.value`, `corrections.by_actor`,
`cash.expected_vs_counted`, `cash.variance`, `drawer.no_sale_count`, `price_overrides.count`,
`refunds.value`, `kitchen.rung_to_ready`, `print.failures`. Every one is §1.1.

**Value independent of AI:** `12-F21`'s *"one number, everywhere"* stops being a promise and
becomes a type. Adding a `metric.run` procedure gated on the existing `report.sales_view` gives the
back office and any later surface one door.

### Slice 1 — threshold detectors, rendered in the summary's "what's odd" block. Still no LLM.

`13-F10`'s four detectors whose events exist (§1.1). **They do not emit `alert.raised`** — the
result is computed on read and rendered exactly as `OMISSIONS` is today. Under `13-F14a` that is
the Wave-1 delivery surface *verbatim*: *"all classes appear in the nightly summary's 'what's odd'
block"*.

What it costs, stated: no dedupe key, no cross-surface ack, no history, and a re-render every time.
Those are exactly what slice 3 buys, and buying them early costs a doc-01 spec act on a protected
path for a pilot that has one branch.

⚠ **Blocked on something that is not ours:** every one of the four needs a threshold, `00 §7` puts
thresholds at layer 2, `14-F21` owns the surface, and **the layer-2 config plane does not exist** —
R63 already made it MVP scope for a different reason. Slice 1 ships with platform-constant defaults
and says on the screen that they are not yet the owner's, or it waits. That is a real dependency,
not a detail.

### Slice 2 — the analyst, read-only, on the one surface that exists.

`13-F15`..`13-F19`, `13-F29`'s gateway, `13-F30`'s budget + degradation **in the same slice**
(§5.2), `13-F32`'s eval suites in CI, and §3's five gates. Gated on `report.sales_view`; the
`reportScope` narrowing runs **inside** the resolver as well as in the middleware, for the reason
`summary-router.ts` already gives. Still **zero** new event types and **zero** new permission
actions.

⚠ **Surface conflict, and it is a founder call (decision 4).** `restaurant-os.md` §4.6 requires the
analyst to ship on **both** surfaces together, *"never one before the other"*. Measured: `apps/owner`
is 1 file, `services/whatsapp` is 1 file, `apps/backoffice` is 48 and ships. Under R49 `apps/owner`
becomes a browser surface on the back-office template, which makes "the back office first" and "the
owner app" nearly the same build — but §4.6 as written forbids shipping either before WhatsApp.

### Slice 3 — persistence. The first spec act.

`brief.generated`, `alert.raised`, `alert.acknowledged`, `suggestion.issued` as **org-scoped**
types (§6.1) with payload schemas in `packages/domain`. This is what buys `13-F14`'s dedupe key,
`12-F17`'s cross-surface ack, an alert inbox, and `12-F13`'s *"past summaries render from stored
values, never recomputed"*. Protected path; full adversarial gate under R35.

### Slice 4 — baselines. Gated on the calendar, not on us.

`13-F11`/`13-F12` need ≥ 20 completed shifts per cashier and ≥ 28 business days per branch. A pilot
cannot produce those before it has traded for a month. Until then the surface says so (`10-F24`,
R76) and alert copy never claims a baseline comparison — which `13-F12` already requires.

### Slice 5+ — everything inventory-dependent, then the ladder's `stock`/`prep` tracks.

Strictly after `plans/inventory/design.md` slice 1 lands its three payload schemas. `13-F23`'s
ownership boundary is already correct and worth restating: doc 10's in-app suggestion lists are
always-on and **not** gated by this ladder; rung R2 gates only the *push* of those suggestions
into the brief and everything above. **One computation, two exposure levels.**

### Deferred until ruled: rung R3 (acting) and rung R4.

§6.2 and §6.3. `13-F20`'s four tracks reduce to: `stock` and `prep` blocked on inventory (§1.2),
`staffing` blocked on doc 11 (unbuilt). **`load` is the one whose blocker is different and worth
naming precisely:** its rung-R2 input — order-aging data — *does* reach the cloud
(`order.line_state_changed`, both edges, §1.1 row 8), but `channel.paused / resumed / throttled` has
**no payload schema** in `packages/domain` and nothing emits an overload warning, so `13-F24`'s
rung-R3 criterion (*"≥ 75% of trailing 12 overload warnings followed by a manual pause within 10
min"*) measures a population of zero. **None of the four is reachable in this module's first three
slices**, which is the useful fact: the ladder is not being deferred by preference — it has no
track that could climb.

---

## 9. Spec acts owed, with owners

| # | Act | Doc | Blocks |
|---|---|---|---|
| **B1** | **`01-F62` admits `brief.generated`, `alert.raised`, `alert.acknowledged`, `suggestion.issued`, `autonomy.rung_changed` to the org-scoped set** (5 → 10), on `01-F62`'s own discriminant; `action.proposed` is a sixth if rung R2 ever pushes proposals (§6.4). Amend `ORG_SCOPED_EVENT_TYPES` and `01-F73` (f)'s "stays at five". ⚠ Protected path; and `05-F29`'s rejection of resolution (b) must be read as **not reaching this** — §6.1 | 01 | slice 3 |
| **B2** | Payload schemas for those five in `packages/domain/src/registry.ts`. `01-F4` makes each unemittable until then. **`alert.raised` carries `13-F14`'s dedupe key as its identity**, because an org-scoped record has no envelope id (§6.1) | 01 | slice 3 |
| **B3** | **`12 §5` is wrong as written** — the server cannot emit `alert.acknowledged` today (`appendOrgEvent` throws). Correct it, or note it as conditional on B1 | 12 | `12-F17` |
| **B4** | `13-F5`'s 60%-coverage precondition is overruled by R76 — **A15, owned by `plans/inventory/design.md`.** Do not write a second amendment | 13 | the margin metric |
| **B5** | `13-N1`'s 30-minute brief budget vs the Batch API — amend the NFR or forgo the discount (founder decision 3) | 13 | slice 2's cost model |
| **B6** | `restaurant-os.md` §4.6's *"both surfaces together, never one before the other"* — amend, or hold the analyst (founder decision 4) | seed | slice 2 |
| **B7** | `22-F13`'s retention matrix has no row for `llm_call_log` or vendor-held prompts | 22 | slice 2 |
| **B8** | `28-F3` / `28 §9.22` — what an **absent** entitlement record resolves the intelligence rung cap to. Every self-serve pilot is in that state on day one | 28 | slice 1 |
| **B9** | A permission action for the analyst **only if** it ever writes. Slices 0–2 need none; do not mint one speculatively (`14-F30`'s precedent is for actions that are needed) | 14 | rung R3, if ever |
| **B10** | If rung R4 is ever ruled in: a service-principal actor (§6.3 (a)/(b)/(c)) — a `packages/domain` protected-path act plus Appendix A | 01 + 14 | rung R4 |

**B1–B3 are one coherent act and should land together.** B4–B8 are records rather than blockers;
**B4 must not be allowed to drift** for the reason `L3` records.

---

## 10. Where this module can produce the repo's two recurring defects

`L8` — a correct subsystem with no seam — has **four** shapes available here, and one of them is
invisible to `seams:check` by construction:

1. **A metric registry nothing calls.** Guard: slice 0's first member is a metric
   `summary-router.nightly` *already* calls; the caller predates the registry.
2. **A detector with no delivery surface.** `13-F14a` is the FR that forbids it and slice 1's whole
   shape is built around it.
3. ⚠ **The LLM gateway supplied with a canned narrator.** This is the *"port supplied with a
   stub"* blind spot, measured on the publish adapter: `verify` exit 0, `seams:check` clean, nearly
   every test green, and no menu reaches any till. Rule B asks whether a member is *supplied*,
   never whether the supply is real. **Hand-written assertion required**, and the fallback must
   **refuse** rather than return template text — copy `unconfiguredDayLedger`'s exact shape and its
   stated reason (*"a stub answering `[]` renders Rs 0 for a restaurant that took two hundred
   thousand rupees"*). A canned narrator is worse: it renders a fluent, plausible, wrong brief.
4. **A missing producer.** `alert.raised` in the catalog with nothing emitting it is precisely the
   shape `audit.print_acknowledged` had; a key in an object literal is not an export, so no rail
   sees it. Slice 3's acceptance suite asserts the producer, not the schema.

`L9` — a correct component not on the screen — has one shape and **no rail covers it**:
`layout:check` opens a real Electron `BrowserWindow` from `apps/pos-electron`'s own options. The
analyst is a **browser** surface, and a streaming answer that grows past its box is invisible to
happy-dom, where every `getBoundingClientRect` is zeroes (`T11`). Either the back office gets a
layout gate or this plan states — as it does here — that the analyst's composition is
**unmeasured**, so nobody later reads a green suite as coverage.

And one shape specific to this module: **a vacuous numeric validator** (§3, gate 3). `L10`'s
mutation requirement is not optional here; it is the only evidence that the honesty machinery works
at all.

---

## 11. Open questions — engineering, not founder

1. **`12-F13` vs the shipped summary.** The FR requires past summaries to render from **stored**
   values so history is stable across read-model rebuilds; `summary-router.nightly` **recomputes**
   from raw events on every request (measured 2026-08-24; there is no `briefs` table). Recomputing
   is defensible under R4 (*nothing live, schemas may change freely*) and becomes wrong the first
   month a real pilot's history matters. Slice 3 is where it changes; naming the trigger now.
2. **Where conversation memory lives** (`13-F19`, `13 §9.5`): summarize-and-pin vs sliding window,
   decided against measured token costs. It is per **owner** — a user, not a tenant — and erasure
   is `14`'s surface. Server-side compaction is an option worth measuring before hand-rolling one.
3. **`05-F30`'s alarm-ack hole is upstream of this module's ack.** With the manager device deleted,
   nothing can emit `audit.alarm_acknowledged`; `05-F32` names three shapes and rules none. If an
   alert ack and an alarm ack are the same gesture on the same phone, they should be decided
   **together**, not twice by two sessions.
4. **Metric versioning across a fold change.** `13-F2` says a metric change bumps its version and
   answers record the version used. What it does not say is what happens to a **stored** brief
   whose metric version no longer exists. Slice 3's problem; flagged now because the answer
   constrains the storage shape.
5. **Test authorship.** `20 §4.3` and `24 §3` require the oracle author to be a different session
   from the implementer, and R66 tiers that by path — but **R66 is carried into no FR**, so the
   separation rule stands as written for anything outside v0's four gaps. This module is not v0.
   Cite the ruling and stop rather than pick (`L3`).
6. **The metric fold's cost at scale.** `ledger.ts` reads a bounded window and reports `truncated`
   when the row cap is hit; a totals figure folded from a truncated prefix is a **floor**. A
   baseline over 28 business days reads ~28× that window. Whether `01-F7` read models become
   necessary is a measurement to take at slice 4, not a guess to make now.

---

## 12. Founder decisions

**1. Does the AI layer ever write to the ledger?**
 (a) **Yes — five org-scoped intelligence event types** (B1–B3). Buys dedupe, cross-surface ack, an
 alert inbox and `12-F13`'s stable history. Costs a doc-01 amendment on the most expensive
 protected path in the corpus, and once the cloud emits one event family the next module asks for
 its own.
 (b) **No — everything is computed on read.** Costs nothing and ships two slices sooner. The price:
 an alert re-nags forever because nothing can ack it, `12-F17` stays unbuildable, and last month's
 brief silently changes when a fold changes.
 *Recommendation: (b) for slices 0–2, (a) at slice 3. The question is when, not whether.*

**2. May an agent ever ACT?**
 (a) **Never — the cloud proposes, a human acts under her own credential, `refs[]` links them**
 (§6.4). Needs no service principal, no fifth role, no envelope change; reuses controls that ship
 today. **Cost: auto-86 on stockout, auto-pause and auto-reorder do not exist** — and that is the
 demo every competitor leads with.
 (b) **Yes — mint a service principal** (§6.3 (b) is the least-bad shape). Cost: `02-F41`'s
 *"attribution is whoever's PIN is in, with no 'acting for' concept"* acquires a permanent
 exception on a protected path, and under `01-F1` every robot-authored event is forever.
 *Recommendation: (a). It is `05-F32` applied one module over, on the same measurement, and the
 market's own action model (Toast) is (a) rather than (b).*

**3. Is there a hard per-org LLM budget?**
 Measured (§5.2, PKR 280/USD assumed): brief ≈ PKR 30–151/branch/month against PKR 8,000. Analyst
 at 2 questions/day ≈ PKR 336–571; **at 20/day on Opus ≈ PKR 5,712 — 71% of the subscription.**
 (a) **Hard monthly cap with `13-F30`'s graceful degradation** — numbers never degrade, only
 narration. Cost: an owner is told "busy" late in a heavy month.
 (b) **No cap, monitored.** Cost: under R5's flat subscription with no metering, one enthusiastic
 owner erases the margin on his own branch and nothing in the product stops him.
 *Recommendation: (a), shipped in the same slice as the analyst rather than after it.*

**4. Does the analyst ship on the back office alone, or wait for all three surfaces?**
 `restaurant-os.md` §4.6 says both surfaces together, *"never one before the other"*. Measured:
 `apps/backoffice` 48 files and shipping; `apps/owner` 1 file; `services/whatsapp` 1 file.
 (a) **Amend §4.6 and ship in the back office.** Cost: the owner reads it on a laptop, not on the
 phone where he lives — which is the reason §4.6's rule exists.
 (b) **Hold.** Cost: the module's most visible output waits on two unbuilt modules, and R1 already
 sequences intelligence after them.

**5. What may an owner's question contain, and where may it go?**
 The corpus rules on what *we* send (`22-F12`, `13-N5`) and is **silent** on the free text the owner
 types — which will name staff and make accusations.
 (a) **Pass it through.** The most valuable question an owner asks is *"why is Bilal's till always
 short"*, and it is answerable from shipped events. Cost: a named accusation about an employee sits
 in a vendor's logs and in our `llm_call_log`, and `22-F13` has no retention row for either (B7).
 (b) **Refuse or redact person-named questions before they leave.** Cost: the product refuses the
 question the whole feature exists to answer.

**6. Detectors first, or the analyst first?**
 (a) **Detectors** (slice 1). They need no LLM at all, they tell an owner something he cannot get
 by looking, and they are four working alerts on data that exists. Cost: nothing visibly "AI" ships
 for a slice, and slice 1 is blocked on a threshold config plane that does not exist.
 (b) **The analyst** (slice 2). It is what demos and what every competitor leads with. Cost: a chat
 box over sixteen metrics is the plausible-liar risk at its maximum with the least data behind it,
 and it is where a wrong answer costs the most trust.
 *Recommendation: (a) — and slice 0 ships under either answer, so this decision can be taken after
 the semantic layer exists rather than before.*
