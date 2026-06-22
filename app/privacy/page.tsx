export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-card">
        <p className="legal-kicker">BUR OAKS CAMPGROUND</p>
        <h1>Privacy Notice</h1>
        <p className="muted">Last updated June 22, 2026</p>

        <h2>Information we use</h2>
        <p>We use camper account, contact, billing, vehicle, emergency-contact, maintenance, event, and electric-usage information to operate the campground and provide portal services.</p>

        <h2>Payments</h2>
        <p>Payment-card information is collected and stored by Stripe. Bur Oaks receives payment status and limited card details, such as brand and last four digits, but does not store complete card numbers.</p>

        <h2>Camper directory</h2>
        <p>The directory is optional. Campers are hidden by default. If you opt in, signed-in campers may see your name and lot number. Your phone number appears only if you separately choose to share it.</p>

        <h2>Maintenance photos and documents</h2>
        <p>Maintenance photos are stored privately and are available only to the submitting camper and authorized campground staff. Account documents are limited to the assigned camper and authorized administrators.</p>

        <h2>Your choices</h2>
        <p>You may update your profile, directory preference, and AutoPay enrollment through the portal. Contact the campground office to request access, correction, or deletion of other account information, subject to legal and operational recordkeeping requirements.</p>

        <h2>Security and retention</h2>
        <p>We use access controls and service providers to protect portal data. Information is retained only as long as reasonably needed for campground operations, accounting, safety, and legal obligations.</p>
      </article>
    </main>
  )
}
