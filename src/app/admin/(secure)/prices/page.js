import AdminPriceEditor from "@/components/admin-price-editor";
import { loadVolatilePriceAdminData } from "@/lib/admin-prices";

export const dynamic = "force-dynamic";

export default async function AdminPricesPage() {
  const data = await loadVolatilePriceAdminData();
  return <AdminPriceEditor {...data} />;
}
