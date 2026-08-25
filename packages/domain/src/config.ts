// `01-F87`'s CONFIGURATION PLANE — the layer-2 key registry, its declared defaults, the
// resolution that carries `00 §7` (e)'s source, and the refusals the WRITER performs.
//
// Owning specs: `01-F87` (the two carriers and the fold ban), `00 §7` (the three layers, (b)'s
// admission test, (d)'s default rule, (e)'s source rule, (f)'s before-state), `14-F43`..`14-F48`
// (the editing surface and its enumerated refusals), and per key: `16-F27`/`16-F28` (the posture
// matrix and its tender axis), `02-F63` (charge rounding granularity), `05-F33` (the paid-out
// threshold and its zero default), `14-F47`/R71 (the discount ceiling), `02-F60`/`14-F46` (card
// commission per provider).
//
// ── WHY THIS FILE IS NOT RE-EXPORTED FROM `index.ts`, WHICH IS THE WHOLE ENFORCEMENT ──────────
//
// `01-F87`: **"NO FOLD READS CONFIGURATION, FOR ANY KEY"**, and it rules out the obvious test:
// `01-F34`'s bijective-relabel-plus-clock-injection property "structurally cannot catch this",
// because both harness devices hold the same configuration, so relabel invariance holds while two
// real tills at different artifact versions still project different money. The FR's own answer is
// that **"enforcement is therefore structural — what a fold is allowed to take as input"**.
//
// Two structural facts do that here, and neither is a property test:
//
//   1. **A fold's INPUT TYPE has nowhere to put configuration.** Every fold in
//      `packages/sync-client/src/folds` is `(state, event) => state` and every projection is
//      `(state) => rows`. There is no third parameter, so a configured value cannot be passed to
//      one. `packages/sync-client`'s `fold-config-ban.test.ts` pins the arity and the parameter
//      types at COMPILE time, so widening the signature is a type error before it is a review
//      comment.
//   2. **A fold cannot NAME a symbol from this module without adding an import specifier that
//      does not exist today.** Folds import `@restos/domain`; this module is reachable only as
//      `@restos/domain/config`, a second entry in the package's `exports` map. That is the same
//      device `@restos/sync-client/fold-engine` already uses to keep the better-sqlite3 addon out
//      of the gateway runtime — a module boundary drawn in the package manifest, visible in a
//      diff as a new import line, and asserted by the same test file.
//
// ⚠ **STATE THE CLASS THAT IS CLOSED AND THE ONE THAT IS NOT** (`01-F66`'s recorded lesson —
// a comment claiming a protection retires the assertion the next session would have written).
// CLOSED: a fold that takes configuration as an argument, and a fold that imports this module.
// NOT closed: a fold that reads a configured value **copied into some other module** and imported
// from there — the ban is on this module's identity, not on the number 1600. What makes that
// survivable is `01-F87`'s own instruction for where a configured value belongs: it is resolved at
// the ACT and written INTO the event (`01-F53`'s frozen price, `26 §7`'s carried key), so a fold
// reading it off the envelope is correct and reading it off anything else is the defect.
//
// ── WHAT IS **NOT** A FOLD, because this is where the line will be argued (`01-F87`) ──────────
//
// A rendering computed at DISPLAY time reads configuration freely — `ageLevel` in
// `packages/ui/src/components/AgeBadge.tsx` is the shipped example, and `loyaltyAvailable` in
// `campaign.ts` is the second. The break is one keystroke away and `01-F87` names it: **memoizing
// such a rendering into a materialized state table**, at which point the value stops being
// recomputed per frame and becomes a projected one.
import { z } from "zod";
import { PAYMENT_METHODS, type PaymentMethod } from "./registry.js";
import { TAX_OFF, TAX_POSTURES, type TaxCell } from "./tax.js";

/**
 * `00 §7`'s three layers, as its own numerals.
 *
 * `01-F87` (a): *"`00 §7` numbers its three layers 1/2/3, so an integer is transcription where a
 * name (`org`, `branch_device`) would be invention"*. Declared here rather than in the event
 * registry because the registry's `config.changed` schema and this key registry must agree about
 * what a layer IS, and two declarations of one closed set is the drift `catalog.enabled` cost.
 */
export const CONFIG_LAYERS = [1, 2, 3] as const;
export type ConfigLayer = (typeof CONFIG_LAYERS)[number];

