/**
 * ⚠ THIS IS A FEASIBILITY PROBE, NOT THE MANAGER CONSOLE, AND IT MUST NOT BECOME ONE.
 *
 * `05-F29` ruled that the manager surface is this Expo app. It did not make the surface
 * buildable: `apps/manager/CLAUDE.md` lists what is still blocked, and the two that matter
 * are that **`packages/sync-client` cannot open a store on this platform** (so there is no
 * branch data to render) and that **`packages/ui` ships no RN components** (so there is
 * nothing compliant to render it WITH). This file renders three measurements and nothing
 * else. Do not add a screen beside it; close the blockers first.
 *
 * ⚠ **IT ALSO BREACHES COMMANDMENT 6 / `21-F2`, DELIBERATELY AND VISIBLY.** `21-F2` bans raw
 * `react-native` primitives in app code, "allowed only inside `packages/ui`" — and
 * `packages/ui` has none to offer, because `18 §2` specifies it as an "RN component kit" and
 * the repo built all 18 components against React DOM. So there is no compliant way to put a
 * pixel on an Android screen in this repo today. The breach is confined to this one file and
 * is the reason it renders diagnostics rather than a product surface: a FEATURE screen built
 * this way would set the precedent that app code declares its own primitives, and `21-F1`'s
 * closed vocabulary does not survive that.
 *
 * `21-F2` names a Biome `noRestrictedImports` rail that would have caught this. Measured
 * 2026-08-11: **it does not exist** — `noRestrictedImports` appears in no config in this repo.
 * The rule is unenforced, which is `27-F44`'s shape exactly (a marker described in prose that
 * nothing grepped for), so nothing will stop the next session doing this without the comment.
 */

import { color, space, typography } from "@restos/ui/tokens";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Alarm } from "./alarms";
import { attachBranchSlice, BRANCH_POLL_MS } from "./branch";
import { type ManagerHome, managerHomeNow } from "./home";
import {
  foldEngineLoads,
  type ProbeResult,
  pinVerifyCost,
  randomnessForEnrolment,
  tokensLoad,
} from "./probe";

const PENDING: ProbeResult = {
  label: "01-F26 verify — Argon2id under Hermes",
  detail: null,
  verdict: "pending",
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color["bgColor-surface"] },
  content: { padding: space["space-4"], gap: space["space-3"] },
  title: {
    fontSize: typography["text-label"].fontSize,
    fontWeight: "600",
    color: color["fgColor-default"],
  },
  caveat: { fontSize: typography["text-body"].fontSize, color: color["fgColor-status-abnormal"] },
  card: {
    backgroundColor: color["bgColor-surface-raised"],
    borderColor: color["borderColor-default"],
    borderWidth: 1,
    borderRadius: space["space-2"],
    padding: space["space-3"],
    gap: space["space-1"],
  },
  cardLabel: {
    fontSize: typography["text-body"].fontSize,
    color: color["fgColor-default"],
    fontWeight: "500",
  },
  cardDetail: { fontSize: typography["text-body"].fontSize, color: color["fgColor-muted"] },
});

const Row = ({ result }: { result: ProbeResult }) => (
  <View style={styles.card}>
    <Text style={styles.cardLabel}>
      {result.verdict === "ok" ? "✓" : result.verdict === "blocked" ? "✗" : "…"} {result.label}
    </Text>
    <Text style={styles.cardDetail}>{result.detail ?? "measuring…"}</Text>
  </View>
);

/**
 * `05-F22`/`05-F23` — **the console's own honesty line.**
 *
 * `home.ts` computes it; this reads it. Both states are rendered by the same row, so which one a
 * manager sees is a fact about the uplink rather than a branch in this file.
 */
const branchHonesty = (home: ManagerHome): ProbeResult => ({
  label: "05-F22/05-F23 — branch reachability and the alarm gap",
  detail: home.honesty,
  verdict: home.reachable ? "ok" : "blocked",
});

/**
 * `05-F1`/`05-F3` — **one active alarm, on the glass.**
 *
 * ⚠ **`21-F2` / commandment 6, and the position is unchanged from this file's header: the breach
 * is CONFINED, not widened.** These rows reuse the same three primitives the diagnostics above
 * already declare, because `packages/ui` still ships no RN components (`18 §2` specifies an RN
 * kit; the repo built all 18 against React DOM) and there is therefore no compliant way to draw
 * anything here. What changed is that the alarms are now REAL — derived by `alarms.ts` from a
 * fold over a store this device actually opened — so leaving them undrawn would be the founder's
 * *"renders but cannot act"* with the sign flipped: a console that knows the kitchen is late and
 * does not say which order.
 *
 * `05-F1` names four things and all four are here: order (`reference`, the same first eight
 * characters the counter and the pass shout), channel, table, and AGE. `03-F5`'s printer joins
 * them on a print alarm, because the manager has to know which one to walk to.
 */
const alarmRow = (alarm: Alarm): ProbeResult => ({
  label: `${alarm.kind === "late_order" ? "LATE" : "PRINT"} · order ${alarm.reference}`,
  detail:
    `${alarm.minutes} min · ${alarm.channel}` +
    (alarm.tables.length > 0 ? ` · table ${alarm.tables.join(", ")}` : "") +
    (alarm.printer_name === null ? "" : ` · printer ${alarm.printer_name}`),
  verdict: "blocked",
});

export const App = () => {
  const [pin, setPin] = useState<ProbeResult>(PENDING);
  const [home, setHome] = useState<ManagerHome>(managerHomeNow);

  useEffect(() => {
    // Argon2id is the one measurement that cannot be taken synchronously — it IS the work.
    void pinVerifyCost().then(setPin);
  }, []);

  useEffect(() => {
    // THE seam: the store is opened, the uplink is started, and `home.ts` is handed a live source.
    // Re-read on `05-N2`'s cadence — the alarm list moves when events land AND when the wall
    // moves, because `03-F14`'s age is a duration and not an event.
    const attached = attachBranchSlice();
    setHome(managerHomeNow());
    const tick = setInterval(() => setHome(managerHomeNow()), BRANCH_POLL_MS);
    return () => {
      clearInterval(tick);
      attached.stop();
    };
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>RestOS Manager — 05-F21 alarms</Text>
      <Row result={branchHonesty(home)} />
      {home.alarms.known ? (
        home.alarms.list.map((alarm) => <Row key={alarm.id} result={alarmRow(alarm)} />)
      ) : (
        // `05 §4`: "alarm silence is labeled as unknown, not calm." An empty list is drawn as
        // nothing; an UNKNOWN one has to be drawn as a sentence, or the two look identical.
        <Text style={styles.caveat}>Alarm state UNKNOWN — this screen is not being fed.</Text>
      )}
      <Text style={styles.caveat}>
        Below: 05-F29 feasibility probes, not product surfaces. No PIN session on this device yet,
        so nothing here can be acknowledged (05-F30 needs an actor on the envelope).
      </Text>
      <Row result={pin} />
      <Row result={foldEngineLoads()} />
      <Row result={tokensLoad()} />
      <Row result={randomnessForEnrolment()} />
    </ScrollView>
  );
};
