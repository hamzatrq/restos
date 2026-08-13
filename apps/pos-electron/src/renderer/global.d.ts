import type { RestosBridge } from "../shared/ipc";

declare global {
  interface Window {
    restos: RestosBridge;
  }
}
