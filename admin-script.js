// Admin panel core: sidebar navigation, dashboard stats, logout, and the
// content editors for Services / Gallery / About / Contact Info.
//
// There's no content backend for these sections yet (unlike Calendar &
// Booking and Messages, which are backed by the shared Cloudflare KV
// namespace via cloudflare-worker.js / functions/api/admin/*) - so these
// save to this browser's localStorage. That means edits here are a draft
// Zoee can review and reuse, but won't change the live site by themselves;
// the matching text in index.html still needs to be updated to publish a
// change. Calendar/Booking and Messages, by contrast, are fully live.

const ADMIN_STORAGE_KEYS = {
    services: 'admin_services',
    gallery: 'admin_gallery',
    about: 'admin_about',
    contact: 'admin_contact',
};

const DEFAULT_SERVICES = [
    { name: 'Bridal Hair Styling', description: 'Custom hairstyles designed to complement your dress, venue, and personal style. Includes trial run.' },
    { name: 'Bridesmaid Styling', description: 'Coordinated looks for your bridesmaids that enhance your wedding aesthetic.' },
    { name: 'Hair Trial', description: 'Test your bridal style before the big day. Perfect for perfecting your vision together.' },
    { name: 'Wedding Day Touch-Ups', description: 'On-location styling and touch-ups to keep your hair flawless throughout your celebration.' },
    { name: 'Special Events', description: 'Elegant styling for engagements, rehearsal dinners, and other special occasions.' },
    { name: 'Consultations', description: 'One-on-one planning sessions to create your ideal bridal look.' },
];

const DEFAULT_ABOUT = {
    title: 'About Zoee',
    paragraph1: 'With years of experience in bridal hair styling, I specialize in creating stunning, personalized hairstyles that make every bride feel confident and beautiful on her wedding day.',
    paragraph2: 'Every bride is unique, and so is every hairstyle I create. I work closely with my clients to understand their vision, preferences, and the overall aesthetic of their wedding.',
    features: [
        { title: 'Professional Experience', description: 'Years of expertise in bridal and event styling' },
        { title: 'Custom Design', description: 'Personalized hairstyles tailored to each bride' },
        { title: 'Quality Focus', description: 'Premium products and meticulous attention to detail' },
    ],
};

const DEFAULT_CONTACT = {
    email: 'zoee@example.com',
    phone: '(555) 123-4567',
    location: 'Your City, State',
    responseMessage: '',
    instagram: '',
    facebook: '',
    pinterest: '',
};

class AdminPanel {
    constructor() {
        this.services = this.load(ADMIN_STORAGE_KEYS.services, DEFAULT_SERVICES);
        this.gallery = this.load(ADMIN_STORAGE_KEYS.gallery, []);
        this.about = this.load(ADMIN_STORAGE_KEYS.about, DEFAULT_ABOUT);
        this.contact = this.load(ADMIN_STORAGE_KEYS.contact, DEFAULT_CONTACT);
        this.editingServiceIndex = null;
        this.messages = [];

        this.initNav();
        this.initClock();
        this.initLogout();
        this.initServices();
        this.initGallery();
        this.initAbout();
        this.initContact();
        this.initMessages();

        this.renderDashboardCounts();
        this.renderLastUpdated();
    }

    // ---------- storage helpers ----------

    load(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    save(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
        localStorage.setItem('admin_last_updated', new Date().toLocaleString());
        this.renderLastUpdated();
    }

    renderLastUpdated() {
        const el = document.getElementById('lastUpdated');
        const saved = localStorage.getItem('admin_last_updated');
        if (el) el.textContent = saved || 'Never';
    }

    escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value ?? '';
        return div.innerHTML;
    }

    showNotification(message, type) {
        if (window.adminCalendarManager) {
            window.adminCalendarManager.showNotification(message, type);
            return;
        }
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 15px 25px;
            border-radius: 6px; color: white; font-weight: 600;
            background-color: ${type === 'success' ? '#10b981' : '#ef4444'};
            box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 10000;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }

    // ---------- navigation ----------

