import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, type RestosBridge } from "../shared/ipc";

/**
 * The ONE preload bridge (`18 §9`). Feature code never touches `ipcRenderer`; it calls
 * `window.restos.*`, which is this object and nothing else.
 *
 * Note what is not here: no generic `invoke`, no channel parameter, no escape hatch. A
 * bridge that can be handed an arbitrary channel name is not a bridge, it is `ipcRenderer`
 * with extra steps — and the ban in `18 §9` exists so that the set of things a renderer can
 * ask for is auditable by reading one file.
 */
const bridge: RestosBridge = {
  deviceState: () => ipcRenderer.invoke(CHANNELS.deviceState),
  openOrders: () => ipcRenderer.invoke(CHANNELS.openOrders),
  kitchenQueue: () => ipcRenderer.invoke(CHANNELS.kitchenQueue),
  menu: () => ipcRenderer.invoke(CHANNELS.menu),
  // `01-F61` — the identification grid's roster, in the order main supplies it (`27-F4`).
  staff: () => ipcRenderer.invoke(CHANNELS.staff),
  // `02-F23`/`02-F37`/`02-F43` — the `shift_cash` projection behind Cash and Me. Optional on
  // the contract, always served here: this bridge is the one main actually ships.
  cashState: () => ipcRenderer.invoke(CHANNELS.cashState),
  // `03-F5`/`27-F11g` — the print-failure band and its acknowledgement. Optional on the
  // contract, always served here, for the same reason as `cashState` directly above: this
  // bridge is the one main actually ships, and where paper is the only kitchen channel this
  // band is the ONLY signal that food is not being cooked.
  alarms: () => ipcRenderer.invoke(CHANNELS.alarms),
  acknowledgeAlarm: (alarm_id) => ipcRenderer.invoke(CHANNELS.acknowledgeAlarm, alarm_id),
  append: (req) => ipcRenderer.invoke(CHANNELS.append, req),
  addLine: (req) => ipcRenderer.invoke(CHANNELS.addLine, req),
  // `02-F20`'s local manager-PIN path. Optional on the contract, always served here, for the
  // reason `cashState` and `alarms` record above: this bridge is the one main actually ships.
  // The offer is display data read off the matrix; the approval is the credential call.
  escalationFor: (req) => ipcRenderer.invoke(CHANNELS.escalationFor, req),
  escalate: (req, approver_user_id, pin) =>
    ipcRenderer.invoke(CHANNELS.escalate, req, approver_user_id, pin),
  // `01-F28` — an identity and the digits go one way and a yes/no comes back. Verification is
  // main's. `01-F61`: the identity is what the failure counter is keyed on, so it travels with
  // the attempt rather than being inferred from the PIN at the far end.
  unlock: (user_id, pin) => ipcRenderer.invoke(CHANNELS.unlock, user_id, pin),
  onChanged: (fn) => {
    const handler = () => fn();
    ipcRenderer.on(CHANNELS.changed, handler);
    return () => {
      ipcRenderer.off(CHANNELS.changed, handler);
    };
  },
};

contextBridge.exposeInMainWorld("restos", bridge);
