import { AdminShell } from "@/components/admin/admin-shell";

/**
 * Everything under /admin: the administrators' area. The views are pages of
 * their own, so the chat (and its polling) is not mounted underneath.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
}
