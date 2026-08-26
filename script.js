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

// Contact form handling
const contactForm = document.getElementById('contactForm');

if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Get form values
        const formData = new FormData(this);
        const data = Object.fromEntries(formData);
        
        // Show success message
        const formInputs = this.querySelectorAll('input, textarea');
        const submitBtn = this.querySelector('.submit-btn');
        const originalBtnText = submitBtn.textContent;
        
        // Simple validation
        const nameInput = this.querySelector('input[type="text"]');
        const emailInput = this.querySelector('input[type="email"]');
        const dateInput = this.querySelector('input[type="date"]');
        
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
        
        // Clear form and show success message
        submitBtn.textContent = 'Message Sent! ✓';
        submitBtn.style.backgroundColor = '#6b7e5b';
        
        formInputs.forEach(input => input.value = '');
        
        setTimeout(() => {
            submitBtn.textContent = originalBtnText;
            submitBtn.style.backgroundColor = '';
        }, 3000);
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

// Floral lattice at the top of the hero drifts down and fades as you scroll past it
const floralLattice = document.querySelector('.floral-lattice-top');

if (floralLattice) {
    const heroSection = document.querySelector('.hero');
    let latticeTicking = false;

    const updateFloralLattice = () => {
        const heroHeight = heroSection ? heroSection.offsetHeight : 600;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        const progress = Math.min(scrollY / heroHeight, 1);

        floralLattice.style.transform = `translateY(${scrollY * 0.4}px)`;
        floralLattice.style.opacity = String(0.85 * (1 - progress));
        latticeTicking = false;
    };

    window.addEventListener('scroll', () => {
        if (!latticeTicking) {
            requestAnimationFrame(updateFloralLattice);
            latticeTicking = true;
        }
    }, { passive: true });

    updateFloralLattice();
}

console.log('Zoee\'s Bridal Hair Styling website loaded successfully!');
