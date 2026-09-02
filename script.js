// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Cloudflare Turnstile - renders the two widgets (contact form here,
// booking form in calendar-script.js) once the Turnstile script loads.
// Explicit render (rather than auto-render) so both forms can grab a
// token at submit time and reset the widget for a fresh one afterward.
const TURNSTILE_SITE_KEY = '0x4AAAAAAEk8p2frmfyCxpzx';
window.turnstileContactWidgetId = null;
window.turnstileBookingWidgetId = null;
window.onloadTurnstileCallback = function () {
    if (document.getElementById('turnstile-contact')) {
        window.turnstileContactWidgetId = turnstile.render('#turnstile-contact', { sitekey: TURNSTILE_SITE_KEY });
    }
    if (document.getElementById('turnstile-booking')) {
        window.turnstileBookingWidgetId = turnstile.render('#turnstile-booking', { sitekey: TURNSTILE_SITE_KEY });
    }
};

// Contact form handling
const contactForm = document.getElementById('contactForm');
// Same Worker the booking calendar uses to send email - see calendar-script.js
const CONTACT_WORKER_URL = 'https://send-booking-email.h-m-ward1846.workers.dev';

if (contactForm) {
    contactForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const nameInput = document.getElementById('contactName');
        const emailInput = document.getElementById('contactFormEmail');
        const phoneInput = document.getElementById('contactPhoneInput');
        const dateInput = document.getElementById('contactWeddingDate');
        const messageInput = document.getElementById('contactFormMessage');
        const submitBtn = this.querySelector('.submit-btn');
        const originalBtnText = submitBtn.textContent;

        // Simple validation
        if (!nameInput.value || !emailInput.value || !dateInput.value) {
            alert('Please fill in all required fields.');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailInput.value)) {
            alert('Please enter a valid email address.');
            return;
        }

        const turnstileToken = (window.turnstileContactWidgetId !== null && typeof turnstile !== 'undefined')
            ? turnstile.getResponse(window.turnstileContactWidgetId)
            : '';
        if (!turnstileToken) {
            alert('Please complete the verification checkbox before sending.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            const response = await fetch(`${CONTACT_WORKER_URL}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: nameInput.value,
                    email: emailInput.value,
                    phone: phoneInput.value,
                    weddingDate: dateInput.value,
                    message: messageInput.value,
                    turnstileToken,
                }),
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }

            submitBtn.textContent = 'Message Sent! ✓';
            submitBtn.style.backgroundColor = '#6b7e5b';
            this.reset();
        } catch (error) {
            console.error('Failed to send message:', error);
            submitBtn.textContent = 'Send Message';
            alert('Sorry, something went wrong sending your message. Please try again or contact Zoee directly.');
        } finally {
            submitBtn.disabled = false;
            if (window.turnstileContactWidgetId !== null && typeof turnstile !== 'undefined') {
                turnstile.reset(window.turnstileContactWidgetId);
            }
            setTimeout(() => {
                submitBtn.textContent = originalBtnText;
                submitBtn.style.backgroundColor = '';
            }, 3000);
        }
    });
}

// Add scroll animation for service cards
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.service-card, .gallery-item, .feature').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(card);
});

// Mobile menu toggle (if needed for mobile nav)
let lastScrollTop = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    let scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop > lastScrollTop && scrollTop > 100) {
        // Scrolling down
        navbar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    } else {
        // Scrolling up
        navbar.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
});

// Gallery image lazy loading setup (for when real images are added)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                }
                observer.unobserve(img);
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Active navigation link highlighting
window.addEventListener('scroll', () => {
    let current = '';
    const sections = document.querySelectorAll('section');
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        
        if (pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// Add active link styling
const style = document.createElement('style');
style.textContent = `
    .nav-links a.active {
        color: #d4af37;
        font-weight: 700;
    }
`;
document.head.appendChild(style);

// Floral arch at the top of the hero drifts down and fades as you scroll past it
const heroArch = document.querySelector('.hero-arch');

if (heroArch) {
    const heroSection = document.querySelector('.hero');
    let archTicking = false;

    const updateHeroArch = () => {
        const heroHeight = heroSection ? heroSection.offsetHeight : 600;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const progress = Math.min(scrollY / heroHeight, 1);

        heroArch.style.transform = `translateY(${scrollY * 0.4}px)`;
        heroArch.style.opacity = String(0.9 * (1 - progress));
        archTicking = false;
    };

    window.addEventListener('scroll', () => {
        if (!archTicking) {
            requestAnimationFrame(updateHeroArch);
            archTicking = true;
        }
    }, { passive: true });

    updateHeroArch();
}

console.log('Zoee\'s Bridal Hair Styling website loaded successfully!');
