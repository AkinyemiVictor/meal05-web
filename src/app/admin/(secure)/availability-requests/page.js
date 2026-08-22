import Link from "next/link";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";
export default async function AdminAvailabilityRequestsPage() {
  const { data, error } = await getSupabaseAdminClient().from("availability_requests")
    .select("id,request_number,status,customer_name,submitted_total,final_total,confirmation_deadline_at,created_at,availability_request_items(count)")
    .order("created_at", { ascending: false }).limit(200);
  return <main style={{ padding: 24 }}><h1 style={{ marginBottom: 6 }}>Availability confirmations</h1><p style={{ color: "#64748b" }}>Confirm request-only variants before customers can pay.</p>
    {error ? <p style={{ color: "#b91c1c" }}>{error.message}</p> : null}
    <div style={{ display: "grid", gap: 10 }}>{(data || []).map((record) => <Link key={record.id} href={`/admin/availability-requests/${record.id}`} style={{ padding: 14, border: "1px solid #e2e8f0", borderRadius: 10, background: "white", color: "inherit", textDecoration: "none", display: "flex", justifyContent: "space-between", gap: 12 }}><span><strong>{record.request_number}</strong><br /><small>{record.customer_name || "Customer"} · due {new Date(record.confirmation_deadline_at).toLocaleString()}</small></span><strong style={{ textTransform: "capitalize" }}>{record.status.replaceAll("_", " ")}</strong></Link>)}</div>
  </main>;
}

