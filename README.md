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

## Booking Email Notifications

Booking confirmations are sent through a Cloudflare Worker (`cloudflare-worker.js`) that relays emails via MailChannels, since GitHub Pages/static hosting can't send email directly.

1. Deploy `cloudflare-worker.js` as a Cloudflare Worker (see the setup instructions in the file's header comment) and name it `send-booking-email`.
2. Copy the deployed Worker URL (e.g. `https://send-booking-email.yourusername.workers.dev`).
3. Update `this.workerUrl` in `calendar-script.js` with that URL.

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
