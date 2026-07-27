// INDEPENDENT colour-science oracle. Written from the published formulas, NOT derived from
// `../color-science.ts`, and deliberately not importing it.
//
// PROVENANCE: authored by the oracle session of 24 §3 step 2, which is not the session that
// wrote `color-science.ts`. The point of a second implementation is that a wrong
// implementation with tests written against itself is perfectly self-consistent and
// completely wrong. This file is what makes the token tests an independent check rather than
// a restatement.
//
// VALIDATED against the Sharma, Wu & Dalal (2005) 34-pair reference data — see
// `color-oracle.test.ts`, which fails if this implementation ever drifts from the published
// formula. Do not "fix" this file to agree with `color-science.ts`; fix whichever one the
// reference data says is wrong.
//
// Sources:
//   IEC 61966-2-1                     sRGB transfer function
//   WCAG 2.2 relative luminance       https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
//   Sharma, Wu & Dalal 2005           CIEDE2000 formulation + test data
//   Machado, Oliveira & Fernandes 2009  dichromacy simulation, severity 1.0, LINEAR RGB

export type Lab = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

export type Dichromacy = "protanopia" | "deuteranopia" | "tritanopia";
export const DICHROMACIES: readonly Dichromacy[] = ["protanopia", "deuteranopia", "tritanopia"];

/** Normal vision plus every dichromacy — the population a status colour must serve. */
export type Vision = "normal" | Dichromacy;
export const VISIONS: readonly Vision[] = ["normal", ...DICHROMACIES];

const parseByte = (hex: string, at: number): number => {
  const v = Number.parseInt(hex.slice(at, at + 2), 16);
  if (Number.isNaN(v)) throw new Error(`not a 6-digit hex colour: ${hex}`);
  return v;
};

export const hexToRgb = (hex: string): Rgb => {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length !== 6) throw new Error(`expected #RRGGBB, got ${hex}`);
  return [parseByte(h, 0), parseByte(h, 2), parseByte(h, 4)];
};

/** IEC 61966-2-1 electro-optical transfer function. Threshold 0.04045 on the ENCODED value. */
export const eotf = (encoded: number): number =>
  encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;

/** Its inverse. Threshold 0.0031308 on the LINEAR value — a different number on purpose. */
export const oetf = (linear: number): number =>
  linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;

export const hexToLinear = (hex: string): Rgb => {
  const [r, g, b] = hexToRgb(hex);
  return [eotf(r / 255), eotf(g / 255), eotf(b / 255)];
};

const clamp255 = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));

