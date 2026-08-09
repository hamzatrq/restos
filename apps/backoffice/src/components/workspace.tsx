"use client";

/**
 * The app's two sections. It had one until `14-F12`/`14-F13` landed, and `page.tsx` rendered
 * `CatalogScreen` directly.
 *
 * **A local tab and not a route**, and the alternative is named rather than passed over
 * (`24 §3b`). Next's App Router would give `/menu` and `/devices` real URLs, which is better the
 * day an owner wants to bookmark or link one. It is not built today because `14-F1` puts exactly
 * one org behind a session and this app holds its bearer in `sessionStorage` — so a second route
 * buys a deep link that reloads into the sign-in screen, and costs a second `AuthGate` mount and a
 * second place the session can be got wrong. When the bearer moves to an httpOnly cookie (owed,
 * `apps/backoffice/CLAUDE.md`), routes are the right shape and this becomes a `<Link>` pair.
 *
 * The tab list is a `<nav>` of real buttons with `aria-current`, not a div of styled spans: the
 * one thing a screen-reader user needs here is which section they are in.
 */

import { type ReactNode, useState } from "react";
import { strings } from "../lib/strings";
import { cn } from "../lib/utils";
import { CatalogScreen } from "./catalog-screen";
import { DeviceList } from "./device-list";

type Section = "menu" | "devices";

const TABS: readonly { readonly id: Section; readonly label: string }[] = [
  { id: "menu", label: strings.nav.menu },
  { id: "devices", label: strings.nav.devices },
];

export const Workspace = (): ReactNode => {
  const [section, setSection] = useState<Section>("menu");

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label={strings.appName} className="flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          const current = tab.id === section;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => setSection(tab.id)}
              /*
                `27-F66` — the state difference is carried by an independent MARK (the underline)
                meeting 3:1, never by a fill step alone, so the selected tab survives a monochrome
                screenshot and a low-contrast panel. Same treatment as the catalog list's rows.
              */
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                current
                  ? "border-b-primary font-medium text-foreground"
                  : "border-b-transparent text-muted-foreground hover:border-b-border-strong hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      {/* Mounted, not hidden: the inactive section's queries should not run, and a hidden device
          list would go on polling a fleet nobody is looking at. */}
      {section === "menu" ? <CatalogScreen /> : <DeviceList />}
    </div>
  );
};
