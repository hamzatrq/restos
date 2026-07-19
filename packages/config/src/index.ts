// @restos/config — shared config home (18 §2). defineEnv: services read process
// env ONLY through this factory and crash at boot on invalid values (18 §5).
// First consumer: services/sync-gateway/src/server.ts (T-01-07).
export type EnvParser<T> = (raw: string | undefined, key: string) => T;

export const defineEnv = <S extends Record<string, EnvParser<unknown>>>(
  spec: S,
  source: Record<string, string | undefined> = process.env,
): { [K in keyof S]: ReturnType<S[K]> } => {
  const problems: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [key, parse] of Object.entries(spec)) {
    try {
      out[key] = parse(source[key], key);
    } catch (error) {
      problems.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (problems.length > 0) throw new Error(`invalid environment (18 §5): ${problems.join("; ")}`);
  return out as { [K in keyof S]: ReturnType<S[K]> };
};
