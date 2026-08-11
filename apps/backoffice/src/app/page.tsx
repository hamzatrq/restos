import type { ReactNode } from "react";
import { AuthGate } from "../components/auth-gate";
import { Workspace } from "../components/workspace";

/**
 * The one route this app has. `14-F1` — a session sees exactly one org, and which org is the
 * SUBJECT's (`services/api`'s `whoami` reads it from the store), never a path segment or a query
 * parameter, so there is nothing here to scope.
 *
 * `Workspace` is the three sections behind that one route — the menu (`14-F5`..`14-F29`), the
 * devices (`14-F12`/`14-F13`) and the nightly owner summary (`14-F31`). Why a tab rather than a
 * second route is recorded in that file.
 */
const Page = (): ReactNode => (
  <AuthGate>
    <Workspace />
  </AuthGate>
);

export default Page;
