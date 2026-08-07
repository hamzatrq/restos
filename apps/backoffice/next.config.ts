import type { NextConfig } from "next";

/**
 * `18 §7` — Next.js, App Router.
 *
 * **The rewrite is the whole networking story, and it is a deliberate choice over CORS.**
 * `services/api` is the back office's only backend and it is off this app's edit surface; adding
 * a cross-origin allowance to it to let a browser call it directly would put the session bearer
 * on a cross-site request and require the API to grow an origin allowlist. Proxying instead means
 * the browser only ever talks to its own origin, so `18 §6`'s "tRPC + TanStack Query only" holds
 * with no second security surface. `/api/trpc/*` is the client's base URL; nothing else here.
 *
 * `RESTOS_API_URL` is read at request time by the Next server (not inlined into the browser
 * bundle), so a deployment repoints the backend without a rebuild.
 */
const nextConfig: NextConfig = {
  /**
   * `packages/domain` and `packages/ui` ship TypeScript SOURCE, and their internal specifiers carry
   * the `.js` extension the emitted JS would have (`export … from "./audit.js"` in an `audit.ts`).
   * Next compiles them from source, so the bundler has to map that specifier back — hence
   * `extensionAlias`. Without it the build fails with fourteen "Can't resolve './audit.js'".
   *
   * **This is also why the build runs on webpack rather than Turbopack** (`package.json`'s
   * `--webpack`): Turbopack has no `extensionAlias` equivalent and cannot follow the workspace's
   * `.js`-for-`.ts` specifiers. The alternatives were worse — publishing build artefacts from
   * `domain` is a protected-path change, and re-declaring `ORDER_CHANNELS` here to avoid importing
   * it would be the `18 §2` violation ("redeclaring a domain type elsewhere is a violation, not a
   * convenience"). Recorded so the next session knows this is a bundler limit, not a preference.
   */
  webpack: (config: { resolve: { extensionAlias?: Record<string, readonly string[]> } }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  rewrites: async () => [
    {
      source: "/api/trpc/:path*",
      destination: `${process.env.RESTOS_API_URL ?? "http://127.0.0.1:3001"}/trpc/:path*`,
    },
  ],
};

export default nextConfig;
