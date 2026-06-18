import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import AdminLoginClient from "./admin-login-client";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({ searchParams }) {
  const params = (await searchParams) || {};
  const forbidden = String(params?.forbidden || "") === "1";
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user } } = await auth.auth.getUser();
  const allowed = user ? await hasAdminAccess({ userId: user.id, email: user.email }) : false;

  if (allowed) {
    redirect("/admin/dashboard");
  }

  return <AdminLoginClient forbidden={forbidden} signedInEmail={user?.email || ""} />;
}
