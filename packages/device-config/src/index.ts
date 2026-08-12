// @restos/device-config — the `00 §7` configuration a DEVICE HOST resolves at boot, once, for
// every app that runs on a till. Each module is a `resolveX` that reads an environment string and
// a `describeX` that says on the boot line which source answered (`00 §5.7`).
//
// It lives in a package rather than in the app that wrote it because each of the three acquired a
// SECOND consumer: `18 §2` states the dependency direction as a MUST — "Apps NEVER import ...
// other apps" — and DEC-ARCH-001 (RULED, founder) answers this exact situation one layer over,
// extracting at the moment the second consumer appears rather than copying. `aging.ts` was
// `apps/pass-kds`'s and reached across to the counter; `device-identity.ts` and `panel-density.ts`
// were `apps/pos-electron`'s and reached across to the pass — which made the two apps a CYCLE.
export {
  AGING_THRESHOLDS_ENV,
  type AgingPolicy,
  type AgingSource,
  type AgingThresholds,
  DEFAULT_AGING_THRESHOLDS,
  describeAging,
  FALLBACK_AGING,
  type ParsedAging,
  parseAgingThresholds,
  resolveAging,
} from "./aging.js";
export {
  DEV_PIN_ENV,
  DEV_STAFF,
  type DevStaffRegistry,
  seedDevStaff,
} from "./dev-staff.js";
export {
  DEV_IDENTITY,
  type DeviceIdentity,
  describeDeviceIdentity,
  IDENTITY_ENV,
  resolveDeviceIdentity,
} from "./device-identity.js";
export {
  DEFAULT_LAN_LISTEN_HOST,
  describeLanMesh,
  LAN_MESH_ENV,
  LAN_PEERS_EXAMPLE,
  type LanMeshConfig,
  type LanPeer,
  resolveLanMesh,
} from "./lan-mesh.js";
export {
  type DisplayFacts,
  describePanelDensity,
  measurePhysicalWidthMm,
  type PanelDensity,
  type PanelDensitySource,
  PLAUSIBLE_PPI,
  ppiFromDiagonal,
  ppiFromWidthMm,
  REFERENCE_COUNTER_DIAGONAL_IN,
  resolvePanelDensity,
} from "./panel-density.js";
export {
  describeServeSignal,
  resolveServeSignal,
  SERVE_SIGNAL_OWNER_ENV,
  SERVE_SIGNAL_OWNERS,
  type ServeSignalOwner,
  type ServeSignalPolicy,
  type ServeSignalSource,
} from "./serve-signal.js";
