import { buildSectionPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }) {
  const { slug } = (await params) || {};
  return buildSectionPageMetadata(slug);
}

export default function SectionLayout({ children }) {
  return children;
}
