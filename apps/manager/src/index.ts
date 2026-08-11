// Expo entry point (`package.json` "main"). `registerRootComponent` is the RN equivalent of
// `AppRegistry.registerComponent` plus the Expo-specific root wrapper; it is what makes
// `pnpm -C apps/manager start` a real command rather than a declared one.
//
// Spec: specs/05-manager-console.md. Read `05-F29` (the ruling) and this app's CLAUDE.md
// before adding anything here — the surface is ruled, not yet unblocked.
import { registerRootComponent } from "expo";
import { App } from "./App";

registerRootComponent(App);
