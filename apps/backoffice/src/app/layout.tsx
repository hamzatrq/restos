import type { ReactNode } from "react";
import { strings } from "../lib/strings";
import { themeCss } from "../lib/theme-css";
import { TrpcProviders } from "../lib/trpc";
import "./globals.css";

// @unreached-by-design Next.js App Router reads `metadata` by file convention (`18 §7`), never by
// import, so no shipping module can name it. Same for the default export below.
export const metadata = { title: strings.appName };

/**
 * The root layout. `00 §5.6` — English only, so `lang` is fixed and there is no i18n framework.
 *
 * The `<style>` block is the doc-27 token manifest, rendered to CSS custom properties by
 * `theme-css.ts`. It is emitted server-side and inline so the first paint already has the palette:
 * a flash of unstyled colour on an admin tool is cosmetic, but a stylesheet round trip for values
 * that are known at render time is a needless one.
 */
const RootLayout = ({ children }: { children: ReactNode }): ReactNode => (
  <html lang="en">
    <head>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: generated from the doc-27 token
          manifest at render, with no user input anywhere in its inputs. */}
      <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
    </head>
    <body className="antialiased">
      <TrpcProviders>{children}</TrpcProviders>
    </body>
  </html>
);

export default RootLayout;
