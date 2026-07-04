import Link from "next/link";
import {
  IconArrowRight,
  IconCarrot,
  IconCherry,
  IconClockHour4,
  IconLeaf,
  IconLemon2,
  IconPepper,
} from "@tabler/icons-react";
import styles from "@/app/landing.module.css";

const picks = [
  [IconPepper, "Sweet Peppers", "Peak season", "₦900", "pepper"],
  [IconLemon2, "Citrus Burst", "Just in", "₦1,200", "citrus"],
  [IconCherry, "Ripe Cherries", "Peak season", "₦1,500", "cherry"],
  [IconCarrot, "Garden Carrots", "Just in", "₦800", "carrot"],
];

export default function LandingSeasonalBanner() {
  return (
    <section className={styles.seasonWrap} aria-labelledby="seasonal-heading">
      <div className={styles.seasonBanner}>
        <div className={styles.seasonCopy}>
          <span className={styles.seasonPill}><i><IconLeaf /></i> In season · Weekly harvest</span>
          <h2 id="seasonal-heading">Just harvested,<br /><em>now in season.</em></h2>
          <p>This week&apos;s basket is bursting with peak-season produce—picked at its sweetest and rushed from farm to your door the same morning.</p>
          <div className={styles.seasonActions}>
            <Link href="/section/popular">Shop seasonal picks <i><IconArrowRight /></i></Link>
            <span><IconClockHour4 /> New harvest every Monday</span>
          </div>
        </div>
        <div className={styles.seasonCards}>
          {picks.map(([Icon, name, status, price, tone], index) => (
            <article key={name} className={`${styles.seasonCard} ${styles[`seasonCard${index + 1}`]}`}>
              <i className={styles[tone]}><Icon /></i>
              <b>{name}</b>
              <footer><span>{status}</span><strong>{price}</strong></footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
