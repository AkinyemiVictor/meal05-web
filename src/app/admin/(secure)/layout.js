import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasAdminAccess } from "@/lib/admin-access";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";
import AdminSidebarNav from "@/components/admin-sidebar-nav";

export const dynamic = "force-dynamic";

export default async function AdminSecureLayout({ children }) {
  const auth = getSupabaseRouteClient(await cookies());
  const { data: { user }, error } = await auth.auth.getUser();

  if (error || !user) {
    redirect("/admin/login");
  }
  const allowed = await hasAdminAccess({ userId: user.id, email: user.email });
  if (!allowed) {
    redirect("/admin/login?forbidden=1");
  }

  const navItems = [
    { href: "/admin/dashboard", label: "Overview" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/delivery", label: "Delivery" },
    { href: "/admin/inventory", label: "Inventory" },
    { href: "/admin/prices", label: "Prices" },
    { href: "/admin/catalogue", label: "Catalogue" },
    { href: "/admin/promotions", label: "Promotions" },
    { href: "/admin/campaigns", label: "Campaigns" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/analytics", label: "Analytics" },
    { href: "/admin/staff", label: "Staff" },
    { href: "/admin/logs", label: "Admin Logs" },
    { href: "/", label: "Storefront", external: false },
  ];

  return (
    <div className="admin-layout" style={{ minHeight: "100vh", background: "#f8fafc", display: "flex" }}>
      <AdminSidebarNav navItems={navItems} userEmail={user.email || ""} />
      <div className="admin-main" style={{ flex: 1, minHeight: "100vh", padding: "64px 16px 32px" }}>
        {children}
      </div>
    </div>
  );
}
