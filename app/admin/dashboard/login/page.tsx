import { redirect } from "next/navigation";
import { isSuperAdminServerSession } from "../../../../lib/superAdminAuth";
import SuperAdminLoginForm from "./SuperAdminLoginForm";

export default async function SuperAdminLoginPage() {
  const isAuthenticated = await isSuperAdminServerSession();

  if (isAuthenticated) {
    redirect("/admin/dashboard");
  }

  return <SuperAdminLoginForm />;
}
