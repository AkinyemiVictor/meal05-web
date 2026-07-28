import { unstable_noStore as noStore } from "next/cache";
import RiderPortalEntry from "@/components/rider-portal-entry";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Rider Portal | Meal05",
};

export default function RiderPortalPage() {
  noStore();
  return <RiderPortalEntry />;
}
