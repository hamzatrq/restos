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
import { managerHomeNow } from "./home";
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
 * `05-F22`/`05-F23` — **the console's own honesty line, and the only thing this app is entitled to
 * say about alarms today.**
 *
 * `home.ts` computes it; this reads it. Both states are rendered by the same row, so the day a
 * branch stream lands the sentence changes and this file does not.
 *
 * ⚠ **The alarm CARDS are owed and are deliberately not drawn here.** `05-F1`'s "order, channel,
 * table, age" and `05-F3`'s printer are all on the `Alarm` rows `alarms.ts` returns, and there is
 * no `21-F2`-compliant way to lay them out: `packages/ui` ships no RN components (`18 §2` specifies
 * an RN kit; the repo built all 18 against React DOM), and this file's raw-primitive breach is
 * confined to diagnostics for the reason its header gives. Drawing them anyway would also be
 * unreachable code today — `managerHomeNow()` cannot return `known: true` while no plane carries a
 * queue — which is precisely AGENTS.md's second recurring defect written on purpose.
 */
const branchHonesty = (): ProbeResult => {
  const home = managerHomeNow();
  return {
    label: "05-F22/05-F23 — branch reachability and the alarm gap",
    detail: home.honesty,
    verdict: home.reachable ? "ok" : "blocked",
  };
};

export const App = () => {
  const [pin, setPin] = useState<ProbeResult>(PENDING);

  useEffect(() => {
    // Argon2id is the one measurement that cannot be taken synchronously — it IS the work.
    void pinVerifyCost().then(setPin);
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>RestOS Manager — 05-F29 feasibility probe</Text>
      <Text style={styles.caveat}>
        Not the console. No branch data: sync-client cannot open a store on this platform.
      </Text>
      <Row result={branchHonesty()} />
      <Row result={pin} />
      <Row result={foldEngineLoads()} />
      <Row result={tokensLoad()} />
      <Row result={randomnessForEnrolment()} />
    </ScrollView>
  );
};
