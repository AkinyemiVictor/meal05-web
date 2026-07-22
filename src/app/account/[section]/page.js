import { Suspense } from "react";

import { AccountPageContent } from "../page";

export default function AccountSectionPage() {
  return (
    <Suspense fallback={<div>Loading account...</div>}>
      <AccountPageContent />
    </Suspense>
  );
}
