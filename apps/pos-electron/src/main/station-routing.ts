/**
 * # `03-F22` / `03-F51` — where a station's food ticket GOES, and why absence is a setting
 *
 * `03-F22` has said since Draft 1 that KDS *"may run alongside printers (screen + paper) or
 * **replace them per station** — layer-2 choice"*. **Nothing in this product ever read it.** So
 * every station was assumed to have paper, and a restaurant that owns no thermal printer got the
 * following, measured rather than predicted:
 *
 *   `unattachedPrinter` reports no answer → `03-F4`'s three attempts exhaust → `03-F5` raises a
 *   permanent S1 band with a repeating sound → `printing.ts` appends a **permanent**
 *   `kot.print_failed` per exhausted job into an append-only ledger (`01-F1`) → `05-F3` alarms the
 *   manager → `15-F14` pages vendor support on *"`kot.print_failed` rates"*.
 *
 * A printerless branch therefore generated real, unbounded vendor-support load for ever and
 * polluted its own ledger irreversibly, and `15-F10`'s runbook gated doc 14's go-live checklist on
 * a printer so it could not even finish onboarding. Under `DEC-HW-001`'s bring-your-own-hardware
 * ruling that is the product asserting a purchase. `03-F51` makes it a configuration.
 *
 * ## The one distinction this whole module exists to hold
 *
 * **ABSENCE is decided BEFORE a job exists, from configuration. FAILURE is decided AFTER a job
 * exists, from a transport outcome.** Nothing here inspects a transmit, a job state, an attempt
 * count or a `03-F5` band, and nothing here may ever be consulted after `spooler.enqueue`. That is
 * what keeps `03-F5` at full strength where paper IS the route: a printer that is expected and does
 * not answer is still loud, still appends `kot.print_failed`, still bands until acknowledged. The
 * only thing configuration may do is decline to create the job in the first place.
 *
 * Collapsing those two is the obvious way to get this wrong, and it would look like a fix: a
 * "suppress the band when the printer never answers" heuristic reads the same on the screen and
 * turns a real broken printer into `03-F5`'s named forbidden state on every branch that has one.
 *
 * ## Why this file knows nothing about a hardware tier
 *
 * `DEC-HW-003` recommends that the T1/T2/T3 ladder is a derived LABEL and the capability set is
 * the model, with one checkable consequence: **no code may branch on the tier to decide whether a
 * piece of hardware exists.** So `validateStationRoutes` takes the kitchen-screen capability as a
 * plain tri-state VALUE (`true` / `false` / `null` = not known) and `main/index.ts` is the one
 * place that maps `02-F31`'s tier onto it. `routeFor` — the decision the product actually makes
 * per ticket — reads only the configured routes and never any capability at all.
 *
 * ## Layer 2, read from the environment, for `hardware-tier.ts`'s reason
 *
 * `03-F50` already lists *"KDS-vs-printer per station"* among what stays layer-2 config, and
 * `00 §7` layer 2 now names the key. Layer 2 has no transport to a device — `config.changed` is
 * org-scoped under `01-F62` and no device folds it — so every layer-2 value in this app is either
 * pinned in code or read from the environment, and this takes the second shape because an operator
 * may need to change it on the day.
 */

/**
 * `03-F22`'s three cases, named. `03-F51` fixes the vocabulary.
 *
 * There is deliberately no fourth value for *"nowhere"*. A station with no destination is not a
 * configuration the product offers — it is the state `validateStationRoutes` refuses — and making
 * it unspellable is cheaper than making it refusable at every call site.
 */
export const FULFILMENT_ROUTES = ["paper", "screen", "both"] as const;
export type FulfilmentRoute = (typeof FULFILMENT_ROUTES)[number];

/**
 * The route a station takes when the configuration names no route for it, and when a configuration
 * is REFUSED.
 *
 * `paper` for one reason and it is not inertia: it is the behaviour of every branch before this key
 * existed, so an org that sets nothing sees no change, and a REFUSED configuration falls back to a
 * route whose failures are LOUD (`03-F5`) rather than to one that silently swallows tickets. Paper
 * a device cannot print says so within 45 s; a screen that does not exist says nothing, ever.
 */
export const DEFAULT_FULFILMENT_ROUTE: FulfilmentRoute = "paper";

/** `00 §7` layer 2 — the station fulfilment routes, as this host reads them. */
export const STATION_ROUTES_ENV = "RESTOS_STATION_ROUTES";

/** The station key that sets the default for every station not named explicitly. */
export const DEFAULT_STATION_KEY = "*";

