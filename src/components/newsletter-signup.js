"use client";

export default function NewsletterSignup({
  title = "Stay in the loop",
  description = "Get weekly market updates, seasonal picks, and exclusive offers.",
  note = "No spam - just fresh food stories.",
}) {
  return (
    <form className="footer-newsletter" action="#" method="post">
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="newsletter-field">
        <input type="email" name="newsletter-email" placeholder="Enter" aria-label="Email address" required />
        <button type="submit">Subscribe</button>
      </div>
      {note ? <small>{note}</small> : null}
    </form>
  );
}
