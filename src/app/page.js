import { redirect } from "next/navigation";

export default function RootPage() {
  // The marketing landing page is the public entry point. Keeping the root
  // route aligned with it ensures homepage visitors receive its latest content
  // rather than being sent directly to the catalogue at /home.
  redirect("/landing");
}