export const linearToHex = (linear: Rgb): string => {
  const bytes = linear.map((v) => {
    const encoded = oetf(v);
    return clamp255((Number.isFinite(encoded) ? encoded : 0) * 255);
  });
  return `#${bytes.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/** WCAG 2.2 relative luminance: coefficients apply to LINEARISED channels. */
export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2.2 contrast ratio. The +0.05 offsets model ambient flare and are not optional. */
export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// sRGB (D65) -> XYZ, IEC 61966-2-1.
const RGB_TO_XYZ: readonly Rgb[] = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const WHITE_D65: Rgb = [0.95047, 1.0, 1.08883];
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

const row = (m: readonly Rgb[], i: number): Rgb => {
  const r = m[i];
  if (!r) throw new Error(`matrix row ${i} missing`);
  return r;
};

export const hexToLab = (hex: string): Lab => {
  const lin = hexToLinear(hex);
  const project = (i: number): number => {
    const [a, b, c] = row(RGB_TO_XYZ, i);
    return a * lin[0] + b * lin[1] + c * lin[2];
  };
  const f = (t: number): number => (t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116);
  const fx = f(project(0) / WHITE_D65[0]);
  const fy = f(project(1) / WHITE_D65[1]);
  const fz = f(project(2) / WHITE_D65[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

export const lightness = (hex: string): number => hexToLab(hex)[0];

const DEG = Math.PI / 180;

/**
 * CIEDE2000, Sharma/Wu/Dalal 2005. The three places implementations go wrong are all written
 * out longhand here rather than compressed: the ±180 wrap on Δh′, the four-branch mean hue
 * H̄′, and the rotation term R_T.
 */
export const deltaE00 = (c1: Lab, c2: Lab): number => {
  const [l1, a1, b1] = c1;
  const [l2, a2, b2] = c2;

  const cab1 = Math.sqrt(a1 * a1 + b1 * b1);
  const cab2 = Math.sqrt(a2 * a2 + b2 * b2);
  const cabBar = (cab1 + cab2) / 2;
  const cabBar7 = cabBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cabBar7 / (cabBar7 + 25 ** 7)));

  const ap1 = (1 + g) * a1;
  const ap2 = (1 + g) * a2;
  const cp1 = Math.sqrt(ap1 * ap1 + b1 * b1);
  const cp2 = Math.sqrt(ap2 * ap2 + b2 * b2);

  const hue = (b: number, ap: number): number => {
    if (ap === 0 && b === 0) return 0;
    const h = Math.atan2(b, ap) / DEG;
    return h < 0 ? h + 360 : h;
  };
  const hp1 = hue(b1, ap1);
  const hp2 = hue(b2, ap2);

  const dLp = l2 - l1;
  const dCp = cp2 - cp1;

  // Δh′ — the ±180 wrap. A single `if (d > 180) d -= 360` is the usual bug.
  let dhp: number;
  if (cp1 * cp2 === 0) dhp = 0;
  else if (Math.abs(hp2 - hp1) <= 180) dhp = hp2 - hp1;
  else if (hp2 - hp1 > 180) dhp = hp2 - hp1 - 360;
  else dhp = hp2 - hp1 + 360;
  const dHp = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dhp / 2) * DEG);

  const lpBar = (l1 + l2) / 2;
  const cpBar = (cp1 + cp2) / 2;

  // H̄′ — four branches, and the `< 360` test is on the SUM, not on either hue.
  let hpBar: number;
  if (cp1 * cp2 === 0) hpBar = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) <= 180) hpBar = (hp1 + hp2) / 2;
  else if (hp1 + hp2 < 360) hpBar = (hp1 + hp2 + 360) / 2;
  else hpBar = (hp1 + hp2 - 360) / 2;

  const t =
    1 -
    0.17 * Math.cos((hpBar - 30) * DEG) +
    0.24 * Math.cos(2 * hpBar * DEG) +
    0.32 * Math.cos((3 * hpBar + 6) * DEG) -
    0.2 * Math.cos((4 * hpBar - 63) * DEG);

  const dTheta = 30 * Math.exp(-(((hpBar - 275) / 25) ** 2));
  const cpBar7 = cpBar ** 7;
  const rc = 2 * Math.sqrt(cpBar7 / (cpBar7 + 25 ** 7));
  const sl = 1 + (0.015 * (lpBar - 50) ** 2) / Math.sqrt(20 + (lpBar - 50) ** 2);
  const sc = 1 + 0.045 * cpBar;
  const sh = 1 + 0.015 * cpBar * t;
  const rt = -Math.sin(2 * dTheta * DEG) * rc;

  return Math.sqrt(
    (dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh),
  );
};

/**
 * Machado, Oliveira & Fernandes 2009, severity 1.0. These operate on LINEAR RGB — applying
 * them to gamma-encoded values is a common and silent error that changes every result.
 */
const MACHADO: Record<Dichromacy, readonly Rgb[]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export const simulate = (hex: string, kind: Dichromacy): string => {
  const m = MACHADO[kind];
  const lin = hexToLinear(hex);
  const out = [0, 1, 2].map((i) => {
    const [a, b, c] = row(m, i);
    return a * lin[0] + b * lin[1] + c * lin[2];
  });
  return linearToHex([out[0] ?? 0, out[1] ?? 0, out[2] ?? 0]);
};

/** The colour as seen under one vision condition. `normal` is the identity. */
export const seenAs = (hex: string, vision: Vision): string =>
  vision === "normal" ? hex : simulate(hex, vision);

/**
 * Worst-case perceptual separation of two colours across normal vision and all three
 * dichromacies. This is the number 27-F15 is about: a palette is only as discriminable as
 * its worst observer.
 */
export const worstDeltaE = (a: string, b: string): { delta: number; vision: Vision } => {
  let delta = Number.POSITIVE_INFINITY;
  let vision: Vision = "normal";
  for (const v of VISIONS) {
    const d = deltaE00(hexToLab(seenAs(a, v)), hexToLab(seenAs(b, v)));
    if (d < delta) {
      delta = d;
      vision = v;
    }
  }
  return { delta, vision };
};

/**
 * CSS alpha compositing of `fg` over `bg` at opacity `alpha`. Browsers composite in
 * gamma-encoded sRGB, so this does too — the result is what a screen actually shows, which
 * is the only thing an opacity claim in a comment can honestly be about.
 */
export const composite = (fg: string, bg: string, alpha: number): string => {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const out = [0, 1, 2].map((i) => clamp255(alpha * (f[i] ?? 0) + (1 - alpha) * (b[i] ?? 0)));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};
