import AdminRidersClient from "@/components/admin-riders-client";
import { loadRiderDirectory } from "@/lib/delivery/riders";

export const dynamic = "force-dynamic";

export default async function AdminRidersPage() {
  const data = await loadRiderDirectory();
  return <AdminRidersClient {...data} />;
}
