"use client";

import dynamic from "next/dynamic";
import type { CoachRegistrationView, SortField } from "./registrations-client";

// dynamic({ ssr: false }) must live inside a Client Component (Server Components disallow it).
// This wrapper ensures RegistrationsClient is never server-rendered, so SSR crashes are
// bypassed and the Error Boundary in page.tsx catches any client-side failures.
const RegistrationsClient = dynamic(
  () => import("./registrations-client").then((m) => ({ default: m.RegistrationsClient })),
  {
    ssr: false,
    loading: () => (
      <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
        Loading registrations…
      </div>
    ),
  }
);

export function RegistrationsLoader({
  registrations,
  currentSort,
}: {
  registrations: CoachRegistrationView[];
  currentSort?: SortField;
}) {
  return <RegistrationsClient registrations={registrations} currentSort={currentSort} />;
}
