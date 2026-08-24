import Image from "next/image";

export default function AppComingSoonSection() {
  return (
    <section className="downloadAppSec">
      <div className="downloadAppFlex">
        <div className="downloadAppTB">
          <div className="phoneWrapper">
            <Image
              src="/assets/img/iphone mockup potrait.png"
              alt="Meal05 mobile app preview on iPhone"
              className="phone phone-apple"
              width={140}
              height={290}
              sizes="140px"
              loading="lazy"
              unoptimized
            />
            <Image
              src="/assets/img/android mockup potrait.png"
              alt="Meal05 mobile app preview on Android phone"
              className="phone phone-android"
              width={140}
              height={287}
              sizes="140px"
              loading="lazy"
              unoptimized
            />
          </div>
          <div className="appTextndButtons">
            <h2>App coming soon...</h2>
            <p className="appPar">
              We&apos;re preparing the Meal05 app for iOS and Android. Shop with us on the web for now, and
              we&apos;ll let you know when each app is ready.
            </p>
            <div className="buttonHolder" aria-label="Mobile app launch status">
              <div className="comingSoonStoreCard">
                <span className="comingSoonTag">INCOMING</span>
                <div className="storeBadge">
                  <span className="storeBadge__icon storeBadge__icon--apple" aria-hidden="true">
                    <Image
                      src="/assets/icons/apple.svg"
                      alt=""
                      width={28}
                      height={28}
                      sizes="28px"
                      className="storeBadge__logo"
                    />
                  </span>
                  <span className="storeBadge__text">
                    <span className="storeBadge__eyebrow">Download on</span>
                    <span className="storeBadge__label">App Store</span>
                  </span>
                </div>
              </div>
              <div className="comingSoonStoreCard">
                <span className="comingSoonTag">INCOMING</span>
                <div className="storeBadge">
                  <span className="storeBadge__icon storeBadge__icon--play" aria-hidden="true">
                    <Image
                      src="/assets/icons/google-play.svg"
                      alt=""
                      width={28}
                      height={28}
                      sizes="28px"
                      className="storeBadge__logo"
                    />
                  </span>
                  <span className="storeBadge__text">
                    <span className="storeBadge__eyebrow">Get it on</span>
                    <span className="storeBadge__label">Google Play</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
