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
import { OwnerSummary } from "./owner-summary";
import { PairingPanel } from "./pairing-panel";
import { StaffScreen } from "./staff-screen";

type Section = "menu" | "devices" | "summary" | "staff";

/**
 * `14-F31` APPENDED the third tab and did not reorder the first two. `27-F4`'s positional contract
 * binds muscle memory, so a new section goes after the sections that exist — never between them.
 *
 * `14-F14`'s staff section is the FOURTH and follows the same rule for the same reason.
 */
const TABS: readonly { readonly id: Section; readonly label: string }[] = [
  { id: "menu", label: strings.nav.menu },
  { id: "devices", label: strings.nav.devices },
  { id: "summary", label: strings.nav.summary },
  { id: "staff", label: strings.nav.staff },
];

export const Workspace = (): ReactNode => {
  const [section, setSection] = useState<Section>("menu");

  return (
    <div className="flex flex-col gap-6">
      {/*
        **A segmented control on the page's ground, not a third full-width rule.**

        The rail was a `border-b` spanning the whole viewport, sitting 24 px under the header's
        `border-b` and 24 px above the first card's border — three parallel 3.41:1 lines across the
        top of every screen, which is most of what made the app read as a wireframe. It is now a
        bounded object sized to its own two tabs: it takes the raised fill inside `27-F66`'s
        boundary and the page ground shows around it, so the chrome and the work are two planes
        rather than one ruled sheet.

        `27-F66` still carries the state — an independent MARK meeting 3:1 (here the selected tab's
        own boundary and fill against a sunken track), never a fill step alone, so the selection
        survives a monochrome screenshot. `27-F4`'s positional contract is untouched: same tabs,
        same order.

        ⚠ **`flex-wrap`, and it was added when the FOURTH tab landed rather than after a defect.**
        This rail is `w-fit`, so it sizes to its labels and does not shrink: four of them are
        ESTIMATED at ~324 px against ~328 px of usable width on a 360 px phone. That is an estimate
        and not a measurement — `pnpm layout:check` runs the two Electron apps and nothing in this
        repo renders this one at any width, and happy-dom performs no layout, so no gate here can
        tell a wrapped rail from a clipped one. Appending to a non-wrapping rail is the shape worth
        closing before it bites: the fifth tab is what makes it certain, and `27-F4` guarantees
        there will be one.
      */}
      <nav
        aria-label={strings.appName}
        className="flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-muted p-1"
      >
        {TABS.map((tab) => {
          const current = tab.id === section;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => setSection(tab.id)}
              className={cn(
                "rounded-md px-4 py-1.5 text-label",
                current
                  ? "border border-border-strong bg-card text-foreground"
                  : "border border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
      {/* Mounted, not hidden: the inactive section's queries should not run, and a hidden device
          list would go on polling a fleet nobody is looking at. */}
      {section === "menu" ? (
        <CatalogScreen />
      ) : section === "devices" ? (
        /*
          `14-F41` puts the pairing task ON `14-F12`'s device list — "It is a task on `14-F12`'s
          list", not a fifth section. The panel is rendered FIRST because it is the act an owner
          comes here to perform when she has no tills yet, and the register below is what she comes
          back to afterwards. The two are separate components and separate reads deliberately: a
          waiting row is not a device (`14-F41`: "Before a claim there is no device"), and a screen
          that merged them would show a fleet containing tills that do not exist.
        */
        <div className="flex flex-col gap-6">
          <PairingPanel />
          <DeviceList />
        </div>
      ) : section === "summary" ? (
        <OwnerSummary />
      ) : (
        <StaffScreen />
      )}
    </div>
  );
};
