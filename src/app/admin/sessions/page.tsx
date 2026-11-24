import type { Metadata } from "next";
import { Suspense } from "react";

import { SessionsView } from "@/components/admin/sessions-view";

export const metadata: Metadata = { title: "Admin: Sessions" };

// The view keeps its filters in the address and reads them with
// useSearchParams(), which needs <Suspense> around it for `next build`.
export default function AdminSessionsPage() {
  return (
    <Suspense>
      <SessionsView />
    </Suspense>
  );
}
