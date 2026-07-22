import { unstable_noStore as noStore } from "next/cache";
import RiderRouteClient from "@/components/rider-route-client";

export const dynamic = "force-dynamic";

export default async function RiderRoutePage({ params }) {
  noStore();
  const { token } = await params;
  return <RiderRouteClient token={token} />;
}
