import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type PassBridge } from "../shared/ipc";

/**
 * The ONE preload bridge (`18 §9`). Feature code never touches `ipcRenderer`; it calls
 * `window.restos.*`, which is this object and nothing else.
 *
 * Note what is not here: no generic `invoke`, no channel parameter, no escape hatch — the same
 * rule and the same reason as `apps/pos-electron`'s preload. The set of things this renderer can
 * ask for is auditable by reading one file.
 */
const bridge: PassBridge = {
  passState: () => ipcRenderer.invoke(CHANNELS.passState),
  queue: () => ipcRenderer.invoke(CHANNELS.queue),
  // `01-F61` — the identification grid's rows. A read, and reads are free: `03-F53` charges
  // identification on the ACT and never on the look, so this holds no session open and costs
  // nobody an attempt.
  roster: () => ipcRenderer.invoke(CHANNELS.roster),
  // `01-F26`/`01-F28` — the identity and the digits go to MAIN and a yes/no comes back. Nothing
  // here verifies anything and nothing here keeps the PIN: verification is on-device, in main,
  // against the synced Argon2id hashes, and a credential on this side of the bridge would be a
  // secret shipped to the untrusted end for no purpose.
  unlock: (user_id, pin) => ipcRenderer.invoke(CHANNELS.unlock, user_id, pin),
  // `03-F16` — the ready-mark. The renderer sends an order and a line selection; MAIN decides
  // whether this surface owns the signal (`03-F24`) and what edges are legal. A renderer that
  // forged this call gains nothing it could not already reach by pressing the button.
  markReady: (req) => ipcRenderer.invoke(CHANNELS.markReady, req),
  // `03-F52` — the HANDOVER, and it is a second member rather than a flag on the first because
  // the separation IS the FR. One press of DONE emits `ready` and only `ready`; this is the act
  // that follows it, it is terminal (`01-F35`), and MAIN decides whether this surface owns it.
  handOver: (req) => ipcRenderer.invoke(CHANNELS.handOver, req),
  onChanged: (fn) => {
    const handler = () => fn();
    ipcRenderer.on(CHANNELS.changed, handler);
    return () => {
      ipcRenderer.off(CHANNELS.changed, handler);
    };
  },
};

contextBridge.exposeInMainWorld("restos", bridge);