export type ParsedStationRoutes = {
  /** Explicit `station → route` entries. Never contains `DEFAULT_STATION_KEY`. */
  readonly routes: ReadonlyMap<string, FulfilmentRoute>;
  /** `*=<route>`, or the shipped default where the configuration did not set one. */
  readonly default_route: FulfilmentRoute;
  /** Entries this parser could not read, verbatim. A malformed entry is REFUSED, never guessed. */
  readonly malformed: readonly string[];
};

const isRoute = (raw: string): raw is FulfilmentRoute =>
  (FULFILMENT_ROUTES as readonly string[]).includes(raw);

/**
 * `station=route` pairs, comma-separated, with `*=route` setting the default.
 *
 * Example: `RESTOS_STATION_ROUTES="*=screen,tandoor=paper"` — a screen-only kitchen whose tandoor
 * still prints. `"*=screen"` is the whole configuration a printerless restaurant needs.
 *
 * **Every unreadable entry is COLLECTED rather than skipped.** A parser that dropped
 * `grill=sceen` on the floor would leave the grill on paper for ever with nothing said, which is a
 * quieter version of the defect this FR exists to remove — `00 §5.7` wants the surface to report
 * what is TRUE, and *"I could not read four of your five settings"* is the true thing.
 */
export const parseStationRoutes = (raw: string | undefined): ParsedStationRoutes => {
  const routes = new Map<string, FulfilmentRoute>();
  const malformed: string[] = [];
  let default_route: FulfilmentRoute = DEFAULT_FULFILMENT_ROUTE;
  for (const entry of (raw ?? "").split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const split = trimmed.indexOf("=");
    const station = split === -1 ? "" : trimmed.slice(0, split).trim();
    const route = split === -1 ? "" : trimmed.slice(split + 1).trim();
    if (station === "" || !isRoute(route)) {
      malformed.push(trimmed);
      continue;
    }
    if (station === DEFAULT_STATION_KEY) default_route = route;
    else routes.set(station, route);
  }
  return { routes, default_route, malformed };
};

export type StationRouteVerdict =
  /** Every configured station has somewhere its food can be seen. */
  | { readonly ok: true; readonly verified: true }
  /**
   * Nothing is wrong that this device can see, and it could not see everything. `03-F51`: *"an
   * unknown is not a blessing"*, so this is a THIRD outcome and not a pass.
   */
  | { readonly ok: true; readonly verified: false; readonly unverified: readonly string[] }
  /** `03-F51`'s configuration-time refusal, with the reason and the stations named. */
  | { readonly ok: false; readonly reason: string; readonly stations: readonly string[] };

/**
 * `03-F51`'s configuration-time check: **does every station have somewhere its food can be seen?**
 *
 * Two ways to fail, and they are different acts by the operator:
 *
 *  - an entry that could not be READ (`grill=sceen`) — the operator meant something and the product
 *    does not know what, so applying the rest of the configuration would silently apply half of an
 *    intention. Refused whole.
 *  - a station routed to a screen at a branch that has NO pass/KDS device — the operator meant
 *    exactly what they wrote and the branch cannot honour it. This is the refusal `03-F51` was
 *    written for: those lines would be cooked by nobody, and the counter would never learn, because
 *    a job that is never enqueued can never raise `03-F5`.
 *
 * `kitchen_screen: null` is the third answer and it is the ONE this device gives today: `02-F31`'s
 * branch device registry reaches no device (`01-F62`), so nothing here can tell a screen-only
 * kitchen from a kitchen with no screen. Reporting that as a pass is the dishonesty `00 §5.7`
 * forbids one surface over, so it is reported as **unverified** and the configuration still applies
 * — refusing on an unknown would make every screen-only branch unconfigurable for the whole of the
 * window in which the roster is unreachable, which is the harm this work removes, inverted.
 */
export const validateStationRoutes = (input: {
  readonly parsed: ParsedStationRoutes;
  /** Does this branch have a pass screen or a KDS at all? `null` where this device cannot tell. */
  readonly kitchen_screen: boolean | null;
}): StationRouteVerdict => {
  const { parsed, kitchen_screen } = input;
  if (parsed.malformed.length > 0) {
    return {
      ok: false,
      reason:
        `${STATION_ROUTES_ENV} could not be read — every entry must be ` +
        `<station>=${FULFILMENT_ROUTES.join("|")} and "${DEFAULT_STATION_KEY}" sets the default`,
      stations: parsed.malformed,
    };
  }
  // A station whose ONLY destination is glass. `both` is deliberately absent: it still prints, so
  // its lines reach a cook whether or not the screen exists, and refusing it would refuse the very
  // configuration `03-F22`'s first case describes ("screen + paper").
  const screen_only = [
    ...(parsed.default_route === "screen" ? [DEFAULT_STATION_KEY] : []),
    ...[...parsed.routes].filter(([, route]) => route === "screen").map(([station]) => station),
  ];
  if (screen_only.length === 0) return { ok: true, verified: true };
  if (kitchen_screen === null) return { ok: true, verified: false, unverified: screen_only };
  if (kitchen_screen) return { ok: true, verified: true };
  return {
    ok: false,
    reason:
      "this branch has no pass screen and no KDS, so a station routed to a screen has no route " +
      "to the kitchen at all — route it to paper, or register the screen (03-F51, 02-F31)",
    stations: screen_only,
  };
};

