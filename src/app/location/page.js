import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";

import LocationPicker from "@/components/location-picker";
import styles from "./location.module.css";

export const metadata = {
  title: "Select location | Meal05",
};

export default function LocationPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/home" className={styles.back} aria-label="Go back">
            <IconArrowLeft size={22} />
          </Link>
          <h1>Select your location</h1>
        </header>
        <LocationPicker pageMode hideTrigger />
      </div>
    </main>
  );
}
