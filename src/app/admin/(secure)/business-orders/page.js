import AdminBusinessOrderForm from "@/components/admin-business-order-form";

export default function BusinessOrdersPage() { return <main style={{ padding: 24 }}><h1 style={{ marginBottom: 6 }}>Record business order</h1><p style={{ marginTop: 0, color: "#64748b" }}>Capture accepted WhatsApp or phone orders. These enter the existing order workflow with their source recorded.</p><AdminBusinessOrderForm /></main>; }
