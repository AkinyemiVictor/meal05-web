import Image from "next/image";

export default function AppComingSoonSection() {
  return (
    <section className="downloadAppSec">
      <div className="downloadAppFlex">
        <div className="downloadAppTB">
          <div className="phoneWrapper">
            <Image
              src="/assets/img/iphone mockup (2).png"
              alt="Meal05 mobile app preview on iPhone"
              className="phone phone-apple"
              width={140}
              height={280}
              sizes="140px"
              loading="lazy"
            />
            <Image
              src="/assets/img/android mockup (2).png"
              alt="Meal05 mobile app preview on Android phone"
              className="phone phone-android"
              width={140}
              height={280}
              sizes="140px"
              loading="lazy"
            />
          </div>
          <div className="appTextndButtons">
            <h2>Download our App</h2>
            <p className="appPar">
              Shop faster, manage your cart, and track Meal05 orders from your phone. The Android app is
              ready on Google Play, while the iOS app is still being prepared for the App Store.
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
              <div className="storeCard">
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
