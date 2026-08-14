import { cookies } from "next/headers";

import ChangePasswordClient from "./change-password-client";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";
import { verifyPasswordRecoveryToken } from "@/lib/auth/password-recovery-token";
import { getSupabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Change password | Meal05",
  description: "Securely update your Meal05 account password.",
};

export default async function ChangePasswordPage() {
  const cookieStore = await cookies();
  const recoveryToken = cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value || "";
  const supabase = getSupabaseRouteClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const recoveryAuthorized = Boolean(user?.id) && verifyPasswordRecoveryToken(recoveryToken, user.id);

  return <ChangePasswordClient recoveryAuthorized={recoveryAuthorized} />;
}