/**
 * `00 §7` (e) — **the resolved SOURCE, which travels with the value.**
 *
 * `configured` = the org's arrived. `default` = it never has. A device must be able to say which
 * it holds, because `00 §5.7` bans presenting stale as live and a value that never arrived is the
 * sharper case: there is no age to show. The shipped precedents this copies are
 * `apps/pos-electron/src/main/hardware-tier.ts` (`derived | configured | assumed`) and
 * `packages/device-config/src/panel-density.ts` (`measured | configured | assumed`).
 */
export const CONFIG_SOURCES = ["configured", "default"] as const;
export type ConfigSource = (typeof CONFIG_SOURCES)[number];

/**
 * Who a key's value is FOR.
 *
 * `01-F87` puts one org artifact on the wire and `01-F76` makes its version a claim about the
 * whole of it, so this is **not** a second artifact and not a second version axis — it is a filter
 * the SERVE path applies to the entries of the one artifact it is already serving.
 *
 * It exists because `02 §Layer 2` says of R60's commission rate, in terms, *"cloud-plane reporting
 * only, **never sent to the till** and never a term in any drawer figure"*. A key registry with no
 * audience would either drop that key (leaving R60 no home) or ship a negotiated bank rate to
 * every counter in the org. Neither is what the corpus says.
 *
 * **A filtered device artifact does not weaken `01-F56`'s divergence detection**, and the reason is
 * worth stating because it is the objection a reader will raise: the version counts the WHOLE
 * artifact, so an edit to a `cloud_only` key bumps it, every device notices it is behind, refetches
 * and receives bytes identical to what it held. That costs one wasted fetch and buys the property
 * `01-F87` chose a version number FOR — *knowing you hold all of it* — over the subset a device is
 * allowed to hold. The alternative, a second version per audience, is `01-F76`'s concatenated key
 * by another route.
 */
export const CONFIG_AUDIENCES = ["device", "cloud_only"] as const;
export type ConfigAudience = (typeof CONFIG_AUDIENCES)[number];

/**
 * One layer-2 key, as `00 §7` (b) admits it and `00 §7` (d) requires it to be declared.
 *
 * `schema` is the vendor's half of `00 §7`'s *"the vendor designs the schema … the org supplies the
 * value"* — type, unit, bounds and refusals. `14-F48`'s closing note is explicit that (i), (m) and
 * half of (b) *"are that schema's job rather than a hand-written check"*, so they are here.
 */
export type ConfigKeyDeclaration<T> = {
  readonly layer: ConfigLayer;
  readonly audience: ConfigAudience;
  /**
   * The FR that owns this key. `01-F87`: each key's declared schema *"belongs to the doc that owns
   * the key"*, and *"a key string an implementation invents is a `01-F4`-shaped error one layer
   * down"* — so every row here names the FR a reviewer greps to check it.
   */
  readonly fr: string;
  readonly schema: z.ZodType<T>;
  /**
   * `00 §7` (d) — **declared in the BUILD and never delivered** (`01-F87` (b)).
   *
   * A delivered default is a configured value that has not arrived yet, and the case being
   * specified is precisely the device that has had no contact. Two consequences `01-F87` (b)
   * states rather than leaves to be discovered: **changing this value is a spec act** in the doc
   * that owns the key, never an implementation edit; and two devices on different builds can hold
   * different defaults for a key no org has configured — a real divergence `01-F56` cannot see,
   * tolerable only because (d) makes a default safe to be wrong about and because
   * `configKeysOnDefault` makes it visible.
   */
  readonly default: T;
};

const declare = <T>(d: ConfigKeyDeclaration<T>): ConfigKeyDeclaration<T> => d;

/**
 * `16-F2`'s cell as the config plane carries it. `rate_bps` is REQUIRED — `16-F27`'s *"no empty
 * cell and no cell whose value came from nowhere"*, which is `14-F48` (g) at the schema.
 */
