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
  append: (req) => ipcRenderer.invoke(CHANNELS.append, req),
  addLine: (req) => ipcRenderer.invoke(CHANNELS.addLine, req),
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
