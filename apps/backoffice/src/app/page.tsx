import type { ReactNode } from "react";
import { AuthGate } from "../components/auth-gate";
import { CatalogScreen } from "../components/catalog-screen";

/**
 * The one route this app has. `14-F1` — a session sees exactly one org, and which org is the
 * SUBJECT's (`services/api`'s `whoami` reads it from the store), never a path segment or a query
 * parameter, so there is nothing here to scope.
 */
const Page = (): ReactNode => (
  <AuthGate>
    <CatalogScreen />
  </AuthGate>
);

export default Page;
