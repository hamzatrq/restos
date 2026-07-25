// Colour science backing 27-F15 (dichromacy ΔE00) and 27-F21 (WCAG 2.2 AA).
//
// This exists so the design language is CHECKED rather than asserted: the palette in
// tokens.json is the output of these functions, and tokens.test.ts re-derives every claim.
//
// Sources: CIEDE2000 per Sharma, Wu & Dalal 2005; dichromacy simulation per Machado,
// Oliveira & Fernandes 2009 (severity 1.0, applied in linear RGB).

export type Triple = readonly [number, number, number];

export const hexToRgb = (h: string): Triple => {
  const n = Number.parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const srgbToLin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const linToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

const toLin = (hex: string): Triple => {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLin(r), srgbToLin(g), srgbToLin(b)];
};

export const relLum = (hex: string): number => {
  const [r, g, b] = toLin(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string): number => {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

const WP: Triple = [0.95047, 1.0, 1.08883];
const f = (t: number): number =>
  t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t) / 116 + 16 / 116;

export const hexToLab = (hex: string): Triple => {
  const [r, g, b] = toLin(hex);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WP[0]);
  const fy = f((0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WP[1]);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WP[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

export const lightness = (hex: string): number => hexToLab(hex)[0];

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005 formulation). */
export const deltaE00 = (c1: Triple, c2: Triple): number => {
  const [L1, a1, b1] = c1;
  const [L2, a2, b2] = c2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1;
  const ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1);
  const Cp2 = Math.hypot(ap2, b2);
  const deg = (r: number): number => (r * 180) / Math.PI;
  const hp = (b: number, ap: number): number => {
    if (b === 0 && ap === 0) return 0;
    const h = deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const hp1 = hp(b1, ap1);
  const hp2 = hp(b2, ap2);
  const dLp = L2 - L1;
  const dCp = Cp2 - Cp1;
  let dhp = 0;
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * Math.PI) / 360);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (Cp1 + Cp2) / 2;
  let Hbp = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) Hbp += hp1 + hp2 < 360 ? 360 : -360;
    Hbp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos(((Hbp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * Hbp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * Hbp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * Hbp - 63) * Math.PI) / 180);
  const dTh = 30 * Math.exp(-(((Hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin((2 * dTh * Math.PI) / 180) * Rc;
  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  );
};

/** Machado, Oliveira & Fernandes 2009, severity 1.0. Applied in LINEAR RGB. */
const CVD: Record<string, readonly [Triple, Triple, Triple]> = {
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

export const CVD_KINDS: string[] = Object.keys(CVD);

export const simulate = (hex: string, kind: string): string => {
  const m = CVD[kind];
  if (!m) throw new Error(`unknown dichromacy: ${kind}`);
  const lin = toLin(hex);
  const out = m.map((row) => row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]);
  return `#${out.map((v) => linToSrgb(v).toString(16).padStart(2, "0")).join("")}`;
};
