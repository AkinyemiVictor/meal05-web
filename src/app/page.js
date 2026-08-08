import Image from "next/image";
import Link from "next/link";
import {
  IconArrowRight, IconBolt,
  IconBrandInstagram, IconBrandWhatsapp, IconBrandX, IconDiscount2,
  IconLeaf, IconLock, IconMapPin,
  IconSearch, IconShieldCheck, IconShoppingCart, IconStarFilled,
  IconTruckDelivery,
} from "@tabler/icons-react";
import styles from "./landing.module.css";
import WaitlistForm from "@/components/waitlist-form";
import LandingPopularPreview from "@/components/landing-popular-preview";
import LandingCategories from "@/components/landing-categories";
import LandingHeader from "@/components/landing-header";

const values = [
  [IconBolt, "Same-day delivery", "Order before 2pm", "orange"],
  [IconLeaf, "Farm fresh", "Picked each morning", "green"],
  [IconDiscount2, "Fair market prices", "No middleman markup", "blue"],
  [IconShieldCheck, "Secure checkout", "Pay your way, safely", "purple"],
];
const steps = [
  ["01", IconSearch, "Browse & pick", "Search fresh items and shop by category."],
  ["02", IconShoppingCart, "Build your basket", "Choose pack sizes, then check out securely in seconds."],
  ["03", IconTruckDelivery, "Same-day delivery", "We pick it fresh and bring it straight to your door."],
];
const products = [
  ["Vegetables", "Fresh Tomatoes", "1 basket", "₦1,500", "Fresh", "green", "vegetables.jpg"],
  ["Fruits", "Apple (Red)", "4 pieces", "₦1,000", "-17%", "orange", "Download AI generated Colorful Fruit Assortment for free.jpeg"],
  ["Fruits", "Sheri Mango", "1 pack", "₦1,000", "", "dark", "Achieve Inner Balance with Superfoods and Calming Teas.jpeg"],
  ["Vegetables", "Red Onions", "1 kg", "₦1,200", "Popular", "dark", "top-fresh-herbs-vegetables-colorful-bell-peppers-tarragonnd-parsley-with-copy-space-grey.jpg"],
];
const reviews = [
  ["If Meal05 delivers the way this looks, it will save me a lot of market runs. The setup already feels premium and easy to trust.", "TA", "Temi Adeyemi", "Bodija, Ibadan"],
  ["I am mostly waiting for the launch because the promise is exactly what I need: fresh groceries, fair pricing, and less stress.", "KO", "Kunle Ogunbiyi", "Akobo, Ibadan"],
  ["This feels like the kind of service I would use every week once it opens. I already want to try the basket and delivery flow.", "BF", "Bisi Falade", "Dugbe, Ibadan"],
];

export const metadata = { title: "Meal05 — Market-fresh groceries, delivered", description: "Fresh groceries delivered within Meal05's Ibadan launch area." };
const Stars = () => <div className={styles.stars}>{Array.from({length:5},(_,i)=><IconStarFilled key={i}/>)}</div>;

