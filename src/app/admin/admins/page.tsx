import type { Metadata } from "next";

import { AdminsView } from "@/components/admin/admins-view";

export const metadata: Metadata = { title: "Admin: Admins" };

export default function AdminAdminsPage() {
  return <AdminsView />;
}
