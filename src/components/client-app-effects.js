"use client";

import AppLaunchSplash from "@/components/app-launch-splash";
import PwaServiceWorker from "@/components/pwa-service-worker";

export default function ClientAppEffects() {
  return (
    <>
      <AppLaunchSplash />
      <PwaServiceWorker />
    </>
  );
}