export default function LandingPage() {
  return <main id="top" className={styles.page}>
    <LandingHeader />

    <section className={styles.hero}>
      <div className={styles.heroCopy}><span className={styles.pill}><i/> Now live in Ibadan!</span>
        <h1>Market-fresh<br/>groceries, <em>delivered.</em></h1>
        <p>Meat, fish, vegetables, fruits and pantry staples — handpicked from the market each morning and at your door within hours.</p>
        <form action="/search" method="get" className={styles.search}><IconSearch/><input name="q" aria-label="Search products" required placeholder="Search meal05"/><button type="submit">Search</button></form>
        <div className={styles.heroValues}>{values.map(([Icon,title,sub,tone])=><article key={title}><i className={styles[tone]}><Icon/></i><span><b>{title}</b><small>{sub}</small></span></article>)}</div>
      </div>
      <div className={styles.heroArt}><Image src="/assets/billboard/landing-hero-template.jpg" alt="Fresh market vegetables" fill priority sizes="(max-width:980px) 0px, 46vw"/><div className={styles.heroShade}/>
        <div className={styles.delivery}><i><IconShoppingCart/></i><span><b>Your market run</b><small>Handled in one basket</small></span></div><div className={styles.discount}><b>FREE</b><span>1st delivery</span></div>
      </div>
    </section>

    <section id="categories" className={`${styles.section} ${styles.compactLandingGrid}`}><LandingCategories/></section>

    <section id="how" className={styles.how}><div className={styles.inner}><div className={styles.centerHead}><span>How it works</span><h2>Fresh food in three steps</h2></div><div className={styles.steps}>{steps.map(([num,Icon,title,desc])=><article key={num}><strong>{num}</strong><i><Icon/></i><h3>{title}</h3><p>{desc}</p></article>)}</div></div></section>

    <section id="popular" className={`${styles.section} ${styles.popularPreview} ${styles.compactLandingGrid}`}><LandingPopularPreview fallbackProducts={products}/></section>

    <section id="reviews" className={styles.reviews}><div className={styles.inner}><div className={styles.centerHead}><span>Early buzz in Ibadan</span><h2>What people are saying before launch</h2></div><div className={styles.reviewGrid}>{reviews.map(([quote,initials,name,area])=><article key={name}><Stars/><p>{quote}</p><footer><b>{initials}</b><span><strong>{name}</strong><small>{area}</small></span></footer></article>)}</div></div></section>

    <section id="waitlist" className={styles.waitlist}><div className={styles.waitlistInner}><div className={styles.waitlistCopy}><span>Early access</span><h2>Be first in line for what’s next.</h2><p>Join the Meal05 waitlist for priority access to new delivery areas, fresh features and member-only launch offers.</p><ul><li><IconStarFilled/> Priority access</li><li><IconDiscount2/> Early-member offers</li><li><IconMapPin/> New-area alerts</li></ul></div><WaitlistForm classNames={{form:styles.waitlistForm,fields:styles.waitlistFields,consent:styles.waitlistConsent,error:styles.waitlistError,privacy:styles.waitlistPrivacy,success:styles.waitlistSuccess}}/></div></section>

    <section className={styles.finalWrap}><div className={styles.final}><i/><i/><h2>Your market run,<br/>handled.</h2><p>Create a free account and get your first basket delivered today.</p><div><Link href="/home">Start shopping <IconArrowRight/></Link><Link href="/categories">Browse categories</Link></div></div></section>

    <footer className={styles.footer}><div className={styles.footerGrid}><div><Link href="/" className={styles.footerLogo}><Image src="/assets/logo/MEAL05 NEW LOGO-01.png" alt="Meal05" width={145} height={52}/></Link><p>Market-fresh groceries delivered within our Ibadan launch area. Handpicked each morning, priced fairly, at your door in hours.</p><div className={styles.socials}><a href="https://wa.me/2349129296433" target="_blank" rel="noreferrer" aria-label="Chat with Meal05 on WhatsApp"><IconBrandWhatsapp/></a><a href="https://x.com/mealkit_nigeria" target="_blank" rel="noreferrer" aria-label="Meal05 on X"><IconBrandX/></a><a href="https://www.instagram.com/meal05.nigeria?utm_source=qr&igsh=ZG5ldzZ4NnM0dTRx" target="_blank" rel="noreferrer" aria-label="Meal05 on Instagram"><IconBrandInstagram/></a></div></div>
      <div><b>Shop</b><Link href="/categories">Categories</Link><Link href="/shop">Flash deals</Link><Link href="/section/new">New arrivals</Link></div>
      <div><b>Company</b><Link href="/about-us">About us</Link><a href="#how">How it works</a><Link href="/contact-us">Delivery areas</Link><Link href="/career">Careers</Link></div>
      <div><b>Support</b><Link href="/help-center">Help centre</Link><Link href="/account/orders">Track order</Link><Link href="/help-center#searchQnAAgent">Returns</Link><Link href="/contact-us">Contact us</Link></div></div>
      <div className={styles.footerBottom}><span>© 2026 MEAL05. All rights reserved.</span><div><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><span><IconLock/> Secure payments</span></div></div>
    </footer>
  </main>;
}
