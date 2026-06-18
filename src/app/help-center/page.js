import HelpCenterPageClient from "./help-center-page-client";
import { buildHelpCenterPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildHelpCenterPageMetadata();

export default function HelpCenterPage() {
  return <HelpCenterPageClient />;
}