const TaxCellSchema = z
  .object({
    posture: z.enum(TAX_POSTURES),
    rate_bps: z
      .number({ error: "16-F27/14-F48 (g): a cell states its rate — no empty cell" })
      .int({ error: "00 §6/14-F48 (i): a rate is an INTEGER in basis points (1600 is 16 %)" })
      .min(0, { error: "00 §6/14-F48 (i): a rate is never negative" }),
  })
  .check((ctx) => {
    // `14-F48` (h) — `none` carrying a non-zero rate. "A rate nothing applies is a number that
    // will be believed later", and under `01-F1` it is believed permanently.
    if (ctx.value.posture === "none" && ctx.value.rate_bps !== 0)
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["rate_bps"],
        message:
          "14-F48 (h): posture `none` charges nothing, so it carries rate_bps 0 — a rate " +
          "nothing applies is a number that will be believed later",
      });
  });

/**
 * `16-F27`'s matrix: **one default cell the owner types fills every cell, with per-tender
 * overrides on top.**
 *
 * ⚠ **The COLUMN AXIS IS CLOSED TODAY AND THAT IS `16-F28`'s OWN CLAUSE, NOT A SIMPLIFICATION.**
 * R55's other half — making `02-F12`'s tender set owner-extensible — is a change to
 * `payment.recorded`'s payload on a protected path and *"not doc 16's act"*, so until it lands
 * *"doc 16's matrix has a **fixed column axis** and R55 is delivered for the rates only"*. The set
 * is therefore `PAYMENT_METHODS`, and when `14-F44`'s editor opens it this schema follows —
 * `16-F28`'s two rules bind either way: the axis IS whatever `02-F12`'s set becomes, and every
 * enabled member has a cell.
 *
 * **An override list rather than a record keyed by tender**, because a record makes an
 * owner-extended tender a KEY in a payload schema, and `00 §7` (c) bans a layer-2 value changing
 * *"the key set of a payload schema"*. A row is a row (`00 §7` (b) (i)); a column is not.
 */
export const TaxPostureMatrixSchema = z
  .object({
    /** `16-F27`: typed by the OWNER, never vendor-supplied, and rendered in every cell it fills. */
    default: TaxCellSchema,
    by_tender: z.array(z.object({ tender: z.enum(PAYMENT_METHODS), cell: TaxCellSchema })),
  })
  .check((ctx) => {
    const seen = new Set<string>();
    for (const [index, row] of ctx.value.by_tender.entries()) {
      if (seen.has(row.tender))
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["by_tender", index, "tender"],
          message:
            "16-F27: one override per tender — two cells for one tender make the rate depend " +
            "on array position, which is 01-F34's hazard wearing a settings screen",
        });
      seen.add(row.tender);
    }
  });

export type TaxPostureMatrix = z.infer<typeof TaxPostureMatrixSchema>;

/**
 * `02-F60` (ii) / `14-F46` — one acquirer's negotiated cut, per (org, provider).
 *
 * ⚠ **NOT doc 08's `commission_bps`**: that is an aggregator's cut of an ORDER channel (`02-F42`);
 * this is an acquirer's cut of a TENDER (`02-F58`). Two axes, one word, and `02-F60` (ii) says so
 * in terms.
 */
export const CommissionRowSchema = z.object({
  /**
   * The provider's name as the owner types it. `14-F46`: *"a name she types"* — there is no
   * provider registry in this corpus and inventing one would be commandment 2.
   */
  provider: z.string().trim().min(1, { error: "14-F48 (l): a provider row with no name" }),
  rate_bps: z
    .number()
    .int({ error: "00 §6/14-F48 (m): a rate is an INTEGER in basis points" })
    .min(0, { error: "14-F48 (m): a rate is never negative" })
    .max(10_000, {
      error:
        "02-F60: a commission is a share of one payment, so 10000 bps (100 %) is its domain " +
        "ceiling — this refuses what is not a rate, never what is an unusual one (14-F48)",
    }),
});

export const CommissionRegistrySchema = z.array(CommissionRowSchema).check((ctx) => {
  const seen = new Set<string>();
  for (const [index, row] of ctx.value.entries()) {
    const name = row.provider.toLocaleLowerCase("en-US");
    if (seen.has(name))
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: [index, "provider"],
        message:
          "14-F48 (l): a duplicate provider name — two rows reading `HBL` cannot be told apart " +
          "on the report they exist to feed",
      });
    seen.add(name);
  }
});

export type CommissionRegistry = z.infer<typeof CommissionRegistrySchema>;

