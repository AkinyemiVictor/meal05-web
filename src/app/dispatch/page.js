import { cookies } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { redirect } from "next/navigation";
import { hasDispatchAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import { loadDispatchDashboard } from "@/lib/delivery/management";
import DispatchDashboardClient from "@/components/dispatch-dashboard-client";

export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  noStore();
  const auth = getSupabaseRouteClient(await cookies());
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) redirect("/admin/login");
  const allowed = await hasDispatchAccess({ userId: user.id, email: user.email });
  if (!allowed) redirect("/admin/login?forbidden=1");

  const data = await loadDispatchDashboard();

  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "24px 16px 48px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <p style={{ margin: 0, color: "#f04e1f", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>Meal05 Dispatch</p>
            <h1 style={{ margin: "4px 0 6px", color: "#0f172a", fontSize: 34, lineHeight: 1 }}>Dispatch Dashboard</h1>
            <p style={{ margin: 0, color: "#64748b" }}>
              Group ready orders into rider routes, create secure links, and monitor delivery progress.
            </p>
          </div>
          <a href="/admin/dashboard" style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}>Admin</a>
        </header>
        <DispatchDashboardClient {...data} />
      </div>
    </main>
  );
}
