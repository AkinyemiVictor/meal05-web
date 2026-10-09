import AdminBusinessQuotes from "@/components/admin-business-quotes";
import { getSupabaseAdminClient } from "@/lib/supabase/server-client";

export default async function BusinessQuotesPage() {
  const { data, error } = await getSupabaseAdminClient().from("business_quote_requests").select("*, business_quote_items(*)").order("created_at", { ascending: false }).limit(200);
  return <main style={{ padding: 24 }}><h1 style={{ marginBottom: 6 }}>Business quotations</h1><p style={{ marginTop: 0, color: "#64748b" }}>Quotation requests are separate from orders and payments.</p>{error ? <p style={{ color: "#b91c1c" }}>{error.message}</p> : <AdminBusinessQuotes quotes={data || []} />}</main>;
}
