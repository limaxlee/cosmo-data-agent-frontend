import type { Metadata } from "next";
import { Suspense } from "react";

import { UsersView } from "@/components/admin/users-view";

export const metadata: Metadata = { title: "Admin: Accounts" };

// The view keeps its filters in the address and reads them with
// useSearchParams(), which needs <Suspense> around it for `next build`.
export default function AdminUsersPage() {
  return (
    <Suspense>
      <UsersView />
    </Suspense>
  );
}