/**
 * `02-F63` (c)'s granularity floor, in paisa — the step that rounds to the rupee.
 *
 * Named as a constant rather than spelled at its two uses because `00 §7` (d) makes a declared
 * default a stated fact, and because the whole-rupee refusal below is expressed as a multiple of
 * it: two spellings of Rs 1 is one fact free to drift.
 */
export const CHARGE_ROUNDING_RUPEE_STEP = 100;

/**
 * **THE LAYER-2 KEY REGISTRY.**
 *
 * `00 §7`: *"Every module doc's Customizability section lists exactly which settings it exposes at
 * which layer"*, so the key space is the union over every module doc and **grows with each one**.
 * `01-F87` (a) makes that space OPEN in the ledger schema and moves the check to the writer; what
 * is closed is *this build's* set, which is what `refuseConfigWrite` refuses against and what
 * `parseConfigArtifact` calls a KNOWN key.
 *
 * Five keys, each the one its owning FR declares. What is deliberately NOT here:
 *
 *   · **The tender SET** (`14-F44`, R55's other half). It changes `payment.recorded`'s payload on
 *     a protected path and is not this transport's act; `16-F28` says doc 16's matrix keeps a fixed
 *     column axis until it lands, so the tax key above is written against `PAYMENT_METHODS`.
 *   · **`00 §7` (f)'s eight environment keys** — the enabled `(branch, channel)` set, hardware
 *     tier, station routes, aging thresholds, quick-tags and the two signal owners. `01-F87` is
 *     explicit that *"none of the eight environment stopgaps is retired by this FR"* and that
 *     retiring one is *"a per-key migration in its owning app, which this transport makes possible
 *     rather than performs"*. Declaring a key here for a value nothing reads through it would be
 *     this wave's named defect — a correct subsystem with no seam to the product — shipped on
 *     purpose.
 *   · **Layer 1 and layer 3.** `CONFIG_LAYERS` carries all three because `config.changed` already
 *     spans them (`15-F25` routes an org's `active ⇄ suspended` through it, which is layer 1), but
 *     this artifact carries layer 2 and `01-F87` leaves whether any layer-1 fact ever rides this
 *     transport to docs 15 and 28.
 */