export type StationRoutingSource =
  /** `00 §7` layer 2's key was set and accepted. */
  | "configured"
  /** The key was set and REFUSED. The shipped default applies and the reason is reported. */
  | "refused"
  /** The key was not set. Every station takes paper, exactly as before this key existed. */
  | "default";

export type StationRouting = {
  /** `03-F51` — what happens to this station's lines. The ONLY question the printer asks. */
  readonly routeFor: (station: string) => FulfilmentRoute;
  /**
   * `03-F51`'s seam into `main/printing.ts`, as the one boolean that file needs.
   *
   * Deliberately narrower than `routeFor`: the printer must not learn the vocabulary, because a
   * printer that could see `"screen"` is a printer that could grow a second opinion about what a
   * screen-only station means, and there would then be two.
   */
  readonly routesToPaper: (station: string) => boolean;
  readonly source: StationRoutingSource;
  readonly verdict: StationRouteVerdict;
};

/**
 * The whole chain as one pure function, so it is testable without Electron and without a printer.
 *
 * **A refused configuration is not applied and does not stop anything** (`01-F17`, commandment 4).
 * The branch keeps `DEFAULT_FULFILMENT_ROUTE`, the reason travels out in `verdict`, and the boot
 * line says it at length. Throwing here would take a till off the counter over a typo in a setting
 * whose entire purpose is to stop the product from being precious about hardware.
 */
export const resolveStationRouting = (input: {
  /** `00 §7` layer 2 — `RESTOS_STATION_ROUTES`. Raw, as it arrives; parsed and refused here. */
  readonly configured: string | undefined;
  /** Does this branch have a pass screen or a KDS at all? `null` where this device cannot tell. */
  readonly kitchen_screen: boolean | null;
}): StationRouting => {
  const parsed = parseStationRoutes(input.configured);
  const verdict = validateStationRoutes({ parsed, kitchen_screen: input.kitchen_screen });
  const configured = (input.configured ?? "").trim() !== "";
  const applied = verdict.ok ? parsed : parseStationRoutes(undefined);
  const source: StationRoutingSource = !verdict.ok
    ? "refused"
    : configured
      ? "configured"
      : "default";
  const routeFor = (station: string): FulfilmentRoute =>
    applied.routes.get(station) ?? applied.default_route;
  return {
    routeFor,
    routesToPaper: (station) => routeFor(station) !== "screen",
    source,
    verdict,
  };
};

/**
 * What the boot line says. `00 §5.7`, and on this value being wrong is invisible from the screen in
 * BOTH directions: a station wrongly on paper bands for ever, and a station wrongly on a screen
 * nobody has cooks nothing and says nothing at all. The second is the quieter and the worse.
 */
export const describeStationRouting = (routing: StationRouting): string => {
  const head = `kitchen routes: ${routing.source} (03-F22/03-F51, ${STATION_ROUTES_ENV})`;
  if (!routing.verdict.ok) {
    return (
      `${head} — REFUSED and NOT APPLIED: ${routing.verdict.reason}.` +
      ` Offending: ${routing.verdict.stations.join(", ")}.` +
      ` Every station is printing to paper until this is corrected, so 03-F5 will band if no` +
      ` printer answers — that is the loud fallback and it is deliberate (03-F51).`
    );
  }
  if (!routing.verdict.verified) {
    return (
      `${head} — screen-only: ${routing.verdict.unverified.join(", ")}.` +
      ` NOT VERIFIED: 02-F31's branch device registry does not reach this device (01-F62), so` +
      ` nothing here can confirm a pass screen or a KDS exists. Those stations will spool NO print` +
      ` job, so if no screen is running their tickets reach nobody and 03-F5 cannot warn you —` +
      ` a job that is never created can never fail.`
    );
  }
  return `${head} — every station has a route`;
};
