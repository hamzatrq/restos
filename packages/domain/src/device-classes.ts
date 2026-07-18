// Device classes (01-F39): fixed slice + hub rules per class. Order of
// HUB_ELIGIBLE_CLASSES is hub-election priority (sync-client HUB-ELECTION.md).
export const DEVICE_CLASSES = [
  "counter_electron",
  "counter_rn",
  "kitchen",
  "manager",
  "waiter",
  "rider",
] as const;

export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const HUB_ELIGIBLE_CLASSES = ["counter_electron", "counter_rn", "kitchen"] as const;
