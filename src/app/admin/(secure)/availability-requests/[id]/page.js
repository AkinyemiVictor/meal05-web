import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";
import { AVAILABILITY_REQUEST_SELECT } from "@/lib/availability-requests-server";
import AdminAvailabilityItemControl from "@/components/admin-availability-item-control";

export const dynamic = "force-dynamic";
export default async function AdminAvailabilityRequestPage({ params }) {
  const { id } = await params;
  const { data } = await getSupabaseAdminClient().from("availability_requests").select(AVAILABILITY_REQUEST_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  return <main style={{ padding: 24, maxWidth: 900 }}><Link href="/admin/availability-requests">← Queue</Link><h1>{data.request_number}</h1><p>Status: <strong style={{ textTransform: "capitalize" }}>{data.status.replaceAll("_", " ")}</strong> · deadline {new Date(data.confirmation_deadline_at).toLocaleString()}</p><p>{data.customer_name} · {data.customer_phone}<br />{data.delivery_address}</p>
    <div style={{ display: "grid", gap: 12 }}>{(data.items || []).map((item) => <section key={item.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, background: "white", padding: 14 }}><strong>{item.product_name} — {item.variant_name}</strong><p>{item.quantity} {item.unit || "unit"} · submitted ₦{Number(item.submitted_unit_price).toLocaleString()} · {item.resolution_status}</p>{item.size_preference ? <p>Size preference: {item.size_preference.replaceAll("_", " ")}</p> : null}{item.requires_confirmation ? <AdminAvailabilityItemControl requestId={data.id} item={item} /> : <p>No confirmation required.</p>}</section>)}</div>
  </main>;
}