    initNav() {
        const links = document.querySelectorAll('.nav-link');
        links.forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.dataset.section;
                this.showSection(section);
            });
        });

        const initialSection = window.location.hash.replace('#', '') || 'dashboard';
        if (document.getElementById(initialSection)) {
            this.showSection(initialSection);
        }
    }

    showSection(sectionId) {
        document.querySelectorAll('.content-section').forEach((section) => {
            section.classList.toggle('active', section.id === sectionId);
        });
        document.querySelectorAll('.nav-link').forEach((link) => {
            link.classList.toggle('active', link.dataset.section === sectionId);
        });
        window.location.hash = sectionId;
    }

    // ---------- clock ----------

    initClock() {
        const el = document.getElementById('currentTime');
        if (!el) return;
        const update = () => {
            el.textContent = new Date().toLocaleString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
            });
        };
        update();
        setInterval(update, 1000 * 30);
    }

    // ---------- logout ----------

    initLogout() {
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (confirm('Log out of the admin panel?')) {
                window.location.href = '/cdn-cgi/access/logout';
            }
        });
    }

    // ---------- dashboard ----------

    renderDashboardCounts() {
        const totalImagesEl = document.getElementById('totalImages');
        if (totalImagesEl) totalImagesEl.textContent = this.gallery.length;

        const totalServicesEl = document.getElementById('totalServices');
        if (totalServicesEl) totalServicesEl.textContent = this.services.length;
    }

    renderUnreadMessages() {
        const el = document.getElementById('unreadMessages');
        if (el) el.textContent = this.messages.filter((m) => !m.read).length;
    }

    // ---------- services ----------

    initServices() {
        document.getElementById('addServiceBtn')?.addEventListener('click', () => this.openServiceModal(null));
        document.getElementById('serviceForm')?.addEventListener('submit', (e) => this.saveService(e));
        document.querySelector('#serviceModal .close')?.addEventListener('click', () => this.closeServiceModal());
        this.renderServices();
    }

    renderServices() {
        const container = document.getElementById('servicesContainer');
        if (!container) return;

        container.innerHTML = this.services.map((service, index) => `
            <div class="service-card">
                <h3>${this.escapeHtml(service.name)}</h3>
                <p>${this.escapeHtml(service.description)}</p>
                <div class="service-actions">
                    <button type="button" class="btn-secondary" data-edit-service="${index}">Edit</button>
                    <button type="button" class="btn-danger" data-delete-service="${index}">Delete</button>
                </div>
            </div>
        `).join('') || '<p class="empty-state">No services yet. Add your first one above.</p>';

        container.querySelectorAll('[data-edit-service]').forEach((btn) => {
            btn.addEventListener('click', () => this.openServiceModal(Number(btn.dataset.editService)));
        });
        container.querySelectorAll('[data-delete-service]').forEach((btn) => {
            btn.addEventListener('click', () => this.deleteService(Number(btn.dataset.deleteService)));
        });

        this.renderDashboardCounts();
    }

    openServiceModal(index) {
        this.editingServiceIndex = index;
        const modal = document.getElementById('serviceModal');
        const nameInput = document.getElementById('serviceName');
        const descInput = document.getElementById('serviceDesc');

        if (index === null) {
            nameInput.value = '';
            descInput.value = '';
        } else {
            nameInput.value = this.services[index].name;
            descInput.value = this.services[index].description;
        }

        modal.style.display = 'block';
    }

    closeServiceModal() {
        document.getElementById('serviceModal').style.display = 'none';
        this.editingServiceIndex = null;
    }

    saveService(e) {
        e.preventDefault();
        const name = document.getElementById('serviceName').value.trim();
        const description = document.getElementById('serviceDesc').value.trim();

        if (!name || !description) return;

        if (this.editingServiceIndex === null) {
            this.services.push({ name, description });
        } else {
            this.services[this.editingServiceIndex] = { name, description };
        }

        this.save(ADMIN_STORAGE_KEYS.services, this.services);
        this.renderServices();
        this.closeServiceModal();
        this.showNotification('Service saved!', 'success');
    }

    deleteService(index) {
        if (!confirm(`Delete "${this.services[index].name}"?`)) return;
        this.services.splice(index, 1);
        this.save(ADMIN_STORAGE_KEYS.services, this.services);
        this.renderServices();
        this.showNotification('Service deleted.', 'success');
    }

    // ---------- gallery ----------

    initGallery() {
        const uploadForm = document.getElementById('uploadForm');
        document.getElementById('addImageBtn')?.addEventListener('click', () => {
            uploadForm.style.display = uploadForm.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('cancelUploadBtn')?.addEventListener('click', () => {
            uploadForm.style.display = 'none';
            document.getElementById('imageFile').value = '';
            document.getElementById('imageCaption').value = '';
        });
        document.getElementById('uploadImageBtn')?.addEventListener('click', () => this.uploadImage());
        this.renderGallery();
    }

    uploadImage() {
        const fileInput = document.getElementById('imageFile');
        const captionInput = document.getElementById('imageCaption');
        const file = fileInput.files[0];
        const caption = captionInput.value.trim();

        if (!file || !caption) {
            this.showNotification('Please select an image and add a caption.', 'error');
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            this.showNotification('Please choose a JPG, PNG, or WebP image.', 'error');
            return;
        }

        const maxBytes = 5 * 1024 * 1024;
        if (file.size > maxBytes) {
            this.showNotification('Image is too large (max 5MB).', 'error');
            return;
        }

        const progress = document.getElementById('uploadProgress');
        const fill = document.getElementById('progressFill');
        progress.style.display = 'block';
        fill.style.width = '0%';

        const reader = new FileReader();
        reader.onprogress = (e) => {
            if (e.lengthComputable) {
                fill.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
            }
        };
        reader.onload = () => {
            fill.style.width = '100%';
            this.gallery.push({ id: `${Date.now()}`, src: reader.result, caption });
            this.save(ADMIN_STORAGE_KEYS.gallery, this.gallery);
            this.renderGallery();

            fileInput.value = '';
            captionInput.value = '';
            document.getElementById('uploadForm').style.display = 'none';
            setTimeout(() => { progress.style.display = 'none'; }, 400);
            this.showNotification('Image uploaded!', 'success');
        };
        reader.onerror = () => {
            progress.style.display = 'none';
            this.showNotification('Failed to read that image. Please try again.', 'error');
        };
        reader.readAsDataURL(file);
    }

    renderGallery() {
        const container = document.getElementById('galleryContainer');
        if (!container) return;

        container.innerHTML = this.gallery.map((item) => `
            <div class="gallery-item">
                <img class="gallery-image" src="${item.src}" alt="${this.escapeHtml(item.caption)}">
                <div class="gallery-info">
                    <h4>${this.escapeHtml(item.caption)}</h4>
                    <div class="gallery-actions">
                        <button type="button" class="btn-danger" data-delete-image="${item.id}">Delete</button>
                    </div>
                </div>
            </div>
        `).join('') || '<p class="empty-state">No images yet. Upload your first one above.</p>';

        container.querySelectorAll('[data-delete-image]').forEach((btn) => {
            btn.addEventListener('click', () => this.deleteImage(btn.dataset.deleteImage));
        });

        this.renderDashboardCounts();
    }

    deleteImage(id) {
        if (!confirm('Delete this image?')) return;
        this.gallery = this.gallery.filter((item) => item.id !== id);
        this.save(ADMIN_STORAGE_KEYS.gallery, this.gallery);
        this.renderGallery();
        this.showNotification('Image deleted.', 'success');
    }

    // ---------- about ----------

    initAbout() {
        document.getElementById('aboutTitle').value = this.about.title;
        document.getElementById('aboutParagraph1').value = this.about.paragraph1;
        document.getElementById('aboutParagraph2').value = this.about.paragraph2;
        this.renderFeatures();

        document.getElementById('addFeatureBtn')?.addEventListener('click', () => {
            this.about.features.push({ title: '', description: '' });
            this.renderFeatures();
        });
        document.getElementById('saveAboutBtn')?.addEventListener('click', () => this.saveAbout());
    }

    renderFeatures() {
        const container = document.getElementById('featuresContainer');
        if (!container) return;

        container.innerHTML = this.about.features.map((feature, index) => `
            <div class="feature-item">
                <input type="text" placeholder="Feature title" value="${this.escapeHtml(feature.title)}" data-feature-title="${index}">
                <button type="button" data-remove-feature="${index}">Remove</button>
            </div>
        `).join('');

        container.querySelectorAll('[data-feature-title]').forEach((input) => {
            input.addEventListener('input', () => {
                this.about.features[Number(input.dataset.featureTitle)].title = input.value;
            });
        });
        container.querySelectorAll('[data-remove-feature]').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.about.features.splice(Number(btn.dataset.removeFeature), 1);
                this.renderFeatures();
            });
        });
    }

    saveAbout() {
        this.about.title = document.getElementById('aboutTitle').value.trim();
        this.about.paragraph1 = document.getElementById('aboutParagraph1').value.trim();
        this.about.paragraph2 = document.getElementById('aboutParagraph2').value.trim();
        this.save(ADMIN_STORAGE_KEYS.about, this.about);
        this.showNotification('About section saved!', 'success');
    }

    // ---------- contact info ----------

    initContact() {
        document.getElementById('contactEmail').value = this.contact.email;
        document.getElementById('contactPhone').value = this.contact.phone;
        document.getElementById('contactLocation').value = this.contact.location;
        document.getElementById('contactMessage').value = this.contact.responseMessage;
        document.getElementById('instagramLink').value = this.contact.instagram;
        document.getElementById('facebookLink').value = this.contact.facebook;
        document.getElementById('pinterestLink').value = this.contact.pinterest;

        document.getElementById('saveContactBtn')?.addEventListener('click', () => {
            this.contact.email = document.getElementById('contactEmail').value.trim();
            this.contact.phone = document.getElementById('contactPhone').value.trim();
            this.contact.location = document.getElementById('contactLocation').value.trim();
            this.contact.responseMessage = document.getElementById('contactMessage').value.trim();
            this.save(ADMIN_STORAGE_KEYS.contact, this.contact);
            this.showNotification('Contact info saved!', 'success');
        });

        document.getElementById('saveSocialBtn')?.addEventListener('click', () => {
            this.contact.instagram = document.getElementById('instagramLink').value.trim();
            this.contact.facebook = document.getElementById('facebookLink').value.trim();
            this.contact.pinterest = document.getElementById('pinterestLink').value.trim();
            this.save(ADMIN_STORAGE_KEYS.contact, this.contact);
            this.showNotification('Social links saved!', 'success');
        });
    }

    // ---------- messages (real - backed by KV via /api/admin/messages) ----------

    async initMessages() {
        document.getElementById('clearMessagesBtn')?.addEventListener('click', () => this.clearAllMessages());
        await this.loadMessages();
    }

    async loadMessages() {
        try {
            const response = await fetch('/api/admin/messages');
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            const data = await response.json();
            this.messages = data.messages || [];
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
        this.renderMessages();
        this.renderUnreadMessages();
    }

    renderMessages() {
        const container = document.getElementById('messagesContainer');
        if (!container) return;

        if (this.messages.length === 0) {
            container.innerHTML = '<p class="empty-state">No messages yet</p>';
            return;
        }

        container.innerHTML = this.messages.map((message) => `
            <div class="message-card">
                <div class="message-header">
                    <span class="message-name">${this.escapeHtml(message.name)}${message.read ? '' : ' 🔵'}</span>
                    <span class="message-date">${new Date(message.receivedAt).toLocaleString()}</span>
                </div>
                <div class="message-email">${this.escapeHtml(message.email)}${message.phone ? ` • ${this.escapeHtml(message.phone)}` : ''}${message.weddingDate ? ` • Wedding: ${this.escapeHtml(message.weddingDate)}` : ''}</div>
                ${message.message ? `<div class="message-content">${this.escapeHtml(message.message)}</div>` : ''}
                <div class="message-actions">
                    <button type="button" class="btn-secondary" data-reply-message="${message.id}">Reply by Email</button>
                    <button type="button" class="btn-danger" data-delete-message="${message.id}">Delete</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('[data-reply-message]').forEach((btn) => {
            btn.addEventListener('click', () => this.replyToMessage(btn.dataset.replyMessage));
        });
        container.querySelectorAll('[data-delete-message]').forEach((btn) => {
            btn.addEventListener('click', () => this.deleteMessage(btn.dataset.deleteMessage));
        });
    }

    replyToMessage(id) {
        const message = this.messages.find((m) => m.id === id);
        if (!message) return;

        if (!message.read) {
            fetch(`/api/admin/messages?id=${encodeURIComponent(id)}`, { method: 'PATCH' }).catch(() => {});
            message.read = true;
            this.renderUnreadMessages();
        }

        window.location.href = `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent('Re: Your message to Zoee - Bridal Hair Styling')}`;
    }

    async deleteMessage(id) {
        if (!confirm('Delete this message?')) return;
        try {
            const response = await fetch(`/api/admin/messages?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(`Server returned ${response.status}`);
            this.messages = this.messages.filter((m) => m.id !== id);
            this.renderMessages();
            this.renderUnreadMessages();
            this.showNotification('Message deleted.', 'success');
        } catch (error) {
            console.error('Failed to delete message:', error);
            this.showNotification('Failed to delete message. Please try again.', 'error');
        }
    }

    async clearAllMessages() {
        if (this.messages.length === 0) return;
        if (!confirm('Delete all messages? This cannot be undone.')) return;

        try {
            await Promise.all(
                this.messages.map((m) => fetch(`/api/admin/messages?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' }))
            );
            this.messages = [];
            this.renderMessages();
            this.renderUnreadMessages();
            this.showNotification('All messages cleared.', 'success');
        } catch (error) {
            console.error('Failed to clear messages:', error);
            this.showNotification('Failed to clear all messages. Please try again.', 'error');
        }
    }
}

function closeServiceModal() {
    window.adminPanel?.closeServiceModal();
}
window.closeServiceModal = closeServiceModal;

document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});