export const CONFIG_KEYS = {
  /**
   * `16-F27` (R55) — the posture matrix, its rates typed by the owner.
   *
   * **Default: tax OFF.** `16-F1`'s *"tax is off by default"* is the corpus's own precedent and
   * `00 §7` (d) generalises it: *"for a rate it is **off**"*. It is safe to be wrong about in the
   * direction (d) requires — an org that has configured nothing charges nothing, which is the
   * ordinary Pakistani restaurant and exactly what the till did before this plane existed.
   */
  "tax.posture_matrix": declare({
    layer: 2,
    audience: "device",
    fr: "16-F27",
    schema: TaxPostureMatrixSchema,
    default: { default: TAX_OFF, by_tender: [] } satisfies TaxPostureMatrix,
  }),
  /**
   * `02-F63` (R70) — the step `billed_total` is rounded to. 100 = the rupee, 1000 = ten rupees.
   *
   * **Default Rs 1**, `02-F63` (c)'s own number. Unset is not *"no rounding regime"*: coins below
   * a rupee have left circulation whether or not an owner has typed anything, which is why this
   * key's default is a VALUE where `16-F1`'s posture default is an absence.
   *
   * ⚠ **A STEP THAT IS NOT A WHOLE NUMBER OF RUPEES IS REFUSED, and the refusal is the
   * CONFIGURATION's rather than the arithmetic's.** `chargePaisaAtGranularity` still accepts any
   * step ≥ 1 paisa — it is a pure function with no glass in front of it. This key cannot, and the
   * reason is measured on shipping code rather than argued: both ends of the counter's money path
   * are whole-rupee (`MoneyValue` truncates under `27-F23`; `TenderPanel`'s pad multiplies by 100),
   * so at a step of 1 with `exclusive` 16 % on one Rs 404 line the bill is 46_864, the glass shows
   * `Rs 468`, keying exactly that gives 46_800, the cover test fails and the Pay surface reads
   * `DUE Rs 0` for ever. That is `01-F17` broken by a configuration `02-F63` (c) used to bless.
   * `apps/pos-electron/src/main/tax-posture.ts` names this check as the one its successor inherits.
   */
  "charge.rounding_paisa": declare({
    layer: 2,
    audience: "device",
    fr: "02-F63",
    schema: z
      .number()
      .int({ error: "02-F63: the step is an INTEGER number of paisa" })
      .min(1, { error: "02-F63: a granularity of zero has no meaning" })
      .refine((step) => step % CHARGE_ROUNDING_RUPEE_STEP === 0, {
        error:
          "02-F63 (c): the step is a whole number of RUPEES (a multiple of 100 paisa: 100 rounds " +
          "to the rupee, 1000 to ten rupees). A sub-rupee charge cannot be shown on an " +
          "operational screen (27-F23) or entered on the tender pad, so the cashier would key " +
          "what she is shown and the bill would never settle",
      }),
    default: CHARGE_ROUNDING_RUPEE_STEP,
  }),
  /**
   * `05-F19`'s threshold, made a layer-2 key by R63 and given its default by `05-F33` (R65).
   *
   * **Default `0` paisa — every paid-out requires approval until the owner says otherwise.**
   * Rs 2,000 (`PAID_OUT_APPROVAL_THRESHOLD_PAISA`) is **not** carried forward: `00 §7` (f) says in
   * terms that doc 05 *"must take that decision rather than inherit it"*, and `05-F33` took it.
   * Zero is the only value that states no tolerance at all — its unapproved partition is empty —
   * which is `16-F1`'s *"off by default"* generalised rather than analogised.
   *
   * ⚠ **The cost is accepted WITH the ruling and is not a defect to be fixed here: a branch manager
   * working alone cannot record a paid-out** (`canPayOut` derives `satisfied_by` from
   * `approval.grant`'s row and `02-F38` refuses self-approval). **No commandment-4 breach** —
   * `01-F17` protects the SALE, and `00 §7` (d) says so directly: *"a cashier who needs a manager
   * PIN for petty cash at 06:00 is inconvenienced; a cashier who cannot ring an order is a stopped
   * restaurant."*
   */
  "paid_out.approval_threshold_paisa": declare({
    layer: 2,
    audience: "device",
    fr: "05-F33",
    schema: z
      .number()
      .int({ error: "00 §6/14-F48 (m): a money threshold is an INTEGER number of paisa" })
      .min(0, { error: "14-F48 (m): a threshold is never negative" }),
    default: 0,
  }),
  /**
   * `14-F47` / R71 — the discretionary discount ceiling, **cumulative per order**, in integer
   * basis points. 5000 = R71's own *"maybe 50%"*.
   *
   * **THE BASE IS THE PREDICATE'S AND IS DELIBERATELY NOT A SECOND KEY.** R71's *"consider the
   * discount cumulatively"* describes what the percentage is OF; `17-F24` adds that campaign-cited
   * discounts do not count against that running total, *"and that exclusion is stated here because
   * it is a property of this arm"*. Both are properties of `canDiscount`, not settings — an org
   * that could choose its own base would be inventing an AXIS, which `00 §7` (b) (i) refuses.
   *
   * **Default `0` bps — the strict end.** `00 §7` (d): *"for a permission-shaped threshold it is
   * the strict end (approval required)"*. It is the same argument `05-F33` makes one key up, and
   * the same accepted cost: an unconfigured org escalates every discretionary discount, and a
   * campaign discount is untouched because `17-F24` routes it around this predicate entirely — so
   * the common floor case (`27-F11e`: no manager in the building) is served by the campaign arm,
   * which is exactly what R71 built it for.
   *
   * ⚠ **The 10000 ceiling is a DOMAIN bound and not a plausibility bound**, which `14-F48` refuses
   * by name for tax. A cumulative discount is a share of the order and cannot exceed it, so a
   * value above 100 % names no reachable escalation and reads as one extra digit. Disputable by
   * `14-F47`; refusing it costs an owner nothing, because 10000 already means *never escalate*.
   */
  "discount.approval_threshold_bps": declare({
    layer: 2,
    audience: "device",
    fr: "14-F47",
    schema: z
      .number()
      .int({ error: "00 §6/14-F48 (m): a rate is an INTEGER in basis points (5000 is 50 %)" })
      .min(0, { error: "14-F48 (m): a threshold is never negative" })
      .max(10_000, {
        error:
          "14-F47: a CUMULATIVE discount is a share of the order, so 10000 bps (100 %) is the " +
          "domain ceiling — above it no discount could ever escalate",
      }),
    default: 0,
  }),
  /**
   * `02-F60` (R60) / `14-F46` — the negotiated commission per card provider. **Informational.**
   *
   * **Default: ABSENT, not zero** — `00 §7` (d) fixes an informational rate's default at absent,
   * *"which costs a report row and no money"*. A zero default renders a net equal to the gross,
   * and `14-F46` says the thing that matters about that: *"a number that looks computed is
   * believed"*. The empty registry IS that absence: `resolveConfig` reports `source: "default"`,
   * so a surface can say *the owner has set no rate* rather than *the rate is nil*.
   *
   * **`cloud_only`** — `02 §Layer 2`, verbatim: *"cloud-plane reporting only, never sent to the
   * till and never a term in any drawer figure"*. `02-F60` (iii) is why: commission is not inside
   * `billed_total`, not a term in `01-F30`'s conservation, and not a deduction from `02-F23`'s
   * expected cash. Nothing on a till has any use for it, and a negotiated bank rate on every
   * counter in the org is a disclosure nobody asked for.
   */
  "commission.by_provider": declare({
    layer: 2,
    audience: "cloud_only",
    fr: "02-F60",
    schema: CommissionRegistrySchema,
    default: [] satisfies CommissionRegistry,
  }),
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

/** Every key this build knows, as an array — the writer's closed set and the device's KNOWN set. */
export const CONFIG_KEY_NAMES = Object.keys(CONFIG_KEYS) as readonly ConfigKey[];

const KNOWN = new Set<string>(CONFIG_KEY_NAMES);

export const isConfigKey = (key: string): key is ConfigKey => KNOWN.has(key);

/** The declared value type of one key, derived from its schema so the two can never disagree. */
export type ConfigValue<K extends ConfigKey> =
  (typeof CONFIG_KEYS)[K] extends ConfigKeyDeclaration<infer T> ? T : never;

/**
 * `00 §7` (e) — a value **and** where it came from, which is the only shape this module hands out.
 *
 * Never a bare `T`. A caller that receives only the value cannot satisfy (e)'s requirement that
 * *"any surface whose behaviour would differ under the org's real value must be able to name which
 * it holds"*, and the shipped precedents (`hardware-tier.ts`, `panel-density.ts`) both learned that
 * by printing the source at boot after a wrong value looked exactly like a right one from the
 * screen.
 */
export type Resolved<T> = {
  readonly value: T;
  readonly source: ConfigSource;
};

/**
 * What a device (or a cloud reader) HOLDS for the `config` resource.
 *
 * `version` is `01-F76`'s artifact version — `0` means nothing has ever arrived, which is the state
 * `01-F87` (b) specifies for and the state in which every key resolves to its declared default.
 */
export type ConfigArtifact = {
  readonly version: number;
  /** Parsed, per-key. A key absent here is a key on its default; there is no third state. */
  readonly configured: ReadonlyMap<ConfigKey, unknown>;
};

/** The artifact a device holds before any contact — `01-F87` (b)'s never-blocked starting state. */
export const EMPTY_CONFIG: ConfigArtifact = { version: 0, configured: new Map() };

/**
 * Resolve one key against what this device holds. **Total — it cannot fail and cannot block.**
 *
 * `01-F87` (b): *"A device that has never received the artifact uses the declared default and never
 * blocks"* — `01-F17` and `00 §5.1`, since the alternative is a till that cannot act until the WAN
 * has been up once.
 */
export const resolveConfig = <K extends ConfigKey>(
  artifact: ConfigArtifact,
  key: K,
): Resolved<ConfigValue<K>> => {
  const declaration = CONFIG_KEYS[key] as ConfigKeyDeclaration<ConfigValue<K>>;
  if (!artifact.configured.has(key)) return { value: declaration.default, source: "default" };
  return { value: artifact.configured.get(key) as ConfigValue<K>, source: "configured" };
};

/**
 * `00 §7` (e)'s health minimum: **every key still on its default**, so an operator can tell *the
 * owner set this* from *the owner never has*.
 *
 * Returned rather than rendered, and in registry order so a health strip's line order does not
 * depend on `Map` insertion order — a surface that reordered itself between two reads is the kind
 * of instability `27-F4` exists to prevent, one screen down.
 */
export const configKeysOnDefault = (artifact: ConfigArtifact): readonly ConfigKey[] =>
  CONFIG_KEY_NAMES.filter((key) => !artifact.configured.has(key));

/**
 * `16-F27` — the cell that applies to one tender: an override if the owner typed one, else the
 * default cell she typed.
 *
 * @unreached-owed `16-F32` (R58) puts the TENDER-CHANNEL CHOICE before the unpaid bill prints and
 * **no surface offers it**, so nothing in this product can select a non-default cell yet — which
 * is why `apps/pos-electron/src/main/tax-posture.ts` seeds ONE cell for the whole device and
 * records that a seeded matrix would be *"a branch no caller could reach — this wave's named
 * defect, shipped on purpose"*. The caller lands with `16-F32`'s surface; until then the shipped
 * readers of `01-F82`'s `billed_total` resolve `matrix.default` and this function is the ONE place
 * the override rule is declared, so the five of them cannot each invent
 * `by_tender.find(…) ?? default` and disagree (`16-F33` (a); `03-F40`'s two sensor bit layouts is
 * the corpus's own record of what a second interpretation costs).
 *
 * ⚠ **THIS IS A RENDER/ACT-TIME RESOLUTION AND MUST NEVER BE CALLED FROM A FOLD.** `01-F87`'s
 * point-in-time read is a CAPTURE, not a query: the till resolves the cell at the moment of the act
 * and writes the resolved number into the event, exactly as `01-F53` freezes a price. A fold that
 * called this would make a projected money value a function of `(delivered set, artifact version)`,
 * which is the break the module header describes and which `01-F34`'s property test cannot see.
 */
export const taxCellForTender = (matrix: TaxPostureMatrix, tender: PaymentMethod): TaxCell => {
  const override = matrix.by_tender.find((row) => row.tender === tender);
  return override === undefined ? matrix.default : override.cell;
};

/**
 * One row of the `config` artifact as the wire carries it and as the writer stores it.
 *
 * `deleted` is `01-F75`'s **marked entry, never an absence** applied to a setting: a key the owner
 * has RESET travels as a marked row so a delta can express the reset at all. In a snapshot the two
 * are equivalent (an absent key is a defaulted key), and the row is still carried, for `01-F55`'s
 * reason one resource over — a device that inferred a removal from an absence is a device that
 * cannot tell "reset" from "this page has not arrived yet".
 */
export type ConfigEntry = {
  readonly key: string;
  readonly value?: unknown;
  readonly deleted?: boolean;
};

/**
 * Why an artifact was refused, when it was. `01-F87` (b) declares exactly one refusal reason and
 * names the key, because `01-F56`'s `malformed` must be observable in device health and *"one of
 * your settings is bad"* is not an actionable answer.
 */
export type ConfigArtifactResult =
  | {
      readonly ok: true;
      readonly artifact: ConfigArtifact;
      /** Keys this build does not know — IGNORED, and reported so health can say the cloud is ahead. */
      readonly ignored: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: "malformed";
      readonly key: string;
      readonly detail: string;
    };

/**
 * `01-F87` (b) — **AN UNKNOWN KEY IS IGNORED; A MALFORMED KNOWN KEY REFUSES THE WHOLE ARTIFACT.**
 *
 * The split is not arbitrary and the FR gives both halves: an unknown key means the CLOUD is newer,
 * so refusing punishes a device for the cloud's progress and produces the stopped-till-through-a-
 * validator `01-F75` names; a malformed value means the WRITER emitted bad data, which is a defect
 * and must be loud.
 *
 * ⚠ **THE REFUSAL IS DELIBERATELY BRUTAL AND IT IS WHY CAMPAIGNS ARE NOT A KEY HERE.** One bad row
 * takes an org's tax posture, its charge-rounding granularity and its discount ceiling down at
 * every till. `17-F22` makes exactly that argument for giving campaigns their own resource — *"a
 * campaign set is owner-authored, unbounded in cardinality and edited weekly"* — and `01-F87`
 * argues this carrier's size explicitly: *"the whole of layer 2 is a handful of scalars and two
 * small tables."* What makes the blast radius survivable is the other half of (b): **a refused
 * artifact leaves every key at the version the device already holds, or on its default**, so the
 * till goes on trading. And the writer is where it is prevented — see `refuseConfigWrite`.
 *
 * **NEVER throws.** This arrives off a wire (`01-F56`, `01-F17`): a stopped till is the one
 * unacceptable outcome, so a refusal is a returned value that device health can render.
 */
export const parseConfigArtifact = (
  version: number,
  entries: readonly ConfigEntry[],
): ConfigArtifactResult => {
  const configured = new Map<ConfigKey, unknown>();
  const ignored: string[] = [];
  for (const entry of entries) {
    if (!isConfigKey(entry.key)) {
      // The cloud is newer. `01-F81` (a)'s forward-skew rule, one resource over.
      ignored.push(entry.key);
      continue;
    }
    if (entry.deleted === true) {
      // A RESET. The key returns to its declared default, which is an absence in this map — and
      // the value is not validated because a reset carries none.
      configured.delete(entry.key);
      continue;
    }
    const parsed = CONFIG_KEYS[entry.key].schema.safeParse(entry.value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.join(".") ?? "";
      return {
        ok: false,
        reason: "malformed",
        key: entry.key,
        detail: `${path === "" ? "value" : path}: ${issue?.message ?? "invalid"}`,
      };
    }
    configured.set(entry.key, parsed.data);
  }
  return { ok: true, artifact: { version, configured }, ignored };
};

/**
 * `14-F48` — **WHAT THE WRITER REFUSES TO SAVE.** `null` means it saves.
 *
 * `01-F60` moved catalog price completeness to the writer for a stated reason and `01-F85` moved
 * the tender-typo check there for the same one: *"a typo is caught once at a failed save instead of
 * frozen forever in an append-only ledger."* This is that check, and it is the ONLY declaration of
 * it — `14-F48`'s closing note quotes the measured precedent that a client-side copy which silently
 * disagrees fails **0 of 95** tests, so no surface may carry its own.
 *
 * ⚠ **AN UNKNOWN KEY IS REFUSED HERE AND IGNORED AT THE DEVICE, AND THE ASYMMETRY IS THE POINT.**
 * At the device an unknown key means the cloud is newer. At the writer there is no newer cloud —
 * this build IS the cloud — so an unknown key is a typo, and `01-F87` (a) puts exactly that check
 * here: *"a key string an implementation invents is a `01-F4`-shaped error one layer down."*
 *
 * `14-F48` (n) — *"any key saved without a declared default"* — is unrepresentable rather than
 * checked: `ConfigKeyDeclaration.default` is a required field, so a key with no default does not
 * compile. `config-plane.test.ts` asserts that as a registry invariant so the claim is not only a
 * comment.
 */
export type ConfigWriteRefusal = {
  readonly key: string;
  readonly message: string;
};

export const refuseConfigWrite = (key: string, value: unknown): ConfigWriteRefusal | null => {
  if (!isConfigKey(key))
    return {
      key,
      message:
        `\`${key}\` is not a setting this build declares (01-F87 (a), 14-F48). The key space is ` +
        `open in the ledger and closed at the writer, so a typo is refused once here instead of ` +
        `frozen forever under 01-F1. Known: ${CONFIG_KEY_NAMES.join(", ")}`,
    };
  const parsed = CONFIG_KEYS[key].schema.safeParse(value);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".") ?? "";
  // Name the offending CELL, not just its path — `14-F48`: *"every refusal names the offending row
  // or cell and its reason in the owner's terms"*, and `publishCatalog` records what the other
  // answer costs when the refusal arrives from a bulk import.
  const at = (issue?.path ?? []).reduce<unknown>(
    (node, step) =>
      typeof node === "object" && node !== null
        ? (node as Record<PropertyKey, unknown>)[step as PropertyKey]
        : undefined,
    value,
  );
  const shown = at === undefined ? "" : ` (got ${JSON.stringify(at)})`;
  return {
    key,
    message: `${key}${path === "" ? "" : `.${path}`}: ${issue?.message ?? "invalid"}${shown}`,
  };
};

/**
 * The rows a device may be served — `audience: "device"` only. See `CONFIG_AUDIENCES` for why this
 * is a filter on one artifact rather than a second artifact.
 */
export const isDeviceConfigKey = (key: string): boolean =>
  isConfigKey(key) && CONFIG_KEYS[key].audience === "device";
