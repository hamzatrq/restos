// verifyDeviceToken — the NAMED auth seam (01-F27; T-01-07 assumption 7). At
// Wave 0 it accepts exactly the unsigned base64url-JSON dev-token shape with
// claims { org_id, branch_id, device_id }. This validates SHAPE and CONSISTENCY
// only — it is not authentication. T-01-09 swaps these internals for jose
// verification + device-registry/revocation checks with the same claims
// contract; nothing else changes.
export type DeviceTokenClaims = { org_id: string; branch_id: string; device_id: string };

const claim = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

export const verifyDeviceToken = (token: string): DeviceTokenClaims | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const org_id = claim(record.org_id);
  const branch_id = claim(record.branch_id);
  const device_id = claim(record.device_id);
  if (org_id === null || branch_id === null || device_id === null) return null;
  return { org_id, branch_id, device_id };
};
