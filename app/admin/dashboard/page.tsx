import { redirect } from "next/navigation";
import { isSuperAdminServerSession } from "../../../lib/superAdminAuth";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function SuperAdminDashboardPage() {
  const isAuthenticated = await isSuperAdminServerSession();

  if (!isAuthenticated) {
    redirect("/admin/dashboard/login");
  }

  return <AdminDashboardClient />;
}
