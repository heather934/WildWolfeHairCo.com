# Zoee - Bridal Hair Styling Website

A professional, elegant website for Zoee's bridal hair styling business. This website showcases bridal services, features a gallery, and provides easy contact options for potential clients.

## Features

- **Responsive Design** - Works beautifully on desktop, tablet, and mobile devices
- **Professional Aesthetic** - Elegant color scheme with sage, olive green, ivory, and gold accents
- **Services Showcase** - Six key service offerings presented in an attractive grid
- **Gallery Section** - Showcase beautiful bridal hairstyles
- **Contact Form** - Easy-to-use form for booking consultations
- **Smooth Navigation** - Sticky navigation bar with smooth scrolling
- **Scroll Animations** - Interactive animations as elements come into view
- **SEO Optimized** - Proper meta tags and semantic HTML structure

## Sections

1. **Navigation Bar** - Sticky header with smooth scrolling links
2. **Hero Section** - Eye-catching introduction with call-to-action button
3. **Services** - Grid layout showcasing 6 main service offerings
4. **Gallery** - Photo gallery layout for bridal hairstyle showcase
5. **About** - Information about Zoee and her expertise
6. **Contact** - Contact form and information for bookings
7. **Footer** - Social media links and copyright information

## Technologies Used

- **HTML5** - Semantic structure
- **CSS3** - Modern styling with CSS Grid and Flexbox
- **JavaScript** - Interactive features and form handling
- **Google Fonts** - Playfair Display (headings) and Lato (body text)

## Color Scheme

Zoee's elegant and natural color palette:

- **Sage** - `#a8b8a8` - Soft, calming green for navbar and contact section
- **Olive Green** - `#6b7e5b` - Rich green used in hero and footer sections
- **Ivory** - `#f5f3f0` - Warm off-white for services and about sections
- **Gold** - `#d4af37` - Luxury accent color for highlights and buttons
- **Black** - `#000000` - Primary text color for readability

## Getting Started

1. Clone this repository
2. Open `index.html` in your web browser
3. Customize content with Zoee's specific information:
   - Update contact email and phone number
   - Add real images to the gallery
   - Customize service descriptions
   - Update social media links

## Customization Guide

### Update Contact Information
Edit the contact section in `index.html`:
```html
<p>📧 Email: zoee@example.com</p>
<p>📱 Phone: (555) 123-4567</p>
<p>📍 Location: Your City, State</p>
```

### Add Gallery Images
Replace gallery placeholders with real images:
```html
<div class="gallery-item">
    <img src="path/to/image.jpg" alt="Bridal Style">
</div>
```

### Update Social Media Links
Edit footer social links:
```html
<a href="https://instagram.com/zoee" class="social-icon">Instagram</a>
```

## Booking & Availability

The "Book Now" section on the homepage (`calendar-script.js`) and the admin panel's calendar (`admin-calendar.js`) both talk to the same Cloudflare Worker (`cloudflare-worker.js`), deployed as `send-booking-email` at `https://send-booking-email.h-m-ward1846.workers.dev`. The Worker is backed by a Cloudflare KV namespace (`AVAILABILITY`) that is the single shared source of truth for booked and blocked dates, so:

- A date a client books on the public calendar immediately shows as booked in the admin panel.
- A date Zoee blocks (or a booking she removes) in the admin panel immediately becomes unavailable/available again on the public calendar.

The Worker also sends the booking notification email via MailChannels once a booking is saved.

### Redeploying the Worker
If you change `cloudflare-worker.js`, redeploy it to Cloudflare (Workers & Pages > `send-booking-email` > upload the updated script) so the live Worker matches the repo. The KV binding (`AVAILABILITY`) must stay attached across redeploys.

## Admin Login (Cloudflare Access)

`admin.html` and everything under `/api/admin/*` are gated by Cloudflare Access with a passwordless, one-time email code — no username/password to manage. Only `zoee.burley@yahoo.com` and `h.m.ward1846@gmail.com` are allowed in; visiting `https://wildwolfehairco.com/admin.html` prompts for one of those emails and a 6-digit code sent to it.

The site previously only existed at the bare `wildwolfehairco-com.pages.dev` URL, which turned out to matter: Cloudflare Access's hostname-based protection doesn't reliably enforce on Cloudflare's own shared `.pages.dev`/`.workers.dev` domains (only on a zone you actually control). `wildwolfehairco.com` was already a registered, unused zone on the account, so it's now connected as this Pages project's custom domain and is the real, working entry point — `wildwolfehairco-com.pages.dev` still resolves too (Cloudflare Pages always keeps that alias live), but should be treated as a fallback rather than the site's real address; link to `wildwolfehairco.com` going forward.

**Two independent layers**, both required:
1. **Cloudflare Access** (the login prompt itself) — an app named "Wild Wolfe Hair Co — Admin" in the Zero Trust dashboard, covering `wildwolfehairco.com/admin*`, `wildwolfehairco.com/api/admin*`, and (best-effort only, per the limitation above) the `*.wildwolfehairco-com.pages.dev` preview/branch family.
2. **`functions/api/admin/_middleware.js`** — independently re-verifies the signed Access token on every request to `/api/admin/*` (the admin block/unblock/remove-booking endpoints), so those routes stay protected even if the Access app is ever accidentally misconfigured or removed.

Blocking/unblocking dates and removing bookings now go through this site's own `/api/admin/*` routes (Pages Functions, using the same `AVAILABILITY` KV namespace as the public Worker) instead of calling the public Worker directly, since that's what Access actually protects. Reading availability (`GET /availability`, used by both the admin panel and the public calendar) stays on the public Worker — that data isn't sensitive.

**Adding or removing an admin:** update both the Access app's policy (Zero Trust dashboard > Access > Applications > "Wild Wolfe Hair Co — Admin") and the `ADMIN_EMAIL` environment variable on the Pages project (Workers & Pages > `wildwolfehairco-com` > Settings > Environment variables, both Production and Preview) — they're checked independently by design, so both need to change together.

## Performance

- Optimized for fast loading
- Lazy loading support for images
- Smooth scrolling and animations
- Mobile-first responsive design

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Future Enhancements

- Integration with booking/calendar system
- Blog section for styling tips
- Client testimonials and reviews
- Before/after gallery slider
- Instagram feed integration
- Newsletter signup

## License

© 2026 Zoee - Bridal Hair Styling. All rights reserved.

---

**Ready to book?** Clients can easily reach out through the contact form or the provided contact information.
