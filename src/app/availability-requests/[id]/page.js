import AvailabilityRequestDetailClient from "./request-detail-client";
export const metadata = { title: "Availability request | Meal05" };
export default async function AvailabilityRequestPage({ params }) {
  const { id } = await params;
  return <AvailabilityRequestDetailClient requestId={id} />;
}

