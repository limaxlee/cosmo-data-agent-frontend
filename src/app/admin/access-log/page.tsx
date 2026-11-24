import type { Metadata } from "next";
import { Suspense } from "react";

import { AccessLogView } from "@/components/admin/access-log-view";

export const metadata: Metadata = { title: "Admin: Access log" };

// The view keeps its filters in the address and reads them with
// useSearchParams(), which needs <Suspense> around it for `next build`.
export default function AdminAccessLogPage() {
  return (
    <Suspense>
      <AccessLogView />
    </Suspense>
  );
}
