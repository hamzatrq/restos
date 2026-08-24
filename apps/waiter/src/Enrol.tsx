import { Panel, TextEntry, Tile, WorkSurface } from "@restos/ui";
import { useState } from "react";
import type { TerminalClient } from "./terminal-client";

/**
 * `04-F22` (b) — the one screen an unenrolled tablet can reach.
 *
 * An operator reads the code off the till and types it here, ONCE. Everything after this is signed
 * by a key the browser will not export, so this screen is the only moment at which a human decides
 * that this piece of glass may reach the branch ledger at all.
 *
 * ⚠ **The code arrives on the till's BOOT LINE in build 1, not on its screen.** That is the honest
 * limit rather than the design: `14-F13`'s device list is where an owner-facing enrolment belongs,
 * and putting it there is owed. Until then the operator needs the till's console, which is the same
 * shell-access limitation `01-F25`'s pairing code already has.
 */
export const Enrol = ({
  client,
  onDone,
}: {
  client: TerminalClient;
  onDone: () => void;
}): React.JSX.Element => {
  const [code, setCode] = useState("");
  const [refused, setRefused] = useState(false);
  return (
    <WorkSurface>
      <Panel
        title="Set up this tablet"
        note={refused ? "That code did not work. Ask for a new one at the till." : undefined}
        tone={refused ? "abnormal" : "neutral"}
      >
        <TextEntry
          posture="handheld"
          caption="Code from the till"
          value={code}
          onChange={(next) => {
            setCode(next);
            setRefused(false);
          }}
        />
        <Tile
          posture="handheld"
          label="Set up"
          onPress={async () => {
            const ok = await client.enrol(code);
            setCode("");
            if (ok) onDone();
            else setRefused(true);
          }}
        />
      </Panel>
    </WorkSurface>
  );
};
